import {grayFrameReader,isGrayFrameSource} from './puppy-frame-store.mjs';

// A handful of authored keys, not an expanded 30fps film or a live image morph.
// First/last keys are the exact shared seated source; all keys use one scale.
export function comfortFrameIndex(progress,info){
 if(!Number.isFinite(progress)||progress<0||progress>1)throw Error('Invalid comfort progress');
 const seconds=progress*6;
 if(seconds<.12||progress===1)return 0;
 if(seconds<.65)return seconds<.3?1:2;
 if(seconds>5.15)return seconds<5.45?7:seconds<5.8?8:0;
 const loop=[3,4,3,5,3,6,3,5,3,4,3,6];
 return loop[Math.floor((seconds-.65)/.28)%loop.length];
}

export function createComfortSpriteSampler(bytes,info){
 if(!isGrayFrameSource(bytes)||info?.version!==1||info.width!==320||info.height!==320||info.frames!==9)throw Error('Invalid comfort sprites');
 const frames=grayFrameReader(bytes,320,320,info.frames);let rgba=null;
 return pose=>{
  if(pose?.clip!=='tug')throw Error('Invalid comfort clip');
  if(!rgba){rgba=new Uint8ClampedArray(320*320*4);for(let i=3;i<rgba.length;i+=4)rgba[i]=255;}
  const index=comfortFrameIndex(pose.progress,info),frame=frames.getFrame(index);
  for(let i=0,j=0;i<frame.length;i++,j+=4)rgba[j]=rgba[j+1]=rgba[j+2]=frame[i];
  return rgba;
 };
}
