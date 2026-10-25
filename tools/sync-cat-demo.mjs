// Explicit, pinned public-demo export. Never copy a workspace or raw art folder.
import {writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const source=resolve(process.argv[2]??'../purrviewer');
const commit=execFileSync('git',['-C',source,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(!commit.startsWith('9da9e42'))throw Error('Expected reviewed Purrviewer9da9e42');
const files=['src/purrviewer.mjs','src/world.mjs','src/walk-cycle.mjs','src/life.mjs','src/contact.mjs','src/habitat.mjs',
 'vendor/retrieviewer/braille.mjs','vendor/retrieviewer/puppy-frame-store.mjs','vendor/retrieviewer/puppy-frame-predictive.mjs',
 'vendor/retrieviewer/LICENSE-CODE','LICENSE','art/ginger.json','art/ginger.bin.gz'];
const target=new URL('../docs/purrviewer/runtime/9da9e42/',import.meta.url),hashes={};
for(const name of files){
 const bytes=execFileSync('git',['-C',source,'show',commit+':'+name],{maxBuffer:2_000_000});
 hashes[name]=createHash('sha256').update(bytes).digest('hex');
 const out=new URL(name,target);await mkdir(dirname(fileURLToPath(out)),{recursive:true});
 await writeFile(out,bytes);
}
await writeFile(new URL('SOURCE.json',target),JSON.stringify({project:'Purrviewer',commit,files:hashes},null,2)+'\n');
console.log('Exported '+files.length+' pinned public demo files from '+commit);
