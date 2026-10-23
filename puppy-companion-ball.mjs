// Analytic ball travel in the same ground/camera as the dog. No physics engine,
// per-frame integration drift, timer, image or growing path-history allocation.
import {planPaperTravel} from './puppy-paper-world.mjs';
export function createBallPath({from={x:0,z:.2},landing={x:0,z:-4},stop=landing,flight=.65,peak=.75,deceleration=.6}={}){
 if(![from.x,from.z,landing.x,landing.z,stop.x,stop.z,flight,peak,deceleration].every(Number.isFinite)||flight<0||peak<0||deceleration<=0)throw Error('Invalid ball path');
 from=Object.freeze({...from});landing=Object.freeze({...landing});stop=Object.freeze({...stop});
 const dx=stop.x-landing.x,dz=stop.z-landing.z,distance=Math.hypot(dx,dz),speed=Math.sqrt(2*deceleration*distance);
 const roll=distance?planPaperTravel(distance,{speed,startSpeed:speed,acceleration:deceleration,deceleration}):null;
 const duration=flight+(roll?.duration??0);
 return Object.freeze({duration,from,landing,stop,
  at(age){
   if(!Number.isFinite(age))throw Error('Invalid ball age');
   const t=Math.max(0,age);
   if(t<flight){const p=t/flight;return{x:from.x+(landing.x-from.x)*p,z:from.z+(landing.z-from.z)*p,height:4*peak*p*(1-p),spin:0,speed:0,phase:'flight',settled:false};}
   const state=roll?.at(t-flight),ratio=distance?state.distance/distance:1;
   return{x:landing.x+dx*ratio,z:landing.z+dz*ratio,height:0,spin:(state?.distance??0)/.035,speed:state?.speed??0,phase:t>=duration?'rest':'roll',settled:t>=duration};
  }
 });
}

// First throw remains the familiar clean fetch. Later throws use a seeded
// weighted choice, no immediate repeat, and at least four throws between tumbles.
export function createFetchPatterns(random,{canTumble=false}={}){
 if(typeof random!=='function')throw Error('Fetch pattern RNG is required');
 let count=0,last=null,lastTumble=-4;
 return(allowTumble=canTumble)=>{
  if(typeof allowTumble!=='boolean')throw Error('Invalid tumble availability');
  count++;
  const weights={clean:4,rolling:3,miss:2,tumble:canTumble&&allowTumble&&count>=4&&count-lastTumble>=4?.6:0};
  if(last)weights[last]=0;
  let pattern='clean';
  if(count>1){let pick=random()*Object.values(weights).reduce((a,b)=>a+b,0);pattern=Object.keys(weights).find(k=>(pick-=weights[k])<0)??'clean';}
  if(pattern==='tumble')lastTumble=count;
  last=pattern;return pattern;
 };
}
