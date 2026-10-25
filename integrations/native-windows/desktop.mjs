// Short-lived bootstrap only. The native process owns the pet, UI and control pipe.
import {spawn} from 'node:child_process';
import {readFile,open,unlink,stat} from 'node:fs/promises';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {prepareRoot,noLink,requestSession,readSession} from '../windows-overlay/desktop.mjs';
import {controlAddress} from '../desktop/platform.mjs';
const root=new URL('./',import.meta.url),bundle=new URL('./runtime.bundle.mjs',root),binary=new URL('./bin/win32-x64/retrieviewer-native.exe',root);
export async function verifyNativeArtifact(){
 const manifest=JSON.parse(await readFile(new URL('manifest.json',root),'utf8'));
 if(manifest.version!==1||manifest.platform!=='win32-x64')throw Error('Invalid native runtime manifest');
 for(const name of ['runtime.bundle.mjs','bin/win32-x64/retrieviewer-native.exe']){
  const expected=manifest.files[name],url=new URL(name,root),info=await stat(url);
  if(!expected||info.size!==expected.bytes||info.size>16*1024*1024)throw Error('Native runtime size mismatch: '+name);
  const bytes=await readFile(url);if(createHash('sha256').update(bytes).digest('hex')!==expected.sha256)throw Error('Native runtime checksum mismatch: '+name);
 }
 return manifest;
}
export async function switchNativePet(options,session,pet){
 await requestSession(session,'pet-'+pet);
 for(let i=0;i<40;i++){const status=await requestSession(session,'status');if(status.pet===pet)return {...status,alreadyRunning:true,switchedPet:true};await new Promise(r=>setTimeout(r,50));}
 throw Error('The native companion did not finish switching pets');
}
export async function startNativeDesktop(options={}){
 if(process.platform!=='win32'||process.arch!=='x64')throw Error('Native desktop currently requires Windows x64');
 await verifyNativeArtifact();const paths=await prepareRoot(options);await noLink(paths.session);
 const pipe=controlAddress({uuid:randomUUID()}),token=randomBytes(32).toString('hex');
 const args=[fileURLToPath(bundle),fileURLToPath(new URL('../../',root)),'--production'];
 if(options.nativeDiagnostic&&options.nativeVerifyPaint)args.push('--verify-regions');
 if(options.nativeDiagnostic&&options.nativeProofPath)args.push('--proof='+options.nativeProofPath);
 const child=spawn(fileURLToPath(binary),args,{detached:true,windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,OPENROUTER_API_KEY:undefined}});
 let owns=false,complete=false,stderr='';const session={owner:'bitefoundry-retrieviewer-overlay-v1',pid:child.pid,pipe,token};
 child.stderr.on('data',b=>stderr=(stderr+b.toString('utf8')).slice(-2048));child.stdin.on('error',()=>{});
 try{
  if(!Number.isInteger(child.pid))throw Error('Cannot start native companion');
  const file=await open(paths.session,'wx',0o600);owns=true;try{await file.writeFile(JSON.stringify(session)+'\n');}finally{await file.close();}
  await new Promise((resolve,reject)=>{
   let buffer='',ready=false,settled=false;const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve();};
   const timer=setTimeout(()=>finish(Error('Native companion startup timed out')),15000);
   child.once('error',error=>finish(error));child.once('exit',code=>finish(Error('Native companion exited before ready ('+code+'): '+stderr)));
   child.stdout.on('data',bytes=>{buffer+=bytes.toString('utf8');if(buffer.length>65536)return finish(Error('Oversized native startup response'));let at;while((at=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,at);buffer=buffer.slice(at+1);let message;try{message=JSON.parse(line);}catch{return finish(Error('Invalid native startup response'));}if(message.ready===true&&!ready){ready=true;child.stdin.end('DETACH\n');}else if(message.detached===true&&ready)finish();}});
   const pet=options.pet??'dog';child.stdin.write(JSON.stringify({pet,seed:options.nativeDiagnostic?731:randomBytes(4).readUInt32LE(),ink:options.ink??(pet==='cat'?'gold':'cream'),inkExplicit:!!options.ink,returnStyle:options.returnStyle??'auto',diagnostic:options.nativeDiagnostic===true,testPicker:options.nativePickerTest===true,pipe,token,sessionFile:paths.session})+'\n');
  });
  const status=await requestSession(session,'status');complete=true;child.unref();child.stdout.destroy();child.stderr.destroy();return {...status,detached:true};
 }finally{
  if(!complete){child.stdin.destroy();if(child.exitCode===null)child.kill();if(owns){const current=await readSession(options).catch(()=>null);if(current?.token===token)await unlink(paths.session).catch(()=>{});}}
 }
}
