import {createPet,PET_ASSETS} from '../../retrieviewer.mjs';
import {readIndexedIndex,indexedIndexLength,createIndexedFrameStore} from '../../puppy-frame-indexed.mjs';
import {registerFrameStore} from '../../puppy-frame-store.mjs';
import {gunzipSync} from '../../dist/native-memory/package/esm/browser.js';
export async function runProbe(host){
 const stores=[];
 function open(name,frameIndices){const file=host.open(name),head=file.read(0,20),length=indexedIndexLength(head),index=readIndexedIndex(file.read(0,length),file.size),store=registerFrameStore(createIndexedFrameStore(index,{read:(at,n)=>file.read(at,n),expand:(b,n)=>{const out=globalThis.__fast?globalThis.__fast.inflate(b,n):gunzipSync(b);if(out.length!==n)throw Error('expanded length');return out;},close:()=>file.close(),frameIndices}));stores.push(store);return store;}
 const data={info:host.json(PET_ASSETS.strideInfo),meta:host.json(PET_ASSETS.stableInfo),cache:open(PET_ASSETS.stride),assets:{}};
 for(const k of ['rear','approach','seat','arrivalSeat','behaviors','actions','interactions','comfort']){const base=PET_ASSETS[k],info=host.json(base+'.json');const indices=k==='interactions'?[...new Set(Object.values(info.clips).flatMap(list=>list.flatMap(p=>Array.from({length:info.samples},(_,s)=>p*info.samples+s))))]:undefined;data.assets[k]={info,bytes:open(base+'-q5.rvz',indices)};}
 globalThis.__probeAssets=data;const pet=await createPet({seed:731});let hash=2166136261;
 if(host.desktop){
  globalThis.__desktopReady=true;
  globalThis.__desktopFrame=(dt,columns,rows)=>{pet.step(dt);const options={columns,rows,cellAspect:.5};return pet.needsFrame(options)?pet.frame(options).text:null;};
  globalThis.__desktopInteract=kind=>kind==='paw'||kind==='wall'?pet.notify({kind:'approval',gesture:kind}):pet.interact(kind);
  globalThis.__desktopDispose=()=>{pet.dispose();for(const s of stores)s.dispose();globalThis.__probeAssets=null;};
  host.log({stage:'desktop-ready'});return;
 }
 try{
  host.log({stage:'loaded'});host.sleep(2000);
  const results=[];pet.interact('ball');
  for(const [columns,rows] of [[160,72],[480,135]]){
   let renderMs=0,maxMs=0;
   for(let i=0;i<15;i++){pet.step(.1);const t=host.now(),f=pet.frame({columns,rows}),elapsed=host.now()-t;renderMs+=elapsed;maxMs=Math.max(maxMs,elapsed);for(let k=0;k<f.text.length;k++)hash=Math.imul(hash^f.text.charCodeAt(k),16777619);host.recordFrame?.(f);}
   results.push({columns,rows,frames:15,meanMs:renderMs/15,maxMs});
  }
  host.log({stage:'rendered',results,textHash:hash>>>0});host.sleep(3000);
 }finally{pet.dispose();for(const s of stores)s.dispose();globalThis.__probeAssets=null;}
}
