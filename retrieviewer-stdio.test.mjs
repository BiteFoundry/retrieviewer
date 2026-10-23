import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';

const bridge=fileURLToPath(new URL('retrieviewer-stdio.mjs',import.meta.url));
test('language-neutral bridge isolates stdout, echoes IDs, recovers errors and disposes',()=>{
 const requests=[
  '{broken',
  JSON.stringify({id:1,op:'step',dt:1/30}),
  JSON.stringify({id:'toy',op:'interact',kind:'ball'}),
  JSON.stringify({id:3,op:'frame',columns:32,rows:10}),
  JSON.stringify({id:4,op:'frame',columns:0,rows:10}),
  JSON.stringify({id:5,op:'dispose'}),
 ];
 const output=execFileSync(process.execPath,[bridge],{cwd:tmpdir(),input:requests.join('\n')+'\n',encoding:'utf8',timeout:20000});
 const messages=output.trim().split('\n').map(line=>JSON.parse(line));
 assert.equal(messages.length,7);assert.deepEqual(messages[0],{event:'ready',protocol:1});
 assert.equal(messages[1].ok,false);assert.equal(messages[1].id,null);
 assert.deepEqual(messages[2],{id:1,ok:true,steps:2});
 assert.deepEqual(messages[3],{id:'toy',ok:true,accepted:true});
 const frame=messages[4];assert.equal(frame.id,3);assert.equal(frame.ok,true);
 assert.equal(frame.text.split('\n').length,10);assert.ok(frame.text.split('\n').every(line=>line.length===32));
 assert.ok(!output.includes('\x1b'));assert.equal(frame.report.interaction,'ball');assert.equal(frame.artProfile,'q5');
 assert.equal(messages[5].id,4);assert.equal(messages[5].ok,false);
 assert.deepEqual(messages[6],{id:5,ok:true});
});

test('bridge tick returns a default q5 frame in one round trip',()=>{
 const output=execFileSync(process.execPath,[bridge],{input:JSON.stringify({op:'tick',dt:1/30,columns:24,rows:8})+'\n',encoding:'utf8',timeout:20000});
 const messages=output.trim().split('\n').map(line=>JSON.parse(line));
 assert.equal(messages.length,2);assert.equal(messages[1].artProfile,'q5');
 assert.equal(messages[1].text.split('\n').length,8);assert.equal(messages[1].ok,true);
});

test('bridge exits cleanly and releases the pet on stdin EOF without dispose',()=>{
 const output=execFileSync(process.execPath,[bridge],{input:'',encoding:'utf8',timeout:20000});
 assert.deepEqual(JSON.parse(output.trim()),{event:'ready',protocol:1});
});
