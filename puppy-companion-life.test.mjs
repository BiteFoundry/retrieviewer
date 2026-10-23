import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPaperActor} from './puppy-paper.mjs';
import {createPaperBody} from './puppy-paper-world.mjs';
import {createCompanionLife} from './puppy-companion-life.mjs';
import {createSnappyTrickTimings} from './puppy-paper-trick-timing.mjs';
const info=JSON.parse(readFileSync(new URL('./puppy-stride-meta.json',import.meta.url)));
const actions=JSON.parse(readFileSync(new URL('./puppy-paper-actions-v9.json',import.meta.url)));
function make(seed,energy){
 const actor=createPaperActor(createPaperBody(),info,{manualTricks:true,walkTransitions:true,trickTimings:createSnappyTrickTimings(actions)});
 const life=createCompanionLife(actor,{seed,...energy===undefined?{}:{energy}});let clock=0;
 return {actor,life,step(){clock+=1/60;actor.update(1/60);life.update(1/60);return {state:actor.sample(clock),report:life.report};}};
}

test('five new autonomous episodes use existing real action/behavior clips',()=>{
 const cases=[['scan',2],['checkin',4],['roll',36],['play',43],['patrol',69]];
 for(const [episode,seed] of cases){
  const puppy=make(seed),seen=new Set();let final=null;
  for(let i=0;i<3600;i++){
   const frame=puppy.step();if(frame.report.decisions>1)break;
   assert.equal(frame.report.episode,episode);
   if(frame.state.actionName)seen.add(frame.state.actionName);
   if(frame.state.behavior)seen.add(frame.state.behavior);
   final=frame;
  }
  assert.ok(final,episode);
  if(episode==='scan')assert.ok(seen.has('watch-left')&&seen.has('watch-right'));
  if(episode==='play')assert.ok(seen.has('spin'));
  if(episode==='roll')assert.ok(seen.has('lie-down')&&seen.has('roll-down'));
  if(episode==='patrol'){
   assert.ok(seen.has('walk')&&seen.has('walk-turn'));
   assert.ok(Math.abs(final.state.x)<.002,'walk loop returns to its original x');
   assert.equal(final.state.z,0,'lateral stroll never changes depth or size');
  }
  if(episode==='checkin'){
   assert.ok(Math.abs(final.state.z-.2)<.002);assert.equal(final.state.seatProgress,1);
  }
 }
});

test('autonomy is deterministic, repeats no adjacent episode, and spaces tricks out',()=>{
 const a=make(4),b=make(4),seen=new Set(),lastTrick={roll:-Infinity,play:-Infinity};
 let previous=null,decisions=0;
 for(let i=0;i<72000;i++){
  const x=a.step(),y=b.step();
  if(i%30===0)assert.deepEqual(x,y);
  if(x.report.decisions!==decisions){
   const kind=x.report.episode;assert.notEqual(kind,previous);seen.add(kind);previous=kind;decisions=x.report.decisions;
   if(kind in lastTrick){assert.ok(i/60-lastTrick[kind]>=(kind==='roll'?90:120)-.001);lastTrick[kind]=i/60;}
  }
 }
 for(const kind of ['rest','watch','observe','stroll','dash','scan','patrol','roll','checkin','play'])assert.ok(seen.has(kind),kind);
});

test('ball interrupts an autonomous roll plan and completes a safe fetch/return',()=>{
 const puppy=make(36);let found=false;
 for(let i=0;i<1800;i++)if(puppy.step().state.actionName==='roll-down'){found=true;break;}
 assert.ok(found);assert.equal(puppy.life.interact('ball'),true);
 assert.equal(puppy.life.report.intent,'fetch');assert.equal(puppy.life.report.busy,true);
 const intents=new Set();let complete=false;
 for(let i=0;i<3600;i++){
  const f=puppy.step();intents.add(f.report.intent);
  if(!f.report.busy){complete=true;break;}
 }
 assert.ok(complete);for(const intent of ['pickup','carry','drop','offer'])assert.ok(intents.has(intent),intent);
 assert.equal(puppy.life.report.ball,null);
});

test('hand-fed treat never turns into an autonomous walk while eating',()=>{
 const puppy=make(2);puppy.step();assert.equal(puppy.life.interact('treat'),true);
 let sawChew=false,complete=false;
 for(let i=0;i<2400;i++){
  const f=puppy.step();
  if(f.report.intent==='chew'){
   sawChew=true;assert.equal(f.state.x,0);assert.equal(f.state.z,0);assert.equal(f.state.speed,0);
  }
  if(!f.report.busy){complete=true;break;}
 }
 assert.ok(sawChew&&complete);assert.equal(puppy.life.report.treat,null);
});
