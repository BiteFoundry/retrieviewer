import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {readPackedFrames} from './puppy-frame-store.mjs';
import {paperWatchProgress,PAPER_WATCH_TIMING,createPaperActor} from './puppy-paper.mjs';
import {createPaperBody} from './puppy-paper-world.mjs';
const load=name=>readPackedFrames(gunzipSync(readFileSync(new URL(name,import.meta.url))));
test('watch endpoints share the seated source; every lower body and paw pixel stays fixed',()=>{
 const seat=Uint8Array.from(load('./puppy-paper-seat-q5.bin.gz').getFrame(50)),watch=load('./puppy-paper-behaviors-q5.bin.gz');
 for(const i of [90,107,108,125])assert.deepEqual(watch.getFrame(i),seat);
 for(let i=90;i<126;i++)assert.deepEqual(watch.getFrame(i).subarray(250*320),seat.subarray(250*320),'lower body '+i);
 assert.notDeepEqual(watch.getFrame(98).subarray(0,170*320),watch.getFrame(116).subarray(0,170*320));
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
