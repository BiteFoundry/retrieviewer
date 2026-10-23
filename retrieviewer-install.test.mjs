import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,readdir,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join,dirname,delimiter} from 'node:path';
import {parse} from 'jsonc-parser';import {createInstaller,AGENTS,probeCommand} from './retrieviewer-install.mjs';
const fixture=async(extra={})=>{
 const home=await mkdtemp(join(tmpdir(),'retrieviewer-installer-')),stateDir=join(home,'pet-state'),env={XDG_CONFIG_HOME:join(home,'config')};
 const opts={home,stateDir,env,probe:async c=>c==='opencode'?{executable:'fixture-opencode',version:'2.1.2'}:null,...extra};
 return {home,stateDir,config:join(env.XDG_CONFIG_HOME,'opencode','cli.json'),opts,installer:createInstaller(opts)};
};
const put=async(path,text)=>{await mkdir(dirname(path),{recursive:true});await writeFile(path,text);};
test('registry includes requested agents; unsupported enable and plan perform no writes',async()=>{
 const f=await fixture();for(const id of ['codex','claude','cursor-agent','grok','antigravity','opencode','pi'])assert.ok(AGENTS.some(a=>a.id===id));
 const plan=await f.installer.plan('codex');assert.equal(plan.supported,false);
 await assert.rejects(f.installer.enable('codex',{confirm:true}));assert.deepEqual(await readdir(f.home),[]);
 await assert.rejects(f.installer.enable('opencode'),/confirmation/);assert.deepEqual(await readdir(f.home),[]);
 const supported=await f.installer.plan('opencode');assert.equal(supported.supported,true);assert.deepEqual(await readdir(f.home),[]);
});
test('JSONC comments preserved, enable idempotent, disable keeps registration, disconnect preserves later edits',async()=>{
 const f=await fixture();const original='{// top-level comment\n "keep": 9,\n "plugins": [\n // other plugin comment\n "other-plugin", // inline keep\n ],\n}\n';
 await put(f.config,original);const plan=await f.installer.plan('opencode');
 const result=await f.installer.enable('opencode',{confirm:true});assert.equal(result.rendering,false);assert.equal(await readFile(result.backupPath,'utf8'),original);
 let text=await readFile(f.config,'utf8');for(const comment of ['top-level comment','other plugin comment','inline keep'])assert.ok(text.includes(comment));
 assert.deepEqual(parse(text).plugins,['other-plugin',plan.pluginUrl]);
 await f.installer.enable('opencode',{confirm:true});assert.equal(await readFile(f.config,'utf8'),text);
 let row=await f.installer.status('opencode');assert.equal(row.enabled,true);assert.equal(row.connected,true);assert.equal(row.runtimeRecent,false);
 await f.installer.disable('opencode');assert.equal(await readFile(f.config,'utf8'),text);assert.equal((await f.installer.status('opencode')).enabled,false);
 // Simulate a later user edit. Disconnect must not restore the full old backup.
 text=text.replace('"keep": 9','"keep": 42');await writeFile(f.config,text);
 await assert.rejects(f.installer.disconnect('opencode'),/confirmation/);
 await f.installer.disconnect('opencode',{confirm:true});text=await readFile(f.config,'utf8');assert.equal(parse(text).keep,42);assert.deepEqual(parse(text).plugins,['other-plugin']);assert.ok(text.includes('other plugin comment'));
});
test('preexisting matching plugin stays user-owned and malformed configs are never replaced',async()=>{
 const f=await fixture(),plan=await f.installer.plan('opencode');await put(f.config,JSON.stringify({plugins:[plan.pluginUrl],keep:1}));
 await f.installer.enable('opencode',{confirm:true});await f.installer.disconnect('opencode',{confirm:true});assert.deepEqual(parse(await readFile(f.config,'utf8')).plugins,[plan.pluginUrl]);
 for(const broken of ['{broken','[]','{"plugins":{}}']){await writeFile(f.config,broken);await assert.rejects(f.installer.enable('opencode',{confirm:true}));assert.equal(await readFile(f.config,'utf8'),broken);}
});
test('concurrent config changes detected before writes and cannot be rolled back over user edits',async()=>{
 const f=await fixture();await put(f.config,'{"plugins":[]}');
 const installer=createInstaller({...f.opts,beforeCommit:()=>writeFile(f.config,'{"user":"edited"}')});
 await assert.rejects(installer.enable('opencode',{confirm:true}),/concurrently/);assert.equal(await readFile(f.config,'utf8'),'{"user":"edited"}');
 await assert.rejects(readFile(join(f.stateDir,'settings.json')),{code:'ENOENT'});
});
test('version gates and active inline overrides block enable without writes',async()=>{
 const f=await fixture({probe:async()=>({executable:'fixture',version:'2.2.0'})});assert.equal((await f.installer.plan('opencode')).supported,false);assert.deepEqual(await readdir(f.home),[]);
 const g=await fixture();const other=createInstaller({...g.opts,env:{...g.opts.env,OPENCODE_CLI_CONFIG_CONTENT:'{}'}});assert.equal((await other.plan('opencode')).supported,false);assert.deepEqual(await readdir(g.home),[]);
});
test('symlink config directory refused without changing target, retained test artifacts',async()=>{
 const f=await fixture(),target=join(f.home,'target');await mkdir(target);await mkdir(dirname(f.config),{recursive:true});
 const link=join(f.home,'linked');await symlink(target,link,process.platform==='win32'?'junction':'dir');
 const bad=createInstaller({...f.opts,env:{XDG_CONFIG_HOME:link}});await assert.rejects(bad.plan('opencode'),/symlink\/junction/);assert.deepEqual(await readdir(target),[]);
});
test('fresh native runtime receipt is not a human visual approval and stale receipts are not live',async()=>{
 const f=await fixture();await f.installer.enable('opencode',{confirm:true});
 const path=join(f.stateDir,'runtime-opencode.json'),body={version:1,agent:'opencode',hostVersion:'2.1.2',phase:'rendering',frames:1,pid:process.pid,updatedAt:new Date().toISOString()};
 await writeFile(path,JSON.stringify(body));let row=await f.installer.doctor('opencode');assert.equal(row.checks.frameProducedRecently,true);assert.equal(row.checks.humanVisualApproval,false);
 body.updatedAt='2000-01-01T00:00:00Z';await writeFile(path,JSON.stringify(body));row=await f.installer.status('opencode');assert.equal(row.runtimeRecent,false);
});
test('failed settings commit rolls back only our unchanged configuration write',async()=>{
 const f=await fixture();const original='{"plugins":["keep"],"later":1}';await put(f.config,original);
 const installer=createInstaller({...f.opts,beforeCommit:()=>mkdir(join(f.stateDir,'settings.json'))});
 await assert.rejects(installer.enable('opencode',{confirm:true}));assert.equal(await readFile(f.config,'utf8'),original);
});
test('Windows npm-style PowerShell version probe closes stdin instead of waiting on pipeline input',async t=>{
 if(process.platform!=='win32'){t.skip('Windows-specific PowerShell shim regression');return;}
 const root=await mkdtemp(join(tmpdir(),'retrieviewer-probe-'));
 await writeFile(join(root,'rv-version-fixture.ps1'),'if ($MyInvocation.ExpectingInput) { $input | Out-Null }; Write-Output "fixture 2.1.2"\n');
 const result=await probeCommand('rv-version-fixture',{env:{...process.env,PATH:root+delimiter+process.env.PATH}});
 assert.equal(result.version,'2.1.2');
});
