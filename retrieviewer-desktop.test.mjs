import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,lstat,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {cropFrame,viewportOf,createFramePump} from './integrations/windows-overlay/protocol.mjs';
import {desktopPaths,desktopStatus,stopDesktop,cleanDesktop,requestSession} from './integrations/windows-overlay/desktop.mjs';
import {parseArguments,runCli} from './retrieviewer-cli.mjs';
const viewport=(revision=1,visible=true)=>({type:'viewport',revision,visible,columns:4,rows:2,cellWidth:8,cellHeight:16});

test('identical frames skip native repaint without freezing simulation or interactions',()=>{
 let now=0,text='⠁',time=0;const sent=[];
 const pet={step:dt=>time+=dt,frame:()=>({columns:1,rows:1,text}),interact:()=>true,dispose(){}};
 const pump=createFramePump({pet,now:()=>now,send:f=>sent.push(f)});
 const view={...viewport(),columns:1,rows:1};
 pump.viewport(view);assert.equal(pump.tick(),true);pump.ack();
 for(let i=0;i<30;i++){now+=1000/30;assert.equal(pump.tick(),false);}
 assert.ok(Math.abs(time-1)<1e-9);assert.equal(sent.length,1);
 text='⠃';assert.equal(pump.tick(),true);pump.ack();assert.equal(sent.length,2);
 pump.interact('ball');assert.equal(pump.tick(),true);pump.ack();
 pump.pause(true);assert.equal(pump.tick(),false);pump.pause(false);assert.equal(pump.tick(),true);pump.ack();
 pump.viewport({...view,revision:2});assert.equal(pump.tick(),true);pump.ack();
 assert.equal(sent.at(-1).revision,2);
 pump.dispose();
});
test('desktop grid validation and exact, transparent crop',()=>{
 assert.equal(viewportOf(viewport(1,false)),null);assert.equal(viewportOf(viewport()).columns,4);
 for(const m of [{...viewport(),columns:500000}, {...viewport(),cellHeight:8},{...viewport(),revision:0}])assert.throws(()=>viewportOf(m));
 const frame={columns:4,rows:2,text:'\u2800\u2801\u2800\u2800\n\u2800\u2800\u2880\u2800'};
 assert.deepEqual(cropFrame(frame,3),{type:'frame',revision:3,x:1,y:0,columns:2,rows:2,text:'\u2801\u2800\n\u2800\u2880'});
 assert.equal(cropFrame({columns:1,rows:1,text:'\u2800'},1).columns,0);
 assert.throws(()=>cropFrame({columns:1,rows:1,text:'X'},1));
});
test('one frame in flight, resize ack, hidden/pause stop time, resume has no catch-up',()=>{
 let now=0,disposed=0;const steps=[],sent=[],pet={step:dt=>steps.push(dt),frame:v=>({columns:v.columns,rows:v.rows,text:Array(v.rows).fill('\u2801'.repeat(v.columns)).join('\n')}),interact:k=>k==='ball',dispose:()=>disposed++};
 const pump=createFramePump({pet,send:m=>sent.push(m),now:()=>now});
 assert.equal(pump.tick(),false);pump.viewport(viewport());assert.equal(pump.tick(),true);now+=33;assert.equal(pump.tick(),false);assert.equal(sent.length,1);
 pump.viewport(viewport(2));pump.ack();pump.tick();assert.equal(sent[1].revision,2);assert.equal(steps[1],0);pump.ack();
 pump.viewport(viewport(3,false));now+=90000;assert.equal(pump.tick(),false);pump.viewport(viewport(4));pump.tick();assert.equal(steps.at(-1),0);pump.ack();
 pump.pause(true);assert.equal(pump.tick(),false);pump.pause(false);pump.tick();assert.equal(steps.at(-1),0);
 assert.equal(pump.interact('ball'),true);assert.equal(pump.interact('treat'),false);assert.throws(()=>pump.interact('shell'));
 pump.dispose();pump.dispose();assert.equal(disposed,1);assert.throws(()=>pump.tick());
});
test('desktop CLI is separate, strictly parsed, no agent mutation',async()=>{
 for(const args of [['desktop','--agent','codex'],['desktop-stop','--yes'],['desktop','--original']])assert.throws(()=>parseArguments(args));
 let starts=0,stops=0,cleans=0,out='';const desktop={startDesktop:async()=>({running:++starts>0}),stopDesktop:async()=>({stopped:++stops>0}),desktopStatus:async()=>({running:false}),cleanDesktop:async()=>({removed:++cleans}),removeDesktop:async()=>({removed:++cleans})};
 const io={output:{write:s=>out+=s},desktop,installer:{enable(){throw Error('Must not touch agents');}}};
 await runCli(['desktop'],io);await runCli(['desktop-status','--json'],io);await runCli(['desktop-stop'],io);
 await assert.rejects(runCli(['desktop-clean'],io),/--yes/);await runCli(['desktop-clean','--yes'],io);await assert.rejects(runCli(['desktop-remove'],io),/--yes/);await runCli(['desktop-remove','--yes'],io);assert.equal(starts,1);assert.equal(stops,1);assert.equal(cleans,2);assert.match(out,/running/);
});
test('desktop return style is explicit, strictly validated and forwarded without agent changes',async()=>{
 for(const style of ['auto','brake','trot','run-trot']){
  const options=parseArguments(['desktop','--return-style',style]).options;assert.equal(options['return-style'],style);
  let received;await runCli(['desktop','--ink','gold','--return-style',style],{output:{write(){}},desktop:{startDesktop:async o=>{received=o;return{running:true};}},installer:{enable(){throw Error('No agent changes');}}});
  assert.deepEqual(received,{ink:'gold',returnStyle:style});
 }
 for(const args of [['desktop','--return-style','bad'],['desktop','--return-style'],['desktop','--return-style','auto','--return-style','brake'],['desktop-status','--return-style','brake']])assert.throws(()=>parseArguments(args));
});
test('cache removal is narrow; preserve unknown files, other pet settings, unrecognized session',async()=>{
 const stateDir=await mkdtemp(join(tmpdir(),'retrieviewer-desktop-test-')),options={stateDir};const paths=desktopPaths(options);await mkdir(paths.root,{recursive:true});
 await writeFile(join(stateDir,'settings.json'),'user-owned');await writeFile(join(paths.root,'notes.txt'),'keep');await writeFile(join(paths.root,'overlay-'+ 'a'.repeat(20)+'.exe'),'fixture');
 assert.deepEqual(await desktopStatus(options),{running:false});const clean=await cleanDesktop(options);assert.equal(clean.removed.length,1);assert.equal(await readFile(join(paths.root,'notes.txt'),'utf8'),'keep');assert.equal(await readFile(join(stateDir,'settings.json'),'utf8'),'user-owned');
 assert.deepEqual(await stopDesktop(options),{running:false,stopped:true});
 await writeFile(paths.session,'{"owner":"not-ours"}');await assert.rejects(cleanDesktop(options),/Unrecognized/);assert.equal((await lstat(paths.session)).isFile(),true);
});
test('desktop cache refuses junction/symlink traversal',async()=>{
 const temp=await mkdtemp(join(tmpdir(),'retrieviewer-desktop-link-')),outside=join(temp,'outside'),stateDir=join(temp,'state');await mkdir(outside);await mkdir(stateDir);
 await symlink(outside,join(stateDir,'desktop'),process.platform==='win32'?'junction':'dir');await assert.rejects(cleanDesktop({stateDir}),/symlink/);
});
test('local control authenticates status/stop without executing arbitrary commands',async()=>{
 const pipe=process.platform==='win32'?'\\\\.\\pipe\\retrieviewer-overlay-'+randomUUID():join(tmpdir(),'retrieviewer-'+randomUUID());
 const server=createServer(socket=>{socket.on('error',()=>{});socket.once('data',bytes=>{const m=JSON.parse(bytes);socket.end(JSON.stringify({authenticated:m.token==='test-secret',command:m.command})+'\n');});});
 await new Promise(resolve=>server.listen(pipe,resolve));try{assert.deepEqual(await requestSession({pipe,token:'test-secret'},'status'),{authenticated:true,command:'status'});}finally{await new Promise(resolve=>server.close(resolve));}
});
test('CLI executes through npm-style symlinked paths instead of silently returning',async()=>{
 const temp=await mkdtemp(join(tmpdir(),'retrieviewer-cli-link-')),link=join(temp,'package');
 await symlink(fileURLToPath(new URL('.',import.meta.url)),link,process.platform==='win32'?'junction':'dir');
 const result=spawnSync(process.execPath,[join(link,'retrieviewer-cli.mjs'),'--help'],{encoding:'utf8',timeout:10000});
 assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/retrieviewer desktop/);
});
