import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readFile,mkdir,writeFile,rename,lstat} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {spawn} from 'node:child_process';import {once} from 'node:events';import {hostname} from 'node:os';
import {getConfigPaths,readSettings,readAgentSettings,setAgentEnabled,writeRuntimeReceipt,withSettingsLock} from './retrieviewer-config.mjs';
test('runtime settings default disabled, preserve other data and write bounded receipt',async()=>{
 const stateDir=await mkdtemp(join(tmpdir(),'retrieviewer-settings-')),opts={stateDir};
 assert.deepEqual(await readAgentSettings('opencode',opts),{enabled:false});
 await assert.rejects(setAgentEnabled('opencode',true,opts),/not connected/);
 const paths=getConfigPaths(opts);await writeFile(paths.settings,JSON.stringify({version:1,extra:'keep',agents:{opencode:{enabled:false,connected:true},other:{enabled:true}}}));
 await setAgentEnabled('opencode',true,opts);assert.equal((await readAgentSettings('opencode',opts)).enabled,true);
 assert.equal((await readSettings(opts)).extra,'keep');assert.equal((await readSettings(opts)).agents.other.enabled,true);
 await writeRuntimeReceipt('opencode',{hostVersion:'2.1.2',phase:'rendering',firstFrameAt:'2026-10-23T00:00:00Z',columns:80,rows:12,frames:3,unwanted:'never copy arbitrary data'},opts);
 const receipt=JSON.parse(await readFile(join(stateDir,'runtime-opencode.json')));assert.equal(receipt.frames,3);assert.equal(receipt.unwanted,undefined);
 await assert.rejects(readAgentSettings('../bad',opts),/Invalid agent/);
 await writeFile(paths.lock,'busy');await assert.rejects(setAgentEnabled('opencode',false,opts),/locked/);
});

test('settings lock records its owner, rejects concurrent writes and releases on errors',async()=>{
 const stateDir=await mkdtemp(join(tmpdir(),'retrieviewer-lock-owner-')),options={stateDir},paths=getConfigPaths(options);
 await assert.rejects(withSettingsLock(async()=>{
  const owner=JSON.parse(await readFile(paths.lock,'utf8'));
  assert.equal(owner.pid,process.pid);assert.equal(owner.host,hostname());assert.match(owner.token,/^[a-f0-9-]{36}$/);assert.ok(Date.parse(owner.startedAt));
  await assert.rejects(withSettingsLock(()=>assert.fail('must not acquire'),options),error=>error.message.includes('owner PID '+process.pid)&&error.message.includes(paths.lock)&&error.message.includes('INSTALLING.md#recovering'));
  throw Error('operation failed');
 },options),/operation failed/);
 await assert.rejects(lstat(paths.lock),{code:'ENOENT'});
 await withSettingsLock(async()=>{
  await rename(paths.lock,paths.lock+'.owned');await writeFile(paths.lock,JSON.stringify({token:'replacement-lock'}));
 },options);
 assert.equal(JSON.parse(await readFile(paths.lock,'utf8')).token,'replacement-lock','never unlink a replacement');
});

test('a killed settings writer leaves diagnosable lock; offline recovery preserves settings',async t=>{
 const stateDir=await mkdtemp(join(tmpdir(),'retrieviewer-lock-crash-')),options={stateDir},paths=getConfigPaths(options);
 const settings={version:1,extra:'preserve',agents:{opencode:{enabled:true,connected:true}}};await writeFile(paths.settings,JSON.stringify(settings));
 const source=`import {withSettingsLock} from ${JSON.stringify(new URL('./retrieviewer-config.mjs',import.meta.url).href)};await withSettingsLock(async()=>{console.log('locked');setInterval(()=>{},1000);await new Promise(()=>{});},{stateDir:process.argv[1]});`;
 const child=spawn(process.execPath,['--input-type=module','-e',source,stateDir],{windowsHide:true,stdio:['ignore','pipe','pipe']});
 const exit=once(child,'exit');t.after(async()=>{if(child.exitCode===null&&child.signalCode===null)child.kill();await exit;});
 await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('lock fixture timed out')),5000);child.stdout.once('data',()=>{clearTimeout(timeout);resolve();});child.once('error',reject);});
 const owner=JSON.parse(await readFile(paths.lock,'utf8'));assert.equal(owner.pid,child.pid);
 child.kill('SIGKILL');await exit;
 await assert.rejects(setAgentEnabled('opencode',false,options),/settings are locked/);
 assert.deepEqual(await readSettings(options),settings);
 // Deliberately offline: there are no remaining writers to race this manual move.
 await rename(paths.lock,paths.lock+'.recovered');await setAgentEnabled('opencode',false,options);
 assert.equal((await readSettings(options)).extra,'preserve');assert.equal((await readAgentSettings('opencode',options)).enabled,false);
 assert.deepEqual(JSON.parse(await readFile(paths.lock+'.recovered','utf8')),owner);
});
