// Opt-in integration QA: only our own off-screen window and a disposable fake CLI.
import assert from 'node:assert/strict';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,delimiter,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const packageRoot=process.env.RETRIEVIEWER_NATIVE_PACKAGE_ROOT?pathToFileURL(resolve(process.env.RETRIEVIEWER_NATIVE_PACKAGE_ROOT)+'/'):new URL('../',import.meta.url);
const {buildHelper,desktopStatus,stopDesktop}=await import(new URL('integrations/windows-overlay/desktop.mjs',packageRoot));
if(process.platform!=='win32')throw Error('Windows-only owned-window attention check');
const execute=promisify(execFile),stateDir=await mkdtemp(join(tmpdir(),'retrieviewer-attention-native-'));
const compiler=join(process.env.SystemRoot??'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe');
await execute(compiler,['/nologo','/target:exe','/optimize+','/out:'+join(stateDir,'stackbite.exe'),fileURLToPath(new URL('./test-fixtures/StackbiteAttention.cs',import.meta.url))],{windowsHide:true,timeout:30000});
const fixture=join(stateDir,'attention-fixture.json'),options={stateDir};
const seat={seat_key:'worker',role_title:'Fixture Worker',generation:'fixture-generation',is_alive:true,seat_status:{schema_version:1,generation:'fixture-generation',phase:'needs_input',input_kind:'approval',turn_id:1,input_request_id:'fixture-approval'}};
await writeFile(fixture,JSON.stringify({room_id:'fixture-room',seats:[seat]}));
const executable=await buildHelper(options),helper={command:executable,args:['--ipc-test'],mode:'windows-overlay',fps:30};
const useBrain=process.argv.includes('--brain-openrouter');
const env={...process.env,RETRIEVIEWER_HOME:stateDir,RETRIEVIEWER_WATCH:'stackbite',RETRIEVIEWER_BRAIN:useBrain?'openrouter':'off',RETRIEVIEWER_RETURN_STYLE:'brake',STACKBITE_ROOM_ID:'fixture-room',STACKBITE_SEAT_KEY:'caller',STACKBITE_SESSION_GENERATION:'fixture-caller-generation',STACKBITE_STATE_DIR:stateDir,STACKBITE_ROOM_BRIDGE_URL:'http://127.0.0.1:1'};
if(!useBrain)delete env.OPENROUTER_API_KEY;
// Environment names are case-insensitive on Windows; avoid two PATH spellings.
for(const key of Object.keys(env))if(key.toLowerCase()==='path')delete env[key];
env.PATH=stateDir+delimiter+process.env.PATH;
const worker=spawn(process.execPath,[fileURLToPath(new URL('integrations/windows-overlay/worker.mjs',packageRoot)),'--helper-spec',JSON.stringify(helper)],{windowsHide:true,stdio:['ignore','ignore','pipe','ipc'],env});
let stderr='';worker.stderr.on('data',s=>stderr=(stderr+s).slice(-2048));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(test){for(let n=0;n<300;n++){const status=await desktopStatus(options);if(test(status))return status;if(worker.exitCode!==null)throw Error('Owned worker exited: '+stderr);await sleep(100);}throw Error('Owned attention QA timed out');}
let receipt;
try{
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Worker startup timeout')),15000);worker.once('message',m=>{clearTimeout(timer);m.error?reject(Error(m.error)):resolve();});worker.once('exit',()=>{clearTimeout(timer);reject(Error('Worker exited during startup'));});});
 await new Promise((resolve,reject)=>{worker.once('message',m=>m.detached===true?resolve():reject(Error('Missing detach acknowledgement')));worker.send({command:'detach'});});worker.disconnect();
 const pending=await waitFor(s=>s.watch?.state==='connected'&&s.watch.pendingCount===1&&s.watch.retainedNotices===1&&s.attentionLabel==='Fixture Worker - Approval pending'&&(!useBrain||!s.brain.inFlight&&s.watch.lastJudgment!=='rule_first')&&s.paintedFrames>=8);
 if(useBrain){assert.equal(pending.brain.provider,'openrouter');assert.equal(pending.brain.calls,1);assert.ok(['model_notify','rule_override','rule_fallback'].includes(pending.watch.lastJudgment));}
 assert.equal(pending.lastInteraction?.accepted,true,'native diagnostic ball button reached the real pet');
 seat.role_title='Renamed Fixture';await writeFile(fixture,JSON.stringify({room_id:'fixture-room',seats:[seat]}));
 const renamed=await waitFor(s=>s.watch?.target?.label==='Renamed Fixture'&&s.attentionLabel==='Renamed Fixture - Approval pending');assert.equal(renamed.watch.retainedNotices,1);
 if(useBrain)assert.equal(renamed.brain.calls,1,'renaming is not another event or paid request');
 await writeFile(fixture,JSON.stringify({room_id:'fixture-room',seats:[{...seat,seat_status:{...seat.seat_status,phase:'working',input_kind:null,input_request_id:null}}]}));
 const resolved=await waitFor(s=>s.watch?.state==='connected'&&s.watch.pendingCount===0&&s.attentionLabel==='Watching');
 assert.equal(resolved.watch.retainedNotices,1,'resolution does not generate another cue');
 await stopDesktop(options);
 for(let i=0;i<50&&worker.exitCode===null;i++)await sleep(100);
 assert.equal(worker.exitCode,0,stderr);
 let painterGone=false;try{process.kill(pending.painterPid,0);}catch(error){painterGone=error.code==='ESRCH';}assert.equal(painterGone,true);
 receipt={source:'disposable fake StackBite CLI; NOT a live approval',pending:pending.watch,resolved:resolved.watch,localLabels:{pending:pending.attentionLabel,renamed:renamed.attentionLabel,resolved:resolved.attentionLabel},...useBrain?{brain:pending.brain,brainInput:'anonymous fixture enum/count only; actual OpenRouter request'}:{},nativeBallPriority:true,paintedFrames:resolved.paintedFrames,nodeRssMiB:Math.round(resolved.rssBytes/1048576),workerExited:true,painterExited:true};
 const out=new URL('../dist/attention-native-qa/',import.meta.url);await mkdir(out,{recursive:true});await writeFile(new URL('receipt.json',out),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt,null,2));
}finally{
 if(worker.exitCode===null){await stopDesktop(options).catch(()=>{});await sleep(500);if(worker.exitCode===null)worker.kill();}
}
