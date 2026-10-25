import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const root=process.env.RETRIEVIEWER_NATIVE_PACKAGE_ROOT??fileURLToPath(new URL('../',import.meta.url));
const {startDesktop,desktopStatus,stopDesktop}=await import(pathToFileURL(join(root,'integrations/windows-overlay/desktop.mjs')));
const fixture=spawn('powershell.exe',['-NoLogo','-NoProfile','-File',fileURLToPath(new URL('./native-picker-fixture.ps1',import.meta.url)),'-Title','Retrieviewer owned QA '+randomUUID()],{windowsHide:true,stdio:['pipe','pipe','pipe']});let pending=null,stderr='';fixture.stderr.on('data',b=>stderr+=b);
const lines=createInterface({input:fixture.stdout});lines.on('line',line=>{const r=JSON.parse(line);pending?.(r);pending=null;});
const receive=()=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Fixture timeout: '+stderr)),10000);pending=r=>{clearTimeout(timer);resolve(r);};});
const command=async op=>{const result=receive();fixture.stdin.write(JSON.stringify(op)+'\n');const response=await result;assert.equal(response.ok,true,response.error);};
const options={stateDir:await mkdtemp(join(tmpdir(),'pet-picker-')),nativeDiagnostic:true,nativePickerTest:true};let started;
const poll=async test=>{for(let i=0;i<50;i++){const s=await desktopStatus(options);if(test(s))return s;await new Promise(r=>setTimeout(r,50));}throw Error('Native picker state did not settle');};
try{
 assert.equal((await receive()).ready,true);started=await startDesktop(options);assert.equal(started.pickerVisible,true);
 await command({op:'attach',pid:started.pid});const attached=await poll(s=>s.selected&&!s.pickerVisible);
 await command({op:'minimize'});const minimized=await poll(s=>s.selected&&!s.visible);
 await command({op:'restore'});await command({op:'picker',pid:started.pid});await poll(s=>s.pickerVisible);
 await command({op:'attach',pid:started.pid});await poll(s=>s.selected&&!s.pickerVisible);
 await command({op:'quit'});await poll(s=>s.pickerVisible&&!s.selected);
 const report={engine:attached.engine,realWindowPicker:true,ownedTargetOnly:true,selected:true,minimizedHidden:!minimized.visible,reselection:true,closedTargetReopensPicker:true};
 await mkdir(new URL('../dist/native-picker/',import.meta.url),{recursive:true});await writeFile(new URL('../dist/native-picker/report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{if(started)await stopDesktop(options);fixture.stdin.end();if(fixture.exitCode===null){await new Promise(resolve=>{const timer=setTimeout(()=>{fixture.kill();resolve();},3000);fixture.once('exit',()=>{clearTimeout(timer);resolve();});});}}
