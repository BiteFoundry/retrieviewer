import {createCachedTween,retimeRun,cleanGroundOffset} from './puppy-clean.mjs';
import {createPaperFootLock,footSourcePoint,createRearSampler,createPaperSupportEpisodes,createBakedSupportEpisodes} from './puppy-paper-contact.mjs';
import {preparationRoute,canJoinMotion} from './puppy-motion-lookup.mjs';
import {createPaperSeatSampler} from './puppy-paper-seat.mjs';
import {planPaperRun,planPaperWalk,planPaperCarry,planPaperStumble,planPaperTravel,paperWalkTarget,planPaperApproach,planPaperApproachTravel,PAPER_DYNAMICS,PAPER_GAITS,PAPER_GROUND,paperGroundTarget} from './puppy-paper-world.mjs';
import {createPaperDirector} from './puppy-paper-director.mjs';
import {createPaperBehaviorSampler,paperBehaviorPose} from './puppy-paper-behaviors.mjs';
import {createPaperAreaSampler} from './puppy-paper-area.mjs';
import {PAPER_ACTION_DURATIONS,createPaperActionSampler,paperActionPose} from './puppy-paper-actions.mjs';
import {createPawTransport} from './puppy-paper-paw-transport.mjs';
import {createCompanionSpriteSampler} from './puppy-companion-sprites.mjs';
import {createComfortSpriteSampler,comfortMotion,comfortMotionKey,comfortProgress} from './puppy-comfort-sprites.mjs';
import {mouthSourceFrame,mouthAnchor,projectMouth} from './puppy-mouth-anchor.mjs';
import {trickClipEdges} from './puppy-paper-trick-timing.mjs';

// Fixed viewer: slightly closer/wider lens gives depth without changing the art.
export {PAPER_CAMERA} from './puppy-paper-world.mjs';

// Comfort poses reuse existing clips only. Belly holds the calibrated roll-down
// source exactly at the start of the edge leaving `key` (paws-up belly), easing
// in/out with zero speed at the hold. `hold` defaults to the v9 keyOrder/edge
// boundary of roll7; createPaperComfortTimings re-derives it from action info.
export const PAPER_COMFORT_LIMITS=Object.freeze({belly:30,sleep:120,tug:30});
export const PAPER_COMFORT_TIMINGS=Object.freeze({belly:Object.freeze({key:'roll7',hold:.4449823183425605,enter:1.3,exit:1.7}),tugExit:.35});
export function createPaperComfortTimings(actionInfo,{key=PAPER_COMFORT_TIMINGS.belly.key}={}){
 const {keys,bounds}=trickClipEdges('roll-down',actionInfo),i=keys.findIndex(k=>k[0]===key);
 if(i<=0)throw Error(`Invalid comfort timing: no roll-down edge leaves ${key}`);
 return Object.freeze({...PAPER_COMFORT_TIMINGS,belly:Object.freeze({...PAPER_COMFORT_TIMINGS.belly,key,hold:bounds[i]})});
}
const comfortDuration=(name,seconds)=>{if(typeof seconds!=='number'||!Number.isFinite(seconds)||seconds<=0||seconds>PAPER_COMFORT_LIMITS[name])throw Error(`Invalid ${name} duration`);};
const comfortEase=u=>u<=0?0:u>=1?1:u*u*(3-2*u);
// Turn, hold the gaze, then return. Progress addresses the two authored edges;
// the paws and torso are registered to the same seated source in both edges.
export const PAPER_WATCH_TIMING=Object.freeze({turn:.6,hold:.65,back:.65,total:1.9});
export function paperWatchProgress(age){
 const {turn,hold,back}=PAPER_WATCH_TIMING;
 return age<turn?.5*comfortEase(age/turn):age<turn+hold?.5:.5+.5*comfortEase((age-turn-hold)/back);
}

// Original artwork only. Physics supplies ground travel; no procedural dog is drawn.
export function createPaperActor(animal,info,{manualTricks=false,trickTimings=null,walkTransitions=false,comfortTimings=PAPER_COMFORT_TIMINGS,scrambleSeconds=0,fetchMotions=null,motionTables=null}={}){
 if(!Number.isFinite(scrambleSeconds)||scrambleSeconds<0||scrambleSeconds>3)throw Error('Invalid scramble duration');
 if(fetchMotions&&(!Number.isFinite(fetchMotions.scramble?.entryPhase)||fetchMotions.scramble.entryPhase<=0||fetchMotions.scramble.entryPhase>=1||!Number.isFinite(fetchMotions.scramble.brakeSeconds)||fetchMotions.scramble.brakeSeconds<=0||fetchMotions.scramble.brakeSeconds>scrambleSeconds||!['front','rear'].every(v=>Number.isFinite(fetchMotions.pickups?.[v]?.duration)&&fetchMotions.pickups[v].duration>0&&fetchMotions.pickups[v].duration<=3)))throw Error('Invalid fetch actor metadata');
 if(fetchMotions?.scramble.trajectory==='single-pass-target'){
  if(fetchMotions.scramble.entryView!=='rear'||fetchMotions.scramble.duration!==scrambleSeconds)throw Error('Invalid single-pass view/duration');
  planPaperStumble(1,fetchMotions.scramble); // Eagerly validate the complete owned motion profile.
 }
 const recovery=fetchMotions?.scramble?.recovery;
 if(recovery&&(![recovery.start,recovery.end,recovery.distance,recovery.height].every(Number.isFinite)||recovery.start<fetchMotions.scramble.brakeSeconds||recovery.end<=recovery.start||recovery.end>scrambleSeconds||recovery.distance<0||recovery.distance>.2||recovery.height<0||recovery.height>.1))throw Error('Invalid fetch recovery metadata');
 const bellyTiming=comfortTimings?.belly;
 if(!bellyTiming||![bellyTiming.hold,bellyTiming.enter,bellyTiming.exit,comfortTimings.tugExit].every(Number.isFinite)||bellyTiming.hold<=0||bellyTiming.hold>=1||bellyTiming.enter<=0||bellyTiming.exit<=0||comfortTimings.tugExit<=0)throw Error('Invalid comfort timing');
 let state='idle',age=0,phase=0,flip=false,nextFlip=false,target=null,route=false,routeIndex=0,view='front',nextView='front',turnView='front',turnFlip=false;
 let held=null,waypoints=[];
 let preparationRate=1;
 let scrambleArmed=false,movingScramble=null,carryMode=null;
 let arrived=false;
 let straight=false,seatProgress=0,seatVariant='default',travel=null,approachPlan=null,travelAge=0,travelDistance=0,motionSpeed=0,motionStage='rest',completed=false;
 let watchSide='left',restProgress=0,idleHold=2.5;
 let pendingAction=null,activeAction=null,actionDone=null,deferred=null,movementMode='run',stayDown=false,manualDown=false,spinReady=false,runLaunchReady=false;
 let comfort=null,comfortSeconds=0,sleepLook=null,nextSleepLook={variant:'side',right:false};
 const director=createPaperDirector();
 const points=[[.12,PAPER_GROUND.away]];
 const enter=s=>{state=s;age=0;if(s==='idle')preparationRate=1;};
 const nextRoute=()=>{const choice=director.choose({x:animal.position.x,z:animal.position.z,seated:view==='approach'&&seatProgress===1});idleHold=choice.holdSeconds;if(choice.kind==='watch'){watchSide=choice.side;enter('watch');}else if(choice.kind==='rest')enter('recline');else if(choice.kind==='come')go(animal.position.x,.2,{direct:true});else go(...choice.target);};
 const settle=()=>{if(view==='approach'&&completed)seatVariant='arrival';enter(view==='approach'?'sit-down':'settle');};
 const stop=()=>{animal.follow({x:animal.position.x,y:0,z:animal.position.z},{x:0,y:0,z:0},{heading:0});motionSpeed=0;};
 const snappyPreparation=()=>!!trickTimings?.[pendingAction];
 const viewTurnSeconds=()=>snappyPreparation()?.24:walkTransitions&&movementMode==='walk'?.4:1;
 const turnSeconds=()=>snappyPreparation()?.22:.85;
 const launchSeconds=()=>snappyPreparation()?.10:.25;
 const dispatch=(fn,{keepDown=false,urgent=false}={})=>{
  if(urgent)preparationRate=3;
  if(activeAction||state==='tug'||state==='attention-paw'||state==='attention-wall'||state==='scramble'||state==='pickup'||(movementMode==='walk'&&state==='run')){route=false;deferred=()=>dispatch(fn,{keepDown,urgent});hurryComfort();return true;}
  // The calibrated trick down pose has its own byte-shared recovery; never
  // jump back into the older/larger rest illustration on another command.
  if(manualDown&&!keepDown){route=false;deferred=fn;playAction('lie-up',()=>{manualDown=false;view='approach';seatProgress=1;seatVariant='default';enter('idle');drain();},.55);return true;}
  return fn();
 };
 const drain=()=>{const fn=deferred;deferred=null;if(fn){fn();return true;}return false;};
 // Belly: 0 -> hold eased to rest, held exact source sample, eased hold -> 1.
 // Queued commands cut the remaining hold only; the roll always finishes at seat.
 const bellyAction=seconds=>{
  const {hold:H,enter:a,exit:b}=bellyTiming,t={comfort:'belly',hold:[a,a+seconds],duration:a+seconds+b};
  t.progressAt=age=>{if(!Number.isFinite(age))throw Error('Invalid comfort age');return age<t.hold[0]?H*comfortEase(age/a):age<t.hold[1]?H:H+(1-H)*comfortEase((age-t.hold[1])/b);};
  return t;
 };
 const startBelly=seconds=>{
  manualDown=false;stayDown=false;restProgress=0;comfort=null;
  const timing=bellyAction(seconds);activeAction={name:'roll-down',duration:timing.duration,timing,comfort:'belly'};actionDone=()=>finishTrick('roll');stop();enter('action');
  if(deferred)hurryComfort();
 };
 const tugProgress=()=>{if(!comfort||comfort.kind!=='tug')return 0;const h=comfort.hurry;return h?(h.length>0?Math.min(1,h.progress+(1-h.progress)*(age-h.age)/h.length):1):Math.min(1,age/comfort.seconds);};
 function hurryComfort(){
  const t=activeAction?.timing;
  if(t?.comfort==='belly'&&age<t.hold[1]){t.hold[1]=Math.max(t.hold[0],age);t.duration=activeAction.duration=t.hold[1]+bellyTiming.exit;}
  else if(state==='tug'&&comfort&&!comfort.hurry){const progress=tugProgress();comfort.hurry={progress,age,length:Math.min(comfortTimings.tugExit,(1-progress)*comfort.seconds)};}
  else if((state==='attention-paw'||state==='attention-wall')&&comfort&&!comfort.hurry){const motion=state==='attention-wall'?fetchMotions.attentionWall:fetchMotions.attentionPaw,progress=held?.comfortPose?.clip===state?held.comfortPose.progress:Math.min(1,age/comfort.seconds),from=motion.frames[comfortMotionKey(progress,motion)];comfort.hurry={from,age,length:motion.releases[from].duration};}
 }
 const playAction=(name,done,duration=PAPER_ACTION_DURATIONS[name])=>{const timing=trickTimings?.[name];duration=timing?.duration??duration;if(!Number.isFinite(duration)||duration<=0)throw Error('Invalid paper action duration');activeAction={name,duration,timing};actionDone=done;stop();enter('action');};
 const finishTrick=name=>{if(name!=='spin'){view='approach';flip=false;seatProgress=1;seatVariant='default';enter('idle');}else{view='front';flip=false;seatProgress=0;enter('settle');}drain();};
 const issue=(skipEntry=false)=>{
  // The walk-enter drawing finishes at a shared standing endpoint. A direct
  // interaction queued during it must not start the obsolete walk afterwards.
  if(skipEntry&&deferred){drain();return;}
  if(movementMode==='walk'&&!skipEntry){playAction('walk-enter',()=>issue(true));return;}
  // The front gallop begins at the crouched end of the existing launch strip.
  // Reach that pose from the standing turn before starting distance-driven gait.
  if(walkTransitions&&movementMode==='run'&&view==='front'&&!runLaunchReady){runLaunchReady=true;enter('launch');return;}
  runLaunchReady=false;
  arrived=false;completed=false;travelAge=0;travelDistance=0;const x=animal.position.x,z=animal.position.z;if(straight&&view==='approach')target[0]=x;
  const dx=target[0]-x,dz=target[1]-z,distance=Math.hypot(dx,dz),run=movementMode==='walk'?planPaperWalk(distance):planPaperRun(distance);phase=Math.ceil(phase);
  travel={x,z,dx,dz,heading:Math.atan2(dx,dz),stride:view==='approach'?PAPER_GAITS.approach.stride:run.stride,plan:view==='approach'?planPaperApproachTravel(distance):run.plan};approachPlan=view==='approach'?planPaperApproach(distance):null;stop();enter('run');
  if(['trot','run-trot'].includes(carryMode)&&fetchMotions?.carryTrot&&view==='approach'&&distance>0){
   const carry=planPaperCarry(distance,{mixed:carryMode==='run-trot',settleSeconds:fetchMotions.carryTrot.settle.duration});
   Object.assign(travel,{plan:carry,carry,stride:carry.stride});approachPlan=null;
  }
  if(scrambleArmed&&fetchMotions?.scramble.trajectory==='single-pass-target'&&view===fetchMotions.scramble.entryView&&!waypoints.length){
   const stumble=planPaperStumble(distance,fetchMotions.scramble);
   if(motionTables&&!canJoinMotion(motionTables,'rear-run/scramble',{view,phase:stumble.entryPhase,speed:stumble.entrySpeed,nextSpeed:stumble.impactAt(0).speed}))throw Error('Unsafe baked run/impact connection');
   Object.assign(travel,{plan:stumble.plan,stride:stumble.stride,stumble,scrambleAt:stumble.entryTime});
  }else if(scrambleArmed&&fetchMotions&&view==='front'&&!waypoints.length&&fetchMotions.scramble.trajectory!=='single-pass-target'){
   // Last matching forepaw contact before the endpoint. Invert the existing
   // distance profile once, not on every frame. Source frame pair5/blend0 is
   // shared EXACTLY with the new motion's first key.
   const contact=fetchMotions.scramble.entryPhase,cycle=Math.max(0,Math.floor(distance/travel.stride-contact-.15)),d=(cycle+contact)*travel.stride;
   let lo=0,hi=travel.plan.duration;for(let i=0;i<40;i++){const mid=(lo+hi)/2;if(travel.plan.at(mid).distance<d)lo=mid;else hi=mid;}
   travel.scrambleAt=(lo+hi)/2;
  }
 };
 const prepareAction=()=>{
  const name=pendingAction,desired=name==='spin'?'front':'approach';
  if(restProgress>0){enter('wake');return;}
  if(motionTables){
   const [step,target]=preparationRoute(motionTables,'action',{view,flip,seatProgress,desired:name==='spin'?'stand':'seat',speed:motionSpeed});
   if(step!=='ready'){if(step==='view-turn')turnView=target;else if(step==='turn')turnFlip=target;enter(step);return;}
  }else{
   if(name==='spin'&&seatProgress>0){enter('rise');return;}
   if(flip&&view!=='front'){turnView='front';enter('view-turn');return;}
   if(flip){turnFlip=false;enter('turn');return;}
   if(view!==desired){turnView=view==='front'?desired:'front';enter('view-turn');return;}
   if(name!=='spin'&&seatProgress<1){enter('sit-down');return;}
  }
  // Spin's own cache starts at key24; prepare it once, only AFTER the standing
  // facing change. Do not crouch before a standing turn and then crouch again.
  if(walkTransitions&&name==='spin'&&!spinReady){spinReady=true;enter('launch');return;}
  pendingAction=null;
  if(name==='sit'){enter('idle');return;}
  if(name==='belly'){const seconds=comfortSeconds;playAction('lie-down',()=>startBelly(seconds),.65);return;}
  if(name==='sleep'){stayDown=false;sleepLook={...nextSleepLook};comfort={kind:'sleep',seconds:comfortSeconds};enter('recline');return;}
  if(name==='tug'){stop();comfort={kind:'tug',seconds:comfortSeconds};enter('tug');return;}
  if(name==='attention-paw'||name==='attention-wall'){stop();held=null;comfort={kind:name,seconds:(name==='attention-wall'?fetchMotions.attentionWall:fetchMotions.attentionPaw).duration};enter(name);return;}
  if(name==='lie'){
   if(manualTricks){playAction('lie-down',()=>{manualDown=true;enter('down');drain();},.65);}
   else{stayDown=true;enter('recline');}
   return;
  }
  playAction(name,()=>finishTrick(name));
 };
 const prepareDirection=()=>{
  if(pendingAction){prepareAction();return;}if(!target){settle();return;}
  if(motionTables){
   const [step,targetView]=preparationRoute(motionTables,'direction',{view,flip,desired:nextView,nextFlip,speed:motionSpeed});
   if(step==='view-turn'){turnView=targetView;enter(step);}else if(step==='turn'){turnFlip=targetView;enter(step);}else issue();
  }else if(nextView!==view){turnView=view==='front'?nextView:'front';enter('view-turn');}else if(view==='front'&&nextFlip!==flip){turnFlip=nextFlip;enter('turn');}else issue();
 };
 const requestAction=(name,{urgent=false}={})=>{
  preparationRate=urgent?3:1;
  runLaunchReady=false;
  if(name==='roll'&&manualDown&&state==='down'){route=false;target=null;waypoints=[];pendingAction=null;stayDown=false;manualDown=false;restProgress=0;playAction('roll-down',()=>finishTrick('roll'));return true;}
  if(name==='roll'&&state==='down'&&restProgress===.25){route=false;target=null;waypoints=[];pendingAction=null;stayDown=false;restProgress=0;playAction('roll-down',()=>finishTrick('roll'));return true;}
  if(name==='belly'&&state==='down'&&(manualDown||restProgress===.25)){route=false;target=null;waypoints=[];pendingAction=null;startBelly(comfortSeconds);return true;}
  if(name==='sleep'&&state==='sleep'&&comfort?.kind==='sleep'){comfort.seconds=age+comfortSeconds;return true;}
  comfort=null;route=false;target=null;waypoints=[];pendingAction=name;spinReady=false;completed=false;stayDown=false;movementMode='run';stop();
  if(restProgress>0||state==='recline'||state==='wake')enter('wake');
  else if(['watch','view-turn','turn','arrival-exit'].includes(state)){/* reach a shared endpoint */}
  else if(['run','finish','launch','settle'].includes(state))enter('finish');
  // Only the spin owns a crouched endpoint. Ordinary commands must not borrow
  // its old launch (neutral -> key24) before doing their actual preparation.
  else if(state==='idle'&&seatProgress===0&&view==='front'&&!walkTransitions)enter('launch');else prepareDirection();
  return true;
 };
 const faceTarget=direct=>{nextFlip=target[0]<animal.position.x;const dz=target[1]-animal.position.z,dx=target[0]-animal.position.x;straight=direct;nextView=direct?'approach':Math.abs(dz)>.16&&Math.abs(dz)>Math.abs(dx)*.7?(dz<0?'rear':'approach'):'front';};
 function go(x,z,{direct=false,walking=false,urgent=false,scramble=false,returnMode=null}={}){
  if(![x,z].every(Number.isFinite))throw Error('Invalid paper target');
  preparationRate=urgent?3:1;
  runLaunchReady=false;
  carryMode=returnMode;
  scrambleArmed=!!(scramble&&fetchMotions);movingScramble=null;
  target=paperGroundTarget(x,z);
  pendingAction=null;stayDown=false;comfort=null;movementMode=walking?'walk':'run';
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
  // Attention interrupts a journey, not its momentum. Continue the current
  // heading/gait while braking from the actual velocity, then recover to sit.
  // Rolls/tugs still finish their connected authored recovery via dispatch.
  attend(){
   if(state!=='run'||!travel||!target||motionSpeed<1e-8)return dispatch(()=>requestAction('sit',{urgent:true}),{urgent:true});
   const n=Math.hypot(travel.dx,travel.dz),remaining=Math.max(0,travel.plan.distance-(travelDistance-(travel.distanceBase??0)));
   const a=movementMode==='walk'?PAPER_DYNAMICS.walkDeceleration:PAPER_DYNAMICS.deceleration;
   const distance=Math.min(remaining,motionSpeed**2/(2*a));
   if(!n||distance<1e-10)return dispatch(()=>requestAction('sit',{urgent:true}),{urgent:true});
   const x=animal.position.x,z=animal.position.z,dx=travel.dx/n*distance,dz=travel.dz/n*distance;
   const plan=planPaperTravel(distance,{speed:motionSpeed,startSpeed:motionSpeed,deceleration:motionSpeed**2/(2*distance)});
   travel={...travel,x,z,dx,dz,plan,distanceBase:travelDistance,attending:true};
   travelAge=0;target=[x+dx,z+dz];waypoints=[];route=false;deferred=null;
   pendingAction='sit';preparationRate=3;scrambleArmed=false;completed=false;
   return true;
  },
  go(x,z){if(![x,z].every(Number.isFinite))throw Error('Invalid paper target');return dispatch(()=>{route=false;go(x,z);});},
  // Eager attention changes preparation/recovery cadence only. Existing dispatch
  // keeps actions/walks at safe endpoints; root physics and gait are unchanged.
  chase(x,z,{scramble=false,returnMode=null}={}){if(![x,z].every(Number.isFinite)||![null,'brake','trot','run-trot'].includes(returnMode))throw Error('Invalid paper target/return mode');return dispatch(()=>{route=false;go(x,z,{urgent:true,scramble,returnMode});},{urgent:true});},
  come(){return dispatch(()=>{route=false;if(state==='idle'&&seatProgress===1&&Math.abs(animal.position.z-.2)<.002)return;go(animal.position.x,.2,{direct:true});});},
  roam(){return dispatch(()=>{route=true;routeIndex=0;go(...points[routeIndex]);});},
  sit({urgent=false}={}){return dispatch(()=>requestAction('sit',{urgent}),{urgent});},spin(){return dispatch(()=>requestAction('spin'));},roll(){return dispatch(()=>requestAction('roll'),{keepDown:true});},
  walk(side,distance=1.05){if(!['left','right'].includes(side)||!Number.isFinite(distance)||distance<=0)throw Error('Invalid walk command');return dispatch(()=>{const [x,z]=paperWalkTarget(animal.position.x,animal.position.z,side==='left'?-1:1,distance);if(Math.abs(x-animal.position.x)<1e-6)return false;route=false;go(x,z,{walking:true});return true;});},
  look(side='left'){if(state!=='idle'||seatProgress!==1)return false;route=false;watchSide=side==='right'?'right':'left';enter('watch');return true;},
  lie(){const name=manualDown||activeAction?.name==='lie-down'||restProgress>0?'sit':'lie';return dispatch(()=>requestAction(name));},
  // Comfort poses: bounded finite seconds; same dispatch safety as tricks.
  belly(seconds=6){comfortDuration('belly',seconds);return dispatch(()=>{comfortSeconds=seconds;return requestAction('belly');},{keepDown:true});},
  sleep(seconds=25,variant='side',right=false){comfortDuration('sleep',seconds);if(!['side','belly','curl','chin'].includes(variant)||typeof right!=='boolean')throw Error('Invalid sleep pose');return dispatch(()=>{comfortSeconds=seconds;nextSleepLook={variant,right};return requestAction('sleep');});},
  tug(seconds=6){comfortDuration('tug',seconds);return dispatch(()=>{comfortSeconds=seconds;return requestAction('tug');});},
  attentionPaw(){if(!fetchMotions?.attentionPaw)return false;return dispatch(()=>requestAction('attention-paw'));},
  get canAttentionPaw(){return !!fetchMotions?.attentionPaw;},
  attentionWall(){if(!fetchMotions?.attentionWall)return false;return dispatch(()=>requestAction('attention-wall'));},
  get canAttentionWall(){return !!fetchMotions?.attentionWall;},
  get canScramble(){return scrambleSeconds>0;},
  get canMovingScramble(){return !!fetchMotions;},
  get canSinglePassScramble(){return fetchMotions?.scramble.trajectory==='single-pass-target';},
  get canPickup(){return !!fetchMotions;},
  get canCarryTrot(){return !!fetchMotions?.carryTrot;},
  pickup(){if(!fetchMotions||state!=='idle'||seatProgress>0||!['rear','front'].includes(view))return false;route=false;target=null;waypoints=[];pendingAction=null;stop();comfort={kind:'pickup',seconds:fetchMotions.pickups[view].duration};enter('pickup');return true;},
  scramble(){if(!scrambleSeconds||state!=='idle'||view!=='front'||seatProgress>0)return false;route=false;target=null;waypoints=[];pendingAction=null;stop();comfort={kind:'scramble',seconds:scrambleSeconds};enter('scramble');return true;},
  rest(){return dispatch(()=>{route=false;target=null;waypoints=[];pendingAction=null;stayDown=false;comfort=null;stop();if(restProgress>0){enter('wake');}else if(state==='watch'||state==='arrival-exit'){/* finish shared return */}else if(seatProgress>0||state==='rise'||state==='sit-down')enter('sit-down');else if(!['idle','view-turn','turn'].includes(state))enter('finish');});},
  update(dt){
   if(!Number.isFinite(dt)||dt<0||dt>.1)throw Error('Invalid paper step');
   const beforeX=animal.position.x,beforeZ=animal.position.z;
   let enteredScramble=false;
   if(state==='run'&&travel&&target){
    travelAge+=dt;const p=travel.plan.at(travelAge),ratio=travel.plan.distance?p.distance/travel.plan.distance:1;
    travelDistance=(travel.distanceBase??0)+p.distance;motionSpeed=p.speed;motionStage=p.stage;
    const gain=travel.plan.distance?p.speed/travel.plan.distance:0;
    animal.follow({x:travel.x+travel.dx*ratio,y:0,z:travel.z+travel.dz*ratio},{x:travel.dx*gain,y:0,z:travel.dz*gain},{heading:travel.heading});
    arrived=p.done;
    if(scrambleArmed&&travel.scrambleAt!==undefined&&travelAge>=travel.scrambleAt){
     const entry=travel.plan.at(travel.scrambleAt),ratio=entry.distance/travel.plan.distance,n=travel.plan.distance;
     const x=travel.x+travel.dx*ratio,z=travel.z+travel.dz*ratio,ux=travel.dx/n,uz=travel.dz/n;
     const end=paperGroundTarget(x+ux*entry.speed*fetchMotions.scramble.brakeSeconds/2,z+uz*entry.speed*fetchMotions.scramble.brakeSeconds/2);
     const distance=Math.hypot(end[0]-x,end[1]-z),brake=entry.speed?2*distance/entry.speed:0;
     const fullEnd=paperGroundTarget(end[0]+ux*(recovery?.distance??0),end[1]+uz*(recovery?.distance??0));
     movingScramble={x,z,ux,uz,speed:entry.speed,brake,distance,travelBase:entry.distance,hop:Math.hypot(fullEnd[0]-end[0],fullEnd[1]-end[1]),profile:travel.stumble??null};
     scrambleArmed=false;target=null;waypoints=[];comfort={kind:'scramble',seconds:scrambleSeconds};enter('scramble');age=travelAge-travel.scrambleAt;enteredScramble=true;
    }
   }
   if(state==='scramble'&&movingScramble){
    const m=movingScramble,time=age+(enteredScramble?0:dt),t=Math.min(m.brake,time),p=recovery?Math.max(0,Math.min(1,(time-recovery.start)/(recovery.end-recovery.start))):0;
    const hop=m.hop*(1-Math.cos(Math.PI*p))/2,hopSpeed=recovery&&p>0&&p<1?m.hop*Math.PI/(2*(recovery.end-recovery.start))*Math.sin(Math.PI*p):0;
    const kinematic=m.profile?.impactAt(time),speed=kinematic?.speed??((m.brake?m.speed*(1-t/m.brake):0)+hopSpeed),d=kinematic?.distance??((m.brake?m.speed*t-.5*m.speed/m.brake*t*t:0)+hop);
    animal.follow({x:m.x+m.ux*d,y:0,z:m.z+m.uz*d},{x:m.ux*speed,y:0,z:m.uz*speed},{heading:travel.heading});travelDistance=m.travelBase+d;motionSpeed=speed;motionStage=kinematic?.stage??(hopSpeed>1e-8?'recovery':speed?'braking':'rest');
   }
   animal.update(dt);
   const prepareDt=dt*preparationRate;
   // Urgent fetches accelerate only authored preparation/recovery, never root
   // travel or its distance-driven stride. Deferred tricks reach their shared
   // endpoint promptly instead of ignoring a thrown ball for several seconds.
   if(!enteredScramble)age+=['view-turn','turn','rise','watch','arrival-exit','launch','wake','finish','settle'].includes(state)||(state==='action'&&deferred)?prepareDt:dt;
   const distance=Math.hypot(animal.position.x-beforeX,animal.position.z-beforeZ);
   director.update(dt,state==='run',distance);
   if(state==='run'){
    phase+=distance/(travel.carry&&travelDistance<travel.carry.runDistance?PAPER_GAITS.approach.stride:travel.stride);
    if(target&&arrived){completed=true;stop();target=null;if(movementMode==='walk')playAction('walk-exit',()=>{movementMode='run';enter(walkTransitions?'idle':'settle');if(pendingAction)prepareDirection();else drain();});else enter('finish');}
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
   else if(state==='sit-down'){seatProgress=Math.min(1,seatProgress+prepareDt/(snappyPreparation()?.35:.95));if(seatProgress===1){seatVariant='default';enter('idle');if(pendingAction)prepareDirection();}}
   else if(state==='rise'){seatProgress=Math.max(0,seatProgress-prepareDt/(snappyPreparation()?.28:.65));if(seatProgress===0){if(seatVariant==='arrival')enter('arrival-exit');else prepareDirection();}}
   else if(state==='arrival-exit'&&age>=.22){seatVariant='default';prepareDirection();}
   else if(state==='watch'&&age>=PAPER_WATCH_TIMING.total){if(pendingAction)prepareDirection();else if(target)enter('rise');else enter('idle');}
   else if(state==='recline'){const end=stayDown?.25:1;restProgress=Math.min(end,restProgress+dt/1.8);if(restProgress===end)enter(stayDown?'down':comfort?.kind==='sleep'?'sleep':'nap');}
   else if(state==='sleep'&&age>=comfort.seconds){comfort=null;enter('wake');}
   else if(state==='tug'&&tugProgress()>=1){comfort=null;enter('idle');drain();}
   else if((state==='attention-paw'||state==='attention-wall')&&(comfort.hurry?age-comfort.hurry.age>=comfort.hurry.length:age>=comfort.seconds)){comfort=null;enter('idle');drain();}
   else if((state==='scramble'||state==='pickup')&&age>=comfort.seconds){comfort=null;movingScramble=null;stop();enter('idle');drain();}
   else if(state==='nap'&&age>=5&&!stayDown){enter('wake');}
   else if(state==='wake'){restProgress=Math.max(0,restProgress-prepareDt/1.2);if(restProgress===0){if(pendingAction)prepareDirection();else if(target)enter('rise');else enter('idle');}}
   else if(state==='idle'&&route&&age>=idleHold)nextRoute();
   else if(state==='settle'&&age>=.35)enter('idle');
  },
  sample(clock,{poseFps=24}={}){
   if(![12,24,30].includes(poseFps))throw Error('Invalid pose cadence');
   let pair=20,blend=0,kind=state,rearPair=null,approachPair=null;
   let seat=state==='sit-down'||state==='rise'||seatProgress>0?Math.round(seatProgress*48)/48:null;
   if(restProgress===0&&state!=='recline')sleepLook=null;
   let behavior=null,behaviorProgress=0,comfortPose=state==='scramble'?{clip:'scramble',view,progress:Math.min(1,age/comfort.seconds)}:state==='pickup'?{clip:'pickup',view,progress:Math.min(1,age/comfort.seconds)}:state==='tug'?{clip:'tug',progress:tugProgress()}:sleepLook&&restProgress>.72?{clip:'sleep',...sleepLook,blend:comfortEase((restProgress-.72)/.28)}:null;
   if(state==='attention-paw'||state==='attention-wall')comfortPose={clip:state,progress:Math.min(1,age/comfort.seconds),...comfort.hurry?{release:{from:comfort.hurry.from,progress:Math.min(1,(age-comfort.hurry.age)/comfort.hurry.length)}}:{}};
   if(activeAction?.comfort)kind=activeAction.comfort;
   let actionName=activeAction?.name??(state==='run'&&movementMode==='walk'?'walk':null),actionProgress=activeAction?(activeAction.timing?activeAction.timing.progressAt(age):Math.min(1,age/activeAction.duration)):phase;
   if(manualDown&&state==='down'){actionName='lie-down';actionProgress=1;}
   if(walkTransitions&&state==='view-turn'){
    // Both directions share the same standing endpoints. The old outbound
    // material began crouched, so reversing a journey changed the dog's mass.
    actionName=(view==='approach'||turnView==='approach')?'walk-face-front':'walk-face-rear';
    const t=Math.min(1,age/viewTurnSeconds());actionProgress=turnView==='front'?t:1-t;
   }
   // This clip is a calibrated standing half-turn, not walk-specific motion.
   // The old turn's intro/outro added an unrelated squat to every reversal.
   if(walkTransitions&&state==='turn'){actionName='walk-turn';actionProgress=Math.min(1,age/turnSeconds());}
   if(view==='approach'&&approachPlan&&(state==='run'||(state==='finish'&&completed))){const p=approachPlan.at(travelDistance);if(state==='finish'&&!travel?.attending){behavior='brake';behaviorProgress=1;}else if(p.clip!=='run'){behavior=p.clip;behaviorProgress=p.progress;}}
   if(view==='approach'&&travel?.carry&&(state==='run'||state==='finish')){
    const p=state==='finish'?{clip:'carry-settle',progress:1}:travel.carry.poseAt(travelDistance);
    if(p.clip!=='run'){comfortPose=p;behavior=null;actionName=null;}
   }
   if(state==='arrival-exit'){behavior='finish';behaviorProgress=Math.min(1,age/.22);}
   if(state==='watch'){behavior=`watch-${watchSide}`;behaviorProgress=paperWatchProgress(age);}
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
   if(held?.key===key){pair=held.pair;blend=held.blend;rearPair=held.rearPair;approachPair=held.approachPair;seat=held.seat;behavior=held.behavior;behaviorProgress=held.behaviorProgress;actionName=held.actionName;actionProgress=held.actionProgress;comfortPose=held.comfortPose;}else held={key,pair,blend,rearPair,approachPair,seat,behavior,behaviorProgress,actionName,actionProgress,comfortPose,posePhase:phase};
   const hopProgress=recovery&&movingScramble?Math.max(0,Math.min(1,(age-recovery.start)/(recovery.end-recovery.start))):0;
   return{state:state==='run'||state==='finish'?'run':kind,pair,blend,rearPair,approachPair,seatProgress:seat,seatVariant,behavior,behaviorProgress,actionName,actionProgress,queued:!!deferred,view,straight,flip:state==='turn'&&!walkTransitions?false:flip,phase,posePhase:held.posePhase,stride:travel?.carry&&travelDistance<travel.carry.runDistance?PAPER_GAITS.approach.stride:travel?.stride??PAPER_GAITS.front.stride,heading:travel?.heading??0,speed:motionSpeed,motionStage,travelDistance,energy:director.report.energy,x:animal.position.x,z:animal.position.z,...(movingScramble?{bodyLift:recovery&&hopProgress>0&&hopProgress<1?recovery.height*Math.sin(Math.PI*hopProgress):0}:{}),...(comfortPose?{comfortPose:{...comfortPose}}:{})};
  },get state(){return state;}
 };
}

export function createPaperRenderer(cache,info,meta,width,height,{rear,approach,seat,arrivalSeat,behaviors,actions,interactions,comfort,contacts=true,pawTransport=false,motionTables=null,kernel=null}={}){
 if(![width,height].every(Number.isInteger)||width<2||height<2||width*height>1_000_000)throw Error('Invalid paper grid');
 const tween=createCachedTween(cache,info,kernel),renderMeta={...meta,pairs:info.pair_map,run_sequence:info.run_sequence};
 const out=new Uint8ClampedArray(width*height*4),area=createPaperAreaSampler();
 // Only one authored source is drawn at a time. Small samplers borrow a view of
 // the action-sized scratch. A sleep blend reads each base pixel before writing
 // that same pixel, so it needs no second image or per-frame temporary buffer.
 const actionScratch=new Uint8ClampedArray(Math.max(320*320,(actions?.info.width??320)*(actions?.info.height??320))*4);
 const spriteScratch=actionScratch.subarray(0,320*320*4);
 for(let i=3;i<actionScratch.length;i+=4)actionScratch[i]=255;
 const rearSample=rear?createRearSampler(rear.bytes,rear.info,spriteScratch,kernel):null,lock=createPaperFootLock({maxImageStretch:pawTransport?1.45:Infinity});
 const approachSample=approach?createRearSampler(approach.bytes,approach.info,spriteScratch,kernel):null;
 const seatSample=seat?createPaperSeatSampler(seat.bytes,seat.info,spriteScratch,kernel):null;
 const arrivalSeatSample=arrivalSeat?createPaperSeatSampler(arrivalSeat.bytes,arrivalSeat.info,spriteScratch,kernel):null;
 const behaviorSample=behaviors?createPaperBehaviorSampler(behaviors.bytes,behaviors.info,spriteScratch,kernel):null;
 const interactionSample=interactions?createCompanionSpriteSampler(interactions.bytes,interactions.info,spriteScratch,kernel):null;
 const comfortSample=comfort?createComfortSpriteSampler(comfort.bytes,comfort.info,spriteScratch):null;
 const actionSample=actions?createPaperActionSampler(actions.bytes,actions.info,actionScratch.subarray(0,actions.info.width*actions.info.height*4),motionTables?.actionClips,kernel):null,actionArea=actions?createPaperAreaSampler(actions.info.width):null;
 const episodes=(key,labels,indices,samples,options)=>motionTables?.support[key]?createBakedSupportEpisodes(motionTables.support[key]):createPaperSupportEpisodes(labels,indices,samples,options);
 const walkEpisodes=actions?episodes('walk',actions.info.feet,actions.info.clips.walk,9):null;
 const sourceEpisodes=rear?{
  front:episodes('front',rear.info.frontFeet,[0,1,2,3,4,5,6,7],17),
  rear:episodes('rear',rear.info.rearFeet,[5,6,7,8,9,10,11,12],9),
  approach:approach?episodes('approach',approach.info.feet,[5,6,7,8,9,10,11,12],9):null,
 }:null;
 const behaviorEpisodes=behaviors?Object.fromEntries(Object.entries(behaviors.info.clips).map(([name,indices])=>[name,episodes('behavior/'+name,behaviors.info.feet,indices,9,{cyclic:name==='walk'})])):{};
 const render=(state,{x=.5,y=.85,size=.85,pixelAspect=1,contactEnabled=contacts,groundFromPixel,pixelFromGround}={})=>{
  if(![x,y,size].every(Number.isFinite)||size<=0||size>3)throw Error('Invalid paper placement');
  const isRear=state.rearPair!==null&&state.rearPair!==undefined&&rearSample;
  const isApproach=state.approachPair!==null&&state.approachPair!==undefined&&approachSample;
  const isSeat=state.seatProgress!==null&&state.seatProgress!==undefined&&seatSample;
  if(!Number.isFinite(pixelAspect)||pixelAspect<.1||pixelAspect>10)throw Error('Invalid dot pixel aspect');
  const isComfort=state.comfortPose&&comfortSample;
  const isInteraction=isComfort||state.interactionPose&&interactionSample;
  const isBehavior=!isInteraction&&state.behavior&&behaviorSample;
  const isAction=!isInteraction&&state.actionName&&actionSample,sourceN=isAction?actions.info.width:320,originX=(sourceN-320)/2,originY=(sourceN/320-1)*300;
  const image=isComfort?comfortSample({...state.comfortPose,...state.comfortPose.clip==='sleep'&&state.comfortPose.blend<1&&behaviorSample?{base:behaviorSample({behavior:'rest',behaviorProgress:state.behaviorProgress})}:{}}):isInteraction?interactionSample(state.interactionPose):isAction?actionSample(state):isBehavior?behaviorSample(state):isSeat?(state.seatVariant==='arrival'&&arrivalSeatSample?arrivalSeatSample:seatSample)(state.seatProgress):isApproach?approachSample(state.approachPair,state.blend):isRear?rearSample(state.rearPair,state.blend):tween(state),side=height*size,sideX=side/pixelAspect;
  // Quantize source lookup only, never the projected rectangle. Rounding side,
  // left and top first introduced whole-body scale/position jumps at thresholds.
  const motion=isComfort?comfortMotion(state.comfortPose,comfort.info):null;
  const left=width*x-sideX/2,floor=motion?(motion.floorOffsets?.[comfortMotionKey(comfortProgress(state.comfortPose),motion)]??motion.floorOffset??0):isInteraction||isAction||isBehavior||isSeat||isRear||isApproach?0:cleanGroundOffset(state,renderMeta),top=height*y-(300-floor)/320*side;
  let feet=[];
  if(contactEnabled&&isComfort&&state.comfortPose.clip==='carry-trot'){
   const k=comfortMotionKey(state.comfortPose.progress,motion);
   feet=motion.feet[k].map(f=>({...f,episode:`carry/${state.comfortPose.cycle}/${f.id}`}));
   if(state.flip)feet=feet.map(p=>({...p,x:319-p.x}));
  }else if(contactEnabled&&isAction&&state.actionName==='walk'){
   const p=paperActionPose('walk',state.actionProgress,actions.info,motionTables?.actionClips);feet=walkEpisodes(actions.info.feet[p.pair][Math.round(p.blend*8)],p.pair,p.blend,state.actionProgress);
   if(state.flip)feet=feet.map(p=>({...p,x:319-p.x}));
  }else if(contactEnabled&&rear&&state.state==='run'&&!isAction&&!isComfort){
   const b=isBehavior?paperBehaviorPose(state,behaviors.info):null;
   feet=isBehavior?behaviors.info.feet[b.pair][Math.round(b.blend*8)]:isApproach?approach.info.feet[state.approachPair][Math.round(state.blend*8)]:isRear?rear.info.rearFeet[state.rearPair][Math.round(state.blend*8)]:rear.info.frontFeet[state.pair]?.[Math.round(state.blend*16)]??[];
   feet=isBehavior?behaviorEpisodes[state.behavior](feet,b.pair,b.blend,state.behaviorProgress):isApproach?sourceEpisodes.approach(feet,state.approachPair,state.blend,state.posePhase??state.phase??0):isRear?sourceEpisodes.rear(feet,state.rearPair,state.blend,state.posePhase??state.phase??0):sourceEpisodes.front(feet,state.pair,state.blend,state.posePhase??state.phase??0);
   if(state.flip)feet=feet.map(p=>({...p,x:319-p.x}));
  }
  const pins=lock.update(feet,{left,top,side,sideX,groundFromPixel,pixelFromGround,root:{x:state.x,z:state.z,heading:state.heading??0}},`${state.view??'front'}/${state.flip}/${state.state==='run'}/${state.comfortPose?.clip??state.actionName??state.behavior??'gallop'}`);render.lastPins=pins;
  const transport=pawTransport?createPawTransport(feet,pins,{opaque:(x,y)=>{
   const rawX=x+originX,rawY=y+originY;if(rawX<0||rawX>=sourceN||rawY<0||rawY>=sourceN)return false;
   let sx=Math.floor(rawX);if(state.flip)sx=sourceN-1-sx;
   return image[(Math.floor(rawY)*sourceN+sx)*4]>16;
  }}):null;render.lastTransport=transport;
  const minify=side<320||sideX<320,filter=isAction?actionArea:area;if(minify&&!(kernel?.blit&&transport))filter.prepare(image);
  if(kernel?.clear)kernel.clear(out);else{out.fill(0);for(let i=3;i<out.length;i+=4)out[i]=255;}
  render.lastPlacement={left,top,side,sideX};
  // Measured drawn mouth of the EXACT sample above (same priority, quantization,
  // placement and mirror). Unmeasured or occluded samples remain unsupported.
  const mouthFamily=isInteraction?null:isAction?'actions':isBehavior?'behaviors':isSeat?(state.seatVariant==='arrival'&&arrivalSeatSample?'arrivalSeat':'seat'):isApproach?'approach':null;
  const mouthInfo={actions:actions?.info,behaviors:behaviors?.info,seat:seat?.info,arrivalSeat:arrivalSeat?.info,approach:approach?.info}[mouthFamily];
  const mouthFrame=mouthFamily?mouthSourceFrame(mouthFamily,state,mouthInfo):null;
  render.lastMouth=projectMouth(mouthFamily?mouthAnchor(mouthFamily,mouthFrame,mouthInfo?.sha256):null,{left,top,side,sideX},state.flip,{family:mouthFamily,frame:mouthFrame});
  if(motion?.mouth){
   const k=comfortMotionKey(state.comfortPose.progress,motion),p=motion.mouth[k];
   render.lastMouth=projectMouth({x:p[0],y:p[1],scale:1,score:null},{left,top,side,sideX},state.flip,{family:'comfort',frame:motion.frames[k]});
  }
  const drawTop=top-originY/320*side,bottom=top+Math.max(sourceN-originY,...pins.map(p=>p.target.y+20))/320*side;
  const drawLeft=left+Math.min(-originX,...pins.map(p=>p.target.x-20))/320*sideX,drawRight=left+Math.max(sourceN-originX,...pins.map(p=>p.target.x+20))/320*sideX;
  if(kernel?.blit&&transport)kernel.blit(out,image,{width,height,sourceN,left,top,side,sideX,originX,originY,drawTop,bottom,drawLeft,drawRight,flip:state.flip,layers:transport.layers});else for(let dy=Math.max(0,minify?Math.floor(drawTop):Math.ceil(drawTop-.5));dy<Math.min(height,minify?Math.ceil(bottom):Math.ceil(bottom-.5));dy++)for(let dx=Math.max(0,minify?Math.floor(drawLeft):Math.ceil(drawLeft-.5));dx<Math.min(width,minify?Math.ceil(drawRight):Math.ceil(drawRight-.5));dx++){
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
