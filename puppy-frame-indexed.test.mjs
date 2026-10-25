import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readPackedFrames} from './puppy-frame-store.mjs';
import {openFrameFile} from './puppy-frame-file.mjs';
import {readIndexedIndex,expandIndexedArchive,createIndexedFrameStore} from './puppy-frame-indexed.mjs';
const root=new URL('./',import.meta.url),manifest=JSON.parse(readFileSync(new URL('pet-indexed-manifest.json',root)));

test('shared pets close all frame files on the last disposal and recover from a partial open failure',()=>{
 const script=`
 import assert from 'node:assert/strict';import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';
 const open=fs.openSync,close=fs.closeSync,read=fs.readSync,live=new Set();let bytes=0,fail=false;
 fs.openSync=function(path,...args){if(String(path).endsWith('.rvz')){if(fail&&live.size===2)throw Error('fixture open failure');const fd=open.call(this,path,...args);live.add(fd);return fd;}return open.call(this,path,...args);};
 fs.closeSync=function(fd){live.delete(fd);return close.call(this,fd);};
 fs.readSync=function(fd,...args){const n=read.call(this,fd,...args);if(live.has(fd))bytes+=n;return n;};syncBuiltinESMExports();
 const {createPet}=await import(${JSON.stringify(new URL('retrieviewer.mjs',root).href)});
 fail=true;await assert.rejects(createPet({seed:1}),/fixture open failure/);assert.equal(live.size,0,'failed load closes previous families');fail=false;bytes=0;
 const [a,b]=await Promise.all([createPet({seed:1}),createPet({seed:2})]);assert.equal(live.size,9);assert.ok(bytes<60000,'startup reads indices only');
 const previous=bytes;a.frame({columns:40,rows:12});assert.ok(bytes>previous,'frame request reads art');const painted=bytes;a.frame({columns:40,rows:12});assert.equal(bytes,painted,'held frames do not reread disk');
 a.dispose();assert.equal(live.size,9);b.frame({columns:40,rows:12});b.dispose();assert.equal(live.size,0);b.dispose();
 for(let i=0;i<4;i++){const c=await createPet({seed:i});c.frame({columns:20,rows:6});c.dispose();assert.equal(live.size,0);}
 console.log('file lifecycle passed');`;
 assert.match(execFileSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8',timeout:20000}),/file lifecycle passed/);
});

test('every indexed frame is pixel-identical to the approved dog, including random seeks and duplicate references',()=>{
 let frames=0,resident=0;
 for(const entry of manifest.entries){
  const gzip=readFileSync(new URL(entry.source,root));assert.equal(createHash('sha256').update(gzip).digest('hex'),entry.sourceSha256);
  const old=readPackedFrames(gunzipSync(gzip)),current=openFrameFile(new URL(entry.file,root));
  try{
   assert.equal(current.stats().diskReads,0,'opening the index reads no artwork');assert.equal(current.residentPixelBytes,0);
   for(let i=0;i<old.frameCount;i++){assert.deepEqual(current.getFrame(i),old.getFrame(i),entry.file+' '+i);frames++;}
   for(const i of [0,old.frameCount-1,1,0,Math.floor(old.frameCount/2),1])assert.deepEqual(current.getFrame(i),old.getFrame(i));
   assert.equal(current.stats().cachedFrames,2);resident+=current.residentBytes;
  }finally{current.dispose();current.dispose();}
  assert.equal(current.stats().closed,true);assert.equal(current.residentBytes,0);assert.throws(()=>current.getFrame(0),/disposed/);
 }
 assert.equal(frames,2401);assert.ok(resident<2_500_000,'even visiting every family keeps bounded decoded frames');
});

test('portable/custom loading restores exact RVQ5 archive bytes',async()=>{
 for(const entry of manifest.entries){
  const bytes=readFileSync(new URL(entry.file,root)),decoded=await expandIndexedArchive(bytes,b=>gunzipSync(b));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);
  assert.equal(createHash('sha256').update(decoded).digest('hex'),entry.restoredRvq5Sha256);
 }
});

test('indexed file validates its index and accessed payload, closes files on failed opens, and rejects disposed/filtered frames',()=>{
 const entry=manifest.entries.at(-1),bytes=readFileSync(new URL(entry.file,root)),index=readIndexedIndex(bytes);
 const make=(data=bytes,frameIndices)=>createIndexedFrameStore(readIndexedIndex(data),{read:(at,n)=>data.subarray(at,at+n),expand:(b,n)=>gunzipSync(b,{maxOutputLength:Math.max(1,n)}),frameIndices});
 const store=make(bytes,[0,1]);assert.deepEqual(store.getFrame(0),make().getFrame(0));assert.throws(()=>store.getFrame(2),/not retained/);
 for(const bad of [-1,NaN,index.frameCount])assert.throws(()=>store.getFrame(bad),/frame index/);store.dispose();
 for(const frameIndices of [[],null,'all',[-1],[index.frameCount]])assert.throws(()=>make(bytes,frameIndices),/retained/);
 for(const [offset,value] of [[0,0],[4,0],[12,0],[20,255],[20+index.frameCount*4+16,255]]){
  const corrupt=Uint8Array.from(bytes);corrupt[offset]=value;assert.throws(()=>readIndexedIndex(corrupt),/indexed frames/);
 }
 assert.throws(()=>readIndexedIndex(bytes.subarray(0,bytes.length-1)),/file size/);
 const corrupt=Uint8Array.from(bytes),u=index.map[0],start=index.indexBytes+index.rects[u*6+4];corrupt[start]=0;
 assert.throws(()=>make(corrupt).getFrame(0));
 const short=createIndexedFrameStore(index,{read:()=>new Uint8Array(0),expand:gunzipSync});assert.throws(()=>short.getFrame(0),/short read/);short.dispose();
 const temp=mkdtempSync(join(tmpdir(),'retrieviewer-index-test-')),path=join(temp,'bad.rvz');
 try{writeFileSync(path,bytes.subarray(0,23));assert.throws(()=>openFrameFile(path));rmSync(path);assert.equal(readFileSync(new URL(entry.file,root)).length,entry.bytes);}finally{rmSync(temp,{recursive:true,force:true});}
});
