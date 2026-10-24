// Component benchmark only: not desktop FPS, startup or whole-process RAM.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {BAKED_MOTION as tables} from '../puppy-motion-tables.generated.mjs';
import {createPaperSupportEpisodes,createBakedSupportEpisodes} from '../puppy-paper-contact.mjs';
import {paperActionPose} from '../puppy-paper-actions.mjs';
const json=n=>JSON.parse(readFileSync(new URL('../'+n,import.meta.url)));
const rear=json('puppy-paper-rear-gallop.json'),approach=json('puppy-paper-approach.json'),actions=json('puppy-paper-actions-v9.json'),behaviors=json('puppy-paper-behaviors.json');
const seq=(start,n)=>Array.from({length:n},(_,i)=>start+i);
const groups=[['front',rear.frontFeet,seq(0,8),17,true],['rear',rear.rearFeet,seq(5,8),9,true],['approach',approach.feet,seq(5,8),9,true],['walk',actions.feet,actions.clips.walk,9,true],
 ...Object.entries(behaviors.clips).map(([name,list])=>['behavior/'+name,behaviors.feet,list,9,name==='walk'])];
function setup(baked,count){
 const start=performance.now();let checksum=0;
 for(let i=0;i<count;i++)for(const [key,labels,list,n,cyclic] of groups){
  const sample=baked?createBakedSupportEpisodes(tables.support[key]):createPaperSupportEpisodes(labels,list,n,{cyclic});
  checksum+=sample(labels[list[0]][0],list[0],0,0).length;
 }
 return {milliseconds:performance.now()-start,checksum};
}
function poses(baked,count){
 const start=performance.now();let checksum=0;
 for(let i=0;i<count;i++){const p=paperActionPose('walk',i/97,actions,baked?tables.actionClips:undefined);checksum+=p.pair+p.blend;}
 return {milliseconds:performance.now()-start,checksum};
}
setup(false,20);setup(true,20);poses(false,1000);poses(true,1000);
const setupBefore=setup(false,1000),setupAfter=setup(true,1000),posesBefore=poses(false,100000),posesAfter=poses(true,100000);
assert.equal(setupBefore.checksum,setupAfter.checksum);assert.equal(posesBefore.checksum,posesAfter.checksum);
console.log(JSON.stringify({scope:'components only; no desktop process or image painting',rendererSupportSetups:1000,poseLookups:100000,setupBefore,setupAfter,posesBefore,posesAfter},null,2));
