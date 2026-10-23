import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readFile,mkdir,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {getConfigPaths,readSettings,readAgentSettings,setAgentEnabled,writeRuntimeReceipt} from './retrieviewer-config.mjs';
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
