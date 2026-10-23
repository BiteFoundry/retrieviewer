import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPaperActor} from './puppy-paper.mjs';
import {createPaperBody,PAPER_GAITS} from './puppy-paper-world.mjs';
import {createCompanionLife} from './puppy-companion-life.mjs';
import {createComfortSpriteSampler,comfortMotionKey} from './puppy-comfort-sprites.mjs';
const info=JSON.parse(readFileSync(new URL('./puppy-stride-meta.json',import.meta.url)));
const scramble={duration:.72,entryPhase:info.run_timing[5]/20,brakeSeconds:.32,recovery:{start:.39,end:.54,distance:.06,height:.025}};
const fetchMotions={scramble,pickups:{front:{duration:.52},rear:{duration:.52}}};
const make=(x=0,z=0)=>{const body=createPaperBody();Object.assign(body.position,{x,z});const actor=createPaperActor(body,info,{manualTricks:true,walkTransitions:true,scrambleSeconds:.72,fetchMotions});let clock=0;return{actor,step(){clock+=1/60;actor.update(1/60);return actor.sample(clock);}};};

test('moving stumble hands off at a run contact, preserves velocity and decelerates at the same depth',()=>{
 for(const sign of [-1,1])for(const distance of [.2,.5,1,3]){
  const p=make(0,-1.25);p.actor.chase(sign*distance,-1.25,{scramble:true});
  let before=null,first=null,last=null,samples=0,finished=false,hopped=false;
  for(let n=0;n<1800;n++){
   const s=p.step();assert.equal(s.z,-1.25);
   if(before)assert.ok(Math.hypot(s.x-before.x,s.z-before.z)<=PAPER_GAITS.front.speed/60+1e-8,'no root teleport at handoff');
   if(s.state==='scramble'){
    if(!first){first=s;assert.equal(before.state,'run');assert.ok(before.speed>0&&s.speed>0,'never stop/settle before the impact');assert.ok(Math.abs(s.speed-before.speed)<.4,'no zero-speed relaunch');}
    if(last){if(s.motionStage==='braking')assert.ok(s.speed<=last.speed+1e-8);assert.ok(sign*(s.x-last.x)>=-1e-9);assert.ok(Math.abs((s.travelDistance-last.travelDistance)-Math.abs(s.x-last.x))<1e-8,'reported travel stays consistent with the root');}
    if(s.motionStage==='recovery'){hopped=true;assert.ok(s.bodyLift>0&&s.bodyLift<=.025);}
    last=s;samples++;assert.equal(s.comfortPose.clip,'scramble');
   }
   if(first&&p.actor.state==='idle'){finished=true;assert.equal(s.speed,0);break;}
   before=s;
  }
  assert.ok(finished&&samples>=40&&hopped);assert.ok(sign*(last.x-first.x)>0,'momentum continues during impact');assert.ok(last.speed<1e-8);assert.ok(last.bodyLift<1e-8);
 }
});

test('directional pickups stay standing at the same root/view, then drain a return command',()=>{
 for(const target of [[0,-3],[.5,0]]){
  const p=make();p.actor.chase(...target);
  for(let n=0;n<1800&&p.actor.state!=='idle';n++)p.step();
  const start=p.step();assert.equal(p.actor.pickup(),true);p.actor.chase(0,.2);
  let count=0,returned=false;
  for(let n=0;n<1800;n++){
   const s=p.step();
   if(s.state==='pickup'){count++;assert.equal(s.x,start.x);assert.equal(s.z,start.z);assert.equal(s.view,start.view);assert.equal(s.seatProgress,null);assert.equal(s.comfortPose.clip,'pickup');}
   if(count&&p.actor.state==='idle'&&Math.abs(s.z-.2)<.002){returned=true;break;}
  }
  assert.ok(count>=30&&returned);
 }
});

test('real life controller uses rear pickup before turning to return, without a seated pickup gesture',()=>{
 const p=make(),life=createCompanionLife(p.actor,{seed:731});assert.equal(life.interact('ball'),true);
 let rearPickup=0,carried=false,done=false;
 for(let n=0;n<1800;n++){
  const s=p.step();life.update(1/60);const r=life.report;
  if(s.state==='pickup'){rearPickup++;assert.equal(s.view,'rear');assert.equal(r.gesture,null);assert.equal(r.ball,null,'occluded rear muzzle must not paint through the torso');assert.ok(s.z> -4&&s.z< -3.5);}
  if(r.ball?.carried)carried=true;
  if(!r.busy){done=true;break;}
 }
 assert.ok(rearPickup>=30&&carried&&done);
});

test('new pose sampling uses the borrowed scratch and rejects malformed motion/floor/mouth metadata',()=>{
 const n=320*320,raw=new Uint8Array(n*37);for(let i=0;i<37;i++)raw.fill(i,i*n,(i+1)*n);
 const motion=(frames)=>({frames,times:[0,.25,.5],duration:.5,floorOffsets:[0,0,0]});
 const meta={version:4,width:320,height:320,frames:37,scramble:motion([13,14,15]),pickups:{rear:motion([25,26,25]),front:motion([31,32,31])},sleep:{side:9}};
 const output=new Uint8ClampedArray(n*4),sample=createComfortSpriteSampler(raw,meta,output);
 for(const progress of [0,.1,.5,1]){assert.equal(sample({clip:'scramble',progress}),output);assert.equal(output[0],meta.scramble.frames[comfortMotionKey(progress,meta.scramble)]);}
 assert.equal(sample({clip:'pickup',view:'rear',progress:.5})[0],26);assert.equal(sample({clip:'sleep',variant:'side'})[0],9);
 for(const broken of [{...meta,scramble:{...meta.scramble,times:[0,.4,.2]}},{...meta,scramble:{...meta.scramble,floorOffsets:[0,100,0]}},{...meta,pickups:{rear:meta.pickups.rear,front:{...meta.pickups.front,mouth:[[0,0],[Infinity,0],[0,0]]}}}])assert.throws(()=>createComfortSpriteSampler(raw,broken));
 assert.throws(()=>sample({clip:'pickup',view:'other',progress:0}));
 assert.throws(()=>createPaperActor(createPaperBody(),info,{scrambleSeconds:.72,fetchMotions:{...fetchMotions,scramble:{...scramble,entryPhase:NaN}}}));
});
