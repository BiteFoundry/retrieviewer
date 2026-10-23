// Opt-in Windows native check. Only our own off-screen test windows are changed.
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
// The same check can target an actual fresh npm-installed copy, not just source.
const packageRoot=process.env.RETRIEVIEWER_NATIVE_PACKAGE_ROOT?pathToFileURL(resolve(process.env.RETRIEVIEWER_NATIVE_PACKAGE_ROOT)+'/'):new URL('../',import.meta.url);
const {buildHelper,desktopStatus,stopDesktop,readSession,requestSession}=await import(new URL('integrations/windows-overlay/desktop.mjs',packageRoot));
const {cropFrame}=await import(new URL('integrations/windows-overlay/protocol.mjs',packageRoot));
const {createPet}=await import(new URL('retrieviewer.mjs',packageRoot));
if(process.platform!=='win32')throw Error('Windows native check only');
const stateDir=await mkdtemp(join(tmpdir(),'retrieviewer-native-overlay-'));
const out=resolve('dist','windows-overlay-qa');await mkdir(out,{recursive:true});
const executable=await buildHelper({stateDir});
const pet=await createPet({seed:731});let frame;
try{frame=pet.frame({columns:160,rows:60});}finally{pet.dispose();}
const proof=join(out,'native-braille.png');
const receipt=await new Promise((resolve,reject)=>{
 const child=spawn(executable,['--self-test',proof],{windowsHide:true,stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
 const timeout=setTimeout(()=>{child.kill();reject(Error('Native self-test timed out'));},15000);
 child.stdout.setEncoding('utf8');child.stdout.on('data',s=>stdout+=s);child.stderr.setEncoding('utf8');child.stderr.on('data',s=>stderr+=s);child.on('error',reject);
 child.on('exit',code=>{clearTimeout(timeout);try{const result=JSON.parse(stdout.trim());if(code!==0||!result.passed)throw Error(stdout+'\n'+stderr);resolve(result);}catch(e){reject(e);}});
 child.stdin.end(JSON.stringify(cropFrame(frame,1))+'\n');
});
await writeFile(join(out,'native-receipt.json'),JSON.stringify({...receipt,executable,stateDir,checkedAt:new Date().toISOString(),scope:'owned off-screen windows only; NOT end-user visual approval'},null,2)+'\n');
console.log(JSON.stringify(receipt,null,2));

// The actual detached worker + named pipe + native painter, bound only to its own
// off-screen test window. No user window or target selection is touched here.
const helperSpec={command:executable,args:['--ipc-test'],mode:'windows-overlay',fps:30};
const worker=spawn(process.execPath,[fileURLToPath(new URL('integrations/windows-overlay/worker.mjs',packageRoot)),'--helper-spec',JSON.stringify(helperSpec)],{windowsHide:true,stdio:['ignore','ignore','pipe','ipc'],env:{...process.env,RETRIEVIEWER_HOME:stateDir,RETRIEVIEWER_RETURN_STYLE:'brake'}});
let stderr='';worker.stderr.on('data',s=>stderr+=s);const delay=ms=>new Promise(r=>setTimeout(r,ms));
try{
 await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Worker startup timed out')),10000);worker.once('message',m=>{clearTimeout(timeout);m.error?reject(Error(m.error)):resolve(m);});worker.once('exit',code=>{clearTimeout(timeout);reject(Error('Worker startup exit '+code+' '+stderr));});});
 worker.disconnect();
 let status;for(let i=0;i<80;i++){status=await desktopStatus({stateDir});if(status.paintedFrames>=8)break;await delay(100);}
 if(!(status.paintedFrames>=8&&status.visible&&status.selected))throw Error('Native worker did not paint frames: '+JSON.stringify(status)+' '+stderr);
 if(status.lastInteraction?.kind!=='ball'||!status.lastInteraction.accepted)throw Error('Native ball button did not reach the real pet engine');
 if(status.returnStyle!=='brake')throw Error('Desktop return style did not reach its worker');
 const session=await readSession({stateDir});
 let wrongTokenRejected=false;try{await requestSession({...session,token:'0'.repeat(64)},'status');}catch{wrongTokenRejected=true;}
 if(!wrongTokenRejected)throw Error('Unauthenticated native control accepted');
 const stopped=await stopDesktop({stateDir});
 for(let i=0;i<40&&worker.exitCode===null;i++)await delay(100);
 if(worker.exitCode!==0)throw Error('Worker did not exit cleanly: '+worker.exitCode+' '+stderr);
 let painterExited=false;try{process.kill(status.painterPid,0);}catch(e){painterExited=e.code==='ESRCH';}
 if(!painterExited||(await desktopStatus({stateDir})).running!==false)throw Error('Companion left a process/session behind');
 const lifecycle={paintedFrames:status.paintedFrames,nativeBallButton:status.lastInteraction,returnStyle:status.returnStyle,nodeRssMiB:Math.round(status.rssBytes/1048576),wrongTokenRejected,stopped:stopped.stopped,workerExited:true,painterExited,scope:'actual native worker with owned off-screen target only'};
 await writeFile(join(out,'lifecycle-receipt.json'),JSON.stringify(lifecycle,null,2)+'\n');console.log(JSON.stringify(lifecycle,null,2));
}finally{if(worker.exitCode===null){await stopDesktop({stateDir}).catch(()=>{});await delay(500);if(worker.exitCode===null)worker.kill();}}
