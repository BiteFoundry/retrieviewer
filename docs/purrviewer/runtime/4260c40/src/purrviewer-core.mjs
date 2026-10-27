import {rgbaToBraille} from '../vendor/retrieviewer/braille.mjs';
import {createCatMotion,projectCat} from './world.mjs';
import {createCatLife} from './life.mjs';
import {createCatContacts,createWheelContacts,footSourcePoint} from './contact.mjs';
import {paintHabitat,clipWheelPaws,paintWheelFront,CAT_HABITAT} from './habitat.mjs';
import {catFacingPath} from './facing.mjs';
export function createCatFromAssets({seed=731}={},lease,kernel=null){
 if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw TypeError('Invalid cat seed');
 let asset=lease.data;const release=lease.release,motion=createCatMotion(),life=createCatLife({seed}),contacts=createCatContacts(asset.meta.walk),sourcePoint={x:0,y:0};
 const wheelContacts=createWheelContacts(asset.meta.wheel,CAT_HABITAT.wheel);
 const wheelPose=s=>s.wheelGait==='push'?{clip:'wheel-push',progress:s.wheelStage==='brake'?Math.min(1,s.beltSpeed/.1):Math.min(1,s.wheelElapsed/.5)}:
  {clip:s.wheelGait==='run'?'wheel-run':'wheel-walk',progress:((s.wheelGaitPhase%1)+1)%1};
 let pixels=null,disposed=false,lastClip='sit',lastFrame=null,prep=null,view='front',mirror=false,standing=false,settle=null,lastMoving=false,lastLifeClip='sit',lastPaintKey='',lastText='',rasterizations=0,heldHits=0;
 let toy=null;
 // Bat key14's visible toe at (230,264) touches the top of this grounded ball.
 const toyReach=(230-159.5)*.6/320,toyRadius=.024375,toyDrag=.55;
 function advanceToy(dt){
  if(!toy||toy.speed===0)return;
  const used=Math.min(dt,toy.speed/toyDrag),distance=toy.speed*used-.5*toyDrag*used*used;
  toy.x+=toy.direction*.6*distance;toy.z-=.8*distance;toy.angle+=distance/toy.radius;
  toy.speed=Math.max(0,toy.speed-toyDrag*dt);
 }
 const alive=()=>{if(disposed)throw Error('Cat is disposed');};
 const direct=command=>{
  if(command.kind==='go')motion.go(command.x,command.z,{gait:command.gait});
  else if(command.kind==='pounce')motion.pounce(command.x,command.z,{height:command.height,landingY:command.landingY??0,perch:command.perch?asset.meta.perch:null});
  else if(command.kind==='wheel'){view='side';mirror=false;settle=null;motion.wheel(command);}
  else if(command.kind==='stop'){motion.stop();}
 };
 function prepare(targetView,targetMirror,{command=null,seated=false}={}){
  const steps=[];
  if(!standing)steps.push({clip:'rise-front',seconds:.3,view:'front',mirror:false});
  steps.push(...catFacingPath(view,mirror,targetView,targetMirror));
  if(seated)steps.push({clip:'sit-front',seconds:.32,view:'front',mirror:false,seated:true});
  if(!steps.length){if(command)direct(command);return;}
  prep={steps,index:0,age:0,command};mirror=steps[0].mirror;settle=null;
 }
 function issue(command){
  if(command.kind==='go'&&!motion.sample().moving){
   const s=motion.sample(),dx=command.x-s.x,dz=command.z-s.z,length=Math.hypot(dx,dz);
   if(length>.01){const targetView=Math.abs(dz/length)>.8?(dz>0?'front':'rear'):'side';prepare(targetView,dx<0,{command});return;}
  }
  if(command.kind!=='stop')settle=null;
  direct(command);
 }
 return {
  step(dt){
   alive();if(!Number.isFinite(dt)||dt<0||dt>.25)throw RangeError('Invalid cat dt');
   let left=dt;while(left>1e-10){const step=Math.min(1/60,left);left-=step;
    advanceToy(step);
    if(prep){
     prep.age+=step;const part=prep.steps[prep.index];
     if(prep.age>=part.seconds){view=part.view;mirror=part.mirror;standing=!part.seated;
      prep.age=0;prep.index++;
      if(prep.index===prep.steps.length){const cmd=prep.command;prep=null;if(cmd)direct(cmd);}
      else mirror=prep.steps[prep.index].mirror;
     }
     // Life's authored contact/consumption holds start after this bridge,
     // rather than being consumed while hidden behind it.
     if(prep)continue;
    }
    motion.step(step);const s=motion.sample();
    const command=life.step(step,s);if(command)issue(command);
    const report=life.report,clip=report.clip;
    const target=report.toyTarget;
    if(target&&toy?.id!==target.id)toy={id:target.id,x:target.x+target.direction*toyReach,z:target.z,
      radius:toyRadius,direction:target.direction,speed:0,angle:0,struck:false};
    if(toy&&!toy.struck&&clip==='bat'&&report.progress>=2/asset.meta.clips.bat.length){toy.struck=true;toy.speed=.28;}
    if(s.moving&&!prep&&!s.exercising){if(s.airborne){mirror=Math.sin(s.heading)<0;view='side';}standing=true;settle=null;}
    if(clip!==lastLifeClip){
     if(['stretch-enter','knead-enter','feed-enter'].includes(clip)&&standing)prepare('front',false,{seated:true});
     if(['tower-load','crouch','wheel-enter'].includes(clip))prepare('side',clip==='tower-load'?report.facing<0:clip==='wheel-enter'?false:mirror);
     if(['tower-land','tower-settle','wheel-leave'].includes(clip)){view='side';standing=true;settle=null;if(clip.startsWith('wheel'))mirror=false;}
     if(clip==='stretch-reach'){view='side';mirror=false;settle=null;}
     if(clip==='feed-sniff'){view='side';mirror=false;standing=true;settle=null;}
     // These authored sequences already finish on the canonical front sit.
     // Replaying stand-to-sit here made the cat rise again after paw play.
     if(clip==='sit'&&['bat','stretch','stretch-leave','feed-leave','loaf-leave'].includes(lastLifeClip)){view='front';mirror=false;standing=false;settle=null;}
     lastLifeClip=clip;
    }
    const quiet=['idle','sit','blink','eye-greeting','groom','loaf','sleep','tail-swish','tail-tip'].includes(clip);
    if(!s.moving&&!prep&&quiet&&standing)prepare('front',false,{seated:true});
    lastMoving=s.moving;
    if(s.moving&&!s.airborne&&!s.climbing&&!s.exercising&&s.supportY===0&&!prep&&view==='side')contacts.update(s,mirror);else contacts.reset();
    if(s.exercising&&!prep){const pose=wheelPose(s);wheelContacts.update(s,pose.clip,pose.progress);}else wheelContacts.reset();
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
   if(s.airborne){clip=r.clip==='tower-up'?'tower-rise':r.clip==='tower-down'?'tower-fall':'pounce';progress=s.flightProgress;}
   if(s.climbing){clip='tower-pull';progress=s.climbProgress;}
   if(s.exercising){const pose=wheelPose(s);clip=pose.clip;progress=pose.progress;}
   else if(r.clip==='wheel-run'){clip='wheel-push';progress=0;}
   if(!s.moving&&['walk','creep'].includes(clip)){clip=view==='rear'?'stand-rear':view==='front'?'rise-front':'stand';progress=1;}
   if(prep){const part=prep.steps[prep.index];clip=part.clip;progress=Math.min(1,prep.age/part.seconds);if(part.reverse)progress=1-progress;}
   if(settle){clip=settle.clip;progress=Math.min(1,settle.age/settle.seconds);}
   // Nine authored licking cycles in 3.6s. Rendering only samples simulation
   // progress; a hidden or sparse host cannot change eating cadence.
   if(clip==='feed-lick')progress=progress>=1?0:(progress*9)%1;
   if(clip==='knead')progress=progress>=1?0:(progress*4)%1;
   let keys=asset.meta.clips[clip]??asset.meta.clips.sit;
   if(clip==='stand')keys=[asset.meta.clips['turn-front-side'].at(-1)];
   if(clip==='sleep'){
    // A slow fur breath and rare ear twitch, with exact curled endpoints.
    // No body scaling/bobbing, no extra resident raster, no render-owned clock.
    const t=r.restSeconds??0,phase=t%5.6;
    keys=[Math.floor(t)%23===17?asset.meta.clips.sleep[3]:phase>1.4&&phase<3.5?asset.meta.clips.sleep[1]:asset.meta.clips.sleep[0]];progress=0;
   }
   const pins=clip==='walk'?contacts.pins(s):clip.startsWith('wheel-')?wheelContacts.pins(s):[];
   // Every authored key needs a real hold, including the recovery/exit key.
   const key=keys[Math.min(keys.length-1,Math.floor(Math.max(0,Math.min(1,progress))*keys.length))];
   const food=r.food?Math.ceil(r.food.remaining*16)/16:null;
   const wheelAngle=Math.round(s.wheelAngle*120)/120;
   const p=projectCat(s.x,s.y,s.z,{width,height,canvasMeters:.6});
   if(s.climbing){
    const anchor=asset.meta.perch.anchors[keys.indexOf(key)],q=projectCat(s.perchContact.x,s.perchContact.y,s.perchContact.z,{width,height});
    p.x=q.x-(mirror?-1:1)*(anchor.x-160)*p.size/320;p.y=q.y-(anchor.y-290)*p.size/320;
   }
   const toyPoint=toy?projectCat(toy.x,toy.radius,toy.z,{width,height}):null;
   const toyScreen=toyPoint?{x:toyPoint.x,y:toyPoint.y,radius:toyPoint.size*toy.radius/.6}:null;
   const paintKey=[width,height,key,mirror,p.x,p.y,p.size,food,r.mat,wheelAngle,toy?.id,toy?.x,toy?.z,toy?.angle].join('/');
   const dish=p&&food!==null?{x:p.x+p.size*(269/320-.5),y:p.y+p.size*(288-290)/320,
     radius:p.size*18/320,remaining:food}:null;
   const mat=r.mat?{x:p.x,y:p.y+p.size*3/320,radiusX:p.size*72/320,radiusY:p.size*12/320}:null;
   const result=text=>({text,pixels,columns,rows,color:asset.meta.color,state:{...s,clip,frame:key},contacts:pins,report:r,placement:p,dish,mat,toy:toy?{...toy}:null,toyScreen});
   lastClip=clip;lastFrame=key;
   if(paintKey===lastPaintKey){heldHits++;return result(lastText);}
   if(kernel?.clear)kernel.clear(pixels);else for(let i=0;i<n;i+=4)pixels[i]=pixels[i+1]=pixels[i+2]=0;
   const gray=asset.store.getFrame(key);
   if(p){
    const size=p.size,left=p.x-size*.5,top=p.y-size*(290/320),x0=Math.max(0,Math.floor(left)),y0=Math.max(0,Math.floor(top)),x1=Math.min(width,Math.ceil(left+size)),y1=Math.min(height,Math.ceil(top+size));
    if(kernel?.catBlit)kernel.catBlit(pixels,gray,{width,height,x:p.x,y:p.y,size:p.size,mirror,pins});else for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
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
   if(toyScreen){
    const q=toyScreen,behind=toy.z<s.z-.01,cos=Math.cos(toy.angle),sin=Math.sin(toy.angle);
    for(let y=Math.max(0,Math.floor(q.y-q.radius));y<Math.min(height,Math.ceil(q.y+q.radius));y++)
     for(let x=Math.max(0,Math.floor(q.x-q.radius));x<Math.min(width,Math.ceil(q.x+q.radius));x++){
      const dx=(x+.5-q.x)/q.radius,dy=(y+.5-q.y)/q.radius,e=dx*dx+dy*dy;
      if(e>1)continue;const at=(y*width+x)*4;if(behind&&pixels[at])continue;
      const stripe=Math.abs(dx*cos+dy*sin)<.16,value=Math.round((stripe?90:210)*(1-.25*e));
      pixels[at]=pixels[at+1]=pixels[at+2]=value;
     }
   }
   const onWheel=clip.startsWith('wheel-')&&Math.abs(s.x-CAT_HABITAT.wheel.catX)<.02;
   if(onWheel)clipWheelPaws(pixels,width,height,p);
   paintHabitat(pixels,width,height,wheelAngle);
   if(onWheel)paintWheelFront(pixels,width,height);
   rasterizations++;lastPaintKey=paintKey;lastText=(kernel?.braille?kernel.braille(pixels,width,height,1.22,1.08):rgbaToBraille(pixels,width,height,{method:'stable',brightness:1.22,contrast:1.08})).text;
   return result(lastText);
  },
  interact(kind,options){alive();if(!['treat','toy','call','stretch','tail','greet','company','tower','wheel'].includes(kind))throw TypeError('Invalid cat interaction');const accepted=life.interact(kind,options);if(accepted&&prep)prep.command=null;return accepted;},
  // Passive host cues wait for direct input/feeding to finish. A fresh source
  // may retry a rejected cue through its existing attention monitor.
  notify(){alive();if(life.report.busy)return false;const accepted=life.interact('greet');if(accepted&&prep)prep.command=null;return accepted;},
  get report(){alive();return life.report;},
  get stats(){alive();return {residentPixelBytes:asset.store.residentPixelBytes??asset.store.residentBytes,cachedFrames:asset.store.stats().cachedFrames,rgbaBytes:pixels?.byteLength??0,lastClip,lastFrame,leases:lease.users?.()??1,rasterizations,heldHits};},
  dispose(){if(disposed)return;disposed=true;pixels=null;prep=null;toy=null;contacts.reset();wheelContacts.reset();asset=null;lastText=lastPaintKey='';release();}
 };
}
