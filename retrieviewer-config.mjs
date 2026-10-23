// Tiny runtime settings API. No art, processes, timers or I/O on import.
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {readFile,mkdir,lstat,open,rename,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';

export function getConfigPaths({home=homedir(),env=process.env,stateDir}={}){
 const root=resolve(stateDir??env.RETRIEVIEWER_HOME??join(home,'.config','retrieviewer'));
 return {root,settings:join(root,'settings.json'),lock:join(root,'settings.lock')};
}
const agentId=id=>{if(typeof id!=='string'||!/^[a-z][a-z0-9-]{0,47}$/.test(id))throw TypeError('Invalid agent ID');return id;};
async function noLink(path){try{if((await lstat(path)).isSymbolicLink())throw Error('Refusing symlink: '+path);}catch(e){if(e.code!=='ENOENT')throw e;}}
export async function readSettings(options={}){
 const {root,settings}=getConfigPaths(options);await noLink(root);await noLink(settings);
 let bytes;try{bytes=await readFile(settings,'utf8');}catch(e){if(e.code==='ENOENT')return {version:1,agents:{}};throw e;}
 if(bytes.length>1024*1024)throw Error('Retrieviewer settings exceed 1 MiB');
 const data=JSON.parse(bytes);
 if(!data||data.version!==1||!data.agents||typeof data.agents!=='object'||Array.isArray(data.agents))throw Error('Unsupported Retrieviewer settings format');
 return data;
}
export async function readAgentSettings(agent,options={}){
 agentId(agent);const data=await readSettings(options);
 return Object.hasOwn(data.agents,agent)?{...data.agents[agent],enabled:data.agents[agent]?.enabled===true}:{enabled:false};
}
export async function writeAtomicJson(path,value){
 await noLink(path);const temp=path+'.'+randomUUID()+'.tmp';let owned=false;
 try{const file=await open(temp,'wx',0o600);owned=true;try{await file.writeFile(JSON.stringify(value,null,2)+'\n');await file.sync();}finally{await file.close();}await rename(temp,path);owned=false;}
 finally{if(owned)await unlink(temp).catch(()=>{});}
}
export async function withSettingsLock(fn,options={}){
 const paths=getConfigPaths(options);await noLink(paths.root);await mkdir(paths.root,{recursive:true,mode:0o700});
 await noLink(paths.lock);let handle;
 try{handle=await open(paths.lock,'wx',0o600);}catch(e){if(e.code==='EEXIST')throw Error('Retrieviewer settings are locked by another operation; retry when it finishes.');throw e;}
 try{return await fn(paths);}finally{await handle.close();await unlink(paths.lock);}
}
export async function setAgentEnabled(agent,enabled,options={}){
 agentId(agent);if(typeof enabled!=='boolean')throw TypeError('enabled must be boolean');
 await withSettingsLock(async({settings})=>{
  const data=await readSettings(options);
  if(!Object.hasOwn(data.agents,agent))throw Error('Agent is not connected. Run retrieviewer enable --agent '+agent+' first.');
  data.agents[agent]={...data.agents[agent],enabled};await writeAtomicJson(settings,data);
 },options);
}
export async function writeRuntimeReceipt(agent,receipt,options={}){
 agentId(agent);const {root}=getConfigPaths(options);await noLink(root);await mkdir(root,{recursive:true,mode:0o700});
 const {hostVersion,phase,firstFrameAt,columns,rows,frames}=receipt;
 if(!['rendering','stopped'].includes(phase))throw TypeError('Invalid renderer receipt phase');
 await writeAtomicJson(join(root,'runtime-'+agent+'.json'),{version:1,agent,hostVersion,phase,firstFrameAt,columns,rows,frames,pid:process.pid,updatedAt:new Date().toISOString()});
}
