import{grayFrameReader,isGrayFrameSource}from'./puppy-frame-store.mjs';
export const PAPER_ACTION_DURATIONS=Object.freeze({spin:2.8,roll:4.6,'roll-down':4.6,'walk-enter':.28,'walk-exit':.28});
export const PAPER_ACTION_FORMAT=Object.freeze({width:480,height:480,samples:9,maxPairs:256});
const own=(o,k)=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&Object.prototype.hasOwnProperty.call(o,k);
const isPairCount=n=>Number.isInteger(n)&&n>0&&n<=PAPER_ACTION_FORMAT.maxPairs;
function actionClip(name,info){
 if(typeof name!=='string'||!own(info?.clips,name))throw Error(`Invalid paper action: unknown clip ${JSON.stringify(name)}`);
 if(!isPairCount(info.pairs))throw Error('Invalid paper action: pair count');
 const list=info.clips[name];
 if(!Array.isArray(list)||!list.length)throw Error(`Invalid paper action: empty clip ${name}`);
 for(const p of list)if(!Number.isInteger(p)||p<0||p>=info.pairs)throw Error(`Invalid paper action: pair ${p} out of range in ${name}`);
 let weights=list.map(()=>1);
 if(info.weights!==undefined){
  if(info.weights===null||typeof info.weights!=='object'||Array.isArray(info.weights))throw Error('Invalid paper action: weights');
  if(own(info.weights,name)){weights=info.weights[name];
   if(!Array.isArray(weights)||weights.length!==list.length)throw Error(`Invalid paper action: weights length for ${name}`);
   for(const w of weights)if(typeof w!=='number'||!Number.isFinite(w)||w<=0)throw Error(`Invalid paper action: weight ${w} in ${name}`);}
 }
 return{list,weights};
}
export function validatePaperActionInfo(info,byteLength){
 const f=PAPER_ACTION_FORMAT;
 if(info===null||typeof info!=='object'||info.width!==f.width||info.height!==f.height||info.samples!==f.samples)throw Error('Invalid action cache: format');
 if(!isPairCount(info.pairs))throw Error('Invalid action cache: pair count');
 if(info.clips===null||typeof info.clips!=='object'||Array.isArray(info.clips)||!Object.keys(info.clips).length)throw Error('Invalid action cache: clips');
 if(info.weights!==undefined)for(const k of Object.keys(info.weights??{}))if(!own(info.clips,k))throw Error(`Invalid action cache: weights for unknown clip ${k}`);
 for(const name of Object.keys(info.clips))actionClip(name,info);
 if(byteLength!==undefined&&byteLength!==f.width*f.height*f.samples*info.pairs)throw Error('Invalid action cache: byte length');
 return info;
}
export function paperActionPose(name,progress,info,compiledClips){
 if(typeof progress!=='number'||!Number.isFinite(progress))throw Error('Invalid paper action: progress');
 if(compiledClips&&!own(compiledClips,name))throw Error(`Invalid paper action: unknown compiled clip ${JSON.stringify(name)}`);
 const{list,weights,total=weights.reduce((a,b)=>a+b,0)}=compiledClips?.[name]??actionClip(name,info);
 let t=(name==='walk'?((progress%1)+1)%1:Math.max(0,Math.min(1,progress)))*total,index=0;
 while(index<list.length-1&&t>weights[index]){t-=weights[index++];}
 const blend=Math.round(Math.max(0,Math.min(1,t/weights[index]))*8)/8;
 if(!Number.isFinite(blend))throw Error('Invalid paper action: blend');
 return{pair:list[index],blend};
}
export function createPaperActionSampler(bytes,info,output,compiledClips,kernel=null){
 if(!isGrayFrameSource(bytes))throw Error('Invalid action cache: bytes');
 validatePaperActionInfo(info,bytes.byteLength);
 const stride=info.width*info.height,pairs=info.pairs,frames=grayFrameReader(bytes,info.width,info.height,pairs*9);
 const out=output??new Uint8ClampedArray(stride*4);
 if(!(out instanceof Uint8ClampedArray)||out.length!==stride*4)throw Error('Invalid action output');
 for(let i=3;i<out.length;i+=4)out[i]=255;
 return state=>{const p=paperActionPose(state.actionName,state.actionProgress,info,compiledClips),sample=Math.round(p.blend*8);
  if(p.pair>=pairs||sample<0||sample>8)throw Error('Invalid paper action: sample out of range');
  const frame=frames.getFrame(p.pair*9+sample);if(kernel?.copyGray)kernel.copyGray(out,frame);else for(let i=0,j=0;i<stride;i++,j+=4)out[j]=out[j+1]=out[j+2]=frame[i];return out;};
}
