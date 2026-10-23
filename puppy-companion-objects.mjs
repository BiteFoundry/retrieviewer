// Small physical toys in the SAME fixed camera as the puppy, before Braille
// conversion. No minimum thumbnail size, DOM overlay, sprite zoom or new dog art.
// mouth: renderer.lastMouth for the frame just painted. A carried ball sits on that
// measured drawn mouth only; without one (side/rear/unmeasured pose) it is hidden.
export function paintCompanionObjects(pixels,width,height,projection,report,state,mouth=null){
 const objects=[];
 // Interaction drawings already include the toy/food. Never paint a second
 // floating ball over the baked mouth, or a biscuit through the puppy's chest.
 if(report.gesture)return pixels;
 // Tiny procedural butterfly: two paired wings and a body. World-space size,
 // same fixed camera and palette as the pet; no image/cache or extra render pass.
 if(report.butterfly){
  const b=report.butterfly,p=projection.project(b.x,b.height,b.z);
  const edge=projection.project(b.x+.04,b.height,b.z),up=projection.project(b.x,b.height+.035,b.z);
  const cx=p.x*width,cy=p.y*height,rx=Math.abs(edge.x-p.x)*width,ry=Math.abs(up.y-p.y)*height;
  const opening=.22+.78*Math.abs(Math.sin(b.phase*Math.PI)),tone=Math.round(235*b.opacity);
  if([cx,cy,rx,ry,opening,tone].every(Number.isFinite)&&rx>0&&ry>0&&tone>0)
   for(let y=Math.max(0,Math.floor(cy-ry));y<Math.min(height,Math.ceil(cy+ry));y++)
    for(let x=Math.max(0,Math.floor(cx-rx));x<Math.min(width,Math.ceil(cx+rx));x++){
     const u=(x+.5-cx)/rx,v=(y+.5-cy)/ry,a=Math.abs(u)/opening;
     const wing=((a-.5)/.44)**2+((v+.28)/.56)**2<1||((a-.36)/.29)**2+((v-.43)/.37)**2<1;
     const body=Math.abs(u)<.1&&Math.abs(v)<.7;
     if(wing||body){const j=(y*width+x)*4;pixels[j]=pixels[j+1]=pixels[j+2]=Math.max(pixels[j],body?tone:Math.round(tone*(.65+.35*a)));}
    }
 }
 // A quiet, tiny rising "z" suggests snoring. The sleeping dog itself remains
 // the original eyes-closed source pose: no chest/body zoom or squashing.
 if(Number.isFinite(report.snore)&&state.state==='sleep'){
  const placement=projection.placement(state.x,state.z),side=height*placement.size,sideX=side/placement.pixelAspect;
  const left=width*placement.x-sideX/2,top=height*placement.y-300/320*side;
  const cycle=report.snore,tone=Math.round(140*Math.sin(Math.PI*cycle)),unit=Math.max(1,Math.round(side/160));
  const cx=Math.round(left+220/320*sideX),cy=Math.round(top+(210-16*cycle)/320*side);
  if(tone>12)for(const [gx,gy] of [[0,0],[1,0],[2,0],[1,1],[0,2],[1,2],[2,2]])for(let dy=0;dy<unit;dy++)for(let dx=0;dx<unit;dx++){
   const x=cx+gx*unit+dx,y=cy+gy*unit+dy;if(x<0||x>=width||y<0||y>=height)continue;
   const j=(y*width+x)*4;pixels[j]=pixels[j+1]=pixels[j+2]=Math.max(pixels[j],tone);
  }
 }
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
