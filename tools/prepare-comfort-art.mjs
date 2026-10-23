// Reproducible preparation of a tiny key-pose family. Not used by the pet runtime.
import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {gunzipSync,gzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
import {packFrames,readPackedFrames} from '../puppy-frame-store.mjs';
import {encodePredictiveFrames} from '../puppy-frame-predictive.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),stage=join(root,'dist/comfort-art');
if(!process.argv[2])throw Error('Usage: node tools/prepare-comfort-art.mjs GENERATED_SHEET.png');
mkdirSync(stage,{recursive:true});
const sheet=resolve(process.argv[2]),neutral=readPackedFrames(gunzipSync(readFileSync(join(root,'puppy-paper-seat-q5.bin.gz')))).getFrame(50);
writeFileSync(join(stage,'neutral.gray'),neutral);
copyFileSync(sheet,join(stage,'tug-source-v1.png'));
execFileSync('python',[join(root,'tools/prepare-comfort-art.py'),sheet,join(stage,'neutral.gray'),join(stage,'keys.gray'),join(stage,'registration.json')],{stdio:'inherit',windowsHide:true});
const raw=readFileSync(join(stage,'keys.gray')),encoded=encodePredictiveFrames(packFrames(raw,320,320,9)),gz=gzipSync(encoded,{level:9});
writeFileSync(join(root,'puppy-companion-comfort-q5.bin.gz'),gz);
const sha=v=>createHash('sha256').update(v).digest('hex');
const store=readPackedFrames(encoded);
const meta={version:1,width:320,height:320,frames:9,clips:['tug'],gzipBytes:gz.length,residentPixelBytes:store.residentPixelBytes,
 sourceSheetSha256:sha(readFileSync(sheet)),neutralSha256:sha(neutral),encodedSha256:sha(encoded),
 method:'Built-in imagegen authored tug keys. One fixed scale, ground/center translation only. Exact existing Q5 seat first/last. No expanded tween film or live body deformation.',
 registration:JSON.parse(readFileSync(join(stage,'registration.json')))};
writeFileSync(join(root,'puppy-companion-comfort.json'),JSON.stringify(meta,null,2)+'\n');
console.log(JSON.stringify({gzipBytes:gz.length,residentPixelBytes:store.residentPixelBytes,frames:9}));
