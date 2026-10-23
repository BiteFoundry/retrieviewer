import {createZoomies} from './puppy-zoomies.mjs';
import {ZOOMIES30} from './puppy-zoomies30.mjs';
export const FLOW_SPEC={width:80,height:80,pairs:34,components:4,quantization:32};
export const CONTINUOUS_CYCLE=20;
const ease=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
const mix=(a,b,x)=>a+(b-a)*x;
// A deliberate 2D card-turn, not a fabricated double-headed morph or true 3D turn.
const turn=(p,x,fromLeft)=>{const c=Math.cos(Math.PI*ease(p));return blend({state:'turn',x,floor:.86,scale:.64,widthScale:Math.abs(c)<1e-7?0:Math.abs(c)},0,0,fromLeft?c>=0:c<0);};
const blend=(state,pair,alpha,flip=false)=>({...state,pair,blend:alpha,flip,pose:pair<30?pair:pair===31||pair===33?20:0});
const run=(time,start,end,from,to,flip)=>{
 const phase=(time-start)*30,index=Math.floor(phase),pose=index%20;
 return blend({state:'run',x:mix(from,to,ease((time-start)/(end-start))),floor:.86,scale:.64},pose,phase-Math.floor(phase),flip);
};
export function continuousAt(seconds,{mode='auto'}={}){
 if(!Number.isFinite(seconds)||seconds<0||!['auto','run','pant'].includes(mode))throw Error('Invalid animation time/mode');
 const t=(seconds*ZOOMIES30.tempo)%CONTINUOUS_CYCLE;
 const pant=(phase)=>{const p=phase*15,i=Math.floor(p);return blend({state:'pant',x:.58,floor:.96,scale:.9},20+i%10,p-i);};
 if(mode==='pant')return pant(seconds*ZOOMIES30.tempo);
 if(mode==='run')return run(seconds*ZOOMIES30.tempo,0,1,.58,.58,false);
 // All segment endpoints match in location, scale AND rendered sprite.
 if(t<1){const a=ease(t);return blend({state:'launch',x:.58,floor:mix(.96,.86,a),scale:mix(.9,.64,a)},33,a);}
 if(t<3)return run(t,1,3,.58,.78,false);
 if(t<4)return turn(t-3,.78,false);
 if(t<22/3)return run(t,4,22/3,.78,.22,true);
 if(t<25/3)return turn(t-22/3,.22,true);
 if(t<31/3)return run(t,25/3,31/3,.22,.58,false);
 if(t<34/3){const a=ease(t-31/3);return blend({state:'settle',x:.58,floor:mix(.86,.96,a),scale:mix(.64,.9,a)},30,a);}
 return pant(t-34/3);
}
const endpoints=Array.from({length:34},(_,i)=>i<20?[i,(i+1)%20,false,false]:i<30?[i,20+(i-19)%10,false,false]:[[0,20,false,false],[20,0,false,true],[0,20,true,false],[20,0,false,false]][i-30]);
export function createSpriteTween(atlas,binary,{count=30,pairs=endpoints}={}){
 if(atlas.length!==count*409600||binary.length!==pairs.length*80*80*4*2)throw Error('Invalid tween assets');
 const fields=new Int16Array(binary.buffer,binary.byteOffset,binary.byteLength/2),out=new Uint8ClampedArray(409600),stride=409600;
 const sample=(frame,x,y,flip)=>{
  if(flip)x=319-x;if(x<0||y<0||x>319||y>319)return 0;
  const x0=x|0,y0=y|0,x1=Math.min(319,x0+1),y1=Math.min(319,y0+1),fx=x-x0,fy=y-y0,o=frame*stride;
  return (atlas[o+(y0*320+x0)*4]*(1-fx)+atlas[o+(y0*320+x1)*4]*fx)*(1-fy)+(atlas[o+(y1*320+x0)*4]*(1-fx)+atlas[o+(y1*320+x1)*4]*fx)*fy;
 };
 return function tween(state){
  const {pair}=state,a=Math.max(0,Math.min(1,state.blend)),[fa,fb,flipA,flipB]=pairs[pair];
  if(a<1e-7&&!flipA)return atlas.subarray(fa*stride,(fa+1)*stride);
  if(a>1-1e-7&&!flipB)return atlas.subarray(fb*stride,(fb+1)*stride);
  const offset=pair*80*80*4;
  for(let y=0;y<320;y++)for(let x=0;x<320;x++){
   const gx=x*79/319,gy=y*79/319,x0=gx|0,y0=gy|0,x1=Math.min(79,x0+1),y1=Math.min(79,y0+1),fx=gx-x0,fy=gy-y0;
   const p=offset+(y0*80+x0)*4,q=offset+(y0*80+x1)*4,r=offset+(y1*80+x0)*4,s=offset+(y1*80+x1)*4;
   const flow=k=>((fields[p+k]*(1-fx)+fields[q+k]*fx)*(1-fy)+(fields[r+k]*(1-fx)+fields[s+k]*fx)*fy)/32;
   const av=sample(fa,x-a*flow(0),y-a*flow(1),flipA),bv=sample(fb,x-(1-a)*flow(2),y-(1-a)*flow(3),flipB),v=av*(1-a)+bv*a,j=(y*320+x)*4;
   out[j]=out[j+1]=out[j+2]=v;out[j+3]=255;
  }
  return out;
 };
}
export function createContinuousZoomies(atlas,fields,width,height){
 const tween=createSpriteTween(atlas,fields);
 return createZoomies(atlas,width,height,{spec:ZOOMIES30,stateAt:continuousAt,frameProvider:tween});
}
