// Unicode 2x4 cells, the same dot numbering used by AuraDeck's Braille canvas.
export const BRAILLE_BITS=[[1,8],[2,16],[4,32],[64,128]];
const BAYER=[[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]];
const clamp=v=>Math.max(0,Math.min(1,v));
export function rgbaToBraille(rgba,width,height,{brightness=1,contrast=1,method='floyd'}={}){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>1_000_000||rgba.length!==width*height*4)throw Error('Invalid RGBA image');
  if(!Number.isFinite(brightness)||brightness<=0||brightness>4||!Number.isFinite(contrast)||contrast<=0||contrast>4||!['floyd','bayer','stable'].includes(method))throw Error('Invalid dithering options');
  const values=new Float32Array(width*height),bits=new Uint8Array(width*height);
  for(let i=0;i<values.length;i++){
    const p=i*4,luma=(.2126*rgba[p]+.7152*rgba[p+1]+.0722*rgba[p+2])/255*(rgba[p+3]/255);
    values[i]=luma===0?0:clamp((Math.pow(luma,.9)*brightness-.5)*contrast+.5);
  }
  if(method==='stable'){
    // Fixed per-pixel threshold, not fresh random noise on every animation tick.
    // Unlike the 4x4 Bayer matrix this avoids a repeating cross-hatch on fur.
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      let n=Math.imul(x+1,0x1f123bb5)^Math.imul(y+1,0x5f356495);
      n=Math.imul(n^(n>>>16),0x45d9f3b);n=Math.imul(n^(n>>>16),0x45d9f3b);n=(n^(n>>>16))>>>0;
      bits[y*width+x]=values[y*width+x]>(n+.5)/4294967296?1:0;
    }
  }else if(method==='bayer'){
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)bits[y*width+x]=values[y*width+x]>(BAYER[y%4][x%4]+.5)/16?1:0;
  }else{
    const add=(x,y,error,weight)=>{if(x>=0&&x<width&&y<height)values[y*width+x]+=error*weight/16;};
    for(let y=0;y<height;y++){
      const direction=y%2?-1:1;
      for(let k=0;k<width;k++){
        const x=direction===1?k:width-1-k,i=y*width+x,old=values[i],value=old>=.5?1:0,error=old-value;
        bits[i]=value;add(x+direction,y,error,7);add(x-direction,y+1,error,3);add(x,y+1,error,5);add(x+direction,y+1,error,1);
      }
    }
  }
  const columns=Math.ceil(width/2),rows=Math.ceil(height/4),lines=[];
  for(let cy=0;cy<rows;cy++){
    let line='';
    for(let cx=0;cx<columns;cx++){
      let mask=0;for(let dy=0;dy<4;dy++)for(let dx=0;dx<2;dx++){
        const x=cx*2+dx,y=cy*4+dy;if(x<width&&y<height&&bits[y*width+x])mask|=BRAILLE_BITS[dy][dx];
      }
      line+=String.fromCodePoint(0x2800+mask);
    }
    lines.push(line);
  }
  return {text:lines.join('\n'),columns,rows,dots:bits.reduce((a,b)=>a+b,0)};
}
