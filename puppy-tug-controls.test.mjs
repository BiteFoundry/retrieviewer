// Display-free contract checks for the third one-shot user action, tug (터그):
// protocol allow-list, the three native toolbars and the browser preview controls.
// No native window, X server, osascript or browser is started.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createFramePump} from './integrations/windows-overlay/protocol.mjs';

const read=path=>readFileSync(fileURLToPath(new URL(path,import.meta.url)),'utf8');

test('protocol accepts tug like ball/treat and still rejects arbitrary kinds',()=>{
 const asked=[],pet={step(){},frame:()=>({columns:0,rows:0,text:''}),interact:k=>{asked.push(k);return k==='tug';},dispose(){}};
 const pump=createFramePump({pet,send(){},now:()=>0});
 assert.equal(pump.interact('tug'),true);assert.equal(pump.interact('ball'),false);assert.equal(pump.interact('treat'),false);
 for(const bad of ['shell','Tug','tug ','belly','sleep','',null,undefined,{}])assert.throws(()=>pump.interact(bad),/Invalid overlay interaction/);
 assert.deepEqual(asked,['tug','ball','treat'],'rejected kinds never reach the pet');
});

// Toolbar buttons as [label,x,width]; the strip must stay inside its declared width.
const noOverlap=(buttons,statusX,width)=>{
 for(let i=1;i<buttons.length;i++)assert.ok(buttons[i-1][1]+buttons[i-1][2]<=buttons[i][1],`${buttons[i-1][0]} overlaps ${buttons[i][0]}`);
 assert.ok(buttons.at(-1)[1]+buttons.at(-1)[2]<=statusX);assert.ok(statusX<width);
};

test('Windows toolbar: ball stays first, tug follows treat, nothing clips',()=>{
 const cs=read('./integrations/windows-overlay/Overlay.cs');
 const buttons=[...cs.matchAll(/MakeButton\("([^"]+)",(\d+),(.*?)\)\);/g)].map(m=>[m[1],Number(m[2]),m[1]==='간식'||m[1]==='터그'?46:40,m[3]]);
 assert.deepEqual(buttons.map(b=>b[0]),['공','간식','터그','창','쉼','종료']);
 assert.match(buttons[2][3],/Interact\("tug"\)/);
 assert.match(cs,/b\.Size=new Size\(title=="간식"\|\|title=="터그"\?46:40,28\)/);
 assert.match(cs,/\(\(Button\)bar\.Controls\[0\]\)\.PerformClick\(\)/,'diagnostic first-ball click unchanged');
 const width=Number(cs.match(/bar\.Size=new Size\((\d+),40\)/)[1]),status=cs.match(/status\.Location=new Point\((\d+),12\);status\.Size=new Size\((\d+),22\)/);
 noOverlap(buttons,Number(status[1]),width);assert.ok(Number(status[1])+Number(status[2])<=width);
});

test('macOS toolbar: tug selector, ASCII label escape and layout inside BAR_WIDTH',()=>{
 const jxa=read('./integrations/macos-overlay/overlay.jxa');
 assert.match(jxa,/'onTug:': guarded\('onTug'\)/);assert.match(jxa,/shell\.onTug = function \(\) \{ core\.interact\('tug'\); \};/);
 const buttons=[...jxa.matchAll(/makeButton\('([^']+)', \{ x: (\d+), y: 6, width: (\d+), height: 28 \}, '(on\w+):'\)/g)].map(m=>[m[4],Number(m[2]),Number(m[3]),m[1]]);
 assert.deepEqual(buttons.map(b=>b[0]),['onBall','onTreat','onTug','onPick','onPause','onQuit']);
 assert.equal(buttons[2][3],'\\uD130\\uADF8');
 const width=Number(jxa.match(/var BAR_WIDTH = (\d+),/)[1]),status=jxa.match(/makeLabel\(TEXT\.preparing, \{ x: (\d+), y: 10, width: (\d+)/);
 noOverlap(buttons,Number(status[1]),width);assert.ok(Number(status[1])+Number(status[2])<=width);
});

const PYTHON=(process.platform==='win32'?['python','python3']:['python3','python']).find(cmd=>{
 const r=spawnSync(cmd,['-c','import sys;print(sys.version_info[0])'],{encoding:'utf8',timeout:10000});
 return r.status===0&&r.stdout.trim()==='3';
});
test('Linux toolbar: tug emits once loaded and unpaused, and is hit-testable',{skip:PYTHON?false:'Python 3 is not available'},()=>{
 const dir=fileURLToPath(new URL('./integrations/linux-overlay/',import.meta.url));
 const r=spawnSync(PYTHON,['-I','-c',`import sys,json;sys.path.insert(0,${JSON.stringify(dir)})
import overlay as o
class UI(object):
    def __getattr__(self,name): return lambda *a: None
sent=[]; c=o.Companion(UI(),sent.append,cell=16)
c.press('tug'); before=list(sent); c.loaded=True; c.press('tug'); loaded=sent[-1]; c.paused=True; n=len(sent); c.press('tug')
d=o.XDisplay.__new__(o.XDisplay)
print(json.dumps({'before':[m for m in before if m.get('type')=='interact'],'loaded':loaded,'paused':len(sent)==n,
 'buttons':[b[0] for b in o.XDisplay.BAR_BUTTONS],'hit':[d.bar_hit(6+58*i+10,15) for i in range(len(o.XDisplay.BAR_BUTTONS))]}))`],{encoding:'utf8',timeout:60000});
 assert.equal(r.status,0,r.stderr);const out=JSON.parse(r.stdout.trim().split('\n').pop());
 assert.deepEqual(out.before,[]);assert.deepEqual(out.loaded,{type:'interact',kind:'tug'});assert.equal(out.paused,true);
 assert.deepEqual(out.buttons,['ball','treat','tug','window','pause','quit']);assert.deepEqual(out.hit,out.buttons);
});

test('browser preview: third tug button, EN/KO copy, cooldown loops and cache-busted app',()=>{
 const html=read('./docs/index.html'),app=read('./docs/app.mjs');
 assert.match(html,/id="tug"\s+disabled\s+data-i18n="tug"\s*>\s*Play tug\s*</);
 assert.ok(html.indexOf('id="treat"')<html.indexOf('id="tug"')&&html.indexOf('id="tug"')<html.indexOf('id="pause"'));
 assert.match(html,/app\.mjs\?v=0\.0\.4"/);
 assert.match(app,/ {2}tug: "터그 놀이",/);assert.match(app,/tugSent: "터그 놀이를 시작했어요!"/);assert.match(app,/tugSent: "Tug of war started!"/);
 assert.equal(app.match(/for \(const kind of \["ball", "treat", "tug"\]\)/g).length,3);
 assert.doesNotMatch(app,/\["ball", "treat"\]/);assert.match(app,/kind \+ "Sent"/);
});
