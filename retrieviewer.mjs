import {createPaperActor,createPaperRenderer,createPaperComfortTimings} from './puppy-paper.mjs';
import {createPaperProjection,createPaperBody} from './puppy-paper-world.mjs';
import {rgbaToBraille} from './braille.mjs';
import {createSnappyTrickTimings} from './puppy-paper-trick-timing.mjs';
import {createCompanionLife,FETCH_RETURN_STYLES} from './puppy-companion-life.mjs';
import {paintCompanionObjects,projectCompanionBall} from './puppy-companion-objects.mjs';
import {readPackedFrames} from './puppy-frame-store.mjs';
import {expandIndexedArchive} from './puppy-frame-indexed.mjs';
import {BAKED_MOTION} from './puppy-motion-tables.generated.mjs';

// Embeddable autonomous puppy. Importing or creating has no DOM, timer, stdin/stdout
// or listener side effects: the host owns the loop and calls step() then frame().
export const STEP_SECONDS=1/60;
export const MAX_CATCH_UP_SECONDS=.1;
export const INTERACTIONS=Object.freeze(['ball','treat','tug']);
// Approved 32-level art ships by default; preserved original art is optional.
export const DEFAULT_ART_PROFILE='q5';
export const ART_PROFILES=Object.freeze(['original','q5']);
// Current companion runtime: v9 tricks + interactions-v3, same as puppy-paper.html.
export const PET_ASSETS=Object.freeze({
 // Kept as a legacy identifier only; createPet/getPetAssetFiles no longer load it.
 animal:'locomotion-puppy.animal',
 stride:'puppy-stride-tweens-q5.rvz',strideInfo:'puppy-stride-meta.json',stableInfo:'puppy-stable-meta.json',
 rear:'puppy-paper-rear-gallop',approach:'puppy-paper-approach',seat:'puppy-paper-seat',arrivalSeat:'puppy-paper-arrival-seat',
 behaviors:'puppy-paper-behaviors',actions:'puppy-paper-actions-v9',interactions:'puppy-companion-interactions-v3',comfort:'puppy-companion-comfort',
});
const BUNDLES=['rear','approach','seat','arrivalSeat','behaviors','actions','interactions','comfort'];
const frameFile=(base,profile)=>base+(profile==='q5'?'-q5.rvz':'-compact.bin.gz');
/** Exact files a host/bundler must copy, including metadata. Never loads assets. */
export function getPetAssetFiles(artProfile=DEFAULT_ART_PROFILE){
 if(!ART_PROFILES.includes(artProfile))throw RangeError('artProfile must be original or q5');
 return Object.freeze([PET_ASSETS.strideInfo,PET_ASSETS.stableInfo,frameFile('puppy-stride-tweens',artProfile),
  ...BUNDLES.flatMap(key=>[PET_ASSETS[key]+'.json',frameFile(PET_ASSETS[key],artProfile)])]);
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
async function gunzip(bytes,size){
 // Native Node gzip avoids Blob/Response/stream copies of every large cache.
 if(typeof process!=='undefined'&&process.versions?.node){const {gunzipSync}=await import('node:zlib');return gunzipSync(bytes,size===undefined?undefined:{maxOutputLength:Math.max(1,size)});}
 if(typeof DecompressionStream!=='undefined')return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
 throw Error('This browser needs DecompressionStream for pet assets');
}

// Only immutable art/metadata is shared. Each pet still owns its animal, actor,
// life, renderer and output. Last dispose drops the shared lease, not other pets.
const sharedAssets=new Map();
// Conservative pre-render invalidation: only known held source poses qualify.
// Moving poses, gestures, sleep cues and visitors always take the normal path.
// One small key, no second pixel buffer or animation cache. Needs/cooldowns are
// intentionally absent: they still advance, but do not draw anything themselves.
function heldFrameKey(state,report,{columns,rows,cellAspect=.5,camera,poseFps=24,contactEnabled=true}={}){
 const seated=state.state==='idle'&&state.seatProgress===1&&!state.behavior&&!state.actionName&&!state.comfortPose;
 const down=state.state==='down'&&(state.actionName==='lie-down'&&state.actionProgress===1||state.behavior==='rest');
 if((!seated&&!down)||report.gesture||report.butterfly||report.snore!==null&&report.snore!==undefined)return null;
 return JSON.stringify([columns,rows,cellAspect,poseFps,!!contactEnabled,camera?.viewportWidth,camera?.viewportHeight,
  camera?.rect?.left,camera?.rect?.top,camera?.rect?.width,camera?.rect?.height,
  state.state,state.x,state.z,state.bodyLift??0,state.view,state.flip,state.seatProgress,state.seatVariant,
  state.actionName,down?state.actionProgress:0,state.behavior,state.behaviorProgress,
  report.ball,report.treat]);
}
async function loadPetAssets(loadAsset,artProfile){
 // Default local Node hosts keep art on disk and reconstruct two frames per
 // family. Custom/browser loaders retain the compatible memory-backed store.
 let codec;
 if(typeof process!=='undefined'&&process.versions?.node){
  const {deflateRawSync,inflateRawSync}=await import('node:zlib');
  // Level 3 trims retained crop payload without the multi-second startup cost
  // of levels 6..9. Pixels, synchronous frame access and the LRU stay identical.
  codec={compress:bytes=>deflateRawSync(bytes,{level:3}),expand:(bytes,size)=>inflateRawSync(bytes,{maxOutputLength:size})};
 }
 const load=async name=>bytesOf(name,await loadAsset(name));
 const json=async name=>JSON.parse(new TextDecoder().decode(await load(name)));
 let openFrameFile;
 if(artProfile==='q5'&&loadAsset===defaultLoadAsset&&new URL('.',import.meta.url).protocol==='file:'&&typeof process!=='undefined'&&process.versions?.node)({openFrameFile}=await import('./puppy-frame-file.mjs'));
 const frames=async (name,options)=>{
  if(name.endsWith('.rvz')){
   if(openFrameFile)return openFrameFile(new URL(name,import.meta.url),options);
   return readPackedFrames(await expandIndexedArchive(await load(name),gunzip),{...options,codec});
  }
  return readPackedFrames(await gunzip(await load(name)),{...options,codec});
 };
 // Read small indices locally; expand portable archives one family at a time.
 const data={assets:{}};
 try{
 data.info=await json(PET_ASSETS.strideInfo);data.meta=await json(PET_ASSETS.stableInfo);
 data.cache=await frames(frameFile('puppy-stride-tweens',artProfile));
 for(const key of BUNDLES){
  const base=PET_ASSETS[key],info=await json(base+'.json');
  // Old interaction sheets include preparation frames no runtime clip can reach.
  // Keep exact active samples only, leaving room for small new gestures without
  // keeping another multi-megabyte art family resident. Original RVF1 unchanged.
  const options=key==='interactions'&&artProfile==='q5'?{frameIndices:[...new Set(Object.values(info.clips).flatMap(list=>list.flatMap(p=>Array.from({length:info.samples},(_,s)=>p*info.samples+s))))]}:undefined;
  data.assets[key]={info,bytes:await frames(frameFile(base,artProfile),options)};
 }
 return data;
 }catch(error){disposeAssets(data);throw error;}
}
function disposeAssets(data){data?.cache?.dispose?.();for(const family of Object.values(data?.assets??{}))family.bytes?.dispose?.();}
async function acquireAssets(loadAsset,artProfile){
 let entry;
 if(loadAsset===defaultLoadAsset){entry=sharedAssets.get(artProfile);if(!entry){entry={users:0,promise:loadPetAssets(loadAsset,artProfile)};sharedAssets.set(artProfile,entry);}}
 else entry={users:0,promise:loadPetAssets(loadAsset,artProfile)};
 entry.users++;
 let released=false;
 const release=()=>{if(released)return;released=true;const previous=entry;entry=null;if(--previous.users===0){if(sharedAssets.get(artProfile)===previous)sharedAssets.delete(artProfile);disposeAssets(previous.data);}};
 try{const data=await entry.promise;entry.data=data;return{data,release};}catch(error){release();throw error;}
}

function petOptions({loadAsset=defaultLoadAsset,seed,energy,pawTransport=true,artProfile=DEFAULT_ART_PROFILE,returnStyle='auto'}={}){
 if(typeof loadAsset!=='function')throw TypeError('loadAsset must be a function');
 if(seed===undefined)seed=globalThis.crypto?.getRandomValues?globalThis.crypto.getRandomValues(new Uint32Array(1))[0]:731;
 if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw RangeError('seed must be a uint32');
 if(energy!==undefined&&(!Number.isFinite(energy)||energy<0||energy>1))throw RangeError('energy must be within 0..1');
 if(typeof pawTransport!=='boolean')throw TypeError('pawTransport must be boolean');
 if(!ART_PROFILES.includes(artProfile))throw RangeError('artProfile must be original or q5');
 if(!FETCH_RETURN_STYLES.includes(returnStyle))throw RangeError('returnStyle must be auto, brake, trot or run-trot');
 return {loadAsset,seed,energy,pawTransport,artProfile,returnStyle};
}
export async function createPet(options={}){
 const normalized=petOptions(options),lease=await acquireAssets(normalized.loadAsset,normalized.artProfile);
 return createPetFromAssets(normalized,lease);
}
// Shared simulation/render core for local native hosts. The provider owns I/O.
export function createPetFromAssets(options,lease,kernel=null){
 const {loadAsset,seed,energy,pawTransport,artProfile,returnStyle}=petOptions(options);
 let data=lease.data;
 const release=lease.release;lease=null;
 let {cache,info,meta}=data;const assets={...data.assets};data=null;
 // Baked tables describe the bundled Q5 source only. External/optional artwork
 // keeps the general metadata-driven path instead of using an unrelated bake.
 const motionTables=loadAsset===defaultLoadAsset&&artProfile==='q5'?BAKED_MOTION:null;
 let animal,actor,life;
 try{
  if(!assets.actions.info.clips?.['lie-down']||!assets.actions.info.clips?.['lie-up'])throw Error('v9 action cache lacks lie-down/lie-up clips');
  animal=createPaperBody();
  actor=createPaperActor(animal,info,{manualTricks:true,trickTimings:createSnappyTrickTimings(assets.actions.info),comfortTimings:createPaperComfortTimings(assets.actions.info),walkTransitions:true,scrambleSeconds:assets.comfort.info.scramble?.duration??0,fetchMotions:assets.comfort.info.version>=4?assets.comfort.info:null,motionTables});
  life=createCompanionLife(actor,{seed,returnStyle,...energy===undefined?{}:{energy}});
 }catch(e){animal?.dispose?.();release();throw e;}
 let paint=null,paintKey='',time=0,acc=0,disposed=false,lastHeldFrameKey=null;
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
  // Optional host optimization. False only when a known held pose and all
  // visible objects/settings match the last frame; frame() itself never skips.
  needsFrame(options){alive();const key=heldFrameKey(actor.sample(time,{poseFps:options?.poseFps??24}),life.report,options);return key===null||key!==lastHeldFrameKey;},
  // Plain Braille text sized exactly columns x rows (2x4 dots per cell). `pixels`
  // is the renderer's buffer, valid only until the next frame()/dispose().
  frame({columns,rows,cellAspect=.5,camera,poseFps=24,contactEnabled=true}={}){
   alive();
   if(!Number.isInteger(columns)||!Number.isInteger(rows)||columns<1||rows<1||columns*rows*8>1_000_000)throw RangeError('columns/rows must be positive integers within 125000 cells');
   if(typeof cellAspect!=='number'||!Number.isFinite(cellAspect)||cellAspect<=0)throw RangeError('cellAspect must be a positive number');
   if(![12,24,30].includes(poseFps))throw RangeError('poseFps must be 12, 24 or 30');
   const width=columns*2,height=rows*4,key=`${width}x${height}`;
   if(paintKey!==key){paint=createPaperRenderer(cache,info,meta,width,height,{...assets,pawTransport,motionTables,kernel});paintKey=key;}
   const viewportWidth=camera?.viewportWidth??columns*cellAspect,viewportHeight=camera?.viewportHeight??rows;
   const projection=createPaperProjection({viewportWidth,viewportHeight,rect:camera?.rect??{left:0,top:0,width:viewportWidth,height:viewportHeight},width,height});
   const state=actor.sample(time,{poseFps}),report=life.report;
   if(report.gesture)state.interactionPose=report.gesture;
   const placement=projection.placement(state.x,state.z,state.bodyLift??0),pixels=paint(state,{...placement,contactEnabled:!!contactEnabled});
   const ballScreen=projectCompanionBall(width,height,projection,report,state,paint.lastMouth,paint.lastBall);
   paintCompanionObjects(pixels,width,height,projection,report,state,paint.lastMouth,ballScreen);
   const {text}=rgbaToBraille(pixels,width,height,{method:'stable',brightness:1.18,contrast:1.1,kernel});
   lastHeldFrameKey=heldFrameKey(state,report,{columns,rows,cellAspect,camera,poseFps,contactEnabled});
   return {text,columns,rows,pixels,state,report,placement,projection,artProfile,mouth:paint.lastMouth,ballScreen,contacts:paint.report()};
  },
  // 'ball' | 'treat' | 'tug'. False when busy or cooling down; unknown kinds throw.
  interact(kind){alive();if(!INTERACTIONS.includes(kind))throw TypeError(`Unknown interaction: ${kind}`);return life.interact(kind);},
  // A bounded visual cue only; never clicks, types, focuses or approves anything.
  notify(notice){alive();return life.notify(notice);},
  clearNotice(){alive();life.clearNotice();},
  // Applies to the next ball throw; never rewrites a fetch already in motion.
  setReturnStyle(style){alive();return life.setReturnStyle(style);},
  get disposed(){return disposed;},
  dispose(){
   if(disposed)return;disposed=true;
   try{animal.dispose?.();}finally{
    animal=actor=life=paint=cache=info=meta=null;paintKey='';lastHeldFrameKey=null;
    for(const k of BUNDLES)assets[k]=null;
    release();
   }
  },
 };
}
