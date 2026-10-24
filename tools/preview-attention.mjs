// Loopback-only QA page; allowlisted public runtime files, never the workspace.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const pkg=JSON.parse(await readFile(new URL('package.json',root),'utf8'));
const allowed=new Set(pkg.files);
const server=createServer(async(req,res)=>{
 try{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1);
  if(path!==''&&!allowed.has(path)){res.writeHead(404);res.end();return;}
  const target=path||'tools/attention-preview.html',bytes=await readFile(new URL(target,root));
  const type=target.endsWith('.html')?'text/html; charset=utf-8':target.endsWith('.mjs')?'text/javascript':target.endsWith('.json')?'application/json':'application/octet-stream';
  res.writeHead(200,{'content-type':type,'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'});res.end(req.method==='HEAD'?undefined:bytes);
 }catch{res.writeHead(404);res.end();}
});
// No permanent background QA server. An already-loaded page remains local.
const expiry=setTimeout(()=>{server.close();server.closeIdleConnections();},10*60*1000);expiry.unref();
server.listen(0,'127.0.0.1',()=>console.log('Retrieviewer attention preview: http://127.0.0.1:'+server.address().port+' (server exits in 10 minutes)'));
process.on('SIGTERM',()=>server.close());process.on('SIGINT',()=>server.close());
