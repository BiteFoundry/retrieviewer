// Static/source contract tests for the macOS JXA helper. They run under Node on any
// host; they do NOT exercise the ObjC bridge, AppKit or osascript. The optional
// live checks at the end run only on macOS with /usr/bin/osascript present.
import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {viewportOf,cropFrame} from './integrations/windows-overlay/protocol.mjs';
const PATH=fileURLToPath(new URL('./integrations/macos-overlay/overlay.jxa',import.meta.url));
const SOURCE=readFileSync(PATH,'utf8');
const PURE=SOURCE.slice(SOURCE.indexOf('// <pure>'),SOURCE.indexOf('// </pure>'));
const CODE=SOURCE.replace(/^\s*\/\/.*$/gm,'').replace(/\/\/[^'\n]*$/gm,'');
const api=new Function(PURE+';return {chooseGrid,cgToCocoa,cocoaToCg,parseFrame,petRect,rasterize,paintScale,tiffRGBA,base64,windowRecord,pickerTargets,coveredBySameApp,createCore,TEXT};')();
const braille=(columns,rows,fill=()=>0)=>Array.from({length:rows},(_,y)=>Array.from({length:columns},(_,x)=>String.fromCharCode(0x2800+fill(x,y))).join('')).join('\n');

test('source is ASCII, ES5-only, parses, and keeps ObjC out of the pure section',()=>{
 assert.ok(/^[\x00-\x7f]*$/.test(SOURCE),'non-ASCII text must be \\u-escaped for osascript');
 for(const pattern of [/=>/,/\blet\s/,/\bconst\s/,/`/,/\bclass\s/,/\.\.\.[A-Za-z_$[]/,/\basync\b/,/\bawait\b/,/\?\./,/\?\?/])assert.doesNotMatch(CODE,pattern,String(pattern));
 assert.doesNotThrow(()=>new Function(SOURCE));
 assert.doesNotMatch(PURE,/\$\.|\$\(|ObjC\./);
 assert.match(SOURCE,/^function run\(argv\)/m);
});

test('helper never captures screen pixels, hooks input, injects, or prompts for privacy access',()=>{
 for(const banned of ['CGWindowListCreateImage','CGDisplayCreateImage','CGDisplayStream','SCStream','ScreenCaptureKit','CGRequestScreenCaptureAccess','CGPreflightScreenCaptureAccess',
  'AXUIElement','AXIsProcessTrusted','CGEventTap','CGEventPost','addGlobalMonitorForEvents','addLocalMonitorForEvents','NSAppleScript','doShellScript','System Events',
  'Application(','NSTask','screencapture','tccutil','defaults write','NSUserDefaults','console.log','$.puts','$.printf','availableData','readDataToEndOfFile','readLine',
  'writeToURL','NSURLSession','NSURLConnection','performSelectorOnMainThread','dlopen'])assert.ok(!CODE.includes(banned),banned);
 // stdout is written only by emit(), through NSFileHandle.
 assert.equal((CODE.match(/fileHandleWithStandardOutput/g)||[]).length,1);
 assert.match(CODE,/function emit\(value\)[\s\S]{0,200}JSON\.stringify\(value\) \+ '\\n'/);
});

test('UI/runloop wiring uses background stdin notifications, a common-mode timer and a running NSApplication',()=>{
 assert.match(CODE,/readInBackgroundAndNotifyForModes\(readModes\)/);
 assert.match(CODE,/addObserverSelectorNameObject\(shell\.controller, 'onInput:', readNote, input\)/);
 assert.match(CODE,/timerWithTimeIntervalTargetSelectorUserInfoRepeats\(0\.05, shell\.controller, 'onTick:', null, true\)/);
 assert.match(CODE,/addTimerForMode\(timer, \$\.NSRunLoopCommonModes\)/);
 assert.match(CODE,/app\.run;/);assert.match(CODE,/setActivationPolicy\(ACTIVATION_ACCESSORY\)/);
 assert.match(SOURCE,/data\.length === 0\) \{ core\.quit\(\); return; \} \/\/ EOF/);
 assert.match(CODE,/\$\.exit\(code\)/);assert.match(CODE,/ObjC\.import\('stdlib'\)/);
 for(const method of ['onInput:','onTick:','onBall:','onTreat:','onTug:','onPick:','onPause:','onQuit:','onRefresh:','onAttach:','onCancel:','windowWillClose:'])
  assert.ok(CODE.includes(`'${method}': guarded(`),method);
 for(const action of [...CODE.matchAll(/makeButton\([^)]*\}, '([A-Za-z]+:)'\)/g)].map(m=>m[1]))assert.ok(CODE.includes(`'${action}': guarded(`),action);
});

test('pet panel is transparent, click-through, non-activating and windows are never auto-released',()=>{
 const pet=CODE.slice(CODE.indexOf('function makePetPanel'),CODE.indexOf('function paintInto'));
 for(const call of ['STYLE_BORDERLESS | STYLE_NONACTIVATING','setIgnoresMouseEvents(true)','setOpaque(false)','setHasShadow(false)','$.NSColor.clearColor','setLevel(FLOATING_LEVEL)'])assert.ok(pet.includes(call),call);
 assert.match(CODE,/var STYLE_BORDERLESS = 0, STYLE_TITLED = 1, STYLE_CLOSABLE = 2, STYLE_NONACTIVATING = 128;/);
 assert.match(CODE,/function makePanel[\s\S]{0,400}setReleasedWhenClosed\(false\)[\s\S]{0,80}setHidesOnDeactivate\(false\)/);
 assert.doesNotMatch(CODE,/NSWindow\.alloc/);assert.doesNotMatch(CODE,/makeKeyAndOrderFront\(null\);[\s\S]*makeKeyAndOrderFront/);
 // Control strip buttons accept the first click; the strip is a separate non-activating panel.
 assert.match(CODE,/'acceptsFirstMouse:': \{ types: \['bool', \['id'\]\]/);
 assert.match(CODE,/var bar = makePanel\(\{[^}]*\}, STYLE_BORDERLESS \| STYLE_NONACTIVATING\)/);
 // Only the CF array we copy is released, and only after it was unwrapped.
 assert.match(CODE,/ObjC\.bindFunction\('CFRelease', \['void', \['void \*'\]\]\)/);
 assert.match(CODE,/list = ObjC\.deepUnwrap\(ObjC\.castRefToObject\(ref\)\);\s*if \(list\) \$\.CFRelease\(ref\);/);
});

test('grid choice matches the low-profile protocol viewport and .5 cell aspect',()=>{
 for(const [width,height,cell] of [[1280,800,12],[160,120,12],[2560,1600,12],[3840,2160,16],[6016,3384,16]]){
  const g=api.chooseGrid({x:0,y:0,width,height});assert.equal(g.cell,cell);
  const v=viewportOf({type:'viewport',revision:1,visible:true,selected:true,columns:g.columns,rows:g.rows,cellWidth:g.cell,cellHeight:g.cell*2});
  assert.equal(v.cellAspect,.5);assert.ok(g.columns*g.rows<=(cell===12?20000:125000));assert.ok(g.columns*g.rows<20000||cell===16);
 }
 assert.deepEqual(api.chooseGrid(null),{cell:12,columns:0,rows:0});
});

test('CG<->Cocoa conversion handles negative and stacked secondary display origins',()=>{
 const H=982;// primary display height in points (Retina scale never enters)
 const cases=[[{x:100,y:50,width:800,height:600},{x:100,y:332,width:800,height:600}],
  [{x:-1920,y:-200,width:1000,height:700},{x:-1920,y:482,width:1000,height:700}],
  [{x:300,y:-1080,width:640,height:480},{x:300,y:1582,width:640,height:480}],
  [{x:-12000,y:-12000,width:1600,height:1000},{x:-12000,y:11982,width:1600,height:1000}]];
 for(const [cg,cocoa] of cases){assert.deepEqual(api.cgToCocoa(cg,H),cocoa);assert.deepEqual(api.cocoaToCg(cocoa,H),cg);}
 const canvas={x:-1920,y:-200,width:1000,height:700};
 assert.deepEqual(api.petRect(canvas,{x:3,y:2,columns:4,rows:5},12),{x:-1884,y:-152,width:48,height:120});
});

test('frames are validated like Overlay.cs and rasterized without stray ink',()=>{
 const canvas={x:0,y:0,width:240,height:240},cell=12;// 20x10 grid
 const raw={columns:20,rows:10,text:braille(20,10,(x,y)=>x>=5&&x<8&&y>=3&&y<5?0xff:0)};
 const frame=cropFrame(raw,4);assert.deepEqual([frame.x,frame.y,frame.columns,frame.rows],[5,3,3,2]);
 const parsed=api.parseFrame(frame,cell,canvas);assert.equal(parsed.lines.length,2);
 assert.equal(api.parseFrame(cropFrame({columns:3,rows:2,text:braille(3,2)},1),cell,canvas),null);
 const bad=[{...frame,text:frame.text.replace('\u28ff','A')},{...frame,x:18},{...frame,y:9},{...frame,rows:3},{...frame,columns:4},{...frame,x:-1},{...frame,x:1.5},{...frame,text:7},
  {...frame,columns:126000,rows:1}];
 for(const m of bad)assert.throws(()=>api.parseFrame(m,cell,canvas));
 assert.throws(()=>api.parseFrame(frame,cell,null));
 for(const scale of [1,2]){
  const r=api.rasterize(parsed,cell,scale);assert.equal(r.width,36*scale);assert.equal(r.height,48*scale);assert.equal(r.dots,48);
  const alpha=(x,y)=>r.pixels[(y*r.width+x)*4+3];
  assert.ok(alpha(3*scale,3*scale)>200,'dot centre is inked');assert.equal(alpha(Math.floor(4.5*scale),Math.floor(4.5*scale)),0,'between dots is clear');
  for(let i=0;i<r.pixels.length;i+=4)assert.ok(r.pixels[i]<=r.pixels[i+3]&&r.pixels[i+1]<=r.pixels[i+3]&&r.pixels[i+2]<=r.pixels[i+3],'premultiplied');
 }
 const blank=api.rasterize({x:0,y:0,columns:2,rows:1,lines:['\u2800\u2800']},16,2);assert.ok(blank.pixels.every(v=>v===0));
 assert.equal(api.paintScale({width:400,height:400},2),2);assert.equal(api.paintScale({width:2000,height:1200},2),1);assert.equal(api.paintScale({width:10,height:10},1),1);
});

test('TIFF container and base64 are structurally valid baseline RGBA',()=>{
 const width=5,height=3,pixels=new Uint8Array(width*height*4).map((_,i)=>i*7&255);
 const tiff=Buffer.from(api.tiffRGBA(width,height,pixels));
 assert.equal(tiff.toString('latin1',0,2),'II');assert.equal(tiff.readUInt16LE(2),42);
 const ifd=tiff.readUInt32LE(4),count=tiff.readUInt16LE(ifd),tags={};let previous=0;
 for(let i=0;i<count;i++){const at=ifd+2+i*12,tag=tiff.readUInt16LE(at),type=tiff.readUInt16LE(at+2),n=tiff.readUInt32LE(at+4);
  assert.ok(tag>previous,'tags ascending');previous=tag;tags[tag]=type===3&&n===1?tiff.readUInt16LE(at+8):tiff.readUInt32LE(at+8);}
 assert.equal(tiff.readUInt32LE(ifd+2+count*12),0,'single IFD');
 assert.deepEqual([tags[256],tags[257],tags[259],tags[262],tags[277],tags[278],tags[284],tags[338]],[width,height,1,2,4,height,1,1]);
 assert.deepEqual([0,1,2,3].map(i=>tiff.readUInt16LE(tags[258]+i*2)),[8,8,8,8]);
 assert.equal(tags[279],pixels.length);assert.deepEqual(tiff.subarray(tags[273],tags[273]+tags[279]),Buffer.from(pixels));
 for(let n=0;n<8;n++){const bytes=new Uint8Array(n*1000+n).map((_,i)=>(i*31+n)&255);assert.equal(api.base64(bytes),Buffer.from(bytes).toString('base64'));}
});

test('picker lists ordinary foreign windows and falls back to app name plus window number',()=>{
 const info=(id,pid,owner,name,extra={})=>({kCGWindowNumber:id,kCGWindowOwnerPID:pid,kCGWindowOwnerName:owner,...(name?{kCGWindowName:name}:{}),kCGWindowLayer:0,kCGWindowAlpha:1,kCGWindowIsOnscreen:true,kCGWindowBounds:{X:0,Y:25,Width:900,Height:600},...extra});
 const items=api.pickerTargets([info(10,50,'Safari','Docs'),info(11,60,'Terminal',''),info(12,99,'osascript','pet'),info(13,61,'Dock','',{kCGWindowLayer:20}),
  info(14,62,'Tiny','',{kCGWindowBounds:{X:0,Y:0,Width:100,Height:80}}),info(15,63,'iTerm2','codex'),{bogus:true}],99);
 assert.deepEqual(items.map(i=>i.id),[11,15,10]);
 assert.equal(items[0].title,'[\ud130\ubbf8\ub110] Terminal \u00b7 \ucc3d #11');assert.equal(items[2].title,'Docs \u00b7 Safari #10');
 const target={id:11,pid:60};
 assert.equal(api.coveredBySameApp([info(30,60,'Terminal','other')],target),true);
 assert.equal(api.coveredBySameApp([info(31,70,'Other',''),info(32,60,'Terminal','',{kCGWindowLayer:3}),info(11,60,'Terminal','')],target),false);
 assert.deepEqual(api.windowRecord(info(10,50,'Safari','Docs',{kCGWindowIsOnscreen:undefined})).onscreen,false);
});

function harness({testMode=false}={}){
 const out=[],calls=[];let world={info:{id:7,pid:42,onscreen:true,bounds:{x:-1000,y:40,width:1200,height:720}},frontPid:42,covered:false};
 const core=api.createCore({emit:m=>out.push(m),observe:()=>world,paint:(p,cell,canvas)=>calls.push(['paint',p.x,p.y,cell,canvas.x]),hidePet:()=>calls.push(['hidePet']),
  showBar:()=>calls.push(['showBar']),hideBar:()=>calls.push(['hideBar']),status:t=>calls.push(['status',t]),loaded:()=>calls.push(['loaded']),quit:()=>calls.push(['quit'])},{testMode});
 return {core,out,calls,set:patch=>{world={...world,...patch};},last:type=>out.filter(m=>m.type===type).at(-1)};
}
test('state machine follows only the selected front window and acknowledges every frame',()=>{
 const h=harness();h.core.track(false);assert.equal(h.out.length,0,"no change, no viewport");h.core.track(true);assert.deepEqual(h.last('viewport'),{type:'viewport',revision:1,visible:false,selected:false,columns:0,rows:0,cellWidth:12,cellHeight:24});
 h.core.attach({id:7,pid:42});assert.deepEqual(h.last('pause'),{type:'pause',paused:false});h.core.track(false);
 const v=h.last('viewport');assert.equal(v.visible,true);assert.equal(v.selected,true);assert.ok(viewportOf(v));
 const frame=cropFrame({columns:v.columns,rows:v.rows,text:braille(v.columns,v.rows,(x,y)=>x===4&&y===2?1:0)},v.revision);
 h.core.message(frame);assert.deepEqual(h.out.at(-1),{type:'ack',painted:true});assert.deepEqual(h.calls.find(c=>c[0]==='paint'),['paint',4,2,12,-1000]);
 h.core.message({...frame,revision:v.revision-1});assert.deepEqual(h.out.at(-1),{type:'ack',painted:false},'stale revision is acked, not painted');
 h.core.track(false);assert.equal(h.last('viewport').revision,v.revision,'unchanged geometry keeps the revision');
 h.set({info:{...h.core.state.target,id:7,pid:42,onscreen:true,bounds:{x:-990,y:40,width:1200,height:720}}});h.core.track(false);assert.equal(h.last('viewport').revision,v.revision+1,'moving re-issues the viewport');
 for(const [patch,why] of [[{frontPid:5},'other app in front'],[{covered:true},'another window of the same app in front'],[{info:{id:7,pid:42,onscreen:false,bounds:{x:0,y:0,width:900,height:600}}},'minimized/hidden/other Space']]){
  h.set({frontPid:42,covered:false,info:{id:7,pid:42,onscreen:true,bounds:{x:0,y:0,width:900,height:600}}});h.core.track(false);assert.equal(h.last('viewport').visible,true);
  h.set(patch);h.core.track(false);assert.equal(h.last('viewport').visible,false,why);assert.equal(h.last('viewport').selected,true);
  h.core.message({...frame,revision:h.last('viewport').revision});assert.deepEqual(h.out.at(-1),{type:'ack',painted:false},'hidden frames are acked');
 }
 h.set({frontPid:42,covered:false,info:{id:7,pid:42,onscreen:true,bounds:{x:0,y:0,width:150,height:600}}});h.core.track(false);assert.equal(h.last('viewport').visible,false,'too small');
 h.set({info:null});h.core.track(false);assert.deepEqual([h.last('viewport').visible,h.last('viewport').selected],[false,false],'closed window drops the target');
 h.core.attach({id:7,pid:42});h.set({info:{id:7,pid:43,onscreen:true,bounds:{x:0,y:0,width:900,height:600}}});h.core.track(false);assert.equal(h.core.state.target,null,'reused window number from another process');
});
test('pause, picker, interactions, engine errors and quit',()=>{
 const h=harness();h.core.attach({id:7,pid:42});h.core.track(false);
 h.core.interact('ball');assert.equal(h.out.some(m=>m.type==='interact'),false,'not before loaded');
 h.core.message({type:'loaded'});h.core.interact('ball');h.core.interact('treat');assert.deepEqual(h.out.filter(m=>m.type==='interact').map(m=>m.kind),['ball','treat']);
 h.core.message({type:'interaction',kind:'ball',accepted:true});assert.deepEqual(h.calls.filter(c=>c[0]==='status').map(c=>c[1]),[api.TEXT.playing,api.TEXT.accepted]);
 h.core.togglePause();assert.deepEqual(h.last('pause'),{type:'pause',paused:true});const paused=h.last('viewport');assert.equal(paused.visible,false);
 assert.equal(h.calls.at(-1)[0],'hidePet');h.core.interact('ball');assert.equal(h.out.filter(m=>m.type==='interact').length,2,'paused ignores interactions');
 h.core.message({type:'frame',revision:paused.revision,x:0,y:0,columns:0,rows:0,text:''});assert.deepEqual(h.out.at(-1),{type:'ack',painted:false});
 h.core.togglePause();assert.equal(h.last('viewport').visible,true);
 h.core.setPicking(true);h.core.track(false);assert.equal(h.last('viewport').visible,false,'picker hides the pet');h.core.setPicking(false);h.core.track(false);assert.equal(h.last('viewport').visible,true);
 h.core.message({type:'frame',revision:h.last('viewport').revision,x:0,y:0,columns:0,rows:0,text:''});assert.deepEqual(h.out.at(-1),{type:'ack',painted:true});assert.equal(h.calls.at(-1)[0],'hidePet','empty frame hides');
 h.core.message({type:'unknown'});assert.throws(()=>h.core.message(null));
 h.core.message({type:'error',message:'x'});assert.deepEqual(h.calls.slice(-2),[['status',api.TEXT.engineError],['quit']]);
 const before=h.out.length;h.core.message({type:'frame',revision:1});h.core.track(true);h.core.quit();assert.equal(h.out.length,before,'nothing after quit');assert.equal(h.calls.filter(c=>c[0]==='quit').length,1);
 const q=harness();q.core.message({type:'quit'});assert.deepEqual(q.calls,[['quit']]);
});
test('diagnostic mode follows its owned window without foreground checks',()=>{
 const h=harness({testMode:true});h.set({frontPid:-1});h.core.attach({id:7,pid:42});h.core.track(false);assert.equal(h.last('viewport').visible,true);
 h.core.message({type:'loaded'});assert.deepEqual(h.calls.slice(-2),[['status',api.TEXT.playing],['loaded']]);
});

const mac=process.platform==='darwin'&&existsSync('/usr/bin/osascript');
const skip=mac?false:'requires macOS /usr/bin/osascript; not available on this host';
function runHelper(args,input){
 return new Promise((resolve,reject)=>{const child=spawn('/usr/bin/osascript',['-l','JavaScript',PATH,...args],{stdio:['pipe','pipe','pipe']});let out='',err='';
  const timer=setTimeout(()=>{child.kill();reject(Error('helper timed out: '+err));},20000);
  child.stdout.on('data',b=>{out+=b;input?.(out,child);});child.stderr.on('data',b=>err+=b);child.on('exit',code=>{clearTimeout(timer);resolve({code,lines:out.split('\n').filter(Boolean).map(l=>JSON.parse(l)),err});});
  if(!input)child.stdin.end();});
}
test('live macOS self-test on owned windows only',{skip},async()=>{
 const {code,lines,err}=await runHelper(['--self-test']);assert.equal(lines.length,1,err);assert.equal(lines[0].type,'self-test');assert.equal(lines[0].passed,true,JSON.stringify(lines[0]));assert.equal(code,0);
});
test('live macOS IPC: viewport, frame ack, interaction and EOF teardown',{skip},async()=>{
 let sent=false;const {code,lines}=await runHelper(['--ipc-test'],(out,child)=>{
  const msgs=out.split('\n').filter(Boolean).map(l=>JSON.parse(l)),v=msgs.filter(m=>m.type==='viewport'&&m.visible).at(-1);
  if(!sent&&v){sent=true;const g=viewportOf(v);child.stdin.write(JSON.stringify({type:'loaded'})+'\n'+JSON.stringify(cropFrame({columns:g.columns,rows:g.rows,text:braille(g.columns,g.rows,(x,y)=>x<3&&y<2?0xff:0)},v.revision))+'\n');}
  if(msgs.some(m=>m.type==='ack')&&msgs.some(m=>m.type==='interact'))child.stdin.end();
 });
 assert.equal(code,0);const types=lines.map(m=>m.type);assert.ok(types.includes('ready'));assert.deepEqual(lines.find(m=>m.type==='ack'),{type:'ack',painted:true});
 assert.deepEqual(lines.find(m=>m.type==='interact'),{type:'interact',kind:'ball'});assert.equal(types.at(-1),'quit');
});
