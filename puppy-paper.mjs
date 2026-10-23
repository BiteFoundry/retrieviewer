import {createCachedTween,retimeRun,cleanGroundOffset} from './puppy-clean.mjs';
import {createPaperFootLock,footSourcePoint,createRearSampler,createPaperSupportEpisodes} from './puppy-paper-contact.mjs';
import {createPaperSeatSampler} from './puppy-paper-seat.mjs';
import {planPaperRun,planPaperWalk,paperWalkTarget,planPaperApproach,planPaperApproachTravel,PAPER_GAITS,PAPER_GROUND,paperGroundTarget} from './puppy-paper-world.mjs';
import {createPaperDirector} from './puppy-paper-director.mjs';
import {createPaperBehaviorSampler,paperBehaviorPose} from './puppy-paper-behaviors.mjs';
import {createPaperAreaSampler} from './puppy-paper-area.mjs';
import {PAPER_ACTION_DURATIONS,createPaperActionSampler,paperActionPose} from './puppy-paper-actions.mjs';
import {createPawTransport} from './puppy-paper-paw-transport.mjs';
import {createCompanionSpriteSampler} from './puppy-companion-sprites.mjs';
import {mouthSourceFrame,mouthAnchor,projectMouth} from './puppy-mouth-anchor.mjs';

// Fixed viewer: slightly closer/wider lens gives depth without changing the art.
export {PAPER_CAMERA} from './puppy-paper-world.mjs';

// Original artwork only. Physics supplies ground travel; no procedural dog is drawn.
export function createPaperActor(animal,info,{manualTricks=false,trickTimings=null,walkTransitions=false}={}){
 let state='idle',age=0,phase=0,flip=false,nextFlip=false,target=null,route=false,routeIndex=0,view='front',nextView='front',turnView='front',turnFlip=false;
 let held=null,waypoints=[];
 let preparationRate=1;
 let arrived=false;
 let straight=false,seatProgress=0,seatVariant='default',travel=null,approachPlan=null,travelAge=0,travelDistance=0,motionSpeed=0,motionStage='rest',completed=false;
 let watchSide='left',restProgress=0,idleHold=2.5;
 let pendingAction=null,activeAction=null,actionDone=null,deferred=null,movementMode='run',stayDown=false,manualDown=false,spinReady=false;
 const director=createPaperDirector();
 const points=[[.12,PAPER_GROUND.away]];
 const enter=s=>{state=s;age=0;};
 const nextRoute=()=>{const choice=director.choose({x:animal.position.x,z:animal.position.z,seated:view==='approach'&&seatProgress===1});idleHold=choice.holdSeconds;if(choice.kind==='watch'){watchSide=choice.side;enter('watch');}else if(choice.kind==='rest')enter('recline');else if(choice.kind==='come')go(animal.position.x,.2,{direct:true});else go(...choice.target);};
 const settle=()=>{if(view==='approach'&&completed)seatVariant='arrival';enter(view==='approach'?'sit-down':'settle');};
 const stop=()=>{animal.follow({x:animal.position.x,y:0,z:animal.position.z},{x:0,y:0,z:0},{heading:0});motionSpeed=0;};
 const snappyPreparation=()=>!!trickTimings?.[pendingAction];
 const viewTurnSeconds=()=>snappyPreparation()?.24:walkTransitions&&movementMode==='walk'?.4:1;
 const turnSeconds=()=>snappyPreparation()?.22:.85;
 const launchSeconds=()=>snappyPreparation()?.10:.25;
 const dispatch=(fn,{keepDown=false}={})=>{
  if(activeAction||(movementMode==='walk'&&state==='run')){route=false;deferred=()=>dispatch(fn,{keepDown});return true;}
  // The calibrated trick down pose has its own byte-shared recovery; never
  // jump back into the older/larger rest illustration on another command.
  if(manualDown&&!keepDown){route=false;deferred=fn;playAction('lie-up',()=>{manualDown=false;view='approach';seatProgress=1;seatVariant='default';enter('idle');drain();},.55);return true;}
  return fn();
 };
 const drain=()=>{const fn=deferred;deferred=null;if(fn){fn();return true;}return false;};
 const playAction=(name,done,duration=PAPER_ACTION_DURATIONS[name])=>{const timing=trickTimings?.[name];duration=timing?.duration??duration;if(!Number.isFinite(duration)||duration<=0)throw Error('Invalid paper action duration');activeAction={name,duration,timing};actionDone=done;stop();enter('action');};
 const finishTrick=name=>{if(name!=='spin'){view='approach';flip=false;seatProgress=1;seatVariant='default';enter('idle');}else{view='front';flip=false;seatProgress=0;enter('settle');}drain();};
 const issue=(skipEntry=false)=>{
  if(movementMode==='walk'&&!skipEntry){playAction('walk-enter',()=>issue(true));return;}
  preparationRate=1;arrived=false;completed=false;travelAge=0;travelDistance=0;const x=animal.position.x,z=animal.position.z;if(straight&&view==='approach')target[0]=x;
  const dx=target[0]-x,dz=target[1]-z,distance=Math.hypot(dx,dz),run=movementMode==='walk'?planPaperWalk(distance):planPaperRun(distance);phase=Math.ceil(phase);
  travel={x,z,dx,dz,heading:Math.atan2(dx,dz),stride:view==='approach'?PAPER_GAITS.approach.stride:run.stride,plan:view==='approach'?planPaperApproachTravel(distance):run.plan};approachPlan=view==='approach'?planPaperApproach(distance):null;stop();enter('run');
 };
 const prepareAction=()=>{
  const name=pendingAction,desired=name==='spin'?'front':'approach';
  if(restProgress>0){enter('wake');return;}
  if(name==='spin'&&seatProgress>0){enter('rise');return;}
  if(flip&&view!=='front'){turnView='front';enter('view-turn');return;}
  if(flip){turnFlip=false;enter('turn');return;}
  if(view!==desired){turnView=view==='front'?desired:'front';enter('view-turn');return;}
  if(name!=='spin'&&seatProgress<1){enter('sit-down');return;}
  // Spin's own cache starts at key24; prepare it once, only AFTER the standing
  // facing change. Do not crouch before a standing turn and then crouch again.
  if(walkTransitions&&name==='spin'&&!spinReady){spinReady=true;enter('launch');return;}
  pendingAction=null;
  if(name==='sit'){enter('idle');return;}
  if(name==='lie'){
   if(manualTricks){playAction('lie-down',()=>{manualDown=true;enter('down');drain();},.65);}
   else{stayDown=true;enter('recline');}
   return;
  }
  playAction(name,()=>finishTrick(name));
 };
 const prepareDirection=()=>{if(pendingAction){prepareAction();return;}if(!target){settle();return;}if(nextView!==view){turnView=view==='front'?nextView:'front';enter('view-turn');}else if(view==='front'&&nextFlip!==flip){turnFlip=nextFlip;enter('turn');}else issue();};
 const requestAction=name=>{
  preparationRate=1;
  if(name==='roll'&&manualDown&&state==='down'){route=false;target=null;waypoints=[];pendingAction=null;stayDown=false;manualDown=false;restProgress=0;playAction('roll-down',()=>finishTrick('roll'));return true;}
  if(name==='roll'&&state==='down'&&restProgress===.25){route=false;target=null;waypoints=[];pendingAction=null;stayDown=false;restProgress=0;playAction('roll-down',()=>finishTrick('roll'));return true;}
  route=false;target=null;waypoints=[];pendingAction=name;spinReady=false;completed=false;stayDown=false;movementMode='run';stop();
  if(restProgress>0||state==='recline'||state==='wake')enter('wake');
  else if(['watch','view-turn','turn','arrival-exit'].includes(state)){/* reach a shared endpoint */}
  else if(['run','finish','launch','settle'].includes(state))enter('finish');
  // Only the spin owns a crouched endpoint. Ordinary commands must not borrow
  // its old launch (neutral -> key24) before doing their actual preparation.
  else if(state==='idle'&&seatProgress===0&&view==='front'&&!walkTransitions)enter('launch');else prepareDirection();
  return true;
 };
 const faceTarget=direct=>{nextFlip=target[0]<animal.position.x;const dz=target[1]-animal.position.z,dx=target[0]-animal.position.x;straight=direct;nextView=direct?'approach':Math.abs(dz)>.16&&Math.abs(dz)>Math.abs(dx)*.7?(dz<0?'rear':'approach'):'front';};
 function go(x,z,{direct=false,walking=false,urgent=false}={}){
  if(![x,z].every(Number.isFinite))throw Error('Invalid paper target');
  preparationRate=urgent?3:1;
  target=paperGroundTarget(x,z);
  pendingAction=null;stayDown=false;movementMode=walking?'walk':'run';
  const dz=target[1]-animal.position.z,dx=target[0]-animal.position.x;
  waypoints=[];
  // Do not drag a straight rear/front drawing diagonally across the floor.
  // Depart in depth then traverse; on return traverse first while still far.
  // Each corner stops and uses the existing shared turn art, never camera yaw.
  if(!direct&&Math.abs(dx)>.1&&Math.abs(dz)>.16){waypoints=[target];target=dz<0?[animal.position.x,target[1]]:[target[0],animal.position.z];}
  faceTarget(direct);
  completed=false;stop();
  if(restProgress>0||state==='recline'||state==='wake')enter('wake');
  else if(state==='watch'){/* Return head to its shared neutral endpoint first. */}
  else if(state==='arrival-exit'){/* Finish the shared return bridge first. */}
  else if(seatProgress>0||state==='sit-down'||state==='rise')enter('rise');
  else if(state!=='view-turn'&&state!=='turn'){
   if(walkTransitions&&state==='idle')prepareDirection();
   else enter(state==='idle'?'launch':'finish');
  }
 }
 return{
  go(x,z){if(![x,z].every(Number.isFinite))throw Error('Invalid paper target');return dispatch(()=>{route=false;go(x,z);});},
  // Eager attention changes preparation cadence only. Existing dispatch keeps
  // actions/walks at safe endpoints; run physics and distance gait are unchanged.
  chase(x,z){if(![x,z].every(Number.isFinite))throw Error('Invalid paper target');return dispatch(()=>{route=false;go(x,z,{urgent:true});});},
  come(){return dispatch(()=>{route=false;if(state==='idle'&&seatProgress===1&&Math.abs(animal.position.z-.2)<.002)return;go(animal.position.x,.2,{direct:true});});},
  roam(){return dispatch(()=>{route=true;routeIndex=0;go(...points[routeIndex]);});},
  sit(){return dispatch(()=>requestAction('sit'));},spin(){return dispatch(()=>requestAction('spin'));},roll(){return dispatch(()=>requestAction('roll'),{keepDown:true});},
  walk(side,distance=1.05){if(!['left','right'].includes(side)||!Number.isFinite(distance)||distance<=0)throw Error('Invalid walk command');return dispatch(()=>{const [x,z]=paperWalkTarget(animal.position.x,animal.position.z,side==='left'?-1:1,distance);if(Math.abs(x-animal.position.x)<1e-6)return false;route=false;go(x,z,{walking:true});return true;});},
  look(side='left'){if(state!=='idle'||seatProgress!==1)return false;route=false;watchSide=side==='right'?'right':'left';enter('watch');return true;},
  lie(){const name=manualDown||activeAction?.name==='lie-down'||restProgress>0?'sit':'lie';return dispatch(()=>requestAction(name));},
  rest(){return dispatch(()=>{route=false;target=null;waypoints=[];pendingAction=null;stayDown=false;stop();if(restProgress>0){enter('wake');}else if(state==='watch'||state==='arrival-exit'){/* finish shared return */}else if(seatProgress>0||state==='rise'||state==='sit-down')enter('sit-down');else if(!['idle','view-turn','turn'].includes(state))enter('finish');});},
  update(dt){
   if(!Number.isFinite(dt)||dt<0||dt>.1)throw Error('Invalid paper step');
   const before=animal.position.clone();
   if(state==='run'&&travel&&target){
    travelAge+=dt;const p=travel.plan.at(travelAge),ratio=travel.plan.distance?p.distance/travel.plan.distance:1;
    travelDistance=p.distance;motionSpeed=p.speed;motionStage=p.stage;
    const gain=travel.plan.distance?p.speed/travel.plan.distance:0;
    animal.follow({x:travel.x+travel.dx*ratio,y:0,z:travel.z+travel.dz*ratio},{x:travel.dx*gain,y:0,z:travel.dz*gain},{heading:travel.heading});
    arrived=p.done;
   }
   animal.update(dt);
   const prepareDt=dt*preparationRate;
   age+=['view-turn','turn','rise','watch','arrival-exit','launch','wake'].includes(state)?prepareDt:dt;
   const distance=Math.hypot(animal.position.x-before.x,animal.position.z-before.z);
   director.update(dt,state==='run',distance);
   if(state==='run'){
    phase+=distance/travel.stride;
    if(target&&arrived){completed=true;stop();target=null;if(movementMode==='walk')playAction('walk-exit',()=>{movementMode='run';enter(walkTransitions?'idle':'settle');drain();});else enter('finish');}
   }else if(state==='action'&&age>=activeAction.duration){
    const done=actionDone;activeAction=null;actionDone=null;done();
   }else if(state==='launch'&&age>=launchSeconds()){
    phase=Math.ceil(phase);prepareDirection();
   }else if(state==='finish'&&age>=.22){
    phase=Math.ceil(phase);
    if(!target&&waypoints.length){target=waypoints.shift();faceTarget(false);}
    if(target&&Math.hypot(target[0]-animal.position.x,target[1]-animal.position.z)>.12){
     prepareDirection();
    }else if(pendingAction)prepareDirection();else settle();
   }else if(state==='view-turn'&&age>=viewTurnSeconds()){view=turnView;prepareDirection();}
   else if(state==='turn'&&age>=turnSeconds()){flip=turnFlip;prepareDirection();}
   else if(state==='sit-down'){seatProgress=Math.min(1,seatProgress+dt/(snappyPreparation()?.35:.95));if(seatProgress===1){seatVariant='default';enter('idle');if(pendingAction)prepareDirection();}}
   else if(state==='rise'){seatProgress=Math.max(0,seatProgress-prepareDt/(snappyPreparation()?.28:.65));if(seatProgress===0){if(seatVariant==='arrival')enter('arrival-exit');else prepareDirection();}}
   else if(state==='arrival-exit'&&age>=.22){seatVariant='default';prepareDirection();}
   else if(state==='watch'&&age>=1.4){if(pendingAction)prepareDirection();else if(target)enter('rise');else enter('idle');}
   else if(state==='recline'){const end=stayDown?.25:1;restProgress=Math.min(end,restProgress+dt/1.8);if(restProgress===end)enter(stayDown?'down':'nap');}
   else if(state==='nap'&&age>=5&&!stayDown){enter('wake');}
   else if(state==='wake'){restProgress=Math.max(0,restProgress-prepareDt/1.2);if(restProgress===0){if(pendingAction)prepareDirection();else if(target)enter('rise');else enter('idle');}}
   else if(state==='idle'&&route&&age>=idleHold)nextRoute();
   else if(state==='settle'&&age>=.35)enter('idle');
  },
  sample(clock,{poseFps=24}={}){
   if(![12,24,30].includes(poseFps))throw Error('Invalid pose cadence');
   let pair=20,blend=0,kind=state,rearPair=null,approachPair=null;
   let seat=state==='sit-down'||state==='rise'||seatProgress>0?Math.round(seatProgress*48)/48:null;
   let behavior=null,behaviorProgress=0;
   let actionName=activeAction?.name??(state==='run'&&movementMode==='walk'?'walk':null),actionProgress=activeAction?(activeAction.timing?activeAction.timing.progressAt(age):Math.min(1,age/activeAction.duration)):phase;
   if(manualDown&&state==='down'){actionName='lie-down';actionProgress=1;}
   if(walkTransitions&&state==='view-turn'&&turnView==='front'){
    actionName=view==='approach'?'walk-face-front':'walk-face-rear';actionProgress=Math.min(1,age/viewTurnSeconds());
   }
   // This clip is a calibrated standing half-turn, not walk-specific motion.
   // The old turn's intro/outro added an unrelated squat to every reversal.
   if(walkTransitions&&state==='turn'){actionName='walk-turn';actionProgress=Math.min(1,age/turnSeconds());}
   if(view==='approach'&&approachPlan&&(state==='run'||(state==='finish'&&completed))){const p=approachPlan.at(travelDistance);if(state==='finish'){behavior='brake';behaviorProgress=1;}else if(p.clip!=='run'){behavior=p.clip;behaviorProgress=p.progress;}}
   if(state==='arrival-exit'){behavior='finish';behaviorProgress=Math.min(1,age/.22);}
   if(state==='watch'){behavior=`watch-${watchSide}`;behaviorProgress=Math.min(1,age/1.4);}
   if(restProgress>0||state==='recline'||state==='wake'||state==='nap'){behavior='rest';behaviorProgress=restProgress;}
   if(state==='run'||state==='finish'){
    const p=state==='finish'?phase+(Math.ceil(phase)-phase)*Math.min(1,age/.22):phase;
    const q=view!=='front'?(p%1)*8:retimeRun((p%1)*20,info.run_timing);pair=Math.floor(q)%info.run_sequence.length;blend=q-Math.floor(q);if(view==='rear')rearPair=5+pair;if(view==='approach')approachPair=5+pair;
   }else if(state==='view-turn'){
    const q=Math.min(4.999999,age/viewTurnSeconds()*5),i=Math.floor(q);if(view==='approach'||turnView==='approach')approachPair=(view==='front'?0:13)+i;else rearPair=(view==='front'?0:13)+i;blend=q-i;
   }else if(state==='turn'){
    const t=Math.min(1,age/turnSeconds());
    if(t<.15){pair=flip?43:41;blend=t/.15;}
    else if(t<.85){const q=(t-.15)/.7*11,i=Math.min(10,Math.floor(q));pair=flip?40-i:30+i;blend=flip?1-(q-i):q-i;}
    else{pair=flip?44:42;blend=(t-.85)/.15;}
   }else if(state==='launch'){pair=45;blend=Math.min(1,age/launchSeconds());if(view==='rear'){rearPair=5;blend=0;}}
   else if(state==='settle'){pair=46;blend=Math.min(1,age/.35);}
   else{const q=Math.floor((walkTransitions&&state==='idle'?age:clock)*poseFps)/poseFps*6;pair=20+Math.floor(q)%10;blend=q-Math.floor(q);}
   if(view==='rear'&&(state==='idle'||state==='settle'||state==='turn')){rearPair=5;blend=0;}
   if(view==='approach'&&(state==='idle'||state==='settle'||state==='turn'||state==='launch')){approachPair=5;blend=0;}
   // Deliberate held source poses: no live frame blending or face/body deformation.
   blend=Math.round(blend*16)/16;
   const key=`${state}/${actionName}/${view}/${turnView}/${poseFps}/${Math.floor(clock*poseFps)}`;
   if(held?.key===key){pair=held.pair;blend=held.blend;rearPair=held.rearPair;approachPair=held.approachPair;seat=held.seat;behavior=held.behavior;behaviorProgress=held.behaviorProgress;actionName=held.actionName;actionProgress=held.actionProgress;}else held={key,pair,blend,rearPair,approachPair,seat,behavior,behaviorProgress,actionName,actionProgress,posePhase:phase};
   return{state:state==='run'||state==='finish'?'run':kind,pair,blend,rearPair,approachPair,seatProgress:seat,seatVariant,behavior,behaviorProgress,actionName,actionProgress,queued:!!deferred,view,straight,flip:state==='turn'&&!walkTransitions?false:flip,phase,posePhase:held.posePhase,stride:travel?.stride??PAPER_GAITS.front.stride,heading:travel?.heading??0,speed:motionSpeed,motionStage,travelDistance,energy:director.report.energy,x:animal.position.x,z:animal.position.z};
  },get state(){return state;}
 };
}

export function createPaperRenderer(cache,info,meta,width,height,{rear,approach,seat,arrivalSeat,behaviors,actions,interactions,contacts=true,pawTransport=false}={}){
 if(![width,height].every(Number.isInteger)||width<2||height<2||width*height>1_000_000)throw Error('Invalid paper grid');
 const tween=createCachedTween(cache,info),renderMeta={...meta,pairs:info.pair_map,run_sequence:info.run_sequence};
 const out=new Uint8ClampedArray(width*height*4),area=createPaperAreaSampler();
 const rearSample=rear?createRearSampler(rear.bytes,rear.info):null,lock=createPaperFootLock({maxImageStretch:pawTransport?1.45:Infinity});
 const approachSample=approach?createRearSampler(approach.bytes,approach.info):null;
 const seatSample=seat?createPaperSeatSampler(seat.bytes,seat.info):null;
 const arrivalSeatSample=arrivalSeat?createPaperSeatSampler(arrivalSeat.bytes,arrivalSeat.info):null;
 const behaviorSample=behaviors?createPaperBehaviorSampler(behaviors.bytes,behaviors.info):null;
 const interactionSample=interactions?createCompanionSpriteSampler(interactions.bytes,interactions.info):null;
 const actionSample=actions?createPaperActionSampler(actions.bytes,actions.info):null,actionArea=actions?createPaperAreaSampler(actions.info.width):null;
 const walkEpisodes=actions?createPaperSupportEpisodes(actions.info.feet,actions.info.clips.walk,9):null;
 const sourceEpisodes=rear?{
  front:createPaperSupportEpisodes(rear.info.frontFeet,[0,1,2,3,4,5,6,7],17),
  rear:createPaperSupportEpisodes(rear.info.rearFeet,[5,6,7,8,9,10,11,12],9),
  approach:approach?createPaperSupportEpisodes(approach.info.feet,[5,6,7,8,9,10,11,12],9):null,
 }:null;
 const behaviorEpisodes=behaviors?Object.fromEntries(Object.entries(behaviors.info.clips).map(([name,indices])=>[name,createPaperSupportEpisodes(behaviors.info.feet,indices,9,{cyclic:name==='walk'})])):{};
 const render=(state,{x=.5,y=.85,size=.85,pixelAspect=1,contactEnabled=contacts,groundFromPixel,pixelFromGround}={})=>{
  if(![x,y,size].every(Number.isFinite)||size<=0||size>3)throw Error('Invalid paper placement');
  const isRear=state.rearPair!==null&&state.rearPair!==undefined&&rearSample;
  const isApproach=state.approachPair!==null&&state.approachPair!==undefined&&approachSample;
  const isSeat=state.seatProgress!==null&&state.seatProgress!==undefined&&seatSample;
  if(!Number.isFinite(pixelAspect)||pixelAspect<.1||pixelAspect>10)throw Error('Invalid dot pixel aspect');
  const isInteraction=state.interactionPose&&interactionSample;
  const isBehavior=!isInteraction&&state.behavior&&behaviorSample;
  const isAction=!isInteraction&&state.actionName&&actionSample,sourceN=isAction?actions.info.width:320,originX=(sourceN-320)/2,originY=(sourceN/320-1)*300;
  const image=isInteraction?interactionSample(state.interactionPose):isAction?actionSample(state):isBehavior?behaviorSample(state):isSeat?(state.seatVariant==='arrival'&&arrivalSeatSample?arrivalSeatSample:seatSample)(state.seatProgress):isApproach?approachSample(state.approachPair,state.blend):isRear?rearSample(state.rearPair,state.blend):tween(state),side=height*size,sideX=side/pixelAspect;
  // Quantize source lookup only, never the projected rectangle. Rounding side,
  // left and top first introduced whole-body scale/position jumps at thresholds.
  const left=width*x-sideX/2,floor=isInteraction||isAction||isBehavior||isSeat||isRear||isApproach?0:cleanGroundOffset(state,renderMeta),top=height*y-(300-floor)/320*side;
  let feet=[];
  if(contactEnabled&&isAction&&state.actionName==='walk'){
   const p=paperActionPose('walk',state.actionProgress,actions.info);feet=walkEpisodes(actions.info.feet[p.pair][Math.round(p.blend*8)],p.pair,p.blend,state.actionProgress);
   if(state.flip)feet=feet.map(p=>({...p,x:319-p.x}));
  }else if(contactEnabled&&rear&&state.state==='run'&&!isAction){
   const b=isBehavior?paperBehaviorPose(state,behaviors.info):null;
   feet=isBehavior?behaviors.info.feet[b.pair][Math.round(b.blend*8)]:isApproach?approach.info.feet[state.approachPair][Math.round(state.blend*8)]:isRear?rear.info.rearFeet[state.rearPair][Math.round(state.blend*8)]:rear.info.frontFeet[state.pair]?.[Math.round(state.blend*16)]??[];
   feet=isBehavior?behaviorEpisodes[state.behavior](feet,b.pair,b.blend,state.behaviorProgress):isApproach?sourceEpisodes.approach(feet,state.approachPair,state.blend,state.posePhase??state.phase??0):isRear?sourceEpisodes.rear(feet,state.rearPair,state.blend,state.posePhase??state.phase??0):sourceEpisodes.front(feet,state.pair,state.blend,state.posePhase??state.phase??0);
   if(state.flip)feet=feet.map(p=>({...p,x:319-p.x}));
  }
  const pins=lock.update(feet,{left,top,side,sideX,groundFromPixel,pixelFromGround,root:{x:state.x,z:state.z,heading:state.heading??0}},`${state.view??'front'}/${state.flip}/${state.state==='run'}/${state.actionName??state.behavior??'gallop'}`);render.lastPins=pins;
  const transport=pawTransport?createPawTransport(feet,pins,{opaque:(x,y)=>{
   const rawX=x+originX,rawY=y+originY;if(rawX<0||rawX>=sourceN||rawY<0||rawY>=sourceN)return false;
   let sx=Math.floor(rawX);if(state.flip)sx=sourceN-1-sx;
   return image[(Math.floor(rawY)*sourceN+sx)*4]>16;
  }}):null;render.lastTransport=transport;
  const minify=side<320||sideX<320,filter=isAction?actionArea:area;if(minify)filter.prepare(image);
  out.fill(0);for(let i=3;i<out.length;i+=4)out[i]=255;
  render.lastPlacement={left,top,side,sideX};
  // Measured drawn mouth of the EXACT sample above (same priority, quantization,
  // placement and mirror). Side/rear/action/interaction stay null: unsupported.
  const mouthFamily=isInteraction||isAction?null:isBehavior?'behaviors':isSeat?(state.seatVariant==='arrival'&&arrivalSeatSample?'arrivalSeat':'seat'):isApproach?'approach':null;
  const mouthInfo={behaviors:behaviors?.info,seat:seat?.info,arrivalSeat:arrivalSeat?.info,approach:approach?.info}[mouthFamily];
  const mouthFrame=mouthFamily?mouthSourceFrame(mouthFamily,state,mouthInfo):null;
  render.lastMouth=projectMouth(mouthFamily?mouthAnchor(mouthFamily,mouthFrame,mouthInfo?.sha256):null,{left,top,side,sideX},state.flip,{family:mouthFamily,frame:mouthFrame});
  const drawTop=top-originY/320*side,bottom=top+Math.max(sourceN-originY,...pins.map(p=>p.target.y+20))/320*side;
  const drawLeft=left+Math.min(-originX,...pins.map(p=>p.target.x-20))/320*sideX,drawRight=left+Math.max(sourceN-originX,...pins.map(p=>p.target.x+20))/320*sideX;
  for(let dy=Math.max(0,minify?Math.floor(drawTop):Math.ceil(drawTop-.5));dy<Math.min(height,minify?Math.ceil(bottom):Math.ceil(bottom-.5));dy++)for(let dx=Math.max(0,minify?Math.floor(drawLeft):Math.ceil(drawLeft-.5));dx<Math.min(width,minify?Math.ceil(drawRight):Math.ceil(drawRight-.5));dx++){
   const px=(dx+.5-left)/sideX*320,py=(dy+.5-top)/side*320;
   const warped=transport?transport(px,py):footSourcePoint(px,py,pins);if(!warped)continue;
   const rawX=warped.x+originX,rawY=warped.y+originY;
   let sx=Math.max(0,Math.min(sourceN-1,Math.floor(rawX)));if(state.flip)sx=sourceN-1-sx;
   const sy=Math.max(0,Math.min(sourceN-1,Math.floor(rawY))),j=(dy*width+dx)*4,k=(sy*sourceN+sx)*4;
   // Nearest-neighbor source sampling. The authored grayscale/fur remains intact.
   out[j]=out[j+1]=out[j+2]=minify?filter.sample(state.flip?sourceN-rawX:rawX,rawY,320/sideX,320/side):(rawY<0||rawY>=sourceN||rawX<0||rawX>=sourceN?0:image[k]);
  }
  return out;
 };
 render.report=()=>lock.report();render.lastPins=[];render.lastMouth=null;return render;
}
