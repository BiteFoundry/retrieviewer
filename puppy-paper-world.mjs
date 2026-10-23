// Design calibration, not a measurement of the user's current head position.
// Sources: OpenCV pinhole model; PsychoPy viewtools physical-screen frustums.
const diagonal=.0254*32;
// The paper actor already integrates its own calibrated travel profile and foot
// contacts. Its old 3D Animal.follow() merely copied that root's x/z, then also
// updated an invisible skinned mesh, IK, fur and materials. Keep just the follow
// contract here; speed/stride/projection remain owned by the existing planner.
export function createPaperBody(){
 const position={x:0,y:0,z:0};let target=null,disposed=false;
 const alive=()=>{if(disposed)throw Error('Paper body is disposed');};
 return{
  position,
  follow(point){alive();if(!point||![point.x,point.y,point.z].every(Number.isFinite))throw Error('Invalid paper body position');target={x:point.x,y:point.y,z:point.z};},
  update(dt){alive();if(!Number.isFinite(dt)||dt<0||dt>.1)throw Error('Invalid paper body step');if(target){position.x=target.x;position.z=target.z;}},
  dispose(){disposed=true;target=null;},
 };
}
export const PAPER_SCREEN=Object.freeze({widthMeters:diagonal*16/Math.hypot(16,9),heightMeters:diagonal*9/Math.hypot(16,9),viewDistance:.70});
const eyeHeight=.45,eyeZ=1.65,pitch=9*Math.PI/180;
export const PAPER_CAMERA=Object.freeze({fov:2*Math.atan(PAPER_SCREEN.heightMeters/(2*PAPER_SCREEN.viewDistance))*180/Math.PI,aspect:16/9,position:Object.freeze([0,eyeHeight,eyeZ]),target:Object.freeze([0,.12,eyeZ-(eyeHeight-.12)/Math.tan(pitch)]),canvasMeters:.64});
// Bryce & Williams 2017, Table 1/S2: adult retriever shoulder .60m;
// walk/trot/gallop (stride m, frequency Hz) = (.90,1.38)/(1.36,2.07)/(2.26,2.64).
// .35m puppy shoulder is a design assumption, NOT a measured juvenile dataset.
// Dynamic similarity: length *= lambda, frequency /= sqrt(lambda).
export const PAPER_BODY=Object.freeze({shoulderMeters:.35,referenceShoulderMeters:.60});
export const PAPER_LIMB=Object.freeze({length:PAPER_BODY.shoulderMeters,stanceHeight:PAPER_BODY.shoulderMeters*5/7});
const bodyRatio=PAPER_BODY.shoulderMeters/PAPER_BODY.referenceShoulderMeters;
const gait=(stride,frequency)=>Object.freeze({stride:stride*bodyRatio,frequency:frequency/Math.sqrt(bodyRatio),speed:stride*frequency*Math.sqrt(bodyRatio)});
const run=gait(2.26,2.64);
export const PAPER_GAITS=Object.freeze({front:run,rear:run,approach:run,trot:gait(1.36,2.07),walk:gait(.90,1.38)});
export const PAPER_DYNAMICS=Object.freeze({acceleration:4,deceleration:5,walkAcceleration:2,walkDeceleration:3});
// World distances, not a second screen-space zoom. Keep distant targets valid
// all the way to the horizon; never clamp the pet to a readable thumbnail size.
export const PAPER_GROUND=Object.freeze({near:.2,far:-200,away:-8});
const dz=PAPER_CAMERA.position[2]-PAPER_CAMERA.target[2],dy=PAPER_CAMERA.position[1]-PAPER_CAMERA.target[1],length=Math.hypot(dz,dy),c=dz/length,s=dy/length;
export function paperCameraPoint(x,y,z){return{x,y:c*(y-eyeHeight)-s*(z-eyeZ),depth:-s*(y-eyeHeight)-c*(z-eyeZ)};}
export function paperGroundTarget(x,z){
 if(![x,z].every(Number.isFinite))throw Error('Invalid paper target');
 z=Math.max(PAPER_GROUND.far,Math.min(PAPER_GROUND.near,z));
 const halfWidth=Math.max(.72,paperCameraPoint(0,0,z).depth*PAPER_SCREEN.widthMeters/(2*PAPER_SCREEN.viewDistance)-PAPER_CAMERA.canvasMeters/2);
 return[Math.max(-halfWidth,Math.min(halfWidth,x)),z];
}

// Fit one virtual 32" 16:9 screen INSIDE the actual text rectangle, not behind
// headers/controls. Its fixed camera/frustum survives viewport and UI resizing.
export function createPaperProjection({viewportWidth,viewportHeight,rect,width,height}){
 if(![viewportWidth,viewportHeight,rect?.left,rect?.top,rect?.width,rect?.height,width,height].every(Number.isFinite)||Math.min(viewportWidth,viewportHeight,rect.width,rect.height,width,height)<=0)throw Error('Invalid paper viewport');
 const pixelsPerMeter=Math.min(rect.width/PAPER_SCREEN.widthMeters,rect.height/PAPER_SCREEN.heightMeters),f=PAPER_SCREEN.viewDistance*pixelsPerMeter;
 const cx=rect.width/2,cy=rect.height/2;
 return{
  project(x,y,z){const p=paperCameraPoint(x,y,z);if(p.depth<=.02)throw Error('Paper point behind camera');return{x:(cx+f*p.x/p.depth)/rect.width,y:(cy-f*p.y/p.depth)/rect.height,depth:p.depth};},
  placement(x,z){const p=this.project(x,0,z),sourceSize=f*PAPER_CAMERA.canvasMeters/p.depth;return{x:p.x,y:p.y,size:sourceSize/rect.height,pixelAspect:(rect.width/width)/(rect.height/height),depth:p.depth,
   groundFromPixel:(px,py)=>this.ground(px/width,py/height),pixelFromGround:point=>{const q=this.project(point.x,0,point.z);return{x:q.x*width,y:q.y*height};}};},
  ground(u,v){
   if(![u,v].every(Number.isFinite))return null;
   const rx=(u*rect.width-cx)/f,ry=-(v*rect.height-cy)/f;
   const vy=c*ry-s,vz=-s*ry-c;if(vy>=-1e-8)return null;
   const t=-PAPER_CAMERA.position[1]/vy;return{x:rx*t,z:eyeZ+vz*t};
  },
  focalPixels:f,pixelsPerMeter,principalPoint:{x:cx,y:cy}
 };
}

// Exact trapezoidal/triangular speed profile. Rendering and gait consume the
// integrated arc length, never a second easing curve or screen-space velocity.
export function planPaperTravel(distance,{speed=.35,acceleration=.7,deceleration=.5,startSpeed=0,endSpeed=0}={}){
 if(![distance,speed,acceleration,deceleration,startSpeed,endSpeed].every(Number.isFinite)||distance<0||Math.min(speed,acceleration,deceleration)<=0||Math.min(startSpeed,endSpeed)<0||Math.max(startSpeed,endSpeed)>speed)throw Error('Invalid paper travel');
 const peak=Math.min(speed,Math.sqrt((2*distance+startSpeed**2/acceleration+endSpeed**2/deceleration)/(1/acceleration+1/deceleration)));
 if(peak+1e-9<Math.max(startSpeed,endSpeed))throw Error('Insufficient braking distance');
 const ta=(peak-startSpeed)/acceleration,td=(peak-endSpeed)/deceleration,da=(peak+startSpeed)*ta/2,dd=(peak+endSpeed)*td/2,dc=Math.max(0,distance-da-dd),tc=peak?dc/peak:0,duration=ta+tc+td;
 return{distance,duration,peak,brakingDistance:dd,acceleration,deceleration,
  at(time){
   if(!Number.isFinite(time))throw Error('Invalid travel time');const t=Math.max(0,time);
   if(t>=duration)return{distance,speed:endSpeed,stage:'arrived',done:true};
   if(t<ta)return{distance:startSpeed*t+.5*acceleration*t*t,speed:startSpeed+acceleration*t,stage:'accelerating',done:false};
   if(t<ta+tc)return{distance:da+peak*(t-ta),speed:peak,stage:'cruise',done:false};
   const r=duration-t;return{distance:distance-endSpeed*r-.5*deceleration*r*r,speed:endSpeed+deceleration*r,stage:'braking',done:false};
  }
 };
}

export function planPaperApproach(distance){
 const runStride=PAPER_GAITS.approach.stride,walkStride=PAPER_GAITS.walk.stride,runDistance=Math.max(0,Math.floor((distance-1.1)/runStride))*runStride,entry=Math.min(.12,distance*.2),walkCycles=Math.max(0,Math.floor((distance-runDistance-entry-.25)/walkStride)),walkDistance=walkCycles*walkStride,brakeStart=runDistance+entry+walkDistance;
 return{runStride,walkStride,runDistance,entry,walkDistance,brakeStart,at(d){
  if(runDistance>0&&d<runDistance)return{clip:'run',progress:d/runStride};
  if(d<runDistance+entry)return{clip:'walk-enter',progress:(d-runDistance)/(entry||1)};
  if(d<brakeStart)return{clip:'walk',progress:(d-runDistance-entry)/walkStride};
  return{clip:'brake',progress:Math.max(0,Math.min(1,(d-brakeStart)/Math.max(1e-9,distance-brakeStart)))};
 }};
}

export function planPaperApproachTravel(distance){
 const geometry=planPaperApproach(distance),walkSpeed=PAPER_GAITS.walk.speed;
 if(!distance)return planPaperTravel(0,{speed:walkSpeed});
 const preDistance=geometry.brakeStart-geometry.runDistance,brakeDistance=distance-geometry.brakeStart;
 const entrySpeed=geometry.runDistance?walkSpeed:Math.min(walkSpeed,Math.sqrt(2*PAPER_DYNAMICS.walkAcceleration*preDistance));
 const segments=[];
 if(geometry.runDistance)segments.push(planPaperTravel(geometry.runDistance,{speed:PAPER_GAITS.approach.speed,...PAPER_DYNAMICS,endSpeed:walkSpeed}));
 segments.push(planPaperTravel(preDistance,{speed:walkSpeed,startSpeed:geometry.runDistance?walkSpeed:0,endSpeed:entrySpeed,acceleration:PAPER_DYNAMICS.walkAcceleration,deceleration:PAPER_DYNAMICS.walkDeceleration}));
 // The entire gathering clip is actual deceleration, not an illustration of
 // braking while the root continues to cruise until its very last centimeters.
 segments.push(planPaperTravel(brakeDistance,{speed:entrySpeed,startSpeed:entrySpeed,acceleration:PAPER_DYNAMICS.walkAcceleration,deceleration:entrySpeed**2/(2*brakeDistance)}));
 const duration=segments.reduce((a,p)=>a+p.duration,0);
 return{distance,duration,peak:Math.max(...segments.map(p=>p.peak)),brakingDistance:brakeDistance,at(t){if(!Number.isFinite(t))throw Error('Invalid approach time');if(t>=duration)return{distance,speed:0,stage:'arrived',done:true};let offset=0;for(let i=0;i<segments.length;i++){const p=segments[i];if(t<p.duration||i===segments.length-1){const s=p.at(t);return{...s,distance:offset+s.distance};}t-=p.duration;offset+=p.distance;}}};
}

// Finish at a shared cycle endpoint without animating extra strides in place.
// Short paths use shorter strides and a correspondingly lower speed ceiling.
export function planPaperRun(distance){
 const cycles=Math.max(1,Math.ceil(distance/run.stride)),stride=distance/cycles||run.stride;
 return{stride,cycles,plan:planPaperTravel(distance,{speed:Math.min(run.speed,stride*run.frequency),...PAPER_DYNAMICS})};
}
export function planPaperWalk(distance){
 const gait=PAPER_GAITS.walk,cycles=Math.max(1,Math.ceil(distance/gait.stride)),stride=distance/cycles||gait.stride;
 return{stride,cycles,plan:planPaperTravel(distance,{speed:Math.min(gait.speed,stride*gait.frequency),acceleration:PAPER_DYNAMICS.walkAcceleration,deceleration:PAPER_DYNAMICS.walkDeceleration})};
}
export function paperWalkTarget(x,z,direction,distance=1.05){
 if(![x,z,direction,distance].every(Number.isFinite)||![-1,1].includes(direction)||distance<=0)throw Error('Invalid walk target');
 const radius=Math.max(.1,paperCameraPoint(0,0,z).depth*PAPER_SCREEN.widthMeters/(2*PAPER_SCREEN.viewDistance)-.44);
 const next=direction>0?Math.max(x,Math.min(radius,x+distance)):Math.min(x,Math.max(-radius,x-distance));
 return paperGroundTarget(next,z);
}
