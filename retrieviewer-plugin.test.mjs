import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {createPetPlugin} from './retrieviewer-plugin.mjs';
import {getPetAssetFiles} from './retrieviewer.mjs';

const moduleUrl=new URL('./retrieviewer-plugin.mjs',import.meta.url).href;
const files=new Map();let loads=0;
const loadAsset=async name=>{loads++;if(!files.has(name))files.set(name,readFileSync(new URL(name,import.meta.url)));return files.get(name);};
const PET_LOADS=getPetAssetFiles().length;
const plain=(text,columns,rows)=>{
 const lines=text.split('\n');assert.equal(lines.length,rows);
 for(const line of lines){const cells=[...line];assert.equal(cells.length,columns);assert.ok(cells.every(c=>c.codePointAt(0)>=0x2800&&c.codePointAt(0)<=0x28ff),'plain Braille only');}
};
// Retain strings only: frame.pixels is borrowed from the renderer.
const sig=f=>JSON.stringify({text:f.text,columns:f.columns,rows:f.rows,x:f.state.x,z:f.state.z,state:f.state.state,decisions:f.report.decisions});
const makeHost=(size={columns:24,rows:8})=>{
 const host={size,frames:[],clears:0,errors:[],getSize:()=>host.size,render(f){plain(f.text,f.columns,f.rows);host.frames.push(sig(f));},clear(){host.clears++;},onError(e){host.errors.push(e);}};
 return host;
};
// Deterministic scheduler: advance() fires due callbacks in time order.
const fakeClock=()=>{
 let now=0,id=0;const queue=new Map();
 return {queue,now:()=>now,schedule(callback,delayMs){queue.set(++id,{callback,at:now+delayMs});return id;},cancel(handle){queue.delete(handle);},
  advance(ms){const end=now+ms;for(;;){const next=[...queue].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>end)break;queue.delete(next[0]);now=next[1].at;next[1].callback();}now=end;}};
};
const make=async(host,{seed=7,clock,fps=20}={})=>createPetPlugin({host,petOptions:{seed,loadAsset},fps,scheduler:clock});
const last=host=>host.frames.at(-1);

test('import and create start no timers, renders, listeners or globals; start/pause own one timer',()=>{
 const probe=`
  const events=['exit','SIGINT','SIGTERM','SIGWINCH','uncaughtException'];
  // Timers only: the core's file reads can leave a transient fs CloseReq behind.
  const snap=()=>({timers:process.getActiveResourcesInfo().filter(r=>r==='Timeout'||r==='Immediate').join(),listeners:events.map(e=>process.listenerCount(e)).join(),stdin:process.stdin.listenerCount?.('data')??0});
  const globals=new Set(Object.getOwnPropertyNames(globalThis)),before=snap();
  const {createPetPlugin}=await import(${JSON.stringify(moduleUrl)});
  let renders=0;const host={getSize:()=>({columns:20,rows:6}),render(){renders++;}};
  const plugin=await createPetPlugin({host,petOptions:{seed:3}});
  const created=snap(),createdRenders=renders;
  plugin.start();const started=process.getActiveResourcesInfo().filter(r=>r==='Timeout').length,startedRenders=renders;
  plugin.pause();const paused=process.getActiveResourcesInfo().filter(r=>r==='Timeout').length;
  plugin.dispose();
  console.log(JSON.stringify({same:JSON.stringify(created)===JSON.stringify(before),added:Object.getOwnPropertyNames(globalThis).filter(k=>!globals.has(k)),createdRenders,started,startedRenders,paused,after:JSON.stringify(snap())===JSON.stringify(before)}));`;
 const out=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',probe],{cwd:tmpdir(),encoding:'utf8',timeout:30000}).trim().split('\n').at(-1));
 assert.deepEqual(out,{same:true,added:[],createdRenders:0,started:1,startedRenders:1,paused:0,after:true});
});

test('options are validated before any asset loads',async()=>{
 const before=loads,host=makeHost();
 await assert.rejects(createPetPlugin({host:{render(){}}}),TypeError);
 await assert.rejects(createPetPlugin({host,fps:0}),RangeError);
 await assert.rejects(createPetPlugin({host,scheduler:{now(){},schedule(){}}}),TypeError);
 await assert.rejects(createPetPlugin({host:{...host,onError:1}}),TypeError);
 assert.equal(loads,before);
});

test('scheduled loop: immediate first frame, elapsed dt, idempotent start, pause/resume without catch-up',async t=>{
 const clock=fakeClock(),host=makeHost(),refHost=makeHost();
 let before=loads;const plugin=await make(host,{clock});
 assert.equal(loads-before,PET_LOADS);assert.equal(clock.queue.size,0);assert.equal(host.frames.length,0);assert.equal(plugin.running,false);
 const ref=await make(refHost);
 t.after(()=>{plugin.dispose();ref.dispose();});
 plugin.start();ref.render();
 assert.equal(plugin.running,true);assert.equal(host.frames.length,1);assert.equal(clock.queue.size,1);assert.equal(last(host),last(refHost));
 plugin.start();assert.equal(host.frames.length,1);assert.equal(clock.queue.size,1,'exactly one pending callback');
 for(let i=0;i<60;i++){clock.advance(50);ref.tick(.05);assert.equal(clock.queue.size,1);assert.equal(last(host),last(refHost));}
 assert.equal(host.frames.length,61);assert.ok(new Set(host.frames).size>1,'pet visibly moved');
 plugin.pause();plugin.pause();assert.equal(plugin.running,false);assert.equal(clock.queue.size,0);
 clock.advance(10_000);assert.equal(host.frames.length,61);
 plugin.start();ref.render();assert.equal(last(host),last(refHost),'resume does not simulate paused time');
 for(let i=0;i<10;i++){clock.advance(50);ref.tick(.05);assert.equal(last(host),last(refHost));}
 // Manual render between frames shows the current state without advancing time.
 assert.equal(plugin.render(),true);ref.render();assert.equal(last(host),last(refHost));
 clock.advance(50);ref.tick(.05);assert.equal(last(host),last(refHost));
 assert.throws(()=>plugin.tick(.05),/pause\(\) the scheduled loop first/);
 assert.equal(typeof plugin.interact('ball'),'boolean');assert.throws(()=>plugin.interact('bone'),TypeError);
});

test('hidden and zero-size panes neither render nor advance; each frame reads a fresh size',async t=>{
 const clock=fakeClock(),host=makeHost(null),refHost=makeHost({columns:30,rows:9});
 const plugin=await make(host,{clock}),ref=await make(refHost);
 t.after(()=>{plugin.dispose();ref.dispose();});
 plugin.start();assert.equal(plugin.running,true);assert.equal(clock.queue.size,1);assert.equal(host.frames.length,0);
 clock.advance(500);host.size={columns:0,rows:4};clock.advance(200);host.size={columns:5,rows:0};clock.advance(200);
 assert.equal(host.frames.length,0);assert.equal(clock.queue.size,1,'keeps polling for a reveal');
 // Close to a second passed while hidden; the reveal still renders the pet at t=0.
 host.size={columns:30,rows:9};clock.advance(50);ref.render();
 assert.equal(host.frames.length,1);assert.equal(last(host),last(refHost),'reveal starts at dt 0');
 host.size={columns:16,rows:5};refHost.size={columns:16,rows:5};
 clock.advance(50);ref.tick(.05);assert.equal(last(host),last(refHost));assert.equal(JSON.parse(last(host)).columns,16,'resize without listeners');
 host.size=null;clock.advance(1000);host.size={columns:16,rows:5};clock.advance(50);ref.render();
 assert.equal(last(host),last(refHost),'hidden time is not caught up');
 // Manual ticks while hidden do not advance either.
 plugin.pause();host.size=null;assert.equal(plugin.tick(2),false);
 host.size={columns:16,rows:5};assert.equal(plugin.tick(.05),true);ref.tick(.05);assert.equal(last(host),last(refHost));
 // Invalid non-zero sizes are host bugs, not hidden panes.
 host.size={columns:-1,rows:3};assert.throws(()=>plugin.tick(.05),RangeError);
 host.size={columns:2.5,rows:0};assert.throws(()=>plugin.render(),RangeError);
 assert.throws(()=>plugin.start(),RangeError);assert.equal(plugin.running,false);assert.equal(clock.queue.size,0);
 host.size='big';assert.throws(()=>plugin.render(),TypeError);
 host.size={columns:16,rows:5};plugin.start();host.size={columns:16,rows:-2};clock.advance(50);
 assert.ok(host.errors.at(-1) instanceof RangeError);assert.equal(plugin.running,false);assert.equal(clock.queue.size,0);
});

test('render errors: direct calls throw and stop; scheduled errors pause and go to onError once',async t=>{
 const clock=fakeClock(),host=makeHost(),plugin=await make(host,{clock});
 t.after(()=>plugin.dispose());
 const boom=Error('boom'),render=host.render;let fail=true;
 host.render=f=>{if(fail)throw boom;render(f);};
 assert.throws(()=>plugin.start(),boom);assert.equal(plugin.running,false);assert.equal(clock.queue.size,0);
 assert.throws(()=>plugin.tick(.05),boom);assert.throws(()=>plugin.render(),boom);
 fail=false;plugin.start();assert.equal(host.frames.length,1);
 fail=true;clock.advance(50);
 assert.deepEqual(host.errors,[boom]);assert.equal(plugin.running,false);assert.equal(clock.queue.size,0);
 clock.advance(1000);assert.equal(host.errors.length,1);
 // onError failing escapes the callback but never reschedules.
 fail=false;plugin.start();fail=true;const bad=Error('onError failed');host.onError=()=>{throw bad;};
 assert.throws(()=>clock.advance(50),bad);assert.equal(plugin.running,false);assert.equal(clock.queue.size,0);
 // Without onError the plugin pauses safely and the scheduler sees nothing.
 delete host.onError;fail=false;plugin.start();fail=true;
 clock.advance(50);assert.equal(plugin.running,false);assert.equal(clock.queue.size,0);
 fail=false;plugin.start();assert.equal(plugin.running,true,'paused, not disposed');
 assert.equal(plugin.disposed,false);
});

test('reentrant pause/dispose from render, idempotent dispose and one clear even when clear throws',async()=>{
 const clock=fakeClock(),host=makeHost(),plugin=await make(host,{clock}),render=host.render;
 let action=null;host.render=f=>{render(f);action?.();};
 plugin.start();action=()=>plugin.pause();clock.advance(50);
 assert.equal(plugin.running,false);assert.equal(clock.queue.size,0);
 action=()=>plugin.tick(.05);
 assert.throws(()=>plugin.render(),/inside host.render/);
 action=null;plugin.start();action=()=>plugin.render();
 clock.advance(50);assert.match(host.errors.at(-1).message,/inside host.render/);assert.equal(plugin.running,false);
 action=()=>plugin.dispose();const frames=host.frames.length;plugin.start();
 assert.equal(plugin.disposed,true);assert.equal(plugin.running,false);assert.equal(host.clears,1);assert.equal(clock.queue.size,0);
 clock.advance(1000);assert.equal(host.frames.length,frames+1,'no late render after disposal');
 plugin.dispose();assert.equal(host.clears,1);plugin.pause();
 for(const call of [()=>plugin.start(),()=>plugin.render(),()=>plugin.tick(0),()=>plugin.interact('ball')])assert.throws(call,/disposed/);
 // Disposal from inside a scheduled frame.
 const clock2=fakeClock(),host2=makeHost(),plugin2=await make(host2,{clock:clock2}),render2=host2.render;
 plugin2.start();host2.render=f=>{render2(f);plugin2.dispose();};clock2.advance(50);
 assert.equal(plugin2.disposed,true);assert.equal(host2.clears,1);assert.equal(clock2.queue.size,0);
 clock2.advance(1000);assert.equal(host2.frames.length,2);
 // A throwing clear propagates once; the plugin is still fully disposed.
 const clock3=fakeClock(),host3=makeHost(),plugin3=await make(host3,{clock:clock3}),cleared=Error('clear failed');
 host3.clear=()=>{host3.clears++;throw cleared;};plugin3.start();
 assert.throws(()=>plugin3.dispose(),cleared);assert.equal(plugin3.disposed,true);assert.equal(clock3.queue.size,0);
 plugin3.dispose();assert.equal(host3.clears,1);
});

test('instances are independent: own pet, clock and host',async t=>{
 const clockA=fakeClock(),clockB=fakeClock(),hostA=makeHost(),hostB=makeHost({columns:12,rows:4});
 const before=loads,a=await make(hostA,{clock:clockA,seed:1}),b=await make(hostB,{clock:clockB,seed:1});
 t.after(()=>{a.dispose();b.dispose();});
 assert.equal(loads-before,2*PET_LOADS);
 a.start();b.start();
 for(let i=0;i<20;i++)clockA.advance(50);
 assert.equal(hostA.frames.length,21);assert.equal(hostB.frames.length,1);assert.equal(clockB.queue.size,1);
 a.pause();assert.equal(b.running,true);a.dispose();assert.equal(hostB.clears,0);
 clockB.advance(50);assert.equal(hostB.frames.length,2);assert.equal(JSON.parse(last(hostB)).columns,12);
 // A host-owned loop needs no scheduler at all.
 const hostC=makeHost(),c=await createPetPlugin({host:hostC,petOptions:{seed:1,loadAsset}});t.after(()=>c.dispose());
 for(let i=0;i<5;i++)assert.equal(c.tick(1/30),true);
 assert.equal(hostC.frames.length,5);assert.equal(c.running,false);
});
