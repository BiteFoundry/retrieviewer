import test from 'node:test';
import assert from 'node:assert/strict';
import {createPawTransport} from './puppy-paper-paw-transport.mjs';
import {createPet} from './retrieviewer.mjs';

test('adjacent limbs share the reported brake seam while toe cores move once',()=>{
 const feet=[{id:'fore-left',x:150,y:299},{id:'fore-right',x:200,y:299}];
 const pins=[{id:'fore-left',source:{x:150.5,y:299.5},target:{x:148.6438150104742,y:281.5693465932539}}];
 const map=createPawTransport(feet,pins),gap=map(174.5,280);
 assert.ok(gap && Number.isFinite(gap.x) && Number.isFinite(gap.y));
 const boundary=175.5-1.8561849895257865/2;
 const a=map(boundary-1e-6,300),b=map(boundary+1e-6,300);
 assert.ok(Math.abs(a.x-b.x)<1e-5 && Math.abs(a.y-b.y)<1e-5,'shared seam is continuous');
 const toe=map(148.6438150104742,281.5693465932539);
 assert.ok(Math.abs(toe.x-150.5)<1e-7 && Math.abs(toe.y-299.5)<1e-7,'contact toe remains rigid');
 const old=map(150.5,299.5);
 assert.ok(Math.abs(old.y-299.5)>10,'vacated toe is not copied back');
 assert.deepEqual(map(190,210),{x:190,y:210},'torso is unchanged');
});

function components(pixels,w,h){
 const seen=new Uint8Array(w*h),stack=new Int32Array(w*h);let count=0;
 for(let p=0;p<w*h;p++){
  if(seen[p]||pixels[4*p]<=16)continue;
  let n=0,size=0;stack[n++]=p;seen[p]=1;
  while(n){const q=stack[--n],x=q%w,y=(q/w)|0;size++;
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=w||yy>=h)continue;
    const r=yy*w+xx;if(!seen[r]&&pixels[4*r]>16){seen[r]=1;stack[n++]=r;}
   }
  }
  if(size>=8)count++;
 }
 return count;
}

test('seed 731 brake does not add disconnected components versus contact off',async()=>{
 const on=await createPet({seed:731,returnStyle:'brake'}),off=await createPet({seed:731,returnStyle:'brake'});
 on.interact('ball');off.interact('ball');let samples=0,saw403=false;
 try{for(let i=1;i<=660;i++){
  on.step(1/60);off.step(1/60);
  const a=on.frame({columns:240,rows:68,poseFps:30,contactEnabled:true});
  const b=off.frame({columns:240,rows:68,poseFps:30,contactEnabled:false});
  if(a.state.view!=='approach'||a.state.state!=='run')continue;
  samples++;if(i===403)saw403=true;
  assert.ok(components(a.pixels,480,272)<=components(b.pixels,480,272),`frame ${i}`);
 }}finally{on.dispose();off.dispose();}
 assert.equal(samples,224);assert.ok(saw403);
});
