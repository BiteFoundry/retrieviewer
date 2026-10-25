// RVZ5: the approved RVQ5 rows, independently gzip-compressed for random access.
// Header/map match RVQ5; each 24-byte crop record stores x,y,w,h,offset,gzipLength.
// Offsets are relative to the end of the index. No new quantization or resampling.
import {unfilterRow} from './puppy-frame-predictive.mjs';
const HEADER=20,RECORD=24,MAX_PIXELS=16_777_216,MAX_INDEX=64*1024*1024,MAX_EXPANDED=512*1024*1024;
const fail=why=>{throw Error('Invalid indexed frames: '+why);};
const viewOf=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
export function indexedIndexLength(header){
 if(!(header instanceof Uint8Array)||header.length<HEADER||String.fromCharCode(...header.subarray(0,4))!=='RVZ5')fail('header');
 const v=viewOf(header),width=v.getUint32(4,true),height=v.getUint32(8,true),frames=v.getUint32(12,true),unique=v.getUint32(16,true);
 if(!width||!height||width>16384||height>16384||width*height>MAX_PIXELS||!frames||!unique||unique>frames)fail('shape');
 const length=HEADER+4*frames+RECORD*unique;
 if(length>MAX_INDEX)fail('index size');return length;
}
export function readIndexedIndex(bytes,fileSize=bytes.length){
 const length=indexedIndexLength(bytes);if(bytes.length<length||!Number.isSafeInteger(fileSize)||fileSize<length)fail('truncated index');
 const v=viewOf(bytes),width=v.getUint32(4,true),height=v.getUint32(8,true),frameCount=v.getUint32(12,true),uniqueCount=v.getUint32(16,true);
 const map=new Uint32Array(frameCount),used=new Uint8Array(uniqueCount),rects=new Uint32Array(uniqueCount*6);let payload=0,expanded=0;
 for(let i=0;i<frameCount;i++){const u=v.getUint32(HEADER+i*4,true);if(u>=uniqueCount)fail('map');map[i]=u;used[u]=1;}
 if(used.includes(0))fail('unreferenced frame');
 for(let u=0;u<uniqueCount;u++){
  const at=HEADER+frameCount*4+u*RECORD,r=Array.from({length:6},(_,i)=>v.getUint32(at+i*4,true)),[x,y,w,h,offset,size]=r;
  if((w===0)!==(h===0)||(!w&&(x||y))||x+w>width||y+h>height)fail('rectangle');
  if(offset!==payload||size<20)fail('offset');payload+=size;expanded+=h*(w+1);
  if(expanded>MAX_EXPANDED)fail('expanded size');rects.set(r,u*6);
 }
 if(length+payload!==fileSize)fail('file size');
 return {width,height,frameCount,uniqueCount,map,rects,indexBytes:length,expandedBytes:expanded,fileSize};
}
const display=Uint8Array.from({length:32},(_,q)=>Math.round(q*255/31));

// The host provides bounded positional reads and a synchronous gzip decoder.
// Only two reconstructed frames survive; compressed art stays on disk.
export function createIndexedFrameStore(index,{read,expand,close=()=>{},frameIndices,kernel=null}={}){
 if(typeof read!=='function'||typeof expand!=='function')fail('reader');
 const {width,height,frameCount,uniqueCount,map,rects,indexBytes}=index,n=width*height;
 const retained=frameIndices===undefined?null:new Uint8Array(frameCount);
 if(retained){if(!Array.isArray(frameIndices)||!frameIndices.length)fail('retained frames');for(const i of frameIndices){if(!Number.isInteger(i)||i<0||i>=frameCount)fail('retained frame index');retained[i]=1;}}
 const slots=[{unique:-1,frame:null},{unique:-1,frame:null}],cur=new Uint8Array(width),prev=new Uint8Array(width);
 let closed=false,decodes=0,hits=0,diskBytes=0;
 return Object.freeze({width,height,frameCount,uniqueCount,byteLength:n*frameCount,residentPixelBytes:0,
  get residentBytes(){return closed?0:map.byteLength+rects.byteLength+cur.byteLength+prev.byteLength+(retained?.byteLength??0)+slots.reduce((s,e)=>s+(e.frame?.byteLength??0),0);},
  stats(){return {decodes,hits,cachedFrames:slots.filter(s=>s.frame).length,diskReads:decodes,diskBytes,closed};},
  getFrame(i){
   if(closed)throw Error('Frame store is disposed');
   if(!Number.isInteger(i)||i<0||i>=frameCount)fail('frame index');if(retained&&!retained[i])fail('frame was not retained');
   const u=map[i];if(slots[0].unique===u){hits++;return slots[0].frame;}if(slots[1].unique===u){hits++;slots.reverse();return slots[0].frame;}
   const k=u*6,x=rects[k],y=rects[k+1],w=rects[k+2],h=rects[k+3],offset=rects[k+4],size=rects[k+5],expected=h*(w+1);
   const compressed=read(indexBytes+offset,size);if(!(compressed instanceof Uint8Array)||compressed.length!==size)fail('short read');
   const rows=expand(compressed,expected);if(!(rows instanceof Uint8Array)||rows.length!==expected)fail('expanded length');
   // Mark the evicted slot invalid before parsing: a failed decode is never a hit.
   const slot=slots.pop();slots.unshift(slot);slot.unique=-1;const frame=slot.frame??=new Uint8Array(n);frame.fill(0);prev.fill(0);
   if(kernel?.decodeRows)kernel.decodeRows(frame,rows,x,y,w,h,width);else for(let r=0,at=0;r<h;r++){
    const type=rows[at++];if(type>4)fail('filter');
    unfilterRow(type,rows,at,cur,prev,w);at+=w;
    for(let c=0;c<w;c++){
     const q=cur[c];if(q>31)fail('quantized value');frame[(y+r)*width+x+c]=display[q];
    }
    prev.set(cur.subarray(0,w));
   }
   slot.unique=u;decodes++;diskBytes+=size;return frame;
  },
  dispose(){if(closed)return;closed=true;for(const slot of slots){slot.frame=null;slot.unique=-1;}close();},
 });
}

// Portable/custom loaders retain the existing in-memory Q5 representation.
// The default local Node loader instead reads only the index and requested crops.
export async function expandIndexedArchive(bytes,expand){
 const index=readIndexedIndex(bytes),{frameCount,uniqueCount,rects,indexBytes,expandedBytes}=index;
 const out=new Uint8Array(indexBytes+expandedBytes);out.set(bytes.subarray(0,indexBytes));out.set([82,86,81,53]);const v=viewOf(out);let offset=0;
 for(let u=0;u<uniqueCount;u++){
  const k=u*6,size=rects[k+3]*(rects[k+2]+1),start=indexBytes+rects[k+4],rows=await expand(bytes.subarray(start,start+rects[k+5]),size);
  if(!(rows instanceof Uint8Array)||rows.length!==size)fail('expanded length');
  const at=HEADER+frameCount*4+u*RECORD;v.setUint32(at+16,offset,true);v.setUint32(at+20,size,true);out.set(rows,indexBytes+offset);offset+=size;
 }
 return out;
}
