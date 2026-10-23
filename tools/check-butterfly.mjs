// A small frame replay made by the real public core. No full pet in the browser.
// Offline fast-forward skips only rendering, never behavior/physics simulation.
import {mkdirSync,writeFileSync,copyFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createPet} from '../retrieviewer.mjs';
import {cropFrame} from '../integrations/windows-overlay/protocol.mjs';
const out=resolve('dist/butterfly-qa');mkdirSync(out,{recursive:true});
const pet=await createPet({seed:731}),frames=[];let clock=0,started=null,lastFly=null;
try{
 for(let i=0;i<60*900;i++){
  pet.step(1/60);clock+=1/60;
  if(started===null?i%60:i%3)continue;
  const f=pet.frame({columns:240,rows:90});
  if(f.report.butterfly){started??=clock;lastFly=clock;}
  if(started!==null){
   frames.push({...cropFrame(f,1),time:clock-started,intent:f.report.intent,pose:f.state.state,flip:f.state.flip,speed:f.state.speed,butterfly:f.report.butterfly});
   if(clock-started>24||!f.report.butterfly&&clock-lastFly>5)break;
  }
 }
 if(!frames.length)throw Error('No real autonomous encounter found');
 const result={seed:731,start:started,columns:240,rows:90,fps:20,frames};
 writeFileSync(join(out,'preview.json'),JSON.stringify(result));
 mkdirSync(resolve('site-dist'),{recursive:true});writeFileSync(resolve('site-dist/butterfly-preview.json'),JSON.stringify(result));
 copyFileSync(new URL('./butterfly-preview.html',import.meta.url),resolve('site-dist/butterfly-preview.html'));
 console.log(JSON.stringify({frames:frames.length,start:started,seconds:frames.at(-1).time,replayBytes:Buffer.byteLength(JSON.stringify(result)),newArtBytes:0}));
}finally{pet.dispose();}
