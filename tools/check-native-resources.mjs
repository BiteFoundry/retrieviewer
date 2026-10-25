// Real native resizing/minimization, with one owned off-screen scene only.
import {spawn} from 'node:child_process';import {createInterface} from 'node:readline';
import {mkdtemp,writeFile} from 'node:fs/promises';import {join} from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';import assert from 'node:assert/strict';
const root=process.env.RETRIEVIEWER_NATIVE_PACKAGE_ROOT??fileURLToPath(new URL('../',import.meta.url));
const {startDesktop,desktopStatus,stopDesktop}=await import(pathToFileURL(join(root,'integrations/windows-overlay/desktop.mjs')));
const out=await mkdtemp(fileURLToPath(new URL('../dist/paint-resource-',import.meta.url)));
const fixture=spawn('powershell.exe',['-NoLogo','-NoProfile','-File',fileURLToPath(new URL('./native-picker-fixture.ps1',import.meta.url)),'-Title','Retrieviewer resource QA fixture'],{windowsHide:true,stdio:['pipe','pipe','pipe']});let pending,stderr='';fixture.stderr.on('data',b=>stderr+=b);
createInterface({input:fixture.stdout}).on('line',line=>{const r=JSON.parse(line);pending?.(r);pending=null;});
const receive=()=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Fixture timeout: '+stderr)),10000);pending=r=>{clearTimeout(timer);resolve(r);};});
const command=async req=>{const next=receive();fixture.stdin.write(JSON.stringify(req)+'\n');const r=await next;assert.equal(r.ok,true,r.error);return r;};
const options={stateDir:join(out,'owned-state'),pet:'cat',nativeDiagnostic:true};let started;
const poll=async test=>{for(let i=0;i<60;i++){const s=await desktopStatus(options);if(test(s))return s;await new Promise(r=>setTimeout(r,50));}throw Error('Native resource state did not settle');};
try{
 await receive();started=await startDesktop(options);const pid=started.pid,big=await poll(s=>s.paintSurfaceBytes>0);
 assert.ok(big.paintRegionCount===1);assert.equal((await command({op:'native-panels',pid})).panels,big.paintRegionCount);
 await command({op:'native-resize',pid,width:1280,height:800});const small=await poll(s=>s.paintSurfaceBytes>0&&s.paintSurfaceBytes<big.paintSurfaceBytes*.6);
 await command({op:'native-minimize',pid});await poll(s=>!s.visible&&s.paintSurfaceBytes===0&&s.paintRegionCount===0);assert.equal((await command({op:'native-panels',pid})).panels,0);
 await command({op:'native-restore',pid});await poll(s=>s.visible&&s.paintSurfaceBytes>0);
 await command({op:'native-resize',pid,width:3840,height:2160});await poll(s=>s.paintSurfaceBytes>small.paintSurfaceBytes*1.5);
 const dog=await startDesktop({...options,pet:'dog'});assert.equal(dog.pid,pid);await poll(s=>s.pet==='dog'&&s.paintSurfaceBytes>0);
 const cat=await startDesktop(options);assert.equal(cat.pid,pid);await poll(s=>s.pet==='cat'&&s.paintSurfaceBytes>0);
 const report={largeSurfaceMiB:big.paintSurfaceBytes/1048576,smallSurfaceMiB:small.paintSurfaceBytes/1048576,minimizedSurfaceBytes:0,minimizedNativeWindows:0,restored:true,speciesSwitch:true,processCount:1};
 await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({out,...report}));
}finally{if(started)await stopDesktop(options);fixture.stdin.end();if(fixture.exitCode===null)await new Promise(resolve=>{const timer=setTimeout(()=>{fixture.kill();resolve();},3000);fixture.once('exit',()=>{clearTimeout(timer);resolve();});});}
