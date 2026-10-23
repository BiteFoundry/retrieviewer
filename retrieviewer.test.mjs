import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {createPet,PET_ASSETS,STEP_SECONDS,getPetAssetFiles} from './retrieviewer.mjs';

const moduleUrl=new URL('./retrieviewer.mjs',import.meta.url).href;
const plain=(text,columns,rows)=>{
 const lines=text.split('\n');assert.equal(lines.length,rows);
 for(const line of lines){const cells=[...line];assert.equal(cells.length,columns);assert.ok(cells.every(c=>c.codePointAt(0)>=0x2800&&c.codePointAt(0)<=0x28ff),'plain Braille only, no ANSI');}
};

test('import performs no asset I/O and installs no listeners, timers or globals',()=>{
 const probe=`
  import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';
  let reads=0;for(const o of [fs,fs.promises])for(const k of ['readFile','readFileSync','open','openSync'])if(o[k]){const f=o[k];o[k]=function(...a){if(/\.(gz|animal)$|puppy-(stride-meta|stable-meta|paper-[a-z0-9-]+|companion-[a-z0-9-]+)\.json$/.test(String(a[0])))reads++;return f.apply(this,a);};}
  syncBuiltinESMExports();
  const globals=new Set(Object.getOwnPropertyNames(globalThis)),handles=process.getActiveResourcesInfo().length,listeners=['exit','SIGINT','SIGWINCH','uncaughtException'].map(e=>process.listenerCount(e));
  const m=await import(${JSON.stringify(moduleUrl)});
  if(typeof m.createPet!=='function')throw Error('missing createPet');
  const added=Object.getOwnPropertyNames(globalThis).filter(k=>!globals.has(k));
  const now=['exit','SIGINT','SIGWINCH','uncaughtException'].map(e=>process.listenerCount(e));
  console.log(JSON.stringify({reads,added,handles:process.getActiveResourcesInfo().length-handles,listeners:now.join()===listeners.join(),stdin:process.stdin.listenerCount?.('data')??0}));`;
 const out=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',probe],{cwd:tmpdir(),encoding:'utf8'}).trim().split('\n').at(-1));
 assert.deepEqual(out,{reads:0,added:[],handles:0,listeners:true,stdin:0});
});

const files=new Map();let loads=0;
const memo=name=>{loads++;if(!files.has(name))files.set(name,readFileSync(new URL(name,import.meta.url)));return files.get(name);};

test('concurrent default pets share art, survive another disposal and release the last lease',()=>{
 const probe=`
 import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';
 let reads=0;const original=fs.promises.readFile;
 fs.promises.readFile=function(...args){if(/(?:puppy-.*\\.(?:json|gz)|locomotion-puppy\\.animal)$/.test(String(args[0])))reads++;return original.apply(this,args);};
 syncBuiltinESMExports();const {createPet}=await import(${JSON.stringify(moduleUrl)});
 const [a,b]=await Promise.all([createPet({seed:1}),createPet({seed:2})]);
 const loaded=reads;a.dispose();const visible=b.frame({columns:20,rows:6}).text.length>0;
 b.dispose();const c=await createPet({seed:3});const reloaded=reads;c.dispose();
 console.log(JSON.stringify({loaded,reloaded,visible}));`;
 const out=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',probe],{encoding:'utf8',timeout:20000}).trim());
 assert.equal(out.loaded,getPetAssetFiles().length,'only one load across concurrent pets, no invisible 3D bake');assert.equal(out.reloaded,2*getPetAssetFiles().length,'last disposal releases cached assets');assert.equal(out.visible,true);
});

test('embedded pet: loading, frames, resize, stepping, interaction, independence and disposal',async t=>{
 // Default loader resolves against the module URL even from a foreign cwd.
 const cwd=process.cwd();process.chdir(tmpdir());let a;
 try{a=await createPet({seed:11});}finally{process.chdir(cwd);}
 // Custom loader returning typed views (not ArrayBuffers) works too.
 const b=await createPet({seed:11,loadAsset:async name=>memo(name).subarray(0)});
 t.after(()=>{a.dispose();b.dispose();});
 assert.ok(loads>=Object.keys(PET_ASSETS).length);

 await t.test('exact-sized plain Braille with borrowed pixels',()=>{
  const f=a.frame({columns:40,rows:12});plain(f.text,40,12);
  assert.equal(f.columns,40);assert.equal(f.rows,12);assert.equal(f.pixels.length,80*48*4);
  assert.ok([...f.text].some(c=>c!=='⠀'&&c!=='\n'),'puppy visible');
  assert.ok(Number.isFinite(f.placement.size)&&Number.isFinite(f.contacts.samples));
  assert.equal(typeof f.report.intent,'string');assert.equal(typeof f.state.state,'string');
  assert.equal(a.frame({columns:40,rows:12}).pixels,f.pixels,'renderer reused at same size');
 });

 await t.test('resize reuses assets and honours explicit camera',()=>{
  const small=a.frame({columns:20,rows:6});plain(small.text,20,6);
  const wide=a.frame({columns:61,rows:9,cellAspect:.45,poseFps:12,contactEnabled:false});plain(wide.text,61,9);
  const cam=a.frame({columns:30,rows:10,camera:{viewportWidth:100,viewportHeight:40,rect:{left:10,top:5,width:60,height:30}}});plain(cam.text,30,10);
 });

 await t.test('fixed-step simulation with bounded catch-up',()=>{
  assert.equal(a.step(0),0);assert.equal(a.step(STEP_SECONDS),1);assert.equal(a.step(10),6,'clamped to 0.1 s');
  let n=0;for(let i=0;i<4;i++)n+=a.step(STEP_SECONDS/4);assert.equal(n,1,'sub-step deltas accumulate');
  for(const bad of [-1,NaN,Infinity,'1',undefined])assert.throws(()=>a.step(bad),RangeError);
 });

 await t.test('input validation',()=>{
  for(const bad of [{columns:0,rows:5},{columns:2.5,rows:5},{columns:5},{columns:500,rows:500},{columns:5,rows:5,cellAspect:0},{columns:5,rows:5,poseFps:NaN},{columns:5,rows:5,poseFps:25}])assert.throws(()=>a.frame(bad),RangeError);
  assert.throws(()=>a.interact('bone'),TypeError);
 });

 await t.test('independent state',()=>{
  const before=JSON.stringify(b.frame({columns:24,rows:8}).state);
  for(let i=0;i<120;i++)a.step(1/30);
  assert.equal(JSON.stringify(b.frame({columns:24,rows:8}).state),before);
  assert.equal(b.interact('ball'),true);assert.equal(b.frame({columns:24,rows:8}).report.interaction,'ball');
  assert.notEqual(a.frame({columns:24,rows:8}).report.interaction,'ball');
  for(let i=0;i<60;i++)b.step(1/60);plain(b.frame({columns:24,rows:8}).text,24,8);
 });

 await t.test('dispose is idempotent and later calls throw',()=>{
  a.dispose();a.dispose();assert.equal(a.disposed,true);
  assert.throws(()=>a.step(.01),/disposed/);assert.throws(()=>a.frame({columns:4,rows:4}),/disposed/);assert.throws(()=>a.interact('ball'),/disposed/);
  plain(b.frame({columns:10,rows:4}).text,10,4);
 });
});

test('loader contract errors are reported',async()=>{
 let reads=0;const loadAsset=async()=>{reads++;throw Error('must not load');};
 for(const opts of [{seed:-1},{seed:1.5},{seed:2**32},{energy:NaN},{energy:1.1},{artProfile:'q4'}])await assert.rejects(createPet({...opts,loadAsset}),RangeError);
 assert.equal(reads,0,'invalid options fail before loading large assets');
 await assert.rejects(createPet({loadAsset:'nope'}),TypeError);
 await assert.rejects(createPet({loadAsset:async()=>'text'}),/ArrayBuffer or typed bytes/);
 await assert.rejects(createPet({loadAsset:async name=>{throw Error('missing '+name);}}),/missing/);
});
