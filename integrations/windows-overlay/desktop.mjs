// Explicit native companion launcher. Never imports the pet on help/status/stop.
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,mkdir,lstat,unlink,open,rename,readdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createConnection} from 'node:net';
import {getConfigPaths} from '../../retrieviewer-config.mjs';
import {desktopPlatform,validControlAddress} from '../desktop/platform.mjs';
const exec=promisify(execFile);
const SOURCE=new URL('./Overlay.cs',import.meta.url);
export function desktopPaths(options={}){const root=join(getConfigPaths(options).root,'desktop');return {root,session:join(root,'session.json')};}
export async function noLink(path){try{if((await lstat(path)).isSymbolicLink())throw Error('Refusing desktop symlink: '+path);}catch(e){if(e.code!=='ENOENT')throw e;}}
export async function prepareRoot(options={}){
 const parent=getConfigPaths(options).root,{root}=desktopPaths(options);await noLink(dirname(parent));await noLink(parent);await noLink(root);await mkdir(root,{recursive:true,mode:0o700});return desktopPaths(options);
}
export async function readSession(options={}){
 const {root,session}=desktopPaths(options);await noLink(dirname(root));await noLink(root);await noLink(session);
 let data;try{data=JSON.parse(await readFile(session,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}
 if(data?.owner!=='bitefoundry-retrieviewer-overlay-v1'||!Number.isInteger(data.pid)||data.pid<=0||!validControlAddress(data.pipe)||!/^[a-f0-9]{64}$/.test(data.token))throw Error('Unrecognized desktop session; not modifying it');
 return data;
}
export function requestSession(session,command){
 return new Promise((resolve,reject)=>{
  const socket=createConnection(session.pipe);let text='',done=false;
  const finish=(error,value)=>{if(done)return;done=true;socket.destroy();error?reject(error):resolve(value);};
  socket.setTimeout(1800,()=>finish(Error('Desktop control timed out')));
  socket.on('connect',()=>socket.write(JSON.stringify({token:session.token,command})+'\n'));
  socket.on('data',bytes=>{text+=bytes.toString('utf8');if(text.length>65536)return finish(Error('Oversized desktop response'));if(text.includes('\n'))try{finish(null,JSON.parse(text.split('\n')[0]));}catch(e){finish(e);}});
  socket.on('error',e=>finish(e));socket.on('end',()=>{if(!done)finish(Error('Desktop control closed without a response'));});
 });
}
async function processAlive(pid){
 try{process.kill(pid,0);}catch(error){if(error.code==='ESRCH')return false;throw error;}
 if(process.platform==='linux')try{
  // A container PID1 without a reaper can retain a dead detached worker as Z.
  // kill(pid,0) alone treats it as alive, falsely making a successful stop fail.
  const stat=await readFile('/proc/'+pid+'/stat','utf8'),state=stat.slice(stat.lastIndexOf(')')+2).charAt(0);
  if(state==='Z'||state==='X')return false;
 }catch(error){if(error.code==='ENOENT')return false;throw error;}
 return true;
}
export async function desktopStatus(options={}){
 const session=await readSession(options);if(!session)return {running:false};
 try{return await requestSession(session,'status');}catch(error){const alive=await processAlive(session.pid);
  return {running:alive,reachable:false,stale:!alive,pid:session.pid,reason:error.code??error.message};}
}
export async function stopDesktop(options={}){
 const session=await readSession(options);if(!session)return {running:false,stopped:true};
 const result=await desktopStatus(options);
 if(result.stale){
  if(session.pipe.startsWith('/tmp/')){
   await noLink(session.pipe);
   try{const entry=await lstat(session.pipe);if(!entry.isSocket()||(process.getuid&&entry.uid!==process.getuid()))throw Error('Refusing unowned/non-socket desktop endpoint');await unlink(session.pipe);}catch(e){if(e.code!=='ENOENT')throw e;}
  }
  await unlink(desktopPaths(options).session);return {running:false,stopped:true,staleSessionRemoved:true};
 }
 if(result.reachable===false)throw Error('Desktop process is not responding; close it from its tray icon. No PID was killed.');
 await requestSession(session,'stop');
 // The stop response acknowledges the request, not native process termination.
 // Wait before advertising success so a following cleanup cannot race an in-use exe.
 for(let i=0;i<60;i++){
  if(!await processAlive(session.pid))return {running:false,stopped:true};
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 throw Error('Desktop accepted stop but has not exited; cache preserved. Retry after it closes.');
}
export async function buildHelper(options={}){
 if(process.platform!=='win32')throw Error('The transparent companion currently supports Windows only');
 const {root}=await prepareRoot(options),source=await readFile(SOURCE),hash=createHash('sha256').update(source).digest('hex').slice(0,20);
 const executable=join(root,`overlay-${hash}.exe`);await noLink(executable);
 try{if(!(await lstat(executable)).isFile())throw Error('Desktop helper cache is not a regular file');return executable;}catch(e){if(e.code!=='ENOENT')throw e;}
 const compiler=join(process.env.SystemRoot??'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe');
 const temporary=join(root,`build-${randomUUID()}.exe`);
 try{
  await exec(compiler,['/nologo','/target:winexe','/platform:anycpu','/optimize+','/codepage:65001','/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll','/reference:System.Web.Extensions.dll','/out:'+temporary,fileURLToPath(SOURCE)],{windowsHide:true,timeout:30000,maxBuffer:1024*1024});
  await rename(temporary,executable);
 }catch(error){await unlink(temporary).catch(()=>{});throw Error('Windows overlay build failed: '+(error.stdout??error.message));}
 return executable;
}
export async function desktopHelper(options={}){
 const platform=desktopPlatform(options);
 if(platform.helper==='windows')return {command:await buildHelper(options),args:[],mode:platform.id,fps:platform.fps};
 if(platform.helper==='macos')return {command:'/usr/bin/osascript',args:['-l','JavaScript',fileURLToPath(new URL('../macos-overlay/overlay.jxa',import.meta.url))],mode:platform.id,fps:platform.fps};
 // Use an existing system Python, including AlmaLinux8's3.6 platform interpreter.
 // No Python package, compiled addon, native bundle, compiler, or package manager.
 const candidates=[...(process.env.RETRIEVIEWER_PYTHON?[process.env.RETRIEVIEWER_PYTHON]:[]),'python3','/usr/libexec/platform-python'];
 for(const command of candidates)try{
  await exec(command,['-I','-c','import sys;sys.exit(0 if sys.version_info >= (3,6) else 1)'],{windowsHide:true,timeout:5000,maxBuffer:4096});
  return {command,args:['-I',fileURLToPath(new URL('../linux-overlay/overlay.py',import.meta.url))],mode:platform.id,fps:platform.fps};
 }catch{}
 throw Error('Linux desktop needs system Python3.6+ (AlmaLinux8 platform-python is supported). No packages or system settings were installed.');
}
export async function startDesktop(options={}){
 const pet=options.pet??'dog';if(!['dog','cat'].includes(pet))throw Error('Invalid desktop pet');
 const engine=options.engine??'auto';if(!['auto','native','node'].includes(engine))throw Error('Invalid desktop engine');
 const watch=options.watch??'off';if(!['off','stackbite'].includes(watch))throw Error('Invalid desktop watch source');
 const brain=options.brain??'off';if(!['off','openrouter'].includes(brain))throw Error('Invalid desktop brain');
 if(brain==='openrouter'){
  if(watch!=='stackbite')throw Error('--brain openrouter requires --watch stackbite');
  const {createOpenRouterBrain}=await import('../openrouter/brain.mjs');createOpenRouterBrain().dispose();
 }
 if(watch==='stackbite'){const {stackBiteBinding}=await import('../stackbite/attention.mjs');stackBiteBinding();}
 const ink=options.ink??(pet==='cat'?'gold':'cream');if(!['cream','gold','dark'].includes(ink))throw Error('Invalid desktop ink');
 const returnStyle=options.returnStyle??'auto';if(!['auto','brake','trot','run-trot'].includes(returnStyle))throw Error('Invalid return style');
 // Fail before creating any cache/session on unsupported desktops (e.g. Wayland).
 desktopPlatform(options);
 const native=process.platform==='win32'&&process.arch==='x64'&&engine!=='node'&&watch==='off'&&brain==='off';
 if(engine==='native'&&!native)throw Error('Native mode requires Windows x64 with watch/brain off; use --engine node for compatibility features');
 const status=await desktopStatus(options);if(status.running){
  if(native&&status.engine==='quickjs-native'&&status.pet!==pet){const {switchNativePet}=await import('../native-windows/desktop.mjs');return switchNativePet(options,await readSession(options),pet);}
  return {...status,alreadyRunning:true,...(status.pet??'dog')!==pet?{requestedPet:pet,restartRequired:true}:{},...status.returnStyle!==returnStyle?{requestedReturnStyle:returnStyle,restartRequired:true}:{},...(status.watch?.source??'off')!==watch?{requestedWatch:watch,restartRequired:true}:{},...(status.brain?.provider??'off')!==brain?{requestedBrain:brain,restartRequired:true}:{}};
 }
 if(status.stale)await stopDesktop(options);
 if(native){const {startNativeDesktop}=await import('../native-windows/desktop.mjs');return startNativeDesktop(options);}
 const helper=await desktopHelper(options);
 const workerEnv={...process.env,RETRIEVIEWER_HOME:getConfigPaths(options).root,RETRIEVIEWER_PET:pet,RETRIEVIEWER_INK:ink,RETRIEVIEWER_RETURN_STYLE:returnStyle,RETRIEVIEWER_WATCH:watch,RETRIEVIEWER_BRAIN:brain};
 if(brain==='off')delete workerEnv.OPENROUTER_API_KEY;
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[fileURLToPath(new URL('./worker.mjs',import.meta.url)),'--helper-spec',JSON.stringify(helper)],{detached:true,windowsHide:true,stdio:['ignore','ignore','ignore','ipc'],env:workerEnv});
  let settled=false,ready=null;const finish=(error,message)=>{if(settled)return;settled=true;clearTimeout(timer);if(child.connected)child.disconnect();child.unref();error?reject(error):resolve(message);};
  // Disconnect on failure aborts startup. Only an acknowledged detach may live on.
  const timer=setTimeout(()=>finish(Error('Desktop startup timed out; no agent settings changed')),20000);
  child.on('error',error=>finish(error));child.on('message',message=>{
   if(settled)return;
   if(message?.error)return finish(Error(message.error));
   if(message?.detached===true&&ready)return finish(null,ready);
   if(message?.running===true&&!ready){ready=message;child.send({command:'detach'},error=>{if(error)finish(error);});}
  });child.on('disconnect',()=>{if(!settled)finish(Error('Desktop disconnected during startup'));});child.on('exit',code=>finish(Error('Desktop exited during startup ('+code+')')));
 });
}
export async function cleanDesktop(options={}){
 const status=await desktopStatus(options);if(status.running)throw Error('Stop the desktop companion before removing its cache');
 const {root,session}=desktopPaths(options);if(status.stale)await unlink(session);
 let files;try{await noLink(root);files=await readdir(root);}catch(e){if(e.code==='ENOENT')return {removed:[]};throw e;}
 const removed=[];
 for(const name of files)if(/^overlay-[a-f0-9]{20}\.exe$/.test(name)||/^build-[a-f0-9-]{36}\.exe$/.test(name)){
  const path=join(root,name);await noLink(path);if(!(await lstat(path)).isFile())throw Error('Refusing non-file desktop cache entry');await unlink(path);removed.push(name);
 }
 // Unknown files and all other Retrieviewer/agent settings are deliberately kept.
 return {removed,preservedOtherFiles:true};
}
export async function removeDesktop(options={}){await stopDesktop(options);return {stopped:true,...await cleanDesktop(options)};}
