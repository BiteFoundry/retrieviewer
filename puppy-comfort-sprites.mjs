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

export function createComfortSpriteSampler(bytes,info,output){
 if(!isGrayFrameSource(bytes)||![1,2].includes(info?.version)||info.width!==320||info.height!==320||info.frames!==(info.version===2?13:9))throw Error('Invalid comfort sprites');
 if(output!==undefined&&(!(output instanceof Uint8ClampedArray)||output.length!==320*320*4))throw Error('Invalid comfort output');
 const frames=grayFrameReader(bytes,320,320,info.frames);let rgba=output??null;
 if(rgba)for(let i=3;i<rgba.length;i+=4)rgba[i]=255;
 return pose=>{
  if(!['tug','sleep'].includes(pose?.clip))throw Error('Invalid comfort clip');
  if(!rgba){rgba=new Uint8ClampedArray(320*320*4);for(let i=3;i<rgba.length;i+=4)rgba[i]=255;}
  const index=pose.clip==='sleep'?info.sleep?.[pose.variant]:comfortFrameIndex(pose.progress,info);
  if(!Number.isInteger(index))throw Error('Invalid sleep variant');
  const frame=frames.getFrame(index),base=pose.base,blend=pose.blend??1;
  if(!Number.isFinite(blend)||blend<0||blend>1)throw Error('Invalid sleep blend');
  for(let i=0,j=0;i<frame.length;i++,j+=4){
   const v=frame[pose.right?Math.floor(i/320)*320+319-i%320:i];
   rgba[j]=rgba[j+1]=rgba[j+2]=base&&blend<1?Math.round(base[j]+(v-base[j])*blend):v;
  }
  return rgba;
 };
}
