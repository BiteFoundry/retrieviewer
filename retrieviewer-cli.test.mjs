import test from 'node:test';import assert from 'node:assert/strict';
import {parseArguments,runCli} from './retrieviewer-cli.mjs';
const io=()=>{let out='',err='';return {input:{isTTY:false},output:{isTTY:false,write:t=>{out+=t;}},error:{write:t=>{err+=t;}},get out(){return out;},get err(){return err;}};};
const backend=()=>({
 writes:0,async list(){return [{id:'opencode',label:'OpenCode',detected:true,version:'2.1.2',enabled:false,connected:false,renderer:{status:'available'}}];},
 async plan(agent){return {agent,supported:agent==='opencode',reason:'test fixture',changes:[{path:'fixture/cli.json',description:'register renderer'}]};},
 async enable(agent,{confirm}){assert.equal(confirm,true);this.writes++;return {agent,registered:true,rendering:false};},
 async disconnect(agent,{confirm}){assert.equal(confirm,true);this.writes++;return {agent,disconnected:true};},
 async disable(agent){this.writes++;return {agent,enabled:false};},async status(){return this.list();},async doctor(){return {rendering:false};},
});
test('CLI strict parse catches unknown commands/options and IDs',()=>{
 assert.deepEqual(parseArguments(['enable','--agent','opencode','--yes']),{command:'enable',options:{agent:'opencode',yes:true}});
 for(const args of [['wat'],['enable','--agent'],['enable','--agent','wat'],['enable','--oops'],['enable','--agent','opencode','--agent','codex'],['disable','--agent','opencode','--dry-run'],['status','--yes']])assert.throws(()=>parseArguments(args));
});
test('help/status/dry-run are read-only, non-TTY refuses implicit changes',async()=>{
 const installer=backend(),streams=io();
 assert.equal(await runCli(['help'],{...streams,installer}),0);assert.match(streams.out,/retrieviewer enable/);
 await runCli(['status','--json'],{...streams,installer});
 await runCli(['enable','--agent','opencode','--dry-run'],{...streams,installer});assert.equal(installer.writes,0);
 await assert.rejects(runCli(['enable','--agent','opencode'],{...streams,installer}),/--yes/);
 await assert.rejects(runCli(['enable'],{...streams,installer}),/--agent/);assert.equal(installer.writes,0);
});
test('unsupported is not success; explicit supported enable and disable/disconnect work',async()=>{
 const installer=backend(),streams=io();
 assert.equal(await runCli(['enable','--agent','codex','--yes'],{...streams,installer}),2);assert.equal(installer.writes,0);
 assert.equal(await runCli(['enable','--agent','opencode','--yes'],{...streams,installer}),0);assert.equal(installer.writes,1);
 await runCli(['disable','--agent','opencode'],{...streams,installer});assert.equal(installer.writes,2);
 // Disconnect remains available after a formerly supported agent version changes.
 installer.plan=async agent=>({agent,supported:false,changes:[]});
 await runCli(['disconnect','--agent','opencode','--yes'],{...streams,installer});assert.equal(installer.writes,3);
});
