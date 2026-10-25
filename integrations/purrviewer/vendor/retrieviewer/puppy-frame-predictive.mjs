// 32-level predictive grayscale frames (RVQ5), a lossy VISUAL COMPARISON codec
// built from a lossless RVF1 store. Every pixel v becomes q=round(v*31/255) and
// is shown as round(q*255/31) (max error 4; 0 and 255 stay exact). The RVF1
// dedup map and crop rectangles are kept unchanged. Each cropped row stores a
// PNG filter type (0 None, 1 Sub, 2 Up, 3 Average, 4 Paeth; 1 byte per pixel)
// followed by w residual bytes (q - prediction) mod 256.
//
// Little-endian layout:
//  0 'RVQ5'  4 u32 width  8 u32 height  12 u32 logicalFrameCount  16 u32 uniqueCount
//  20 u32[logicalFrameCount] logical -> unique index
//  then uniqueCount records of u32 x,y,w,h,offset,length (length = h*(w+1))
//  then the filtered rows of every unique crop, contiguous in order.
// At load every crop is validated. The portable store keeps 5-bit packed indices;
// an optional host codec compresses each filtered crop instead (Node zlib).
// Neither retains the input archive. Full frames rebuild on demand (LRU of 2).
const MAGIC=[0x52,0x56,0x51,0x35],RVF1=[0x52,0x56,0x46,0x31],HEADER=20,RECORD=24,MAX_SIDE=16384,BITS=5;

export const quantize5=v=>Math.round(v*31/255);
export const expand5=q=>Math.round(q*255/31);
const QUANT=Uint8Array.from({length:256},(_,v)=>quantize5(v)),DISPLAY=Uint8Array.from({length:32},(_,q)=>expand5(q));
export const quantizedGray=Uint8Array.from({length:256},(_,v)=>DISPLAY[QUANT[v]]);
export const isPredictiveFrames=bytes=>bytes instanceof Uint8Array&&bytes.length>=4&&MAGIC.every((v,i)=>bytes[i]===v);

const fail=what=>{throw Error(`Invalid predictive frames: ${what}`);};
const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
export function predict(type,a,b,c){
 switch(type){case 0:return 0;case 1:return a;case 2:return b;case 3:return (a+b)>>1;case 4:return paeth(a,b,c);}
 return fail('filter');
}

function checkShape(width,height,frameCount){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>MAX_SIDE||height>MAX_SIDE)fail('header');
 if(!Number.isInteger(frameCount)||frameCount<1||frameCount>0xffffffff||!Number.isSafeInteger(width*height*frameCount))fail('header');
}

// Encode an RVF1 byte store (see puppy-frame-store.mjs). Rows pick the filter
// with the smallest sum of |signed residual|, lowest type on ties; `filter`
// forces one type for every row (tests). Deterministic.
export function encodePredictiveFrames(rvf1,{filter}={}){
 if(!(rvf1 instanceof Uint8Array)||rvf1.length<HEADER||RVF1.some((v,i)=>rvf1[i]!==v))throw Error('Invalid packed frames: magic');
 if(filter!==undefined&&!(Number.isInteger(filter)&&filter>=0&&filter<=4))fail('filter');
 const view=new DataView(rvf1.buffer,rvf1.byteOffset,rvf1.byteLength),u32=at=>view.getUint32(at,true);
 const width=u32(4),height=u32(8),frameCount=u32(12),unique=u32(16),records=HEADER+4*frameCount,data=records+RECORD*unique;
 checkShape(width,height,frameCount);
 if(rvf1.length<data)throw Error('Invalid packed frames: truncated');
 let total=0;
 for(let u=0;u<unique;u++)total+=u32(records+RECORD*u+12)*(u32(records+RECORD*u+8)+1);
 const out=new Uint8Array(data+total),ov=new DataView(out.buffer);
 out.set(rvf1.subarray(0,data));out.set(MAGIC,0);
 const rows=Array.from({length:5},()=>new Uint8Array(width)),cur=new Uint8Array(width),prev=new Uint8Array(width);let at=data,offset=0;
 for(let u=0;u<unique;u++){
  const rec=records+RECORD*u,w=u32(rec+8),h=u32(rec+12),src=data+u32(rec+16);
  if(u32(rec+20)!==w*h||src+w*h>rvf1.length)throw Error('Invalid packed frames: offset');
  ov.setUint32(rec+16,offset,true);ov.setUint32(rec+20,h*(w+1),true);offset+=h*(w+1);
  prev.fill(0);
  for(let y=0;y<h;y++){
   for(let x=0;x<w;x++)cur[x]=QUANT[rvf1[src+y*w+x]];
   let best=filter??-1,bestCost=Infinity;
   for(let t=filter??0;t<=(filter??4);t++){
    const r=rows[t];let cost=0;
    for(let x=0;x<w;x++){const v=(cur[x]-predict(t,x?cur[x-1]:0,prev[x],x?prev[x-1]:0))&255;r[x]=v;cost+=v>127?256-v:v;}
    if(cost<bestCost){bestCost=cost;best=t;}
   }
   out[at++]=best;out.set(rows[best].subarray(0,w),at);at+=w;prev.set(cur.subarray(0,w));
  }
 }
 return out;
}

// Exact PNG inverse filter of one row into `cur` (bpp 1, integer arithmetic).
export function unfilterRow(type,src,at,cur,prev,w){
 switch(type){
  case 0:for(let x=0;x<w;x++)cur[x]=src[at+x];return;
  case 1:for(let x=0;x<w;x++)cur[x]=(src[at+x]+(x?cur[x-1]:0))&255;return;
  case 2:for(let x=0;x<w;x++)cur[x]=(src[at+x]+prev[x])&255;return;
  case 3:for(let x=0;x<w;x++)cur[x]=(src[at+x]+(((x?cur[x-1]:0)+prev[x])>>1))&255;return;
  case 4:for(let x=0;x<w;x++)cur[x]=(src[at+x]+paeth(x?cur[x-1]:0,prev[x],x?prev[x-1]:0))&255;return;
 }
 fail('filter');
}

// Validate and unfilter. Only the returned typed arrays survive; `bytes` is
// not referenced by the store built from them.
function decode(bytes,{frameIndices,codec}={}){
 if(codec&&(typeof codec.compress!=='function'||typeof codec.expand!=='function'))fail('codec');
 if(!(bytes instanceof Uint8Array))fail('bytes');
 if(!isPredictiveFrames(bytes)||bytes.length<HEADER)fail('magic');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),u32=at=>view.getUint32(at,true);
 const width=u32(4),height=u32(8),frameCount=u32(12),unique=u32(16);
 checkShape(width,height,frameCount);
 if(unique<1||unique>frameCount)fail('unique count');
 const data=HEADER+4*frameCount+RECORD*unique;
 if(bytes.length<data)fail('truncated');
 const retained=frameIndices===undefined?null:new Uint8Array(frameCount);
 if(retained){
  if(!Array.isArray(frameIndices)||!frameIndices.length)fail('retained frames');
  for(const f of frameIndices){if(!Number.isInteger(f)||f<0||f>=frameCount)fail('retained frame index');retained[f]=1;}
 }
 const map=new Uint32Array(frameCount),used=new Uint8Array(unique),needed=retained?new Uint8Array(unique):null;
 for(let f=0;f<frameCount;f++){const u=u32(HEADER+4*f);if(u>=unique)fail('map');map[f]=u;used[u]=1;if(retained?.[f])needed[u]=1;}
 if(used.includes(0))fail('unreferenced frame');
 // x,y,w,h,first pixel index in the packed stream
 const rects=new Float64Array(unique*5);let total=0,pixels=0;
 for(let u=0;u<unique;u++){
  const at=HEADER+4*frameCount+RECORD*u,x=u32(at),y=u32(at+4),w=u32(at+8),h=u32(at+12),offset=u32(at+16),length=u32(at+20);
  if((w===0)!==(h===0)||(w===0&&(x||y))||x+w>width||y+h>height)fail('rectangle');
  if(length!==h*(w+1)||offset!==total)fail('offset');
  rects.set([x,y,w,h,pixels],u*5);total+=length;if(!needed||needed[u])pixels+=w*h;
 }
 if(bytes.length!==data+total)fail('pixel length');
 if(pixels*BITS>0xffffffff)fail('pixel count');
 const packed=codec?null:new Uint8Array(Math.ceil(pixels*BITS/8)),chunks=codec?new Array(unique):null;
 let cur=new Uint8Array(width),prev=new Uint8Array(width),at=data,pos=0;
 for(let u=0;u<unique;u++){
  const w=rects[u*5+2],h=rects[u*5+3],start=at;prev.fill(0);
  for(let y=0;y<h;y++){
   unfilterRow(bytes[at],bytes,at+1,cur,prev,w);at+=w+1;
   for(let x=0;x<w;x++){
    const q=cur[x];if(q>31)fail('quantized value');if(codec||(needed&&!needed[u]))continue;
    const i=pos>>>3,s=pos&7;packed[i]|=(q<<s)&255;if(s>3)packed[i+1]|=q>>(8-s);pos+=BITS;
   }
   const t=prev;prev=cur;cur=t;
  }
  if(codec&&h&&(!needed||needed[u]))chunks[u]=Uint8Array.from(codec.compress(bytes.subarray(start,at)));
 }
 return{width,height,frameCount,unique,map,rects,packed,retained,chunks,codec};
}

function createStore({width,height,frameCount,unique,map,rects,packed,retained,chunks,codec}){
 const n=width*height,slots=[{unique:-1,frame:null},{unique:-1,frame:null}];let decodes=0,hits=0;
 const pixelBytes=packed?.byteLength??chunks.reduce((sum,c)=>sum+(c?.byteLength??0),0);
 const cur=codec?new Uint8Array(width):null,prev=codec?new Uint8Array(width):null;
 return Object.freeze({
  width,height,frameCount,uniqueCount:unique,byteLength:n*frameCount,residentPixelBytes:pixelBytes,
  get residentBytes(){return pixelBytes+map.byteLength+rects.byteLength+(cur?.byteLength??0)+(prev?.byteLength??0)+(retained?.byteLength??0)+slots.reduce((s,e)=>s+(e.frame?.byteLength??0),0);},
  stats(){return{decodes,hits,cachedFrames:slots.filter(e=>e.frame).length};},
  getFrame(index){
   if(!Number.isInteger(index)||index<0||index>=frameCount)fail('frame index');
   if(retained&&!retained[index])fail('frame was not retained');
   const u=map[index];
   if(slots[0].unique===u){hits++;return slots[0].frame;}
   if(slots[1].unique===u){hits++;slots.reverse();return slots[0].frame;}
   const slot=slots.pop();slots.unshift(slot);decodes++;
   const frame=slot.frame??=new Uint8Array(n),k=u*5,x=rects[k],y=rects[k+1],w=rects[k+2],h=rects[k+3];
   frame.fill(0);slot.unique=u;
   if(codec){
    if(!h)return frame;
    const rows=codec.expand(chunks[u],h*(w+1));
    if(rows.length!==h*(w+1))fail('expanded length');
    prev.fill(0);
    for(let r=0,at=0;r<h;r++,at+=w+1){
     unfilterRow(rows[at],rows,at+1,cur,prev,w);
     for(let c=0;c<w;c++)frame[(y+r)*width+x+c]=DISPLAY[cur[c]];
     prev.set(cur.subarray(0,w));
    }
    return frame;
   }
   let pos=rects[k+4]*BITS;
   for(let r=0;r<h;r++){
    const row=(y+r)*width+x;
    for(let c=0;c<w;c++){const i=pos>>>3,s=pos&7;let v=packed[i]>>s;if(s>3)v|=packed[i+1]<<(8-s);frame[row+c]=DISPLAY[v&31];pos+=BITS;}
   }
   return frame;
  },
 });
}

// Parse, validate and unpack an RVQ5 store. A returned frame is valid until two
// other unique frames have been requested.
export function readPredictiveFrames(bytes,options){return createStore(decode(bytes,options));}
