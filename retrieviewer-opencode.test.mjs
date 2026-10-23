import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {createOpenCodePetController,petViewport,LIMITS,POLL_MS,HEARTBEAT_MS} from './integrations/opencode/runtime.mjs';
import {createPetPlugin} from './retrieviewer-plugin.mjs';

const runtimeUrl=new URL('./integrations/opencode/runtime.mjs',import.meta.url).href;
const files=new Map();
const loadAsset=async name=>{if(!files.has(name))files.set(name,readFileSync(new URL(name,import.meta.url)));return files.get(name);};
const flush=async(n=5)=>{for(let i=0;i<n;i++)await new Promise(r=>setImmediate(r));};
const until=async(cond,ms=60000)=>{const end=Date.now()+ms;while(!cond()){if(Date.now()>end)throw Error('timed out');await new Promise(r=>setTimeout(r,5));}};
// Deterministic scheduler: advance() fires due callbacks in time order.
const fakeClock=()=>{
 let now=0,id=0;const queue=new Map();
 return {queue,now:()=>now,schedule(callback,delayMs){queue.set(++id,{callback,at:now+delayMs});return id;},cancel(handle){queue.delete(handle);},
  advance(ms){const end=now+ms;for(;;){const next=[...queue].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>end)break;queue.delete(next[0]);now=next[1].at;next[1].callback();}now=end;}};
};
// Host settings contract (parent-owned retrieviewer-config.mjs), faked in memory.
const fakeSettings=(enabled=false)=>{
 const s={enabled,reads:0,writes:[],receipts:[],
  readAgentSettings:async agent=>{assert.equal(agent,'opencode');s.reads++;return {enabled:s.enabled};},
  setAgentEnabled:async(agent,value)=>{assert.equal(agent,'opencode');s.writes.push(value);s.enabled=value;},
  writeRuntimeReceipt:async(agent,body)=>{assert.equal(agent,'opencode');s.receipts.push(structuredClone(body));}};
 return s;
};
const makeView=(viewport={width:100,height:40})=>{const v={viewport,texts:[],getViewport:()=>v.viewport,render:t=>v.texts.push(t)};return v;};
const lastText=v=>v.texts.at(-1);
const plain=(text,columns,rows)=>{
 const lines=text.split('\n');assert.equal(lines.length,rows);
 for(const line of lines){assert.equal([...line].length,columns);assert.ok(/^[⠀-⣿]*$/u.test(line),'plain Braille only');}
};
// Minimal fake of the plugin contract, for lifecycle races without art I/O.
const fakePluginFactory=()=>{
 const made=[];
 const create=async({host})=>{
  const p={host,running:false,disposed:false,starts:0,interactions:[],
   start(){p.running=true;p.starts++;this.render();},pause(){p.running=false;},
   render(){const size=host.getSize();if(!size)return false;host.render({text:'⠀'.repeat(size.columns),columns:size.columns,rows:size.rows});return true;},
   interact(kind){p.interactions.push(kind);return true;},
   dispose(){if(p.disposed)return;p.disposed=true;p.running=false;host.clear();}};
  made.push(p);return p;
 };
 return {made,create};
};

test('viewport is bounded so the host prompt stays usable, and tiny terminals hide the pet',()=>{
 assert.deepEqual(petViewport({width:200,height:80}),{columns:LIMITS.maxColumns,rows:LIMITS.maxRows});
 assert.deepEqual(petViewport({width:60,height:30}),{columns:56,rows:8});
 assert.equal(petViewport({width:23,height:40}),null);
 assert.equal(petViewport({width:100,height:23}),null);
 assert.equal(petViewport(null),null);
 assert.equal(petViewport({width:NaN,height:40}),null);
});

test('import and controller creation start no timers, listeners, settings or art loads',()=>{
 const probe=`
  const events=['exit','SIGINT','SIGTERM','SIGWINCH','uncaughtException'];
  const snap=()=>({timers:process.getActiveResourcesInfo().filter(r=>r==='Timeout'||r==='Immediate').join(),listeners:events.map(e=>process.listenerCount(e)).join(),stdin:process.stdin.listenerCount?.('data')??0});
  const globals=new Set(Object.getOwnPropertyNames(globalThis)),before=snap();
  const m=await import(${JSON.stringify(runtimeUrl)});
  let loads=0;
  const c=m.createOpenCodePetController({loadPlugin:async()=>{loads++;},loadSettings:async()=>{loads++;}});
  const created=snap();
  c.dispose();
  console.log(JSON.stringify({same:JSON.stringify(created)===JSON.stringify(before),loads,added:Object.getOwnPropertyNames(globalThis).filter(k=>!globals.has(k)),after:JSON.stringify(snap())===JSON.stringify(before)}));`;
 const out=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',probe],{cwd:tmpdir(),encoding:'utf8',timeout:30000}).trim().split('\n').at(-1));
 assert.deepEqual(out,{same:true,loads:0,added:[],after:true});
});

test('real core: mounted+enabled renders bounded Braille, receipts, interactions, disable and clean shutdown',async()=>{
 const clock=fakeClock(),settings=fakeSettings(true),errors=[];
 const writes=[];const realWrite=process.stdout.write;// node:test reports over stdout as binary frames; text writes would be ours.
 process.stdout.write=function(...a){if(typeof a[0]==='string')writes.push(a[0]);return realWrite.apply(this,a);};
 const listeners=()=>['exit','SIGINT','SIGTERM','SIGWINCH'].map(e=>process.listenerCount(e)).join()+'|'+process.stdin.listenerCount('data');
 const before=listeners();
 let created=0;
 const controller=createOpenCodePetController({hostVersion:'2.1.2',scheduler:clock,fps:15,petOptions:{seed:7,loadAsset},
  loadPlugin:async()=>opts=>{created++;return createPetPlugin(opts);},loadSettings:async()=>settings,onError:e=>errors.push(e)});
 const view=makeView({width:100,height:40});
 const handle=controller.attach(view);
 try{
  await until(()=>controller.status().running);
  assert.equal(created,1);
  plain(lastText(view),64,12);
  await controller.settled();
  assert.equal(settings.receipts.length,1);
  const first=settings.receipts[0];
  assert.equal(first.phase,'rendering');assert.equal(first.hostVersion,'2.1.2');
  assert.equal(first.columns,64);assert.equal(first.rows,12);assert.equal(first.frames,1);
  assert.ok(!Number.isNaN(Date.parse(first.firstFrameAt)));
  // Autonomous play: frames advance with the scheduler; heartbeat <= once per 5 s.
  const shown=view.texts.length;
  clock.advance(HEARTBEAT_MS-1);await flush();
  assert.ok(view.texts.length>shown+50);
  await controller.settled();assert.equal(settings.receipts.length,1);
  clock.advance(1);await flush();await controller.settled();
  assert.equal(settings.receipts.length,2);assert.ok(settings.receipts[1].frames>50);
  assert.equal(settings.receipts[1].firstFrameAt,first.firstFrameAt);
  // Poll stays at <= 1 Hz.
  assert.ok(settings.reads<=Math.ceil(HEARTBEAT_MS/POLL_MS)+1,`reads ${settings.reads}`);
  // Resize derives the pane from the host viewport.
  view.viewport={width:60,height:30};handle.refresh();plain(lastText(view),56,8);
  assert.match(await controller.command('ball'),/ball accepted|busy/);
  assert.match(await controller.command('status'),/enabled, rendering 56x8/);
  assert.match(await controller.command('nonsense'),/^Usage: \/retrieviewer enable\|disable\|ball\|treat\|status$/);
  assert.equal(await controller.command('disable'),'Retrieviewer disabled');
  assert.deepEqual(settings.writes,[false]);
  assert.equal(lastText(view),'');assert.equal(controller.status().running,false);
  await controller.settled();
  assert.equal(settings.receipts.at(-1).phase,'stopped');
  assert.match(await controller.command('ball'),/disabled/);
  // Only the 1 Hz settings poll remains while mounted and disabled.
  assert.equal(clock.queue.size,1);
  handle.detach();
  assert.equal(clock.queue.size,0);
  await controller.dispose();
  assert.deepEqual(errors,[]);
 }finally{process.stdout.write=realWrite;controller.dispose();}
 assert.deepEqual(writes,[]);
 assert.equal(listeners(),before);
});

test('async load is cancelled by disable, unmount or dispose and never renders',async()=>{
 for(const cancel of ['disable','detach','dispose']){
  const clock=fakeClock(),settings=fakeSettings(true),fake=fakePluginFactory();
  let release;const gate=new Promise(r=>release=r);
  const controller=createOpenCodePetController({scheduler:clock,loadSettings:async()=>settings,loadPlugin:async()=>{await gate;return fake.create;}});
  const view=makeView();
  const handle=controller.attach(view);
  await flush();
  assert.equal(controller.status().loading,true,cancel);
  if(cancel==='disable')await controller.setEnabled(false);
  if(cancel==='detach')handle.detach();
  if(cancel==='dispose')controller.dispose();
  release();await flush(10);
  assert.ok(fake.made.every(p=>p.disposed),cancel);
  assert.ok(view.texts.every(t=>t===''),cancel);
  assert.equal(controller.status().running,false,cancel);
  await controller.settled();
  assert.deepEqual(settings.receipts,[],cancel);
  controller.dispose();
  assert.equal(clock.queue.size,0,cancel);
 }
});

test('external enable/disable is synchronized by the <=1 Hz poll; stale polls lose to slash toggles',async()=>{
 const clock=fakeClock(),settings=fakeSettings(false),fake=fakePluginFactory();
 const controller=createOpenCodePetController({scheduler:clock,loadSettings:async()=>settings,loadPlugin:async()=>fake.create});
 const view=makeView();
 controller.attach(view);await flush();
 assert.equal(fake.made.length,0);assert.equal(settings.reads,1);
 settings.enabled=true;               // CLI enabled it elsewhere
 clock.advance(POLL_MS-1);await flush();assert.equal(fake.made.length,0);
 clock.advance(1);await flush(10);
 assert.equal(settings.reads,2);assert.equal(fake.made.length,1);assert.ok(fake.made[0].running);
 settings.enabled=false;              // CLI disabled it
 clock.advance(POLL_MS);await flush(10);
 assert.ok(fake.made[0].disposed);assert.equal(lastText(view),'');
 // Slash enable while an old poll result (disabled) is in flight: the toggle wins.
 let hold;settings.readAgentSettings=async()=>{settings.reads++;await new Promise(r=>hold=r);return {enabled:false};};
 clock.advance(POLL_MS);await flush();
 await controller.setEnabled(true);await flush(10);
 hold();await flush(10);
 assert.equal(controller.status().enabled,true);
 assert.ok(fake.made.at(-1).running);
 controller.dispose();
 assert.equal(clock.queue.size,0);
});

test('slots share one core: newest view draws, detaching one never disposes the other',async()=>{
 const clock=fakeClock(),settings=fakeSettings(true),fake=fakePluginFactory();
 const controller=createOpenCodePetController({scheduler:clock,loadSettings:async()=>settings,loadPlugin:async()=>fake.create});
 const home=makeView({width:80,height:40}),session=makeView({width:100,height:40});
 const homeHandle=controller.attach(home);await flush(10);
 assert.equal([...lastText(home)].length,64);
 const sessionHandle=controller.attach(session);await flush(10);
 assert.equal(fake.made.length,1);
 assert.equal(lastText(home),'');assert.ok(lastText(session).length>0);
 sessionHandle.detach();
 assert.equal(fake.made[0].disposed,false);
 assert.ok(lastText(home).length>0);
 homeHandle.detach();
 assert.equal(fake.made[0].disposed,true);
 assert.equal(clock.queue.size,0);
 controller.dispose();
});

test('hidden pane pauses the simulation and refresh after resize resumes it',async()=>{
 const clock=fakeClock(),settings=fakeSettings(true);
 const controller=createOpenCodePetController({scheduler:clock,fps:15,petOptions:{seed:3,loadAsset},loadSettings:async()=>settings,loadPlugin:async()=>createPetPlugin});
 const view=makeView({width:100,height:40});
 const handle=controller.attach(view);
 try{
  await until(()=>controller.status().running);
  const frames=()=>controller.status().frames;
  view.viewport={width:100,height:20};   // too short: hidden on the next frame
  clock.advance(100);await flush();
  assert.equal(controller.status().running,false);
  assert.equal(lastText(view),'');
  const hidden=frames();
  clock.advance(3000);await flush();
  assert.equal(frames(),hidden,'no frames while hidden');
  assert.equal(clock.queue.size,1,'only the settings poll is scheduled');
  view.viewport={width:100,height:40};handle.refresh();
  assert.equal(controller.status().running,true);
  plain(lastText(view),64,12);
 }finally{controller.dispose();}
 assert.equal(clock.queue.size,0);
});

test('settings failures are reported once and leave the pet disabled',async()=>{
 const clock=fakeClock(),errors=[],fake=fakePluginFactory();
 const controller=createOpenCodePetController({scheduler:clock,onError:e=>errors.push(e),loadSettings:async()=>{throw Error('no settings module');},loadPlugin:async()=>fake.create});
 controller.attach(makeView());await flush();
 clock.advance(POLL_MS*3);await flush(10);
 assert.equal(errors.length,1);assert.equal(fake.made.length,0);
 await assert.rejects(controller.command('enable'),/no settings module/);
 controller.dispose();
 assert.equal(clock.queue.size,0);
});
