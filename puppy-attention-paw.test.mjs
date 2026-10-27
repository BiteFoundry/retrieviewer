import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {readPackedFrames} from './puppy-frame-store.mjs';
import {createComfortSpriteSampler,comfortMotion,comfortMotionKey,comfortProgress} from './puppy-comfort-sprites.mjs';
import {createPaperActor,createPaperComfortTimings} from './puppy-paper.mjs';
import {createPaperBody} from './puppy-paper-world.mjs';
import {createSnappyTrickTimings} from './puppy-paper-trick-timing.mjs';
import {createCompanionLife} from './puppy-companion-life.mjs';
import {createPet} from './retrieviewer.mjs';
const json=name=>JSON.parse(readFileSync(new URL(name,import.meta.url)));
const info=json('./puppy-companion-comfort.json'),stride=json('./puppy-stride-meta.json'),actions=json('./puppy-paper-actions-v9.json');
const encoded=gunzipSync(readFileSync(new URL('./puppy-companion-comfort-q5.bin.gz',import.meta.url))),DT=1/60;
function make(){
 const actor=createPaperActor(createPaperBody(),stride,{manualTricks:true,walkTransitions:true,trickTimings:createSnappyTrickTimings(actions),comfortTimings:createPaperComfortTimings(actions),scrambleSeconds:info.scramble.duration,fetchMotions:info});
 let time=0;const sample=()=>actor.sample(time,{poseFps:30}),step=()=>{time+=DT;actor.update(DT);return sample();};
 actor.sit();for(let i=0;i<600&&!(actor.state==='idle'&&sample().seatProgress===1);i++)step();
 return {actor,step,sample};
}
test('six whole-body paw keys preserve all 45 old comfort frames and bounded borrowed storage',()=>{
 const store=readPackedFrames(encoded,{frameIndices:Array.from({length:51},(_,i)=>i)}),old=readPackedFrames(encoded,{frameIndices:Array.from({length:45},(_,i)=>i)}),scratch=new Uint8ClampedArray(320*320*4),sampler=createComfortSpriteSampler(store,info,scratch);
 assert.equal(info.attentionWall?.baseFrames??info.frames,51);assert.equal(info.attentionSource.existingFrameHashes.length,45);
 // Compare equally cold stores before warming either two-frame reconstruction
 // cache. Six cropped 5-bit whole-body drawings retain about 137 KiB.
 assert.ok(store.residentPixelBytes-old.residentPixelBytes<160_000,'six cropped keys, not an expanded 30fps film');
 for(let i=0;i<45;i++)assert.equal(createHash('sha256').update(store.getFrame(i)).digest('hex'),info.attentionSource.existingFrameHashes[i]);
 const neutral=Uint8Array.from(store.getFrame(0));
 for(const progress of [0,1])assert.deepEqual(Uint8Array.from(sampler({clip:'attention-paw',progress}).filter((_,i)=>i%4===0)),neutral);
 for(let i=0;i<=120;i++)assert.equal(sampler({clip:'attention-paw',progress:i/120}),scratch);
 for(const [from,motion] of Object.entries(info.attentionPaw.releases)){
  assert.deepEqual(Uint8Array.from(sampler({clip:'attention-paw',progress:0,release:{from,progress:0}}).filter((_,i)=>i%4===0)),store.getFrame(Number(from)));
  assert.deepEqual(Uint8Array.from(sampler({clip:'attention-paw',progress:0,release:{from,progress:1}}).filter((_,i)=>i%4===0)),neutral);assert.ok(motion.duration<=.3);
 }
 assert.ok(store.stats().cachedFrames<=2);assert.throws(()=>sampler({clip:'attention-paw',progress:0,release:{from:999,progress:0}}));
 const invalid=structuredClone(info);delete invalid.attentionPaw.releases[46];assert.throws(()=>createComfortSpriteSampler(store,invalid));
});
test('pawing keeps world position and scale, and every interruption starts at its exact drawn key',()=>{
 for(const age of [.05,.16,.35,.55,.75,1.05,1.35,1.7]){
  const p=make();assert.equal(p.actor.canAttentionPaw,true);assert.equal(p.actor.attentionPaw(),true);
  const root=p.sample();for(let i=0;i<Math.round(age/DT);i++)p.step();
  const before=p.sample(),key=comfortMotionKey(before.comfortPose.progress,info.attentionPaw),drawn=info.attentionPaw.frames[key];
  assert.equal(before.state,'attention-paw');assert.equal(before.x,root.x);assert.equal(before.z,root.z);assert.equal(before.speed,0);
  p.actor.chase(0,-4);const exiting=p.sample(); // same-clock acceptance preserves the previously drawn pose
  assert.equal(exiting.queued,true);assert.deepEqual({...exiting,queued:before.queued},before);
  // Pose cadence can hold the previous exact drawing for one 30fps bucket.
  // A neutral-key exit can finish in 20ms without needing a new paw drawing.
  let next=p.step();for(let i=0;i<3&&next.state==='attention-paw'&&!next.comfortPose.release;i++)next=p.step();
  if(drawn!==0){assert.equal(next.comfortPose.release.from,drawn);assert.equal(comfortMotion(next.comfortPose,info).frames[0],drawn);assert.ok(comfortProgress(next.comfortPose)>=0);}
  let released=next.state!=='attention-paw';for(let i=0;i<20&&!released;i++){const s=p.step();if(s.state!=='attention-paw'){released=true;break;}}
  assert.ok(released,'direct play starts connected recovery within 0.3 seconds');
 }
});
test('notification paws exactly once after front contact; resolution/direct interaction safely lowers it',()=>{
 for(const interrupt of ['resolve','ball','treat','tug']){
  const p=make(),life=createCompanionLife(p.actor,{seed:731});life.notify({kind:'approval'});let sawPaw=false;
  for(let i=0;i<600;i++){p.step();life.update(DT);if(p.sample().state==='attention-paw'){sawPaw=true;break;}}
  assert.ok(sawPaw);for(let i=0;i<35;i++){p.step();life.update(DT);}
  if(interrupt==='resolve')life.clearNotice();else assert.equal(life.interact(interrupt),true);
  assert.equal(life.report.attention,null);
  for(let i=0;i<25;i++){p.step();life.update(DT);}
  assert.notEqual(p.sample().state,'attention-paw');assert.ok(!life.report.intent.startsWith('notify'));
 }
});
test('actual public renderer samples pawing with unchanged projected placement and no props',async()=>{
 const pet=await createPet({seed:731});try{
  pet.notify({kind:'input'});const hashes=new Set();let anchor=null,found=0,done=false,previousContacts=null;
  for(let i=0;i<900;i++){
   pet.step(DT);if(i%3)continue;const f=pet.frame({columns:100,rows:60,poseFps:30});
   if(f.state.state==='attention-paw'){
    found++;const placement=[f.state.x,f.state.z,f.placement.x,f.placement.y,f.placement.size];if(!anchor)anchor=placement;else assert.deepEqual(placement,anchor);
    hashes.add(createHash('sha256').update(f.pixels).digest('hex'));assert.equal(f.report.ball,null);assert.equal(f.report.tug,null);
    // Contact statistics are lifetime totals, including the approach turn. No
    // contact samples may be added by this gesture, even on its first frame.
    assert.ok(previousContacts);assert.deepEqual(f.contacts,previousContacts);
    const enabled=Uint8ClampedArray.from(f.pixels),withoutContacts=pet.frame({columns:100,rows:60,poseFps:30,contactEnabled:false});
    assert.deepEqual(withoutContacts.pixels,enabled,'contact correction does not alter the gesture');
   }
   previousContacts=f.contacts;
   if(found&&!f.report.attention){done=true;break;}
  }
  assert.ok(found>10&&hashes.size>=5&&done);
 }finally{pet.dispose();}
});
