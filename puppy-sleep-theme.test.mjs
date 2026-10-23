import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {readPackedFrames} from './puppy-frame-store.mjs';
import {createComfortSpriteSampler} from './puppy-comfort-sprites.mjs';
import {createPaperActor} from './puppy-paper.mjs';
import {createPaperBody} from './puppy-paper-world.mjs';
import {createCompanionLife} from './puppy-companion-life.mjs';
import {parseArguments} from './retrieviewer-cli.mjs';
import {createFramePump} from './integrations/windows-overlay/protocol.mjs';
const json=name=>JSON.parse(readFileSync(new URL(name,import.meta.url)));
test('four sleeping keys and mirrored side reuse one fixed-size scratch',()=>{
 const info=json('./puppy-companion-comfort.json');
 const store=readPackedFrames(gunzipSync(readFileSync(new URL('./puppy-companion-comfort-q5.bin.gz',import.meta.url))));
 const scratch=new Uint8ClampedArray(320*320*4),sample=createComfortSpriteSampler(store,info,scratch);
 assert.ok(info.gzipBytes-103549<30_000);assert.ok(store.residentPixelBytes-291337<55_000);
 for(const variant of Object.keys(info.sleep)){
  const a=Uint8ClampedArray.from(sample({clip:'sleep',variant}));
  assert.equal(sample({clip:'sleep',variant,right:true}),scratch);
  for(let y=0;y<320;y++)for(let x=0;x<320;x++)assert.equal(scratch[(y*320+x)*4],a[(y*320+319-x)*4]);
 }
 assert.ok(store.stats().cachedFrames<=2);
 assert.throws(()=>sample({clip:'sleep',variant:'missing'}));
});
test('quiet puppies nap within three minutes across seeds and keep their sleep pose',()=>{
 const info=json('./puppy-stride-meta.json');
 for(let seed=0;seed<24;seed++){
  const actor=createPaperActor(createPaperBody(),info,{manualTricks:true,walkTransitions:true}),life=createCompanionLife(actor,{seed});
  let first=null,held=null,sleepSeconds=0;
  for(let i=0;i<600*30;i++){
   actor.update(1/30);life.update(1/30);const s=actor.sample(i/30);
   if(s.state==='sleep'){
    first??=i/30;sleepSeconds+=1/30;
    if(!held)held={...s.comfortPose};else assert.deepEqual(s.comfortPose,held);
   }else held=null;
  }
  assert.ok(first!==null&&first<180,JSON.stringify({seed,first}));
  assert.ok(sleepSeconds>90,JSON.stringify({seed,sleepSeconds}));
 }
});
test('sleep painter ticks less while life advances, interaction invalidates immediately',()=>{
 let now=0,steps=0,paints=0;const pet={step(){steps++;},frame(){paints++;return{columns:1,rows:1,text:'⣿',state:{state:'sleep'}};},interact:()=>true,dispose(){}};
 const pump=createFramePump({pet,send(){},now:()=>now});
 pump.viewport({type:'viewport',revision:1,visible:true,columns:1,rows:1,cellWidth:8,cellHeight:16});
 for(let i=0;i<60;i++){now=i*1000/30;pump.tick();pump.ack();}
 assert.equal(steps,60);assert.ok(paints<=10);
 pump.interact('ball');pump.tick();assert.equal(paints,11);pump.dispose();
});
test('desktop ink presets are strict and do not alter the plain Braille engine',()=>{
 for(const ink of ['cream','gold','dark'])assert.equal(parseArguments(['desktop','--ink',ink]).options.ink,ink);
 for(const args of [['desktop','--ink'],['desktop','--ink','white'],['desktop-stop','--ink','gold']])assert.throws(()=>parseArguments(args));
});
