import {createPet} from './retrieviewer.mjs';

// Portable pet plugin: the host supplies size and output, the plugin owns only its
// own clock. Importing or creating it starts no timer, renders nothing and touches
// no DOM, stdin/stdout, signals or global listeners; start() or tick() does the work.
const fn=(value,name)=>{if(typeof value!=='function')throw TypeError(`${name} must be a function`);};
const defaultScheduler=()=>({now:()=>performance.now(),schedule:(callback,delayMs)=>setTimeout(callback,delayMs),cancel:handle=>clearTimeout(handle)});

export async function createPetPlugin({host,petOptions,fps=30,scheduler}={}){
 if(!host||typeof host!=='object')throw TypeError('host must be an object');
 fn(host.getSize,'host.getSize');fn(host.render,'host.render');
 if(host.clear!==undefined)fn(host.clear,'host.clear');
 if(host.onError!==undefined)fn(host.onError,'host.onError');
 if(typeof fps!=='number'||!Number.isFinite(fps)||fps<=0||fps>120||1000/fps>2147483647)throw RangeError('fps must be within [1000/2147483647, 120] (bounded timer delay)');
 if(scheduler!==undefined){
  if(!scheduler||typeof scheduler!=='object')throw TypeError('scheduler must be an object');
  fn(scheduler.now,'scheduler.now');fn(scheduler.schedule,'scheduler.schedule');fn(scheduler.cancel,'scheduler.cancel');
 }
 const clock=scheduler??defaultScheduler(),delay=1000/fps;
 let pet=await createPet(petOptions);
 // One pending callback at most; `token` makes a late or uncancelled callback inert.
 let running=false,disposed=false,busy=false,armed=false,handle=null,token=0,baseline=null;
 const alive=()=>{if(disposed)throw Error('Pet plugin is disposed');};
 const idle=()=>{if(busy)throw Error('Pet plugin cannot render or tick from inside host.render');};
 const cancel=()=>{if(!armed)return;const h=handle;armed=false;handle=null;token++;clock.cancel(h);};
 const halt=()=>{running=false;baseline=null;cancel();};

 // Fresh size every frame, so resizes need no listener. Null or zero-size panes are
 // hidden: no render and no simulated time. Other invalid sizes throw from frame().
 function draw(dt){
  busy=true;
  try{
   const size=host.getSize();
   if(size===null||size===undefined)return false;
   if(typeof size!=='object')throw TypeError('host.getSize() must return FrameOptions or null');
   const {columns,rows}=size;
   if((columns===0&&Number.isInteger(rows)&&rows>=0)||(rows===0&&Number.isInteger(columns)&&columns>=0))return false;
   if(dt>0)pet.step(dt);
   host.render(pet.frame(size));
   return true;
  }finally{busy=false;}
 }
 // Scheduled frames advance by real elapsed time since the last visible frame. A
 // resume or a reveal after hiding starts a new baseline, so nothing is caught up.
 function frameAt(now){
  const dt=baseline===null?0:Math.max(0,(now-baseline)/1000);
  const shown=draw(dt);
  if(running)baseline=shown?now:null;
 }
 function arm(){
  if(!running||disposed||armed)return;
  const mine=++token;armed=true;
  handle=clock.schedule(()=>{if(mine!==token)return;armed=false;handle=null;token++;run();},delay);
 }
 // Asynchronous failures have no caller to throw to: the plugin pauses (it is not
 // disposed) and hands the error to host.onError, or stays paused silently without
 // one. If onError itself throws, that error escapes this callback and the plugin
 // stays paused; it is never rescheduled.
 function run(){
  if(!running||disposed)return;
  try{frameAt(clock.now());arm();}
  catch(error){halt();if(!disposed&&host.onError)host.onError(error);}
 }

 return {
  // Idempotent. Renders the first frame immediately (no time advance), then once
  // per 1/fps s. Errors from that first frame stop the plugin and propagate.
  start(){
   alive();idle();if(running)return;
   running=true;baseline=null;
   try{frameAt(clock.now());arm();}catch(error){halt();throw error;}
  },
  // Cancels the pending callback; time while paused is never simulated.
  pause(){if(!disposed)halt();},
  // Draws the current state without advancing time. False while hidden.
  render(){alive();idle();try{return draw(0);}catch(error){halt();throw error;}},
  // Host-owned loop: advance by explicit seconds, then render. False while hidden
  // (time does not advance). Use instead of start(), not alongside it.
  tick(dtSeconds){
   alive();idle();
   if(running)throw Error('tick() is for host-owned loops; pause() the scheduled loop first');
   if(typeof dtSeconds!=='number'||!Number.isFinite(dtSeconds)||dtSeconds<0)throw RangeError('dtSeconds must be finite non-negative seconds');
   try{return draw(dtSeconds);}catch(error){halt();throw error;}
  },
  // 'ball' | 'treat' | 'tug'. False when busy or cooling down; shows on the next frame.
  interact(kind){alive();return pet.interact(kind);},
  get running(){return running;},
  get disposed(){return disposed;},
  // Idempotent: stops the clock, disposes the pet and calls host.clear once, even
  // if pet disposal throws. A throwing clear() propagates once; disposal still holds.
  dispose(){
   if(disposed)return;disposed=true;halt();
   const core=pet;pet=null;
   try{core.dispose();}finally{host.clear?.();}
  },
 };
}
