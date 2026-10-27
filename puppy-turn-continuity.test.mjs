import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {readPackedFrames} from './puppy-frame-store.mjs';
import {createPet} from './retrieviewer.mjs';
import {mouthAnchor,mouthSourceFrame,projectMouth,MOUTH_ANCHORS} from './puppy-mouth-anchor.mjs';
const info=JSON.parse(readFileSync(new URL('./puppy-paper-actions-v9.json',import.meta.url)));

test('seeded standing turn enters the existing launch before the front gallop',async()=>{
 const pet=await createPet({seed:731}),frames=[];
 try{
  for(let i=1;i<=3740;i++){
   pet.step(1/60);
   if(i>=3710&&i%2===0){
    const f=pet.frame({columns:160,rows:60,poseFps:30}),ys=[];
    for(let p=0;p<f.pixels.length;p+=4)if(f.pixels[p]>24)ys.push(Math.floor((p/4)/320));
    frames.push({state:f.state.state,height:Math.max(...ys)-Math.min(...ys)+1,x:f.state.x,z:f.state.z,size:f.placement.size});
   }
  }
  const launch=frames.findIndex(f=>f.state==='launch'),run=frames.findIndex(f=>f.state==='run');
  assert.ok(launch>0&&run>launch);
  assert.equal(frames[launch-1].state,'turn');
  for(let i=launch;i<=run;i++){
   assert.ok(Math.abs(frames[i].height-frames[i-1].height)<=3,'silhouette jumps at frame '+i);
   assert.equal(frames[i].size,frames[launch].size);
   if(i<run){assert.equal(frames[i].x,frames[launch].x);assert.equal(frames[i].z,frames[launch].z);}
  }
 }finally{pet.dispose();}
});

test('standing turn mouths address the actual sampled canvas and mirror with the body',()=>{
 for(const clip of ['walk-face-front','walk-face-rear','walk-turn'])for(let k=0;k<=16;k++){
  const progress=k/16, frame=mouthSourceFrame('actions',{actionName:clip,actionProgress:progress},info);
  const anchor=mouthAnchor('actions',frame,info.sha256);
  if(!anchor){assert.equal(clip,'walk-face-rear');continue;}
  assert.ok(anchor.x>50&&anchor.x<300&&anchor.y>130&&anchor.y<180);
  const rect={left:10,top:20,side:320,sideX:160};
  const a=projectMouth(anchor,rect,false),b=projectMouth(anchor,rect,true);
  assert.equal(a.y,b.y);assert.equal(a.x+b.x,180);
 }
 assert.equal(mouthAnchor('actions',51*9,'different-art'),null);
 assert.equal(mouthAnchor('actions',0,info.sha256),null);
 assert.equal(MOUTH_ANCHORS.families.actions.frames.length,info.pairs*9);
});

test('fetch uses the same standing bridges in both directions and keeps the visible carried mouth',async()=>{
 const pet=await createPet({seed:731});let launched=false,returnTurn=false,visible=0;
 let previous=null;const directions=new Set();
 try{
  for(let i=0;i<660;i++){
   if(i===30)pet.interact('ball');pet.step(1/60);
   const f=pet.frame({columns:80,rows:30,poseFps:30}),s=f.state;
   if(s.state==='view-turn'){
    assert.ok(['walk-face-front','walk-face-rear'].includes(s.actionName));
    if(previous?.state==='view-turn'&&previous.actionName===s.actionName){
     if(s.actionProgress<previous.actionProgress)directions.add('reverse');
     if(s.actionProgress>previous.actionProgress)directions.add('forward');
    }
    if(f.report.ball?.carried){returnTurn=true;
     const index=mouthSourceFrame('actions',s,info);
     if(mouthAnchor('actions',index,info.sha256)){assert.equal(f.mouth.family,'actions');assert.equal(f.mouth.frame,index);visible++;}
    }else launched=true;
   }
   previous=s;
  }
  assert.ok(launched&&returnTurn&&visible>2);assert.deepEqual([...directions].sort(),['forward','reverse']);
 }finally{pet.dispose();}
});

test('half-turn final mouth stays on the registered muzzle at the exact preserved exit',()=>{
 const penultimate=mouthAnchor('actions',55*9+7,info.sha256),last=mouthAnchor('actions',55*9+8,info.sha256);
 assert.ok(penultimate&&last);assert.ok(Math.hypot(penultimate.x-last.x,penultimate.y-last.y)<5);
});

test('rear bridge shares its boundary sample and supports visible source paws',()=>{
 const frames=readPackedFrames(gunzipSync(readFileSync(new URL('./puppy-paper-actions-v9-q5.bin.gz',import.meta.url))));
 try{
  assert.deepEqual(frames.getFrame(476),frames.getFrame(603));
  for(const [pair,sample] of [[52,7],[52,8],[67,0],[67,1]]){
   const foot=info.feet[pair][sample][0],image=frames.getFrame(pair*9+sample);
   assert.ok(foot?.stance);const x=Math.round(foot.x+80),y=Math.round(foot.y+150);
   let visible=false;for(let dy=-5;dy<=2;dy++)for(let dx=-5;dx<=5;dx++)if(image[(y+dy)*480+x+dx]>16)visible=true;
   assert.ok(visible,`support ${pair}/${sample} falls on the paw`);
   assert.ok(mouthAnchor('actions',pair*9+sample,info.sha256));
  }
  assert.notEqual(info.feet[67][0][0].id,info.feet[67][1][0].id,'support releases at the step');
 }finally{frames.dispose?.();}
});
