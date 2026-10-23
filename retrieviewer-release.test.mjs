import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRelease,PACKAGE_NAME} from './tools/check-release.mjs';

const fixture=()=>({
  pkg:{name:PACKAGE_NAME,version:'0.0.1',private:false,license:'SEE LICENSE IN LICENSE',
    scripts:{test:'node --test'},exports:{'.':'./retrieviewer.mjs','./tui':'./integrations/opencode/tui.tsx'}},
  lock:{name:PACKAGE_NAME,version:'0.0.1',lockfileVersion:3,
    packages:{'':{name:PACKAGE_NAME,version:'0.0.1',license:'SEE LICENSE IN LICENSE'}}},
  files:['LICENSE','LICENSE-CODE','ASSETS-LICENSE.md','ATTRIBUTION.md','ASSET-PROVENANCE.md','THIRD-PARTY-NOTICES.md','TRADEMARKS.md','package.json','retrieviewer.mjs',
    'integrations/opencode/tui.tsx','puppy-stride-tweens-q5.bin.gz','vendor/procedural-animals/LICENSE'],
  policy:{version:1,packageName:PACKAGE_NAME,artLicense:'CC-BY-SA-4.0',artLicenseTermsApproved:true,assetRightsReviewCompleted:true,
    artRedistributionApproved:true,publicPublishApproved:true},
});
const APPROVAL_FLAGS=['artLicenseTermsApproved','assetRightsReviewCompleted','artRedistributionApproved','publicPublishApproved'];
const errorsWith=mutate=>{const input=fixture();mutate(input);return validateRelease(input);};
const hasError=(errors,pattern)=>assert.ok(errors.some(e=>pattern.test(e)),`expected ${pattern} in ${JSON.stringify(errors)}`);

test('fully approved valid fixture passes',()=>assert.deepEqual(validateRelease(fixture()),[]));

test('each approval flag blocks independently when false, missing or not literal true',()=>{
  for(const flag of APPROVAL_FLAGS)
    for(const [label,mutate] of [['false',p=>{p[flag]=false;}],['missing',p=>{delete p[flag];}],
      ['string true',p=>{p[flag]='true';}],['number 1',p=>{p[flag]=1;}],['null',p=>{p[flag]=null;}]]){
      const errors=errorsWith(i=>mutate(i.policy));
      assert.equal(errors.length,1,`${flag} ${label}: ${JSON.stringify(errors)}`);
      hasError(errors,new RegExp(`^BLOCKED: release policy ${flag} is .*must be exactly true$`));
    }
});

test('parent-planned policy (only artLicenseTermsApproved true) stays blocked on the other three',()=>{
  const errors=errorsWith(i=>{i.policy.assetRightsReviewCompleted=i.policy.artRedistributionApproved=i.policy.publicPublishApproved=false;});
  assert.equal(errors.length,3);
  for(const flag of APPROVAL_FLAGS.slice(1))hasError(errors,new RegExp(`BLOCKED: .*${flag}`));
  assert.ok(!errors.some(e=>/artLicenseTermsApproved/.test(e)));
});

test('approvals are required regardless of private flag and are not mutated',()=>{
  for(const priv of [false,true]){
    const input=fixture();input.pkg.private=priv;for(const flag of APPROVAL_FLAGS)input.policy[flag]=false;
    const before=JSON.stringify(input.policy);
    const errors=validateRelease(input);
    for(const flag of APPROVAL_FLAGS)hasError(errors,new RegExp(`BLOCKED: .*${flag}`));
    assert.equal(JSON.stringify(input.policy),before);
  }
});

test('policy version and packageName',()=>{
  hasError(errorsWith(i=>{i.policy.version=2;}),/policy version/);
  hasError(errorsWith(i=>{i.policy.packageName='retrieviewer';}),/policy packageName/);
});

test('private must be exactly false',()=>{
  hasError(errorsWith(i=>{i.pkg.private=true;}),/private must be false/);
  hasError(errorsWith(i=>{delete i.pkg.private;}),/private must be false/);
});

test('license field and packed license files',()=>{
  hasError(errorsWith(i=>{i.pkg.license='MIT';}),/license must be/);
  for(const file of ['LICENSE','LICENSE-CODE','ASSETS-LICENSE.md','ATTRIBUTION.md','ASSET-PROVENANCE.md','THIRD-PARTY-NOTICES.md','TRADEMARKS.md']){
    const errors=errorsWith(i=>{i.files=i.files.filter(f=>f!==file);});
    assert.equal(errors.length,1);hasError(errors,new RegExp(`missing ${file.replaceAll('.','\\.')}$`));
  }
  assert.deepEqual(errorsWith(i=>{i.files=i.files.map(f=>f==='TRADEMARKS.md'?'./TRADEMARKS.md':f);}),[]);
});

test('tui export and file must match',()=>{
  hasError(errorsWith(i=>{delete i.pkg.exports['./tui'];}),/exports\["\.\/tui"\]/);
  hasError(errorsWith(i=>{i.pkg.exports['./tui']='./tui.tsx';}),/exports\["\.\/tui"\]/);
  assert.deepEqual(errorsWith(i=>{i.pkg.exports['./tui']={default:'./integrations/opencode/tui.tsx'};}),[]);
  hasError(errorsWith(i=>{i.files=i.files.filter(f=>f!=='integrations/opencode/tui.tsx');}),/missing integrations\/opencode\/tui\.tsx/);
});

test('name and version',()=>{
  hasError(errorsWith(i=>{i.pkg.name='retrieviewer-playground';i.lock.name=i.lock.packages[''].name=i.pkg.name;}),/name must be @bitefoundry/);
  for(const version of ['0.0','v0.0.1','01.0.0','0.0.1-',7,undefined])
    hasError(errorsWith(i=>{i.pkg.version=i.lock.version=i.lock.packages[''].version=version;}),/not valid semver/);
  assert.deepEqual(errorsWith(i=>{i.pkg.version=i.lock.version=i.lock.packages[''].version='1.2.3-rc.1+build.5';}),[]);
});

test('lockfile must match package',()=>{
  hasError(errorsWith(i=>{i.lock.name='retrieviewer-playground';}),/package-lock\.json name/);
  hasError(errorsWith(i=>{i.lock.version='0.2.0';}),/package-lock\.json version/);
  hasError(errorsWith(i=>{i.lock.packages[''].name='x';}),/root name/);
  hasError(errorsWith(i=>{i.lock.packages[''].version='0.2.0';}),/root version/);
  hasError(errorsWith(i=>{i.lock.packages[''].license='UNLICENSED';}),/root license/);
  hasError(errorsWith(i=>{delete i.lock.packages;}),/root entry missing/);
});

test('install lifecycle scripts are rejected',()=>{
  for(const name of ['preinstall','install','postinstall','prepare'])
    hasError(errorsWith(i=>{i.pkg.scripts[name]='node x.mjs';}),new RegExp(`lifecycle script "${name}"`));
  hasError(errorsWith(i=>{i.pkg.scripts='rm -rf';}),/scripts must be an object/);
  assert.deepEqual(errorsWith(i=>{delete i.pkg.scripts;}),[]);
});

test('leaked paths are rejected and Q5 default must ship',()=>{
  for(const leak of ['references/a.png','worker-packets/x/receipt.md','qa-opencode/log.txt','dist/x.tgz',
    'nested/dist/x.js','.env','config/.env.local','.npmrc','puppy-stride-tweens.bin.gz','puppy-stride-tweens-compact.bin.gz'])
    hasError(errorsWith(i=>{i.files.push(leak);}),new RegExp(`packed file ${leak.replace(/[.]/g,'\\.')} rejected`));
  assert.deepEqual(errorsWith(i=>{i.files.push('./references-guide.md','environment.md');}),[]);
  hasError(errorsWith(i=>{i.files=i.files.filter(f=>!f.endsWith('-q5.bin.gz'));}),/no Q5 art archive/);
});

test('malformed and missing inputs never throw',()=>{
  for(const input of [undefined,{},{pkg:null,lock:'x',files:'LICENSE',policy:[]},{pkg:[],lock:[],files:[1,null],policy:7},
    {...fixture(),pkg:{...fixture().pkg,exports:null}},{...fixture(),lock:{packages:{'':null}}}]){
    const errors=validateRelease(input);
    assert.ok(Array.isArray(errors)&&errors.length>0&&errors.every(e=>typeof e==='string'),JSON.stringify(input));
  }
  hasError(validateRelease({}),/release-policy\.json missing/);
  hasError(validateRelease({}),/package\.json missing/);
  hasError(validateRelease({}),/package-lock\.json missing/);
  hasError(validateRelease({}),/packed file list missing/);
});

test('null and non-object top-level input fail closed without throwing',()=>{
  for(const input of [null,7,'x',true,[],[fixture()],()=>fixture(),Symbol('x'),10n]){
    let errors;
    assert.doesNotThrow(()=>{errors=validateRelease(input);},String(typeof input));
    assert.ok(Array.isArray(errors)&&errors.length===1&&/^release input must be an object/.test(errors[0]),String(errors));
  }
});

test('art license policy rejects the old restricted draft and missing license',()=>{
  for(const license of [undefined,'MIT','Retrieviewer-Artwork-1.0'])
    hasError(errorsWith(i=>{i.policy.artLicense=license;}),/artLicense must be CC-BY-SA-4.0/);
});

test('importing has no side effects',async()=>{
  const before=process.exitCode;
  await import('./tools/check-release.mjs?again');
  assert.equal(process.exitCode,before);
});
