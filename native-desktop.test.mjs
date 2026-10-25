import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,cp,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID,randomBytes} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {verifyNativeArtifact} from './integrations/native-windows/desktop.mjs';
import {startDesktop,desktopStatus,stopDesktop,readSession,requestSession,prepareRoot} from './integrations/windows-overlay/desktop.mjs';
import {controlAddress} from './integrations/desktop/platform.mjs';
import {getPetAssetFiles} from './retrieviewer.mjs';
const windows=process.platform==='win32'&&process.arch==='x64';
test('native scene uses one crop and reclaims oversized buffers',{skip:!windows},()=>{
 const executable=fileURLToPath(new URL('./integrations/native-windows/bin/win32-x64/retrieviewer-native.exe',import.meta.url));
 const result=JSON.parse(execFileSync(executable,['--self-test-regions'],{encoding:'utf8',windowsHide:true,timeout:10000}));
 assert.equal(result.passed,true);assert.ok(result.partitionCases>=50);assert.equal(result.coverageAndDisjointness,true);assert.equal(result.surfaceShrink,true);
});
test('native moving scenes keep one stable visible HWND and exact full-frame pixels',{skip:!windows},()=>{
 const executable=fileURLToPath(new URL('./integrations/native-windows/bin/win32-x64/retrieviewer-native.exe',import.meta.url));
 const result=JSON.parse(execFileSync(executable,['--self-test-presentation'],{encoding:'utf8',windowsHide:true,timeout:20000}));
 assert.equal(result.passed,true);assert.equal(result.frames,128);assert.equal(result.singleWindow,true);assert.equal(result.stableWindow,true);assert.equal(result.pixelExact,true);assert.equal(result.hiddenResourcesReleased,true);
});

test('shipped native files match the checked-in manifest; cat is separately licensed',async()=>{
 const manifest=await verifyNativeArtifact();assert.ok(manifest.files['bin/win32-x64/retrieviewer-native.exe'].bytes<2_000_000);
 const license=await readFile(new URL('./integrations/purrviewer/ASSETS-LICENSE.md',import.meta.url),'utf8');assert.match(license,/CC BY-SA 4.0/);
});
test('native bootstrap detaches one process, switches species, authenticates and cleans up',{skip:!windows,timeout:20000},async()=>{
 const options={stateDir:await mkdtemp(join(tmpdir(),'pet-native-lifecycle-')),nativeDiagnostic:true};let started;
 try{
  started=await startDesktop(options);assert.equal(started.engine,'quickjs-native');assert.equal(started.pid,started.painterPid);assert.equal(started.detached,true);
  const session=await readSession(options);await assert.rejects(requestSession({...session,token:'0'.repeat(64)},'status'));
  const cat=await startDesktop({...options,pet:'cat'});assert.equal(cat.pet,'cat');assert.equal(cat.pid,started.pid);
  const dog=await startDesktop({...options,pet:'dog'});assert.equal(dog.pet,'dog');assert.equal(dog.pid,started.pid);
 }finally{if(started)await stopDesktop(options);}
 assert.deepEqual(await desktopStatus(options),{running:false});
});
test('native startup EOF before detach exits and removes its own session',{skip:!windows,timeout:15000},async()=>{
 const options={stateDir:await mkdtemp(join(tmpdir(),'pet-native-orphan-'))},paths=await prepareRoot(options),token=randomBytes(32).toString('hex'),pipe=controlAddress({uuid:randomUUID()});
 const root=fileURLToPath(new URL('./',import.meta.url)),child=spawn(fileURLToPath(new URL('./integrations/native-windows/bin/win32-x64/retrieviewer-native.exe',import.meta.url)),[fileURLToPath(new URL('./integrations/native-windows/runtime.bundle.mjs',import.meta.url)),root,'--production'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
 const session={owner:'bitefoundry-retrieviewer-overlay-v1',pid:child.pid,pipe,token};await writeFile(paths.session,JSON.stringify(session)+'\n');let stderr='';child.stderr.on('data',b=>stderr+=b);child.stdout.resume();
 try{const exit=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});child.stdin.end(JSON.stringify({pet:'dog',diagnostic:true,seed:731,pipe,token,sessionFile:paths.session})+'\n');assert.equal(await exit,0,stderr);assert.deepEqual(await desktopStatus(options),{running:false});}finally{if(child.exitCode===null)child.kill();}
});
test('native metadata, indexed art and session work from Korean paths',{skip:!windows,timeout:15000},async()=>{
 const base=await mkdtemp(join(tmpdir(),'pet-native-unicode-')),root=join(base,'고양이 친구'),options={stateDir:join(base,'설정')},paths=await prepareRoot(options);
 await mkdir(root,{recursive:true});
 for(const name of [...getPetAssetFiles(),'integrations/purrviewer/art/ginger.json','integrations/purrviewer/art/ginger.rvz']){const target=join(root,name);await mkdir(join(target,'..'),{recursive:true});await cp(new URL(name,import.meta.url),target);}
 const executable=join(root,'친구.exe'),bundle=join(root,'동작.mjs');await cp(new URL('./integrations/native-windows/bin/win32-x64/retrieviewer-native.exe',import.meta.url),executable);await cp(new URL('./integrations/native-windows/runtime.bundle.mjs',import.meta.url),bundle);
 const pipe=controlAddress({uuid:randomUUID()}),token=randomBytes(32).toString('hex'),child=spawn(executable,[bundle,root,'--production'],{windowsHide:true,stdio:['pipe','pipe','pipe']}),session={owner:'bitefoundry-retrieviewer-overlay-v1',pid:child.pid,pipe,token};let buffer='',stderr='';child.stderr.on('data',b=>stderr+=b);child.stdin.on('error',()=>{});await writeFile(paths.session,JSON.stringify(session)+'\n');
 try{
  const ready=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>reject(Error('Native exited '+code+': '+stderr)));child.stdout.on('data',b=>{buffer+=b;let at;while((at=buffer.indexOf('\n'))>=0){const value=JSON.parse(buffer.slice(0,at));buffer=buffer.slice(at+1);if(value.ready)child.stdin.end('DETACH\n');if(value.detached)resolve();}});});
  child.stdin.write(JSON.stringify({pet:'dog',seed:731,diagnostic:true,pipe,token,sessionFile:paths.session})+'\n');await ready;
  assert.equal((await requestSession(session,'status')).pet,'dog');await requestSession(session,'pet-cat');let cat=false;for(let i=0;i<40;i++){const s=await requestSession(session,'status');if(s.pet==='cat'&&s.paintedFrames>0){cat=true;break;}await new Promise(r=>setTimeout(r,50));}assert.ok(cat,stderr);
  await stopDesktop(options);assert.deepEqual(await desktopStatus(options),{running:false});
 }finally{if(child.exitCode===null)child.kill();}
});
