import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStackBiteSource,resolveStackBiteCommand} from './integrations/stackbite/attention.mjs';
const binding={STACKBITE_ROOM_ID:'room-1',STACKBITE_SEAT_KEY:'caller',STACKBITE_SESSION_GENERATION:'g1',STACKBITE_STATE_DIR:'fixture',STACKBITE_ROOM_BRIDGE_URL:'http://127.0.0.1:1'};
test('Windows command resolution uses literal paths and read-only argv, and prefers the native executable',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'retrieviewer-shim spaces-$-'));
 try{
  const shim=join(dir,'stackbite.ps1');await writeFile(shim,'# owned test fixture');
  const resolveCommand=()=>resolveStackBiteCommand({platform:'win32',env:{PATH:dir}});
  assert.deepEqual(await resolveCommand(),{command:'powershell.exe',prefix:['-NoProfile','-NonInteractive','-File',shim]});
  let calls=0;const source=createStackBiteSource({env:{...binding,OPENROUTER_API_KEY:'fixture'},resolveCommand,exec:async(command,args,options)=>{
   calls++;assert.equal(command,'powershell.exe');assert.deepEqual(args,['-NoProfile','-NonInteractive','-File',shim,'agent','seats','--output','json']);assert.equal(options.shell,undefined);assert.equal(options.env.OPENROUTER_API_KEY,undefined);return {stdout:'{"room_id":"room-1","seats":[]}'};
  }});
  assert.equal(calls,0);await source.readSnapshot();assert.equal(calls,1);
  await writeFile(join(dir,'stackbite.exe'),'fixture');assert.deepEqual(await resolveCommand(),{command:join(dir,'stackbite.exe'),prefix:[]});
  assert.deepEqual(await resolveStackBiteCommand({platform:'linux',env:{PATH:dir}}),{command:'stackbite',prefix:[]});
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('a Windows npm-style PowerShell shim sees EOF on stdin and returns a bounded real snapshot',{skip:process.platform!=='win32'},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'retrieviewer-shim actual-$-'));
 try{
  await writeFile(join(dir,'stackbite.ps1'),`$text=[Console]::In.ReadToEnd()
if($text.Length -ne 0){exit 8}
if(($args -join ',') -ne 'agent,seats,--output,json'){exit 9}
'{"room_id":"room-1","seats":[]}'
`);
  const source=createStackBiteSource({env:{...process.env,...binding},resolveCommand:()=>resolveStackBiteCommand({platform:'win32',env:{PATH:dir}})});
  assert.deepEqual((await source.readSnapshot()).items,[]);
 }finally{await rm(dir,{recursive:true,force:true});}
});
