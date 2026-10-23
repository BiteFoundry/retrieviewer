import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCompanionLife,BUTTERFLY_RULES} from './puppy-companion-life.mjs';
import {createPaperActor} from './puppy-paper.mjs';
import {createPaperBody,createPaperProjection} from './puppy-paper-world.mjs';
import {createSnappyTrickTimings} from './puppy-paper-trick-timing.mjs';
import {paintCompanionObjects} from './puppy-companion-objects.mjs';
const json=name=>JSON.parse(readFileSync(new URL(name,import.meta.url)));
const stride=json('./puppy-stride-meta.json'),actions=json('./puppy-paper-actions-v9.json');
function puppy(seed){
 const actor=createPaperActor(createPaperBody(),stride,{manualTricks:true,walkTransitions:true,trickTimings:createSnappyTrickTimings(actions)});
 const life=createCompanionLife(actor,{seed});let clock=0;
 return{actor,life,step(dt=1/30){clock+=dt;actor.update(dt);life.update(dt);return{clock,state:actor.sample(clock),report:life.report};}};
}
test('butterflies are rare, finite, deterministic and never wake a sleeping puppy',()=>{
 for(const seed of [1,43,731,990]){
  const p=puppy(seed),starts=[];let on=false,start=0,lastPose=null,noseChecks=0,noticeChecks=0;const directions=new Set();
  for(let i=0;i<40*60*15;i++){
   const f=p.step(1/15),b=f.report.butterfly;
   if(b){
    assert.notEqual(f.state.state,'sleep');assert.equal(f.report.busy,false);
    if(!on){starts.push(f.clock);start=f.clock;}
    assert.ok(f.clock-start<BUTTERFLY_RULES.maxVisible+.1);
    for(const k of ['x','z','height','phase','opacity'])assert.ok(Number.isFinite(b[k]));
    if(f.report.intent==='butterflyNotice'&&f.state.behaviorProgress===.5){
     noticeChecks++;assert.equal(f.state.behavior,b.x<f.state.x?'watch-right':'watch-left','dog-relative head turn must face the visitor');
    }
    if(f.state.speed>0){
     assert.equal(f.state.state,'run');directions.add(f.state.flip);
     // During the settled flight of a chase leg the insect leads the nose.
     if(f.clock-start>1.5&&f.report.intent==='butterfly'&&f.state.motionStage==='braking'){
      noseChecks++;assert.ok((b.x-f.state.x)*(f.state.flip?-1:1)>.1,'butterfly must not sit behind the muzzle');
     }
    }
   }
   on=!!b;lastPose=f;
  }
  assert.ok(starts.length>=1&&starts.length<=4,JSON.stringify({seed,starts}));
  assert.ok(starts[0]>=BUTTERFLY_RULES.firstMin);
  for(let i=1;i<starts.length;i++)assert.ok(starts[i]-starts[i-1]>=BUTTERFLY_RULES.cooldownMin-1);
  assert.equal(directions.size,2,'chases both directions using grounded run poses');
  assert.ok(noseChecks>0,'nose-leading assertion must be exercised');
  assert.ok(noticeChecks>0,'head-direction assertion must be exercised');
  assert.ok(lastPose);
 }
});
test('ball, treat and tug cancel the visitor immediately and do not resume its old chase',()=>{
 for(const kind of ['ball','treat','tug']){
  const p=puppy(731);let found=false;
  for(let i=0;i<900*30;i++){
   const f=p.step();if(f.report.butterfly&&f.state.state==='run'){found=true;break;}
  }
  assert.ok(found);assert.equal(p.life.interact(kind),true);assert.equal(p.life.report.butterfly,null);
  let reacted=false;
  for(let i=0;i<12*30;i++){
   const f=p.step();assert.equal(f.report.butterfly,null);
   if(kind==='ball'&&f.report.intent==='fetch'&&f.state.state==='run'||kind==='treat'&&f.report.intent==='chew'||kind==='tug'&&f.state.state==='tug')reacted=true;
  }
  assert.ok(reacted,kind);
 }
});
test('butterfly wings are drawn into the existing pixels, flutter and stay clipped',()=>{
 const width=320,height=180,projection=createPaperProjection({viewportWidth:640,viewportHeight:360,rect:{left:0,top:0,width:640,height:360},width,height});
 const pixels=new Uint8ClampedArray(width*height*4),state={x:0,z:0,state:'idle'};
 const draw=(phase,x=.2)=>{pixels.fill(0);assert.equal(paintCompanionObjects(pixels,width,height,projection,{butterfly:{x,z:0,height:.4,phase,opacity:1}},state),pixels);return Uint8ClampedArray.from(pixels);};
 const folded=draw(0),open=draw(.5);
 assert.notDeepEqual(folded,open);assert.ok(open.some(v=>v>0));
 assert.ok(open.filter(v=>v>0).length<1000,'only a small insect, not a second canvas');
 assert.equal(draw(.5,20).some(v=>v>0),false);
});
test('a stalled actor cannot leave an immortal butterfly or resume its discarded route',()=>{
 const p=puppy(731);let found=false;
 for(let i=0;i<900*30;i++)if(p.step().report.butterfly){found=true;break;}
 assert.ok(found);
 for(let i=0;i<30*30;i++)p.life.update(1/30); // Host deliberately stops actor updates.
 assert.equal(p.life.report.butterfly,null);
 for(let i=0;i<12*30;i++)assert.equal(p.step().report.butterfly,null);
});
