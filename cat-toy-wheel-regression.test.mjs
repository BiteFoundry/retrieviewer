import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
const root=process.env.CAT_QA_ROOT?new URL('./src/',pathToFileURL(process.env.CAT_QA_ROOT+'/')):new URL('./integrations/purrviewer/src/',import.meta.url);
const {createCat}=await import(new URL('purrviewer.mjs',root));
const {createCatMotion}=await import(new URL('world.mjs',root));
const {readPackedFrames}=await import(new URL('../vendor/retrieviewer/puppy-frame-store.mjs',root));

test('wheel braking only downshifts, including a direct interruption',()=>{
 for(const interrupted of [false,true]){
  const motion=createCatMotion();motion.wheel({duration:10,speed:1.2,radius:.42,stride:.32});
  let rank=2,brake=false;const stages=[];
  for(let i=0;i<700;i++){
   if(interrupted&&i===240)motion.stop();motion.step(1/60);const s=motion.sample();
   if(s.wheelStage!=='brake')continue;brake=true;
   const next={push:0,walk:1,run:2}[s.wheelGait];assert.ok(next<=rank,'braking upshift at '+i);rank=next;
   if(stages.at(-1)!==s.wheelGait)stages.push(s.wheelGait);
  }
  assert.ok(brake);assert.deepEqual(stages,['run','walk','push']);
 }
});

test('a visible toy rests at the reach, is struck on its authored paw key, and rolls to rest',async()=>{
 const art=readPackedFrames(gunzipSync(readFileSync(new URL('../art/ginger.bin.gz',root))));
 try{assert.ok(art.getFrame(14)[264*320+230]>50,'registered contact must be a visible toe pixel');}finally{art.dispose?.();}
 const cat=await createCat({seed:731});let first=null,hit=null,end=null,visible=false;
 try{
  cat.interact('toy');
  for(let i=0;i<600;i++){
   cat.step(1/60);const f=cat.frame({columns:240,rows:68});
   if(!f.toy)continue;
   first??=f.toy;assert.ok(cat.stats.cachedFrames<=2);
   if(!f.toy.struck){assert.equal(f.toy.x,first.x);assert.equal(f.toy.speed,0);}
   if(f.toy.struck&&!hit){hit=f.toy;assert.equal(f.state.frame,14);assert.equal(f.state.clip,'bat');
    const pawX=f.placement.x+f.toy.direction*(230-159.5)*f.placement.size/320;
    assert.ok(Math.abs(pawX-f.toyScreen.x)<1);
    const pawY=f.placement.y+(264+.5-290)*f.placement.size/320;
    assert.ok(Math.abs(pawY-(f.toyScreen.y-f.toyScreen.radius))<1,'visible toe must meet the ball edge');
   }
   const p=f.toyScreen,w=f.columns*2;
   for(let y=Math.max(0,Math.floor(p.y-p.radius));y<Math.min(f.rows*4,Math.ceil(p.y+p.radius));y++)
    for(let x=Math.max(0,Math.floor(p.x-p.radius));x<Math.min(w,Math.ceil(p.x+p.radius));x++)
     if(f.pixels[(y*w+x)*4]>=70)visible=true;
   end=f.toy;
  }
  assert.ok(first&&hit&&end&&visible);assert.equal(end.speed,0);
  const distance=.28*.28/(2*.55);
  assert.ok(Math.abs(Math.hypot(end.x-hit.x,end.z-hit.z)-distance)<1e-9);
  assert.ok(end.z<hit.z);
  assert.ok(Math.abs(end.angle-distance/end.radius)<1e-9);
  cat.interact('treat');for(let i=0;i<240;i++)cat.step(1/60);
  const retained=cat.frame({columns:240,rows:68});assert.equal(retained.toy.id,end.id);assert.equal(retained.toy.x,end.x);
 }finally{cat.dispose();}
});

test('toy simulation and final pixels agree with dense, sparse and repeated rendering',async()=>{
 const dense=await createCat({seed:731}),sparse=await createCat({seed:731});
 try{
  dense.interact('toy');sparse.interact('toy');
  for(let i=0;i<420;i++){dense.step(1/60);sparse.step(1/60);dense.frame({columns:80,rows:45});}
  const a=dense.frame({columns:80,rows:45}),b=sparse.frame({columns:80,rows:45});
  assert.ok(a.toy&&b.toy);assert.deepEqual(a.toy,b.toy);assert.equal(a.text,b.text);assert.deepEqual(a.pixels,b.pixels);
  const snapshot={...a.toy};for(let i=0;i<10;i++)dense.frame({columns:80,rows:45});assert.deepEqual(dense.frame({columns:80,rows:45}).toy,snapshot);
 }finally{dense.dispose();sparse.dispose();}
});
