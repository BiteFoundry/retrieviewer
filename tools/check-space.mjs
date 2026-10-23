// Real core snapshots of autonomous travel/naps. Fast-forward simulation only;
// fixed camera, unmodified art and normal gait. Does not start a desktop pet.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createPet} from '../retrieviewer.mjs';
import {png} from './check-comfort.mjs';
const out=resolve('dist/space-qa');mkdirSync(out,{recursive:true});
const pet=await createPet({seed:731}),shots=[],naps=new Set();
const save=(name,frame,time)=>{
 writeFileSync(join(out,name+'.png'),png(frame));
 shots.push({name,time,state:frame.state,placement:frame.placement});
};
try{
 for(let i=0;i<1200*60;i++){
  pet.step(1/60);if(i%60)continue;
  const f=pet.frame({columns:240,rows:68,poseFps:30}),time=(i+1)/60;
  if(!shots.length)save('near',f,time);
  if(!shots.some(s=>s.name==='away')&&f.report.intent==='far'&&f.state.state==='idle'&&f.state.z< -1)save('away',f,time);
  if(f.state.state==='sleep'){
   const key=f.state.x.toFixed(2)+'/'+f.state.z.toFixed(2);
   if(!naps.has(key)&&naps.size<2){naps.add(key);save('nap-'+naps.size,f,time);}
  }
  if(shots.length===4)break;
 }
 assert.equal(shots.length,4,'need near, away and two different naps');
 writeFileSync(join(out,'receipt.json'),JSON.stringify(shots,null,2));
 console.log(JSON.stringify(shots.map(({name,time,state,placement})=>({name,time,x:state.x,z:state.z,size:placement.size}))));
}finally{pet.dispose();}
