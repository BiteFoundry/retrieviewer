// Real 4K Win32 rendering; own isolated/off-screen windows and settings only.
import {mkdtemp,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const packageRoot=process.env.RETRIEVIEWER_NATIVE_PACKAGE_ROOT??fileURLToPath(new URL('../',import.meta.url));
const {startDesktop,desktopStatus,stopDesktop,removeDesktop}=await import(pathToFileURL(join(packageRoot,'integrations/windows-overlay/desktop.mjs')));
const seconds=Number(process.argv[2]??150),out=process.env.RETRIEVIEWER_NATIVE_MEASUREMENT_DIR??fileURLToPath(new URL('../dist/native-product-memory/',import.meta.url));await mkdir(out,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),reports=[];
for(const pet of ['dog','cat']){
 const options={stateDir:await mkdtemp(join(tmpdir(),'retrieviewer-native-'+pet+'-')),pet,nativeDiagnostic:true};
 let started=null;const rows=[],begin=Date.now();
 try{
  started=await startDesktop(options);assert.equal(started.engine,'quickjs-native');assert.equal(started.pet,pet);assert.equal(started.pid,started.painterPid);
  for(let i=0;i<seconds*2;i++){
   await sleep(500);const status=await desktopStatus(options);assert.equal(status.engine,'quickjs-native');assert.equal(status.pid,started.pid);assert.equal(status.pet,pet);
   rows.push({seconds:(Date.now()-begin)/1000,...status});if(i%20===0)await writeFile(join(out,pet+'.json'),JSON.stringify({packageRoot,options,rows},null,2)+'\n');
  }
  const rss=rows.map(r=>r.rssBytes).sort((a,b)=>a-b),last=rows.at(-1),report={pet,seconds:rows.at(-1).seconds,samples:rows.length,medianMiB:rss[Math.floor(rss.length/2)]/1048576,sampledMaxMiB:rss.at(-1)/1048576,lifetimePeakMiB:Math.max(...rows.map(r=>r.peakWorkingSetBytes))/1048576,frames:last.frames,paintedFrames:last.paintedFrames,lastInteraction:last.lastInteraction,engine:last.engine,processCount:1,viewport:'3840x2160',packageRoot};
  assert.ok(last.paintedFrames>15);reports.push(report);console.log(JSON.stringify(report));
 }finally{if(started)await stopDesktop(options);assert.deepEqual(await desktopStatus(options),{running:false});await removeDesktop(options);await writeFile(join(out,pet+'.json'),JSON.stringify({packageRoot,options,rows,stopped:true},null,2)+'\n');}
}
await writeFile(join(out,'report.json'),JSON.stringify(reports,null,2)+'\n');
