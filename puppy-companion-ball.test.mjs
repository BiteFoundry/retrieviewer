import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createBallPath,createFetchPatterns} from './puppy-companion-ball.mjs';
import {createPaperActor} from './puppy-paper.mjs';
import {createPaperBody} from './puppy-paper-world.mjs';
import {createCompanionLife} from './puppy-companion-life.mjs';

test('rolling ball is continuous, slows under constant friction and stops exactly',()=>{
 const from={x:0,z:.2},landing={x:.1,z:-4},stop={x:.4,z:-7.5};
 const path=createBallPath({from,landing,stop}),distance=Math.hypot(.3,-3.5);
 from.x=50;landing.x=60;stop.z=20;
 assert.equal(path.at(0).x,0,'input mutation must not alter an active throw');
 assert.ok(Math.abs(path.at(.65-1e-8).z-path.at(.65).z)<1e-6,'flight meets roll without a jump');
 let previous=Infinity,lastDistance=-1;
 for(let t=.65;t<path.duration;t+=.01){
  const b=path.at(t),d=Math.hypot(b.x-.1,b.z+4);
  assert.ok(b.speed<=previous+1e-9);assert.ok(d>=lastDistance-1e-9);
  assert.ok(Math.abs(b.spin*.035-d)<1e-9);assert.equal(b.height,0);
  if(t>.66)assert.ok(Math.abs((previous-b.speed)/.01-.6)<1e-8);
  previous=b.speed;lastDistance=d;
 }
 const end=path.at(path.duration+10);
 assert.equal(end.x,.4);assert.equal(end.z,-7.5);assert.equal(end.speed,0);assert.equal(end.settled,true);
 assert.ok(Math.abs(end.spin-distance/.035)<1e-9);
 assert.deepEqual(path.at(path.duration+100),end,'settled ball stays settled without integrated drift');
 assert.equal(createBallPath().at(.65).phase,'rest','first clean fetch remains the familiar trajectory');
 for(const options of [{flight:-1},{deceleration:0},{peak:NaN}])assert.throws(()=>createBallPath(options));
 assert.throws(()=>path.at(Infinity));
});

test('fetch variants are deterministic, non-repeating, with a rare spaced tumble',()=>{
 const rng=()=>{let n=123;return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/2**32;};};
 const a=createFetchPatterns(rng(),{canTumble:true}),b=createFetchPatterns(rng(),{canTumble:true}),seen=new Set();
 let last=null,lastTumble=-Infinity,tumbles=0;
 for(let i=1;i<=400;i++){
  const p=a();assert.equal(p,b());assert.notEqual(p,last);if(i===1)assert.equal(p,'clean');seen.add(p);
  if(p==='tumble'){assert.ok(i>=4&&i-lastTumble>=4);lastTumble=i;tumbles++;}last=p;
 }
 assert.equal(seen.size,4);assert.ok(tumbles>0&&tumbles<400*.15);
 const noArt=createFetchPatterns(rng());for(let i=0;i<100;i++)assert.notEqual(noArt(),'tumble','do not request an unavailable sprite');
 const far=createFetchPatterns(rng(),{canTumble:true});for(let i=0;i<100;i++)assert.notEqual(far(false),'tumble','a rear/front approach cannot jump into a side-on tumble');
});

test('repeated clean, rolling and missed catches recover and return the ball home',()=>{
 const info=JSON.parse(readFileSync(new URL('./puppy-stride-meta.json',import.meta.url)));
 const actor=createPaperActor(createPaperBody(),info,{manualTricks:true,walkTransitions:true}),life=createCompanionLife(actor,{seed:731});
 let clock=0,rolling=false,missed=false;const seen=new Set();
 const step=()=>{clock+=1/30;actor.update(1/30);life.update(1/30);return{state:actor.sample(clock),report:life.report};};
 for(let n=0;n<15;n++){
  for(let i=0;life.report.cooldowns.ball>0&&i<400;i++)step();
  assert.equal(life.interact('ball'),true);seen.add(life.report.fetchPattern);let complete=false;
  for(let i=0;i<1800;i++){
   const f=step(),b=f.report.ball;if(b?.phase==='roll'&&b.speed>0)rolling=true;
   if(f.report.intent==='miss')missed=true;
   if(!f.report.busy){assert.ok(Math.hypot(f.state.x,f.state.z-.2)<.002);assert.equal(b.phase,'rest');assert.equal(b.carried,false);complete=true;break;}
  }
  assert.ok(complete,'fetch must not hang while waiting for a rolling target');
 }
 assert.deepEqual([...seen].sort(),['clean','miss','rolling']);assert.ok(rolling&&missed);
});

test('urgent fetch preparation is bounded, preserves run physics and resets before normal watching',()=>{
 const info=JSON.parse(readFileSync(new URL('./puppy-stride-meta.json',import.meta.url)));
 const make=()=>{
  const actor=createPaperActor(createPaperBody(),info,{manualTricks:true,walkTransitions:true});let clock=0;
  const step=()=>{clock+=1/60;actor.update(1/60);return actor.sample(clock);};
  const until=predicate=>{for(let n=1;n<=1800;n++){const s=step();if(predicate(s))return n;}throw Error('actor timeout');};
  actor.sit();until(()=>actor.state==='idle');return{actor,step,until};
 };
 const normal=make(),eager=make();normal.actor.go(0,-4);eager.actor.chase(0,-4);
 const ordinaryFrames=normal.until(s=>s.state==='run'),eagerFrames=eager.until(s=>s.state==='run');
 assert.ok(eagerFrames<=55,`seated launch ${eagerFrames/60}s`);
 assert.ok(eagerFrames<ordinaryFrames/2);
 for(let n=0;n<90;n++){
  const a=normal.step(),b=eager.step();
  for(const key of ['x','z','speed','travelDistance','phase','stride'])assert.equal(b[key],a[key],key+' must not be sped up');
 }
 eager.until(()=>eager.actor.state==='idle');eager.actor.sit({urgent:true});eager.until(()=>eager.actor.state==='idle');
 eager.actor.look('left');const watchFrames=eager.until(()=>eager.actor.state==='idle');
 assert.ok(watchFrames>=113&&watchFrames<=115,'fetch urgency must not leak into ordinary watch timing');
});

test('first throw visibly prepares immediately, reaches the ball and carries without multi-second preparation holds',()=>{
 const info=JSON.parse(readFileSync(new URL('./puppy-stride-meta.json',import.meta.url)));
 const actor=createPaperActor(createPaperBody(),info,{manualTricks:true,walkTransitions:true});
 actor.sit();for(let i=0;i<240;i++)actor.update(1/60);
 const life=createCompanionLife(actor,{seed:731});assert.equal(life.interact('ball'),true);
 assert.equal(actor.state,'rise','do not wait for a life-controller safe tick');
 let runAt=null,pickupAt=null,carryAt=null;
 for(let n=1;n<=20*60;n++){
  actor.update(1/60);life.update(1/60);const s=actor.sample(n/60),r=life.report;
  if(s.speed>0)runAt??=n/60;
  if(r.intent==='pickup')pickupAt??=n/60;
  if(r.ball?.carried){carryAt=n/60;break;}
 }
 assert.ok(runAt<=.95,`run after ${runAt}s`);
 assert.ok(carryAt!==null&&carryAt-pickupAt<1.9,`pickup preparation/gesture ${carryAt-pickupAt}s`);
});
