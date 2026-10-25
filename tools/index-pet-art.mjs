// Offline-only repack. Retains every approved RVQ5 byte after decompression.
import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync,gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {expandIndexedArchive} from '../puppy-frame-indexed.mjs';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url),pkg=JSON.parse(readFileSync(new URL('package.json',root))),files=pkg.files.filter(f=>f.endsWith('-q5.rvz'));
const entries=[];const sha=b=>createHash('sha256').update(b).digest('hex');
for(const target of files){
 const source=target.replace(/\.rvz$/,'.bin.gz'),gzip=readFileSync(new URL(source,root)),raw=gunzipSync(gzip),v=new DataView(raw.buffer,raw.byteOffset,raw.byteLength);
 assert.equal(raw.subarray(0,4).toString(),'RVQ5');
 const frames=v.getUint32(12,true),unique=v.getUint32(16,true),base=20+4*frames+24*unique,index=Uint8Array.from(raw.subarray(0,base)),iv=new DataView(index.buffer),chunks=[];let offset=0;
 index.set([82,86,90,53]);
 for(let u=0;u<unique;u++){
  const at=20+4*frames+24*u,start=v.getUint32(at+16,true),length=v.getUint32(at+20,true),chunk=gzipSync(raw.subarray(base+start,base+start+length),{level:9});
  iv.setUint32(at+16,offset,true);iv.setUint32(at+20,chunk.length,true);offset+=chunk.length;chunks.push(chunk);
 }
 const out=Buffer.concat([index,...chunks]),restored=await expandIndexedArchive(out,b=>gunzipSync(b));assert.deepEqual(Buffer.from(restored),raw);
 if(process.argv.includes('--check'))assert.deepEqual(readFileSync(new URL(target,root)),out);else writeFileSync(new URL(target,root),out);
 entries.push({file:target,bytes:out.length,indexBytes:base,frames,uniqueFrames:unique,sha256:sha(out),source,sourceSha256:sha(gzip),restoredRvq5Sha256:sha(raw)});
}
const manifest=JSON.stringify({version:1,format:'RVZ5',pixels:'Exact approved RVQ5 rows; no quantization, frame removal or resampling',entries},null,2)+'\n';
if(process.argv.includes('--check'))assert.equal(readFileSync(new URL('pet-indexed-manifest.json',root),'utf8'),manifest);else writeFileSync(new URL('pet-indexed-manifest.json',root),manifest);
console.log(JSON.stringify({files:entries.length,bytes:entries.reduce((s,e)=>s+e.bytes,0),indexBytes:entries.reduce((s,e)=>s+e.indexBytes,0),exactRvq5RoundTrip:true}));
