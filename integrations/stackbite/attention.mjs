// Narrow projection of `stackbite agent seats --output json`, not terminal text.
// Uses StackBite's own binding validation; never reads its credential files.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {stat} from 'node:fs/promises';
import {join,delimiter} from 'node:path';
import {validateAttentionSnapshot} from '../../retrieviewer-attention.mjs';
const run=promisify(execFile);
const execute=(command,args,options)=>{const pending=run(command,args,options);pending.child?.stdin?.end();return pending;};
const identifier=value=>typeof value==='string'&&/^[a-zA-Z0-9_.:-]{1,128}$/.test(value);

// Match npm's Windows PowerShell launcher without shell strings or execution-
// policy changes. Like the installer probe, close stdin so npm sees no pipeline.
export async function resolveStackBiteCommand({env=process.env,platform=process.platform}={}){
 if(platform==='win32')for(const directory of (env.PATH??env.Path??'').split(delimiter).filter(Boolean)){
  for(const extension of ['.exe','.ps1']){
   const path=join(directory,'stackbite'+extension);
   if(!(await stat(path).catch(()=>null))?.isFile())continue;
   return extension==='.exe'?{command:path,prefix:[]}:{command:'powershell.exe',prefix:['-NoProfile','-NonInteractive','-File',path]};
  }
 }
 return {command:'stackbite',prefix:[]};
}

export function stackBiteBinding(env=process.env){
 if(!identifier(env.STACKBITE_ROOM_ID)||!identifier(env.STACKBITE_SEAT_KEY)||!identifier(env.STACKBITE_SESSION_GENERATION)||!env.STACKBITE_STATE_DIR||!env.STACKBITE_ROOM_BRIDGE_URL)throw Error('Start desktop --watch stackbite inside a live StackBite Seat. No Room binding was found.');
 return {roomId:env.STACKBITE_ROOM_ID};
}
export function projectStackBiteSeats(value,{roomId}={}){
 if(!identifier(roomId)||value?.room_id!==roomId||!Array.isArray(value.seats)||value.seats.length>256)throw Error('Invalid or mismatched StackBite Room snapshot');
 const items=[];
 for(const seat of value.seats){
  if(!seat||typeof seat!=='object')throw Error('Invalid StackBite Seat');
  if(seat.is_alive!==true||!identifier(seat.seat_key)||!identifier(seat.generation))continue;
  const status=seat.seat_status;
  if(status!==undefined){
   // The current public projection outranks legacy fields. Never revive an
   // unknown/resolved/foreign projection from a stale legacy flag.
   if(status?.schema_version!==1||status.generation!==seat.generation||status.phase!=='needs_input'||status.input_kind==='onboarding')continue;
   const turnId=Number.isSafeInteger(status.turn_id)&&status.turn_id>0?status.turn_id:null;
   const requestId=identifier(status.input_request_id)?status.input_request_id:undefined;
   if(turnId===null&&requestId===undefined)continue;
   items.push({id:seat.seat_key,generation:seat.generation,turnId,...requestId===undefined?{}:{requestId},kind:status.input_kind==='approval'?'approval':'input',label:seat.role_title});
  }else{
   // Older explicit lifecycle facts are accepted only with an exact turn.
   if(!['awaiting_user','blocked'].includes(seat.lifecycle_state)||!Number.isSafeInteger(seat.turn_id)||seat.turn_id<1)continue;
   items.push({id:seat.seat_key,generation:seat.generation,turnId:seat.turn_id,kind:seat.provider_permission_pending===true||seat.input_kind==='approval'?'approval':'input',label:seat.role_title});
  }
 }
 return validateAttentionSnapshot({source:'stackbite',scope:roomId,items});
}
export function createStackBiteSource({env=process.env,exec=execute,resolveCommand=()=>resolveStackBiteCommand({env})}={}){
 const binding=stackBiteBinding(env);
 const childEnv={...env};delete childEnv.OPENROUTER_API_KEY;
 return {
  async readSnapshot({signal}={}){
   // Fixed argv, no shell, no input/click/report/approval command. The CLI checks
   // that the inherited caller Seat/generation is still live on every read.
   const {command,prefix}=await resolveCommand();
   const {stdout}=await exec(command,[...prefix,'agent','seats','--output','json'],{env:childEnv,signal,encoding:'utf8',windowsHide:true,timeout:4000,maxBuffer:262144});
   return projectStackBiteSeats(JSON.parse(stdout),binding);
  },
 };
}
