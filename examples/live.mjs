#!/usr/bin/env node
// Opt-in terminal host. The imported pet itself never touches terminal I/O.
import {createPet} from '../retrieviewer.mjs';
import {once} from 'node:events';

const pet=await createPet({artProfile:process.argv.includes('--original')?'original':'q5'}),out=process.stdout,input=process.stdin;
if(!out.isTTY||!input.isTTY){
 try{out.write(pet.frame({columns:80,rows:24}).text+'\n');}finally{pet.dispose();}
}else{
 let stopped=false,paused=false,last=performance.now(),previous=[],key='';
 const wasRaw=!!input.isRaw;
 const stop=()=>{stopped=true;};
 const data=bytes=>{for(const c of bytes.toString()){
  if(c==='q'||c==='\x03')stop();
  if(c===' ')paused=!paused;
  if(c==='b'||c==='t'){if(pet.interact(c==='b'?'ball':'treat'))paused=false;}
 }};
 process.on('SIGINT',stop);process.on('SIGTERM',stop);
 input.setRawMode(true);input.resume();input.on('data',data);
 out.write('\x1b[?1049h\x1b[?25l\x1b[2J');
 try{
  while(!stopped){
   const start=performance.now();if(!paused)pet.step((start-last)/1000);last=start;
   const columns=Math.max(1,(out.columns??80)-1),available=Math.max(1,(out.rows??24)-2);
   const rows=Math.min(available,Math.max(1,Math.floor(125000/columns)));
   const nextKey=`${columns}/${rows}`;
   if(key!==nextKey){key=nextKey;previous=[];out.write('\x1b[2J');}
   const frame=pet.frame({columns,rows}),lines=frame.text.split('\n');let batch='';
   for(let y=0;y<rows;y++)if(lines[y]!==previous[y])batch+=`\x1b[${y+1};1H${lines[y]}`;
   previous=lines;
   const status=`${paused?'Paused':frame.report.intent} | B ball  T treat  Space pause  Q quit`.slice(0,columns);
   batch+=`\x1b[${rows+1};1H\x1b[2K${status}`;
   if(!out.write(batch))await once(out,'drain');
   await new Promise(resolve=>setTimeout(resolve,Math.max(1,1000/30-(performance.now()-start))));
  }
 }finally{
  process.off('SIGINT',stop);process.off('SIGTERM',stop);input.off('data',data);
  input.setRawMode(wasRaw);input.pause();out.write('\x1b[0m\x1b[?25h\x1b[?1049l');pet.dispose();
 }
}
