import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createCat} from './integrations/purrviewer/src/purrviewer.mjs';
import {projectCat} from './integrations/purrviewer/src/world.mjs';
import {CAT_HABITAT} from './integrations/purrviewer/src/habitat.mjs';
import {readPackedFrames} from './integrations/purrviewer/vendor/retrieviewer/puppy-frame-store.mjs';
const meta=JSON.parse(readFileSync(new URL('./integrations/purrviewer/art/ginger.json',import.meta.url)));

test('all 77 previously reviewed drawings survive the append-only contact repair',()=>{
 const before=readPackedFrames(gunzipSync(readFileSync(new URL('./docs/purrviewer/runtime/79a47c2/art/ginger.bin.gz',import.meta.url))));
 const after=readPackedFrames(gunzipSync(readFileSync(new URL('./integrations/purrviewer/art/ginger.bin.gz',import.meta.url))));
 assert.equal(after.frameCount,89);for(let i=0;i<77;i++)assert.deepEqual(after.getFrame(i),before.getFrame(i),'key '+i);
});

test('wheel source supports lie on the tread and are actual visible toe pixels',()=>{
 const store=readPackedFrames(gunzipSync(readFileSync(new URL('./integrations/purrviewer/art/ginger.bin.gz',import.meta.url))));
 const cx=160+(.57-.53)*320/.6,cy=290-.42*320/.6,radius=.42*320/.6;
 for(const [clip,track] of Object.entries(meta.wheel))for(const [i,feet] of track.feet.entries()){
  const pixels=store.getFrame(meta.clips[clip][i]);
  for(const foot of feet){assert.ok(Math.abs(Math.hypot(foot.x-cx,foot.y-cy)-radius)<1e-7);let visible=false;
   for(let y=Math.floor(foot.y)-3;y<=Math.ceil(foot.y)+3;y++)for(let x=Math.floor(foot.x)-3;x<=Math.ceil(foot.x)+3;x++)if(x>=0&&x<320&&y>=0&&y<320&&pixels[y*320+x]>50)visible=true;
   assert.ok(visible,clip+'/'+i+'/'+foot.id);
  }
 }
});

test('wheel starts and stops on hind support, cruises, and advects planted toes with the rim',async()=>{
 const cat=await createCat({seed:731});let started=false,ended=false,cruise=0,previous=null,advected=0;const gaits=new Set();
 try{cat.interact('wheel');for(let i=0;i<1500;i++){
  cat.step(1/60);const f=cat.frame({columns:120,rows:68}),s=f.state;
  if(s.exercising){started=true;gaits.add(s.wheelGait);if(s.beltSpeed>1.19)cruise++;
   if(s.beltSpeed<.3){const row=meta.wheel[s.clip].feet[meta.clips[s.clip].indexOf(s.frame)];assert.ok(row.some(p=>p.id.startsWith('hind')&&p.stance));}
   const pin=f.contacts[0];if(pin&&previous?.id===pin.id&&previous.episode===pin.episode){
    const a=Math.atan2(pin.world.x-.57,.42-pin.world.y),b=Math.atan2(previous.world.x-.57,.42-previous.world.y);
    assert.ok(Math.abs((a-b)+(s.wheelAngle-previous.angle))<1e-8);advected++;
   }previous=pin?{...pin,angle:s.wheelAngle}:null;
  }else if(started){ended=true;break;}
  assert.ok(cat.stats.cachedFrames<=2);
 }assert.ok(started&&ended);assert.deepEqual([...gaits].sort(),['push','run','walk']);assert.ok(cruise>300);assert.ok(advected>8);
 }finally{cat.dispose();}
});

test('ascending transfers hold visible forepaws on each ledge then finish on the upper support',async()=>{
 const cat=await createCat({seed:731}),levels=new Set();let samples=0;const seen=new Set();
 try{cat.interact('tower');for(let i=0;i<1200;i++){
  cat.step(1/60);const f=cat.frame({columns:240,rows:135}),s=f.state;
  if(s.climbing){samples++;seen.add(s.frame);const anchor=meta.perch.anchors[meta.clips['tower-pull'].indexOf(s.frame)],p=f.placement;
   const toe={x:p.x-(anchor.x-160)*p.size/320,y:p.y+(anchor.y-290)*p.size/320};
   const target=projectCat(s.perchContact.x,s.perchContact.y,s.perchContact.z,{width:480,height:540});
   assert.ok(Math.hypot(toe.x-target.x,toe.y-target.y)<1e-8);assert.equal(s.airborne,false);
   const center=s.perchContact.y===.21?CAT_HABITAT.tower.lowX:CAT_HABITAT.tower.highX;
   assert.ok(s.perchContact.x>=center-.21&&s.perchContact.x<=center+.21);
  }
  if(s.supportY>0)levels.add(s.supportY);if(s.supportY===.42&&!s.moving)break;
 }assert.deepEqual([...levels].sort(),[.21,.42]);assert.equal(seen.size,4);assert.ok(samples>=20);
 }finally{cat.dispose();}
});
