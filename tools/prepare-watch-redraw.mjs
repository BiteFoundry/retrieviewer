// Prepare an unreleased watch-art candidate. No shipped files are written unless
// --apply is explicit. Non-watch pixels and the logical frame count stay exact.
import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {gunzipSync,gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readPackedFrames,packFrames} from '../puppy-frame-store.mjs';
import {encodePredictiveFrames} from '../puppy-frame-predictive.mjs';
const stage=process.argv.find(a=>a.startsWith('--stage='))?.slice(8)??'dist/watch-redraw-v2';mkdirSync(stage,{recursive:true});
const sheet=stage+'/sheet-source.png',sha=b=>createHash('sha256').update(b).digest('hex');
const source=readPackedFrames(gunzipSync(readFileSync('puppy-paper-behaviors-q5.bin.gz')));
const seat=Uint8Array.from(readPackedFrames(gunzipSync(readFileSync('puppy-paper-seat-q5.bin.gz'))).getFrame(50));
writeFileSync(stage+'/seat.gray',seat);
execFileSync('python',['tools/prepare-watch-redraw.py',sheet,stage+'/seat.gray',stage],{stdio:'inherit',windowsHide:true});
const turns=readFileSync(stage+'/watch-36.gray'),n=320*320;
if(turns.length!==36*n)throw Error('Expected exactly 36 replacement watch samples');
const frames=Array.from({length:source.frameCount},(_,i)=>Buffer.from(i>=90&&i<126?turns.subarray((i-90)*n,(i-89)*n):source.getFrame(i)));
const raw=Buffer.concat(frames),encoded=encodePredictiveFrames(packFrames(raw,320,320,source.frameCount)),gz=gzipSync(encoded,{level:9});
const candidate=readPackedFrames(encoded);
for(let i=0;i<source.frameCount;i++){
 if(i<90||i>=126){if(!Buffer.from(candidate.getFrame(i)).equals(Buffer.from(source.getFrame(i))))throw Error('Non-watch frame changed: '+i);}
 else if([90,107,108,125].includes(i)&&!Buffer.from(candidate.getFrame(i)).equals(Buffer.from(seat)))throw Error('Canonical endpoint changed: '+i);
}
const registration={...JSON.parse(readFileSync(stage+'/registration.json')),sourceSheetSha256:sha(readFileSync(sheet)),canonicalSeat:50,method:'authored-whole-body-connected-weight-transfer',unchangedOtherFrames:true};
const quantizedHash=createHash('sha256');for(let i=0;i<candidate.frameCount;i++)quantizedHash.update(candidate.getFrame(i));
const entry={uniqueFrames:candidate.uniqueCount,encodedBytes:encoded.length,gzipBytes:gz.length,residentPixelBytes:candidate.residentPixelBytes,encodedSha256:sha(encoded),quantizedSha256:quantizedHash.digest('hex'),watchRegistration:registration};
writeFileSync(stage+'/behaviors-q5.bin.gz',gz);writeFileSync(stage+'/candidate.json',JSON.stringify(entry,null,2));
if(process.argv.includes('--apply')){
 copyFileSync(stage+'/behaviors-q5.bin.gz','puppy-paper-behaviors-q5.bin.gz');
 const manifest=JSON.parse(readFileSync('pet-q5-manifest.json'));Object.assign(manifest.entries['puppy-paper-behaviors'],entry);
 writeFileSync('pet-q5-manifest.json',JSON.stringify(manifest,null,1)+'\n');
}
console.log(JSON.stringify({candidate:stage+'/behaviors-q5.bin.gz',gzipBytes:gz.length,applied:process.argv.includes('--apply')}));
