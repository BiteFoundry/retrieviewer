// Bounded cat adapter for the MIT Retrieviewer image-space contact approach.
// Ground anchors adapt puppy-paper-contact.mjs; its license
// is retained at vendor/retrieviewer/LICENSE-CODE. No dog dimensions/art used.
import {projectCat,unprojectCatGround} from './world.mjs';
const viewport={width:320,height:180};
export function createCatContacts(track){
 // Disjoint ownership disks include swing paws, so a planted toe cannot pull
 // its neighbour. Bake their sizes once from this immutable source schedule.
 const radii=track.feet.map(row=>row.map(foot=>Math.min(28,...row.filter(other=>other.id!==foot.id)
  .map(other=>.44*Math.hypot(other.x-foot.x,other.y-foot.y)))));
 const anchors=new Map();let feet=[],mirror=false,pose=0;
 return {
  reset(){anchors.clear();feet=[];},
  update(sample,flipped){
   mirror=flipped;const n=track.feet.length,phase=((sample.phase%1)+1)%1,index=Math.min(n-1,Math.floor(phase*n)),cycle=Math.floor(sample.phase);
   pose=index;feet=track.feet[index];const p=projectCat(sample.x,0,sample.z,viewport),scale=p.size/320,sign=mirror?-1:1;
   const active=new Set();
   for(const [j,foot] of feet.entries()){
    if(!foot.stance)continue;active.add(foot.id);
    const start=track.starts[foot.id][index],episode=(cycle-(start>index?1:0))+'/'+start;
    let anchor=anchors.get(foot.id);
    if(!anchor||anchor.episode!==episode){
     anchor={episode,world:unprojectCatGround(p.x+sign*(foot.x-160)*scale,p.y+(foot.y-290)*scale,viewport),released:false};anchors.set(foot.id,anchor);
    }
    // A small paw-only correction may reacquire its original world support
    // when the next authored key fits. An incompatible key stays unwarped.
    const target=projectCat(anchor.world.x,0,anchor.world.z,viewport);
    const dx=160+sign*(target.x-p.x)/scale-foot.x,dy=290+(target.y-p.y)/scale-foot.y;
    anchor.released=Math.hypot(dx,dy)>Math.min(6,radii[index][j]*.22)||Math.abs(dy)>3;
   }
   for(const id of anchors.keys())if(!active.has(id))anchors.delete(id);
  },
  pins(sample){
   const p=projectCat(sample.x,0,sample.z,viewport),scale=p.size/320,sign=mirror?-1:1,pins=[];
   for(const [j,foot] of feet.entries()){const anchor=anchors.get(foot.id);if(!foot.stance||!anchor||anchor.released)continue;
    const target=projectCat(anchor.world.x,0,anchor.world.z,viewport);
    pins.push({id:foot.id,radius:radii[pose][j],source:{x:foot.x,y:foot.y},target:{x:160+sign*(target.x-p.x)/scale,y:290+(target.y-p.y)/scale},world:{...anchor.world},episode:anchor.episode});
   }
   return pins;
  }
 };
}

export function footSourcePoint(x,y,pins,out={}){
 out.x=x;out.y=y;
 if(y<=225||!pins.length)return out;
 for(const pin of pins){
  const dx=pin.target.x-pin.source.x,dy=pin.target.y-pin.source.y,radius=pin.radius??28;
  if(radius<=0||Math.hypot(dx,dy)>Math.min(6,.22*radius)||Math.abs(dy)>3)continue;
  if(Math.hypot(x-pin.source.x,y-pin.source.y)>=radius)continue;
  // Invert ONE compact forward translation with a rigid paw core. Its gradient
  // norm is <= .22*1.5/.7 < .472, so it cannot fold or duplicate a toe. Outside
  // its disk it is exactly identity. No winner-switch between overlapping warps.
  let u=x-dx,v=y-dy;
  for(let i=0;i<12;i++){
   const distance=Math.hypot(u-pin.source.x,v-pin.source.y);
   const t=Math.max(0,Math.min(1,(distance-radius*.3)/(radius*.7))),weight=1-t*t*(3-2*t);
   u=x-dx*weight;v=y-dy*weight;
  }
  out.x=u;out.y=v;return out;
 }
 return out;
}
