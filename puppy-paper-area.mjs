// Exact box-footprint minification of the authored grayscale raster, including
// fractional edge coverage. No temporal blur, face warp or minimum sprite size.
export function createPaperAreaSampler(n=320){
 if(!Number.isInteger(n)||n<2||n>640)throw Error('Invalid area source size');
 const pitch=n+1,sums=new Float64Array(pitch*pitch);
 const integral=(x,y)=>{
  x=Math.max(0,Math.min(n,x));y=Math.max(0,Math.min(n,y));
  const ix=Math.min(n-1,Math.floor(x)),iy=Math.min(n-1,Math.floor(y)),fx=x-ix,fy=y-iy,k=iy*pitch+ix;
  return (sums[k]*(1-fx)+sums[k+1]*fx)*(1-fy)+(sums[k+pitch]*(1-fx)+sums[k+pitch+1]*fx)*fy;
 };
 return{
  prepare(image){if(image.length!==n*n*4)throw Error('Invalid area source');sums.fill(0);for(let y=0;y<n;y++){let row=0;for(let x=0;x<n;x++){row+=image[(y*n+x)*4];sums[(y+1)*pitch+x+1]=sums[y*pitch+x+1]+row;}}},
  sample(x,y,dx,dy){if(![x,y,dx,dy].every(Number.isFinite)||Math.min(dx,dy)<=0)throw Error('Invalid area footprint');const l=x-dx/2,r=x+dx/2,t=y-dy/2,b=y+dy/2;return Math.max(0,(integral(r,b)-integral(l,b)-integral(r,t)+integral(l,t))/(dx*dy));}
 };
}
