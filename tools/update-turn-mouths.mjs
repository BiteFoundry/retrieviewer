// Maintainer-only: mouth centers inspected on each exact turn source canvas.
// 480px canvas coordinates are converted to the renderer's 320px origin.
import {readFileSync,writeFileSync} from 'node:fs';
const data=JSON.parse(readFileSync(new URL('../puppy-mouth-anchor.json',import.meta.url)));
const info=JSON.parse(readFileSync(new URL('../puppy-paper-actions-v9.json',import.meta.url)));
if(info.width!==480||info.samples!==9||info.pairs!==68||info.clips['walk-face-front'].join()!=='51,66'||info.clips['walk-face-rear'].join()!=='52,67')throw Error('Reinspect changed turn artwork');
const front=[[272,318],[280,315],[290,312],[300,310],[306,307],[306,307],[320,306],[320,306],[321,305],[326,303],[326,303],[328,303],[325,300],[325,300],[320,298],[320,298],[332,298]];
const rear=[null,null,null,null,null,null,null,[326,295],[359,300],[335,300],[320,307],[320,303],[326,303],[326,301],[326,301],[322,299],[332,298]];
const half=[[332,298],[332,298],[320,300],[320,300],[290,306],[290,306],[274,310],[274,310],[273,310],[273,310],[273,310],[273,310],[254,307],[254,307],[231,305],[227,305],[209,304],[205,304],[192,303],[188,303],[179,302],[175,302],[151,300],[147,300],[148,298]];
const frames=Array(info.pairs*info.samples).fill(null);
for(const [list,pairs] of [[front,[51,66]],[rear,[52,67]],[half,[53,54,55]]])for(let j=0;j<pairs.length;j++)for(let k=0;k<9;k++){const p=list[j*8+k];if(p)frames[pairs[j]*9+k]=[p[0]-80,p[1]-150,1,null];}
data.families.actions={sha256:info.sha256,frames};
const json=new URL('../puppy-mouth-anchor.json',import.meta.url),module=new URL('../puppy-mouth-anchor.mjs',import.meta.url);
const source=readFileSync(module,'utf8').replace(/\/\*BEGIN GENERATED\*\/[\s\S]*?\/\*END GENERATED\*\//,'/*BEGIN GENERATED*/'+JSON.stringify(data)+'/*END GENERATED*/');
if(process.argv.includes('--check')){if(readFileSync(json,'utf8')!==JSON.stringify(data)+'\n'||readFileSync(module,'utf8')!==source)throw Error('Turn mouth annotations are stale');}else{writeFileSync(json,JSON.stringify(data)+'\n');writeFileSync(module,source);}
console.log('Standing turn mouth samples: inspected, canonicalized, hash-bound');
