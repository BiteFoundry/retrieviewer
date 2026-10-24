// Offline QA only: inspect real packed keys and public Braille output.
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {readPackedFrames} from '../puppy-frame-store.mjs';
import {createPet} from '../retrieviewer.mjs';
import {png} from './check-comfort.mjs';
const wall=process.argv.includes('--wall'),clip=wall?'attention-wall':'attention-paw',dir=`dist/${clip}-frames`;mkdirSync(dir,{recursive:true});
const meta=JSON.parse(readFileSync('puppy-companion-comfort.json'));
const store=readPackedFrames(gunzipSync(readFileSync('puppy-companion-comfort-q5.bin.gz')));
const motion=wall?meta.attentionWall:meta.attentionPaw;
const raw=Buffer.concat(motion.frames.map(i=>Buffer.from(store.getFrame(i))));
// Alpha is for geometry diagnostics only. Runtime still uses unchanged luminance.
execFileSync('python',['-c',[
 'import sys',
 'from PIL import Image',
 'raw=sys.stdin.buffer.read()',
 'for i in range(len(raw)//102400):',
 ' im=Image.frombytes("L",(320,320),raw[i*102400:(i+1)*102400])',
 ' out=im.convert("RGBA");out.putalpha(im.point(lambda v:255 if v>16 else 0))',
 ' out.save(sys.argv[1]+"/frame-%02d.png"%i)',
].join('\n'),dir],{input:raw,windowsHide:true});
const pet=await createPet({seed:731});let count=0,seen=0;
try{
 pet.notify({kind:'approval',gesture:wall?'wall':'paw'});
 for(let i=0;i<900;i++){
  pet.step(1/60);if(i%3)continue;
  const frame=pet.frame({columns:200,rows:72,poseFps:30});
  if(frame.state.state!==clip)continue;
  if(seen++%6===0){writeFileSync(`dist/${wall?'attention-wall-v1':'attention-paw-v2'}/braille-${count++}.png`,png(frame));}
 }
 if(count<4)throw Error('Missing public paw frames');
 console.log(JSON.stringify({publicFrames:count,keys:motion.frames.length,dir}));
}finally{pet.dispose();}
