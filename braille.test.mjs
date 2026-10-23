import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rgbaToBraille,BRAILLE_BITS} from './braille.mjs';
const image=(w,h,v)=>{const b=new Uint8Array(w*h*4);for(let i=0;i<b.length;i+=4)b.set([v,v,v,255],i);return b;};
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
