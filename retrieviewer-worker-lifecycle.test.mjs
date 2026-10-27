import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,readFile,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {desktopStatus,stopDesktop} from './integrations/windows-overlay/desktop.mjs';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function bounded(promise){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('lifecycle timeout')),10000);})]);}finally{clearTimeout(timer);}}
async function fixture(t,mode){
 const stateDir=await mkdtemp(join(tmpdir(),'retrieviewer-startup-')),marker=join(stateDir,'painter.json');
 const spec={command:process.execPath,args:[fileURLToPath(new URL('./tools/test-fixtures/overlay-lifecycle-helper.mjs',import.meta.url)),marker,mode],mode:'windows-overlay',fps:30};
 const worker=spawn(process.execPath,[fileURLToPath(new URL('./integrations/windows-overlay/worker.mjs',import.meta.url)),'--helper-spec',JSON.stringify(spec)],{windowsHide:true,stdio:['ignore','ignore','pipe','ipc'],env:{...process.env,RETRIEVIEWER_HOME:stateDir,RETRIEVIEWER_WATCH:'off',RETRIEVIEWER_BRAIN:'off'}});
 let stderr='';worker.stderr.on('data',s=>stderr+=s);const exited=once(worker,'exit');
 t.after(async()=>{if(worker.connected)worker.disconnect();if(worker.exitCode===null&&worker.signalCode===null){await stopDesktop({stateDir}).catch(()=>{});if(worker.exitCode===null&&worker.signalCode===null)worker.kill();}await bounded(exited);});
 async function painter(){for(let i=0;i<100;i++){try{return JSON.parse(await readFile(marker,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}await sleep(20);}throw Error('no painter '+stderr);}
 async function cleaned(){await bounded(exited);assert.equal(worker.exitCode,0,stderr);await assert.rejects(lstat(join(stateDir,'desktop','session.json')),{code:'ENOENT'});const {pid}=await painter();assert.throws(()=>process.kill(pid,0),{code:'ESRCH'});}
 return {worker,stateDir,painter,cleaned,exited};
}

test('IPC loss before native ready stops the startup worker and its painter',async t=>{
 const f=await fixture(t,'waiting');await f.painter();f.worker.disconnect();await f.cleaned();
});
test('ready alone does not detach: losing the launcher before acknowledgement stops both',async t=>{
 const f=await fixture(t,'ready');const [ready]=await bounded(once(f.worker,'message'));assert.equal(ready.running,true);
 f.worker.disconnect();await f.cleaned();
});
test('only acknowledged detach survives IPC loss; normal stop still cleans everything',async t=>{
 const f=await fixture(t,'ready');const [ready]=await bounded(once(f.worker,'message'));assert.equal(ready.running,true);
 const ack=once(f.worker,'message');f.worker.send({command:'detach'});assert.equal((await bounded(ack))[0].detached,true);f.worker.disconnect();
 await sleep(100);assert.equal((await desktopStatus({stateDir:f.stateDir})).running,true);
 await stopDesktop({stateDir:f.stateDir});await f.cleaned();
});
test('disconnect immediately at spawn cannot leave a startup session behind',async t=>{
 const f=await fixture(t,'waiting');f.worker.disconnect();await bounded(f.exited);
 assert.equal(f.worker.exitCode,0);await assert.rejects(lstat(join(f.stateDir,'desktop','session.json')),{code:'ENOENT'});
});

test('killing the launcher during startup also reaps its detached worker and painter',async t=>{
 const stateDir=await mkdtemp(join(tmpdir(),'retrieviewer-launcher-crash-')),marker=join(stateDir,'painter.json');
 const spec={command:process.execPath,args:[fileURLToPath(new URL('./tools/test-fixtures/overlay-lifecycle-helper.mjs',import.meta.url)),marker,'waiting'],mode:'windows-overlay',fps:30};
 const source=`import {spawn} from 'node:child_process';const worker=spawn(process.execPath,[${JSON.stringify(fileURLToPath(new URL('./integrations/windows-overlay/worker.mjs',import.meta.url)))},'--helper-spec',process.argv[2]],{detached:true,windowsHide:true,stdio:['ignore','ignore','ignore','ipc'],env:{...process.env,RETRIEVIEWER_HOME:process.argv[1],RETRIEVIEWER_WATCH:'off',RETRIEVIEWER_BRAIN:'off'}});console.log(worker.pid);worker.on('message',()=>{});`;
 const launcher=spawn(process.execPath,['--input-type=module','-e',source,stateDir,JSON.stringify(spec)],{windowsHide:true,stdio:['ignore','pipe','pipe']});
 const exited=once(launcher,'exit');let workerPid,painterPid;
 const gone=async pid=>{
  try{process.kill(pid,0);}catch(e){if(e.code==='ESRCH')return true;throw e;}
  if(process.platform==='linux')try{const stat=await readFile('/proc/'+pid+'/stat','utf8');return ['Z','X'].includes(stat.slice(stat.lastIndexOf(')')+2).charAt(0));}catch(e){if(e.code==='ENOENT'||e.code==='ESRCH')return true;throw e;}
  return false;
 };
 t.after(async()=>{if(launcher.exitCode===null&&launcher.signalCode===null)launcher.kill();await bounded(exited);for(const pid of [workerPid,painterPid])if(pid&&!await gone(pid))try{process.kill(pid);}catch{}});
 const [bytes]=await bounded(once(launcher.stdout,'data'));workerPid=Number(bytes.toString().trim());assert.ok(Number.isSafeInteger(workerPid)&&workerPid>0);
 for(let i=0;i<200;i++){try{painterPid=JSON.parse(await readFile(marker,'utf8')).pid;break;}catch(e){if(e.code!=='ENOENT')throw e;}await sleep(20);}
 assert.ok(painterPid,'the fake native painter actually started before the launcher was killed');
 launcher.kill('SIGKILL');await bounded(exited);
 for(let i=0;i<200;i++){if(await gone(workerPid)&&await gone(painterPid))break;await sleep(20);}
 assert.ok(await gone(workerPid),'orphan worker exited');assert.ok(await gone(painterPid),'orphan painter exited');
 await assert.rejects(lstat(join(stateDir,'desktop','session.json')),{code:'ENOENT'});
});
