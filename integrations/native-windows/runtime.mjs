import * as std from 'qjs:std';
import {createPetFromAssets,PET_ASSETS} from '../../retrieviewer.mjs';
import {createCatFromAssets} from '../purrviewer/src/purrviewer-core.mjs';
import {createIndexedFrameStore,indexedIndexLength,readIndexedIndex} from '../../puppy-frame-indexed.mjs';
import {registerFrameStore} from '../../puppy-frame-store.mjs';

const config=globalThis.__nativeConfig??{},root=scriptArgs[1],kernel=globalThis.__fast;
let pet=null,kind=config.pet??'dog',disposed=false;
const json=name=>{const source=std.loadFile(root+'/'+name);if(source===null)throw Error('Missing pet metadata: '+name);return JSON.parse(source);};
function provider(){
 const stores=[];
 const release=()=>{for(const store of stores)store.dispose();stores.length=0;};
 const frames=(name,frameIndices)=>{
  const file=std.open(root+'/'+name,'rb');if(!file)throw Error('Missing pet artwork: '+name);
  let owned=true;
  try{
   const read=(at,n)=>{if(file.seek(at,std.SEEK_SET)!==0)throw Error('Invalid art seek');const bytes=new Uint8Array(n);if(file.read(bytes.buffer,0,n)!==n)throw Error('Truncated pet artwork');return bytes;};
   file.seek(0,std.SEEK_END);const size=file.tell(),length=indexedIndexLength(read(0,20)),index=readIndexedIndex(read(0,length),size);
   const store=registerFrameStore(createIndexedFrameStore(index,{read,expand:(b,n)=>kernel.inflate(b,n),close:()=>file.close(),frameIndices,kernel}));
   stores.push(store);owned=false;return store;
  }finally{if(owned)file.close();}
 };
 return {frames,release};
}
function make(next){
 if(!['dog','cat'].includes(next))throw Error('Unknown pet');
 const p=provider();
 try{
  if(next==='cat')return createCatFromAssets({seed:config.seed??731},{data:{meta:json('integrations/purrviewer/art/ginger.json'),store:p.frames('integrations/purrviewer/art/ginger.rvz')},release:p.release},kernel);
  const data={info:json(PET_ASSETS.strideInfo),meta:json(PET_ASSETS.stableInfo),cache:p.frames(PET_ASSETS.stride),assets:{}};
  for(const key of ['rear','approach','seat','arrivalSeat','behaviors','actions','interactions','comfort']){
   const base=PET_ASSETS[key],info=json(base+'.json');
   const indices=key==='interactions'?[...new Set(Object.values(info.clips).flatMap(list=>list.flatMap(pair=>Array.from({length:info.samples},(_,s)=>pair*info.samples+s))))]:undefined;
   data.assets[key]={info,bytes:p.frames(base+'-q5.rvz',indices)};
  }
  return createPetFromAssets({seed:config.seed??731,returnStyle:config.returnStyle??'auto'},{data,release:p.release},kernel);
 }catch(error){p.release();throw error;}
}
pet=make(kind);
globalThis.__desktopReady=true;
globalThis.__desktopFrame=(dt,columns,rows,force=false)=>{
 if(disposed)throw Error('Native pet is disposed');
 pet.step(dt);const options={columns,rows,cellAspect:.5};
 return !force&&pet.needsFrame?.(options)===false?null:pet.frame(options).text;
};
globalThis.__desktopInteract=action=>{
 if(kind==='cat')return pet.interact(({ball:'toy',tug:'company',paw:'greet',wall:'greet'})[action]??action);
 return action==='paw'||action==='wall'?pet.notify({kind:'approval',gesture:action}):pet.interact(action);
};
globalThis.__desktopSwitchPet=next=>{
 if(!['dog','cat'].includes(next))throw Error('Unknown pet');
 if(next===kind)return true;
 pet.dispose();pet=null;pet=make(next);kind=next;return true;
};
globalThis.__desktopDispose=()=>{if(disposed)return;disposed=true;pet?.dispose();pet=null;};
