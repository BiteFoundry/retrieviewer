import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeLabAnimal} from './locomotion-core.mjs';
import {createPaperActor} from './puppy-paper.mjs';
import {createPaperBody} from './puppy-paper-world.mjs';
import {createSnappyTrickTimings} from './puppy-paper-trick-timing.mjs';

test('paper body snapshots follow targets and never integrates a second trajectory',()=>{
 const body=createPaperBody(),point={x:.3,y:0,z:-8};
 body.follow(point);point.x=9;
 assert.equal(body.position.x,0);
 body.update(1/60);
 assert.deepEqual(body.position,{x:.3,y:0,z:-8});
 for(let i=0;i<100;i++)body.update(1/60);
 assert.equal(body.position.z,-8);
 assert.throws(()=>body.follow({x:NaN,y:0,z:0}));
 for(const dt of [-1,NaN,Infinity,.2])assert.throws(()=>body.update(dt));
 body.dispose();body.dispose();assert.throws(()=>body.update(0),/disposed/);
});

test('paper body matches the original 3D follow root and full actor samples',async()=>{
 const info=JSON.parse(readFileSync(new URL('./puppy-stride-meta.json',import.meta.url)));
 const actions=JSON.parse(readFileSync(new URL('./puppy-paper-actions-v9.json',import.meta.url)));
 const baked=readFileSync(new URL('./locomotion-puppy.animal',import.meta.url));
 const animal=await makeLabAnimal({baked:baked.buffer.slice(baked.byteOffset,baked.byteOffset+baked.byteLength)});
 const body=createPaperBody(),options={manualTricks:true,walkTransitions:true,trickTimings:createSnappyTrickTimings(actions)};
 const oldActor=createPaperActor(animal,info,options),newActor=createPaperActor(body,info,options);
 const commands=new Map([
  [30,['go',[.3,-8]]],[600,['come',[]]],[1200,['walk',['left',.3]]],
  [1500,['walk',['right',.6]]],[1800,['sit',[]]],[2100,['look',['right']]],
  [2250,['lie',[]]],[2450,['roll',[]]],[2750,['spin',[]]],
  [3000,['chase',[0,-4]]],[3450,['go',[0,.2]]],
 ]);
 try{
  for(let i=0;i<4000;i++){
   const command=commands.get(i);
   if(command)for(const actor of [oldActor,newActor])actor[command[0]](...command[1]);
   oldActor.update(1/60);newActor.update(1/60);
   assert.deepEqual(newActor.sample((i+1)/60),oldActor.sample((i+1)/60),'frame '+i);
  }
 }finally{animal.dispose();body.dispose();}
});
