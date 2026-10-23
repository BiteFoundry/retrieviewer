import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {readPackedFrames} from './puppy-frame-store.mjs';
import {paperWatchProgress,PAPER_WATCH_TIMING,createPaperActor} from './puppy-paper.mjs';
import {createPaperBody} from './puppy-paper-world.mjs';
const load=name=>readPackedFrames(gunzipSync(readFileSync(new URL(name,import.meta.url))));

test('watch endpoints share the seated source and authored paws stay on the ground plane',()=>{
 const seat=Uint8Array.from(load('./puppy-paper-seat-q5.bin.gz').getFrame(50)),watch=load('./puppy-paper-behaviors-q5.bin.gz');
 for(const i of [90,107,108,125])assert.deepEqual(watch.getFrame(i),seat);
 const floor=f=>{for(let y=319;y>=0;y--)for(let x=90;x<251;x++)if(f[y*320+x]>8)return y;};
 // A paw can lift one source pixel during weight transfer. Never copy frozen
 // paw patches into new drawings merely to force identical raster bounds.
 for(let i=90;i<126;i++)assert.ok(Math.abs(floor(watch.getFrame(i))-floor(seat))<=1,'floor '+i);
 assert.notDeepEqual(watch.getFrame(98).subarray(0,170*320),watch.getFrame(116).subarray(0,170*320));
});

test('approved whole-body redraw replaces only watch frames, without anatomical compositing or warps',()=>{
 const watch=load('./puppy-paper-behaviors-q5.bin.gz'),other=createHash('sha256'),turned=createHash('sha256');
 for(let i=0;i<watch.frameCount;i++)(i<90||i>=126?other:turned).update(watch.getFrame(i));
 assert.equal(other.digest('hex'),'47cd7eee60e3e71a15bd59a02cd7288364754a295fb9b2e4a02f0333f0e11072');
 // Freeze the owner's accepted WHOLE drawing, not just a protected face with
 // an unreviewed chest underneath. Numerical tests do not grant visual approval.
 assert.equal(turned.digest('hex'),'b53d5487f3ed70e98ee5a9e5162634b4323bf6215a62e3a1d0eefc542fd14081');
 const registration=JSON.parse(readFileSync(new URL('./pet-q5-manifest.json',import.meta.url))).entries['puppy-paper-behaviors'].watchRegistration;
 assert.equal(registration.wholeBodyArt,true);
 for(const key of ['bodyCompositing','collarMatte','nonlinearWarp','perKeyScale','runtimeCompositing'])assert.equal(registration[key],false,key);
});

test('redrawn archive manifest describes the encoded and decoded release bytes',()=>{
 const entry=JSON.parse(readFileSync(new URL('./pet-q5-manifest.json',import.meta.url))).entries['puppy-paper-behaviors'];
 const gzip=readFileSync(new URL(entry.file,import.meta.url)),encoded=gunzipSync(gzip),store=readPackedFrames(encoded),hash=createHash('sha256');
 for(let i=0;i<store.frameCount;i++)hash.update(store.getFrame(i));
 assert.equal(entry.gzipBytes,gzip.length);assert.equal(entry.encodedBytes,encoded.length);
 assert.equal(entry.uniqueFrames,store.uniqueCount);assert.equal(entry.frames,store.frameCount);
 assert.equal(entry.encodedSha256,createHash('sha256').update(encoded).digest('hex'));
 assert.equal(entry.quantizedSha256,hash.digest('hex'));
});

test('whole-body watch includes lower-body weight transfer while retaining its authored mass',()=>{
 const seat=Uint8Array.from(load('./puppy-paper-seat-q5.bin.gz').getFrame(50)),watch=load('./puppy-paper-behaviors-q5.bin.gz');
 const area=f=>{let n=0;for(let y=205;y<=270;y++)for(let x=0;x<320;x++)if(f[y*320+x]>24)n++;return n;};
 const baseline=area(seat);
 // Accepted silhouette varies roughly -6%..+5%, not runtime scale. This is a
 // regression bound for that approved art, not a reason to warp other drawings.
 for(let i=90;i<126;i++)assert.ok(Math.abs(area(watch.getFrame(i))/baseline-1)<=.07,'whole torso area '+i);
 for(const i of [98,116])assert.notDeepEqual(watch.getFrame(i).subarray(205*320,301*320),seat.subarray(205*320,301*320),'lower body is not a frozen layer');
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
