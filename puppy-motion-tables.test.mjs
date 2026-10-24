import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {BAKED_MOTION as tables} from './puppy-motion-tables.generated.mjs';
import {buildMotionTables,motionModule,motionText} from './tools/bake-pet-motion.mjs';
import {createPaperSupportEpisodes,createBakedSupportEpisodes} from './puppy-paper-contact.mjs';
import {paperActionPose} from './puppy-paper-actions.mjs';
import {preparationRoute,canJoinMotion} from './puppy-motion-lookup.mjs';
import {createPaperActor,createPaperComfortTimings} from './puppy-paper.mjs';
import {createPaperBody} from './puppy-paper-world.mjs';
import {createSnappyTrickTimings} from './puppy-paper-trick-timing.mjs';
import {createCompanionLife} from './puppy-companion-life.mjs';
import {createPet,defaultLoadAsset} from './retrieviewer.mjs';
const json=n=>JSON.parse(readFileSync(new URL(n,import.meta.url)));
const rear=json('./puppy-paper-rear-gallop.json'),approach=json('./puppy-paper-approach.json'),actions=json('./puppy-paper-actions-v9.json'),behaviors=json('./puppy-paper-behaviors.json'),comfort=json('./puppy-companion-comfort.json'),stride=json('./puppy-stride-meta.json');

test('offline bake is reproducible and current, including exact-pixel transition witnesses',()=>{
 const text=motionModule(buildMotionTables());assert.equal(motionText(readFileSync(new URL('./puppy-motion-tables.generated.mjs',import.meta.url),'utf8')),text);
 assert.ok(Buffer.byteLength(text)<16*1024);assert.equal(Object.keys(tables.joins).length,10);
 assert.ok(Object.isFrozen(tables.support.front.starts));
 const impact=tables.joins['rear-run/scramble'];assert.equal(impact.airborne,true);assert.deepEqual(impact.supports,[],'never invent contact for an airborne source');
 for(const join of Object.values(tables.joins))assert.match(join.poseSha256,/^[a-f0-9]{64}$/);
});

test('LF and Windows CRLF metadata produce the same bake without normalizing binary art',()=>{
 let binaryReads=0;
 const windows=buildMotionTables(undefined,name=>{
  const bytes=readFileSync(name);
  if(name.endsWith('.json'))return Buffer.from(motionText(bytes.toString('utf8')).replace(/\n/g,'\r\n'));
  binaryReads++;return bytes;
 });
 assert.ok(binaryReads>0);assert.deepEqual(windows,tables);
 const text=motionModule(windows);assert.equal(motionText(text.replace(/\n/g,'\r\n')),text);
});

test('baked contact episodes match the original algorithm at every source sample, cycle and wrap',()=>{
 const cases=[['front',rear.frontFeet,Array.from({length:8},(_,i)=>i),17,true],['rear',rear.rearFeet,Array.from({length:8},(_,i)=>5+i),9,true],['approach',approach.feet,Array.from({length:8},(_,i)=>5+i),9,true],['walk',actions.feet,actions.clips.walk,9,true],
  ...Object.entries(behaviors.clips).map(([name,list])=>['behavior/'+name,behaviors.feet,list,9,name==='walk'])];
 let samples=0;
 for(const [key,labels,list,n,cyclic] of cases){
  const old=createPaperSupportEpisodes(labels,list,n,{cyclic}),next=createBakedSupportEpisodes(tables.support[key]);
  for(const cycle of [-1,0,1,4,100])for(const pair of list)for(let sample=0;sample<n;sample++){
   const blend=sample/(n-1),feet=labels[pair][sample],phase=cycle+(list.indexOf(pair)+blend)/list.length;
   assert.deepEqual(next(feet,pair,blend,phase),old(feet,pair,blend,phase),key+'/'+pair+'/'+sample+'/'+cycle);samples++;
  }
  const unknown=[{id:'unknown',stance:true,x:1,y:1}];assert.deepEqual(next(unknown,1000,0,0),old(unknown,1000,0,0));
 }
 assert.ok(samples>1500);
});

test('baked action weights preserve exact pose addressing and malformed input rejection',()=>{
 for(const name of Object.keys(actions.clips)){
  const weights=actions.weights?.[name]??actions.clips[name].map(()=>1),total=weights.reduce((a,b)=>a+b,0),points=[-1,0,1,2,NaN,Infinity];
  let sum=0;for(const w of weights){sum+=w;for(const d of [-1e-9,0,1e-9])points.push(sum/total+d);}
  for(let i=0;i<100;i++)points.push(i/99);
  for(const p of points){
   if(!Number.isFinite(p)){assert.throws(()=>paperActionPose(name,p,actions,tables.actionClips));continue;}
   assert.deepEqual(paperActionPose(name,p,actions,tables.actionClips),paperActionPose(name,p,actions),name+'/'+p);
  }
 }
 assert.throws(()=>paperActionPose('not-a-clip',0,actions,tables.actionClips));
});

test('compiled preparation routes retain facing/seat order and reject moving-root cuts',()=>{
 for(const view of ['front','rear','approach'])for(const flip of [false,true])for(const desired of ['front','rear','approach'])for(const nextFlip of [false,true]){
  const expected=view!==desired?['view-turn',view==='front'?desired:'front']:view==='front'&&flip!==nextFlip?['turn',nextFlip]:['ready'];
  assert.deepEqual(preparationRoute(tables,'direction',{view,flip,desired,nextFlip}),expected);
 }
 for(const view of ['front','rear','approach'])for(const flip of [false,true])for(const seatProgress of [0,.5,1])for(const desired of ['stand','seat']){
  const target=desired==='stand'?'front':'approach';
  const expected=desired==='stand'&&seatProgress>0?['rise']:flip&&view!=='front'?['view-turn','front']:flip?['turn',false]:view!==target?['view-turn',view==='front'?target:'front']:desired==='seat'&&seatProgress<1?['sit-down']:['ready'];
  assert.deepEqual(preparationRoute(tables,'action',{view,flip,seatProgress,desired}),expected);
 }
 assert.throws(()=>preparationRoute(tables,'direction',{view:'front',flip:false,desired:'rear',speed:1}),/stopped root/);
 assert.throws(()=>preparationRoute(tables,'action',{view:'not-a-view',flip:false,desired:'seat'}),/Unknown/);
});

test('connection lookup respects planted phase, speed, direction and impact velocity',()=>{
 assert.equal(canJoinMotion(tables,'walk/walk-exit',{view:'front',speed:0,phase:3}),true);
 for(const bad of [{phase:3.5},{speed:1},{nextSpeed:1},{view:'rear'}])assert.equal(canJoinMotion(tables,'walk/walk-exit',{view:'front',speed:0,phase:3,...bad}),false);
 assert.equal(canJoinMotion(tables,'rear-run/scramble',{view:'rear',speed:2,nextSpeed:2,phase:4.25}),true);
 for(const bad of [{phase:4.3},{speed:0,nextSpeed:0},{nextSpeed:1},{view:'front'},{speed:NaN}])assert.equal(canJoinMotion(tables,'rear-run/scramble',{view:'rear',speed:2,nextSpeed:2,phase:4.25,...bad}),false);
 assert.equal(canJoinMotion(tables,'unknown',{view:'front',speed:0}),false);
});

function puppy(baked){
 const actor=createPaperActor(createPaperBody(),stride,{manualTricks:true,walkTransitions:true,trickTimings:createSnappyTrickTimings(actions),comfortTimings:createPaperComfortTimings(actions),scrambleSeconds:comfort.scramble.duration,fetchMotions:comfort,motionTables:baked?tables:null});
 return {actor,life:createCompanionLife(actor,{seed:731})};
}
test('table-driven actor preserves seeded fetches and every physical/behavior sample, including rare impacts',()=>{
 const old=puppy(false),next=puppy(true);let clock=0,tumbles=0,throws=0;
 for(let i=0;i<60*600;i++){
  // report() samples the actor's held-pose cache; observe both sides equally.
  const a=old.life.report,b=next.life.report;assert.deepEqual(a,b);
  if(!a.busy&&a.cooldowns.ball===0&&throws<32){assert.equal(old.life.interact('ball'),next.life.interact('ball'));throws++;const x=old.life.report,y=next.life.report;assert.deepEqual(x,y);if(x.fetchPattern==='tumble')tumbles++;}
  clock+=1/60;
  for(const p of [old,next]){p.actor.update(1/60);p.life.update(1/60);}
  assert.deepEqual(next.actor.sample(clock),old.actor.sample(clock));assert.deepEqual(next.life.report,old.life.report);
 }
 assert.ok(throws>=20&&tumbles>=2,'moving-impact gate exercised');
});

test('public baked renderer matches general-loader pixels, contacts and mouth anchors',async()=>{
 async function replay(loadAsset){
  const pet=await createPet({seed:731,loadAsset,returnStyle:'auto'}),hash=createHash('sha256');
  try{
   for(let i=0;i<900;i++){
    if(i===24)pet.interact('ball');if(i===450)pet.interact('treat');if(i===750)pet.interact('tug');
    pet.step(1/30);const f=pet.frame({columns:80,rows:30,poseFps:30});
    hash.update(f.text);hash.update(JSON.stringify([f.state,f.report,f.contacts,f.mouth]));
   }
   return hash.digest('hex');
  }finally{pet.dispose();}
 }
 const baked=await replay(defaultLoadAsset),general=await replay(name=>defaultLoadAsset(name));assert.equal(baked,general);
});
