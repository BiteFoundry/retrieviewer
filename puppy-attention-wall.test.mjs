import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync,deflateRawSync,inflateRawSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {readPackedFrames} from './puppy-frame-store.mjs';
import {createComfortSpriteSampler,comfortMotionKey} from './puppy-comfort-sprites.mjs';
import {createPaperActor} from './puppy-paper.mjs';
import {createPaperBody} from './puppy-paper-world.mjs';
import {createCompanionLife} from './puppy-companion-life.mjs';
import {createPet} from './retrieviewer.mjs';
const json=n=>JSON.parse(readFileSync(new URL(n,import.meta.url))),meta=json('./puppy-companion-comfort.json'),stride=json('./puppy-stride-meta.json');
const encoded=gunzipSync(readFileSync(new URL('./puppy-companion-comfort-q5.bin.gz',import.meta.url))),DT=1/60;
const hash=b=>createHash('sha256').update(b).digest('hex');
function make(){
 const actor=createPaperActor(createPaperBody(),stride,{manualTricks:true,walkTransitions:true,scrambleSeconds:meta.scramble.duration,fetchMotions:meta});let clock=0;
 const step=()=>{clock+=DT;actor.update(DT);return actor.sample(clock,{poseFps:30});};
 actor.sit();for(let i=0;i<600&&!(actor.state==='idle'&&actor.sample(clock).seatProgress===1);i++)step();
 return {actor,step,sample:()=>actor.sample(clock,{poseFps:30})};
}
test('nine wall keys preserve the accepted 51 frames, neutral and bounded shared storage',()=>{
 assert.equal(meta.frames,60);assert.equal(meta.wallSource.existingFrameHashes.length,51);
 const codec={compress:b=>deflateRawSync(b,{level:3}),expand:(b,n)=>inflateRawSync(b,{maxOutputLength:n})};
 const node=readPackedFrames(encoded,{codec}),base=readPackedFrames(encoded,{codec,frameIndices:Array.from({length:51},(_,i)=>i)});
 assert.ok(node.residentPixelBytes-base.residentPixelBytes<130_000);
 assert.ok(meta.gzipBytes-meta.wallSource.baseGzipBytes<115_000);
 const store=readPackedFrames(encoded),scratch=new Uint8ClampedArray(320*320*4),sample=createComfortSpriteSampler(store,meta,scratch);
 for(let i=0;i<51;i++)assert.equal(hash(store.getFrame(i)),meta.wallSource.existingFrameHashes[i]);
 const neutral=Uint8Array.from(store.getFrame(0));
 for(const progress of [0,1])assert.deepEqual(sample({clip:'attention-wall',progress}).filter((_,i)=>i%4===0),new Uint8ClampedArray(neutral));
 for(let i=0;i<=100;i++)assert.equal(sample({clip:'attention-wall',progress:i/100}),scratch);
 assert.ok(store.stats().cachedFrames<=2);
 for(const [from,release] of Object.entries(meta.attentionWall.releases)){
  assert.ok(release.duration<=.4);assert.equal(release.frames[0],Number(from));assert.equal(release.frames.at(-1),0);
  assert.deepEqual(sample({clip:'attention-wall',progress:0,release:{from,progress:0}}).filter((_,i)=>i%4===0),new Uint8ClampedArray(store.getFrame(Number(from))));
 }
 const bad=structuredClone(meta);delete bad.attentionWall.releases[53];assert.throws(()=>createComfortSpriteSampler(store,bad));
 const reg=meta.wallSource.registration;assert.equal(new Set(reg.keys.map(k=>k.scale)).size,1);
 for(const k of reg.keys){assert.ok(Math.abs(k.planted[0]-reg.plantedTarget[0])<=.5);assert.equal(k.planted[1],reg.plantedTarget[1]);assert.ok(k.bounds[1]>0&&k.bounds[2]<320);}
});
test('upright scratching lowers from the exact visible key before every direct interruption',()=>{
 for(const age of [.05,.16,.35,.55,.75,1.05,1.35,1.7,2]){
  const p=make();assert.equal(p.actor.attentionWall(),true);const root=p.sample();
  for(let i=0;i<Math.round(age/DT);i++)p.step();
  const before=p.sample(),key=meta.attentionWall.frames[comfortMotionKey(before.comfortPose.progress,meta.attentionWall)];
  assert.equal(before.x,root.x);assert.equal(before.z,root.z);assert.equal(before.speed,0);
  p.actor.chase(0,-4);assert.deepEqual({...p.sample(),queued:before.queued},before);
  let s=p.step();for(let i=0;i<3&&s.state==='attention-wall'&&!s.comfortPose.release;i++)s=p.step();
  if(key!==0)assert.equal(s.comfortPose.release.from,key);
  for(let i=0;i<25&&s.state==='attention-wall';i++)s=p.step();assert.notEqual(s.state,'attention-wall');
 }
});
test('wall and gentle paw variants alternate only for accepted notices; direct play/resolution wins',()=>{
 const p=make(),life=createCompanionLife(p.actor,{seed:731});
 for(const expected of ['paw','wall','paw','wall']){
  assert.equal(life.notify({kind:'input'}),true);assert.equal(life.report.attention.gesture,expected);
  assert.equal(life.notify({kind:'approval'}),false);
  let seen=false;for(let i=0;i<900;i++){const s=p.step();life.update(DT);if(s.state===`attention-${expected}`)seen=true;if(seen&&!life.report.attention)break;}
  assert.ok(seen);assert.equal(life.report.attention,null);
 }
 for(const kind of ['resolve','ball','treat','tug']){
  const q=make(),l=createCompanionLife(q.actor,{seed:731});l.notify({kind:'approval',gesture:'wall'});
  let saw=false;for(let i=0;i<600;i++){q.step();l.update(DT);if(q.sample().state==='attention-wall'){saw=true;break;}}
  assert.ok(saw);for(let i=0;i<45;i++){q.step();l.update(DT);}
  if(kind==='resolve')l.clearNotice();else assert.equal(l.interact(kind),true);
  assert.equal(l.report.attention,null);for(let i=0;i<30;i++){q.step();l.update(DT);}assert.notEqual(q.sample().state,'attention-wall');assert.ok(!l.report.intent.startsWith('notify'));
 }
 assert.throws(()=>life.notify({kind:'input',gesture:'unknown'}));
});
test('public wall cue keeps projection/root fixed, draws new poses and completes without props',async()=>{
 const pet=await createPet({seed:731});try{
  assert.equal(pet.notify({kind:'input',gesture:'wall'}),true);let initial=null,seen=0,finished=false,previousContacts=null;const pixels=new Set();
  for(let i=0;i<1200;i++){
   pet.step(DT);if(i%3)continue;const f=pet.frame({columns:200,rows:72,poseFps:30});
   if(f.state.state==='attention-wall'){
    seen++;const current=[f.state.x,f.state.z,f.placement.x,f.placement.y,f.placement.size,f.placement.depth];initial??=current;assert.deepEqual(current,initial);
    pixels.add(hash(f.pixels));assert.equal(f.report.ball,null);assert.equal(f.report.tug,null);
    // The approach turn can have contact samples; the gesture must add none.
    assert.ok(previousContacts);assert.deepEqual(f.contacts,previousContacts);
    const enabled=Uint8ClampedArray.from(f.pixels),withoutContacts=pet.frame({columns:200,rows:72,poseFps:30,contactEnabled:false});
    assert.deepEqual(withoutContacts.pixels,enabled,'contact correction does not alter the gesture');
   }
   previousContacts=f.contacts;
   if(seen&&!f.report.attention){finished=true;break;}
  }
  assert.ok(seen>20&&pixels.size>=8&&finished);
 }finally{pet.dispose();}
});
