// Compare real disjoint native panels against the old monolithic GDI+ drawing.
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root=process.env.RETRIEVIEWER_NATIVE_PACKAGE_ROOT??fileURLToPath(new URL('../',import.meta.url));
const {startDesktop,desktopStatus,stopDesktop}=await import(pathToFileURL(join(root,'integrations/windows-overlay/desktop.mjs')));
const out=await mkdtemp(fileURLToPath(new URL('../dist/paint-parity-',import.meta.url))),reports=[];
for(const [pet,ink] of [['dog','cream'],['cat','gold'],['cat','dark']]){
 const name=pet+'-'+ink,options={stateDir:join(out,name),pet,ink,nativeDiagnostic:true,nativeVerifyPaint:true,nativeProofPath:join(out,name+'.png')};let started;
 try{
  started=await startDesktop(options);let status;
  for(let i=0;i<30;i++){await new Promise(r=>setTimeout(r,200));status=await desktopStatus(options);assert.equal(status.pid,started.pid);assert.equal(status.engine,'quickjs-native');}
  assert.ok(status.paintVerificationCount>=2);assert.ok(status.paintRegionCount>0&&status.paintRegionCount<=8);
  reports.push({pet,ink,verifiedFrames:status.paintVerificationCount,paintRegions:status.paintRegionCount,surfaceMiB:status.paintSurfaceBytes/1048576,proof:options.nativeProofPath});
 }finally{if(started)await stopDesktop(options);assert.deepEqual(await desktopStatus(options),{running:false});}
}
await writeFile(join(out,'report.json'),JSON.stringify(reports,null,2)+'\n');console.log(JSON.stringify({out,reports},null,2));
