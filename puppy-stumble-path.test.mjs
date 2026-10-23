import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planPaperStumble,createPaperBody,PAPER_GAITS} from './puppy-paper-world.mjs';
import {createPaperActor} from './puppy-paper.mjs';
import {createCompanionLife} from './puppy-companion-life.mjs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {readPackedFrames} from './puppy-frame-store.mjs';
const info=JSON.parse(readFileSync(new URL('./puppy-stride-meta.json',import.meta.url)));
const scramble=JSON.parse(readFileSync(new URL('./puppy-companion-comfort.json',import.meta.url))).scramble;
const fetchMotions={scramble,pickups:{front:{duration:.52},rear:{duration:.52}}};
test('single-pursuit physics matches velocity/contact phase and reaches the exact pickup without stop/restart',()=>{
 for(const distance of [.02,.2,.7,2.08,4,20,200]){
  const m=planPaperStumble(distance,scramble),entry=m.plan.at(m.entryTime);
  assert.ok(Math.abs(entry.distance-m.entryDistance)<1e-7);assert.ok(entry.speed>0);
  assert.ok(Math.abs(entry.speed-m.impactAt(0).speed)<1e-7);
  assert.ok(Math.abs(m.entryDistance/m.stride%1-.25)<1e-7);
  assert.ok(m.stride<=PAPER_GAITS.rear.stride+1e-8);assert.ok(entry.speed/m.stride<=PAPER_GAITS.rear.frequency+1e-8);
  let last=m.impactAt(0);
  for(let t=.001;t<scramble.duration;t+=.001){const s=m.impactAt(t);assert.ok(s.distance>=last.distance-1e-9);assert.ok(s.speed<=last.speed+1e-9);if(t<scramble.brakeSeconds+scramble.catchSeconds)assert.ok(s.speed>0);last=s;}
  assert.equal(last.speed,0);assert.ok(Math.abs(m.entryDistance+last.distance-distance)<1e-7);
  const l=m.impactAt(scramble.brakeSeconds-1e-8),r=m.impactAt(scramble.brakeSeconds+1e-8);assert.ok(Math.abs(l.distance-r.distance)<1e-6);assert.ok(Math.abs(l.speed-r.speed)<1e-6);
 }
 for(const d of [0,-1,NaN,Infinity])assert.throws(()=>planPaperStumble(d));
});
test('actual rare fetch has no lateral detour, reverse or second chase before pickup; return is not armed',()=>{
 const actor=createPaperActor(createPaperBody(),info,{manualTricks:true,walkTransitions:true,scrambleSeconds:scramble.duration,fetchMotions}),life=createCompanionLife(actor,{seed:731});
 let clock=0,tumbles=0;
 const step=()=>{clock+=1/60;actor.update(1/60);life.update(1/60);return{state:actor.sample(clock),report:life.report};};
 for(let n=0;n<40&&tumbles<2;n++){
  while(life.report.cooldowns.ball>0)step();assert.equal(life.interact('ball'),true);
  const isTumble=life.report.fetchPattern==='tumble',x=actor.sample(clock).x;
  let previous=null,impacted=false,picked=false,carried=false,done=false;
  for(let i=0;i<3600;i++){
   const {state:s,report:r}=step();
   if(isTumble&&!carried){assert.equal(s.x,x);assert.notEqual(r.intent,'reChase');if(previous)assert.ok(s.z<=previous.z+1e-8,'no reversing to reach the ball');}
   if(isTumble&&s.state==='scramble'){if(!impacted){assert.equal(previous.state,'run');assert.ok(previous.speed>0&&s.speed>0);}impacted=true;assert.equal(s.view,'rear');}
   if(isTumble&&s.state==='pickup'){picked=true;assert.ok(impacted);assert.equal(s.view,'rear');assert.equal(s.speed,0);}
   if(r.ball?.carried)carried=true;
   if(isTumble&&carried)assert.notEqual(s.state,'scramble','normal return is never a second skid/stumble');
   if(!r.busy){done=true;break;}previous=s;
  }
  assert.ok(done);if(isTumble){assert.ok(impacted&&picked&&carried);tumbles++;}
 }
 assert.equal(tumbles,2);
});

test('installed motion art preserves every old comfort pixel, exact run/pickup endpoints, and declared byte budgets',()=>{
 const meta=JSON.parse(readFileSync(new URL('./puppy-companion-comfort.json',import.meta.url)));
 assert.equal(meta.version,6);assert.equal(meta.scramble.trajectory,'single-pass-target');
 const gzip=readFileSync(new URL('./puppy-companion-comfort-q5.bin.gz',import.meta.url)),encoded=gunzipSync(gzip),store=readPackedFrames(encoded);
 assert.equal(meta.encodedSha256,createHash('sha256').update(encoded).digest('hex'));assert.equal(meta.gzipBytes,gzip.length);assert.equal(meta.frames,store.frameCount);
 const hash=createHash('sha256');for(let i=0;i<13;i++)hash.update(store.getFrame(i));assert.equal(hash.digest('hex'),'d6acd36bff0fbe31ea7eb26499b342d011467cf03c5b119be05f54383c90a282');
 const rear=readPackedFrames(gunzipSync(readFileSync(new URL('./puppy-paper-rear-gallop-q5.bin.gz',import.meta.url))));
 assert.deepEqual(store.getFrame(meta.scramble.frames[0]),rear.getFrame(7*9));assert.deepEqual(store.getFrame(meta.scramble.frames.at(-1)),rear.getFrame(5*9));
 assert.deepEqual(store.getFrame(meta.pickups.rear.frames[0]),rear.getFrame(5*9));assert.ok(meta.carrySource.gzipBytes-meta.sourceComfort.gzipBytes<260_000);assert.ok(meta.gzipBytes-meta.carrySource.gzipBytes<90_000);
 for(const key of ['perPoseScale','bodyCompositing','nonlinearWarp'])assert.equal(meta.scramble.registration[key],false);
 assert.deepEqual(meta.scramble.registration.approvedOriginalKeys,[2,4,6,8]);
});
