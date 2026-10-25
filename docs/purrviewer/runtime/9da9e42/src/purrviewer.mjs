import {readPackedFrames} from '../vendor/retrieviewer/puppy-frame-store.mjs';
import {rgbaToBraille} from '../vendor/retrieviewer/braille.mjs';
import {createCatMotion,projectCat} from './world.mjs';
import {createCatLife} from './life.mjs';
import {createCatContacts,footSourcePoint} from './contact.mjs';
import {paintHabitat} from './habitat.mjs';
let shared=null,pending=null,leases=0;
const root=new URL('../art/',import.meta.url);
async function read(url){
 if(url.protocol==='file:'){const {readFile}=await import('node:fs/promises');return new Uint8Array(await readFile(url));}
 const r=await fetch(url);if(!r.ok)throw Error('Cat asset HTTP '+r.status);return new Uint8Array(await r.arrayBuffer());
}
async function acquire(){
 if(!pending&&!shared)pending=(async()=>{
  const [json,gzip]=await Promise.all([read(new URL('ginger.json',root)),read(new URL('ginger.bin.gz',root))]);
  const meta=JSON.parse(new TextDecoder().decode(json));let encoded,codec;
  if(root.protocol==='file:'){
   const z=await import('node:zlib');encoded=z.gunzipSync(gzip);codec={compress:b=>z.deflateRawSync(b,{level:3}),expand:(b,n)=>z.inflateRawSync(b,{maxOutputLength:n})};
  }else encoded=new Uint8Array(await new Response(new Blob([gzip]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  if(meta.version!==1||meta.width!==320||meta.height!==320||meta.frames<1||meta.frames>128)throw Error('Invalid cat art metadata');
  const store=readPackedFrames(encoded,codec?{codec}:undefined);
  if(store.frameCount!==meta.frames)throw Error('Cat art frame count mismatch');
  for(const motion of Object.values(meta.clips))if(!Array.isArray(motion)||!motion.length||motion.some(i=>!Number.isInteger(i)||i<0||i>=meta.frames))throw Error('Invalid cat clip');
  return {meta,store};
 })().then(value=>{shared=value;pending=null;return value;},error=>{pending=null;throw error;});
 const value=shared??await pending;leases++;return value;
}
function release(){if(--leases===0)shared=null;}
export async function createCat({seed=731}={}){
 if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw TypeError('Invalid cat seed');
 let asset=await acquire();const motion=createCatMotion(),life=createCatLife({seed}),contacts=createCatContacts(asset.meta.walk),sourcePoint={x:0,y:0};
 let pixels=null,disposed=false,lastClip='sit',lastFrame=null,prep=null,view='front',mirror=false,settle=null,lastMoving=false,lastLifeClip='sit',lastPaintKey='',lastText='',rasterizations=0,heldHits=0;
 const alive=()=>{if(disposed)throw Error('Cat is disposed');};
 const direct=command=>{
  if(command.kind==='go')motion.go(command.x,command.z,{gait:command.gait});
  else if(command.kind==='pounce')motion.pounce(command.x,command.z,{height:command.height,landingY:command.landingY??0});
  else if(command.kind==='wheel'){view='side';mirror=false;settle=null;motion.wheel(command);}
  else if(command.kind==='stop'){prep=null;motion.stop();}
 };
 function issue(command){
  if(command.kind==='go'&&view==='front'&&!motion.sample().moving){
   const s=motion.sample(),dx=command.x-s.x,dz=command.z-s.z,length=Math.hypot(dx,dz);
   if(length>.01){const targetView=Math.abs(dz/length)>.8?(dz>0?'front':'rear'):'side';prep={age:0,seconds:.4,command,targetView,clip:targetView==='front'?'rise-front':'rise'};mirror=dx<0;settle=null;return;}
  }
  if(command.kind!=='stop')settle=null;
  direct(command);
 }
 return {
  step(dt){
   alive();if(!Number.isFinite(dt)||dt<0||dt>.25)throw RangeError('Invalid cat dt');
   let left=dt;while(left>1e-10){const step=Math.min(1/60,left);left-=step;
    if(prep){prep.age+=step;if(prep.age>=prep.seconds){const cmd=prep.command;view=prep.targetView;prep=null;direct(cmd);}}
    motion.step(step);const s=motion.sample();
    const command=life.step(step,s);if(command)issue(command);
    const report=life.report,clip=report.clip;
    if(s.moving&&!prep&&!s.exercising){const sx=Math.sin(s.heading),sz=Math.cos(s.heading);mirror=sx<0;view=s.airborne?'side':Math.abs(sz)>.8?(sz>0?'front':'rear'):'side';settle=null;}
    if(clip!==lastLifeClip){
     if(clip==='stretch-enter'){view='front';mirror=false;settle=null;}
     if(clip==='knead-enter'){view='front';mirror=false;settle=null;}
     if(['tower-load','tower-land','wheel-enter','wheel-leave'].includes(clip)){view='side';settle=null;if(clip.startsWith('wheel'))mirror=false;}
     if(clip==='tower-load')mirror=report.facing<0;
     if(clip==='stretch-reach'){view='side';mirror=false;settle=null;}
     if(clip==='feed-enter'){view='side';mirror=false;settle=null;}
     // These authored sequences already finish on the canonical front sit.
     // Replaying stand-to-sit here made the cat rise again after paw play.
     if(clip==='sit'&&['bat','stretch','stretch-leave','feed-leave','loaf-leave'].includes(lastLifeClip)){view='front';mirror=false;settle=null;}
     lastLifeClip=clip;
    }
    const quiet=['idle','sit','blink','eye-greeting','groom','loaf','sleep','tail-swish','tail-tip'].includes(clip);
    if(!s.moving&&!prep&&quiet){
     if(!settle&&(lastMoving||view!=='front'))settle={age:0,seconds:.45,clip:view==='front'?'sit-front':'sit-down'};
     if(settle){settle.age+=step;if(settle.age>=settle.seconds){view='front';mirror=false;settle=null;}}
    }else settle=null;
    lastMoving=s.moving;
    if(s.moving&&!s.airborne&&!s.exercising&&s.supportY===0&&!prep&&view==='side')contacts.update(s,mirror);else contacts.reset();
   }
  },
  frame({columns=160,rows=72}={}){
   alive();if(!Number.isInteger(columns)||!Number.isInteger(rows)||columns<8||rows<4||columns*rows>125000)throw RangeError('Invalid cat viewport');
   const width=columns*2,height=rows*4,n=width*height*4;
   if(!pixels||pixels.length!==n){pixels=new Uint8ClampedArray(n);for(let i=3;i<n;i+=4)pixels[i]=255;}
   const s=motion.sample(),r=life.report;let clip=r.clip??'sit',progress=r.progress??0;
   if(s.moving&&!s.airborne&&!s.exercising){
    clip=view==='side'?'walk':view==='front'?'walk-front':'walk-rear';progress=((s.phase%1)+1)%1;
   }
   if(s.airborne){clip=r.clip==='tower-up'?'tower-flight':r.clip==='tower-down'?'tower-fall':'pounce';progress=s.flightProgress;}
   if(s.exercising||r.clip==='wheel-run'){clip='wheel-run';progress=((s.wheelPhase%1)+1)%1;}
   if(prep){clip=prep.clip;progress=Math.min(1,prep.age/prep.seconds);}
   if(settle){clip=settle.clip;progress=Math.min(1,settle.age/settle.seconds);}
   // Nine authored licking cycles in 3.6s. Rendering only samples simulation
   // progress; a hidden or sparse host cannot change eating cadence.
   if(clip==='feed-lick')progress=progress>=1?0:(progress*9)%1;
   if(clip==='knead')progress=progress>=1?0:(progress*4)%1;
   const keys=asset.meta.clips[clip]??asset.meta.clips.sit;
   const pins=clip==='walk'?contacts.pins(s):[];
   // Every authored key needs a real hold, including the recovery/exit key.
   const key=keys[Math.min(keys.length-1,Math.floor(Math.max(0,Math.min(1,progress))*keys.length))];
   const food=r.food?Math.ceil(r.food.remaining*16)/16:null;
   const wheelAngle=Math.round(s.wheelAngle*120)/120;
   const p=projectCat(s.x,s.y,s.z,{width,height,canvasMeters:.6}),paintKey=[width,height,key,mirror,p.x,p.y,p.size,food,r.mat,wheelAngle].join('/');
   const dish=p&&food!==null?{x:p.x+p.size*(269/320-.5),y:p.y+p.size*(288-290)/320,
     radius:p.size*18/320,remaining:food}:null;
   const mat=r.mat?{x:p.x,y:p.y+p.size*3/320,radiusX:p.size*72/320,radiusY:p.size*12/320}:null;
   const result=text=>({text,pixels,columns,rows,color:asset.meta.color,state:{...s,clip,frame:key},contacts:pins,report:r,placement:p,dish,mat});
   lastClip=clip;lastFrame=key;
   if(paintKey===lastPaintKey){heldHits++;return result(lastText);}
   for(let i=0;i<n;i+=4)pixels[i]=pixels[i+1]=pixels[i+2]=0;
   const gray=asset.store.getFrame(key);
   if(p){
    const size=p.size,left=p.x-size*.5,top=p.y-size*(290/320),x0=Math.max(0,Math.floor(left)),y0=Math.max(0,Math.floor(top)),x1=Math.min(width,Math.ceil(left+size)),y1=Math.min(height,Math.ceil(top+size));
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
     let u=(x+.5-left)*320/size-.5,v=(y+.5-top)*320/size-.5;if(mirror)u=319-u;
     if(v>225&&pins.length){const source=footSourcePoint(u,v,pins,sourcePoint);u=source.x;v=source.y;}
     if(u<0||v<0||u>319||v>319)continue;
     const a=Math.floor(u),b=Math.floor(v),fu=u-a,fv=v-b,aa=Math.min(319,a+1),bb=Math.min(319,b+1);
     const value=Math.round((gray[b*320+a]*(1-fu)+gray[b*320+aa]*fu)*(1-fv)+(gray[bb*320+a]*(1-fu)+gray[bb*320+aa]*fu)*fv),at=(y*width+x)*4;
     pixels[at]=pixels[at+1]=pixels[at+2]=value;
    }
    // A small soft mat supplies the contact context. Only uncovered background
    // pixels receive it; the original cat's fur and dark details stay intact.
    if(mat){
     for(let y=Math.max(0,Math.floor(mat.y-mat.radiusY));y<Math.min(height,Math.ceil(mat.y+mat.radiusY));y++)
      for(let x=Math.max(0,Math.floor(mat.x-mat.radiusX));x<Math.min(width,Math.ceil(mat.x+mat.radiusX));x++){
       const e=((x+.5-mat.x)/mat.radiusX)**4+((y+.5-mat.y)/mat.radiusY)**4;
       if(e>=1)continue;const at=(y*width+x)*4;if(pixels[at])continue;
       const value=e>.72?180:90;pixels[at]=pixels[at+1]=pixels[at+2]=value;
      }
    }
    // A shallow plate and diminishing paste share the cat's pinhole transform.
    // Paint directly into the borrowed grayscale output: no prop texture/cache.
    if(dish){
     const rx=dish.radius,ry=p.size*4/320;
     for(let y=Math.max(0,Math.floor(dish.y-ry-3));y<Math.min(height,Math.ceil(dish.y+ry+2));y++)
      for(let x=Math.max(0,Math.floor(dish.x-rx-1));x<Math.min(width,Math.ceil(dish.x+rx+2));x++){
       const dx=(x+.5-dish.x)/rx,dy=(y+.5-dish.y)/ry,e=dx*dx+dy*dy;
       let value=e<1&&e>.48?150:e<=.48?48:0;
       const pasteRadius=Math.sqrt(food)*.72;
       if(food>0&&pasteRadius>0&&dx*dx+(dy+.5)*(dy+.5)<pasteRadius*pasteRadius)value=220;
       if(!value)continue;const at=(y*width+x)*4;
       pixels[at]=pixels[at+1]=pixels[at+2]=Math.max(pixels[at],value);
      }
    }
   }
   paintHabitat(pixels,width,height,wheelAngle);
   rasterizations++;lastPaintKey=paintKey;lastText=rgbaToBraille(pixels,width,height,{method:'stable',brightness:1.22,contrast:1.08}).text;
   return result(lastText);
  },
  interact(kind,options){alive();if(!['treat','toy','call','stretch','tail','greet','company','tower','wheel'].includes(kind))throw TypeError('Invalid cat interaction');const accepted=life.interact(kind,options);if(accepted&&prep){prep=null;}return accepted;},
  get report(){alive();return life.report;},
  get stats(){alive();return {residentPixelBytes:asset.store.residentPixelBytes??asset.store.residentBytes,cachedFrames:asset.store.stats().cachedFrames,rgbaBytes:pixels?.byteLength??0,lastClip,lastFrame,leases,rasterizations,heldHits};},
  dispose(){if(disposed)return;disposed=true;pixels=null;prep=null;contacts.reset();asset=null;lastText=lastPaintKey='';release();}
 };
}
