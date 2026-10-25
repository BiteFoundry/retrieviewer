import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const base=new URL('./docs/purrviewer/runtime/9da9e42/',import.meta.url);
test('public cat demo contains exactly the reviewed runtime allowlist with intact assets and licenses',()=>{
 const manifest=JSON.parse(readFileSync(new URL('SOURCE.json',base)));
 assert.equal(manifest.commit,'9da9e428315126c6eb2a76e4a450e652c743937a');
 assert.deepEqual(Object.keys(manifest.files).sort(),['LICENSE','art/ginger.bin.gz','art/ginger.json','src/contact.mjs','src/habitat.mjs','src/life.mjs','src/purrviewer.mjs','src/walk-cycle.mjs','src/world.mjs','vendor/retrieviewer/LICENSE-CODE','vendor/retrieviewer/braille.mjs','vendor/retrieviewer/puppy-frame-predictive.mjs','vendor/retrieviewer/puppy-frame-store.mjs'].sort());
 for(const [path,sha] of Object.entries(manifest.files))assert.equal(createHash('sha256').update(readFileSync(new URL(path,base))).digest('hex'),sha,path);
 const actual=[];function visit(url,prefix=''){for(const ent of readdirSync(url,{withFileTypes:true})){const path=prefix+ent.name;if(ent.isDirectory())visit(new URL(ent.name+'/',url),path+'/');else actual.push(path);}}
 visit(base);assert.deepEqual(actual.sort(),[...Object.keys(manifest.files),'SOURCE.json'].sort());
 const notice=readFileSync(new URL('./docs/purrviewer/NOTICE.txt',import.meta.url),'utf8');assert.match(notice,/No redistribution license/);
 const pkg=JSON.parse(readFileSync(new URL('./package.json',import.meta.url)));
 assert.ok(!pkg.files.some(f=>f==='docs'||f.startsWith('docs/')),'cat demo is not added to the dog npm package');
});
