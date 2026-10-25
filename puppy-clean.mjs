import {stableAt,groundOffset,createStableZoomies} from './puppy-stable.mjs';
import {createFaceMotion} from './puppy-face.mjs';
import {grayFrameReader,isGrayFrameSource} from './puppy-frame-store.mjs';
export const CLEAN_BYTES=47*17*320*320;
export const STRIDE_TEMPO=.72;
export function retimeRun(phase,knots){
 if(!knots)return phase;
 const count=knots.length-1;
 if(count<2||count>20||knots[0]!==0||knots[count]!==20||knots.some((x,i)=>!Number.isFinite(x)||(i&&x<=knots[i-1])))throw Error('Invalid gait timing');
 const tangent=i=>{i%=count;const before=i?knots[i]-knots[i-1]:20-knots[count-1],after=knots[i+1]-knots[i],w1=2*after+before,w2=after+2*before;return (w1+w2)/(w1*before+w2*after);};
 let index=0;while(index<count-1&&phase>knots[index+1])index++;
 const h=knots[index+1]-knots[index],p=Math.max(0,Math.min(1,(phase-knots[index])/h)),p2=p*p,p3=p2*p;
 return (2*p3-3*p2+1)*index+(p3-2*p2+p)*h*tangent(index)+(-2*p3+3*p2)*(index+1)+(p3-p2)*h*tangent(index+1);
}
export function cleanAt(seconds,options={}){
 const state=stableAt(seconds,{...options,tempo:options.tempo??(options.sequence?STRIDE_TEMPO:.6),quickLaunch:options.quickLaunch??!!options.sequence,easedTurns:true,rampRest:true});
 if(state.state==='run'){
  const phase=retimeRun(state.pair+state.blend,options.timing),index=Math.floor(phase),count=options.sequence?.length??20;
  state.pair=index%count;state.pose=options.sequence?.[state.pair]??state.pair;state.blend=phase-index;
 }
 return state;
}
export function cleanGroundOffset(state,meta){
 if(state.state==='run'&&meta.run_sequence){
  const seq=meta.run_sequence,n=seq.length,i=state.pair,p=state.blend,v=meta.ground_offsets;
  const a=v[seq[(i+n-1)%n]],b=v[seq[i]],c=v[seq[(i+1)%n]],d=v[seq[(i+2)%n]];
  return .5*(2*b+(-a+c)*p+(2*a-5*b+4*c-d)*p*p+(-a+3*b-3*c+d)*p*p*p);
 }
 if(state.pair<30||state.pair>40)return groundOffset(state,meta);
 const i=state.pair,p=state.blend,v=meta.ground_offsets;
 const a=v[Math.max(30,i-1)],b=v[i],c=v[i+1],d=v[Math.min(41,i+2)];
 return .5*(2*b+(-a+c)*p+(2*a-5*b+4*c-d)*p*p+(-a+3*b-3*c+d)*p*p*p);
}
export function createCachedTween(cache,info,kernel=null){
 if(!isGrayFrameSource(cache)||cache.byteLength!==CLEAN_BYTES||info.pairs!==47||info.samples!==17||info.width!==320||info.height!==320||info.channels!==1||info.bytes!==CLEAN_BYTES)throw Error('Invalid baked tween cache');
 const frames=grayFrameReader(cache,320,320,47*17),output=new Uint8ClampedArray(320*320*4),stride=320*320;
 for(let i=3;i<output.length;i+=4)output[i]=255;
 return state=>{
  if(!Number.isInteger(state.pair)||state.pair<0||state.pair>=47||!Number.isFinite(state.blend))throw Error('Invalid baked tween state');
  const phase=Math.max(0,Math.min(1,state.blend))*16,index=Math.min(15,Math.floor(phase)),alpha=phase-index;
  const a=frames.getFrame(state.pair*17+index),b=frames.getFrame(state.pair*17+index+1);
  if(kernel?.blendGray)kernel.blendGray(output,a,b,alpha);else for(let i=0,j=0;i<stride;i++,j+=4){const value=a[i]*(1-alpha)+b[i]*alpha;output[j]=output[j+1]=output[j+2]=value;}
  return output;
 };
}
export function createCleanZoomies(atlas,cache,meta,cacheInfo,width,height,{secondaryMotion=true,quickLaunch=!!cacheInfo.run_sequence,sampleState=cleanAt,frameTransform,groundAt=cleanGroundOffset}={}){
 const renderMeta=cacheInfo.pair_map?{...meta,pairs:cacheInfo.pair_map,run_sequence:cacheInfo.run_sequence}:meta;
 if(cacheInfo.run_sequence){const seq=cacheInfo.run_sequence;if(seq.some((v,i)=>!Number.isInteger(v)||v<0||v>=20||renderMeta.pairs[i][0]!==v||renderMeta.pairs[i][1]!==seq[(i+1)%seq.length]))throw Error('Invalid curated gait');}
 const tween=createCachedTween(cache,cacheInfo),face=secondaryMotion&&cacheInfo.run_sequence?createFaceMotion():null;
 return createStableZoomies(atlas,null,renderMeta,width,height,{sampleState:(s,o)=>sampleState(s,{...o,quickLaunch,timing:cacheInfo.run_timing,sequence:cacheInfo.run_sequence}),frameProvider:state=>{const image=tween(state),moved=face?face(image,state):image;return frameTransform?frameTransform(moved,state):moved;},groundAt});
}
