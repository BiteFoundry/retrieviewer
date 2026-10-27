import test from 'node:test';
import assert from 'node:assert/strict';
import {createCatLife} from './integrations/purrviewer/src/life.mjs';
import {createCat} from './integrations/purrviewer/src/purrviewer.mjs';
import {CAT_HABITAT} from './integrations/purrviewer/src/habitat.mjs';
import {createFramePump} from './integrations/windows-overlay/protocol.mjs';
import {createAttentionMonitor} from './retrieviewer-attention.mjs';

function until(cat,predicate,seconds=60){
 for(let i=0;i<seconds*60;i++){
  cat.step(1/60);
  if(predicate(cat.report))return;
 }
 assert.fail('Expected action did not arrive: '+JSON.stringify(cat.report));
}

test('already-arrived habitat travel completes without an artificial moving acknowledgement',()=>{
 const life=createCatLife({seed:731}),w=CAT_HABITAT.wheel;
 const root={x:w.catX,y:0,z:w.z,moving:false};
 life.interact('wheel');const commands=[];
 for(let i=0;i<120;i++){const command=life.step(1/60,root);if(command)commands.push(command);}
 assert.equal(commands.some(c=>c.kind==='go'),false);
 assert.equal(commands.some(c=>c.kind==='wheel'),true);
});

test('a delayed host still owes the requested trip before life advances',()=>{
 const life=createCatLife({seed:731}),root={x:0,y:0,z:0,moving:false};
 life.interact('wheel');let go;
 for(let i=0;i<120;i++){const command=life.step(1/60,root);if(command?.kind==='go'){go=command;break;}}
 assert.ok(go);
 for(let i=0;i<120;i++){assert.equal(life.step(1/60,root),null);assert.equal(life.report.clip,'walk');assert.equal(life.report.progress,0);}
});

for(const kind of ['wheel','tower'])test(kind+' can be revisited after a completed treat at its approach point',async()=>{
 const cat=await createCat({seed:731});
 try{
  cat.interact(kind);
  until(cat,r=>kind==='wheel'?r.clip==='wheel-run':r.clip==='loaf-rest');
  cat.interact('treat');
  until(cat,r=>r.intent==='treat'&&r.clip==='feed-lick');
  until(cat,r=>r.intent==='treat'&&r.clip==='sit');
  const previous=cat.frame({columns:80,rows:45}).state;
  assert.equal(previous.z,CAT_HABITAT.tower.z);
  assert.equal(previous.x,kind==='wheel'?CAT_HABITAT.wheel.catX:CAT_HABITAT.tower.approachX);
  assert.equal(cat.interact(kind),true);
  until(cat,r=>r.intent===kind&&r.clip===(kind==='wheel'?'wheel-run':'tower-up'),20);
  let resumed=false;
  for(let i=0;i<1200;i++){
   cat.step(1/60);
   if(i%6)continue;
   const frame=cat.frame({columns:80,rows:45});
   if(kind==='wheel'?frame.state.exercising:frame.state.supportY===CAT_HABITAT.tower.highY){resumed=true;break;}
  }
  assert.ok(resumed,'visit must physically resume, not merely change its label');
  assert.ok(cat.stats.cachedFrames<=2);
 }finally{cat.dispose();}
});

test('passive attention yields to pending input and actual feeding, then greets after completion',async()=>{
 const cat=await createCat({seed:731});
 try{
  cat.interact('treat');assert.equal(cat.notify(),false);
  until(cat,r=>r.clip==='feed-lick'&&r.progress>.25);
  const before=cat.report;
  assert.equal(cat.notify(),false);
  assert.deepEqual(cat.report,before);
  until(cat,r=>r.clip==='feed-finish');
  assert.equal(cat.report.food.remaining,0);
  until(cat,r=>!r.busy);
  assert.equal(cat.notify(),true);
  until(cat,r=>r.intent==='greet'&&r.clip==='eye-greeting');
  assert.equal(cat.notify(),false);
 }finally{cat.dispose();}
 assert.throws(()=>cat.notify(),/disposed/);
});

test('desktop recovers after a delayed painter ACK with the real cat runtime',async()=>{
 const cat=await createCat({seed:731});let now=1,sent=0;
 const pump=createFramePump({pet:cat,now:()=>now,send:()=>sent++});
 try{
  pump.viewport({type:'viewport',revision:1,visible:true,columns:80,rows:45,cellWidth:8,cellHeight:16});
  assert.equal(pump.tick(),true);
  cat.interact('treat');now+=500;
  assert.equal(pump.tick(),false,'backpressure waits for the existing frame');
  pump.ack();
  assert.doesNotThrow(()=>pump.tick());
  for(let i=0;i<15;i++){pump.ack();now+=1000;assert.doesNotThrow(()=>pump.tick());}
  assert.ok(sent>1);
  assert.ok(Number.isFinite(cat.frame({columns:80,rows:45}).state.x));
 }finally{pump.dispose();}
});

for(const resolved of [false,true])test('attention '+(resolved?'discards a resolved':'retries a fresh')+' request after the cat finishes feeding',async()=>{
 const cat=await createCat({seed:731});let now=0,deliveries=0,pending=true;
 const monitor=createAttentionMonitor({now:()=>now,
  readSnapshot:async()=>({source:'test',scope:'owned-fixture',items:pending?[{id:'seat',generation:'generation',turnId:1,kind:'approval'}]:[]}),
  onNotice:notice=>{const accepted=cat.notify(notice);if(accepted)deliveries++;return accepted;}});
 try{
  cat.interact('treat');until(cat,r=>r.clip==='feed-lick'&&r.progress>.25);
  monitor.tick();await monitor.settled();monitor.tick();
  assert.equal(deliveries,0);assert.equal(monitor.status.retainedNotices,0);
  assert.equal(cat.report.intent,'treat');
  until(cat,r=>r.clip==='feed-finish');assert.equal(cat.report.food.remaining,0);
  until(cat,r=>!r.busy);
  pending=!resolved;now=5000;monitor.tick();await monitor.settled();monitor.tick();
  assert.equal(deliveries,resolved?0:1);
  if(!resolved)until(cat,r=>r.intent==='greet'&&r.clip==='eye-greeting');
 }finally{monitor.dispose();cat.dispose();}
});
