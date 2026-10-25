import {PAPER_LIMB} from './puppy-paper-world.mjs';
import {grayFrameReader,isGrayFrameSource} from './puppy-frame-store.mjs';
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};

// Image-space stance anchors. These are visible paw proxies, not engine contact targets.
export function createPaperFootLock({maxImageStretch=Infinity}={}){
 if(typeof maxImageStretch!=='number'||!(maxImageStretch>1.08))throw Error('Invalid image leg stretch');
 const anchors=new Map();let identity='',samples=0,episodes=0,rawMax=0,max=0,limited=0;
 const blocked=new Map(),releasing=new Set();let releaseEvents=0,releasingFrames=0,releasedMax=0;
 return{
  update(feet,placement,key){
   if(key!==identity){anchors.clear();blocked.clear();releasing.clear();identity=key;}
   const {left,top,side}=placement,scale=side/320,scaleX=(placement.sideX??side)/320,pins=[],active=new Set();
   for(const foot of feet){
    if(!foot.stance||foot.y<245)continue;
    if(blocked.has(foot.id)){if(blocked.get(foot.id)===foot.episode)continue;blocked.delete(foot.id);}
    const source={x:foot.x+.5,y:foot.y+.5};
    const x=left+source.x*scaleX,y=top+source.y*scale;active.add(foot.id);
    let anchor=anchors.get(foot.id);
    if(!anchor||anchor.episode!==foot.episode){anchor={x,y,episode:foot.episode,world:placement.groundFromPixel?.(x,y)??null,root:placement.root?{...placement.root}:null};anchors.set(foot.id,anchor);episodes++;}
    // Preserve the actual ground point across raster/viewport changes. For a
    // fixed camera this reprojects to the same point, not a root-relative toe.
    if(anchor.world&&placement.pixelFromGround)Object.assign(anchor,placement.pixelFromGround(anchor.world));
    let desired={x:anchor.x,y:anchor.y},gain=1;
    if(anchor.world&&placement.root&&placement.pixelFromGround){
     const root=placement.root,contact=anchor.root,forward={x:Math.sin(contact.heading),z:Math.cos(contact.heading)};
     const reach=Math.sqrt(PAPER_LIMB.length**2-PAPER_LIMB.stanceHeight**2);
     // The artwork is not a metric 3D skeleton. Register a visible-limb proxy
     // at protracted touchdown, then translate its hip with the actual
     // world root. Never infer a fixed hip depth from a 2D far paw's height.
     const hip={x:anchor.world.x-forward.x*reach+root.x-contact.x,z:anchor.world.z-forward.z*reach+root.z-contact.z},dx=anchor.world.x-hip.x,dz=anchor.world.z-hip.z;
     // Geometric reach of a .35m limb with a flexed .25m stance height.
     // A source-pixel limit was direction/depth dependent and not physical.
     const radius=Math.hypot(dx,dz);
     if(radius>reach+1e-9){gain=reach/radius;desired=placement.pixelFromGround({x:hip.x+dx*gain,z:hip.z+dz*gain});}
    }
    const dx=(desired.x-x)/scaleX,dy=(desired.y-y)/scale,length=Math.hypot(dx,dy),sourceGain=anchor.world&&placement.root?1:length>56?56/length:1;
    // The world reach proxy can outlive the visible lower-leg pose. Ease out
    // that incompatible support instead of making a 60px shin span 150px.
    // This is a source-pose contact release, not a clamped planted target.
    const rest=Math.max(16,source.y-225),strain=Math.hypot(dx,rest+dy)/rest;
    const strength=Number.isFinite(maxImageStretch)?1-smooth(1.08,maxImageStretch,strain):1;
    const isReleasing=strength<1;
    if(isReleasing&&!releasing.has(foot.id)){releaseEvents++;releasing.add(foot.id);}
    if(!strength){anchors.delete(foot.id);blocked.set(foot.id,foot.episode);continue;}
    const target={x:source.x+dx*sourceGain*strength,y:source.y+dy*sourceGain*strength};
    const actual={x:Math.floor(left+target.x*scaleX)+.5,y:Math.floor(top+target.y*scale)+.5};
    rawMax=Math.max(rawMax,Math.hypot(x-anchor.x,y-anchor.y));
    const residual=Math.hypot(actual.x-anchor.x,actual.y-anchor.y);
    if(isReleasing){releasingFrames++;releasedMax=Math.max(releasedMax,residual);}else max=Math.max(max,residual);
    samples++;if(gain<1||sourceGain<1)limited++;
    pins.push({id:foot.id,source,target,anchor:{...anchor},actual,limited:gain<1||sourceGain<1,releasing:isReleasing});
   }
   for(const id of anchors.keys())if(!active.has(id))anchors.delete(id);
   const supported=new Set(feet.filter(f=>f.stance).map(f=>f.id));
   for(const id of blocked.keys())if(!supported.has(id))blocked.delete(id);
   for(const id of releasing)if(!supported.has(id))releasing.delete(id);
   return pins;
  },reset(){anchors.clear();blocked.clear();releasing.clear();identity='';},report(){return{samples,episodes,rawMax,max,limited,releaseEvents,releasingFrames,releasedMax};}
 };
}

// A render frame can skip an entire swing at high cadence. Identify support
// episodes from the complete source schedule, not just last rendered stance.
// This keeps real contiguous support across the loop seam but releases a new
// touchdown even when no airborne picture was presented between two draws.
export function createPaperSupportEpisodes(labels,indices,samples,{cyclic=true}={}){
 const step=samples-1,period=indices.length*step,ids=new Set(indices.flatMap(p=>labels[p].flatMap(f=>f.map(x=>x.id)))),starts=new Map();
 for(const id of ids){
  const active=Array.from({length:period+(cyclic?0:1)},(_,i)=>{const p=Math.min(indices.length-1,Math.floor(i/step)),s=i-p*step;return labels[indices[p]][s].some(f=>f.id===id&&f.stance);});
  starts.set(id,active.map((v,i)=>{if(!v)return -1;let start=i;while(start>0&&active[start-1])start--;if(cyclic&&start===0&&active.at(-1)){let k=active.length-1;while(k>0&&active[k-1])k--;return k;}return start;}));
 }
 return(feet,pair,blend,phase)=>{
  const p=indices.indexOf(pair);if(p<0)return feet;
  const q=p*step+Math.round(blend*step),index=cyclic?q%period:Math.min(period,q),cycle=cyclic?Math.floor(phase)+Math.floor(q/period):0;
  return feet.map(foot=>{const start=starts.get(foot.id)?.[index]??-1;return{...foot,episode:`${start}/${cycle-(cyclic&&start>index?1:0)}`};});
 };
}

// Compiled once from the full source schedule, shared by all default renderers.
// Only the current index/cycle is evaluated here; no stance scan or indexOf.
export function createBakedSupportEpisodes(track){
 return(feet,pair,blend,phase)=>{
  const offset=track.offsets[pair];if(offset===undefined)return feet;
  const q=offset+Math.round(blend*track.step),index=track.cyclic?q%track.period:Math.min(track.period,q),cycle=track.cyclic?Math.floor(phase)+Math.floor(q/track.period):0;
  return feet.map(foot=>{const start=track.starts[foot.id]?.[index]??-1;return{...foot,episode:`${start}/${cycle-(track.cyclic&&start>index?1:0)}`};});
 };
}

// Inverse, nearest-pixel leg warp; the entire head/torso above y=225 is identity.
// A compact support covers both the old and new toe positions to avoid a second toe.
export function footSourcePoint(x,y,pins){
 if(y<=225||!pins.length)return{x,y};
 let best=0,chosen=null;
 for(const pin of pins){
  const dx=pin.target.x-pin.source.x,dy=pin.target.y-pin.source.y;
  const rx=28+2*Math.abs(dx),ry=28+2*Math.abs(dy),r2=((x-pin.target.x)/rx)**2+((y-pin.target.y)/ry)**2;
  const weight=r2<1?(1-r2)**2*smooth(225,Math.min(245,Math.max(226,pin.target.y)),y):0;
  if(weight>best){best=weight;chosen={dx,dy};}
 }
 return chosen?{x:x-chosen.dx*best,y:y-chosen.dy*best}:{x,y};
}

export function createRearSampler(bytes,info,output,kernel=null){
 if(!isGrayFrameSource(bytes)||info.pairs!==18||info.samples!==9||bytes.byteLength!==18*9*320*320)throw Error('Invalid rear sprite cache');
 const frames=grayFrameReader(bytes,320,320,18*9),out=output??new Uint8ClampedArray(320*320*4);
 if(!(out instanceof Uint8ClampedArray)||out.length!==320*320*4)throw Error('Invalid rear output');
 for(let i=3;i<out.length;i+=4)out[i]=255;
 return(pair,blend)=>{
  if(!Number.isInteger(pair)||pair<0||pair>=18||!Number.isFinite(blend)||blend<0||blend>1)throw Error('Invalid rear pose');
  const frame=frames.getFrame(pair*9+Math.round(blend*8));
  if(kernel?.copyGray)kernel.copyGray(out,frame);else for(let j=0,i=0;i<320*320;i++,j+=4)out[j]=out[j+1]=out[j+2]=frame[i];
  return out;
 };
}
