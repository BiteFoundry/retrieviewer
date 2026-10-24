import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {readPackedFrames} from './puppy-frame-store.mjs';
import {createComfortSpriteSampler} from './puppy-comfort-sprites.mjs';
import {createPaperActor,createPaperComfortTimings} from './puppy-paper.mjs';
import {createPaperBody} from './puppy-paper-world.mjs';
import {createCompanionLife} from './puppy-companion-life.mjs';
import {createSnappyTrickTimings} from './puppy-paper-trick-timing.mjs';
import {createPet} from './retrieviewer.mjs';
const json=name=>JSON.parse(readFileSync(new URL(name,import.meta.url)));
const stride=json('./puppy-stride-meta.json'),actions=json('./puppy-paper-actions-v9.json');

test('tiny tug keys share the exact original seat endpoint and bounded source cache',()=>{
 const encoded=gunzipSync(readFileSync(new URL('./puppy-companion-comfort-q5.bin.gz',import.meta.url)));
 const bytes=readPackedFrames(encoded),original=readPackedFrames(encoded,{frameIndices:Array.from({length:13},(_,i)=>i)});
 const seat=readPackedFrames(gunzipSync(readFileSync(new URL('./puppy-paper-seat-q5.bin.gz',import.meta.url))));
 const sample=createComfortSpriteSampler(bytes,json('./puppy-companion-comfort.json'));
 assert.ok(original.residentPixelBytes<350_000,'adding separate fetch keys must not inflate tug/sleep retained art');
 const fetchOnly=readPackedFrames(encoded,{frameIndices:Array.from({length:37},(_,i)=>i)});
 assert.ok(fetchOnly.residentPixelBytes-original.residentPixelBytes<750_000,'accepted fetch source increment stays bounded');
 const trotOnly=readPackedFrames(encoded,{frameIndices:Array.from({length:45},(_,i)=>i)});
 assert.ok(trotOnly.residentPixelBytes-fetchOnly.residentPixelBytes<300_000,'the original eight trot/gather keys stay bounded independently of attention art');
 const neutral=Uint8Array.from(sample({clip:'tug',progress:0}).filter((_,i)=>i%4===0));
 assert.deepEqual(neutral,seat.getFrame(50));
 for(let i=0;i<181;i++){const rgba=sample({clip:'tug',progress:i/180});assert.equal(rgba.length,320*320*4);}
 assert.ok(bytes.stats().cachedFrames<=2);
 assert.deepEqual(Uint8Array.from(sample({clip:'tug',progress:1}).filter((_,i)=>i%4===0)),neutral);
 assert.throws(()=>sample({clip:'nope',progress:0}));
 assert.throws(()=>sample({clip:'tug',progress:NaN}));
});

test('long belly/sleep holds recover promptly for ball, hand-fed treat and tug',()=>{
 for(const name of ['belly','sleep'])for(const kind of ['ball','treat','tug']){
  const actor=createPaperActor(createPaperBody(),stride,{manualTricks:true,walkTransitions:true,trickTimings:createSnappyTrickTimings(actions),comfortTimings:createPaperComfortTimings(actions)});
  const life=createCompanionLife(actor,{seed:731});let clock=0;
  const step=()=>{clock+=1/60;actor.update(1/60);life.update(1/60);return actor.sample(clock);};
  actor[name](name==='sleep'?80:20);let found=false;
  for(let i=0;i<600;i++){
   const s=step();if(s.state===name&&(name==='sleep'||s.actionProgress>.44)){found=true;break;}
  }
  assert.ok(found,name);assert.equal(life.interact(kind),true);assert.equal(life.interact(kind),false,'one interaction at a time');
  let reacted=false;
  for(let i=0;i<720;i++){
   const s=step();
   if(kind==='ball'&&s.state==='run'||kind==='treat'&&life.report.intent==='chew'||kind==='tug'&&s.state==='tug'){reacted=true;break;}
  }
  assert.ok(reacted,name+' -> '+kind+' must not wait the entire hold');
 }
});

test('public tug interaction holds fixed root/projection and completes with cooldown',async()=>{
 const p=await createPet({seed:731});try{
  assert.equal(p.interact('tug'),true);let held=null,count=0,finished=false;
  for(let i=0;i<1200;i++){
   p.step(1/60);if(i%12)continue;
   const f=p.frame({columns:120,rows:60});
   if(f.state.state==='tug'){
    const current={x:f.state.x,z:f.state.z,size:f.placement.size,left:f.placement.x,floor:f.placement.y};
    if(!held)held=current;assert.deepEqual(current,held);assert.equal(f.state.speed,0);assert.equal(f.report.tug.grip,1);count++;
   }
   if(count&&!f.report.busy){assert.ok(f.report.cooldowns.tug>0);assert.equal(f.report.tug,null);finished=true;break;}
  }
  assert.ok(count>10&&finished);assert.equal(p.interact('tug'),false);
 }finally{p.dispose();}
});

test('repeated load/render/tug/dispose leaves no pet arrays or background handles',()=>{
 const module=new URL('./retrieviewer.mjs',import.meta.url).href;
 // Let native gzip buffers and async frames leave the event loop before checking
 // retained arrays. This is not a promise of synchronous RSS return on dispose.
 const program=`const {createPet}=await import(${JSON.stringify(module)});const samples=[];for(let k=0;k<4;k++){await(async()=>{const p=await createPet({seed:731});p.interact('tug');for(let i=0;i<480;i++){p.step(1/60);if(i%120===0)p.frame({columns:80,rows:40});}p.dispose();})();for(let j=0;j<8;j++){await new Promise(r=>setTimeout(r,10));global.gc();}samples.push(process.memoryUsage().arrayBuffers);}console.log(JSON.stringify({samples,resources:process.getActiveResourcesInfo().filter(k=>!['PipeWrap'].includes(k))}));`;
 const result=JSON.parse(execFileSync(process.execPath,['--expose-gc','--input-type=module','-e',program],{encoding:'utf8',timeout:15000}));
 for(const n of result.samples)assert.ok(n<2_000_000,JSON.stringify(result));
 assert.deepEqual(result.resources,[]);
});
