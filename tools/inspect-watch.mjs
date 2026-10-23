// Offline source-art inspection; no desktop or live pet is touched.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {readPackedFrames} from '../puppy-frame-store.mjs';
const out='dist/watch-qa';mkdirSync(out,{recursive:true});
for(const [family,indices] of [['seat',[50]],['behaviors',[90,94,98,99,103,107,108,112,116,117,121,125]]]){
 const s=readPackedFrames(gunzipSync(readFileSync(`puppy-paper-${family}-q5.bin.gz`)));
 for(const i of indices)writeFileSync(`${out}/${family}-${i}.gray`,s.getFrame(i));
}
