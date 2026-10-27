// Small code-native furniture shares the cat's meter space and fixed camera.
// No textures, canvas, retained bitmap or per-object simulation/timer.
import {projectCat} from './world.mjs';

// Invert the fixed camera on the wheel's vertical plane once per raster row.
// The lower tread is a contact boundary; only toe-height pixels are clipped.
export function clipWheelPaws(pixels,width,height,p){
 const w=CAT_HABITAT.wheel,c=Math.cos(Math.PI/20),s=Math.sin(Math.PI/20);
 const diagonal=.0254*32,sw=diagonal*16/Math.hypot(16,9),sh=diagonal*9/Math.hypot(16,9),f=.70*Math.min(width/sw,height/sh);
 const x0=Math.max(0,Math.floor(p.x-p.size/2)),x1=Math.min(width,Math.ceil(p.x+p.size/2));
 for(let v=Math.max(0,Math.floor(p.y-p.size*.35));v<Math.min(height,Math.ceil(p.y+p.size*.1));v++){
  const q=(height/2-v-.5)/f,dy=(s-q*c)*(w.z-1.65)/(q*s+c),y=dy+.45;
  if(y>.18)continue;
  const depth=-s*dy-c*(w.z-1.65),radius=Math.sqrt(Math.max(0,w.radius*w.radius-(y-w.radius)**2));
  const left=width/2+f*(w.x-radius)/depth,right=width/2+f*(w.x+radius)/depth;
  for(let u=x0;u<x1;u++)if(y<0||u+.5<left||u+.5>right){const at=(v*width+u)*4;pixels[at]=pixels[at+1]=pixels[at+2]=0;}
 }
}

export function paintWheelFront(pixels,width,height){
 const w=CAT_HABITAT.wheel;let previous;
 for(let i=0;i<=96;i++){
  const angle=Math.PI+i*Math.PI/96,q=projectCat(w.x+w.radius*Math.cos(angle),w.radius+w.radius*Math.sin(angle),w.z,{width,height});
  if(previous){const n=Math.max(1,Math.ceil(Math.hypot(q.x-previous.x,q.y-previous.y)));for(let j=0;j<=n;j++){
   const x=Math.round(previous.x+(q.x-previous.x)*j/n),y=Math.round(previous.y+(q.y-previous.y)*j/n);if(x<0||y<0||x>=width||y>=height)continue;
   const at=(y*width+x)*4;pixels[at]=pixels[at+1]=pixels[at+2]=155;
  }}previous=q;
 }
}
export const CAT_HABITAT=Object.freeze({
 tower:Object.freeze({x:-.61,z:-1.9,lowX:-.43,lowY:.21,highX:-.65,highY:.42,approachX:-.12}),
 wheel:Object.freeze({x:.57,z:-1.9,radius:.42,catX:.53,stride:.32})
});
export function paintHabitat(pixels,width,height,angle=0){
 const at=(x,y,value)=>{x=Math.round(x);y=Math.round(y);if(x<0||y<0||x>=width||y>=height)return;
  const i=(y*width+x)*4;if(pixels[i])return;pixels[i]=pixels[i+1]=pixels[i+2]=value;};
 const point=(x,y,z)=>projectCat(x,y,z,{width,height});
 const line=(a,b,value=105)=>{const n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)));
  for(let i=0;i<=n;i++)at(a.x+(b.x-a.x)*i/n,a.y+(b.y-a.y)*i/n,value);};
 const edge=(x,y,z,xx,yy,zz,value)=>line(point(x,y,z),point(xx,yy,zz),value);
 const t=CAT_HABITAT.tower,w=CAT_HABITAT.wheel;
 const platform=(x,y,half)=>{
  edge(x-half,y,t.z-.12,x+half,y,t.z-.12,150);
  edge(x-half,y,t.z+.12,x+half,y,t.z+.12,205);
  edge(x-half,y,t.z-.12,x-half,y,t.z+.12,150);
  edge(x+half,y,t.z-.12,x+half,y,t.z+.12,150);
  edge(x-half,y-.025,t.z+.12,x+half,y-.025,t.z+.12,100);
 };
 platform(t.x,0,.34);platform(t.lowX,t.lowY,.21);platform(t.highX,t.highY,.21);
 for(const [x,top] of [[t.lowX,t.lowY],[t.highX,t.highY]]){
  edge(x-.025,0,t.z,x-.025,top-.025,t.z,90);edge(x+.025,0,t.z,x+.025,top-.025,t.z,125);
  for(let y=.025;y<top-.025;y+=.025)edge(x-.024,y,t.z,x+.024,y+.008,t.z,65);
 }
 for(const [z,value] of [[w.z-.08,65],[w.z,155]]){
  let prev=point(w.x+w.radius,w.radius,z);
  for(let i=1;i<=112;i++){const a=i*Math.PI*2/112,next=point(w.x+w.radius*Math.cos(a),w.radius+w.radius*Math.sin(a),z);line(prev,next,value);prev=next;}
 }
 // Rim markings move backwards at the tread while the cat faces screen right.
 for(let i=0;i<24;i++){
  const a=i*Math.PI*2/24-angle;
  edge(w.x+(w.radius-.018)*Math.cos(a),w.radius+(w.radius-.018)*Math.sin(a),w.z,
       w.x+(w.radius-.05)*Math.cos(a),w.radius+(w.radius-.05)*Math.sin(a),w.z,110);
 }
 edge(w.x-.25,-.025,w.z,w.x+.25,-.025,w.z,130);
 edge(w.x-.25,-.025,w.z,w.x-.18,.045,w.z,95);
 edge(w.x+.25,-.025,w.z,w.x+.18,.045,w.z,95);
}
