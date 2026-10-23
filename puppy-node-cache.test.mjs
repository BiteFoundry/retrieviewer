import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateRawSync,inflateRawSync,gunzipSync} from 'node:zlib';
import {readFileSync} from 'node:fs';
import {readPackedFrames,packFrames} from './puppy-frame-store.mjs';
import {encodePredictiveFrames} from './puppy-frame-predictive.mjs';
import {getPetAssetFiles} from './retrieviewer.mjs';
const codec={compress:bytes=>deflateRawSync(bytes,{level:1}),expand:(bytes,size)=>inflateRawSync(bytes,{maxOutputLength:size})};

test('Node compressed crops reconstruct every packaged frame exactly with only two cached rasters',()=>{
 let before=0,after=0,frames=0;
 for(const name of getPetAssetFiles().filter(n=>n.endsWith('.bin.gz'))){
  const input=gunzipSync(readFileSync(new URL(name,import.meta.url))),portable=readPackedFrames(input),compressed=readPackedFrames(input,{codec});
  before+=portable.residentPixelBytes;after+=compressed.residentPixelBytes;
  for(let i=0;i<portable.frameCount;i++){assert.deepEqual(compressed.getFrame(i),portable.getFrame(i),name+' '+i);frames++;}
  assert.equal(compressed.stats().cachedFrames,2);
 }
 assert.ok(frames>2000);assert.ok(after<before*.45,JSON.stringify({before,after}));
});

test('compressed stores validate eagerly, support empty crops, duplicates and selective retention',()=>{
 const w=7,h=5,n=w*h,raw=new Uint8Array(n*4);raw.fill(255,n,n*2);raw.fill(255,n*3);
 const input=encodePredictiveFrames(packFrames(raw,w,h,4)),small=readPackedFrames(input,{codec,frameIndices:[0,1,3]});
 assert.deepEqual(small.getFrame(0),raw.subarray(0,n));
 assert.deepEqual(small.getFrame(1),raw.subarray(n,n*2));
 assert.equal(small.getFrame(1),small.getFrame(3));
 assert.throws(()=>small.getFrame(2),/not retained/);
 // First nonempty filtered row, invalid filter: rejection must happen at load,
 // not unexpectedly in a future synchronous host frame() call.
 const broken=Uint8Array.from(input),v=new DataView(broken.buffer),data=20+4*v.getUint32(12,true)+24*v.getUint32(16,true);
 broken[data]=9;assert.throws(()=>readPackedFrames(broken,{codec}),/filter/);
});
