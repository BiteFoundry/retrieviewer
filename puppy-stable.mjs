import {createZoomies} from './puppy-zoomies.mjs';
import {createSpriteTween} from './puppy-continuous.mjs';
export const STABLE_SPEC={width:320,height:320,count:42,tempo:.6,cycle:21};
const ease=p=>{p=Math.max(0,Math.min(1,p));return p*p*p*(p*(p*6-15)+10);};
const mix=(a,b,p)=>a+(b-a)*p;
// Integral of a smooth velocity ramp: quick acceleration, cruise, soft stop.
export function launchProgress(p){
 p=Math.max(0,Math.min(1,p));const a=.10,b=.22,v=1/(1-(a+b)/2),integral=u=>u*u*u-.5*u*u*u*u;
 if(p<a)return v*a*integral(p/a);
 if(p>1-b)return 1-v*b*integral((1-p)/b);
 return v*(p-a/2);
}
// The estimated thick-body root is ALWAYS (160,180). Stage depth/scale never comes from
// sprite silhouette dimensions. Gait-local vertical contact correction is separate.
export function stableAt(seconds,{mode='auto',easedTurns=false,rampRest=false,tempo=.6,quickLaunch=false,movingTurns=false}={}){
 if(!Number.isFinite(seconds)||seconds<0||!Number.isFinite(tempo)||tempo<=0||tempo>4||!['auto','run','pant'].includes(mode))throw Error('Invalid stable animation time/mode');
 const time=seconds*tempo,cycle=quickLaunch?20.18:21,local=time%cycle;
 const t=quickLaunch?(local<.18?local/.18:local+.82):local;
 const state=(kind,pair,blend,x=.58,flip=false)=>({state:kind,pair,blend,x,flip,floor:.94,scale:.72,pose:pair<=40?pair:[0,41,0,30,20,0][pair-41],z:1});
 const pant=phase=>{const p=phase*15,i=Math.floor(p);return state('pant',20+i%10,p-i);};
 const run=(p,from,to,start,end,flip)=>{const u=(p-start)/(end-start),progress=from===to?u:quickLaunch&&start===1?launchProgress(u):ease(u),cycles=Math.max(1,Math.round((end-start)*.9)),gait=progress*cycles*20,i=Math.floor(gait);return state('run',i%20,gait-i,mix(from,to,progress),flip);};
 const turn=(p,x,reverse)=>{
  const q=ease(p/1.5),direction=reverse?-1:1;
  const position=s=>{
   if(movingTurns){
    // Fixed observer: the ACTOR follows a small U-shaped ground path.
    // Same depth and scale throughout; no camera orbit or silhouette resizing.
    s.x=x+direction*(-.04+.04*Math.cos(Math.PI*q)+.065*Math.sin(Math.PI*q));
    s.floor+=.035*Math.sin(Math.PI*q);
   }
   return s;
  };
  if(p<.2)return position(state('turn',reverse?43:41,ease(p/.2),x));
  if(p<1.3){const progress=(p-.2)/1.1,q=(easedTurns?ease(progress):progress)*11,index=Math.min(10,Math.floor(q)),a=q-index;return position(state('turn',reverse?40-index:30+index,reverse?1-a:a,x));}
  return position(state('turn',reverse?44:42,ease((p-1.3)/.2),x));
 };
 if(mode==='pant')return pant(time);
 if(mode==='run')return run(time,.58,.58,0,1,false);
 if(t<1)return state('launch',45,ease(t));
 if(t<3)return run(t,.58,.78,1,3,false);
 if(t<4.5)return turn(t-3,.78,false);
 if(t<47/6)return run(t,movingTurns?.70:.78,.22,4.5,47/6,true);
 if(t<28/3)return turn(t-47/6,.22,true);
 if(t<34/3)return run(t,movingTurns?.30:.22,.58,28/3,34/3,false);
 if(t<37/3)return state('settle',46,ease(t-34/3));
 const rest=t-37/3;
 if(rampRest){
  const duration=26/3,ramp=.5,rate=120/(duration-ramp),integral=u=>u**6-3*u**5+2.5*u**4;
  const phase=rest<ramp?rate*ramp*integral(rest/ramp):rest>duration-ramp?120-rate*ramp*integral((duration-rest)/ramp):rate*(rest-ramp/2);
  return pant(phase/15);
 }
 return pant(rest);
}
export function groundOffset(state,meta){
 const [a,b]=meta.pairs[state.pair],p=state.blend;
 const v=meta.ground_offsets;
 if(state.pair<30){
  const start=state.pair<20?0:20,n=start?10:20,index=a-start;
  const before=v[start+(index+n-1)%n],after=v[start+(index+2)%n];
  // Periodic Catmull-Rom: root velocity is continuous across pose boundaries.
  return .5*((2*v[a])+(-before+v[b])*p+(2*before-5*v[a]+4*v[b]-after)*p*p+(-before+3*v[a]-3*v[b]+after)*p*p*p);
 }
 return mix(v[a],v[b],p);
}
export function createStableZoomies(atlas,fields,meta,width,height,{sampleState=stableAt,frameProvider,groundAt=groundOffset}={}){
 if(meta.count!==42||meta.pairs.length!==47||meta.ground_offsets.length!==42)throw Error('Invalid stable metadata');
 const tween=frameProvider??createSpriteTween(atlas,fields,{count:42,pairs:meta.pairs});
 const stateAt=(seconds,options)=>{
  const s=sampleState(seconds,options);s.floor+=groundAt(s,meta)*s.scale/320;return s;
 };
 return createZoomies(atlas,width,height,{spec:STABLE_SPEC,stateAt,frameProvider:tween});
}
