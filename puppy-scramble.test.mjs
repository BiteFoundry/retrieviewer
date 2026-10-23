import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPaperActor} from './puppy-paper.mjs';
import {createPaperBody} from './puppy-paper-world.mjs';
import {createComfortSpriteSampler} from './puppy-comfort-sprites.mjs';
const info=JSON.parse(readFileSync(new URL('./puppy-stride-meta.json',import.meta.url)));

test('scramble is explicitly asset-gated, keeps its ground root and safely drains a queued command',()=>{
 const old=createPaperActor(createPaperBody(),info,{manualTricks:true,walkTransitions:true});
 assert.equal(old.canScramble,false);assert.equal(old.scramble(),false);
 const a=createPaperActor(createPaperBody(),info,{manualTricks:true,walkTransitions:true,scrambleSeconds:1.12});
 a.go(.55,0);let clock=0;
 for(let i=0;i<600;i++){clock+=1/60;a.update(1/60);if(a.state==='idle')break;}
 assert.equal(a.state,'idle');const before=a.sample(clock);
 assert.equal(a.canScramble,true);assert.equal(a.scramble(),true);a.go(-.3,0);
 let samples=0,done=false;
 for(let i=0;i<600;i++){
  clock+=1/60;a.update(1/60);const s=a.sample(clock);
  if(s.state==='scramble'){
   assert.equal(s.x,before.x);assert.equal(s.z,before.z);assert.equal(s.speed,0);
   assert.equal(s.comfortPose.clip,'scramble');assert.ok(s.comfortPose.progress>=0&&s.comfortPose.progress<=1);samples++;
  }
  if(a.state==='idle'&&Math.abs(s.x+.3)<.002){done=true;break;}
 }
 assert.ok(samples>30&&done);
 assert.throws(()=>createPaperActor(createPaperBody(),info,{scrambleSeconds:Infinity}));
});

test('scramble keys borrow the existing output; malformed timing is rejected eagerly',()=>{
 const n=320*320,raw=new Uint8Array(n*19);for(let i=0;i<19;i++)raw.fill(i,i*n,(i+1)*n);
 const meta={version:3,width:320,height:320,frames:19,sleep:{side:9},scramble:{frames:[18,13,14,15,16,17,18],times:[0,.1,.24,.4,.62,.84,1.12],duration:1.12}};
 const output=new Uint8ClampedArray(n*4),sample=createComfortSpriteSampler(raw,meta,output);
 for(const [progress,tone] of [[0,18],[.15,13],[.3,14],[.4,15],[.6,16],[.8,17],[1,18]]){
  assert.equal(sample({clip:'scramble',progress}),output);assert.equal(output[0],tone);assert.equal(output[3],255);
 }
 assert.equal(sample({clip:'sleep',variant:'side'})[0],9);
 assert.equal(sample({clip:'tug',progress:0})[0],0);
 for(const scramble of [{...meta.scramble,times:[0,.2,.1,.4,.62,.84,1.12]},{...meta.scramble,frames:[18,13,14,15,16,17,50]},{...meta.scramble,duration:NaN}])assert.throws(()=>createComfortSpriteSampler(raw,{...meta,scramble}),/metadata/);
 assert.throws(()=>sample({clip:'scramble',progress:NaN}));
});
