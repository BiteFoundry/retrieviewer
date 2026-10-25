// Maintainer build only: pinned sources, static CRT, no install-time compiler.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));process.chdir(root);
if(process.platform!=='win32'||process.arch!=='x64')throw Error('Build on Windows x64 with VS2022 C++ tools, CMake and Bun');
const run=(command,args)=>execFileSync(command,args,{cwd:root,stdio:'inherit',windowsHide:true});
const sources=JSON.parse(readFileSync('integrations/native-windows/sources.json','utf8'));
for(const [name,folder] of [['QuickJS-NG','quickjs-src'],['zlib','zlib-src']]){
 const spec=sources.find(s=>s.name===name),path=resolve('dist/native-memory',folder);
 if(!existsSync(path)){run('git',['clone','--no-checkout',spec.url,path]);run('git',['-C',path,'checkout','--detach',spec.commit]);}
 const head=execFileSync('git',['-C',path,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
 if(head!==spec.commit)throw Error('Pinned '+name+' commit required: '+spec.commit+' (checkout explicitly; existing sources are never overwritten)');
 if(execFileSync('git',['-C',path,'status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).trim())throw Error('Refusing modified '+name+' sources');
}
const bun=`const r=await Bun.build({entrypoints:['integrations/native-windows/runtime.mjs'],outdir:'dist/native-runtime-bundle',target:'browser',format:'esm',external:['qjs:*','node:*'],minify:false});if(!r.success)throw new AggregateError(r.logs);`;
run('bun',['-e',bun]);copyFileSync('dist/native-runtime-bundle/runtime.js','integrations/native-windows/runtime.bundle.mjs');
const cmake=process.env.CMAKE_EXE??'C:/Program Files (x86)/Microsoft Visual Studio/2022/BuildTools/Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin/cmake.exe';
run(cmake,['-S','integrations/native-windows','-B','dist/native-release-build','-G','Visual Studio 17 2022','-A','x64']);
run(cmake,['--build','dist/native-release-build','--config','Release','--target','retrieviewer-native','--parallel','4']);
mkdirSync('integrations/native-windows/bin/win32-x64',{recursive:true});copyFileSync('dist/native-release-build/Release/retrieviewer-native.exe','integrations/native-windows/bin/win32-x64/retrieviewer-native.exe');
const hashes={};for(const name of ['runtime.bundle.mjs','bin/win32-x64/retrieviewer-native.exe']){const b=readFileSync('integrations/native-windows/'+name);hashes[name]={bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')};}
writeFileSync('integrations/native-windows/manifest.json',JSON.stringify({version:1,platform:'win32-x64',files:hashes},null,2)+'\n');
console.log('Native runtime and checksum manifest ready');
