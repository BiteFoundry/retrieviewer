// Add six small whole-pose keys to the existing comfort family. No new archive,
// model, runtime buffer or process. Existing tug/sleep source pixels stay exact.
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {gunzipSync,gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {readPackedFrames,packFrames} from '../puppy-frame-store.mjs';
import {encodePredictiveFrames} from '../puppy-frame-predictive.mjs';
const stage='dist/scramble-art-v1',file='puppy-companion-comfort-q5.bin.gz',metaFile='puppy-companion-comfort.json';
const info=JSON.parse(readFileSync(metaFile)),store=readPackedFrames(gunzipSync(readFileSync(file)));
if(info.version!==2)throw Error('Start from the unchanged 13-frame comfort family');
execFileSync('python',['tools/prepare-scramble-art.py',stage],{stdio:'inherit',windowsHide:true});
const keys=readFileSync(stage+'/keys.gray'),raw=Buffer.concat([...Array.from({length:13},(_,i)=>Buffer.from(store.getFrame(i))),keys]);
if(raw.length!==19*320*320)throw Error('Wrong scramble key count');
const encoded=encodePredictiveFrames(packFrames(raw,320,320,19)),gz=gzipSync(encoded,{level:9}),check=readPackedFrames(encoded),sha=b=>createHash('sha256').update(b).digest('hex');
for(let i=0;i<13;i++)if(!Buffer.from(check.getFrame(i)).equals(Buffer.from(store.getFrame(i))))throw Error('Old comfort art changed');
const metadata={...info,version:3,frames:19,clips:[...info.clips,'scramble'],gzipBytes:gz.length,residentPixelBytes:check.residentPixelBytes,encodedSha256:sha(encoded),
 scramble:{frames:[18,13,14,15,16,17,18],times:[0,.1,.24,.4,.62,.84,1.12],duration:1.12,floorOffset:-4,sourceSheetSha256:sha(readFileSync(stage+'/sheet-source.png')),registration:JSON.parse(readFileSync(stage+'/registration.json'))}};
writeFileSync(stage+'/comfort-candidate-q5.bin.gz',gz);writeFileSync(stage+'/comfort-candidate.json',JSON.stringify(metadata,null,2));
if(process.argv.includes('--apply')){writeFileSync(file,gz);writeFileSync(metaFile,JSON.stringify(metadata,null,2)+'\n');}
console.log(JSON.stringify({gzipAdded:gz.length-info.gzipBytes,pixelPayloadAdded:check.residentPixelBytes-info.residentPixelBytes,applied:process.argv.includes('--apply')}));
