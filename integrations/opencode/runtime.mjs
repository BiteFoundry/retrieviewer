// Host-neutral controller behind the OpenCode TUI widget. One pet core is shared by
// every mounted slot view; the most recently attached view receives frames. Import
// and creation start no timer and load no art or settings: the first attach() starts
// a <=1 Hz settings poll, and only an enabled, visible view loads the pet. It never
// touches stdin/stdout, the alternate screen, processes, windows or the network.

export const AGENT='opencode';
export const DEFAULT_FPS=30;
export const POLL_MS=1000;
export const HEARTBEAT_MS=5000;
// Bounded so the host prompt stays usable: at most 64x12 cells, hidden when the
// terminal is too small for a legible pet.
export const LIMITS=Object.freeze({maxColumns:64,maxRows:12,minColumns:20,minRows:5,sideMargin:4,reservedRows:14});
export const COMMANDS=Object.freeze(['enable','disable','ball','treat','tug','status']);

const fn=(value,name)=>{if(typeof value!=='function')throw TypeError(`${name} must be a function`);};
const defaultScheduler=()=>({now:()=>performance.now(),schedule:(callback,delayMs)=>setTimeout(callback,delayMs),cancel:handle=>clearTimeout(handle)});
const defaultLoadPlugin=async()=>(await import('../../retrieviewer-plugin.mjs')).createPetPlugin;
const defaultLoadSettings=()=>import('../../retrieviewer-config.mjs');

// Terminal viewport (cells) -> pet pane, or null when hidden/too small.
export function petViewport(viewport){
 if(!viewport||typeof viewport!=='object')return null;
 const {width,height}=viewport;
 if(!Number.isFinite(width)||!Number.isFinite(height))return null;
 const columns=Math.min(LIMITS.maxColumns,Math.floor(width)-LIMITS.sideMargin);
 const rows=Math.min(LIMITS.maxRows,Math.floor((Math.floor(height)-LIMITS.reservedRows)/2));
 return columns<LIMITS.minColumns||rows<LIMITS.minRows?null:{columns,rows};
}

export function createOpenCodePetController({hostVersion='unknown',scheduler,fps=DEFAULT_FPS,petOptions,loadPlugin=defaultLoadPlugin,loadSettings=defaultLoadSettings,onError}={}){
 if(scheduler!==undefined){fn(scheduler?.now,'scheduler.now');fn(scheduler.schedule,'scheduler.schedule');fn(scheduler.cancel,'scheduler.cancel');}
 fn(loadPlugin,'loadPlugin');fn(loadSettings,'loadSettings');
 if(onError!==undefined)fn(onError,'onError');
 const clock=scheduler??defaultScheduler();
 const views=new Set();
 let active=null,shown=null,enabled=false,disposed=false;
 let plugin=null,loading=false,gen=0;
 let settings=null,pollHandle=null,polling=false,epoch=0,hiddenCheck=null,pollError=null;
 let receipt=null,writes=Promise.resolve();
 const report=error=>{try{onError?.(error);}catch{}};
 const settingsModule=()=>settings??=Promise.resolve().then(loadSettings);

 // Receipts carry our own state only, serialized so phases never reorder.
 function writeReceipt(phase){
  if(!receipt)return;
  const body={hostVersion:String(hostVersion),phase,firstFrameAt:receipt.firstFrameAt,columns:receipt.columns,rows:receipt.rows,frames:receipt.frames};
  writes=writes.then(async()=>{const m=await settingsModule();await m.writeRuntimeReceipt(AGENT,body);}).catch(report);
 }
 function show(view,text){if(!view)return;view.render(text);shown=text?view:(shown===view?null:shown);}
 function clearShown(){if(shown){const v=shown;shown=null;v.render('');}}

 const host={
  getSize(){
   const box=active?petViewport(active.getViewport()):null;
   if(!box&&!hiddenCheck)hiddenCheck=clock.schedule(()=>{hiddenCheck=null;reconcile();},0);
   return box;
  },
  render(frame){
   if(!active)return;
   if(shown&&shown!==active)clearShown();
   show(active,frame.text);
   const now=clock.now();
   if(!receipt){receipt={firstFrameAt:new Date().toISOString(),frames:1,beat:now,columns:frame.columns,rows:frame.rows};writeReceipt('rendering');return;}
   receipt.frames++;receipt.columns=frame.columns;receipt.rows=frame.rows;
   if(now-receipt.beat>=HEARTBEAT_MS){receipt.beat=now;writeReceipt('rendering');}
  },
  clear:clearShown,
  onError(error){stopPet();report(error);},
 };

 function stopPet(){
  gen++;loading=false;
  if(hiddenCheck){clock.cancel(hiddenCheck);hiddenCheck=null;}
  const p=plugin;plugin=null;
  try{p?.dispose();}catch(error){report(error);}
  clearShown();
  if(receipt){writeReceipt('stopped');receipt=null;}
 }
 const wanted=()=>!disposed&&enabled&&views.size>0;

 async function load(){
  const mine=++gen;loading=true;
  try{
   const create=await loadPlugin();
   if(mine!==gen||!wanted())return;
   const p=await create({host,fps,petOptions,scheduler:clock});
   // Disabled, unmounted or reloaded while the art loaded: release it unseen.
   if(mine!==gen||!wanted()){p.dispose();return;}
   plugin=p;
  }catch(error){if(mine===gen)report(error);return;}
  finally{if(mine===gen)loading=false;}
  reconcile();
 }

 function reconcile(redraw=false){
  if(!wanted()){if(plugin||loading||receipt)stopPet();return;}
  if(!plugin){if(!loading)load();return;}
  const box=active?petViewport(active.getViewport()):null;
  // Hidden: no timer and no simulated time until a refresh reveals the pane.
  if(!box){plugin.pause();clearShown();return;}
  try{if(!plugin.running)plugin.start();else if(redraw)plugin.render();}
  catch(error){stopPet();report(error);}
 }

 function schedulePoll(){
  if(disposed||views.size===0||pollHandle!==null)return;
  pollHandle=clock.schedule(()=>{pollHandle=null;poll();},POLL_MS);
 }
 async function poll(){
  if(disposed||views.size===0||polling)return;
  polling=true;const seen=epoch;
  try{
   const m=await settingsModule();
   const s=await m.readAgentSettings(AGENT);
   pollError=null;
   if(seen===epoch&&!disposed){enabled=s?.enabled===true;reconcile();}
  }catch(error){
   // A persistent failure (e.g. missing settings module) is reported once, not per poll.
   const key=String(error?.message??error);
   if(key!==pollError){pollError=key;report(error);}
  }
  finally{polling=false;schedulePoll();}
 }
 function stopPolling(){if(pollHandle!==null){clock.cancel(pollHandle);pollHandle=null;}}

 async function setEnabled(value){
  if(typeof value!=='boolean')throw TypeError('enabled must be boolean');
  const m=await settingsModule();
  await m.setAgentEnabled(AGENT,value);
  epoch++;
  if(disposed)return;
  enabled=value;reconcile();
 }
 function interact(kind){
  if(!['ball','treat','tug'].includes(kind))throw TypeError("kind must be 'ball', 'treat' or 'tug'");
  return plugin?plugin.interact(kind):false;
 }
 function status(){
  return {enabled,mounted:views.size,loading,running:!!plugin?.running,frames:receipt?.frames??0,columns:receipt?.columns??null,rows:receipt?.rows??null,firstFrameAt:receipt?.firstFrameAt??null};
 }

 return {
  // view: {getViewport(): {width,height}|null, render(text: string): void}. Text is
  // plain Braille (rows lines); '' means show nothing.
  attach(view){
   if(disposed)throw Error('OpenCode pet controller is disposed');
   if(!view||typeof view!=='object')throw TypeError('view must be an object');
   fn(view.getViewport,'view.getViewport');fn(view.render,'view.render');
   const record={getViewport:view.getViewport,render:view.render};
   views.add(record);active=record;
   if(views.size===1)poll();
   reconcile(true);
   let attached=true;
   return {
    // Call on resize or visibility change; re-derives the pane from the viewport.
    refresh(){if(attached&&!disposed)reconcile(true);},
    detach(){
     if(!attached)return;attached=false;
     views.delete(record);
     if(shown===record)clearShown();
     if(active===record)active=[...views].at(-1)??null;
     if(views.size===0)stopPolling();
     if(!disposed)reconcile(true);
    },
   };
  },
  setEnabled,
  interact,
  status,
  // Slash handler: '/retrieviewer <enable|disable|ball|treat|tug|status>'.
  async command(argument){
   const word=String(argument??'').trim().toLowerCase()||'status';
   if(word==='enable'||word==='disable'){await setEnabled(word==='enable');return word==='enable'?'Retrieviewer enabled':'Retrieviewer disabled';}
   if(word==='ball'||word==='treat'||word==='tug'){
    if(!plugin)return enabled?'Retrieviewer is still loading':'Retrieviewer is disabled; run /retrieviewer enable';
    return interact(word)?`Retrieviewer: ${word} accepted`:`Retrieviewer is busy; ${word} not accepted`;
   }
   if(word==='status'){
    const s=status();
    return `Retrieviewer ${s.enabled?'enabled':'disabled'}, ${s.running?`rendering ${s.columns}x${s.rows}, ${s.frames} frames`:s.loading?'loading':'idle'}, ${s.mounted} view(s)`;
   }
   return `Usage: /retrieviewer ${COMMANDS.join('|')}`;
  },
  // Resolves once queued receipt writes have finished (for clean shutdown/tests).
  settled(){return writes;},
  get disposed(){return disposed;},
  dispose(){
   if(disposed)return writes;
   disposed=true;stopPolling();stopPet();
   views.clear();active=null;
   return writes;
  },
 };
}
