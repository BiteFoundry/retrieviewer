// Same public-core workload with/without the optional pre-render hint. No live
// desktop process, user settings or host flags; all pets are disposed per pass.
import {createHash} from 'node:crypto';
import {createPet} from '../retrieviewer.mjs';
import {createFramePump} from '../integrations/windows-overlay/protocol.mjs';
async function run(hint){
 const core=await createPet({seed:731,returnStyle:'brake'});
 let now=0,renders=0,sent=0,offer=null,heldCalls=0,heldTicks=0,last;
 const digest=createHash('sha256');
 const pet={step:dt=>core.step(dt),interact:k=>core.interact(k),dispose:()=>core.dispose(),
  frame(o){renders++;return last=core.frame(o);},...(hint?{needsFrame:o=>core.needsFrame(o)}:{})};
 const pump=createFramePump({pet,now:()=>now,send:f=>{sent++;digest.update(JSON.stringify(f));}});
 pump.viewport({type:'viewport',revision:1,visible:true,columns:480,rows:135,cellWidth:8,cellHeight:16});
 const cpu=process.cpuUsage(),start=performance.now();
 try{
  for(let i=0;i<450;i++){
   now=i*1000/30;if(i===24)pump.interact('ball');
   const before=renders;pump.tick();pump.ack();
   if(last.report.intent==='offer')offer??=now;
   if(offer!==null&&now-offer>=1200&&now-offer<2200){heldTicks++;heldCalls+=renders-before;}
  }
  const used=process.cpuUsage(cpu);
  return {hint,renders,sent,heldTicks,heldCalls,wallMs:performance.now()-start,cpuMs:(used.user+used.system)/1000,transportHash:digest.digest('hex')};
 }finally{pump.dispose();}
}
const fallback=await run(false),optimized=await run(true);
if(fallback.transportHash!==optimized.transportHash)throw Error('Visible transport changed');
console.log(JSON.stringify({fallback,optimized},null,2));
