import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rgbaToBraille,BRAILLE_BITS} from './braille.mjs';
const image=(w,h,v)=>{const b=new Uint8Array(w*h*4);for(let i=0;i<b.length;i+=4)b.set([v,v,v,255],i);return b;};
// Deliberately simple pre-optimization reference: separate Float32 luminance,
// threshold bits, then cell assembly. Never shares the optimized mask/LUT path.
function stableReference(rgba,w,h,{brightness=1,contrast=1}={}){
 const values=new Float32Array(w*h),bits=new Uint8Array(w*h);
 for(let i=0;i<values.length;i++){
  const p=i*4,luma=(.2126*rgba[p]+.7152*rgba[p+1]+.0722*rgba[p+2])/255*(rgba[p+3]/255);
  values[i]=luma===0?0:Math.max(0,Math.min(1,(Math.pow(luma,.9)*brightness-.5)*contrast+.5));
 }
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  let n=Math.imul(x+1,0x1f123bb5)^Math.imul(y+1,0x5f356495);
  n=Math.imul(n^(n>>>16),0x45d9f3b);n=Math.imul(n^(n>>>16),0x45d9f3b);n=(n^(n>>>16))>>>0;
  bits[y*w+x]=values[y*w+x]>(n+.5)/4294967296?1:0;
 }
 const columns=Math.ceil(w/2),rows=Math.ceil(h/4),lines=[];
 for(let cy=0;cy<rows;cy++){
  let line='';for(let cx=0;cx<columns;cx++){
   let mask=0;for(let dy=0;dy<4;dy++)for(let dx=0;dx<2;dx++){
    const x=cx*2+dx,y=cy*4+dy;if(x<w&&y<h&&bits[y*w+x])mask|=BRAILLE_BITS[dy][dx];
   }line+=String.fromCodePoint(0x2800+mask);
  }lines.push(line);
 }
 return{text:lines.join('\n'),columns,rows,dots:bits.reduce((a,b)=>a+b,0)};
}
test('fast stable conversion is bit-exact for grayscale, color, alpha and odd grids',()=>{
 let seed=17;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed>>>24;};
 const options=[{}, {brightness:1.18,contrast:1.1},{brightness:.1,contrast:4},{brightness:4,contrast:.1},{brightness:1,contrast:1}];
 for(let pass=0;pass<180;pass++){
  const w=1+random()%31,h=1+random()%29,data=new Uint8ClampedArray(w*h*4);
  for(let p=0;p<data.length;p+=4){const gray=random();data.set(pass%3===0?[gray,gray,gray,255]:[random(),random(),random(),random()],p);}
  const opts=options[pass%options.length];
  assert.deepEqual(rgbaToBraille(data,w,h,{...opts,method:'stable'}),stableReference(data,w,h,opts));
 }
 const fractional=Float32Array.from({length:9*5*4},(_,i)=>i%4===3?255:(i*.73)%255);
 assert.deepEqual(rgbaToBraille(fractional,9,5,{method:'stable'}),stableReference(fractional,9,5));
 const allTones=Uint8Array.from({length:256*4},(_,i)=>i%4===3?255:Math.floor(i/4));
 for(const opts of options)assert.deepEqual(rgbaToBraille(allTones,256,1,{...opts,method:'stable'}),stableReference(allTones,256,1,opts));
});
test('Unicode dot numbering matches all eight locations',()=>{
 for(let y=0;y<4;y++)for(let x=0;x<2;x++){
  const data=image(2,4,0);data.set([255,255,255,255],(y*2+x)*4);
  assert.equal(rgbaToBraille(data,2,4).text.codePointAt(0),0x2800+BRAILLE_BITS[y][x]);
 }
});
test('black is blank and white fills every dot in both dithering methods',()=>{
 for(const method of ['floyd','bayer','stable']){
  assert.equal(rgbaToBraille(image(4,8,0),4,8,{method}).text,'⠀⠀\n⠀⠀');
  assert.equal(rgbaToBraille(image(4,8,255),4,8,{method}).text,'⣿⣿\n⣿⣿');
 }
});
test('animation grain is fixed, monotonic and not a repeating Bayer tile',()=>{
 const gray=image(32,32,128),a=rgbaToBraille(gray,32,32,{method:'stable'});
 assert.equal(a.text,rgbaToBraille(gray,32,32,{method:'stable'}).text);
 assert.notEqual(a.text,rgbaToBraille(gray,32,32,{method:'bayer'}).text);
 assert(a.dots>350&&a.dots<700);
 assert(rgbaToBraille(image(32,32,64),32,32,{method:'stable'}).dots<a.dots);
});
test('higher luminance produces more dots; partial cells are padded',()=>{
 const counts=[32,96,160,224].map(v=>rgbaToBraille(image(32,32,v),32,32).dots);
 assert(counts.every((v,i)=>i===0||v>counts[i-1]));
 const odd=rgbaToBraille(image(3,5,255),3,5);assert.equal(odd.columns,2);assert.equal(odd.rows,2);
});
test('transparency is blank and invalid settings are rejected',()=>{
 assert.equal(rgbaToBraille(new Uint8Array(32),2,4).dots,0);
 assert.throws(()=>rgbaToBraille(new Uint8Array(31),2,4));
 assert.throws(()=>rgbaToBraille(image(2,4,0),2,4,{brightness:NaN}));
 for(const method of ['stable','floyd','bayer'])assert.equal(rgbaToBraille(image(32,32,0),32,32,{method,contrast:.7}).dots,0);
});
