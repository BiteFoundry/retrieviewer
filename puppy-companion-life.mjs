// Autonomous companion "life" controller layered over a paper puppy actor.
// The parent calls actor.update(dt) THEN life.update(dt). Commands are only issued
// while the actor rests at a shared safe endpoint (idle/down); everything else waits.
// Exception: an accepted ball throw reacts at once via actor.chase (the actor owns safe
// interruption); actors without chase fall back to go at the next safe endpoint.
// Parameters are authored for feel, not canine science.

const SAFE=new Set(['idle','down']);
const HOME={x:0,z:.2};
const BALL_TARGET={x:0,z:-4};
const OFFER={x:0,z:.3};
// Hand-fed treat marker, relative to the puppy's current root (no travel for treats).
const TREAT_OFFSET={z:.08,height:.25};
const COOLDOWN={ball:6,treat:15,tug:20};
const FLIGHT=.65,BALL_PEAK=.75,CARRY_HEIGHT=.19,SETTLE_FALLBACK=.6,MAX_DT=.25,ARRIVE=.05;
// Active simulation seconds, never a wall-clock timer that wakes a hidden pet.
export const BUTTERFLY_RULES=Object.freeze({firstMin:240,firstSpread:240,cooldownMin:720,cooldownSpread:480,maxVisible:18});
const LABEL={
 start:'기다리는 중',pause:'잠시 느긋하게 둘러보는 중',lie:'엎드리는 중',rest:'엎드려 쉬는 중',recover:'앉아서 기운 차리는 중',
 sit:'앉는 중',watch:'앉아서 지켜보는 중',look:'고개를 돌려 살피는 중',observe:'가만히 주변 관찰 중',
 stroll:'옆으로 살짝 걸어가는 중',sniff:'잠깐 멈춰 주변을 살피는 중',dash:'저 멀리 달려가는 중',far:'멀리서 둘러보는 중',home:'제자리로 돌아오는 중',
 patrol:'주변을 왕복 산책하는 중',scan:'양쪽을 번갈아 살피는 중',roll:'느긋하게 뒹구는 중',play:'신나서 한 바퀴 도는 중',checkin:'가까이 와서 함께 쉬는 중',
 belly:'배를 보이고 발라당 쉬는 중',sleep:'새근새근 잠자는 중',tug:'장난감을 물고 당기는 중',
 butterflyNotice:'나비를 발견하고 귀를 쫑긋하는 중',butterfly:'나비를 폴짝폴짝 쫓는 중',butterflyBye:'날아가는 나비를 바라보는 중',
 fetch:'공을 쫓아가는 중',pickup:'공을 무는 중',carry:'공을 물고 돌아오는 중',drop:'공을 내려놓는 중',offer:'공을 내려놓고 기다리는 중',
 treatSit:'간식 앞에 앉는 중',chew:'간식 먹는 중'
};
const PENDING_LABEL={treat:'곧 간식',tug:'곧 터그놀이'};
// Baked interaction clips, played only while holding at the shared seated endpoint.
const GESTURE={'ball-pickup':1.4,'ball-drop':1.2,'treat-eat':2.4};
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));

function mulberry32(seed){
 let a=seed>>>0;
 return()=>{a=a+0x6d2b79f5>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};
}

export function createCompanionLife(actor,{seed=731,energy=.8}={}){
 for(const name of ['update','sample','go','come','sit','lie','look','walk','roll','rest'])
  if(!actor||typeof actor[name]!=='function')throw TypeError(`actor.${name} must be a function`);
 if(!Number.isInteger(seed))throw TypeError('seed must be an integer');
 if(!Number.isFinite(energy)||energy<0||energy>1)throw RangeError('energy must be within 0..1');

 const rand=mulberry32(seed),range=(a,b)=>a+(b-a)*rand(),side=()=>rand()<.5?'left':'right';
 // Separate stream: the rare encounter does not perturb ordinary episodes/gaits.
 const encounterRand=mulberry32(seed^0x4bf17a93),encounterRange=(a,b)=>a+(b-a)*encounterRand();
 let nextButterfly=BUTTERFLY_RULES.firstMin+encounterRange(0,BUTTERFLY_RULES.firstSpread),butterfly=null;
 const needs={energy,social:.5,curiosity:.5,drowsiness:0};
 const cooldowns={ball:0,treat:0,tug:0};
 const episodeCooldowns={roll:0,play:0,belly:0,sleep:0};
 let clock=0,decisions=0,lastEpisode=null,quiet=0;
 let queue=[],hold=0,holdIntent=null,waiting=null,gesture=null;
 let intent='start',label=LABEL.start,pending=null,active=null,ball=null,treat=null;

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
  const s=actor.sample(clock),direction=encounterRand()<.5?-1:1;
  const targets=[clamp(s.x+direction*.36,-.5,.5),clamp(s.x-direction*.38,-.5,.5),clamp(s.x+direction*.24,-.5,.5)];
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
   home(),sit('recover'),wait(range(3,6),'recover')];
 };

 // Each episode is a short coherent plan; a pause always leads in so autonomy never stalls.
 const EPISODES={
  rest:()=>[lie(),wait(range(10,18),'rest'),sit('recover'),wait(range(3,6),'recover')],
  watch:()=>[sit('sit'),cmd('look',[side()],'look'),wait(range(3,9),'watch'),fx(()=>{needs.social-=.3;needs.curiosity+=.1;})],
  observe:()=>[sit('sit'),cmd('look',[side()],'look'),wait(range(3,9),'observe'),fx(()=>{needs.curiosity-=.15;})],
  stroll:()=>[cmd('walk',[side(),range(.08,.18)],'stroll'),wait(range(2,4),'sniff'),home(),fx(()=>{needs.energy-=.08;needs.curiosity-=.2;})],
  dash:()=>[cmd('go',[(rand()*2-1)*.18,-range(3,8)],'dash'),wait(range(1.5,3),'far'),home(),fx(()=>{needs.energy-=.3;needs.curiosity-=.4;})],
  scan:()=>[sit('sit'),cmd('look',['left'],'scan'),wait(range(.5,1.5),'scan'),cmd('look',['right'],'scan'),wait(range(2,4),'observe'),fx(()=>{needs.curiosity-=.25;})],
  patrol:()=>{const x=actor.sample(clock).x,d=range(.16,.3)*(rand()<.5?-1:1);return [walkTo(x+d),wait(range(.6,1.2),'sniff'),walkTo(x-d),wait(range(.6,1.2),'sniff'),walkTo(x),wait(range(1,3),'observe'),fx(()=>{needs.energy-=.1;needs.curiosity-=.25;})];},
  roll:()=>[lie(),wait(range(.7,1.5),'rest'),cmd('roll',[],'roll'),wait(range(2,5),'watch'),fx(()=>{needs.energy-=.08;needs.curiosity-=.15;})],
  checkin:()=>[home(),sit('sit'),cmd('look',[side()],'look'),wait(range(5,10),'checkin'),fx(()=>{needs.social-=.4;})],
  play:()=>[cmd('spin',[],'play'),wait(range(1,2),'pause'),sit('sit'),wait(range(2,4),'watch'),fx(()=>{needs.energy-=.12;needs.curiosity-=.2;})],
  belly:()=>[cmd('belly',[range(5,9)],'belly'),wait(range(2,4),'watch'),fx(()=>{needs.energy+=.08;needs.curiosity-=.15;})],
  sleep:()=>[cmd('sleep',[range(65,110),['side','curl','chin','belly'][Math.floor(rand()*4)],rand()<.5],'sleep'),wait(range(2,4),'recover'),fx(()=>{needs.energy+=.3;})],
  butterfly:butterflyEpisode,
 };
 const weights=()=>{
  const {energy:e,social:s,curiosity:c}=needs;
  return {rest:e<.35?6:(1-e)*1.2,watch:.8+s,observe:.6+c*.6,stroll:1.2*c*e,dash:e>.55?1.2*e*c:0,
   scan:.35+c*.4,patrol:e>.25?.7*c*e:0,checkin:.25+s*.7,
   roll:episodeCooldowns.roll===0&&e>.45?.35*e:0,
   play:episodeCooldowns.play===0&&e>.6&&typeof actor.spin==='function'?.25*e*c:0,
   belly:episodeCooldowns.belly===0&&typeof actor.belly==='function'?.35:0,
   sleep:episodeCooldowns.sleep===0&&typeof actor.sleep==='function'?(e<.4?3:.2):0};
 };
 function decide(){
  const w=weights();if(lastEpisode)w[lastEpisode]=0;
  const kinds=Object.keys(w),total=kinds.reduce((sum,k)=>sum+w[k],0);
  let pick=rand()*total,kind=kinds.find(k=>(pick-=w[k])<0)??'observe';
  // Quiet-time sleep pressure is independent of energy restored by sitting.
  // Wait for the current coherent episode to end; never yank a running puppy.
  if(quiet>=120&&needs.drowsiness>=.35&&episodeCooldowns.sleep===0&&lastEpisode!=='sleep'&&typeof actor.sleep==='function')kind='sleep';
  const position=actor.sample(clock);
  if(kind!=='sleep'&&clock>=nextButterfly&&quiet>=15&&needs.energy>.6&&needs.drowsiness<.35&&position.z> -1.2){
   kind='butterfly';nextButterfly=clock+BUTTERFLY_RULES.cooldownMin+encounterRange(0,BUTTERFLY_RULES.cooldownSpread);
  }
  lastEpisode=kind;decisions++;
  if(kind==='roll')episodeCooldowns.roll=90;
  if(kind==='play')episodeCooldowns.play=120;
  if(kind==='belly')episodeCooldowns.belly=80;
  if(kind==='sleep')episodeCooldowns.sleep=100;
  queue=[wait(range(3,9),'pause'),...EPISODES[kind]()];
 }

 const landed=()=>ball?.mode==='flight'&&clock-ball.start>=FLIGHT;
 const arrived=()=>{const s=actor.sample(clock);return SAFE.has(actor.state)&&Math.hypot(s.x-BALL_TARGET.x,s.z-BALL_TARGET.z)<ARRIVE;};
 // The leading go is dropped when interact() already dispatched the chase; pickup waits for both arrival and landing.
 const BALL_STEPS=()=>[
  cmd('go',[BALL_TARGET.x,BALL_TARGET.z],'fetch'),{until:()=>landed()&&arrived()},
  fx(()=>{ball={mode:'ground',x:BALL_TARGET.x,z:BALL_TARGET.z};}),
  cmd('sit',[],'pickup'),play('ball-pickup','pickup'),fx(()=>{ball={mode:'carried'};}),cmd('go',[HOME.x,HOME.z],'carry'),
  cmd('sit',[],'drop',unseated),play('ball-drop','drop'),
  fx(()=>{ball={mode:'ground',x:OFFER.x,z:OFFER.z};needs.social-=.4;}),wait(3,'offer'),fx(()=>{ball=null;})
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
 function finishInteraction(){cooldowns[active]=COOLDOWN[active];active=null;}

 function drift(dt){
  const resting=holdIntent==='rest'||holdIntent==='recover'||actor.state==='sleep'||intent==='belly';
  needs.energy+=resting?.04*dt:-.004*dt;
  const asleep=actor.state==='sleep';
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
  quiet=0;
  if(butterfly||lastEpisode==='butterfly'){
   butterfly=null;queue=[];hold=0;holdIntent=null;gesture=null;waiting=null;
   if(kind!=='ball')actor.sit();
  }
  if(kind==='treat'||kind==='tug'){
   pending=kind;
   // The pet wakes through its authored recovery, not after a long sleep timer.
   if(['sleep','belly'].includes(actor.sample(clock).state))actor.sit();
   return true;
  }
  // Ball: launch now and drop obsolete controller plans; the actor's own state is left to chase.
  active='ball';decisions++;ball={mode:'flight',start:clock};
  queue=BALL_STEPS();hold=0;holdIntent=null;gesture=null;waiting=null;
  intent='fetch';label=LABEL.fetch;
  const urgent=typeof actor.chase==='function';
  if((urgent||SAFE.has(actor.state))&&actor[urgent?'chase':'go'](BALL_TARGET.x,BALL_TARGET.z)!==false)queue.shift();
  return true;
 }

 // Recomputed from the live pose so the marker stays truthful before and after sitting.
 function treatReport(){
  if(!treat)return null;
  const s=actor.sample(clock);return {x:s.x,z:s.z+TREAT_OFFSET.z,height:TREAT_OFFSET.height};
 }
 function ballReport(){
  if(!ball)return null;
  if(ball.mode==='flight'){
   const p=clamp((clock-ball.start)/FLIGHT,0,1);
   if(p===1)return {x:BALL_TARGET.x,z:BALL_TARGET.z,height:0,carried:false};
   return {x:HOME.x+(BALL_TARGET.x-HOME.x)*p,z:HOME.z+(BALL_TARGET.z-HOME.z)*p,height:4*BALL_PEAK*p*(1-p),carried:false};
  }
  if(ball.mode==='carried'){const s=actor.sample(clock);return {x:s.x,z:s.z,height:CARRY_HEIGHT,carried:true};}
  return {x:ball.x,z:ball.z,height:0,carried:false};
 }

 return {
  update,interact,
  get report(){
   const interaction=active??pending;
   return {
    intent,label:pending?`${label} · ${PENDING_LABEL[pending]}`:label,episode:lastEpisode,interaction,busy:interaction!==null,
    ball:ballReport(),treat:treatReport(),butterfly:butterflyPoint(),tug:actor.state==='tug'?{progress:actor.sample(clock).comfortPose?.progress??0,grip:1}:null,
    snore:actor.state==='sleep'?((clock%3.6)/3.6):null,energy:needs.energy,drowsiness:needs.drowsiness,decisions,cooldowns:{...cooldowns},
    // Local hold clock only: progress freezes between updates; null outside the stationary hold.
    gesture:gesture&&SAFE.has(actor.state)?{clip:gesture.clip,progress:clamp(gesture.elapsed/gesture.duration,0,1)}:null
   };
  }
 };
}
