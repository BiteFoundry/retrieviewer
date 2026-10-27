import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPaperActor} from './puppy-paper.mjs';
import {createPaperBody,createPaperProjection,PAPER_GAITS} from './puppy-paper-world.mjs';
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
 const cases=[['scan',1],['checkin',20],['roll',30],['play',256],['patrol',2]];
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
 const a=make(4),b=make(4),seen=new Set(),lastTrick={roll:-Infinity,play:-Infinity,belly:-Infinity,sleep:-Infinity};
 let previous=null,decisions=0;
 for(let i=0;i<180000;i++){
  const x=a.step(),y=b.step();
  if(i%30===0)assert.deepEqual(x,y);
  if(x.report.decisions!==decisions){
   const kind=x.report.episode;assert.notEqual(kind,previous);seen.add(kind);previous=kind;decisions=x.report.decisions;
   if(kind in lastTrick){assert.ok(i/60-lastTrick[kind]>=({roll:90,play:120,belly:80,sleep:100}[kind])-.001);lastTrick[kind]=i/60;}
  }
 }
 for(const kind of ['rest','watch','observe','stroll','dash','scan','patrol','roll','checkin','play','belly','sleep'])assert.ok(seen.has(kind),kind);
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
 assert.equal(puppy.life.report.ball.phase,'rest');
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

test('autonomy uses both sides and depth, lingers away and naps in different nooks without teleporting',()=>{
 const projection=createPaperProjection({viewportWidth:1920,viewportHeight:1080,rect:{left:0,top:0,width:1920,height:1080},width:960,height:540});
 for(const seed of [0,1,2,4,20,30,43,256,731,990]){
  const p=make(seed),napSpots=new Set();let last=null,near=0,minZ=0,minU=.5,maxU=.5,awayHolds=0,sleeping=0;
  for(let i=0;i<1200*60;i++){
   const {state:s,report:r}=p.step(),u=projection.project(s.x,0,s.z).x;
   minZ=Math.min(minZ,s.z);minU=Math.min(minU,u);maxU=Math.max(maxU,u);
   if(s.z>-.5&&Math.abs(s.x)<.32)near++;
   if(last)assert.ok(Math.hypot(s.x-last.x,s.z-last.z)<=PAPER_GAITS.front.speed/60+1e-8,'root always follows integrated gait travel');
   if(r.intent==='far'&&s.state==='idle'&&s.speed===0&&s.z<-.65)awayHolds++;
   if(s.state==='sleep'){
    sleeping++;assert.ok(s.z<=-.5&&s.z>=-3.5&&Math.abs(s.x)>.15,'nap must be away from the front-center magnet');
    napSpots.add(`${s.x.toFixed(2)}/${s.z.toFixed(2)}`);
    if(last?.state==='sleep'){assert.equal(s.x,last.x);assert.equal(s.z,last.z);}
   }
   last=s;
  }
  assert.ok(near/(1200*60)<.4,`${seed}: too much front-center occupancy`);
  assert.ok(minZ< -3&&minU<.35&&maxU>.65,`${seed}: needs lateral and depth coverage`);
  assert.ok(awayHolds>60,`${seed}: dash should linger at its destination`);
  assert.ok(sleeping>60&&napSpots.size>=2,`${seed}: needs more than one sleeping place`);
 }
});

test('a ball from a distant nap interrupts, fetches and returns; a treat stays at that nap',()=>{
 for(const kind of ['ball','treat']){
  const p=make(43);let nap=null;
  for(let i=0;i<180*60;i++){const f=p.step();if(f.state.state==='sleep'){nap=f.state;break;}}
  assert.ok(nap&&nap.z<-.5);assert.equal(p.life.interact(kind),true);
  let reacted=false,finished=false;
  for(let i=0;i<60*60;i++){
   const f=p.step();
   if(kind==='treat'&&f.report.intent==='chew'){
    reacted=true;assert.equal(f.state.x,nap.x);assert.equal(f.state.z,nap.z);assert.equal(f.state.speed,0);
   }
   if(kind==='ball'&&f.report.intent==='fetch'&&f.state.speed>0)reacted=true;
   if(!f.report.busy){
    finished=true;
    if(kind==='ball'){assert.ok(Math.abs(f.state.x)<.002);assert.ok(Math.abs(f.state.z-.2)<.002);}
    break;
   }
  }
  assert.ok(reacted&&finished,kind+' must remain responsive away from home');
 }
});
