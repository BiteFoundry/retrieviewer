// Real POSIX worker/IPC/painter check. Run only on a task-owned test display.
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
if(process.platform!=='linux'||process.env.RETRIEVIEWER_ISOLATED_DISPLAY!=='1')throw Error('Use an isolated Linux Xvfb test display; never a user desktop');
const root=process.env.RETRIEVIEWER_NATIVE_PACKAGE_ROOT?pathToFileURL(resolve(process.env.RETRIEVIEWER_NATIVE_PACKAGE_ROOT)+'/'):new URL('../',import.meta.url);
const {desktopStatus,stopDesktop,readSession,requestSession,removeDesktop}=await import(new URL('integrations/windows-overlay/desktop.mjs',root));
const stateDir=await mkdtemp(join(tmpdir(),'retrieviewer-posix-qa-'));
const spec={command:'python3',args:['-I',fileURLToPath(new URL('integrations/linux-overlay/overlay.py',root)),'--ipc-test'],mode:'linux-x11-overlay',fps:15};
const worker=spawn(process.execPath,[fileURLToPath(new URL('integrations/windows-overlay/worker.mjs',root)),'--helper-spec',JSON.stringify(spec)],{stdio:['ignore','ignore','pipe','ipc'],env:{...process.env,RETRIEVIEWER_HOME:stateDir}});
let stderr='';worker.stderr.on('data',b=>stderr=(stderr+b).slice(-8192));const delay=ms=>new Promise(r=>setTimeout(r,ms));
try{
 await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Native worker timed out: '+stderr)),15000);worker.once('message',m=>{clearTimeout(timeout);m.error?reject(Error(m.error)):resolve(m);});worker.once('exit',code=>{clearTimeout(timeout);reject(Error('Native worker startup exit '+code+' '+stderr));});});
 worker.disconnect();let status;
 for(let i=0;i<100;i++){status=await desktopStatus({stateDir});if(status.paintedFrames>=12)break;await delay(100);}
 if(!(status.paintedFrames>=12&&status.selected&&status.visible&&status.lastInteraction?.kind==='ball'&&status.lastInteraction.accepted))throw Error('Native Linux painter/ball failed: '+JSON.stringify(status)+' '+stderr);
 const session=await readSession({stateDir});let unauthorizedRejected=false;
 try{await requestSession({...session,token:'0'.repeat(64)},'status');}catch{unauthorizedRejected=true;}
 if(!unauthorizedRejected)throw Error('Invalid control token accepted');
 const {stat}=await import('node:fs/promises');const permissions=(await stat(session.pipe)).mode&0o777;if(permissions!==0o600)throw Error('Socket permissions are not0600');
 const stopped=await stopDesktop({stateDir});for(let i=0;i<30&&worker.exitCode===null;i++)await delay(100);
 if(worker.exitCode!==0)throw Error('Worker did not exit '+stderr);
 let helperExited=false;try{process.kill(status.painterPid,0);}catch(e){helperExited=e.code==='ESRCH';}
 if(!helperExited||(await desktopStatus({stateDir})).running!==false)throw Error('POSIX worker/helper/session leak');
 await removeDesktop({stateDir});
 const receipt={passed:true,platform:process.platform,glibc:process.report.getReport().header.glibcVersionRuntime,node:process.version,python:'system Python3',paintedFrames:status.paintedFrames,ball:status.lastInteraction,nodeRssMiB:Math.round(status.rssBytes/1048576),socketMode:permissions.toString(8),unauthorizedRejected,stopped:stopped.stopped,workerExited:true,helperExited,stateDir,scope:'owned Xvfb display with real Openbox+xcompmgr, no user input/app access'};
 if(process.env.RETRIEVIEWER_QA_OUTPUT)await writeFile(join(process.env.RETRIEVIEWER_QA_OUTPUT,'posix-worker.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt,null,2));
}finally{if(worker.exitCode===null){await stopDesktop({stateDir}).catch(()=>{});await delay(300);if(worker.exitCode===null)worker.kill();}}
