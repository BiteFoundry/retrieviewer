// Small code-native furniture shares the cat's meter space and fixed camera.
// No textures, canvas, retained bitmap or per-object simulation/timer.
import {projectCat} from './world.mjs';
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
