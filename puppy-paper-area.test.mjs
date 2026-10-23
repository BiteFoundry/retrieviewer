import test from 'node:test';
import assert from 'node:assert/strict';
import {createPaperAreaSampler} from './puppy-paper-area.mjs';

// Deliberately independent Float64 reference, including fractional edge coverage.
function reference(image,n){
 const pitch=n+1,sums=new Float64Array(pitch*pitch);
 for(let y=0;y<n;y++){let row=0;for(let x=0;x<n;x++){row+=image[(y*n+x)*4];sums[(y+1)*pitch+x+1]=sums[y*pitch+x+1]+row;}}
 const at=(x,y)=>{
  x=Math.max(0,Math.min(n,x));y=Math.max(0,Math.min(n,y));
  const ix=Math.min(n-1,Math.floor(x)),iy=Math.min(n-1,Math.floor(y)),fx=x-ix,fy=y-iy,k=iy*pitch+ix;
  return(sums[k]*(1-fx)+sums[k+1]*fx)*(1-fy)+(sums[k+pitch]*(1-fx)+sums[k+pitch+1]*fx)*fy;
 };
 return(x,y,dx,dy)=>Math.max(0,(at(x+dx/2,y+dy/2)-at(x-dx/2,y+dy/2)-at(x+dx/2,y-dy/2)+at(x-dx/2,y-dy/2))/(dx*dy));
}

test('lazy integer area table is bit-exact, handles maximum sums and preserves fractional input',()=>{
 for(const n of [2,17,320,480,640]){
  const sampler=createPaperAreaSampler(n);
  assert.equal(sampler.sample(1,1,1,1),0,'unprepared sampler stays empty without a table');
  for(const Type of [Uint8ClampedArray,Float64Array,Uint8Array]){
   const image=Type.from({length:n*n*4},(_,i)=>Type===Float64Array?(i*1.123)%255:i%251);
   sampler.prepare(image);const expected=reference(image,n);
   for(let i=0;i<150;i++){
    const args=[(i*7.123)%(n+4)-2,(i*3.23)%(n+4)-2,.3+i%12,.4+i%9];
    assert.equal(sampler.sample(...args),expected(...args),`${n}/${Type.name}/${i}`);
   }
  }
  const white=new Uint8Array(n*n*4).fill(255);sampler.prepare(white);
  assert.equal(sampler.sample(n/2,n/2,n,n),255,'maximum integer sum must not overflow');
  white.fill(0);sampler.prepare(white);assert.equal(sampler.sample(n/2,n/2,n,n),0,'no stale integral pixels');
 }
});
