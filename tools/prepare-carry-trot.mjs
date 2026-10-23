// Small authored cycle appended to the accepted comfort family; no expanded film.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {gunzipSync,gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {readPackedFrames,packFrames} from '../puppy-frame-store.mjs';
import {encodePredictiveFrames} from '../puppy-frame-predictive.mjs';
const stage='dist/carry-trot-v1';mkdirSync(stage,{recursive:true});
const read=file=>readPackedFrames(gunzipSync(readFileSync(file)));
writeFileSync(stage+'/stand.gray',read('puppy-paper-approach-q5.bin.gz').getFrame(5*9));
writeFileSync(stage+'/arrive.gray',read('puppy-paper-arrival-seat-q5.bin.gz').getFrame(0));
execFileSync('python',['tools/prepare-carry-trot.py',stage,...(process.argv.includes('--references')?['--references']:[])],{stdio:'inherit',windowsHide:true});
if(process.argv.includes('--references'))process.exit(0);
// Immutable staged v5 baseline, including all accepted pickup/stumble keys.
const previous='dist/stumble-runtime-v3',base=JSON.parse(readFileSync(previous+'/comfort-candidate.json'));
if(base.version!==5||base.frames!==37||base.encodedSha256!=='efa81c6f464646d101873223869cebf5ca28c80529ad4ab26380d3b97cc2af54')throw Error('Expected accepted v5 baseline');
const old=read(previous+'/comfort-candidate-q5.bin.gz'),keys=readFileSync(stage+'/keys.gray'),count=base.frames+keys.length/102400;
const raw=Buffer.concat([...Array.from({length:base.frames},(_,i)=>Buffer.from(old.getFrame(i))),keys]);
const encoded=encodePredictiveFrames(packFrames(raw,320,320,count)),gz=gzipSync(encoded,{level:9}),store=readPackedFrames(encoded);
const sha=b=>createHash('sha256').update(b).digest('hex');
for(let i=0;i<base.frames;i++)if(!Buffer.from(store.getFrame(i)).equals(Buffer.from(old.getFrame(i))))throw Error('Accepted comfort artwork changed');
const trot=JSON.parse(readFileSync(stage+'/motion.json'));
const meta={...base,version:6,frames:count,clips:[...base.clips,'carry-trot'],carryTrot:trot,
 scramble:{...base.scramble,times:[0,.035,.07,.105,.14,.19,.25,.32,.39,.48,.57,.65],duration:.65,brakeSeconds:.19,catchSeconds:.29,catchSpeedRatio:.24},
 gzipBytes:gz.length,residentPixelBytes:store.residentPixelBytes,encodedSha256:sha(encoded),
 carrySource:{encodedSha256:base.encodedSha256,frames:base.frames,gzipBytes:base.gzipBytes,residentPixelBytes:base.residentPixelBytes,sheetSha256:sha(readFileSync(stage+'/trot-source.png'))}};
writeFileSync(stage+'/comfort-candidate-q5.bin.gz',gz);writeFileSync(stage+'/comfort-candidate.json',JSON.stringify(meta,null,2)+'\n');
if(process.argv.includes('--apply')){writeFileSync('puppy-companion-comfort-q5.bin.gz',gz);writeFileSync('puppy-companion-comfort.json',JSON.stringify(meta,null,2)+'\n');}
console.log(JSON.stringify({frames:count,trotGzipAdded:gz.length-base.gzipBytes,trotPortablePixelAdded:store.residentPixelBytes-base.residentPixelBytes,applied:process.argv.includes('--apply')}));
