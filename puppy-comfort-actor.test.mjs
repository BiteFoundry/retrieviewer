import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPaperActor,createPaperComfortTimings,PAPER_COMFORT_TIMINGS} from './puppy-paper.mjs';
import {createPaperBody} from './puppy-paper-world.mjs';
import {createSnappyTrickTimings} from './puppy-paper-trick-timing.mjs';
import {paperActionPose} from './puppy-paper-actions.mjs';
const info=JSON.parse(readFileSync(new URL('./puppy-stride-meta.json',import.meta.url)));
const actions=JSON.parse(readFileSync(new URL('./puppy-paper-actions-v9.json',import.meta.url)));
const DT=1/60;
function make(options={}){
 const body=createPaperBody(),actor=createPaperActor(body,info,{manualTricks:true,walkTransitions:true,trickTimings:createSnappyTrickTimings(actions),...options});let clock=0;
 const step=()=>{clock+=DT;actor.update(DT);const s=actor.sample(clock);for(const [k,v] of Object.entries(s))if(typeof v==='number')assert.ok(Number.isFinite(v),k);return s;};
 const until=(pred,max=6000)=>{for(let i=0;i<max;i++){const s=step();if(pred(s))return {s,frames:i+1};}throw Error('condition not reached');};
 const seated=s=>actor.state==='idle'&&s.seatProgress===1&&s.view==='approach'&&!s.queued;
 return {actor,body,step,until,seated};
}
const seatedPuppy=()=>{const p=make();p.actor.sit();p.until(p.seated);return p;};

test('comfort timing default is the real roll-down roll7 edge boundary',()=>{
 assert.deepEqual(createPaperComfortTimings(actions),PAPER_COMFORT_TIMINGS);
 const pose=paperActionPose('roll-down',PAPER_COMFORT_TIMINGS.belly.hold,actions);
 assert.equal(actions.keyOrder[actions.edges[pose.pair][pose.blend===1?1:0]],'roll7');
 assert.throws(()=>createPaperComfortTimings(actions,{key:'nope'}));
 assert.throws(()=>make({comfortTimings:{belly:{hold:1,enter:1,exit:1},tugExit:.3}}));
});

test('comfort durations are validated before any state change',()=>{
 const {actor}=seatedPuppy();
 for(const name of ['belly','sleep','tug'])for(const bad of [0,-1,NaN,Infinity,'6',null,1e6])assert.throws(()=>actor[name](bad),new RegExp(`Invalid ${name} duration`));
 assert.equal(actor.state,'idle');
});

test('belly: lie-down, roll to exact held belly-up source, finish roll at the same seat',()=>{
 const p=seatedPuppy(),{actor}=p,start=actor.sample(0);
 assert.equal(actor.belly(2),true);
 const names=new Set(),held=[];let last=-1,x=start.x,z=start.z;
 const {s:end}=p.until(s=>{
  if(s.actionName)names.add(s.actionName);
  assert.equal(s.x,x);assert.equal(s.z,z);assert.equal(s.speed,0);
  if(s.state==='belly'){assert.equal(s.actionName,'roll-down');assert.ok(s.actionProgress>=last);last=s.actionProgress;if(s.actionProgress===PAPER_COMFORT_TIMINGS.belly.hold)held.push(s);}
  return p.seated(s);
 });
 assert.deepEqual([...names],['lie-down','roll-down']);
 assert.equal(last,1);
 assert.ok(held.length>=110&&held.length<=125,`held ${held.length}`);
 const poses=new Set(held.map(s=>JSON.stringify(paperActionPose(s.actionName,s.actionProgress,actions))));
 assert.equal(poses.size,1,'belly hold shows one exact source sample');
 assert.equal(end.flip,false);assert.equal(end.seatVariant,'default');assert.equal(end.x,start.x);assert.equal(end.z,start.z);
 assert.equal(end.comfortPose,undefined);
});

test('belly progress is smooth: no jump entering or leaving the hold',()=>{
 const p=seatedPuppy();p.actor.belly(1);let prev=null,maxStep=0;
 p.until(s=>{if(s.state==='belly'){if(prev!==null)maxStep=Math.max(maxStep,s.actionProgress-prev);prev=s.actionProgress;}return p.seated(s);});
 assert.ok(maxStep<.03,`max per-frame progress step ${maxStep}`);
});

test('belly from the manual down pose rolls without standing up first',()=>{
 const p=seatedPuppy();p.actor.lie();p.until(()=>p.actor.state==='down');
 p.actor.belly(1);const s=p.step();assert.equal(s.state,'belly');assert.equal(s.actionName,'roll-down');
 const names=new Set();p.until(s=>{if(s.actionName)names.add(s.actionName);return p.seated(s);});
 assert.ok(!names.has('lie-up'));
});

test('chase during belly hold cuts the hold, finishes the roll, then runs',()=>{
 const p=seatedPuppy();p.actor.belly(25);
 p.until(s=>s.actionProgress===PAPER_COMFORT_TIMINGS.belly.hold&&s.state==='belly');
 for(let i=0;i<30;i++)p.step();
 assert.equal(p.actor.chase(0,-3),true);assert.equal(p.actor.sample(0).queued,true);
 const {frames,s}=p.until(s=>s.state==='run'&&!s.queued);
 assert.ok(frames<4*60,`recovered in ${frames} frames`);assert.equal(s.comfortPose,undefined);
 p.until(s=>p.actor.state==='idle'&&!s.queued);
 assert.ok(Math.abs(p.actor.sample(0).z-(-3))<.13);
});

test('sleep: shared rest clip to eyes-closed endpoint, holds, wakes back to seat',()=>{
 const p=seatedPuppy(),start=p.actor.sample(0);p.actor.sleep(3);
 let sleepFrames=0,maxRest=0;
 const {s:end}=p.until(s=>{
  assert.equal(s.x,start.x);assert.equal(s.z,start.z);assert.equal(s.speed,0);
  if(s.behavior==='rest')maxRest=Math.max(maxRest,s.behaviorProgress);
  if(s.state==='sleep'){sleepFrames++;assert.equal(s.behavior,'rest');assert.equal(s.behaviorProgress,1);assert.deepEqual(s.comfortPose,{clip:'sleep',variant:'side',right:false,blend:1});}
  return p.seated(s);
 });
 assert.equal(maxRest,1);assert.ok(Math.abs(sleepFrames-180)<=2,`slept ${sleepFrames}`);
 assert.equal(end.x,start.x);assert.equal(end.z,start.z);assert.equal(end.behavior,null);
});

test('chase or sit wakes a 25s sleep promptly with no lingering sleep',()=>{
 for(const cmd of [a=>a.chase(.4,-2),a=>a.sit()]){
  const p=seatedPuppy();p.actor.sleep(25);p.until(()=>p.actor.state==='sleep');
  for(let i=0;i<60;i++)p.step();
  cmd(p.actor);
  const {frames}=p.until(s=>cmd.toString().includes('sit')?p.seated(s):s.state==='run');
  assert.ok(frames<3*60,`woke in ${frames} frames`);
  for(let i=0;i<30*60;i++){p.step();assert.notEqual(p.actor.state,'sleep');}
 }
});

test('tug: fixed seated root, comfortPose only while tugging, exact seat after',()=>{
 const p=make(),{actor}=p;actor.go(.2,-1);p.until(s=>actor.state==='idle');
 actor.tug(2);const progress=[];let start=null;
 const {s:end}=p.until(s=>{
  if(s.state==='tug'){start??=s;assert.equal(s.x,start.x);assert.equal(s.z,start.z);assert.equal(s.speed,0);assert.equal(s.flip,false);assert.equal(s.view,'approach');assert.equal(s.seatProgress,1);assert.equal(s.comfortPose.clip,'tug');progress.push(s.comfortPose.progress);}
  else assert.equal(s.comfortPose,undefined);
  return start&&p.seated(s);
 });
 assert.ok(progress.length>=118&&progress.length<=121);
 for(let i=1;i<progress.length;i++)assert.ok(progress[i]>=progress[i-1]&&progress[i]<=1);
 assert.equal(end.x,start.x);assert.equal(end.z,start.z);assert.equal(end.seatVariant,'default');
});

test('commands during tug queue a short recovery, then drain cleanly',()=>{
 const p=seatedPuppy();p.actor.tug(20);p.until(s=>s.state==='tug');for(let i=0;i<60;i++)p.step();
 assert.equal(p.actor.go(0,-2),true);assert.equal(p.actor.sample(0).queued,true);
 const {frames}=p.until(s=>s.state!=='tug');assert.ok(frames<=.35*60+2,`tug recovered in ${frames}`);
 p.until(s=>s.state==='run'&&!s.queued);
 const p2=seatedPuppy();p2.actor.tug(20);p2.until(s=>s.state==='tug');p2.actor.belly(1);
 p2.until(s=>s.state==='belly');p2.until(p2.seated);assert.equal(p2.actor.sample(0).queued,false);
});

test('default durations complete and existing commands still work afterwards',()=>{
 const p=seatedPuppy();
 for(const name of ['belly','tug','sleep']){p.actor[name]();p.until(s=>s.state===name);p.until(p.seated,60*60);}
 p.actor.roll();p.until(s=>s.actionName==='roll');p.until(p.seated);
 p.actor.spin();p.until(s=>s.actionName==='spin');p.until(s=>p.actor.state==='idle'&&!s.queued);
});
