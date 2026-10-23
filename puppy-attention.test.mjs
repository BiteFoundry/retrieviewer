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
