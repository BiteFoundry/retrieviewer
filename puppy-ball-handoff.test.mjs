import test from 'node:test';
import assert from 'node:assert/strict';
import {createPet} from './retrieviewer.mjs';
import {paintCompanionObjects,projectCompanionBall} from './puppy-companion-objects.mjs';

for(const returnStyle of ['brake','trot','run-trot'])test(returnStyle+' keeps one ball through pickup, mouth, drop and the resting floor',async()=>{
 const pet=await createPet({seed:731,returnStyle});let prior=null,drops=0,returned=false,pickup=0;
 try{
  assert.equal(pet.interact('ball'),true);
  for(let n=0;n<18*60;n++){
   const f=pet.frame({columns:240,rows:90,poseFps:30}),b=f.ballScreen;
   assert.ok(f.report.ball,'no missing logical object during the fetch or afterwards');assert.ok(b);
   if(f.state.state==='pickup')pickup++;
   if(f.report.gesture?.clip==='ball-drop'){
    drops++;assert.equal(b.owner,'gesture');assert.equal(b.occluded,false);
   }
   if(prior&&((prior.owner==='mouth'&&b.owner==='gesture')||(prior.owner==='gesture'&&b.owner==='world'))){
    assert.ok(Math.hypot(b.x-prior.x,b.y-prior.y)<prior.ry*.15,'handoff moves less than 15% of the ball radius: '+JSON.stringify({n,prior,b}));
    assert.ok(Math.abs(b.rx-prior.rx)<.3,'attachment handoff keeps its size');
   }
   if(!b.occluded&&!b.behind){
    const x=Math.floor(b.x),y=Math.floor(b.y),tone=f.pixels[(y*f.columns*2+x)*4];
    assert.ok(tone>=80,'visible object center must actually be painted, including drop endpoints');
   }
   if(!f.report.busy){assert.equal(f.report.ball.carried,false);assert.equal(f.report.ball.phase,'rest');returned=true;}
   prior=b;pet.step(1/60);
  }
  assert.ok(pickup>5&&drops>20&&returned);
  assert.equal(pet.interact('treat'),true);let eating=0;
  for(let i=0;i<180;i++){
   pet.step(1/60);const f=pet.frame({columns:120,rows:45});
   assert.ok(f.ballScreen&&!f.ballScreen.occluded,'an unrelated meal cannot hide the floor ball');
   if(f.report.gesture?.clip==='treat-eat')eating++;
  }
  assert.ok(eating>20);
 }finally{pet.dispose();}
});

test('a ground ball behind the puppy is occluded by actual painted pixels, not deleted wholesale',()=>{
 const width=400,height=300,projection={project:(x,y,z)=>({x:.5+x*.5,y:.5-y*.5+z*.02})};
 const report={ball:{x:0,z:-2,height:0,carried:false}},state={x:0,z:0};
 const ball=projectCompanionBall(width,height,projection,report,state);
 assert.equal(ball.behind,true);const pixels=new Uint8ClampedArray(width*height*4);
 for(let y=125;y<141;y++)for(let x=200;x<208;x++)pixels[(y*width+x)*4]=150;
 const before=pixels.slice();paintCompanionObjects(pixels,width,height,projection,report,state);
 assert.equal(pixels[(133*width+201)*4],150,'body in front is preserved');
 assert.ok(pixels[(133*width+198)*4]>before[(133*width+198)*4],'exposed edge of the same ball is visible');
});
