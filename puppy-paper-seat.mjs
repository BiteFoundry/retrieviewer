import {grayFrameReader,isGrayFrameSource} from './puppy-frame-store.mjs';
// Exact cached samples; no live crossfade. Reverse the same path to stand up.
export function createPaperSeatSampler(bytes,info){
 const stride=320*320;
 if(!isGrayFrameSource(bytes)||info.width!==320||info.height!==320||info.pairs!==3||info.samples!==17||bytes.byteLength!==3*17*stride)throw Error('Invalid paper sitting cache');
 const frames=grayFrameReader(bytes,320,320,3*17),out=new Uint8ClampedArray(stride*4);for(let i=3;i<out.length;i+=4)out[i]=255;
 return progress=>{
  if(!Number.isFinite(progress)||progress<0||progress>1)throw Error('Invalid paper sitting progress');
  const q=progress*3,pair=Math.min(2,Math.floor(q)),sample=Math.round((q-pair)*16),frame=frames.getFrame(pair*17+sample);
  for(let i=0,j=0;i<stride;i++,j+=4)out[j]=out[j+1]=out[j+2]=frame[i];
  return out;
 };
}
