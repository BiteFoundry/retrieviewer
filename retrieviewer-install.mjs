// Safe, local native-plugin registration. Basic MCP support is NOT a renderer.
import {homedir} from 'node:os';
import {delimiter,join,resolve,dirname,parse as parsePath} from 'node:path';
import {readFile,lstat,mkdir,open,rename,unlink,access} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {parse,modify,applyEdits} from 'jsonc-parser';
import {getConfigPaths,readSettings,withSettingsLock,writeAtomicJson,setAgentEnabled} from './retrieviewer-config.mjs';

export const AGENTS=Object.freeze([
 ['codex','Codex',['codex']],['claude','Claude Code',['claude']],['cursor-agent','Cursor Agent',['cursor-agent']],
 ['grok','Grok',['grok']],['antigravity','Antigravity',['agy','antigravity']],['opencode','OpenCode',['opencode']],
 ['pi','Pi',['pi']],['gemini','Gemini CLI',['gemini']],['copilot','GitHub Copilot CLI',['copilot']],
 ['aider','Aider',['aider']],['goose','Goose',['goose']],['qwen','Qwen Code',['qwen']],
 ['amp','Amp',['amp']],['droid','Droid',['droid']],['crush','Crush',['crush']],
].map(([id,label,commands])=>Object.freeze({id,label,commands:Object.freeze(commands)})));
const run=promisify(execFile),PLUGIN_URL=new URL('./integrations/opencode/',import.meta.url).href;
const ADAPTER_FILE=fileURLToPath(new URL('./integrations/opencode/tui.tsx',import.meta.url));
const definitions=new Map(AGENTS.map(a=>[a.id,a]));
const definition=id=>{const a=definitions.get(id);if(!a)throw Error('Unknown agent: '+id);return a;};
const processAlive=pid=>{if(!Number.isInteger(pid)||pid<=0||pid>0x7fffffff)return false;try{process.kill(pid,0);return true;}catch{return false;}};
const exists=async path=>{try{await access(path);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
async function safePath(path){
 for(let p=resolve(path);;p=dirname(p)){
  try{if((await lstat(p)).isSymbolicLink())throw Error('Refusing symlink/junction: '+p);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(p===parsePath(p).root)break;
 }
}
async function textFile(path){await safePath(path);try{const s=await readFile(path,'utf8');if(s.length>1024*1024)throw Error('Config exceeds 1 MiB: '+path);return s;}catch(e){if(e.code==='ENOENT')return null;throw e;}}
function documentOf(text){
 if(text===null)return {};
 const errors=[],data=parse(text,errors,{allowTrailingComma:true,disallowComments:false});
 if(errors.length||!data||typeof data!=='object'||Array.isArray(data))throw Error('Malformed/non-object agent JSONC configuration; refusing to overwrite');
 if(data.plugins!==undefined&&!Array.isArray(data.plugins))throw Error('Agent plugins must be an array; refusing to overwrite');
 return data;
}
async function atomicText(path,text){
 await safePath(path);await mkdir(dirname(path),{recursive:true});const temp=path+'.retrieviewer-'+randomUUID()+'.tmp';let owned=false;
 try{const f=await open(temp,'wx',0o600);owned=true;try{await f.writeFile(text);await f.sync();}finally{await f.close();}await rename(temp,path);owned=false;}
 finally{if(owned)await unlink(temp).catch(()=>{});}
}

export async function probeCommand(command,{env=process.env}={}){
 const extensions=process.platform==='win32'?['.exe','.ps1','.cmd','']:[''];
 for(const directory of (env.PATH??env.Path??'').split(delimiter).filter(Boolean))for(const ext of extensions){
  const executable=join(directory,command+ext);if(!await exists(executable))continue;
  // Never interpolate a command in a shell string. .cmd needs a shell, so prefer
  // npm's equivalent PowerShell shim; unsupported shims are detected, not executed.
  if(ext==='.cmd')continue;
  try{
   const binary=ext==='.ps1'?'pwsh.exe':executable;
   const args=ext==='.ps1'?['-NoProfile','-NonInteractive','-File',executable,'--version']:['--version'];
   // npm's PowerShell shims treat an open pipe as pipeline input. Close stdin so
   // --version cannot hang waiting for EOF (spawnSync implicitly did this).
   let pending=run(binary,args,{env,timeout:4000,maxBuffer:8192,windowsHide:true});pending.child?.stdin?.end();
   let output;
   try{output=await pending;}catch(error){
    if(ext!=='.ps1'||error.code!=='ENOENT')throw error;
    pending=run('powershell.exe',args,{env,timeout:4000,maxBuffer:8192,windowsHide:true});pending.child?.stdin?.end();output=await pending;
   }
   const {stdout,stderr}=output;
   return {executable,version:(stdout+' '+stderr).match(/\d+\.\d+\.\d+/)?.[0]??'unknown'};
  }catch{return {executable,version:'unknown'};}
 }
 return null;
}

export function createInstaller({home=homedir(),env=process.env,stateDir=env.RETRIEVIEWER_HOME??join(home,'.config','retrieviewer'),probe,beforeCommit}={}){
 const options={home,env,stateDir},paths=getConfigPaths(options),probeCache=new Map();
 const configPath=join(env.XDG_CONFIG_HOME??join(home,'.config'),'opencode','cli.json');
 const probeOne=command=>{if(!probeCache.has(command))probeCache.set(command,Promise.resolve().then(()=>probe?probe(command):probeCommand(command,{env})));return probeCache.get(command);};
 async function executableFor(agent){for(const cmd of agent.commands){const found=await probeOne(cmd);if(found)return found;}return null;}
 async function inspect(id){
  const def=definition(id),found=await executableFor(def),state=await readSettings(options),saved=state.agents[id];
  let renderer={status:'unsupported',reason:'No native TUI renderer implemented; MCP support alone is insufficient.'};
  if(id==='opencode')renderer=found?.version==='2.1.2'
   ?{status:'available',reason:'Native OpenCode 2.1.2 adapter candidate; registration and runtime evidence are separate.'}
   :{status:'version-unsupported',reason:'Native adapter currently targets OpenCode 2.1.2 exactly.'};
  let connected=false,configError=null;
  if(id==='opencode')try{const data=documentOf(await textFile(saved?.configPath??configPath));connected=data.plugins?.includes(PLUGIN_URL)??false;}catch(e){configError=e.message;}
  let runtime=null;
  try{const raw=await textFile(join(paths.root,'runtime-'+id+'.json'));if(raw)runtime=JSON.parse(raw);}catch(e){runtime={error:e.message};}
  const age=runtime?.updatedAt?Date.now()-Date.parse(runtime.updatedAt):Infinity;
  const recent=runtime?.version===1&&runtime?.agent===id&&runtime?.hostVersion===found?.version&&runtime?.phase==='rendering'&&age>=0&&age<15000&&Number.isFinite(runtime?.frames)&&runtime.frames>0&&processAlive(runtime?.pid);
  return {id,label:def.label,detected:!!found,executable:found?.executable??null,version:found?.version??null,enabled:saved?.enabled===true,connected,renderer,configError,runtime,runtimeRecent:!!recent,visualApproval:false};
 }
 async function plan(id){
  const row=await inspect(id);let supported=row.detected&&row.renderer.status==='available'&&!row.configError;
  let reason=row.configError??(!row.detected?'Agent executable not found.':row.renderer.reason);
  if(supported&&!await exists(ADAPTER_FILE)){supported=false;reason='Native adapter file is missing from the installation.';}
  if(supported&&env.OPENCODE_CLI_CONFIG_CONTENT){supported=false;reason='An inline OpenCode CLI configuration override is active; refuse ambiguous installation.';}
  if(id==='opencode')await safePath(configPath);
  return {agent:id,supported,reason,pluginUrl:id==='opencode'?PLUGIN_URL:null,changes:id==='opencode'?[{path:configPath,description:'Merge the native TUI plugin URL into plugins; preserve JSONC and other entries.'},{path:paths.settings,description:'Record ownership and enabled state.'}]:[]};
 }
 async function backup(path,previous){
  if(previous===null)return null;
  const dir=join(paths.root,'backups');await safePath(dir);await mkdir(dir,{recursive:true,mode:0o700});
  const destination=join(dir,'opencode-cli-'+randomUUID()+'.jsonc');const f=await open(destination,'wx',0o600);
  try{await f.writeFile(previous);await f.sync();}finally{await f.close();}return destination;
 }
 async function transact(previous,next,state,{path=configPath}={}){
  const backupPath=previous!==next?await backup(path,previous):null;
  await beforeCommit?.();
  if(await textFile(path)!==previous)throw Error('Agent configuration changed concurrently; nothing overwritten. Retry after reviewing it.');
  let changed=false;
  try{
   if(previous!==next){await atomicText(path,next);changed=true;}
   await writeAtomicJson(paths.settings,state);
  }catch(error){
   if(changed&&await textFile(path)===next){if(previous===null)await unlink(path);else await atomicText(path,previous);}
   throw error;
  }
  return backupPath;
 }
 async function enable(id,{confirm=false}={}){
  definition(id);if(!confirm)throw Error('Explicit confirmation required before changing agent configuration');
  const proposed=await plan(id);if(!proposed.supported)throw Error(proposed.reason);
  return withSettingsLock(async()=>{
   const state=await readSettings(options),prior=state.agents[id],old=await textFile(configPath),data=documentOf(old),already=data.plugins?.includes(PLUGIN_URL)??false;
   const formattingOptions={insertSpaces:true,tabSize:2,eol:old?.includes('\r\n')?'\r\n':'\n'};
   const next=already?old:applyEdits(old??'{}\n',data.plugins
    ?modify(old,['plugins',data.plugins.length],PLUGIN_URL,{formattingOptions,isArrayInsertion:true})
    :modify(old??'{}\n',['plugins'],[PLUGIN_URL],{formattingOptions}));
   // Preserve ownership only for the same exact registration; adoption is not deletion authority.
   const addedByUs=already?!!(prior?.addedByUs&&prior.pluginUrl===PLUGIN_URL&&prior.configPath===configPath):true;
   state.agents[id]={...prior,enabled:true,configPath,pluginUrl:PLUGIN_URL,addedByUs};
   const backupPath=await transact(old,next,state);
   return {agent:id,enabled:true,connected:true,rendering:false,restartRequired:true,backupPath};
  },options);
 }
 async function disconnect(id,{confirm=false}={}){
  definition(id);if(!confirm)throw Error('Explicit confirmation required before removing a registration');
  const initial=await readSettings(options);if(!initial.agents[id])return {agent:id,connected:false,changed:false};
  return withSettingsLock(async()=>{
   const state=await readSettings(options),saved=state.agents[id];if(!saved)return {agent:id,changed:false};
   // Never use a path from an editable settings file as deletion authority.
   if(id!=='opencode'||saved.configPath!==configPath||saved.pluginUrl!==PLUGIN_URL)throw Error('Registration ownership/path does not match this installation; refusing removal.');
   const old=await textFile(configPath),data=documentOf(old),index=data.plugins?.indexOf(PLUGIN_URL)??-1;
   const remove=saved.addedByUs===true&&index>=0;
   const next=remove?applyEdits(old,modify(old,['plugins',index],undefined,{formattingOptions:{insertSpaces:true,tabSize:2}})):old;
   delete state.agents[id];const backupPath=await transact(old,next,state);
   return {agent:id,connected:documentOf(next).plugins?.includes(PLUGIN_URL)??false,changed:true,removedOwnedEntry:remove,preservedPreexisting:index>=0&&!remove,backupPath};
  },options);
 }
 return {
  list:()=>Promise.all(AGENTS.map(a=>inspect(a.id))),plan,enable,disconnect,
  async disable(id){definition(id);await setAgentEnabled(id,false,options);return {agent:id,enabled:false,registrationPreserved:true};},
  status:id=>id?inspect(id):Promise.all(AGENTS.map(a=>inspect(a.id))),
  async doctor(id){
   const rows=id?[await inspect(id)]:await Promise.all(AGENTS.map(a=>inspect(a.id)));
   const result=await Promise.all(rows.map(async row=>({...row,adapterFilePresent:row.id==='opencode'&&await exists(ADAPTER_FILE),checks:{executable:row.detected,compatibleVersion:row.renderer.status==='available',registration:row.connected,frameProducedRecently:row.runtimeRecent,humanVisualApproval:false},note:'A recent runtime frame receipt is not human visual verification. MCP is not required for the native OpenCode plugin.'})));
   return id?result[0]:result;
  },
 };
}
