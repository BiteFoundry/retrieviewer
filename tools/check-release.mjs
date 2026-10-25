// Release gate for @bitefoundry/retrieviewer. Pure validateRelease() plus a CLI that
// only enumerates `npm pack --dry-run` paths: no publish, auth, registry or install.
import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const PACKAGE_NAME='@bitefoundry/retrieviewer';
export const TUI_ENTRY='./integrations/opencode/tui.tsx';
const REQUIRED_FILES=['LICENSE','LICENSE-CODE','ASSETS-LICENSE.md','ATTRIBUTION.md','ASSET-PROVENANCE.md','THIRD-PARTY-NOTICES.md','TRADEMARKS.md'];
const FORBIDDEN_SCRIPTS=['preinstall','install','postinstall','prepare'];
// Independent gates: approved asset terms, reviewed asset rights/provenance, art
// redistribution, and final publication. Each must be literally true; none implies another.
const APPROVALS=['artLicenseTermsApproved','assetRightsReviewCompleted','artRedistributionApproved','publicPublishApproved'];
// Official semver 2.0.0 grammar.
const SEMVER=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
const isObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const show=v=>JSON.stringify(v)??String(v);

function leakReason(path){
  const segments=path.split('/'),base=segments.at(-1);
  const dir=segments.slice(0,-1).find(s=>['references','worker-packets','qa-opencode','dist'].includes(s));
  if(dir)return `${dir}/ is not distributable`;
  if(base==='.env'||base.startsWith('.env.'))return 'environment file';
  if(base==='.npmrc')return 'npm credentials/config file';
  if(!['integrations/purrviewer/art/ginger.bin.gz','integrations/purrviewer/art/ginger.rvz'].includes(path)&&(base.endsWith('.bin.gz')||base.endsWith('.rvz'))&&!base.endsWith('-q5.bin.gz')&&!base.endsWith('-q5.rvz'))return 'non-Q5 art archive (Q5 is the packaged default)';
  return null;
}

export function validateRelease(input={}){
  // Fail closed on null/non-object input instead of throwing during destructuring.
  if(!isObject(input))return [`release input must be an object, got ${input===null?'null':Array.isArray(input)?'array':typeof input}`];
  const {pkg,lock,files,policy}=input;
  const errors=[];
  // Policy: preparation may pass every other check while approvals stay false.
  if(!isObject(policy))errors.push('release-policy.json missing or not an object');
  else {
    if(policy.version!==1)errors.push(`release policy version must be 1, got ${show(policy.version)}`);
    if(policy.packageName!==PACKAGE_NAME)errors.push(`release policy packageName must be ${PACKAGE_NAME}, got ${show(policy.packageName)}`);
    if(policy.artLicense!=='CC-BY-SA-4.0')errors.push('release policy artLicense must be CC-BY-SA-4.0');
    for(const flag of APPROVALS)if(policy[flag]!==true)errors.push(`BLOCKED: release policy ${flag} is ${show(policy[flag])}, must be exactly true`);
  }
  if(!isObject(pkg)){errors.push('package.json missing or not an object');}
  else {
    if(pkg.private!==false)errors.push(`package.json private must be false, got ${show(pkg.private)}`);
    if(pkg.name!==PACKAGE_NAME)errors.push(`package.json name must be ${PACKAGE_NAME}, got ${show(pkg.name)}`);
    if(typeof pkg.version!=='string'||!SEMVER.test(pkg.version))errors.push(`package.json version is not valid semver: ${show(pkg.version)}`);
    if(pkg.license!=='SEE LICENSE IN LICENSE')errors.push(`package.json license must be "SEE LICENSE IN LICENSE", got ${show(pkg.license)}`);
    if(pkg.scripts!==undefined&&!isObject(pkg.scripts))errors.push('package.json scripts must be an object');
    else for(const name of FORBIDDEN_SCRIPTS)if(pkg.scripts&&Object.hasOwn(pkg.scripts,name))errors.push(`package.json must not define lifecycle script "${name}"`);
    const tui=isObject(pkg.exports)?pkg.exports['./tui']:undefined;
    const target=typeof tui==='string'?tui:isObject(tui)?(tui.default??tui.import):undefined;
    if(target!==TUI_ENTRY)errors.push(`package.json exports["./tui"] must be "${TUI_ENTRY}", got ${show(tui)}`);
  }
  if(!isObject(lock))errors.push('package-lock.json missing or not an object');
  else if(isObject(pkg)){
    if(lock.name!==pkg.name)errors.push(`package-lock.json name ${show(lock.name)} does not match package ${show(pkg.name)}`);
    if(lock.version!==pkg.version)errors.push(`package-lock.json version ${show(lock.version)} does not match package ${show(pkg.version)}`);
    const root=isObject(lock.packages)?lock.packages['']:undefined;
    if(!isObject(root))errors.push('package-lock.json packages[""] root entry missing');
    else for(const key of ['name','version','license'])
      if(root[key]!==pkg[key])errors.push(`package-lock.json root ${key} ${show(root[key])} does not match package ${show(pkg[key])}`);
  }
  if(!Array.isArray(files)||!files.every(f=>typeof f==='string')){errors.push('packed file list missing or not an array of path strings');return errors;}
  const paths=new Set(files.map(f=>f.replace(/^(\.\/)+/,'')));
  for(const required of REQUIRED_FILES)if(!paths.has(required))errors.push(`packed files missing ${required}`);
  if(!paths.has(TUI_ENTRY.slice(2)))errors.push(`packed files missing ${TUI_ENTRY.slice(2)} (exports["./tui"] target)`);
  if(![...paths].some(p=>p.endsWith('-q5.bin.gz')||p.endsWith('-q5.rvz')))errors.push('packed files contain no Q5 art archive (Q5 default must ship)');
  for(const path of [...paths].sort()){const reason=leakReason(path);if(reason)errors.push(`packed file ${path} rejected: ${reason}`);}
  return errors;
}

function readJson(path){try{return JSON.parse(readFileSync(path,'utf8'));}catch{return undefined;}}

export function packedPaths(cwd){
  const npm=process.env.npm_execpath;
  if(!npm||!existsSync(npm))throw Error('Run via an npm script (npm_execpath is required).');
  const out=execFileSync(process.execPath,[npm,'pack','--dry-run','--ignore-scripts','--json'],{cwd,encoding:'utf8',timeout:120000,maxBuffer:2e7});
  const [packed]=JSON.parse(out);
  return packed.files.map(f=>f.path);
}

export function main(cwd=process.cwd()){
  const pkg=readJson(join(cwd,'package.json')),lock=readJson(join(cwd,'package-lock.json')),policy=readJson(join(cwd,'release-policy.json'));
  let files;
  try{files=packedPaths(cwd);}catch(error){console.error(`release check: npm pack --dry-run failed: ${error.message}`);}
  const errors=validateRelease({pkg,lock,files,policy});
  if(errors.length){console.error(`release check BLOCKED (${errors.length}):`);for(const e of errors)console.error(`- ${e}`);process.exitCode=1;}
  else console.log(`release check passed: ${pkg.name}@${pkg.version}, ${files.length} packed files`);
  return errors;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
