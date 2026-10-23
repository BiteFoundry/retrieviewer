import test from 'node:test';
import assert from 'node:assert/strict';
import {createPet} from './retrieviewer.mjs';
import {createFramePump} from './integrations/windows-overlay/protocol.mjs';
const options={columns:160,rows:60};

test('real held poses skip rasterization, not simulation; camera/input/resume invalidate',async t=>{
 const pet=await createPet({seed:731,returnStyle:'brake'});t.after(()=>pet.dispose());
 let renders=0,now=0,offerStart=null,measured=0,skipped=0;
 const original=pet.frame.bind(pet);let last;
 pet.frame=o=>{renders++;last=original(o);return last;};
 const pump=createFramePump({pet,send(){},now:()=>now});
 const viewport={type:'viewport',revision:1,visible:true,...options,cellWidth:8,cellHeight:16};
 pump.viewport(viewport);pump.tick();pump.ack();assert.equal(pump.interact('ball'),true);
 for(let i=1;i<600;i++){
  now=i*1000/30;const before=renders;pump.tick();pump.ack();
  if(last.report.intent==='offer')offerStart??=now;
  if(offerStart!==null&&now-offerStart>=1200&&now-offerStart<2200){measured++;if(renders===before)skipped++;}
  if(offerStart!==null&&now-offerStart>=2200)break;
 }
 assert.equal(measured,30);assert.equal(skipped,30,'no full renderer calls during settled offer');
 assert.equal(pet.needsFrame(options),false);
 const f=original(options),energy=f.report.energy;pet.step(.1);
 assert.equal(pet.needsFrame(options),false);assert.notEqual(original(options).report.energy,energy,'needs keep advancing');
 for(const changed of [{...options,rows:61},{...options,cellAspect:.6},{...options,contactEnabled:false},{...options,poseFps:30},
  {...options,camera:{viewportWidth:100,viewportHeight:50,rect:{left:1,top:0,width:99,height:50}}}])assert.equal(pet.needsFrame(changed),true);
 const before=renders;pump.viewport({...viewport,revision:2});pump.tick();pump.ack();assert.equal(renders,before+1);
 pump.pause(true);now+=100000;pump.tick();assert.equal(renders,before+1);
 pump.pause(false);pump.tick();pump.ack();assert.equal(renders,before+2);
 // Finish the active offer; direct interactions intentionally remain exclusive.
 for(let i=0;i<100&&last.report.busy;i++){pet.step(.1);last=original(options);}
 assert.equal(last.report.busy,false);
 assert.equal(pump.interact('treat'),true);pump.tick();pump.ack();assert.equal(renders,before+3);
 assert.ok(last.report.treat,'accepted input bypasses the held-pose hint');
 pet.step(1/30);assert.equal(pet.needsFrame(options),true,'active eating gesture remains dynamic');
 // frame() is never memoized: callers still receive fresh metadata and the
 // documented borrowed buffer, even if the optional hint would skip a paint.
 const a=original(options),b=original(options);assert.equal(a.pixels,b.pixels);assert.notEqual(a,b);
 pump.dispose();assert.throws(()=>pet.needsFrame(options),/disposed/);
});

test('pre-render hint cannot hide actual pixel changes across fetch, watch, sleep and butterfly',async t=>{
 const pet=await createPet({seed:731});t.after(()=>pet.dispose());
 let previous=null,skips=0;const seen=new Set();
 const opts={columns:40,rows:15};
 pet.interact('ball');
 for(let i=0;i<12000;i++){
  pet.step(.1);const needed=pet.needsFrame(opts),f=pet.frame(opts);
  if(!needed){assert.equal(f.text,previous,'false hint implies unchanged actual text');skips++;}
  previous=f.text;if(f.state.behavior)seen.add(f.state.behavior);
  if(f.report.snore!==null)seen.add('snore');if(f.report.butterfly)seen.add('butterfly');
  if(i>1000&&['watch-left','watch-right','snore','butterfly'].every(k=>seen.has(k)))break;
 }
 assert.ok(skips>100);for(const kind of ['watch-left','watch-right','snore','butterfly'])assert.ok(seen.has(kind),kind+' exercised');
});
