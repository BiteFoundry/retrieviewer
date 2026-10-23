// Deterministic, off-screen current-runtime samples. No UI, timers or user data.
import {createPet} from '../retrieviewer.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
import {deflateSync} from 'node:zlib';
import {resolve,join} from 'node:path';
const out=resolve('dist/comfort-qa');mkdirSync(out,{recursive:true});
const crc=bytes=>{let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;}return(c^0xffffffff)>>>0;};
const chunk=(type,bytes)=>{const t=Buffer.from(type),out=Buffer.alloc(12+bytes.length);out.writeUInt32BE(bytes.length);t.copy(out,4);Buffer.from(bytes).copy(out,8);out.writeUInt32BE(crc(Buffer.concat([t,bytes])),8+bytes.length);return out;};
function png(frame){
 const cell=8,w=frame.columns*cell,h=frame.rows*cell*2,raw=Buffer.alloc(h*(w*3+1));
 for(const [row,line] of frame.text.split('\n').entries())for(const [col,char] of [...line].entries()){
  const bits=char.codePointAt(0)-0x2800;
  for(let bit=0;bit<8;bit++)if(bits>>bit&1){
   const dx=[0,0,0,1,1,1,0,1][bit],dy=[0,1,2,0,1,2,3,3][bit],cx=col*8+(dx+.5)*4,cy=row*16+(dy+.5)*4;
   for(let y=Math.floor(cy-1.1);y<=cy+1.1;y++)for(let x=Math.floor(cx-1.1);x<=cx+1.1;x++)if(x>=0&&x<w&&y>=0&&y<h){
    const distance=Math.hypot(x+.5-cx,y+.5-cy),tone=Math.round(235*Math.max(0,Math.min(1,1.5-distance)));
    const i=y*(w*3+1)+1+x*3;raw[i]=raw[i+1]=raw[i+2]=Math.max(raw[i],tone);
   }
  }
 }
 const head=Buffer.alloc(13);head.writeUInt32BE(w);head.writeUInt32BE(h,4);head[8]=8;head[9]=2;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',head),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
const receipt=[];
for(const [kind,seed] of [['belly',4],['sleep',43],['tug',2]]){
 const pet=await createPet({seed});let time=0,found=0;const snapshots=[];
 try{
  if(kind==='tug')pet.interact('tug');
  for(let i=0;i<60*70;i++){
   pet.step(1/60);time+=1/60;
   // Render only a few samples; sample state without exposing actor to hosts.
   if(i%6)continue;
   const f=pet.frame({columns:160,rows:80,poseFps:30});
   if(f.state.state!==kind)continue;
   found++;
   if(found===[1,12,24,40][snapshots.length]){
    const name=kind+'-'+snapshots.length+'.png';writeFileSync(join(out,name),png(f));
    snapshots.push({name,time,state:f.state,report:f.report});
    if(snapshots.length===4)break;
   }
  }
  if(snapshots.length!==4)throw Error('Missing '+kind+' samples');
  receipt.push({kind,seed,snapshots});
 }finally{pet.dispose();}
}
writeFileSync(join(out,'receipt.json'),JSON.stringify(receipt,null,2));
console.log(JSON.stringify(receipt.map(({kind,snapshots})=>({kind,frames:snapshots.map(s=>s.name)}))));
