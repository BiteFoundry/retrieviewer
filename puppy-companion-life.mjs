// Autonomous companion "life" controller layered over a paper puppy actor.
// The parent calls actor.update(dt) THEN life.update(dt). Commands are only issued
// while the actor rests at a shared safe endpoint (idle/down); everything else waits.
// Accepted interactions ask the actor for safe interruption: chase for a ball,
// attend for a hand-fed treat/tug. Substitute actors can use safe-endpoint fallback.
// Parameters are authored for feel, not canine science.
import {paperCameraPoint,paperGroundTarget,PAPER_SCREEN,PAPER_CAMERA} from './puppy-paper-world.mjs';
import {createBallPath,createFetchPatterns} from './puppy-companion-ball.mjs';

const SAFE=new Set(['idle','down']);
export const FETCH_RETURN_STYLES=Object.freeze(['auto','brake','trot','run-trot']);
const HOME={x:0,z:.2};
const BALL_TARGET={x:0,z:-4};
const OFFER={x:0,z:.3};
// Hand-fed treat marker, relative to the puppy's current root (no travel for treats).
const TREAT_OFFSET={z:.08,height:.25};
const COOLDOWN={ball:6,treat:15,tug:20};
const CARRY_HEIGHT=.19,SETTLE_FALLBACK=.6,MAX_DT=.25,ARRIVE=.05;
// Active simulation seconds, never a wall-clock timer that wakes a hidden pet.
export const BUTTERFLY_RULES=Object.freeze({firstMin:240,firstSpread:240,cooldownMin:720,cooldownSpread:480,maxVisible:18});
const LABEL={
 notifyWall:'뒷발로 서서 벽을 박박 긁는 중',
 start:'기다리는 중',pause:'잠시 느긋하게 둘러보는 중',lie:'엎드리는 중',rest:'엎드려 쉬는 중',recover:'앉아서 기운 차리는 중',
 sit:'앉는 중',watch:'앉아서 지켜보는 중',look:'고개를 돌려 살피는 중',observe:'가만히 주변 관찰 중',
 stroll:'옆으로 살짝 걸어가는 중',sniff:'잠깐 멈춰 주변을 살피는 중',dash:'저 멀리 달려가는 중',far:'멀리서 둘러보는 중',home:'제자리로 돌아오는 중',nest:'쉴 자리를 찾아가는 중',
 patrol:'주변을 왕복 산책하는 중',scan:'양쪽을 번갈아 살피는 중',roll:'느긋하게 뒹구는 중',play:'신나서 한 바퀴 도는 중',checkin:'가까이 와서 함께 쉬는 중',
 belly:'배를 보이고 발라당 쉬는 중',sleep:'새근새근 잠자는 중',tug:'장난감을 물고 당기는 중',
 butterflyNotice:'나비를 발견하고 귀를 쫑긋하는 중',butterfly:'나비를 폴짝폴짝 쫓는 중',butterflyBye:'날아가는 나비를 바라보는 중',
 fetch:'공을 쫓아가는 중',miss:'굴러가는 공을 한 번 놓친 중',reChase:'공을 다시 쫓아가는 중',tumble:'우당탕 균형을 되찾는 중',pickup:'공을 무는 중',carry:'공을 물고 돌아오는 중',drop:'공을 내려놓는 중',offer:'공을 내려놓고 기다리는 중',
 treatSit:'간식 앞에 앉는 중',chew:'간식 먹는 중',notifySit:'확인할 일을 발견하고 앉는 중',notifyContact:'확인할 일이 있어 사용자를 바라보는 중',notifyCome:'확인할 일을 알려주러 가까이 오는 중',notifyPaw:'앞발로 살살 관심을 끄는 중',notify:'확인할 일이 있는 쪽을 바라보는 중'
};
const PENDING_LABEL={treat:'곧 간식',tug:'곧 터그놀이'};
// Baked interaction clips, played only while holding at the shared seated endpoint.
const GESTURE={'ball-pickup':.65,'ball-drop':.65,'treat-eat':2.4};
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));

function mulberry32(seed){
 let a=seed>>>0;
 return()=>{a=a+0x6d2b79f5>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};
}

export function createCompanionLife(actor,{seed=731,energy=.8,returnStyle='auto'}={}){
 for(const name of ['update','sample','go','come','sit','lie','look','walk','roll','rest'])
  if(!actor||typeof actor[name]!=='function')throw TypeError(`actor.${name} must be a function`);
 if(!Number.isInteger(seed))throw TypeError('seed must be an integer');
 if(!Number.isFinite(energy)||energy<0||energy>1)throw RangeError('energy must be within 0..1');
 const validateReturnStyle=style=>{if(!FETCH_RETURN_STYLES.includes(style))throw RangeError('returnStyle must be auto, brake, trot or run-trot');if(['trot','run-trot'].includes(style)&&!actor.canCarryTrot)throw Error('Carry-trot artwork is not available');};
 validateReturnStyle(returnStyle);

 const rand=mulberry32(seed),range=(a,b)=>a+(b-a)*rand(),side=()=>rand()<.5?'left':'right';
 // Spatial choices get their own stream, like the rare visitor. Existing gait,
 // energy and interaction timing do not depend on how a resting spot is picked.
 const spaceRand=mulberry32(seed^0x28ae91c7),spaceRange=(a,b)=>a+(b-a)*spaceRand();
 const toyRand=mulberry32(seed^0x6c82b14d),chooseFetch=createFetchPatterns(toyRand,{canTumble:actor.canScramble===true});
 const returnRand=mulberry32(seed^0x73bca165);let lastReturnMode=null;
 let placeSide=spaceRand()<.5?-1:1,outings=0,nearSeconds=0,lastCheckin=-Infinity;
 // Separate stream: the rare encounter does not perturb ordinary episodes/gaits.
 const encounterRand=mulberry32(seed^0x4bf17a93),encounterRange=(a,b)=>a+(b-a)*encounterRand();
 let nextButterfly=BUTTERFLY_RULES.firstMin+encounterRange(0,BUTTERFLY_RULES.firstSpread),butterfly=null;
 const needs={energy,social:.5,curiosity:.5,drowsiness:0};
 const cooldowns={ball:0,treat:0,tug:0};
 const episodeCooldowns={roll:0,play:0,belly:0,sleep:0};
 let clock=0,decisions=0,lastEpisode=null,quiet=0;
 let queue=[],hold=0,holdIntent=null,waiting=null,gesture=null;
 let intent='start',label=LABEL.start,pending=null,active=null,ball=null,treat=null;
 let fetchPlan=null,notice=null,noticeCount=0;

 const cmd=(name,args,step,when)=>({cmd:name,args,intent:step,label:LABEL[step],when});
 const wait=(seconds,step)=>({hold:seconds,intent:step,label:LABEL[step]});
 const play=(clip,step)=>({hold:GESTURE[clip],gesture:clip,intent:step,label:LABEL[step]});
 // Skip sit() when the actor already rests in the canonical front-seated endpoint.
 const unseated=()=>{const s=actor.sample(clock);return !(actor.state==='idle'&&s.seatProgress===1&&s.view==='approach'&&(s.seatVariant??'default')==='default');};
 // Treats accept any seat variant at the front-seated endpoint: the hand comes to the puppy.
 const seatedAnyVariant=()=>{const s=actor.sample(clock);return actor.state==='idle'&&s.seatProgress===1&&s.view==='approach';};
 const fx=fn=>({fx:fn});
 const home=()=>cmd('go',[HOME.x,HOME.z],'home',()=>{const s=actor.sample(clock);return Math.hypot(s.x-HOME.x,s.z-HOME.z)>ARRIVE;});
 const sit=step=>cmd('sit',[],step,()=>!seatedAnyVariant());
 const lie=()=>cmd('lie',[],'lie',()=>actor.state!=='down');
 const walkTo=x=>cmd('walk',()=>{const dx=x-actor.sample(clock).x;return [dx<0?'left':'right',Math.abs(dx)];},'patrol',()=>Math.abs(x-actor.sample(clock).x)>.002);
 const roomRadius=z=>Math.max(.12,paperCameraPoint(0,0,z).depth*PAPER_SCREEN.widthMeters/(2*PAPER_SCREEN.viewDistance)-PAPER_CAMERA.canvasMeters/2);
 const place=nap=>{
  // A nearer side nook keeps a sleeping face readable; outings also use the
  // middle/far ground. X expands with camera depth, not a fixed world corridor.
  const bands=[[1.4,3],[4,8],[.7,1.4],[9,15]],band=bands[outings++%bands.length];
  const z=-(nap?spaceRange(.7,2.6):spaceRange(...band));placeSide*=-1;
  return paperGroundTarget(placeSide*roomRadius(z)*spaceRange(.5,.8),z);
 };
 const travelTo=(target,step)=>cmd('go',target,step,()=>{const s=actor.sample(clock);return Math.hypot(s.x-target[0],s.z-target[1])>.12;});
 const quietPlace=()=>{
  const s=actor.sample(clock);
  // Often stay in the nook just discovered, instead of shuffling before every
  // nap. A front-and-center or very distant puppy first finds a quieter spot.
  if(s.z<=-.5&&s.z>=-3.5&&Math.abs(s.x)>roomRadius(s.z)*.3&&spaceRand()<.65)return [];
  return [travelTo(place(true),'nest')];
 };
 const butterflyPoint=()=>{
  if(!butterfly)return null;
  const elapsed=clock-butterfly.since,p=clamp(elapsed/.65,0,1),ease=p*p*(3-2*p);
  const leaving=butterfly.leaving?clamp((clock-butterfly.leaving)/1.1,0,1):0;
  return {x:butterfly.from.x+(butterfly.to.x-butterfly.from.x)*ease+.025*Math.sin(elapsed*5)+leaving*.2*butterfly.side,
   z:butterfly.from.z+(butterfly.to.z-butterfly.from.z)*ease,
   height:.45+.045*Math.sin((clock-butterfly.start)*6)+leaving*.35,
   phase:((clock-butterfly.start)*5)%1,opacity:1-leaving};
 };
 const butterflyEpisode=()=>{
  const s=actor.sample(clock),radius=roomRadius(s.z);
  const direction=s.x>radius-.3?-1:s.x< -radius+.3?1:encounterRand()<.5?-1:1;
  const targets=[clamp(s.x+direction*.36,-radius,radius),clamp(s.x-direction*.38,-radius,radius),clamp(s.x+direction*.24,-radius,radius)];
  const z=s.z;
  const moveFly=x=>fx(()=>{
   const from=butterflyPoint()??{x:s.x-direction*.28,z};
   const heading=x<actor.sample(clock).x?-1:1;
   // The dog root is its body center, NOT its nose. Keep the visitor ahead of
   // the muzzle on each leg, rather than hovering behind the running face.
   butterfly={start:butterfly?.start??clock,since:clock,from:{x:from.x,z:from.z},to:{x:x+heading*.23,z},side:heading,leaving:0};
  });
  // Look names are dog-relative: its left is the viewer's right.
  return [sit('butterflyNotice'),moveFly(targets[0]),cmd('look',[direction<0?'right':'left'],'butterflyNotice'),wait(.8,'butterflyNotice'),
   ...targets.flatMap((x,i)=>[...(i?[moveFly(x)]:[]),cmd(typeof actor.chase==='function'?'chase':'go',[x,z],'butterfly'),wait(.3,'butterfly')]),
   fx(()=>{if(butterfly)butterfly.leaving=clock;}),wait(1.1,'butterflyBye'),fx(()=>{butterfly=null;needs.energy-=.12;needs.curiosity-=.25;}),
   sit('recover'),wait(range(3,6),'recover')];
 };

 // Each episode is a short coherent plan; a pause always leads in so autonomy never stalls.
 const EPISODES={
  rest:()=>[...quietPlace(),lie(),wait(range(10,18),'rest'),sit('recover'),wait(range(3,6),'recover')],
  watch:()=>[sit('sit'),cmd('look',[side()],'look'),wait(range(3,9),'watch'),fx(()=>{needs.social-=.3;needs.curiosity+=.1;})],
  observe:()=>[sit('sit'),cmd('look',[side()],'look'),wait(range(3,9),'observe'),fx(()=>{needs.curiosity-=.15;})],
  stroll:()=>[cmd('walk',[side(),range(.22,.5)],'stroll'),wait(range(4,9),'sniff'),fx(()=>{needs.energy-=.08;needs.curiosity-=.2;})],
  dash:()=>[travelTo(place(false),'dash'),sit('far'),wait(range(8,16),'far'),fx(()=>{needs.energy-=.22;needs.curiosity-=.3;})],
  scan:()=>[sit('sit'),cmd('look',['left'],'scan'),wait(range(.5,1.5),'scan'),cmd('look',['right'],'scan'),wait(range(2,4),'observe'),fx(()=>{needs.curiosity-=.25;})],
  patrol:()=>{const x=actor.sample(clock).x,d=range(.16,.3)*(rand()<.5?-1:1);return [walkTo(x+d),wait(range(.6,1.2),'sniff'),walkTo(x-d),wait(range(.6,1.2),'sniff'),walkTo(x),wait(range(1,3),'observe'),fx(()=>{needs.energy-=.1;needs.curiosity-=.25;})];},
  roll:()=>[lie(),wait(range(.7,1.5),'rest'),cmd('roll',[],'roll'),wait(range(2,5),'watch'),fx(()=>{needs.energy-=.08;needs.curiosity-=.15;})],
  checkin:()=>[home(),sit('sit'),cmd('look',[side()],'look'),wait(range(5,10),'checkin'),fx(()=>{needs.social-=.4;})],
  play:()=>[cmd('spin',[],'play'),wait(range(1,2),'pause'),sit('sit'),wait(range(2,4),'watch'),fx(()=>{needs.energy-=.12;needs.curiosity-=.2;})],
  belly:()=>[cmd('belly',[range(5,9)],'belly'),wait(range(2,4),'watch'),fx(()=>{needs.energy+=.08;needs.curiosity-=.15;})],
  sleep:()=>[...quietPlace(),cmd('sleep',[range(65,110),['side','curl','chin','belly'][Math.floor(rand()*4)],rand()<.5],'sleep'),wait(range(2,4),'recover'),fx(()=>{needs.energy+=.3;})],
  butterfly:butterflyEpisode,
 };
 const weights=()=>{
  const {energy:e,social:s,curiosity:c}=needs;
  return {rest:e<.35?6:(1-e)*1.2,watch:.8+s,observe:.6+c*.6,stroll:1.2*c*e,dash:e>.55?1.2*e*c:0,
   scan:.35+c*.4,patrol:e>.25?.7*c*e:0,checkin:clock-lastCheckin>=90?.25+s*.7:0,
   roll:episodeCooldowns.roll===0&&e>.45?.35*e:0,
   play:episodeCooldowns.play===0&&e>.6&&typeof actor.spin==='function'?.25*e*c:0,
   belly:episodeCooldowns.belly===0&&typeof actor.belly==='function'?.35:0,
   sleep:episodeCooldowns.sleep===0&&typeof actor.sleep==='function'?(e<.4?3:.2):0};
 };
 function decide(){
  const w=weights();if(lastEpisode)w[lastEpisode]=0;
  const kinds=Object.keys(w),total=kinds.reduce((sum,k)=>sum+w[k],0);
  let pick=rand()*total,kind=kinds.find(k=>(pick-=w[k])<0)??'observe';
  // A bounded spell near the viewer, not a permanent home magnet. Let an active
  // authored motion finish first; only the next episode changes its destination.
  if(nearSeconds>=40&&needs.energy>.4&&lastEpisode!=='dash')kind='dash';
  // Quiet-time sleep pressure is independent of energy restored by sitting.
  // Wait for the current coherent episode to end; never yank a running puppy.
  if(quiet>=120&&needs.drowsiness>=.35&&episodeCooldowns.sleep===0&&lastEpisode!=='sleep'&&typeof actor.sleep==='function')kind='sleep';
  const position=actor.sample(clock);
  if(kind!=='sleep'&&clock>=nextButterfly&&quiet>=15&&needs.energy>.6&&needs.drowsiness<.35&&position.z> -1.2){
   kind='butterfly';nextButterfly=clock+BUTTERFLY_RULES.cooldownMin+encounterRange(0,BUTTERFLY_RULES.cooldownSpread);
  }
  lastEpisode=kind;decisions++;
  if(kind==='checkin')lastCheckin=clock;
  if(kind==='roll')episodeCooldowns.roll=90;
  if(kind==='play')episodeCooldowns.play=120;
  if(kind==='belly')episodeCooldowns.belly=80;
  if(kind==='sleep')episodeCooldowns.sleep=100;
  queue=[wait(range(3,9),'pause'),...EPISODES[kind]()];
 }

 const landed=()=>ball?.mode==='flight'&&ball.path.at(clock-ball.start).settled;
 const arrived=()=>{const s=actor.sample(clock),target=fetchPlan.pickupRoot;return SAFE.has(actor.state)&&Math.hypot(s.x-target.x,s.z-target.z)<ARRIVE;};
 const fetchGo=typeof actor.chase==='function'?'chase':'go';
 const directionalPickup=()=>{const s=actor.sample(clock);return actor.canPickup===true&&(s.seatProgress??0)===0&&['rear','front'].includes(s.view);};
 // The leading go is dropped when interact() already dispatched the chase; pickup waits for both arrival and landing.
 const BALL_STEPS=()=>[
  cmd(fetchGo,[fetchPlan.first.x,fetchPlan.first.z,{scramble:fetchPlan.pattern==='tumble'}],'fetch'),
  ...(fetchPlan.pattern==='miss'?[wait(.12,'miss'),cmd(fetchGo,[fetchPlan.pickupRoot.x,fetchPlan.pickupRoot.z],'reChase')]:[]),
  ...(fetchPlan.pattern==='tumble'&&!actor.canSinglePassScramble?[...actor.canMovingScramble?[]:[cmd('scramble',[],'tumble')],cmd(fetchGo,[fetchPlan.pickupRoot.x,fetchPlan.pickupRoot.z],'reChase')]:[]),
  {until:()=>landed()&&arrived()},
  fx(()=>{ball={mode:'ground',...fetchPlan.stop};}),
  cmd('pickup',[],'pickup',directionalPickup),
  cmd('sit',[{urgent:true}],'pickup',()=>!directionalPickup()&&unseated()),{...play('ball-pickup','pickup'),when:()=>!directionalPickup()},
  fx(()=>{ball={mode:'carried'};}),cmd(fetchGo,[HOME.x,HOME.z,{returnMode:fetchPlan.returnMode}],'carry'),
  cmd('sit',[{urgent:true}],'drop',unseated),play('ball-drop','drop'),
  fx(()=>{ball={mode:'dropped',start:clock,path:createBallPath({from:OFFER,landing:OFFER,stop:{x:OFFER.x+.035,z:OFFER.z+.06},flight:0,peak:0,deceleration:.2})};needs.social-=.4;}),wait(3,'offer'),fx(()=>{fetchPlan=null;})
 ];
 // Hand-feed where the puppy already is: sit only if not front-seated, never go/walk/chase/come.
 const TREAT_STEPS=()=>[
  fx(()=>{treat=true;}),cmd('sit',[],'treatSit',()=>!seatedAnyVariant()),
  play('treat-eat','chew'),fx(()=>{treat=null;needs.energy+=.25;needs.social-=.3;})
 ];
 const TUG_STEPS=()=>[
  cmd('sit',[],'tug',unseated),cmd('tug',[6],'tug'),wait(.5,'watch'),fx(()=>{needs.energy-=.12;needs.social-=.4;})
 ];

 function startInteraction(){
  active=pending;pending=null;decisions++;hold=0;
  queue=active==='ball'?BALL_STEPS():active==='tug'?TUG_STEPS():TREAT_STEPS();
 }
 function finishInteraction(){cooldowns[active]=COOLDOWN[active];if(active==='ball')lastCheckin=clock;active=null;}

 function drift(dt){
  const resting=holdIntent==='rest'||holdIntent==='recover'||actor.state==='sleep'||intent==='belly';
  needs.energy+=resting?.04*dt:-.004*dt;
  const asleep=actor.state==='sleep';
  if(!active&&!pending&&!asleep){const position=actor.sample(clock);nearSeconds=position.z>-.5&&Math.abs(position.x)<.32?nearSeconds+dt:0;}
  else nearSeconds=0;
  needs.drowsiness+=asleep?-dt/60:dt/240;
  quiet=active||pending||asleep?0:quiet+dt;
  if(!active){needs.curiosity+=.01*dt;needs.social+=.008*dt;}
  for(const k in needs)needs[k]=clamp(needs[k],0,1);
 }

 function update(dt){
  if(typeof dt!=='number'||!Number.isFinite(dt)||dt<0)throw RangeError('dt must be a finite non-negative number');
  dt=Math.min(dt,MAX_DT);clock+=dt;
  for(const k in cooldowns)cooldowns[k]=Math.max(0,cooldowns[k]-dt);
  for(const k in episodeCooldowns)episodeCooldowns[k]=Math.max(0,episodeCooldowns[k]-dt);
  drift(dt);
  // A stalled or externally substituted actor must not leave a permanent insect.
  if(butterfly&&clock-butterfly.start>BUTTERFLY_RULES.maxVisible){
   butterfly=null;queue=[sit('recover'),wait(3,'recover')];hold=0;holdIntent=null;gesture=null;waiting=null;actor.rest();
  }
  const safe=SAFE.has(actor.state);
  if(waiting){
   waiting.age+=dt;if(!safe)waiting.left=true;
   if(!safe||(!waiting.left&&waiting.age<SETTLE_FALLBACK))return;
   waiting=null;
  }
  if(hold>0){
   hold-=dt;if(gesture)gesture.elapsed+=dt;
   if(pending&&!active&&safe)hold=0;
   if(hold>0)return;
  }
  holdIntent=null;gesture=null;
  if(!safe)return;
  if(pending&&!active)startInteraction();
  if(notice?.phase==='queued'&&!active&&!pending){
   notice.phase='showing';
   const far=()=>{const s=actor.sample(clock);return Math.hypot(s.x-HOME.x,s.z-HOME.z)>.8;};
   queue=[sit('notifySit'),wait(.45,'notifyContact'),
    fx(()=>{if(far())notice.phase='approaching';}),cmd('go',[HOME.x,HOME.z],'notifyCome',far),
    sit('notifySit'),fx(()=>{notice.phase='showing';}),wait(.6,'notifyContact'),
    ...(notice.gesture==='wall'?[cmd('attentionWall',[],'notifyWall'),wait(.3,'notifyContact')]:actor.canAttentionPaw?[cmd('attentionPaw',[],'notifyPaw'),wait(.3,'notifyContact')]:[]),
    cmd('look',[notice.side],'notify'),wait(2.5,'notify'),fx(()=>{notice=null;})];
  }
  // Run instant effects; stop at the first hold or issued command (at most one command per update).
  for(;;){
   if(!queue.length){
    if(active){finishInteraction();if(pending)startInteraction();else decide();}
    else decide();
   }
   const step=queue.shift();
   if(step.fx){step.fx();for(const k in needs)needs[k]=clamp(needs[k],0,1);continue;}
   if(step.until){if(step.until())continue;queue.unshift(step);return;}
   if(step.when&&!step.when())continue;
   intent=step.intent;label=step.label;
   if(step.hold!==undefined){hold=step.hold;holdIntent=step.intent;if(step.gesture)gesture={clip:step.gesture,duration:step.hold,elapsed:0};return;}
   if(actor[step.cmd](...(typeof step.args==='function'?step.args():step.args))!==false)waiting={age:0,left:false};
   return;
  }
 }

 function interact(kind){
  if(!['ball','treat','tug'].includes(kind))return false;
  if(kind==='tug'&&typeof actor.tug!=='function')return false;
  if(pending||active||cooldowns[kind]>0)return false;
  clearNotice();
  quiet=0;
  if(butterfly||lastEpisode==='butterfly'){
   butterfly=null;queue=[];hold=0;holdIntent=null;gesture=null;waiting=null;
  }
  if(kind==='treat'||kind==='tug'){
   pending=kind;
   queue=[];hold=0;holdIntent=null;gesture=null;waiting=null;
   // Show the hand now, not several seconds later after the old route ends.
   if(kind==='treat')treat=true;
   if(typeof actor.attend==='function')actor.attend();
   // Backward-compatible substitute actors may only support sleep recovery.
   else if(['sleep','belly'].includes(actor.sample(clock).state))actor.sit();
   return true;
  }
  // Ball: launch now and drop obsolete controller plans; the actor's own state is left to chase.
  const throwPosition=actor.sample(clock),pattern=chooseFetch(throwPosition.z>=-1.09);
  const landing={...BALL_TARGET},stop={...BALL_TARGET};
  if(pattern!=='clean')stop.z-=2.5+toyRand()*2;
  let first=pattern==='miss'?{...landing}:{...stop};
  if(pattern==='tumble'){
   if(actor.canSinglePassScramble){
    // One forward pursuit in depth. No shallow side detour, overshoot target,
    // reversal or second chase just to expose an unrelated lateral drawing.
    Object.assign(landing,{x:throwPosition.x,z:throwPosition.z-1.15});Object.assign(stop,{x:throwPosition.x,z:landing.z-1.1});first={...stop};
   }else{
    const sign=throwPosition.x>.1?-1:throwPosition.x<-.1?1:toyRand()<.5?-1:1,z=-1.25,radius=roomRadius(z);
    Object.assign(landing,{x:sign*radius*.1,z});Object.assign(stop,{x:sign*radius*.28,z});first={x:sign*radius*.75,z};
   }
  }
  let pickupRoot={...stop};
  if(actor.canPickup===true){
   const from=Math.hypot(first.x-stop.x,first.z-stop.z)<1e-6?throwPosition:first,dx=stop.x-from.x,dz=stop.z-from.z,d=Math.hypot(dx,dz);
   if(d>.001){const target=paperGroundTarget(stop.x-dx/d*.17,stop.z-dz/d*.17);pickupRoot={x:target[0],z:target[1]};}
   if(pattern==='clean'||pattern==='rolling'||pattern==='tumble'&&actor.canSinglePassScramble)first={...pickupRoot};
  }
  const returns=actor.canCarryTrot?FETCH_RETURN_STYLES.slice(1).filter(mode=>mode!==lastReturnMode):['brake'];
  const returnMode=returnStyle==='auto'?returns[Math.floor(returnRand()*returns.length)]:returnStyle;
  lastReturnMode=returnMode;
  fetchPlan={pattern,stop,first,pickupRoot,returnMode};
  active='ball';decisions++;ball={mode:'flight',start:clock,path:createBallPath({landing,stop})};
  queue=BALL_STEPS();hold=0;holdIntent=null;gesture=null;waiting=null;
  intent='fetch';label=LABEL.fetch;
  const urgent=typeof actor.chase==='function';
  if((urgent||SAFE.has(actor.state))&&actor[urgent?'chase':'go'](first.x,first.z,{scramble:pattern==='tumble'})!==false)queue.shift();
  return true;
 }

 function clearNotice(){
  if(!notice)return;
  const approaching=notice.phase==='approaching';
  notice=null;queue=[];hold=0;holdIntent=null;gesture=null;waiting=null;
  intent='recover';label=LABEL.recover;
  if(approaching||actor.state==='attention-paw'||actor.state==='attention-wall')actor.attend?.();
  // Let any connected head turn/sit finish naturally. No snap or new route.
 }
 function notify({kind,side='left',gesture='auto'}={}){
  if(!['approval','input'].includes(kind)||!['left','right'].includes(side)||!['auto','paw','wall'].includes(gesture))throw Error('Invalid pet notice');
  // Explicit play/feeding always wins. Notifications never queue a second pet.
  if(active||pending||notice)return false;
  if(gesture==='wall'&&!actor.canAttentionWall)return false;
  const selected=gesture==='auto'?(actor.canAttentionWall&&noticeCount%2===1?'wall':'paw'):gesture;
  noticeCount++;
  notice={kind,side,gesture:selected,phase:'queued'};
  butterfly=null;queue=[];hold=0;holdIntent=null;gesture=null;waiting=null;
  actor.attend?.();
  return true;
 }

 // Recomputed from the live pose so the marker stays truthful before and after sitting.
 function treatReport(){
  if(!treat)return null;
  const s=actor.sample(clock);return {x:s.x,z:s.z+TREAT_OFFSET.z,height:TREAT_OFFSET.height};
 }
 function ballReport(){
  if(!ball)return null;
  const pose=actor.sample(clock);
  // Keep the object alive while it changes attachment. The renderer handles
  // the rear body's occlusion instead of deleting the ground ball early.
  if(pose.state==='pickup'&&pose.comfortPose?.progress>=.54)return {x:ball.x,z:ball.z,height:0,carried:true,pickupProgress:pose.comfortPose.progress,occluded:pose.view==='rear'};
  if(gesture?.clip==='ball-drop'&&gesture.elapsed/gesture.duration>=.55)return {...OFFER,height:0,carried:false};
  if(ball.mode==='flight'||ball.mode==='dropped')return {...ball.path.at(clock-ball.start),carried:false};
  if(ball.mode==='carried'){const s=actor.sample(clock);return {x:s.x,z:s.z,height:CARRY_HEIGHT,carried:true};}
  return {x:ball.x,z:ball.z,height:0,carried:false};
 }

 return {
  update,interact,notify,clearNotice,
  setReturnStyle(style){validateReturnStyle(style);returnStyle=style;return style;},
  get report(){
   const interaction=active??pending;
   return {
    intent:actor.state==='scramble'&&fetchPlan?'tumble':intent,label:pending?`${label} · ${PENDING_LABEL[pending]}`:actor.state==='scramble'&&fetchPlan?LABEL.tumble:label,episode:lastEpisode,interaction,busy:interaction!==null,
    ball:ballReport(),fetchPattern:fetchPlan?.pattern??null,returnStyle,returnMode:fetchPlan?.returnMode??null,treat:treatReport(),butterfly:butterflyPoint(),tug:actor.state==='tug'?{progress:actor.sample(clock).comfortPose?.progress??0,grip:1}:null,
    attention:notice?{...notice}:null,
    snore:actor.state==='sleep'?((clock%3.6)/3.6):null,energy:needs.energy,drowsiness:needs.drowsiness,decisions,cooldowns:{...cooldowns},
    // Local hold clock only: progress freezes between updates; null outside the stationary hold.
    gesture:gesture&&SAFE.has(actor.state)?{clip:gesture.clip,progress:clamp(gesture.elapsed/gesture.duration,0,1)}:null
   };
  }
 };
}
