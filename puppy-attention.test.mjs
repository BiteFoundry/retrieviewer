import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPaperActor,createPaperComfortTimings} from './puppy-paper.mjs';
import {createPaperBody,PAPER_DYNAMICS} from './puppy-paper-world.mjs';
import {createCompanionLife} from './puppy-companion-life.mjs';
import {createSnappyTrickTimings} from './puppy-paper-trick-timing.mjs';
const json=n=>JSON.parse(readFileSync(new URL(n,import.meta.url)));
const info=json('./puppy-stride-meta.json'),actions=json('./puppy-paper-actions-v9.json'),comfort=json('./puppy-companion-comfort.json'),DT=1/60;
function make(z=0){
 const body=createPaperBody();body.follow({x:0,y:0,z});body.update(0);
 const actor=createPaperActor(body,info,{manualTricks:true,walkTransitions:true,trickTimings:createSnappyTrickTimings(actions),comfortTimings:createPaperComfortTimings(actions),scrambleSeconds:comfort.scramble.duration,fetchMotions:comfort});
 let clock=0;const step=()=>{clock+=DT;actor.update(DT);return actor.sample(clock);};
 return {actor,step,sample:()=>actor.sample(clock)};
}

test('attention brakes from actual speed without teleporting, reversing or resetting gait phase',()=>{
 for(const walking of [false,true])for(const elapsed of [.4,1,2]){
  const p=make(walking?-30:0);if(walking)p.actor.walk('right',10);else p.actor.go(0,-15);
  for(let i=0;p.actor.state!=='run'&&i<600;i++)p.step();
  for(let i=0;i<elapsed*60;i++)p.step();
  const before=p.sample(),a=walking?PAPER_DYNAMICS.walkDeceleration:PAPER_DYNAMICS.deceleration;
  assert.ok(before.speed>0);assert.equal(p.actor.attend(),true);
  assert.deepEqual(p.sample(),before,'acceptance does not move, zero speed or change the current picture');
  let previous=before,stopped=null;
  for(let i=1;i<600;i++){
   const s=p.step(),ds=Math.hypot(s.x-previous.x,s.z-previous.z);
   if(previous.speed>0){
    assert.ok(s.speed<=previous.speed+1e-8);
    assert.ok(Math.abs(ds-(previous.speed+s.speed)/2*DT)<.001);
    assert.ok(Math.abs(s.phase-previous.phase-ds/previous.stride)<1e-8);
    assert.ok(walking?s.x>=previous.x:s.z<=previous.z);
   }
   if(stopped===null&&s.speed===0)stopped=s;
   previous=s;if(p.actor.state==='idle'&&s.seatProgress===1)break;
  }
  assert.ok(stopped);assert.ok(Math.abs(Math.hypot(stopped.x-before.x,stopped.z-before.z)-before.speed**2/(2*a))<1e-8);
  assert.equal(p.actor.state,'idle');assert.equal(previous.view,'approach');assert.equal(previous.seatProgress,1);
  const root=[previous.x,previous.z];for(let i=0;i<180;i++)p.step();
  assert.deepEqual([p.sample().x,p.sample().z],root,'obsolete destination does not resume');
 }
});

test('a distant run reacts to treat/tug now, then recovers within two seconds at running speed',()=>{
 for(const kind of ['treat','tug'])for(const elapsed of [DT,.4,1,2]){
  const p=make();p.actor.go(0,-15);while(p.actor.state!=='run')p.step();
  for(let i=0;i<Math.round(elapsed/DT);i++)p.step();
  const start=p.sample(),life=createCompanionLife(p.actor,{seed:731});
  assert.equal(life.interact(kind),true);assert.equal(life.interact('ball'),false,'no competing direct interaction');
  if(kind==='treat')assert.ok(life.report.treat,'hand appears on acceptance, before travel completes');
  let latency=null;
  for(let i=1;i<=120;i++){
   const s=p.step();life.update(DT);
   if(life.report.gesture?.clip==='treat-eat'||s.state==='tug'){latency=i*DT;break;}
  }
  assert.ok(latency!==null,kind+' bounded attention');
  assert.ok(Math.abs(p.sample().z-start.z)<2,'brakes locally rather than finishing the 15m route');
  if(kind==='treat'){
   const root=p.sample();for(let i=0;i<120;i++){p.step();life.update(DT);}
   assert.equal(p.sample().z,root.z,'eating never becomes a fetch');
  }
 }
});

test('attention during walk preparation finishes its shared pose but never launches the stale walk',()=>{
 const p=make(-30);p.actor.walk('right',10);
 for(let i=0;i<600&&p.sample().actionName!=='walk-enter';i++)p.step();
 assert.equal(p.sample().actionName,'walk-enter');const start=p.sample();
 const life=createCompanionLife(p.actor,{seed:731});assert.equal(life.interact('treat'),true);
 let reacted=false;
 for(let i=0;i<120;i++){
  const s=p.step();life.update(DT);assert.equal(s.x,start.x);assert.equal(s.z,start.z);
  if(life.report.gesture?.clip==='treat-eat'){reacted=true;break;}
 }
 assert.ok(reacted,'queued attention is drained at the preparation endpoint');
});

test('metadata notice brakes naturally and reuses the whole-body left look once',()=>{
 const p=make();p.actor.go(0,-15);while(p.actor.state!=='run')p.step();
 for(let i=0;i<60;i++)p.step();
 const life=createCompanionLife(p.actor,{seed:731}),before=p.sample();
 assert.equal(life.notify({kind:'approval',side:'left'}),true);assert.equal(life.notify({kind:'input'}),false);
 assert.deepEqual(p.sample(),before,'acceptance never changes the current rendered pose/root');
 let looked=false,done=false,maxJump=0,previous=before;
 for(let i=0;i<900;i++){
  const s=p.step();life.update(DT);maxJump=Math.max(maxJump,Math.hypot(s.x-previous.x,s.z-previous.z));previous=s;
  if(s.behavior==='watch-left')looked=true;
  if(looked&&!life.report.attention){done=true;break;}
 }
 assert.ok(looked);assert.ok(done);assert.ok(maxJump<.2);assert.equal(life.report.interaction,null);assert.equal(life.report.ball,null);
});

test('direct ball/treat/tug preempt a cue and a cue never preempts direct play',()=>{
 for(const kind of ['ball','treat','tug']){
  const p=make(),life=createCompanionLife(p.actor,{seed:731});
  assert.equal(life.notify({kind:'input'}),true);assert.equal(life.interact(kind),true);assert.equal(life.report.attention,null);
  assert.equal(life.notify({kind:'approval'}),false);assert.equal(life.report.interaction,kind);
 }
});

test('resolved queued cue cannot later turn into an obsolete look',()=>{
 const p=make();p.actor.go(0,-15);while(p.actor.state!=='run')p.step();
 const life=createCompanionLife(p.actor,{seed:731});life.notify({kind:'input'});life.clearNotice();
 for(let i=0;i<180;i++){const s=p.step();life.update(DT);assert.notEqual(s.behavior,'watch-left');assert.equal(life.report.attention,null);}
 assert.throws(()=>life.notify({kind:'click'}));assert.throws(()=>life.notify({kind:'input',side:'bad'}));
});

test('notice establishes front contact, approaches on the existing world path, then looks aside once',()=>{
 for(const z of [0,-6,-15]){
  const p=make(z),life=createCompanionLife(p.actor,{seed:731});let contactBefore=false,approached=false,contactAfter=false,looked=false,previous=p.sample(),maxStep=0;
  assert.equal(life.notify({kind:'input'}),true);
  for(let i=0;i<2400;i++){
   const s=p.step();life.update(DT);const r=life.report;
   maxStep=Math.max(maxStep,Math.hypot(s.x-previous.x,s.z-previous.z));previous=s;
   if(r.intent==='notifyContact'&&!approached){contactBefore=true;assert.equal(s.view,'approach');assert.equal(s.seatProgress,1);}
   if(r.intent==='notifyCome'){assert.ok(contactBefore);approached=true;}
   if(r.intent==='notifyContact'&&approached)contactAfter=true;
   if(s.behavior==='watch-left'){assert.ok(contactBefore);if(z<-1)assert.ok(contactAfter);looked=true;}
   if(looked&&!r.attention)break;
  }
  assert.ok(looked);assert.equal(approached,z<-1);assert.ok(maxStep<.2,'no teleport or independent size scaling');
  if(z<-1)assert.ok(Math.abs(p.sample().z-.2)<.06,'comes near the user before the directional look');
  assert.equal(life.report.attention,null);assert.equal(life.report.ball,null);
 }
});

test('resolution brakes an approaching notification instead of completing its obsolete destination',()=>{
 const p=make(-15),life=createCompanionLife(p.actor,{seed:731});life.notify({kind:'approval'});
 for(let i=0;i<1200&&!(life.report.attention?.phase==='approaching'&&p.sample().speed>1);i++){p.step();life.update(DT);}
 assert.equal(life.report.attention.phase,'approaching');const before=p.sample();assert.ok(before.speed>1);life.clearNotice();assert.deepEqual(p.sample(),before);
 for(let i=0;i<120;i++){const s=p.step();life.update(DT);assert.notEqual(s.behavior,'watch-left');}
 assert.equal(life.report.attention,null);assert.ok(Math.abs(p.sample().z-before.z)<2);assert.ok(p.sample().z<-2,'resolved notice does not finish the entire 15m check-in');
});

test('direct interaction cancels a notification already approaching, not only a queued cue',()=>{
 for(const kind of ['ball','treat','tug']){
  const p=make(-6),life=createCompanionLife(p.actor,{seed:731});life.notify({kind:'input'});
  for(let i=0;i<1200&&!(life.report.attention?.phase==='approaching'&&p.sample().speed>.7);i++){p.step();life.update(DT);}
  assert.equal(life.report.attention.phase,'approaching');assert.equal(life.interact(kind),true);assert.equal(life.report.attention,null);assert.equal(life.report.interaction,kind);
  for(let i=0;i<120;i++){p.step();life.update(DT);assert.equal(life.report.attention,null);assert.ok(!life.report.intent.startsWith('notify'));}
 }
});
