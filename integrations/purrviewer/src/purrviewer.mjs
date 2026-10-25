import {readPackedFrames} from '../vendor/retrieviewer/puppy-frame-store.mjs';
import {rgbaToBraille} from '../vendor/retrieviewer/braille.mjs';
import {createCatFromAssets} from './purrviewer-core.mjs';
export {createCatFromAssets} from './purrviewer-core.mjs';
let shared=null,pending=null,leases=0;
const root=new URL('../art/',import.meta.url);
async function read(url){
 if(url.protocol==='file:'){const {readFile}=await import('node:fs/promises');return new Uint8Array(await readFile(url));}
 const r=await fetch(url);if(!r.ok)throw Error('Cat asset HTTP '+r.status);return new Uint8Array(await r.arrayBuffer());
}
async function acquire(){
 if(!pending&&!shared)pending=(async()=>{
  const meta=JSON.parse(new TextDecoder().decode(await read(new URL('ginger.json',root))));
  if(meta.version!==1||meta.width!==320||meta.height!==320||meta.frames<1||meta.frames>128)throw Error('Invalid cat art metadata');
  let store;
  if(root.protocol==='file:'){
   const {openFrameFile}=await import('../vendor/retrieviewer/puppy-frame-file.mjs');
   store=openFrameFile(new URL('ginger.rvz',root));
  }else{
   const gzip=await read(new URL('ginger.bin.gz',root));
   const encoded=new Uint8Array(await new Response(new Blob([gzip]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
   store=readPackedFrames(encoded);
  }
  try{
  if(store.frameCount!==meta.frames)throw Error('Cat art frame count mismatch');
  for(const motion of Object.values(meta.clips))if(!Array.isArray(motion)||!motion.length||motion.some(i=>!Number.isInteger(i)||i<0||i>=meta.frames))throw Error('Invalid cat clip');
  return {meta,store};
  }catch(error){store.dispose?.();throw error;}
 })().then(value=>{shared=value;pending=null;return value;},error=>{pending=null;throw error;});
 const value=shared??await pending;leases++;return value;
}
function release(){if(--leases===0){shared?.store.dispose?.();shared=null;}}
export async function createCat({seed=731}={}){
 if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw TypeError('Invalid cat seed');
 const data=await acquire();return createCatFromAssets({seed},{data,release,users:()=>leases});
}
// The native host owns loading and lifetime; behavior and rendering stay shared.
