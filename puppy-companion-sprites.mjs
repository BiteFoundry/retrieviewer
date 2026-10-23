import {grayFrameReader,isGrayFrameSource} from './puppy-frame-store.mjs';
// Prebaked interaction samples; the original seat is the exact shared endpoint.
// Pure sampling, no live image morph, root motion, camera or pose-size fitting.
export function createCompanionSpriteSampler(bytes,info){
 const n=320*320;
 if(!isGrayFrameSource(bytes)||info?.width!==320||info.height!==320||info.samples!==9||!Number.isInteger(info.pairs)||info.pairs<1||info.pairs>128||bytes.byteLength!==info.pairs*9*n)throw Error('Invalid companion sprite cache');
 for(const key of ['treat-eat','ball-pickup','ball-drop'])if(!Array.isArray(info.clips?.[key])||!info.clips[key].length||!info.clips[key].every(p=>Number.isInteger(p)&&p>=0&&p<info.pairs))throw Error('Invalid companion sprite clip');
 const frames=grayFrameReader(bytes,320,320,info.pairs*9),rgba=new Uint8ClampedArray(n*4);for(let i=3;i<rgba.length;i+=4)rgba[i]=255;
 return({clip,progress})=>{
  const list=info.clips[clip];if(!list||!Number.isFinite(progress)||progress<0||progress>1)throw Error('Invalid companion sprite pose');
  const q=progress*list.length,index=Math.min(list.length-1,Math.floor(q)),s=Math.round((q-index)*8),frame=frames.getFrame(list[index]*9+s);
  for(let i=0,j=0;i<n;i++,j+=4)rgba[j]=rgba[j+1]=rgba[j+2]=frame[i];return rgba;
 };
}
