// Offline only. Rebuild after changing source contacts/art: npm run bake:motion.
// --check compares deterministic output without writing any file.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gunzipSync,deflateRawSync,inflateRawSync} from 'node:zlib';
import {readPackedFrames} from '../puppy-frame-store.mjs';
import {PAPER_GAITS} from '../puppy-paper-world.mjs';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
// Git may check text out with CRLF. Hash logical LF text, never normalize art.
export const motionText=text=>text.replace(/\r\n/g,'\n');
const names={stride:'puppy-stride-meta.json',rear:'puppy-paper-rear-gallop.json',approach:'puppy-paper-approach.json',actions:'puppy-paper-actions-v9.json',behaviors:'puppy-paper-behaviors.json',comfort:'puppy-companion-comfort.json'};

// Same support-episode semantics as the existing runtime, including the cyclic
// seam and a complete skipped swing. Positions remain in the source metadata.
export function bakeSupportTrack(labels,indices,samples,{cyclic=true}={}){
 const step=samples-1,period=indices.length*step,starts={},offsets={};
 indices.forEach((pair,i)=>offsets[pair]=i*step);
 const ids=[...new Set(indices.flatMap(p=>labels[p].flatMap(f=>f.map(x=>x.id))))];
 for(const id of ids){
  const active=Array.from({length:period+(cyclic?0:1)},(_,i)=>{const p=Math.min(indices.length-1,Math.floor(i/step)),s=i-p*step;return labels[indices[p]][s].some(f=>f.id===id&&f.stance);});
  starts[id]=active.map((v,i)=>{if(!v)return -1;let start=i;while(start>0&&active[start-1])start--;if(cyclic&&start===0&&active.at(-1)){let k=active.length-1;while(k>0&&active[k-1])k--;return k;}return start;});
 }
 return {step,period,cyclic,offsets,starts};
}

function bakeRoutes(){
 const views=['front','rear','approach'],direction=[],action=[],steps=[];
 const intern=step=>{const key=JSON.stringify(step),i=steps.findIndex(s=>JSON.stringify(s)===key);if(i>=0)return i;steps.push(step);return steps.length-1;};
 for(const view of views)for(const flip of [0,1])for(const desired of views)for(const nextFlip of [0,1]){
  direction.push(intern(view!==desired?['view-turn',view==='front'?desired:'front']:view==='front'&&flip!==nextFlip?['turn',!!nextFlip]:['ready']));
 }
 for(const view of views)for(const flip of [0,1])for(const seat of ['stand','partial','seat'])for(const goal of ['stand','seat']){
  const desired=goal==='stand'?'front':'approach';
  action.push(intern(goal==='stand'&&seat!=='stand'?['rise']:flip&&view!=='front'?['view-turn','front']:flip?['turn',false]:view!==desired?['view-turn',view==='front'?desired:'front']:goal==='seat'&&seat!=='seat'?['sit-down']:['ready']));
 }
 return {maxPreparationSpeed:1e-8,steps,direction,action};
}

export function buildMotionTables(root=ROOT,readSource=readFileSync){
 const sources={},info={};
 for(const [key,name] of Object.entries(names)){const text=motionText(readSource(join(root,name)).toString('utf8'));sources[name]=sha(text);info[key]=JSON.parse(text);}
 const {rear,approach,actions,behaviors,comfort}=info;
 const range=(start,n)=>Array.from({length:n},(_,i)=>start+i);
 const support={front:bakeSupportTrack(rear.frontFeet,range(0,8),17),rear:bakeSupportTrack(rear.rearFeet,range(5,8),9),approach:bakeSupportTrack(approach.feet,range(5,8),9),walk:bakeSupportTrack(actions.feet,actions.clips.walk,9)};
 for(const [name,indices] of Object.entries(behaviors.clips))support['behavior/'+name]=bakeSupportTrack(behaviors.feet,indices,9,{cyclic:name==='walk'});
 const actionClips=Object.fromEntries(Object.entries(actions.clips).map(([name,list])=>{const weights=actions.weights?.[name]??list.map(()=>1);return[name,{list,weights,total:weights.reduce((a,b)=>a+b,0)}];}));
 // Independent compressed frame stores: no runtime assets are rewritten.
 const stores=new Map(),codec={compress:b=>deflateRawSync(b,{level:3}),expand:(b,n)=>inflateRawSync(b,{maxOutputLength:n})};
 const frame=(family,index)=>{
  const file=family+'-q5.bin.gz';let store=stores.get(file);
  if(!store){const bytes=readSource(join(root,file));sources[file]=sha(bytes);store=readPackedFrames(gunzipSync(bytes),{codec});stores.set(file,store);}
  return Buffer.from(store.getFrame(index));
 };
 const joins={};
 const add=(name,from,to,condition)=>{
  const a=frame(...from),b=frame(...to);if(!a.equals(b))throw Error('Motion join does not share exact source pixels: '+name);
  joins[name]={from,to,poseSha256:sha(a),...condition};
 };
 const stopped={view:'front',speed:[0,0],supportEvidence:'shared-pose-only'};
 add('walk-enter/walk',['puppy-paper-actions-v9',actions.clips['walk-enter'][0]*9+8],['puppy-paper-actions-v9',actions.clips.walk[0]*9],{...stopped,supports:actions.feet[actions.clips.walk[0]][0].filter(f=>f.stance).map(f=>f.id),supportEvidence:'shared-pixels-with-labeled-walk-pose',phase:0});
 add('walk/walk-exit',['puppy-paper-actions-v9',actions.clips.walk.at(-1)*9+8],['puppy-paper-actions-v9',actions.clips['walk-exit'][0]*9],{...stopped,supports:actions.feet[actions.clips.walk[0]][0].filter(f=>f.stance).map(f=>f.id),supportEvidence:'shared-pixels-with-labeled-walk-pose',phase:0});
 // This authored impact begins AIRBORNE. Record that fact, never invent a
 // planted paw. Positive matched velocity/phase, not a stopped-pose join.
 const phaseSample=comfort.scramble.entryPhase*8,pair=5+Math.floor(phaseSample),sample=Math.round((phaseSample%1)*8),entrySupport=rear.rearFeet[pair][sample].filter(f=>f.stance).map(f=>f.id);
 add('rear-run/scramble',['puppy-paper-rear-gallop',pair*9+sample],['puppy-companion-comfort',comfort.scramble.frames[0]],{view:'rear',phase:comfort.scramble.entryPhase,speed:[0,PAPER_GAITS.rear.speed],positiveSpeed:true,matchVelocity:true,supports:entrySupport,supportEvidence:'source-paw-proxies',airborne:entrySupport.length===0});
 add('scramble/pickup-rear',['puppy-companion-comfort',comfort.scramble.frames.at(-1)],['puppy-companion-comfort',comfort.pickups.rear.frames[0]],{view:'rear',speed:[0,0],supports:rear.rearFeet[5][0].filter(f=>f.stance).map(f=>f.id),supportEvidence:'shared-pixels-with-labeled-rear-pose'});
 add('carry-settle/arrival-seat',['puppy-companion-comfort',comfort.carryTrot.settle.frames.at(-1)],['puppy-paper-arrival-seat',0],{view:'approach',speed:[0,0],supportEvidence:'shared-pose-only'});
 add('tug/seat',['puppy-companion-comfort',0],['puppy-paper-seat',50],{view:'approach',speed:[0,0],supportEvidence:'shared-pose-only'});
 for(const i of [90,107,108,125])add('watch-'+i+'/seat',['puppy-paper-behaviors',i],['puppy-paper-seat',50],{view:'approach',speed:[0,0],supportEvidence:'shared-pose-only'});
 return {version:1,sources,support,actionClips,routes:bakeRoutes(),joins};
}

export function motionModule(tables){
 return '// Generated by tools/bake-pet-motion.mjs. Do not edit by hand.\n// Source paw labels are image-space proxies, not anatomical motion capture.\nconst freeze=v=>{if(v&&typeof v===\'object\'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;};\nexport const BAKED_MOTION=freeze('+JSON.stringify(tables)+');\n';
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const output=join(ROOT,'puppy-motion-tables.generated.mjs'),text=motionModule(buildMotionTables());
 if(process.argv.includes('--check')){if(motionText(readFileSync(output,'utf8'))!==text)throw Error('Stale motion tables: run npm run bake:motion');}
 else writeFileSync(output,text);
 console.log(JSON.stringify({checked:process.argv.includes('--check'),bytes:Buffer.byteLength(text),file:output}));
}
