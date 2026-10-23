import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {packFrames,readPackedFrames} from './puppy-frame-store.mjs';
import {encodePredictiveFrames,readPredictiveFrames} from './puppy-frame-predictive.mjs';

test('selective Q5 retention is exact for retained duplicates, partial bits and two-slot LRU',()=>{
 const w=11,h=7,n=w*h,raw=Uint8Array.from({length:n*8},(_,i)=>(i*31+i%11*9)%256);
 raw.copyWithin(n*6,0,n);
 const encoded=encodePredictiveFrames(packFrames(raw,w,h,8)),full=readPredictiveFrames(encoded),small=readPredictiveFrames(encoded,{frameIndices:[0,2,6]});
 assert.ok(small.residentPixelBytes<full.residentPixelBytes/2);
 for(const index of [0,2,6,0,6,2,0])assert.deepEqual(small.getFrame(index),full.getFrame(index));
 assert.equal(small.stats().cachedFrames,2);
 for(const index of [1,3,7])assert.throws(()=>small.getFrame(index),/not retained/);
 for(const frameIndices of [[],[-1],[8],[NaN],null,'all'])assert.throws(()=>readPredictiveFrames(encoded,{frameIndices}),/retained/);
});

test('actual active interaction pixels stay exact while unused art is not resident',()=>{
 const info=JSON.parse(readFileSync(new URL('./puppy-companion-interactions-v3.json',import.meta.url))),encoded=gunzipSync(readFileSync(new URL('./puppy-companion-interactions-v3-q5.bin.gz',import.meta.url)));
 const frameIndices=[...new Set(Object.values(info.clips).flatMap(list=>list.flatMap(p=>Array.from({length:info.samples},(_,s)=>p*info.samples+s))))];
 const full=readPackedFrames(encoded),small=readPackedFrames(encoded,{frameIndices});
 for(const index of frameIndices)assert.deepEqual(small.getFrame(index),full.getFrame(index));
 assert.ok(full.residentPixelBytes-small.residentPixelBytes>4_400_000);
 assert.ok(small.residentPixelBytes<600_000);
});
