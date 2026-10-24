import test from 'node:test';
import assert from 'node:assert/strict';
import {createAttentionMonitor,validateAttentionSnapshot} from './retrieviewer-attention.mjs';
import {createStackBiteSource,projectStackBiteSeats,stackBiteBinding} from './integrations/stackbite/attention.mjs';

const item=(patch={})=>({id:'worker',generation:'gen-1',turnId:1,kind:'input',...patch});
const snapshot=(items=[item()],scope='room-1')=>({source:'stackbite',scope,items});
function setup(){
 let time=0,result=snapshot(),reads=0,accept=true,fail=false;
 const notices=[],changes=[];
 const monitor=createAttentionMonitor({now:()=>time,readSnapshot:async()=>{reads++;if(fail)throw Error('secret-source-error');return result;},onNotice:notice=>{if(!accept)return false;notices.push(notice);return true;},onChange:value=>changes.push(value)});
 return {monitor,notices,changes,get reads(){return reads;},set result(value){result=value;},set accept(value){accept=value;},set fail(value){fail=value;},async tick(dt=0,active=true){time+=dt;monitor.tick({active});await monitor.settled();monitor.tick({active});}};
}

test('projection keeps exact live Room/generation/turn facts, not prose or secrets',()=>{
 const seat={seat_key:'worker',generation:'gen-1',turn_id:1,is_alive:true,lifecycle_state:'awaiting_user',human_input_pending:true};
 const value=projectStackBiteSeats({room_id:'room-1',seats:[{...seat,provider_permission_pending:true,prompt:'secret',token:'secret',output:'approve now'}]}, {roomId:'room-1'});
 assert.deepEqual(value,snapshot([item({kind:'approval'})]));
 for(const patch of [{is_alive:false},{lifecycle_state:'unknown'},{lifecycle_state:'working'},{generation:null},{turn_id:null},{turn_id:0}])assert.deepEqual(projectStackBiteSeats({room_id:'room-1',seats:[{...seat,...patch}]},{roomId:'room-1'}).items,[]);
 assert.throws(()=>projectStackBiteSeats({room_id:'other',seats:[]},{roomId:'room-1'}));
 assert.throws(()=>projectStackBiteSeats({room_id:'room-1',seats:null},{roomId:'room-1'}));
 assert.throws(()=>validateAttentionSnapshot(snapshot(Array.from({length:33},(_,n)=>item({id:'seat-'+n})))));
 assert.throws(()=>validateAttentionSnapshot(snapshot([item(),item()])));
 for(const patch of [{turnId:Infinity},{turnId:'1'},{kind:'click'},{id:'bad\nlabel'},{generation:''}])assert.throws(()=>validateAttentionSnapshot(snapshot([item(patch)])));
});

test('fixed read-only CLI argv, inherited binding, bounded output; no credential reads',async()=>{
 const env={STACKBITE_ROOM_ID:'room-1',STACKBITE_SEAT_KEY:'caller',STACKBITE_SESSION_GENERATION:'g1',STACKBITE_STATE_DIR:'fixture-state',STACKBITE_ROOM_BRIDGE_URL:'http://127.0.0.1:9999'};
 assert.throws(()=>stackBiteBinding({}),/inside a live StackBite Seat/);
 let called=0;const controller=new AbortController();
 const source=createStackBiteSource({env,exec:async(command,args,options)=>{
  called++;assert.equal(command,'stackbite');assert.deepEqual(args,['agent','seats','--output','json']);assert.deepEqual(options.env,env);assert.equal(options.signal,controller.signal);assert.equal(options.windowsHide,true);assert.equal(options.timeout,4000);assert.equal(options.maxBuffer,262144);assert.notEqual(options.shell,true);
  return {stdout:JSON.stringify({room_id:'room-1',seats:[]})};
 }});
 assert.equal(called,0,'construction starts nothing');
 assert.deepEqual(await source.readSnapshot({signal:controller.signal}),snapshot([]));assert.equal(called,1);
});

test('OpenRouter key is never inherited by the StackBite CLI',async()=>{
 const env={STACKBITE_ROOM_ID:'room-1',STACKBITE_SEAT_KEY:'caller',STACKBITE_SESSION_GENERATION:'g1',STACKBITE_STATE_DIR:'fixture-state',STACKBITE_ROOM_BRIDGE_URL:'http://127.0.0.1:9999',OPENROUTER_API_KEY:'fixture-secret'};
 const source=createStackBiteSource({env,exec:async(_command,_args,options)=>{assert.equal(options.env.OPENROUTER_API_KEY,undefined);return {stdout:JSON.stringify({room_id:'room-1',seats:[]})};}});
 await source.readSnapshot();assert.equal(env.OPENROUTER_API_KEY,'fixture-secret','caller environment is not modified');
});

test('optional LLM judgment is anonymous, once per exact item, never suppresses confirmed input',async()=>{
 for(const decision of ['notify','ignore','uncertain','invalid']){
  let calls=0,cues=0,time=0;
  const m=createAttentionMonitor({now:()=>time,readSnapshot:async()=>snapshot(),onNotice:()=>{cues++;return true;},judgeNotice:async input=>{
   calls++;assert.deepEqual(Object.keys(input).sort(),['kind','pendingCount','signal']);assert.equal(input.kind,'input');assert.equal(input.pendingCount,1);return {decision};
  }});
  m.tick();await m.settled();m.tick();await m.settled();m.tick();assert.equal(cues,1);assert.equal(calls,1);
  assert.equal(m.status.lastJudgment,decision==='notify'?'model_notify':decision==='ignore'?'rule_override':'rule_fallback');
  time=20000;m.tick();await m.settled();m.tick();assert.equal(calls,1);assert.equal(cues,1);m.dispose();
 }
});

test('late advice cannot repeat a rule alert or resurrect a resolved source',async()=>{
 let value=snapshot(),time=0,finish,signal,cues=0;
 const m=createAttentionMonitor({now:()=>time,readSnapshot:async()=>value,onNotice:()=>{cues++;return true;},judgeNotice:input=>{signal=input.signal;return new Promise(resolve=>{finish=resolve;});}});
 m.tick();await m.settled();m.tick();await Promise.resolve();assert.equal(signal.aborted,false);
 value=snapshot([]);time=5000;m.tick();await Promise.resolve();await Promise.resolve();assert.equal(signal.aborted,true);
 assert.equal(cues,1,'the confirmed rule alert was delivered before waiting for advice');
 finish({decision:'notify'});await Promise.resolve();await Promise.resolve();m.tick();assert.equal(cues,1);
 m.dispose();
});

test('a stalled or failed judge falls back without freezing the pet or adding timers',async()=>{
 let time=0,cues=0,signal;
 const m=createAttentionMonitor({now:()=>time,readSnapshot:async()=>snapshot(),onNotice:()=>{cues++;return true;},judgeNotice:input=>{signal=input.signal;return new Promise(()=>{});}});
 m.tick();await m.settled();m.tick();assert.equal(cues,1,'delivery is synchronous with the first fresh eligible tick');assert.equal(m.status.lastJudgment,'rule_first');await Promise.resolve();assert.equal(signal.aborted,false);time=3501;m.tick();assert.equal(cues,1);assert.equal(signal.aborted,true);assert.equal(m.status.lastJudgment,'rule_fallback');m.dispose();
 const bad=createAttentionMonitor({readSnapshot:async()=>snapshot(),onNotice:()=>true,judgeNotice:async()=>{throw Error('private upstream failure');}});
 bad.tick();await bad.settled();bad.tick();await bad.settled();bad.tick();assert.equal(bad.status.lastJudgment,'rule_fallback');assert.doesNotMatch(JSON.stringify(bad.status),/private/);bad.dispose();
});

test('busy play starts no inference; rule delivery always precedes anonymous model work',async()=>{
 let accepted=false,cues=0,calls=0;
 const m=createAttentionMonitor({readSnapshot:async()=>snapshot([item({label:'Private local Seat'})]),onNotice:()=>{if(!accepted)return false;cues++;return true;},judgeNotice:async facts=>{
  calls++;assert.equal(cues,1);assert.deepEqual(Object.keys(facts).sort(),['kind','pendingCount','signal']);assert.doesNotMatch(JSON.stringify(facts),/Private|Seat|worker|gen-1/);return {decision:'ignore'};
 }});
 m.tick();await m.settled();for(let i=0;i<20;i++)m.tick();await Promise.resolve();assert.equal(calls,0);assert.equal(cues,0);
 accepted=true;m.tick();assert.equal(cues,1);assert.equal(calls,0);await m.settled();m.tick();assert.equal(calls,1);assert.equal(cues,1);assert.equal(m.status.lastJudgment,'rule_override');m.dispose();
});

test('local target uses the real role title, strips controls, stays bounded and changes at equal counts',async()=>{
 const seat={seat_key:'worker',generation:'gen-1',turn_id:1,is_alive:true,lifecycle_state:'awaiting_user',role_title:'Review\u202e\nWorker',prompt:'private task',title:'not the Seat label'};
 const projected=projectStackBiteSeats({room_id:'room-1',seats:[seat]},{roomId:'room-1'});
 assert.equal(projected.items[0].label,'ReviewWorker');assert.doesNotMatch(JSON.stringify(projected),/private task|not the Seat/);
 const cleaned=validateAttentionSnapshot(snapshot([item({label:'x'.repeat(5000)}),item({id:'malformed',label:{text:'not a label'}})]));
 assert.equal(cleaned.items[0].label.length,64);assert.equal(cleaned.items[1].label,undefined);
 const f=setup();f.result=projected;await f.tick();assert.deepEqual(f.monitor.status.target,{seatId:'worker',label:'ReviewWorker',kind:'input'});
 const before=f.changes.length;f.result=snapshot([item({label:'Renamed Seat'})]);await f.tick(5000);assert.equal(f.notices.length,1);assert.equal(f.monitor.status.target.label,'Renamed Seat');assert.ok(f.changes.length>before);
 const borrowed=f.monitor.status.target;borrowed.label='tampered';assert.equal(f.monitor.status.target.label,'Renamed Seat');
 f.result=snapshot([item({id:'other',kind:'approval',label:'Approval Seat'})]);await f.tick(5000);assert.equal(f.monitor.status.target.seatId,'other');assert.equal(f.monitor.status.target.kind,'approval');
 await f.tick(0,false);assert.equal(f.monitor.status.target,null);f.monitor.dispose();assert.equal(f.monitor.status.target,null);
});

test('pause and identity replacement abort advice without a second cue from its late answer',async()=>{
 for(const pause of [true,false]){
  let time=0,value=snapshot(),finish,signal,cues=0;
  const m=createAttentionMonitor({now:()=>time,readSnapshot:async()=>value,onNotice:()=>{cues++;return true;},judgeNotice:input=>{signal=input.signal;return new Promise(resolve=>{finish=resolve;});}});
  m.tick();await m.settled();m.tick();await Promise.resolve();assert.equal(cues,1);
  if(pause)m.tick({active:false});else{value=snapshot([item({generation:'replacement'})]);time=5000;m.tick();await Promise.resolve();await Promise.resolve();}
  assert.equal(signal.aborted,true);finish({decision:'notify'});await Promise.resolve();await Promise.resolve();m.tick({active:!pause});assert.equal(cues,1);m.dispose();
 }
});

test('current seat_status projection handles approvals/questions and never trusts stale legacy flags',()=>{
 const seat={seat_key:'worker',generation:'gen-1',turn_id:1,is_alive:true,lifecycle_state:'awaiting_user'};
 const status={schema_version:1,generation:'gen-1',phase:'needs_input',turn_id:1,input_kind:'approval',input_request_id:'req-1'};
 const project=patch=>projectStackBiteSeats({room_id:'room-1',seats:[{...seat,seat_status:{...status,...patch}}]},{roomId:'room-1'}).items;
 assert.deepEqual(project({}),[item({kind:'approval',requestId:'req-1'})]);
 assert.deepEqual(project({input_kind:'question',turn_id:null}),[item({turnId:null,requestId:'req-1'})]);
 for(const patch of [{schema_version:2},{generation:'stale'},{phase:'working'},{phase:'unknown'},{input_kind:'onboarding'},{turn_id:null,input_request_id:null}])assert.deepEqual(project(patch),[]);
 assert.throws(()=>validateAttentionSnapshot(snapshot([item({turnId:null})])));
});

test('same pending turn notifies once, kind refinement is not a second question',async()=>{
 const f=setup();await f.tick();assert.equal(f.notices.length,1);
 for(let i=0;i<30;i++)await f.tick(5000);
 assert.equal(f.notices.length,1);assert.equal(f.monitor.status.pendingCount,1);
 f.result=snapshot([item({kind:'approval'})]);await f.tick(20000);assert.equal(f.notices.length,1);
 f.result=snapshot([]);await f.tick(5000);assert.equal(f.monitor.status.pendingCount,0);
 f.result=snapshot();await f.tick(20000);assert.equal(f.notices.length,1,'temporary disappearance does not re-alert the same turn');
 f.result=snapshot([item({turnId:2})]);await f.tick(20000);assert.equal(f.notices.length,2);
 f.result=snapshot([item({generation:'gen-2',turnId:2})]);await f.tick(20000);assert.equal(f.notices.length,3);
 f.result=snapshot([item({generation:'gen-2',turnId:2})],'other-room');await f.tick(20000);assert.equal(f.notices.length,4);
 f.monitor.dispose();
});

test('busy pet retries a fresh fact, with cooldown between distinct notices',async()=>{
 const f=setup();f.accept=false;f.result=snapshot([item(),item({id:'approver',kind:'approval'})]);await f.tick();assert.equal(f.notices.length,0);
 f.accept=true;await f.tick(1);assert.deepEqual(f.notices,[{kind:'approval',side:'left'}]);
 await f.tick(1000);assert.equal(f.notices.length,1);await f.tick(20000);assert.equal(f.notices.length,2);
 f.monitor.dispose();
});

test('resolution/errors clear pending facts, not source secrets or duplicate cues',async()=>{
 const f=setup();f.accept=false;await f.tick();assert.equal(f.monitor.status.pendingCount,1);
 f.fail=true;await f.tick(5000);assert.equal(f.monitor.status.state,'unavailable');assert.equal(f.monitor.status.pendingCount,0);
 assert.doesNotMatch(JSON.stringify(f.changes),/secret/);
 f.fail=false;f.result=snapshot([]);f.accept=true;await f.tick(5000);assert.equal(f.notices.length,0);
 f.monitor.dispose();
});

test('hidden/pause aborts one in-flight read; a late result cannot revive it',async()=>{
 let finish,signal,reads=0;
 const m=createAttentionMonitor({readSnapshot:options=>{reads++;signal=options.signal;return new Promise(resolve=>{finish=resolve;});},onNotice:()=>assert.fail('late notification')});
 m.tick();assert.equal(reads,1);m.tick();assert.equal(reads,1);
 m.tick({active:false});assert.equal(signal.aborted,true);assert.equal(m.status.state,'paused');assert.equal(m.status.pendingCount,0);
 finish(snapshot());await Promise.resolve();await Promise.resolve();assert.equal(m.status.state,'paused');
 for(let i=0;i<100;i++)m.tick({active:false});assert.equal(reads,1);
 m.dispose();m.tick();assert.equal(reads,1);
});

test('stale facts cannot cue while a refresh is stalled; dispose aborts it',async()=>{
 let time=0,reads=0,signal;
 const m=createAttentionMonitor({now:()=>time,readSnapshot:async options=>{reads++;signal=options.signal;if(reads===1)return snapshot();return new Promise(()=>{});},onNotice:()=>false});
 m.tick();await m.settled();assert.equal(m.status.pendingCount,1);
 time=5000;m.tick();assert.equal(reads,2);time=15001;m.tick();assert.equal(m.status.state,'stale');assert.equal(m.status.pendingCount,0);
 m.dispose();assert.equal(signal.aborted,true);assert.equal(m.status.state,'off');
});

test('dedupe retention is capped and import/timing cannot create an unbounded loop',async()=>{
 const f=setup();for(let n=1;n<=150;n++){f.result=snapshot([item({turnId:n})]);await f.tick(20000);}
 assert.equal(f.notices.length,150);assert.equal(f.monitor.status.retainedNotices,128);f.monitor.dispose();assert.equal(f.monitor.status.retainedNotices,0);
 for(const patch of [{intervalMs:0},{intervalMs:Infinity},{intervalMs:2**32},{staleMs:2},{noticeCooldownMs:0}])assert.throws(()=>createAttentionMonitor({readSnapshot:async()=>snapshot(),onNotice:()=>true,...patch}));
});

test('resolution clears the exact cue even if another item keeps the count unchanged',async()=>{
 let value=snapshot(),time=0,cleared=0;
 const m=createAttentionMonitor({now:()=>time,readSnapshot:async()=>value,onNotice:()=>true,onClear:()=>cleared++});
 m.tick();await m.settled();m.tick();assert.equal(cleared,0);
 value=snapshot([item({id:'other'})]);time=5000;m.tick();await m.settled();assert.equal(cleared,1);assert.equal(m.status.pendingCount,1);
 m.dispose();
});

test('distinct durable questions in the same turn each qualify, live dedupe never evicts',async()=>{
 const f=setup();
 for(let n=1;n<=150;n++){
  f.result=snapshot([item({id:'permanent'}),item({requestId:'q-'+n})]);
  await f.tick(20000);
 }
 assert.equal(f.notices.length,150);assert.equal(f.monitor.status.retainedNotices,128);
 // The permanent first pending item remains seen even after 149 newer questions.
 f.result=snapshot([item({id:'permanent'})]);await f.tick(20000);assert.equal(f.notices.length,150);
 f.monitor.dispose();
});
