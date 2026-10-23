// Small deterministic 2D secondary motion, NOT recovered anatomy/physics.
// Coordinates track the eight approved, body-registered run keys (320px).
const HEADS=[[243,145],[254,136],[252,145],[253,129],[246,152],[247,155],[248,139],[251,135]];
const oval=(x,y,cx,cy,rx,ry)=>Math.max(0,1-((x-cx)/rx)**2-((y-cy)/ry)**2)**2;
const bump=(p,center,radius)=>{const u=Math.abs(p-center)/radius;return u<1?(1+Math.cos(Math.PI*u))/2:0;};
export function faceAt(state){
 if(state.state!=='run')return {cheek:0,ear:0,mouth:0};
 const phase=state.pair+state.blend;
 // No extra oscillations at extension. One landing squash, one soft recovery.
 // All pulses and their first derivatives are zero at the gait/segment ends.
 return {cheek:3.5*bump(phase,4.75,1.25)-.85*bump(phase,6.05,.95),
  ear:-5*bump(phase,2.3,1.6)+7*bump(phase,5.12,1.48)-1.4*bump(phase,6.65,.85),
  mouth:2.2*bump(phase,5.02,1.32)-.75*bump(phase,6.25,1)};
}
export function headAt(state){
 const i=state.pair,p=state.blend,n=HEADS.length;
 if(!Number.isInteger(i)||i<0||i>=n||!Number.isFinite(p)||p<0||p>1)throw Error('Invalid facial gait state');
 return [0,1].map(axis=>{const a=HEADS[(i+n-1)%n][axis],b=HEADS[i][axis],c=HEADS[(i+1)%n][axis],d=HEADS[(i+2)%n][axis];
  return .5*(2*b+(-a+c)*p+(2*a-5*b+4*c-d)*p*p+(-a+3*b-3*c+d)*p*p*p);});
}
export function createFaceMotion(){
 const output=new Uint8ClampedArray(320*320*4);
 return (image,state)=>{
  const m=faceAt(state);
  if(!m.cheek&&!m.ear&&!m.mouth)return image;
  if(image.length!==output.length)throw Error('Invalid facial image');
  const [hx,hy]=headAt(state);output.set(image);
  for(let y=Math.max(0,Math.floor(hy-40));y<Math.min(320,hy+65);y++)for(let x=Math.max(0,Math.floor(hx-65));x<Math.min(320,hx+49);x++){
   const dx=x-hx,dy=y-hy;
   // Compact supports leave body, legs, tail and background outside ROI exact.
   const ear=oval(dx,dy,-37,7,23,36)+oval(dx,dy,29,12,16,30);
   const cheek=oval(dx,dy,-18,17,24,24)+oval(dx,dy,23,19,19,23);
   const mouth=oval(dx,dy,6,31,24,21);
   const protect=Math.min(1,oval(dx,dy,-9,-9,14,12)+oval(dx,dy,14,-8,12,11)+oval(dx,dy,12,9,15,12));
   const weight=1-protect;
   const sx=x-m.cheek*dx/30*cheek*.35*weight-m.ear*ear*.18;
   const sy=y+(m.cheek*cheek-m.mouth*mouth)*weight-m.ear*ear;
   if(sx===x&&sy===y)continue;
   const px=Math.max(0,Math.min(319,sx)),py=Math.max(0,Math.min(319,sy)),x0=Math.floor(px),y0=Math.floor(py),x1=Math.min(319,x0+1),y1=Math.min(319,y0+1),fx=px-x0,fy=py-y0;
   const a=(y0*320+x0)*4,b=(y0*320+x1)*4,c=(y1*320+x0)*4,d=(y1*320+x1)*4,j=(y*320+x)*4;
   // Grayscale remains grayscale; one inverse sample avoids crossfade ghosts.
   output[j]=output[j+1]=output[j+2]=(image[a]*(1-fx)+image[b]*fx)*(1-fy)+(image[c]*(1-fx)+image[d]*fx)*fy;
  }
  return output;
 };
}
