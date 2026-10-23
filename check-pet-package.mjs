// Build a real distributable, then install/run OUTSIDE this project. No symlinks,
// lifecycle scripts, registry publish, or network; temp evidence is retained.
import {execFileSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const root=fileURLToPath(new URL('.',import.meta.url)),npm=process.env.npm_execpath;
if(!npm)throw Error('Run via npm run test:package (uses the current npm CLI).');
// Never overwrite the immutable first-release artifact with an unpublished build
// that happens to retain the same local development version.
const dist=join(root,'dist');mkdirSync(dist,{recursive:true});
const output=mkdtempSync(join(dist,'package-check-'));
const runNpm=(args,cwd)=>execFileSync(process.execPath,[npm,...args],{cwd,encoding:'utf8',timeout:120000,maxBuffer:2e6});
const [packed]=JSON.parse(runNpm(['pack','--ignore-scripts','--json','--pack-destination',output],root));
const paths=packed.files.map(f=>f.path);
assert.equal(paths.filter(p=>p.endsWith('-q5.bin.gz')).length,9);
assert.equal(paths.some(p=>p.endsWith('-compact.bin.gz')),false);
assert.equal(paths.some(p=>/^(references|worker-packets|dist)\//.test(p)),false);
const archive=resolve(output,packed.filename),consumer=mkdtempSync(join(tmpdir(),'retrieviewer-consumer-'));
writeFileSync(join(consumer,'package.json'),JSON.stringify({name:'pet-consumer-check',private:true,type:'module'}));
runNpm(['install','--offline','--ignore-scripts','--no-audit','--no-fund','--package-lock=false',archive],consumer);
const probe=`
import assert from 'node:assert/strict';
import {createPet,getPetAssetFiles,DEFAULT_ART_PROFILE} from '@bitefoundry/retrieviewer';
import {createPetPlugin} from '@bitefoundry/retrieviewer/plugin';
assert.equal(DEFAULT_ART_PROFILE,'q5');assert.equal(getPetAssetFiles().length,19);
const a=await createPet({seed:731});let count=0,clears=0,frame;
const plugin=await createPetPlugin({host:{getSize:()=>({columns:40,rows:12}),render:f=>{frame=f;count++;},clear:()=>clears++},petOptions:{seed:731}});
try {
 plugin.tick(1/30);assert.equal(frame.artProfile,'q5');assert.equal(count,1);
 assert.equal(frame.text.split('\\n').length,12);assert.ok(frame.text.split('\\n').every(l=>l.length===40));
 assert.equal(plugin.interact('ball'),true);plugin.tick(1/30);
 assert.equal(frame.report.interaction,'ball');
 plugin.start();assert.equal(plugin.running,true);plugin.pause();assert.equal(plugin.running,false);
} finally {plugin.dispose();a.dispose();}
assert.equal(clears,1);assert.equal(plugin.disposed,true);
// The optional original must fail clearly, not silently change to q5.
await assert.rejects(createPet({artProfile:'original'}),/Original art is optional/);
console.log(JSON.stringify({profile:frame.artProfile,frames:count,disposed:plugin.disposed}));
`;
const result=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',probe],{cwd:consumer,encoding:'utf8',timeout:30000}).trim());
const installed=join(consumer,'node_modules','@bitefoundry','retrieviewer');
const installedPackage=JSON.parse(readFileSync(join(installed,'package.json')));
assert.equal(installedPackage.name,'@bitefoundry/retrieviewer');
assert.equal(installedPackage.version,JSON.parse(readFileSync(join(root,'package.json'))).version);
assert.equal(installedPackage.exports['./tui'],'./integrations/opencode/tui.tsx');
assert.ok(paths.includes('LICENSE-CODE')&&paths.includes('ASSETS-LICENSE.md'));
assert.ok(paths.includes('TRADEMARKS.md')&&paths.includes('THIRD-PARTY-NOTICES.md'));
assert.ok(paths.includes('ATTRIBUTION.md')&&paths.includes('ASSET-PROVENANCE.md'));
// Prove the tested copy is exactly the current candidate, not a link or stale pack.
for(const file of packed.files)assert.deepEqual(readFileSync(join(installed,file.path)),readFileSync(join(root,file.path)),file.path);
const cliEnv={...process.env,RETRIEVIEWER_HOME:join(consumer,'pet-state'),XDG_CONFIG_HOME:join(consumer,'agent-config')};
for(const key of Object.keys(cliEnv))if(key.startsWith('OPENCODE_'))delete cliEnv[key];
const help=execFileSync(process.execPath,[join(installed,'retrieviewer-cli.mjs'),'--help'],{cwd:consumer,env:cliEnv,encoding:'utf8',timeout:10000});
assert.match(help,/retrieviewer enable/);assert.doesNotMatch(help,/[\u2801-\u28ff]/u);
assert.match(help,/retrieviewer desktop/);assert.match(help,/desktop-remove --yes/);
const desktopStatus=JSON.parse(execFileSync(process.execPath,[join(installed,'retrieviewer-cli.mjs'),'desktop-status','--json'],{cwd:consumer,env:cliEnv,encoding:'utf8',timeout:10000}));
assert.deepEqual(desktopStatus,{running:false});
for(const file of ['integrations/windows-overlay/Overlay.cs','integrations/windows-overlay/desktop.mjs','integrations/windows-overlay/worker.mjs','integrations/windows-overlay/protocol.mjs','WINDOWS-COMPANION.md'])assert.ok(paths.includes(file));
const installProbe=`
import assert from 'node:assert/strict';
import {createInstaller} from ${JSON.stringify(pathToFileURL(join(installed,'retrieviewer-install.mjs')).href)};
const installer=createInstaller({home:process.cwd(),probe:async command=>command==='opencode'?{executable:'fixture-opencode',version:'2.1.2'}:null});
const plan=await installer.plan('opencode');assert.equal(plan.supported,true);
await installer.enable('opencode',{confirm:true});
let row=await installer.status('opencode');assert.equal(row.enabled,true);assert.equal(row.connected,true);
await installer.disable('opencode');row=await installer.status('opencode');assert.equal(row.enabled,false);assert.equal(row.connected,true);
await installer.disconnect('opencode',{confirm:true});row=await installer.status('opencode');assert.equal(row.connected,false);
console.log('installer lifecycle passed in isolated consumer');`;
execFileSync(process.execPath,['--input-type=module','-e',installProbe],{cwd:consumer,env:cliEnv,encoding:'utf8',timeout:30000});
for(const example of ['embed.mjs','plugin.mjs','live.mjs']){
 const text=execFileSync(process.execPath,[join(installed,'examples',example)],{cwd:consumer,encoding:'utf8',timeout:30000});
 assert.ok(text.includes('⠿')||/[\u2801-\u28ff]/u.test(text),example+' must render actual dots');
 assert.equal(text.includes('\x1b'),false);
}
const bridge=execFileSync(process.execPath,[join(installed,'retrieviewer-stdio.mjs')],{cwd:consumer,input:'{"op":"tick","dt":0.0333333333333,"columns":24,"rows":8}\n',encoding:'utf8',timeout:30000}).trim().split('\n').map(JSON.parse);
assert.equal(bridge[1].artProfile,'q5');assert.equal(bridge[1].ok,true);
let python='unavailable';
try{execFileSync('python',['--version'],{encoding:'utf8',timeout:5000});python='available';}catch{}
if(python==='available'){
 const text=execFileSync('python',[join(installed,'examples','bridge.py')],{cwd:consumer,encoding:'utf8',timeout:30000});
 assert.equal(text.trimEnd().split('\n').length,14);assert.match(text,/[\u2801-\u28ff]/u);
 python='passed installed example';
}
const sha256=createHash('sha256').update(readFileSync(archive)).digest('hex');
const report={version:JSON.parse(readFileSync(join(installed,'package.json'))).version,archive,sha256,size:packed.size,unpackedSize:packed.unpackedSize,consumer,offlineInstall:true,exactInstalledFiles:true,defaultAssets:9,originalAssetsBundled:false,result,examples:['embed','plugin','live'],bridge:true,python,installerLifecycle:true};
writeFileSync(join(output,'package-check.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
