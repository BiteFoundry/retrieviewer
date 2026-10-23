export const ZOOMIES={width:320,height:320,count:12,columns:4,rows:3};
const ease=x=>x*x*(3-2*x);
export function zoomiesAt(seconds,{mode='auto'}={}){
 if(!Number.isFinite(seconds)||seconds<0||!['auto','run','pant'].includes(mode))throw Error('Invalid zoomies state');
 const t=mode==='run'?seconds%6:seconds%16;
 if(mode==='pant'||(mode==='auto'&&t>=8))return {state:'pant',pose:8+Math.floor(seconds*6)%4,x:.58,floor:.96,scale:.90,flip:false};
 if(t>=6){const s=ease(Math.min(1,(t-6)/2));return {state:t<6.5?'brake':'settle',pose:t<6.5?7:8,x:.58,floor:.96,scale:.66+.24*s,flip:false};}
 const leg=Math.floor(t/2),p=ease((t%2)/2),x=leg===0?.22+.56*p:leg===1?.78-.56*p:.22+.36*p;
 return {state:'run',pose:Math.floor(seconds*12)%8,x,floor:.83+.045*Math.sin(t*Math.PI/3),scale:.62+.04*Math.sin(t*Math.PI/3),flip:leg===1};
}
export function createZoomies(atlas,width,height,{spec=ZOOMIES,stateAt=zoomiesAt,frameProvider}={}){
 const {width:sw,height:sh,count}=spec,stride=sw*sh*4;
 if(atlas.length!==stride*count||![width,height].every(Number.isInteger)||width<2||height<2||width*height>1_000_000)throw Error('Invalid zoomies atlas or stage');
 const out=new Uint8ClampedArray(width*height*4);
 return function render(seconds,options={}){
  const state=stateAt(seconds,options),side=height*state.scale,span=side*(state.widthScale??1),left=width*state.x-span/2,top=height*state.floor-side,offset=frameProvider?0:state.pose*stride,image=frameProvider?frameProvider(state):atlas;
  out.fill(0);for(let i=3;i<out.length;i+=4)out[i]=255;
  for(let y=Math.max(0,Math.floor(top));y<Math.min(height,Math.ceil(top+side));y++)for(let x=Math.max(0,Math.floor(left));x<Math.min(width,Math.ceil(left+span));x++){
   let u=(x-left)/span;if(state.flip)u=1-u;const v=(y-top)/side;
   if(u<0||u>1||v<0||v>1)continue;
   const sx=u*(sw-1),sy=v*(sh-1),x0=Math.floor(sx),y0=Math.floor(sy),x1=Math.min(sw-1,x0+1),y1=Math.min(sh-1,y0+1),fx=sx-x0,fy=sy-y0;
   const a=offset+(y0*sw+x0)*4,b=offset+(y0*sw+x1)*4,c=offset+(y1*sw+x0)*4,d=offset+(y1*sw+x1)*4,j=(y*width+x)*4;
   for(let k=0;k<3;k++)out[j+k]=(image[a+k]*(1-fx)+image[b+k]*fx)*(1-fy)+(image[c+k]*(1-fx)+image[d+k]*fx)*fy;
  }
  return out;
 };
}
