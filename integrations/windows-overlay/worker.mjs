// Private detached worker, started only by the explicit `desktop` command.
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {createInterface} from 'node:readline';
import {open,unlink,readFile,chmod} from 'node:fs/promises';
import {randomBytes,randomUUID} from 'node:crypto';
import {prepareRoot,noLink} from './desktop.mjs';
import {createFramePump} from './protocol.mjs';
import {controlAddress,parseHelperSpec} from '../desktop/platform.mjs';

let helper,pump,timer,server,session,paths,owned=false,stopping=false,frames=0,paintedFrames=0,visible=false,selected=false,pickerVisible=false,pendingViewport=null,lastInteraction=null;
let nativeError=null,ready=false,detached=false;
const returnStyle=process.env.RETRIEVIEWER_RETURN_STYLE??'auto';
let nativeStderr='';
const sendParent=message=>{if(process.connected)try{process.send(message,error=>{if(error&&!detached)stop();});}catch{if(!detached)stop();}};
const starting=()=>{if(stopping||(!process.connected&&!detached))throw Error('Desktop launcher closed during startup');};
async function stop(){
 const first=!stopping;stopping=true;clearInterval(timer);pump?.dispose();
 if(helper&&!helper.killed){try{helper.stdin.end(JSON.stringify({type:'quit'})+'\n');}catch{}}
 if(server?.listening)server.close();
 if(owned)try{const current=JSON.parse(await readFile(paths.session,'utf8'));if(current.token===session.token)await unlink(paths.session);}catch{}
 // A wedged painter is our own child only, never the selected terminal.
 if(first){const watchdog=setTimeout(()=>{helper?.kill();process.exit(0);},2500);watchdog.unref();}
 if(!helper||helper.exitCode!==null)process.exitCode=0;
}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
process.on('disconnect',()=>{if(!detached)stop();});
process.on('message',m=>{
 if(m?.command==='abort')stop();
 else if(m?.command==='detach'&&ready&&!stopping){detached=true;sendParent({detached:true});}
});
try{
 starting();
 const spec=parseHelperSpec(process.argv.slice(2));
 paths=await prepareRoot();await noLink(paths.session);starting();
 session={owner:'bitefoundry-retrieviewer-overlay-v1',pid:process.pid,pipe:controlAddress({uuid:randomUUID()}),token:randomBytes(32).toString('hex')};
 const record=await open(paths.session,'wx',0o600);owned=true;try{await record.writeFile(JSON.stringify(session)+'\n');}finally{await record.close();}starting();
 server=createServer(socket=>{
  socket.setTimeout(1500,()=>socket.destroy());let body='';
  socket.on('error',()=>{});socket.on('data',bytes=>{
   body+=bytes.toString('utf8');if(body.length>2048)return socket.destroy();if(!body.includes('\n'))return;
   let command;try{command=JSON.parse(body.split('\n')[0]);}catch{return socket.destroy();}
   if(command.token!==session.token||!['status','stop'].includes(command.command))return socket.destroy();
   socket.end(JSON.stringify(command.command==='stop'?{stopped:true}:{running:true,reachable:true,selected,visible,pickerVisible,frames,paintedFrames,lastInteraction,returnStyle,pid:process.pid,painterPid:helper?.pid,rssBytes:process.memoryUsage().rss})+'\n');
   if(command.command==='stop')stop();
  });
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(session.pipe,resolve);});
 if(process.platform!=='win32')await chmod(session.pipe,0o600);
 starting();
 // GUI-subsystem exe: no console to hide. SW_HIDE here also hides its first UI.
 helper=spawn(spec.command,spec.args,{windowsHide:false,stdio:['pipe','pipe','pipe']});
 helper.stdin.on('error',()=>stop());helper.stderr.setEncoding('utf8');helper.stderr.on('data',s=>{nativeStderr=(nativeStderr+s).slice(-4096);});helper.once('error',error=>{sendParent({error:error.message});stop();});
 helper.once('exit',code=>{if(!stopping)sendParent({error:nativeError??('Desktop painter exited ('+code+')'+(nativeStderr?' — '+nativeStderr.trim():''))});stop();});
 const write=message=>{if(!stopping&&!helper.stdin.destroyed)helper.stdin.write(JSON.stringify(message)+'\n');};
 const reader=createInterface({input:helper.stdout});
 reader.on('line',line=>{
  if(line.length>100000)return stop();let m;try{m=JSON.parse(line);}catch{return stop();}
  try{
   if(m.type==='ready'&&!stopping){ready=true;pickerVisible=m.pickerVisible===true;sendParent({running:true,windowPicker:pickerVisible,mode:spec.mode,returnStyle,pid:process.pid});}
   else if(m.type==='error'){nativeError=String(m.message??'Desktop painter failed');sendParent({error:nativeError});stop();}
   else if(m.type==='picker')pickerVisible=m.visible===true;
   else if(m.type==='viewport'){pendingViewport=m;visible=m.visible;selected=m.selected===true;pump?.viewport(m);}
   else if(m.type==='ack'){frames++;if(m.painted)paintedFrames++;pump?.ack();}
   else if(m.type==='pause')pump?.pause(m.paused);
   else if(m.type==='interact'){const accepted=pump?.interact(m.kind)??false;lastInteraction={kind:m.kind,accepted};write({type:'interaction',kind:m.kind,accepted});}
   else if(m.type==='quit')stop();
  }catch(error){write({type:'error',message:error.message});stop();}
 });
 starting();const {createPet}=await import('../../retrieviewer.mjs');starting();const pet=await createPet({returnStyle});
 if(stopping)pet.dispose();else{
  pump=createFramePump({pet,send:write});if(pendingViewport)pump.viewport(pendingViewport);
  write({type:'loaded',ink:process.env.RETRIEVIEWER_INK??'cream'});timer=setInterval(()=>{try{pump.tick();}catch(error){write({type:'error',message:error.message});stop();}},1000/spec.fps);
 }
}catch(error){sendParent({error:error.message});await stop();}
