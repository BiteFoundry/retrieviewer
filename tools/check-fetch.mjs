// Candidate-art preview through the unmodified public pet API. No test-only
// pattern override: the four clips are collected from actual seeded throws.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {gunzipSync,deflateRawSync,inflateRawSync} from 'node:zlib';
import {readPackedFrames} from '../puppy-frame-store.mjs';
import assert from 'node:assert/strict';
import {createPet,defaultLoadAsset} from '../retrieviewer.mjs';
import {cropFrame} from '../integrations/windows-overlay/protocol.mjs';
const comfort='dist/carry-trot-v1',watch='dist/watch-redraw-v2';
const candidates=new Map([
 ['puppy-companion-comfort.json',readFileSync(comfort+'/comfort-candidate.json')],
 ['puppy-companion-comfort-q5.bin.gz',readFileSync(comfort+'/comfort-candidate-q5.bin.gz')],
 ['puppy-paper-behaviors-q5.bin.gz',readFileSync(watch+'/behaviors-q5.bin.gz')],
]);
const useDefault=process.argv.includes('--default');
const returnStyle=process.argv.find(a=>a.startsWith('--return-style='))?.slice('--return-style='.length)??'auto';
if(!['auto','brake','trot','run-trot'].includes(returnStyle))throw Error('Invalid return style');
if(useDefault){
 assert.deepEqual(JSON.parse(readFileSync('puppy-companion-comfort.json')),JSON.parse(candidates.get('puppy-companion-comfort.json')));
 assert.deepEqual(readFileSync('puppy-companion-comfort-q5.bin.gz'),candidates.get('puppy-companion-comfort-q5.bin.gz'));
}
const pet=await createPet({seed:731,returnStyle,...useDefault?{}:{loadAsset:name=>candidates.get(name)??defaultLoadAsset(name)}}),clips=[];
const columns=240,rows=90,fps=15;
let clock=0;
try{
 for(let throwNo=0;throwNo<40&&clips.length<4;throwNo++){
  assert.equal(pet.interact('ball'),true);
  const start=pet.frame({columns,rows}).report,pattern=start.fetchPattern,returnMode=start.returnMode,frames=[],capture=!clips.some(c=>c.pattern===pattern);let complete=false,remaining=0;
  for(let i=0;i<60*60;i++){
   pet.step(1/60);clock+=1/60;if(i%4)continue;
   const f=pet.frame({columns,rows,poseFps:30});
   if(f.state.state==='pickup'){
    assert.ok(['rear','front'].includes(f.state.view));assert.equal(f.state.seatProgress,null);assert.equal(f.state.speed,0);assert.equal(f.report.gesture,null);
    if(f.state.view==='rear'){assert.ok(f.report.ball,'rear pickup keeps the same ball');if(f.report.ball.carried)assert.equal(f.report.ball.occluded,true,'carried rear muzzle is occluded');}
    else assert.equal(f.mouth?.family,'comfort','visible side pickup ball follows an authored mouth');
   }
   if(capture)frames.push({...cropFrame(f,1),intent:f.report.intent,pose:f.state.state,time:i/60,ball:f.report.ball,xWorld:f.state.x,zWorld:f.state.z,speed:f.state.speed,view:f.state.view,comfortPose:f.state.comfortPose,returnMode:f.report.returnMode});
   if(!f.report.busy){complete=true;remaining=f.report.cooldowns.ball;break;}
   if(i%60===0)await new Promise(setImmediate);
  }
  assert.ok(complete,'fetch timeout: '+pattern);
  if(capture)clips.push({pattern,returnMode,frames});
  for(let i=0;i<Math.ceil(remaining*60)+1;i++){pet.step(1/60);clock+=1/60;}
 }
 assert.equal(clips.length,4);
 const tumble=clips.find(c=>c.pattern==='tumble').frames,entry=tumble.findIndex(f=>f.pose==='scramble'),impact=tumble.filter(f=>f.pose==='scramble');
 assert.ok(entry>0);assert.equal(tumble[entry-1].pose,'run');assert.ok(impact[0].speed>0);assert.equal(impact.at(-1).speed,0);
 assert.ok(impact[0].zWorld-impact.at(-1).zWorld>.01,'momentum continues deeper into the same pursuit');
 assert.ok(tumble.filter(f=>['fetch','tumble','pickup'].includes(f.intent)).every(f=>Math.abs(f.xWorld-tumble[0].xWorld)<1e-9),'no lateral showcase detour');
 assert.ok(!tumble.some(f=>f.intent==='reChase'),'the tumble ends at the ball, no backwards second fetch');
 assert.ok(clips.find(c=>c.pattern==='clean').frames.some(f=>f.pose==='pickup'&&f.view==='rear'));
 const data={title:'Retrieviewer · 공놀이 후보 검수',note:'제동 / 총총 / 달리다 총총 · 자동은 세 동작을 섞어서 · 실제 엔진',returnStyle,columns,rows,fps,clips};
 mkdirSync('dist/fetch-qa',{recursive:true});mkdirSync('site-dist',{recursive:true});
 const suffix=returnStyle==='auto'?'':'-'+returnStyle;
 writeFileSync('dist/fetch-qa/replay'+suffix+'.json',JSON.stringify(data));writeFileSync('site-dist/fetch-preview'+suffix+'.json',JSON.stringify(data));
 writeFileSync('site-dist/fetch-preview.html',readFileSync('tools/butterfly-preview.html'));
 const meta=JSON.parse(candidates.get('puppy-companion-comfort.json')),base=JSON.parse(readFileSync('dist/stumble-runtime-v3/source-comfort.json'));
 const codec={compress:b=>deflateRawSync(b,{level:3}),expand:(b,size)=>inflateRawSync(b,{maxOutputLength:size})};
 const original=readPackedFrames(gunzipSync(readFileSync('dist/stumble-runtime-v3/source-comfort-q5.bin.gz')),{codec}),candidate=readPackedFrames(gunzipSync(candidates.get('puppy-companion-comfort-q5.bin.gz')),{codec});
 for(let i=0;i<13;i++)assert.deepEqual(candidate.getFrame(i),original.getFrame(i),'unchanged tug/sleep frame '+i);
 // Match canonical entrance/exit poses exactly, including Q5 quantization.
 for(const [frame,file,index] of [[meta.scramble.frames[0],'puppy-paper-rear-gallop',7*9],[meta.scramble.frames.at(-1),'puppy-paper-rear-gallop',5*9],[meta.pickups.rear.frames[0],'puppy-paper-rear-gallop',5*9]])assert.deepEqual(candidate.getFrame(frame),readPackedFrames(gunzipSync(readFileSync(file+'-q5.bin.gz'))).getFrame(index));
 const receipt={defaultLoader:useDefault,clips:clips.map(c=>({pattern:c.pattern,seconds:c.frames.length/fps})),simulatedSeconds:clock,newCompressedArtBytes:meta.gzipBytes-base.gzipBytes,portablePixelPayloadAdded:meta.residentPixelBytes-base.residentPixelBytes,nodeRetainedPixelBytesAdded:candidate.residentPixelBytes-original.residentPixelBytes,impact:{entrySpeed:impact[0].speed,distance:Math.abs(impact.at(-1).zWorld-impact[0].zWorld),duration:impact.length/fps}};
 writeFileSync('dist/fetch-qa/receipt.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}finally{pet.dispose();}
