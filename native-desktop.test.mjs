import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {verifyNativeArtifact} from './integrations/native-windows/desktop.mjs';
import {startDesktop,desktopStatus,stopDesktop,readSession,requestSession,prepareRoot} from './integrations/windows-overlay/desktop.mjs';
import {controlAddress} from './integrations/desktop/platform.mjs';
const windows=process.platform==='win32'&&process.arch==='x64';
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
