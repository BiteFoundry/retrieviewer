import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {readPackedFrames} from './puppy-frame-store.mjs';
import {paperWatchProgress,PAPER_WATCH_TIMING,createPaperActor} from './puppy-paper.mjs';
import {createPaperBody} from './puppy-paper-world.mjs';
const load=name=>readPackedFrames(gunzipSync(readFileSync(new URL(name,import.meta.url))));
test('watch endpoints share the seated source; paw registration preserves the same ground plane',()=>{
 const seat=Uint8Array.from(load('./puppy-paper-seat-q5.bin.gz').getFrame(50)),watch=load('./puppy-paper-behaviors-q5.bin.gz');
 for(const i of [90,107,108,125])assert.deepEqual(watch.getFrame(i),seat);
 const floor=f=>{for(let y=319;y>=0;y--)for(let x=90;x<251;x++)if(f[y*320+x]>8)return y;};
 for(let i=90;i<126;i++)assert.equal(floor(watch.getFrame(i)),floor(seat),'ground plane '+i);
 assert.notDeepEqual(watch.getFrame(98).subarray(0,170*320),watch.getFrame(116).subarray(0,170*320));
});
test('all four paws stay aligned without stitching a separate lower body onto the chest',()=>{
 const seat=Uint8Array.from(load('./puppy-paper-seat-q5.bin.gz').getFrame(50)),watch=load('./puppy-paper-behaviors-q5.bin.gz');
 function score(f,cx,top,bottom,dx){
  let a=0,b=0,aa=0,bb=0,ab=0,n=0;
  for(let y=top;y<bottom;y++)for(let x=cx-11;x<=cx+11;x++){
   const av=seat[y*320+x],bv=f[y*320+x+dx];a+=av;b+=bv;aa+=av*av;bb+=bv*bv;ab+=av*bv;n++;
  }
  return (ab-a*b/n)/Math.sqrt((aa-a*a/n)*(bb-b*b/n));
 }
 for(let i=90;i<126;i++){
  const f=watch.getFrame(i);
  for(const [cx,top,bottom] of [[105,275,291],[138,278,301],[185,278,301],[218,275,291]]){
   const scores=Array.from({length:9},(_,k)=>({dx:k-4,score:score(f,cx,top,bottom,k-4)})).sort((a,b)=>b.score-a.score);
   assert.ok(Math.abs(scores[0].dx)<=2,JSON.stringify({frame:i,paw:cx,residual:scores[0].dx}));
  }
 }
});
test('all turned heads, jaws, necks and bandanas retain the original source pixels without a compositing seam',()=>{
 const watch=load('./puppy-paper-behaviors-q5.bin.gz'),hash=createHash('sha256');
 for(let i=90;i<126;i++)if(![90,107,108,125].includes(i))hash.update(watch.getFrame(i).subarray(0,230*320));
 // Independent digest of the untouched 0.0.5 source's head/neck regions,
 // not of the prepared output. A neck dissolve/translation must fail here.
 assert.equal(hash.digest('hex'),'1f6ba57a7db9311537f41846ea6a32279852de4a9b3324f8a4c0482b5ab7fbed');
});
test('watch turns, holds the gaze and returns without teleporting or scaling the actor',()=>{
 assert.equal(paperWatchProgress(0),0);assert.equal(paperWatchProgress(.6),.5);assert.equal(paperWatchProgress(1.2),.5);assert.equal(paperWatchProgress(1.9),1);
 for(let t=0;t<2;t+=.01){const p=paperWatchProgress(t);assert.ok(p>=0&&p<=1);assert.ok(p>=paperWatchProgress(Math.max(0,t-.01)));}
 const actor=createPaperActor(createPaperBody(),JSON.parse(readFileSync(new URL('./puppy-stride-meta.json',import.meta.url))),{manualTricks:true,walkTransitions:true});
 actor.sit();for(let i=0;i<240;i++)actor.update(1/60);
 const neutral=actor.sample(4);assert.equal(actor.look('left'),true);
 for(let i=0;i<PAPER_WATCH_TIMING.total*60+5;i++){actor.update(1/60);const s=actor.sample(4+i/60);assert.equal(s.x,neutral.x);assert.equal(s.z,neutral.z);assert.equal(s.seatProgress,1);}
 assert.equal(actor.state,'idle');
});
