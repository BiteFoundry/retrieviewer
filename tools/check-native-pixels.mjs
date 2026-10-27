// Compare actual C++ kernels/QuickJS against portable Node at both view sizes.
import {execFileSync} from 'node:child_process';
import {writeFileSync,readFileSync,openSync,readSync,closeSync,unlinkSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));process.chdir(root);mkdirSync('dist/native-parity',{recursive:true});
if(process.platform!=='win32')throw Error('The native pixel comparison requires Windows x64');
const schedule={dog:['ball','treat','tug','wall'],cat:['greet','stretch','tail','treat','toy','company','tower','wheel']};
const points=[0,12,30,60,120,240,480,900],views=[{columns:160,rows:72},{columns:480,rows:135}];
const reports=[];
for(const [kind,label,actions,checkpoints,returnStyle] of [
 ['dog','dog',schedule.dog,points,'auto'],
 ['cat','cat',schedule.cat,points,undefined],
 // Exercise the contact seam that split a leg during the approach/brake phase.
 ['dog','dog-brake',['ball'],[395,402,403,404,418,438],'brake'],
]){
 const output='dist/native-parity/'+label+'.rgba',entry='dist/native-parity/'+label+'.mjs';
 const script=`import * as std from 'qjs:std';
globalThis.__nativeConfig={pet:${JSON.stringify(kind)},seed:731,returnStyle:${JSON.stringify(returnStyle)}};
let pixels;const original=__fast.braille;__fast.braille=(p,...a)=>{pixels=p;return original(p,...a);};
await import('../../integrations/native-windows/runtime.bundle.mjs');globalThis.__desktopReady=false;
const output=std.open(${JSON.stringify(root.replaceAll('\\','/')+output)},'wb');
try{for(const action of ${JSON.stringify(actions)}){__desktopInteract(action);for(let i=0;i<1200;i++){__desktopFrame(1/60,160,72);if(${JSON.stringify(checkpoints)}.includes(i))for(const v of ${JSON.stringify(views)}){__desktopFrame(0,v.columns,v.rows,true);if(output.write(pixels.buffer,pixels.byteOffset,pixels.byteLength)!==pixels.byteLength)throw Error('Short pixel record');}}}}finally{output.close();__desktopDispose();}
`;
 writeFileSync(entry,script);
 execFileSync('integrations/native-windows/bin/win32-x64/retrieviewer-native.exe',[entry,root],{timeout:180000,stdio:'pipe'});
 const {createPet}=await import('../retrieviewer.mjs'),{createCat}=await import('../integrations/purrviewer/src/purrviewer.mjs');
 const pet=await(kind==='dog'?createPet({seed:731,returnStyle}):createCat({seed:731})),fd=openSync(output,'r'),hash=createHash('sha256');let bytes=0,frames=0;
 try{for(const action of actions){
  if(action==='wall')pet.notify({kind:'approval',gesture:'wall'});else pet.interact(action);
  for(let i=0;i<1200;i++){pet.step(1/60);pet.frame({columns:160,rows:72});if(checkpoints.includes(i))for(const view of views){pet.step(0);const f=pet.frame(view),expected=Buffer.from(f.pixels.buffer,f.pixels.byteOffset,f.pixels.byteLength),actual=Buffer.alloc(expected.length);assert.equal(readSync(fd,actual),expected.length);assert.deepEqual(actual,expected,label+'/'+action+'/'+i+'/'+view.columns);hash.update(actual);bytes+=actual.length;frames++;}}
 }}finally{pet.dispose();closeSync(fd);}
 reports.push({pet:kind,scenario:label,frames,bytes,sha256:hash.digest('hex'),byteExact:true});unlinkSync(output);
}
writeFileSync('dist/native-parity/report.json',JSON.stringify(reports,null,2)+'\n');console.log(JSON.stringify(reports,null,2));
