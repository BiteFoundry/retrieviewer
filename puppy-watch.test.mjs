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
test('turned faces keep original pixels; the connected neck/body uses one coordinate warp, not compositing',()=>{
 const watch=load('./puppy-paper-behaviors-q5.bin.gz'),hash=createHash('sha256');
 for(let i=90;i<126;i++)if(![90,107,108,125].includes(i))hash.update(watch.getFrame(i).subarray(0,180*320));
 // The neck must now join a fixed-volume chest spatially. Protect the face,
 // not the inflated source chest that the old y230 digest accidentally froze.
 assert.equal(hash.digest('hex'),'39dce09ec8ce000a792a31b1d2670cdec753a19f9d0f13fad72b651361ac3259');
 const registration=JSON.parse(readFileSync(new URL('./pet-q5-manifest.json',import.meta.url))).entries['puppy-paper-behaviors'].watchRegistration;
 assert.equal(registration.bodyCompositing,false);
});
test('all watch frames keep seated chest area/width within 2% and center within one source pixel',()=>{
 const seat=Uint8Array.from(load('./puppy-paper-seat-q5.bin.gz').getFrame(50)),watch=load('./puppy-paper-behaviors-q5.bin.gz');
 function torso(f){let area=0,width=0,center=0;
  for(let y=205;y<=230;y++){let left=320,right=-1;
   for(let x=0;x<320;x++)if(f[y*320+x]>24){area++;center+=x;left=Math.min(left,x);right=Math.max(right,x);}
   width+=right-left+1;
  }
  return{area,width,cx:center/area};
 }
 const base=torso(seat);
 for(let i=90;i<126;i++){
  const actual=torso(watch.getFrame(i));
  for(const key of ['area','width'])assert.ok(Math.abs(actual[key]/base[key]-1)<=.02,JSON.stringify({frame:i,key,ratio:actual[key]/base[key]}));
  assert.ok(Math.abs(actual.cx-base.cx)<=1,'torso center '+i);
 }
 // Include the belly/hips near the handoff to the four-paw field as well;
 // protecting the narrow chest alone previously missed swelling farther down.
 const area=f=>{let n=0;for(let y=205;y<=270;y++)for(let x=0;x<320;x++)if(f[y*320+x]>24)n++;return n;};
 const baseline=area(seat);
 for(let i=90;i<126;i++)assert.ok(Math.abs(area(watch.getFrame(i))/baseline-1)<=.03,'whole torso area '+i);
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
