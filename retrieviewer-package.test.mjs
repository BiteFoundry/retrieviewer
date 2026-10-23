import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {getPetAssetFiles,DEFAULT_ART_PROFILE} from './retrieviewer.mjs';

const root=new URL('./',import.meta.url),pkg=JSON.parse(readFileSync(new URL('package.json',root)));
const included=name=>pkg.files.some(p=>name===p||name.startsWith(p+'/'));
test('local package includes transitive runtime imports and assets, not project history',()=>{
 const seen=new Set(),queue=['retrieviewer.mjs','retrieviewer-stdio.mjs','retrieviewer-plugin.mjs','retrieviewer-cli.mjs','integrations/opencode/tui.tsx'].map(n=>new URL(n,root));
 while(queue.length){
  const url=queue.pop();if(seen.has(url.href))continue;seen.add(url.href);
  const name=decodeURIComponent(url.href.slice(root.href.length));
  assert.ok(included(name),`missing runtime import: ${name}`);
  assert.ok(existsSync(url),`missing file: ${fileURLToPath(url)}`);
  const source=readFileSync(url,'utf8');
  for(const m of source.matchAll(/\b(?:from\s*|import\s*\()\s*['"](\.[^'"]+)['"]/g))queue.push(new URL(m[1],url));
 }
 assert.equal(DEFAULT_ART_PROFILE,'q5');
 for(const name of getPetAssetFiles()){
  assert.ok(included(name),`missing asset: ${name}`);assert.ok(existsSync(new URL(name,root)));
 }
 assert.equal(pkg.name,'@bitefoundry/retrieviewer');assert.equal(pkg.version,'0.0.8');
 assert.equal(pkg.private,false,'public release candidate');
 const policy=JSON.parse(readFileSync(new URL('release-policy.json',root)));
 for(const key of ['artLicenseTermsApproved','assetRightsReviewCompleted','artRedistributionApproved','publicPublishApproved'])assert.equal(policy[key],true,key);
 assert.equal(policy.artLicense,'CC-BY-SA-4.0');
 assert.equal(pkg.license,'SEE LICENSE IN LICENSE');
 assert.equal(pkg.exports['./tui'],'./integrations/opencode/tui.tsx');
 for(const file of ['LICENSE','LICENSE-CODE','ASSETS-LICENSE.md','ATTRIBUTION.md','ASSET-PROVENANCE.md','THIRD-PARTY-NOTICES.md','TRADEMARKS.md'])assert.ok(included(file));
 assert.match(readFileSync(new URL('ASSETS-LICENSE.md',root),'utf8'),/licenses\/by-sa\/4\.0\/legalcode/);
 const credits=readFileSync(new URL('ATTRIBUTION.md',root),'utf8');
 for(const credit of ['Scott','Stefan Bauer','licenses/by/2.0/','licenses/by-sa/2.5/'])assert.ok(credits.includes(credit));
 assert.equal(pkg.publishConfig.access,'public');
 assert.equal(pkg.exports['.'].default,'./retrieviewer.mjs');
 assert.equal(pkg.exports['.'].types,'./retrieviewer.d.mts');
 assert.ok(included(pkg.bin['retrieviewer-stdio'].replace(/^\.\//,'')));
 for(const name of ['references/private.png','worker-packets/task.md','puppy-interactions16-v2-sheet.png','puppy-companion-interactions-v1.bin.gz'])assert.equal(included(name),false);
 for(const name of getPetAssetFiles('original').filter(n=>n.endsWith('.gz')))assert.equal(included(name),false,'no redundant original cache in runtime package');
 assert.equal(getPetAssetFiles().length,19);assert.ok(Object.isFrozen(getPetAssetFiles()));
 assert.equal(included('locomotion-puppy.animal'),false);
 assert.equal(included('locomotion-core.mjs'),false);
 assert.equal(included('vendor/procedural-animals/src'),false);
 assert.equal(pkg.dependencies.three,undefined,'no 3D renderer installed for a dot-art pet');
 assert.throws(()=>getPetAssetFiles('bad'),RangeError);
 assert.equal(pkg.exports['./plugin'].types,'./retrieviewer-plugin.d.mts');
 assert.equal(included('puppy-stride-tweens.bin.gz'),false);
 assert.ok(included('vendor/procedural-animals/LICENSE'));
});
