import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync,deflateRawSync,inflateRawSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {planPaperCarry,PAPER_GAITS,createPaperBody} from './puppy-paper-world.mjs';
import {createPaperActor} from './puppy-paper.mjs';
import {createCompanionLife} from './puppy-companion-life.mjs';
import {readPackedFrames} from './puppy-frame-store.mjs';
import {comfortMotionKey,createComfortSpriteSampler} from './puppy-comfort-sprites.mjs';
import {createPet} from './retrieviewer.mjs';
const json=f=>JSON.parse(readFileSync(new URL(f,import.meta.url)));
const meta=json('./puppy-companion-comfort.json'),stride=json('./puppy-stride-meta.json');

test('carry travel is monotonic, continuous, distance-driven and gathers only in its final centimeters',()=>{
 for(const mixed of [false,true])for(const distance of [.02,.2,1,2,4,8,40,200]){
  const p=planPaperCarry(distance,{mixed}),delta=.001;
  assert.ok(p.stride<=PAPER_GAITS.trot.stride+1e-9);assert.ok(p.peak<=PAPER_GAITS.approach.speed+1e-9);
  const trotStart=p.runDistance,trotEnd=p.gatherStart;
  assert.ok(Math.abs((trotEnd-trotStart)/p.stride-Math.round((trotEnd-trotStart)/p.stride))<1e-7);
  assert.ok(distance-trotEnd<=.088+1e-8,'no prolonged sliding approach');
  let last=p.at(0);
  for(let t=delta;t<p.duration;t+=delta){const s=p.at(t);assert.ok(s.distance>=last.distance);assert.ok(Math.abs(s.speed-last.speed)<.02,'no velocity jump at gait boundary');assert.ok(Math.abs((s.distance-last.distance)/delta-(s.speed+last.speed)/2)<.005);const pose=p.poseAt(s.distance);assert.ok(pose.progress>=0);if(pose.clip==='carry-trot')assert.ok(s.speed/p.stride<=PAPER_GAITS.trot.frequency+1e-7);last=s;}
  assert.equal(p.at(p.duration).distance,distance);assert.equal(p.at(p.duration).speed,0);assert.equal(p.poseAt(distance).progress,1);
 }
 for(const d of [0,-1,NaN,Infinity])assert.throws(()=>planPaperCarry(d));
});

test('auto preserves all three return gaits without adjacent repeats and seats at home',()=>{
 const actor=createPaperActor(createPaperBody(),stride,{manualTricks:true,walkTransitions:true,scrambleSeconds:meta.scramble.duration,fetchMotions:meta}),life=createCompanionLife(actor,{seed:731});
 const modes=new Set();let clock=0,lastMode=null;
 const step=()=>{clock+=1/60;actor.update(1/60);life.update(1/60);return actor.sample(clock);};
 for(let n=0;n<12;n++){
  while(life.report.cooldowns.ball>0)step();assert.equal(life.interact('ball'),true);
  const mode=life.report.returnMode;assert.notEqual(mode,lastMode);modes.add(mode);lastMode=mode;
  let previous=null,trot=0,gather=0,brake=0,done=false;
  const keys=new Set();
  for(let i=0;i<3600;i++){
   const s=step(),pose=s.comfortPose;
   if(pose?.clip==='carry-trot'){
    trot++;assert.equal(s.view,'approach');assert.ok(s.speed>0||s.travelDistance===0,'only the initial supported pose may be stationary');assert.equal(s.behavior,null);
    keys.add(comfortMotionKey(pose.progress,meta.carryTrot));
    if(previous?.comfortPose?.clip==='carry-trot'&&previous.comfortPose.cycle===pose.cycle)assert.ok(pose.progress>=previous.comfortPose.progress,'steps never run backward');
   }
   if(pose?.clip==='carry-settle')gather++;
   if(s.behavior==='brake')brake++;
   if(!life.report.busy){assert.equal(s.seatProgress,1);assert.ok(Math.abs(s.z-.2)<1e-8);done=true;break;}
   previous=s;
  }
  assert.ok(done);if(mode==='brake'){assert.ok(brake>0);assert.equal(trot,0);}else{assert.ok(trot>5&&gather>0);assert.equal(keys.size,4);assert.equal(brake,0);}
 }
 assert.deepEqual([...modes].sort(),['brake','run-trot','trot']);
});

test('carry art has a seamless cyclic schedule, exact sitting handoff and bounded extra retention',()=>{
 const encoded=gunzipSync(readFileSync(new URL('./puppy-companion-comfort-q5.bin.gz',import.meta.url))),store=readPackedFrames(encoded),motion=meta.carryTrot;
 assert.equal(meta.attentionPaw?.baseFrames??meta.frames,45);assert.equal(motion.frames.length,4);assert.equal(motion.settle.frames.length,4);
 assert.equal(comfortMotionKey(0,motion),0);assert.equal(comfortMotionKey(.999999,motion),3);
 const arrival=readPackedFrames(gunzipSync(readFileSync(new URL('./puppy-paper-arrival-seat-q5.bin.gz',import.meta.url))));
 assert.deepEqual(store.getFrame(motion.settle.frames.at(-1)),arrival.getFrame(0));
 const hash=createHash('sha256');for(let i=0;i<37;i++)hash.update(store.getFrame(i));
 // Updated only for the four reviewed tug spill removals; per-frame preservation
 // is independently pinned in puppy-comfort-art-regression.test.mjs.
 assert.equal(hash.digest('hex'),'d9f7526002dd8477537b7f1b766658063eeb77e43711c9f291c00653bff46e17');
 const codec={compress:b=>deflateRawSync(b,{level:3}),expand:(b,n)=>inflateRawSync(b,{maxOutputLength:n})};
 const all=readPackedFrames(encoded,{codec,frameIndices:Array.from({length:45},(_,i)=>i)}),base=readPackedFrames(encoded,{codec,frameIndices:Array.from({length:37},(_,i)=>i)});
 assert.ok(all.residentPixelBytes-base.residentPixelBytes<110_000,'new Node compressed pixels under 108KiB');
 assert.ok((meta.attentionSource?.baseGzipBytes??meta.gzipBytes)-meta.carrySource.gzipBytes<90_000);
 const out=new Uint8ClampedArray(320*320*4),sample=createComfortSpriteSampler(store,meta,out);
 for(let i=0;i<30;i++)assert.equal(sample({clip:'carry-trot',progress:i/30}),out);
 assert.ok(store.stats().cachedFrames<=2);
 const bad=structuredClone(meta);bad.carryTrot.feet[0][0].x=NaN;assert.throws(()=>createComfortSpriteSampler(store,bad));
});

test('default renderer carries the ball at the exact new mouth, never at the actor root',async()=>{
 const pet=await createPet({seed:731,returnStyle:'run-trot'});let seen=0,settled=false;
 try{
  assert.equal(pet.interact('ball'),true);
  for(let i=0;i<1200;i++){
   pet.step(1/60);if(i%3)continue;
   const f=pet.frame({columns:160,rows:60,poseFps:30}),pose=f.state.comfortPose;
   if(pose?.clip==='carry-trot'||pose?.clip==='carry-settle'){
    seen++;assert.equal(f.mouth.family,'comfort');assert.equal(f.report.ball.carried,true);
    const motion=pose.clip==='carry-trot'?meta.carryTrot:meta.carryTrot.settle;
    assert.equal(f.mouth.frame,motion.frames[comfortMotionKey(pose.progress,motion)]);
    assert.ok(Number.isFinite(f.mouth.x)&&Number.isFinite(f.mouth.y));
   }
   if(!f.report.busy){settled=true;break;}
  }
  assert.ok(seen>5&&settled);
 }finally{pet.dispose();}
});

test('fixed style selection keeps original braking available and changes only the next throw',()=>{
 const actor=createPaperActor(createPaperBody(),stride,{manualTricks:true,walkTransitions:true,scrambleSeconds:meta.scramble.duration,fetchMotions:meta}),life=createCompanionLife(actor,{seed:731,returnStyle:'brake'});
 let clock=0;const step=()=>{clock+=1/60;actor.update(1/60);life.update(1/60);return actor.sample(clock);};
 assert.equal(life.interact('ball'),true);assert.equal(life.report.returnMode,'brake');
 assert.equal(life.setReturnStyle('trot'),'trot');assert.equal(life.report.returnStyle,'trot');assert.equal(life.report.returnMode,'brake');
 let brake=0;for(let n=0;n<3600&&life.report.busy;n++)if(step().behavior==='brake')brake++;
 assert.ok(brake>0);while(life.report.cooldowns.ball>0)step();
 assert.equal(life.interact('ball'),true);assert.equal(life.report.returnMode,'trot');
 assert.throws(()=>life.setReturnStyle('unknown'));assert.equal(life.report.returnStyle,'trot');
 for(let n=0;n<3600&&life.report.busy;n++)step();while(life.report.cooldowns.ball>0)step();
 life.setReturnStyle('run-trot');assert.equal(life.interact('ball'),true);assert.equal(life.report.returnMode,'run-trot');
});

test('public style options validate before I/O and setter retains disposal safety',async()=>{
 let loads=0;await assert.rejects(createPet({returnStyle:'unknown',loadAsset:async()=>{loads++;}}),/returnStyle/);assert.equal(loads,0);
 const pet=await createPet({seed:731,returnStyle:'brake'});
 try{assert.equal(pet.frame({columns:40,rows:16}).report.returnStyle,'brake');assert.equal(pet.setReturnStyle('auto'),'auto');assert.throws(()=>pet.setReturnStyle(null));assert.equal(pet.frame({columns:40,rows:16}).report.returnStyle,'auto');}finally{pet.dispose();}
 assert.throws(()=>pet.setReturnStyle('brake'),/disposed/);
});
