// Small physical toys in the SAME fixed camera as the puppy, before Braille
// conversion. No minimum thumbnail size, DOM overlay, sprite zoom or new dog art.
// mouth: renderer.lastMouth for the frame just painted. A carried ball sits on that
// measured drawn mouth only; without one (side/rear/unmeasured pose) it is hidden.
export function paintCompanionObjects(pixels,width,height,projection,report,state,mouth=null){
 const objects=[];
 // Interaction drawings already include the toy/food. Never paint a second
 // floating ball over the baked mouth, or a biscuit through the puppy's chest.
 if(report.gesture)return pixels;
 if(report.ball?.carried){if(mouth&&[mouth.x,mouth.y,mouth.rx,mouth.ry].every(Number.isFinite)&&mouth.rx>0&&mouth.ry>0)objects.push({kind:'ball',screen:mouth});}
 else if(report.ball)objects.push({...report.ball,radius:.035,kind:'ball'});
 if(report.treat)objects.push({...report.treat,height:report.treat.height??.018,radius:.022,kind:'treat'});
 for(const o of objects){
  let cx,cy,rx,ry;
  if(o.screen)({x:cx,y:cy,rx,ry}=o.screen);
  else{
   const p=projection.project(o.x,o.height??0,o.z),edge=projection.project(o.x+o.radius,o.height??0,o.z);
   cx=p.x*width;cy=p.y*height;rx=Math.abs(edge.x-p.x)*width;
   const up=projection.project(o.x,(o.height??0)+o.radius,o.z);ry=Math.abs(up.y-p.y)*height;
  }
  if(![cx,cy,rx,ry].every(Number.isFinite)||rx<=0||ry<=0)continue;
  for(let y=Math.max(0,Math.floor(cy-ry));y<Math.min(height,Math.ceil(cy+ry));y++)
   for(let x=Math.max(0,Math.floor(cx-rx));x<Math.min(width,Math.ceil(cx+rx));x++){
    const u=(x+.5-cx)/rx,v=(y+.5-cy)/ry;if(u*u+v*v>1)continue;
    const tone=o.kind==='treat'?((x+y)%3?190:85):Math.abs(v+.25*u)<.18?85:225;
    const j=(y*width+x)*4;pixels[j]=pixels[j+1]=pixels[j+2]=tone;
   }
 }
 return pixels;
}
