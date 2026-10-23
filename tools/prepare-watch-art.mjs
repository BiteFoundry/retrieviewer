// Reproducible from the unmodified 0.0.5 source archive passed as argv[2].
// Only 36 existing watch samples change; all other behaviors are byte-exact.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {gunzipSync,gzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readPackedFrames,packFrames} from '../puppy-frame-store.mjs';
import {encodePredictiveFrames} from '../puppy-frame-predictive.mjs';
if(!process.argv[2])throw Error('Pass the unmodified 0.0.5 package directory');
const root=process.argv[2],p='dist/watch-qa';mkdirSync(p,{recursive:true});
const source=gunzipSync(readFileSync(root+'/puppy-paper-behaviors-q5.bin.gz'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
if(sha(source)!=='38cfdfcee9c857c56a14f0a9734cb3301b4a04cb8e1ae3fb2e2b2ffe3666240f')throw Error('Expected unchanged 0.0.5 behavior archive');
const manifest=JSON.parse(readFileSync('pet-q5-manifest.json'));
const store=readPackedFrames(source),seat=readPackedFrames(gunzipSync(readFileSync(root+'/puppy-paper-seat-q5.bin.gz')));
const raw=Buffer.concat(Array.from({length:store.frameCount},(_,i)=>Buffer.from(store.getFrame(i))));
writeFileSync(p+'/behaviors-source.gray',raw);writeFileSync(p+'/seat-50.gray',seat.getFrame(50));
execFileSync('python',['tools/prepare-watch-art.py'],{stdio:'inherit',windowsHide:true});
const adjusted=readFileSync(p+'/behaviors-registered.gray');
const encoded=encodePredictiveFrames(packFrames(adjusted,320,320,store.frameCount)),gz=gzipSync(encoded,{level:9}),check=readPackedFrames(encoded);
for(let i=0;i<store.frameCount;i++)if((i<90||i>=126)&&!Buffer.from(check.getFrame(i)).equals(raw.subarray(i*102400,(i+1)*102400)))throw Error('Non-watch art changed');
writeFileSync('puppy-paper-behaviors-q5.bin.gz',gz);
Object.assign(manifest.entries['puppy-paper-behaviors'],{encodedBytes:encoded.length,gzipBytes:gz.length,residentPixelBytes:check.residentPixelBytes,encodedSha256:sha(encoded),quantizedSha256:sha(Buffer.concat(Array.from({length:check.frameCount},(_,i)=>Buffer.from(check.getFrame(i))))),watchRegistration:{sourceVersion:'0.0.5',sourceEncodedSha256:sha(source),canonicalSeat:50,bodyFromY:210,neckBlendFromY:180,headTranslateY:8,unchangedOtherFrames:true}});
writeFileSync('pet-q5-manifest.json',JSON.stringify(manifest,null,1)+'\n');
console.log(JSON.stringify({gzipBytes:gz.length,watchFrames:36,otherFramesUnchanged:true}));
