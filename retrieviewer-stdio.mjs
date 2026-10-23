#!/usr/bin/env node
// Explicit language-neutral host bridge. Stdout is JSONL only; no autonomous
// timers or terminal ownership. Close stdin or send dispose to release the pet.
import {createPet} from './retrieviewer.mjs';
import {createInterface} from 'node:readline';
import {once} from 'node:events';

let pet,lines;
const stop=()=>lines?.close();
const send=async value=>{if(!process.stdout.write(JSON.stringify(value)+'\n'))await once(process.stdout,'drain');};
try{
 pet=await createPet();
 lines=createInterface({input:process.stdin,crlfDelay:Infinity});
 process.on('SIGINT',stop);process.on('SIGTERM',stop);
 await send({event:'ready',protocol:1});
 for await(const line of lines){
  if(!line.trim())continue;
  let id=null;
  try{
   const request=JSON.parse(line);
   if(!request||typeof request!=='object'||Array.isArray(request))throw TypeError('Expected a request object');
   if(request.id!==undefined&&request.id!==null&&typeof request.id!=='string'&&typeof request.id!=='number')throw TypeError('id must be a string, number or null');
   id=request.id??null;
   if(request.op==='frame'||request.op==='tick'){
    // One round trip per host frame; existing step + frame stays compatible.
    if(request.op==='tick')pet.step(request.dt);
    const {text,columns,rows,report,artProfile}=pet.frame(request);
    await send({id,ok:true,text,columns,rows,report,artProfile});
   }else if(request.op==='step')await send({id,ok:true,steps:pet.step(request.dt)});
   else if(request.op==='interact')await send({id,ok:true,accepted:pet.interact(request.kind)});
   else if(request.op==='dispose'){pet.dispose();await send({id,ok:true});break;}
   else throw TypeError('Unknown op: use frame, tick, step, interact or dispose');
  }catch(error){await send({id,ok:false,error:error.message});}
 }
}catch(error){process.stderr.write('Retrieviewer bridge: '+error.message+'\n');process.exitCode=1;}
finally{
 lines?.close();pet?.dispose();process.off('SIGINT',stop);process.off('SIGTERM',stop);
}
