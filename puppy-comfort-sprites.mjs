import {grayFrameReader,isGrayFrameSource} from './puppy-frame-store.mjs';

export function comfortMotionKey(progress,motion){
 if(!Number.isFinite(progress)||progress<0||progress>1)throw Error('Invalid motion progress');
 const age=progress*motion.duration;let key=0;
 while(key<motion.times.length-1&&age>=motion.times[key+1])key++;
 return key;
}
export function comfortMotion(pose,info){return pose?.clip==='scramble'?info.scramble:pose?.clip==='pickup'?info.pickups?.[pose.view]:pose?.clip==='carry-trot'?info.carryTrot:pose?.clip==='carry-settle'?info.carryTrot?.settle:null;}
function validateMotion(motion,count){
 if(!motion||!Array.isArray(motion.frames)||!Array.isArray(motion.times)||motion.frames.length<2||motion.frames.length>32||motion.frames.length!==motion.times.length||motion.times[0]!==0||!Number.isFinite(motion.duration)||motion.duration<=0||motion.duration>3||(motion.cyclic?motion.times.at(-1)>=motion.duration:motion.times.at(-1)!==motion.duration)||motion.frames.some(i=>!Number.isInteger(i)||i<0||i>=count)||motion.times.some((t,i)=>!Number.isFinite(t)||(i&&t<=motion.times[i-1])))throw Error('Invalid fetch motion metadata');
 if(!Array.isArray(motion.floorOffsets)||motion.floorOffsets.length!==motion.frames.length||motion.floorOffsets.some(v=>!Number.isFinite(v)||Math.abs(v)>64))throw Error('Invalid fetch floor metadata');
 if(motion.mouth&&(!Array.isArray(motion.mouth)||motion.mouth.length!==motion.frames.length||motion.mouth.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v)||v<0||v>320))))throw Error('Invalid fetch mouth metadata');
}

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
 if(!isGrayFrameSource(bytes)||![1,2,3,4,5,6].includes(info?.version)||info.width!==320||info.height!==320||(info.version>=4?(!Number.isInteger(info.frames)||info.frames<19||info.frames>64):info.frames!==({1:9,2:13,3:19}[info.version])))throw Error('Invalid comfort sprites');
 if(info.version===3){
  const s=info.scramble;
  if(!s||!Array.isArray(s.frames)||!Array.isArray(s.times)||s.frames.length!==7||s.times.length!==7||s.times[0]!==0||!Number.isFinite(s.duration)||s.duration<=0||s.duration>3||s.times.at(-1)!==s.duration||s.frames[0]!==s.frames.at(-1)||s.frames.some(i=>!Number.isInteger(i)||i<0||i>=info.frames)||s.times.some((t,i)=>!Number.isFinite(t)||(i&&t<=s.times[i-1])))throw Error('Invalid scramble metadata');
 }
 if(info.version>=4){validateMotion(info.scramble,info.frames);for(const view of ['rear','front'])validateMotion(info.pickups?.[view],info.frames);}
 if(info.version>=6){validateMotion(info.carryTrot,info.frames);validateMotion(info.carryTrot?.settle,info.frames);if(info.carryTrot.cyclic!==true||!info.carryTrot.mouth||!info.carryTrot.settle.mouth||!Array.isArray(info.carryTrot.feet)||info.carryTrot.feet.length!==info.carryTrot.frames.length||info.carryTrot.feet.some(list=>!Array.isArray(list)||list.some(f=>typeof f.id!=='string'||typeof f.stance!=='boolean'||![f.x,f.y].every(v=>Number.isFinite(v)&&v>=0&&v<320))))throw Error('Invalid carry metadata');}
 if(output!==undefined&&(!(output instanceof Uint8ClampedArray)||output.length!==320*320*4))throw Error('Invalid comfort output');
 const frames=grayFrameReader(bytes,320,320,info.frames);let rgba=output??null;
 if(rgba)for(let i=3;i<rgba.length;i+=4)rgba[i]=255;
 return pose=>{
  if(!['tug','sleep','scramble','pickup','carry-trot','carry-settle'].includes(pose?.clip))throw Error('Invalid comfort clip');
  if(!rgba){rgba=new Uint8ClampedArray(320*320*4);for(let i=3;i<rgba.length;i+=4)rgba[i]=255;}
  let index;
  if(['scramble','pickup','carry-trot','carry-settle'].includes(pose.clip)){
   const motion=comfortMotion(pose,info);if(!motion)throw Error('Invalid scramble/pickup pose');
   index=motion.frames[comfortMotionKey(pose.progress,motion)];
  }else index=pose.clip==='sleep'?info.sleep?.[pose.variant]:comfortFrameIndex(pose.progress,info);
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
