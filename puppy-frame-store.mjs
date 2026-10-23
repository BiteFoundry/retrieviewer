// Lossless packed grayscale frames (RVF1). Exact duplicate frames are stored
// once and each unique frame keeps only the bounding rectangle of its nonzero
// pixels; every other pixel is exactly zero. No quantization or resampling.
//
// Little-endian layout:
//  0 'RVF1'  4 u32 width  8 u32 height  12 u32 logicalFrameCount  16 u32 uniqueCount
//  20 u32[logicalFrameCount] logical -> unique index
//  then uniqueCount records of u32 x,y,w,h,offset,length (offset into pixel data)
//  then the cropped row-major pixels of every unique frame, contiguous in order.
import {isPredictiveFrames,readPredictiveFrames} from './puppy-frame-predictive.mjs';
const MAGIC=[0x52,0x56,0x46,0x31],HEADER=20,RECORD=24,MAX_SIDE=16384;
const stores=new WeakSet();

export function isPackedFrames(value){return stores.has(value);}
export function isGrayFrameSource(value){return value instanceof Uint8Array||stores.has(value);}

const fnv=(bytes,start,end)=>{let h=0x811c9dc5;for(let i=start;i<end;i++)h=Math.imul(h^bytes[i],0x01000193);return h>>>0;};
const sameBytes=(bytes,a,b,n)=>{for(let i=0;i<n;i++)if(bytes[a+i]!==bytes[b+i])return false;return true;};

// Pack a legacy concatenated raster (frameCount full width*height frames).
export function packFrames(raw,width,height,frameCount){
 checkShape(width,height,frameCount);
 const n=width*height;
 if(!(raw instanceof Uint8Array)||raw.length!==n*frameCount)throw Error('Invalid gray frames: byte length');
 const map=new Uint32Array(frameCount),firsts=[],rects=[],buckets=new Map();let total=0;
 for(let f=0;f<frameCount;f++){
  const start=f*n,h=fnv(raw,start,start+n),bucket=buckets.get(h);
  const hit=bucket?.find(u=>sameBytes(raw,firsts[u]*n,start,n));
  if(hit!==undefined){map[f]=hit;continue;}
  let x0=width,y0=height,x1=-1,y1=-1;
  for(let y=0;y<height;y++){const row=start+y*width;for(let x=0;x<width;x++)if(raw[row+x]){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;y1=y;}}
  const rect=x1<0?{x:0,y:0,w:0,h:0}:{x:x0,y:y0,w:x1-x0+1,h:y1-y0+1};
  rect.offset=total;rect.length=rect.w*rect.h;total+=rect.length;
  map[f]=firsts.length;if(bucket)bucket.push(firsts.length);else buckets.set(h,[firsts.length]);firsts.push(f);rects.push(rect);
 }
 const unique=firsts.length,data=HEADER+4*frameCount+RECORD*unique,out=new Uint8Array(data+total),view=new DataView(out.buffer);
 out.set(MAGIC,0);[width,height,frameCount,unique].forEach((v,i)=>view.setUint32(4+4*i,v,true));
 for(let f=0;f<frameCount;f++)view.setUint32(HEADER+4*f,map[f],true);
 rects.forEach((r,u)=>{
  const at=HEADER+4*frameCount+RECORD*u;[r.x,r.y,r.w,r.h,r.offset,r.length].forEach((v,i)=>view.setUint32(at+4*i,v,true));
  const start=firsts[u]*n;for(let y=0;y<r.h;y++){const src=start+(r.y+y)*width+r.x;out.set(raw.subarray(src,src+r.w),data+r.offset+y*r.w);}
 });
 return out;
}

function checkShape(width,height,frameCount){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>MAX_SIDE||height>MAX_SIDE)throw Error('Invalid gray frames: dimensions');
 if(!Number.isInteger(frameCount)||frameCount<1||frameCount>0xffffffff||!Number.isSafeInteger(width*height*frameCount))throw Error('Invalid gray frames: frame count');
}

// Parse and fully validate an RVF1 store. The returned store keeps `bytes`
// resident (crops only) and reconstructs at most two full frames at a time.
// A returned frame is valid until two other unique frames have been requested.
// An 'RVQ5' store (lossy 32-level comparison codec) is delegated and branded.
export function readPackedFrames(bytes){
 if(!(bytes instanceof Uint8Array))throw Error('Invalid packed frames: bytes');
 if(isPredictiveFrames(bytes)){const store=readPredictiveFrames(bytes);stores.add(store);return store;}
 if(bytes.length<HEADER||MAGIC.some((v,i)=>bytes[i]!==v))throw Error('Invalid packed frames: magic');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),u32=at=>view.getUint32(at,true);
 const width=u32(4),height=u32(8),frameCount=u32(12),unique=u32(16);
 try{checkShape(width,height,frameCount);}catch{throw Error('Invalid packed frames: header');}
 if(unique<1||unique>frameCount)throw Error('Invalid packed frames: unique count');
 const data=HEADER+4*frameCount+RECORD*unique,n=width*height;
 if(bytes.length<data)throw Error('Invalid packed frames: truncated');
 const map=new Uint32Array(frameCount),used=new Uint8Array(unique);
 for(let f=0;f<frameCount;f++){const u=u32(HEADER+4*f);if(u>=unique)throw Error('Invalid packed frames: map');map[f]=u;used[u]=1;}
 if(used.includes(0))throw Error('Invalid packed frames: unreferenced frame');
 const rects=new Uint32Array(unique*6);let total=0;
 for(let u=0;u<unique;u++){
  const at=HEADER+4*frameCount+RECORD*u,x=u32(at),y=u32(at+4),w=u32(at+8),h=u32(at+12),offset=u32(at+16),length=u32(at+20);
  if((w===0)!==(h===0)||(w===0&&(x||y))||x+w>width||y+h>height)throw Error('Invalid packed frames: rectangle');
  if(length!==w*h||offset!==total)throw Error('Invalid packed frames: offset');
  rects.set([x,y,w,h,offset,length],u*6);total+=length;
 }
 if(bytes.length!==data+total)throw Error('Invalid packed frames: pixel length');
 const pixels=bytes.subarray(data),slots=[{unique:-1,frame:null},{unique:-1,frame:null}];let decodes=0,hits=0;
 const store=Object.freeze({
  width,height,frameCount,uniqueCount:unique,byteLength:n*frameCount,
  get residentBytes(){return bytes.byteLength+map.byteLength+rects.byteLength+slots.reduce((s,e)=>s+(e.frame?.byteLength??0),0);},
  stats(){return{decodes,hits,cachedFrames:slots.filter(e=>e.frame).length};},
  getFrame(index){
   if(!Number.isInteger(index)||index<0||index>=frameCount)throw Error('Invalid packed frames: frame index');
   const u=map[index];
   if(slots[0].unique===u){hits++;return slots[0].frame;}
   if(slots[1].unique===u){hits++;slots.reverse();return slots[0].frame;}
   const slot=slots.pop();slots.unshift(slot);decodes++;
   const frame=slot.frame??=new Uint8Array(n),k=u*6,x=rects[k],y=rects[k+1],w=rects[k+2],h=rects[k+3],offset=rects[k+4];
   frame.fill(0);slot.unique=u;
   for(let r=0;r<h;r++)frame.set(pixels.subarray(offset+r*w,offset+(r+1)*w),(y+r)*width+x);
   return frame;
  },
 });
 stores.add(store);return store;
}

// Uniform frame access over a legacy concatenated Uint8Array or a packed store.
export function grayFrameReader(source,width,height,frameCount){
 checkShape(width,height,frameCount);
 const n=width*height,byteLength=n*frameCount;
 const check=index=>{if(!Number.isInteger(index)||index<0||index>=frameCount)throw Error('Invalid gray frames: frame index');};
 if(stores.has(source)){
  if(source.width!==width||source.height!==height||source.frameCount!==frameCount)throw Error('Invalid gray frames: store shape');
  return{width,height,frameCount,byteLength,getFrame(index){check(index);return source.getFrame(index);}};
 }
 if(!(source instanceof Uint8Array))throw Error('Invalid gray frames: source');
 if(source.length!==byteLength)throw Error('Invalid gray frames: byte length');
 return{width,height,frameCount,byteLength,getFrame(index){check(index);return source.subarray(index*n,(index+1)*n);}};
}
