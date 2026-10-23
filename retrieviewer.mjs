import {makeLabAnimal} from './locomotion-core.mjs';
import {createPaperActor,createPaperRenderer} from './puppy-paper.mjs';
import {createPaperProjection} from './puppy-paper-world.mjs';
import {rgbaToBraille} from './braille.mjs';
import {createSnappyTrickTimings} from './puppy-paper-trick-timing.mjs';
import {createCompanionLife} from './puppy-companion-life.mjs';
import {paintCompanionObjects} from './puppy-companion-objects.mjs';
import {readPackedFrames} from './puppy-frame-store.mjs';

// Embeddable autonomous puppy. Importing or creating has no DOM, timer, stdin/stdout
// or listener side effects: the host owns the loop and calls step() then frame().
export const STEP_SECONDS=1/60;
export const MAX_CATCH_UP_SECONDS=.1;
export const INTERACTIONS=Object.freeze(['ball','treat']);
// Approved 32-level art ships by default; preserved original art is optional.
export const DEFAULT_ART_PROFILE='q5';
export const ART_PROFILES=Object.freeze(['original','q5']);
// Current companion runtime: v9 tricks + interactions-v3, same as puppy-paper.html.
export const PET_ASSETS=Object.freeze({
 animal:'locomotion-puppy.animal',
 stride:'puppy-stride-tweens-q5.bin.gz',strideInfo:'puppy-stride-meta.json',stableInfo:'puppy-stable-meta.json',
 rear:'puppy-paper-rear-gallop',approach:'puppy-paper-approach',seat:'puppy-paper-seat',arrivalSeat:'puppy-paper-arrival-seat',
 behaviors:'puppy-paper-behaviors',actions:'puppy-paper-actions-v9',interactions:'puppy-companion-interactions-v3',
});
const BUNDLES=['rear','approach','seat','arrivalSeat','behaviors','actions','interactions'];
const frameFile=(base,profile)=>base+(profile==='q5'?'-q5.bin.gz':'-compact.bin.gz');
/** Exact files a host/bundler must copy, including metadata. Never loads assets. */
export function getPetAssetFiles(artProfile=DEFAULT_ART_PROFILE){
 if(!ART_PROFILES.includes(artProfile))throw RangeError('artProfile must be original or q5');
 return Object.freeze([PET_ASSETS.strideInfo,PET_ASSETS.stableInfo,frameFile('puppy-stride-tweens',artProfile),
  ...BUNDLES.flatMap(key=>[PET_ASSETS[key]+'.json',frameFile(PET_ASSETS[key],artProfile)]),PET_ASSETS.animal]);
}

// Relative to this module, never the process cwd: file: URLs in Node, HTTP in browsers.
export async function defaultLoadAsset(name){
 const url=new URL(name,import.meta.url);
 if(url.protocol==='file:'){
  const {readFile}=await import('node:fs/promises');
  try{return await readFile(url);}catch(error){
   if(error.code==='ENOENT'&&name.endsWith('-compact.bin.gz'))throw Error('Original art is optional and not bundled. Supply the preserved original assets with loadAsset, or use the default q5 profile.',{cause:error});
   throw error;
  }
 }
 const r=await fetch(url);if(!r.ok)throw Error(`${name} HTTP ${r.status}`);return r.arrayBuffer();
}

const bytesOf=(name,value)=>{
 if(value instanceof ArrayBuffer)return new Uint8Array(value);
 if(ArrayBuffer.isView(value))return new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
 throw TypeError(`loadAsset(${name}) must return an ArrayBuffer or typed bytes`);
};
async function gunzip(bytes){
 // Native Node gzip avoids Blob/Response/stream copies of every large cache.
 if(typeof process!=='undefined'&&process.versions?.node){const {gunzipSync}=await import('node:zlib');return gunzipSync(bytes);}
 if(typeof DecompressionStream!=='undefined')return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
 throw Error('This browser needs DecompressionStream for pet assets');
}

// Only immutable art/metadata is shared. Each pet still owns its animal, actor,
// life, renderer and output. Last dispose drops the shared lease, not other pets.
const sharedAssets=new Map();
async function loadPetAssets(loadAsset,artProfile){
 const load=async name=>bytesOf(name,await loadAsset(name));
 const json=async name=>JSON.parse(new TextDecoder().decode(await load(name)));
 const frames=async name=>readPackedFrames(await gunzip(await load(name)));
 // One family at a time: never inflate all eight legacy-sized buffers together.
 const data={assets:{}};
 data.info=await json(PET_ASSETS.strideInfo);data.meta=await json(PET_ASSETS.stableInfo);
 data.cache=await frames(frameFile('puppy-stride-tweens',artProfile));
 for(const key of BUNDLES){const base=PET_ASSETS[key];data.assets[key]={info:await json(base+'.json'),bytes:await frames(frameFile(base,artProfile))};}
 data.baked=await load(PET_ASSETS.animal);
 return data;
}
async function acquireAssets(loadAsset,artProfile){
 let entry;
 if(loadAsset===defaultLoadAsset){entry=sharedAssets.get(artProfile);if(!entry){entry={users:0,promise:loadPetAssets(loadAsset,artProfile)};sharedAssets.set(artProfile,entry);}}
 else entry={users:0,promise:loadPetAssets(loadAsset,artProfile)};
 entry.users++;
 let released=false;
 const release=()=>{if(released)return;released=true;const previous=entry;entry=null;if(--previous.users===0&&sharedAssets.get(artProfile)===previous)sharedAssets.delete(artProfile);};
 try{return{data:await entry.promise,release};}catch(error){release();throw error;}
}

export async function createPet({loadAsset=defaultLoadAsset,seed,energy,pawTransport=true,artProfile=DEFAULT_ART_PROFILE}={}){
 if(typeof loadAsset!=='function')throw TypeError('loadAsset must be a function');
 if(seed===undefined)seed=globalThis.crypto?.getRandomValues?globalThis.crypto.getRandomValues(new Uint32Array(1))[0]:731;
 if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw RangeError('seed must be a uint32');
 if(energy!==undefined&&(!Number.isFinite(energy)||energy<0||energy>1))throw RangeError('energy must be within 0..1');
 if(typeof pawTransport!=='boolean')throw TypeError('pawTransport must be boolean');
 if(!ART_PROFILES.includes(artProfile))throw RangeError('artProfile must be original or q5');
 let lease=await acquireAssets(loadAsset,artProfile),data=lease.data;
 const release=lease.release;lease=null;
 let {cache,info,meta,baked}=data;const assets={...data.assets};data=null;
 let animal,actor,life;
 try{
  if(!assets.actions.info.clips?.['lie-down']||!assets.actions.info.clips?.['lie-up'])throw Error('v9 action cache lacks lie-down/lie-up clips');
  animal=await makeLabAnimal({baked:baked.buffer.slice(baked.byteOffset,baked.byteOffset+baked.byteLength)});baked=null;
  actor=createPaperActor(animal,info,{manualTricks:true,trickTimings:createSnappyTrickTimings(assets.actions.info),walkTransitions:true});
  life=createCompanionLife(actor,{seed,...energy===undefined?{}:{energy}});
 }catch(e){animal?.dispose?.();release();throw e;}
 let paint=null,paintKey='',time=0,acc=0,disposed=false;
 const alive=()=>{if(disposed)throw Error('Pet is disposed');};
 return {
  // Fixed 1/60 s simulation; host deltas are clamped to 0.1 s so a stalled host
  // catches up at most six steps. Returns the number of fixed steps taken.
  step(dt){
   alive();if(typeof dt!=='number'||!Number.isFinite(dt)||dt<0)throw RangeError('dt must be finite non-negative seconds');
   acc+=Math.min(dt,MAX_CATCH_UP_SECONDS);let n=0;
   while(acc>=STEP_SECONDS-1e-9){actor.update(STEP_SECONDS);life.update(STEP_SECONDS);time+=STEP_SECONDS;acc=Math.max(0,acc-STEP_SECONDS);n++;}
   return n;
  },
  // Plain Braille text sized exactly columns x rows (2x4 dots per cell). `pixels`
  // is the renderer's buffer, valid only until the next frame()/dispose().
  frame({columns,rows,cellAspect=.5,camera,poseFps=24,contactEnabled=true}={}){
   alive();
   if(!Number.isInteger(columns)||!Number.isInteger(rows)||columns<1||rows<1||columns*rows*8>1_000_000)throw RangeError('columns/rows must be positive integers within 125000 cells');
   if(typeof cellAspect!=='number'||!Number.isFinite(cellAspect)||cellAspect<=0)throw RangeError('cellAspect must be a positive number');
   if(![12,24,30].includes(poseFps))throw RangeError('poseFps must be 12, 24 or 30');
   const width=columns*2,height=rows*4,key=`${width}x${height}`;
   if(paintKey!==key){paint=createPaperRenderer(cache,info,meta,width,height,{...assets,pawTransport});paintKey=key;}
   const viewportWidth=camera?.viewportWidth??columns*cellAspect,viewportHeight=camera?.viewportHeight??rows;
   const projection=createPaperProjection({viewportWidth,viewportHeight,rect:camera?.rect??{left:0,top:0,width:viewportWidth,height:viewportHeight},width,height});
   const state=actor.sample(time,{poseFps}),report=life.report;
   if(report.gesture)state.interactionPose=report.gesture;
   const placement=projection.placement(state.x,state.z),pixels=paint(state,{...placement,contactEnabled:!!contactEnabled});
   paintCompanionObjects(pixels,width,height,projection,report,state,paint.lastMouth);
   const {text}=rgbaToBraille(pixels,width,height,{method:'stable',brightness:1.18,contrast:1.1});
   return {text,columns,rows,pixels,state,report,placement,projection,artProfile,mouth:paint.lastMouth,contacts:paint.report()};
  },
  // 'ball' | 'treat'. False when busy or cooling down; unknown kinds throw.
  interact(kind){alive();if(!INTERACTIONS.includes(kind))throw TypeError(`Unknown interaction: ${kind}`);return life.interact(kind);},
  get disposed(){return disposed;},
  dispose(){
   if(disposed)return;disposed=true;
   try{animal.dispose?.();}finally{
    animal=actor=life=paint=cache=info=meta=null;paintKey='';
    for(const k of BUNDLES)assets[k]=null;
    release();
   }
  },
 };
}
