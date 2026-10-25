// Maintainer-only, manually inspected mouth centers of the exact v9 samples.
// Source canvases are 480px, renderer coordinates are canonical 320px.
// Never attach a prop to an estimated root height or infer an occluded muzzle.
import {readFileSync,writeFileSync} from 'node:fs';
const data=JSON.parse(readFileSync(new URL('../puppy-mouth-anchor.json',import.meta.url)));
const info=JSON.parse(readFileSync(new URL('../puppy-paper-actions-v9.json',import.meta.url)));
if(info.width!==480||info.samples!==9||info.pairs!==66||info.clips['walk-face-front'][0]!==51||info.clips['walk-face-rear'][0]!==52)throw Error('Reinspect changed turn artwork');
const measured={
 51:[[272,318],[277,317],[283,315],[289,315],[304,304],[315,300],[322,299],[325,299],[332,298]],
 52:[null,null,null,null,null,[317,300],[325,299],[328,299],[332,298]],
};
const frames=Array(info.pairs*info.samples).fill(null);
for(const [pair,points] of Object.entries(measured))points.forEach((p,i)=>{
 if(p)frames[Number(pair)*9+i]=[p[0]-80,p[1]-150,1,null];
});
data.families.actions={sha256:info.sha256,frames};
const json=new URL('../puppy-mouth-anchor.json',import.meta.url),module=new URL('../puppy-mouth-anchor.mjs',import.meta.url);
const source=readFileSync(module,'utf8').replace(/\/\*BEGIN GENERATED\*\/[\s\S]*?\/\*END GENERATED\*\//,'/*BEGIN GENERATED*/'+JSON.stringify(data)+'/*END GENERATED*/');
if(process.argv.includes('--check')){
 if(readFileSync(json,'utf8')!==JSON.stringify(data)+'\n'||readFileSync(module,'utf8')!==source)throw Error('Turn mouth annotations are stale');
}else{writeFileSync(json,JSON.stringify(data)+'\n');writeFileSync(module,source);}
console.log('Standing turn mouth samples: inspected, canonicalized, hash-bound');
