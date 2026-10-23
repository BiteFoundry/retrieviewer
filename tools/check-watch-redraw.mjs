// The real renderer/actor, old vs candidate, with identical fixed-camera states.
// Output is a light text-frame replay, not another running browser pet engine.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createPet,defaultLoadAsset} from '../retrieviewer.mjs';
import {cropFrame} from '../integrations/windows-overlay/protocol.mjs';
const stage=process.argv[2]??'dist/watch-redraw-v2',candidate=readFileSync(stage+'/behaviors-q5.bin.gz');
// Keep the comparison anchored to the committed release even after the accepted
// candidate has been applied to this working tree. Never label two new copies old/new.
const baseline=execFileSync('git',['show','HEAD:puppy-paper-behaviors-q5.bin.gz'],{maxBuffer:8*1024*1024,windowsHide:true});
if(baseline.equals(candidate))throw Error('Comparison needs a different committed baseline');
const old=await createPet({seed:1,loadAsset:name=>name==='puppy-paper-behaviors-q5.bin.gz'?baseline:defaultLoadAsset(name)}),next=await createPet({seed:1,loadAsset:name=>name==='puppy-paper-behaviors-q5.bin.gz'?candidate:defaultLoadAsset(name)});
const frames=[],columns=200,rows=72;
try{
 for(let i=0;i<20*60;i++){
  old.step(1/60);next.step(1/60);if(i%5)continue;
  const a=old.frame({columns,rows,poseFps:30}),b=next.frame({columns,rows,poseFps:30});
  frames.push({time:(i+1)/60,before:cropFrame(a,1),after:cropFrame(b,1),behavior:b.state.behavior,progress:b.state.behaviorProgress});
 }
 mkdirSync('site-dist',{recursive:true});
 const data={columns,rows,fps:12,frames};
 writeFileSync(stage+'/replay.json',JSON.stringify(data));
 writeFileSync('site-dist/watch-redraw-preview.json',JSON.stringify(data));
 writeFileSync('site-dist/watch-redraw-preview.html',readFileSync('tools/watch-redraw-preview.html'));
 console.log(JSON.stringify({frames:frames.length,behaviors:[...new Set(frames.map(f=>f.behavior))],replayBytes:JSON.stringify(data).length}));
}finally{old.dispose();next.dispose();}
