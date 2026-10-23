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
const COOLDOWN={ball:6,treat:15};
const FLIGHT=.65,BALL_PEAK=.75,CARRY_HEIGHT=.19,SETTLE_FALLBACK=.6,MAX_DT=.25,ARRIVE=.05;
const LABEL={
 start:'기다리는 중',pause:'잠시 느긋하게 둘러보는 중',lie:'엎드리는 중',rest:'엎드려 쉬는 중',recover:'앉아서 기운 차리는 중',
 sit:'앉는 중',watch:'앉아서 지켜보는 중',look:'고개를 돌려 살피는 중',observe:'가만히 주변 관찰 중',
 stroll:'옆으로 살짝 걸어가는 중',sniff:'잠깐 멈춰 주변을 살피는 중',dash:'저 멀리 달려가는 중',far:'멀리서 둘러보는 중',home:'제자리로 돌아오는 중',
 fetch:'공을 쫓아가는 중',pickup:'공을 무는 중',carry:'공을 물고 돌아오는 중',drop:'공을 내려놓는 중',offer:'공을 내려놓고 기다리는 중',
 treatSit:'간식 앞에 앉는 중',chew:'간식 먹는 중'
};
const PENDING_LABEL={treat:'곧 간식'};
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
 const needs={energy,social:.5,curiosity:.5};
 const cooldowns={ball:0,treat:0};
 let clock=0,decisions=0,lastEpisode=null;
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
 const home=()=>cmd('go',[HOME.x,HOME.z],'home');

 // Each episode is a short coherent plan; a pause always leads in so autonomy never stalls.
 const EPISODES={
  rest:()=>[cmd('lie',[],'lie'),wait(range(10,18),'rest'),cmd('sit',[],'recover'),wait(range(3,6),'recover')],
  watch:()=>[cmd('sit',[],'sit'),cmd('look',[side()],'look'),wait(range(3,9),'watch'),fx(()=>{needs.social-=.3;needs.curiosity+=.1;})],
  observe:()=>[cmd('look',[side()],'look'),wait(range(3,9),'observe'),fx(()=>{needs.curiosity-=.15;})],
  stroll:()=>[cmd('walk',[side(),range(.08,.18)],'stroll'),wait(range(2,4),'sniff'),home(),fx(()=>{needs.energy-=.08;needs.curiosity-=.2;})],
  dash:()=>[cmd('go',[(rand()*2-1)*.18,-range(3,8)],'dash'),wait(range(1.5,3),'far'),home(),fx(()=>{needs.energy-=.3;needs.curiosity-=.4;})]
 };
 const weights=()=>{
  const {energy:e,social:s,curiosity:c}=needs;
  return {rest:e<.35?6:(1-e)*1.2,watch:.8+s,observe:.6+c*.6,stroll:1.2*c*e,dash:e>.55?1.2*e*c:0};
 };
 function decide(){
  const w=weights();if(lastEpisode)w[lastEpisode]=0;
  const kinds=Object.keys(w),total=kinds.reduce((sum,k)=>sum+w[k],0);
  let pick=rand()*total,kind=kinds.find(k=>(pick-=w[k])<0)??'observe';
  lastEpisode=kind;decisions++;
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

 function startInteraction(){
  active=pending;pending=null;decisions++;hold=0;
  queue=active==='ball'?BALL_STEPS():TREAT_STEPS();
 }
 function finishInteraction(){cooldowns[active]=COOLDOWN[active];active=null;}

 function drift(dt){
  const resting=holdIntent==='rest'||holdIntent==='recover';
  needs.energy+=resting?.04*dt:-.004*dt;
  if(!active){needs.curiosity+=.01*dt;needs.social+=.008*dt;}
  for(const k in needs)needs[k]=clamp(needs[k],0,1);
 }

 function update(dt){
  if(typeof dt!=='number'||!Number.isFinite(dt)||dt<0)throw RangeError('dt must be a finite non-negative number');
  dt=Math.min(dt,MAX_DT);clock+=dt;
  for(const k in cooldowns)cooldowns[k]=Math.max(0,cooldowns[k]-dt);
  drift(dt);
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
   if(actor[step.cmd](...step.args)!==false)waiting={age:0,left:false};
   return;
  }
 }

 function interact(kind){
  if(kind!=='ball'&&kind!=='treat')return false;
  if(pending||active||cooldowns[kind]>0)return false;
  if(kind==='treat'){pending=kind;return true;}
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
    intent,label:pending?`${label} · ${PENDING_LABEL[pending]}`:label,interaction,busy:interaction!==null,
    ball:ballReport(),treat:treatReport(),energy:needs.energy,decisions,cooldowns:{...cooldowns},
    // Local hold clock only: progress freezes between updates; null outside the stationary hold.
    gesture:gesture&&SAFE.has(actor.state)?{clip:gesture.clip,progress:clamp(gesture.elapsed/gesture.duration,0,1)}:null
   };
  }
 };
}
