// Run in a fresh process: node --expose-gc tools/benchmark-pet.mjs
// Emits JSON only; no desktop process, timers, controls or user data are touched.
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {writeFile} from 'node:fs/promises';
const {createPet}=await import(process.argv[2]?pathToFileURL(resolve(process.argv[2])):new URL('../retrieviewer.mjs',import.meta.url));
const memory=()=>{globalThis.gc?.();const m=process.memoryUsage();return {rss:m.rss,heapUsed:m.heapUsed,arrayBuffers:m.arrayBuffers};};
const imported=memory(),loadStart=performance.now();
const pet=await createPet({seed:731});
const loadMs=performance.now()-loadStart,loaded=memory();
const stepStart=performance.now(),stepCpu=process.cpuUsage();
for(let i=0;i<1800;i++)pet.step(1/60);
const stepCpuTime=process.cpuUsage(stepCpu),stepMs=performance.now()-stepStart;
pet.dispose();
const moving=await createPet({seed:731}),digest=createHash('sha256'),trajectory=[];
const frameStart=performance.now(),frameCpu=process.cpuUsage(),timings=[];
for(let i=0;i<450;i++) {
 if(i===24)moving.interact('ball');
 const start=performance.now(),f=moving.frame({columns:480,rows:135});
 timings.push(performance.now()-start);
 digest.update(f.text);
 if(i%30===0)trajectory.push({frame:i,x:f.state.x,z:f.state.z,state:f.state.state,view:f.state.view,intent:f.report.intent});
 moving.step(1/30);
}
const frameCpuTime=process.cpuUsage(frameCpu),frameMs=performance.now()-frameStart,rendered=memory();
moving.dispose();await new Promise(setImmediate);const disposed=memory();
timings.sort((a,b)=>a-b);
const result={loadMs,step1800Ms:stepMs,stepCpuMs:(stepCpuTime.user+stepCpuTime.system)/1000,frame450Ms:frameMs,frameCpuMs:(frameCpuTime.user+frameCpuTime.system)/1000,
 frameMeanMs:timings.reduce((a,b)=>a+b,0)/timings.length,frameP95Ms:timings[Math.floor(timings.length*.95)],
 imported,loaded,rendered,disposed,peakRss:process.resourceUsage().maxRSS*1024,frameHash:digest.digest('hex'),trajectory};
if(process.argv[3])await writeFile(resolve(process.argv[3]),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
