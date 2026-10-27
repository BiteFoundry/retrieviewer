import {grayFrameReader,isGrayFrameSource} from './puppy-frame-store.mjs';
// Registered toy centers in the existing interaction drawings, canonical 320px.
// Match the sampler's exact held frame; no additional pictures or frame cache.
const BALL_ART='8438ee6cfc52b28f8e327bf37453c8e5ad7d568b2569cd4c5ed1e051d7026905';
const BALL_KEYS={
 'ball-drop':[[156,171],[158,218],[157,229],[156,227],[164,285],[164,285],[164,285],[164,285]],
 'ball-pickup':[[164,285],[164,285],[160,285],[160,285],[160,218],[154,217],[154,217],[157,170],[157,170],[157,170],[157,170]]
};
function spritePose(info,{clip,progress}){
 const list=info.clips[clip];if(!list||!Number.isFinite(progress)||progress<0||progress>1)throw Error('Invalid companion sprite pose');
 const q=progress*list.length,index=Math.min(list.length-1,Math.floor(q)),sample=Math.round((q-index)*8);
 return {frame:list[index]*9+sample,index,blend:sample/8};
}
export function companionBallAnchor(info,pose){
 const keys=BALL_KEYS[pose.clip];if(!keys||info.sha256!==BALL_ART)return null;
 const {frame,index,blend}=spritePose(info,pose),a=keys[index],b=keys[index+1];
 return {x:a[0]+(b[0]-a[0])*blend,y:a[1]+(b[1]-a[1])*blend,scale:1,score:null,frame};
}
// Prebaked interaction samples; the original seat is the exact shared endpoint.
// Pure sampling, no live image morph, root motion, camera or pose-size fitting.
export function createCompanionSpriteSampler(bytes,info,output,kernel=null){
 const n=320*320;
 if(!isGrayFrameSource(bytes)||info?.width!==320||info.height!==320||info.samples!==9||!Number.isInteger(info.pairs)||info.pairs<1||info.pairs>128||bytes.byteLength!==info.pairs*9*n)throw Error('Invalid companion sprite cache');
 for(const key of ['treat-eat','ball-pickup','ball-drop'])if(!Array.isArray(info.clips?.[key])||!info.clips[key].length||!info.clips[key].every(p=>Number.isInteger(p)&&p>=0&&p<info.pairs))throw Error('Invalid companion sprite clip');
 const frames=grayFrameReader(bytes,320,320,info.pairs*9),rgba=output??new Uint8ClampedArray(n*4);
 if(!(rgba instanceof Uint8ClampedArray)||rgba.length!==n*4)throw Error('Invalid sprite output');
 for(let i=3;i<rgba.length;i+=4)rgba[i]=255;
 return({clip,progress})=>{
  const frame=frames.getFrame(spritePose(info,{clip,progress}).frame);
  if(kernel?.copyGray)kernel.copyGray(rgba,frame);else for(let i=0,j=0;i<n;i++,j+=4)rgba[j]=rgba[j+1]=rgba[j+2]=frame[i];return rgba;
 };
}
