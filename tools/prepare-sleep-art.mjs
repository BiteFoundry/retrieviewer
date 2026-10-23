// Offline, deterministic Q5 preparation. Original PNGs stay local, not in npm.
import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync,gzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {packFrames,readPackedFrames} from '../puppy-frame-store.mjs';
import {encodePredictiveFrames} from '../puppy-frame-predictive.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),stage=join(root,'dist/sleep-studies-v1');
const path=join(root,'puppy-companion-comfort-q5.bin.gz'),old=readPackedFrames(gunzipSync(readFileSync(path)));
const original=Array.from({length:9},(_,i)=>Uint8Array.from(old.getFrame(i)));
execFileSync('python',[join(root,'tools/prepare-sleep-art.py'),root],{stdio:'inherit',windowsHide:true});
const raw=Buffer.concat([...original,readFileSync(join(stage,'sleep-registered.gray'))]);
const encoded=encodePredictiveFrames(packFrames(raw,320,320,13)),gz=gzipSync(encoded,{level:9}),store=readPackedFrames(encoded);
for(let i=0;i<9;i++)if(!Buffer.from(store.getFrame(i)).equals(original[i]))throw Error('Existing tug pixels changed');
const meta=JSON.parse(readFileSync(join(root,'puppy-companion-comfort.json')));
Object.assign(meta,{version:2,frames:13,clips:['tug','sleep'],sleep:{side:9,belly:10,curl:11,chin:12},gzipBytes:gz.length,residentPixelBytes:store.residentPixelBytes,
 encodedSha256:createHash('sha256').update(encoded).digest('hex'),sleepRegistration:JSON.parse(readFileSync(join(stage,'sleep-registration.json'))),
 sleepSourceHashes:Object.fromEntries(['side','belly','curl','chin'].map(k=>[k,createHash('sha256').update(readFileSync(join(stage,k+'-source.png'))).digest('hex')]))});
writeFileSync(path,gz);writeFileSync(join(root,'puppy-companion-comfort.json'),JSON.stringify(meta,null,2)+'\n');
console.log(JSON.stringify({gzipBytes:gz.length,residentPixelBytes:store.residentPixelBytes,frames:13,existingTugUnchanged:true}));
