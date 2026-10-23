// Display-free checks for the Linux X11 painter: Python 3.6 grammar, pure helpers,
// the NDJSON protocol state machine (fake UI backend) and fail-closed session errors.
// No X server, window, compositor or Wayland session is touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {cropFrame} from './integrations/windows-overlay/protocol.mjs';

const DIR=fileURLToPath(new URL('./integrations/linux-overlay/',import.meta.url));
const HELPER=DIR+'overlay.py';
const PYTHON=(process.platform==='win32'?['python','python3']:['python3','python']).find(cmd=>{
 const r=spawnSync(cmd,['-c','import sys;print(sys.version_info[0])'],{encoding:'utf8',timeout:10000});
 return r.status===0&&r.stdout.trim()==='3';
});
const skip=PYTHON?false:'Python 3 is not available';
const python=(code,input='',env={})=>{
 const r=spawnSync(PYTHON,['-I','-c',`import sys;sys.path.insert(0,${JSON.stringify(DIR)})\n${code}`],{input,encoding:'utf8',timeout:60000,env:{...process.env,...env}});
 assert.equal(r.status,0,r.stderr);return r.stdout;
};
const json=(code,input)=>JSON.parse(python(code,input).trim().split('\n').pop());

const FAKE=`
import json, overlay as o
class UI(object):
    def __init__(self): self.state=None; self.picker=False; self.calls=[]; self.target=False
    def target_state(self): return self.state
    def has_target(self): return self.target
    def picker_visible(self): return self.picker
    def wait_for_picker(self): pass
    def open_picker(self): self.picker=True; self.calls.append('open_picker')
    def paint_pet(self,*a): self.calls.append(['paint',a[0],a[1],a[2],a[3],len(a[4])])
    def hide_pet(self): self.calls.append('hide_pet')
    def show_bar(self,canvas,paused): self.calls.append(['bar',list(canvas),paused])
    def hide_bar(self): self.calls.append('hide_bar')
    def status_changed(self,t): pass
    def close(self): self.calls.append('close')
sent=[]; ui=UI(); c=o.Companion(ui,sent.append,cell=16)
def pick(): ui.picker=False; ui.target=True; c.picker_closed(True)
`;

test('helper is Python 3.6 grammar and standard library only',{skip},()=>{
 const out=json(`import ast,sys,json
src=open(${JSON.stringify(HELPER)},encoding='utf-8').read()
ok=None
if sys.version_info>=(3,8): ast.parse(src,feature_version=(3,6)); ok=True
mods=sorted({(n.names[0].name if isinstance(n,ast.Import) else n.module).split('.')[0] for n in ast.walk(ast.parse(src)) if isinstance(n,(ast.Import,ast.ImportFrom))})
print(json.dumps({'py36':ok,'mods':mods,'fstrings':any(isinstance(n,ast.JoinedStr) for n in ast.walk(ast.parse(src)))}))`);
 if(out.py36!==null)assert.equal(out.py36,true);
 assert.deepEqual(out.mods,['collections','ctypes','json','os','select','socket','sys','threading','time']);
 assert.equal(out.fstrings,false);
});

test('pure helpers: session refusal, grid caps and premultiplied dot tiles',{skip},()=>{
 const out=json(`import json, overlay as o
r={}
r['wayland']=o.session_problem({'DISPLAY':':0','WAYLAND_DISPLAY':'wayland-0'},'linux')
r['wtype']=o.session_problem({'DISPLAY':':0','XDG_SESSION_TYPE':'Wayland'},'linux')
r['nodisplay']=o.session_problem({},'linux')
r['x11']=o.session_problem({'DISPLAY':':0','XDG_SESSION_TYPE':'x11'},'linux')
r['mac']=o.session_problem({'DISPLAY':':0'},'darwin')
r['hd']=o.choose_grid(1920,1080,16); r['huge']=o.choose_grid(15360,8640,16); r['tiny']=o.choose_grid(100,50,16)
t=o.DotTiles(16); full=t.tile(255); empty=t.tile(0)
r['tile']=[len(full),len(full[0])]; r['empty']=all(b==0 for row in empty for b in row)
px=[tuple(row[i:i+4]) for row in full for i in range(0,len(row),4)]
r['premul']=all(a>=max(b,g,rr) for b,g,rr,a in px); r['maxa']=max(p[3] for p in px); r['inked']=sum(1 for p in px if p[3])
r['render']=len(t.render(['\\u28ff\\u2800','\\u2801\\u2880'])); r['dots']=t.dot_count(['\\u28ff\\u2801'])
try: o.choose_grid(800,600,14); r['badcell']=False
except o.OverlayError: r['badcell']=True
print(json.dumps(r))`);
 for(const k of ['wayland','wtype'])assert.match(out[k],/Wayland.*Xorg/s);
 assert.match(out.nodisplay,/DISPLAY is not set/);
 assert.equal(out.x11,null);assert.match(out.mac,/only on Linux/);
 assert.deepEqual(out.hd,[120,33]);
 assert.ok(out.huge[0]*out.huge[1]<=20000&&out.huge[0]>out.huge[1],JSON.stringify(out.huge));
 assert.deepEqual(out.tiny,[6,1]);
 assert.deepEqual(out.tile,[32,64]);assert.equal(out.empty,true);
 assert.equal(out.premul,true);assert.equal(out.maxa,245);assert.ok(out.inked>=8);
 assert.equal(out.render,2*16*4*2*32);assert.equal(out.dots,9);assert.equal(out.badcell,true);
});

test('frames cropped by protocol.mjs validate; malformed frames are rejected',{skip},()=>{
 const text=['⠀⠀⠀⠀⠀','⠀⣿⠁⠀⠀','⠀⠀⢀⡇⠀','⠀⠀⠀⠀⠀'].join('\n');
 const frame=cropFrame({columns:5,rows:4,text},7),empty=cropFrame({columns:2,rows:1,text:'⠀⠀'},7);
 const out=json(`import json,sys, overlay as o
frames=json.loads(sys.stdin.buffer.read().decode('utf-8')); r={}
r['ok']=list(o.parse_frame(frames[0],16,5,4)); r['empty']=o.parse_frame(frames[1],16,5,4)
bad={'outside':dict(frames[0],x=4),'ascii':dict(frames[0],text='ab\\ncd',columns=2,rows=2),
     'rows':dict(frames[0],rows=3),'boolx':dict(frames[0],x=True),'big':dict(frames[0],columns=500,rows=251)}
for k,f in bad.items():
    try: o.parse_frame(f,16,5,4); r[k]='accepted'
    except o.OverlayError as e: r[k]=str(e)
print(json.dumps(r))`,JSON.stringify([frame,empty]));
 assert.deepEqual(out.ok,[1,1,3,2,['⣿⠁⠀','⠀⢀⡇']]);
 assert.equal(out.empty,null);
 assert.match(out.outside,/Out-of-bounds/);assert.match(out.ascii,/Only Braille/);assert.match(out.rows,/row count/);
 assert.match(out.boolx,/Invalid overlay field/);assert.match(out.big,/Out-of-bounds/);
});

test('protocol state machine: picker, revisions, stale ACKs, visibility, pause and quit',{skip},()=>{
 const out=json(FAKE+`
c.start()
r={'start':sent[:]}; del sent[:]
pick(); ui.state=(100,50,1600,900,True); c.track()
r['attach']=sent[:]; rev=c.revision; del sent[:]
c.handle({'type':'interaction','kind':'ball','accepted':True}); c.press('ball'); r['ballBeforeLoad']=sent[:]
c.handle({'type':'loaded'}); c.press('treat'); r['treat']=sent[-1]; del sent[:]; ui.calls[:]=[]
c.handle({'type':'frame','revision':rev,'x':2,'y':1,'columns':2,'rows':1,'text':'\\u28ff\\u2801'})
r['paint']=[sent[-1],[x for x in ui.calls if isinstance(x,list) and x[0]=='paint']]
c.handle({'type':'frame','revision':rev-1,'x':0,'y':0,'columns':1,'rows':1,'text':'\\u28ff'}); r['stale']=sent[-1]
c.handle({'type':'frame','revision':rev,'x':0,'y':0,'columns':0,'rows':0,'text':''}); r['emptyHides']=ui.calls[-1]
del sent[:]; ui.state=(100,50,1600,900,False); c.track(); r['inactive']=sent[:]; ui.calls[:]=[]
c.handle({'type':'frame','revision':c.revision,'x':0,'y':0,'columns':1,'rows':1,'text':'\\u28ff'}); r['hiddenAck']=[sent[-1],list(ui.calls)]
del sent[:]; ui.state=(100,50,1600,900,True); c.track(); c.press('pause'); r['pause']=sent[:]
c.press('ball'); r['ballWhilePaused']=sent[-1]
del sent[:]; ui.state=(100,50,140,900,True); c.press('pause'); r['tooSmall']=sent[-1]
del sent[:]; ui.state=None; ui.target=False; c.track(); r['gone']=sent[:]
del sent[:]; c.press('window'); r['picking']=[sent[-1],ui.calls[-1]]
del sent[:]; c.picker_closed(False); r['cancel']=sent[:]
del sent[:]; c.handle({'type':'quit'}); c.handle({'type':'quit'}); r['quit']=[sent[:],ui.calls[-1]]
print(json.dumps(r))`);
 const start=out.start,ready=start.findIndex(m=>m.type==='ready');
 assert.deepEqual(start[ready],{type:'ready',pickerVisible:true});
 assert.deepEqual(start[0],{type:'viewport',revision:1,visible:false,selected:false,columns:0,rows:0,cellWidth:16,cellHeight:32});
 assert.deepEqual(out.attach.map(m=>m.type),['pause','picker','viewport','viewport']);
 assert.deepEqual(out.attach.at(-1),{type:'viewport',revision:3,visible:true,selected:true,columns:100,rows:28,cellWidth:16,cellHeight:32});
 assert.deepEqual(out.ballBeforeLoad,[]);
 assert.deepEqual(out.treat,{type:'interact',kind:'treat'});
 assert.deepEqual(out.paint,[{type:'ack',painted:true},[['paint',132,82,32,32,32*32*4]]]);
 assert.deepEqual(out.stale,{type:'ack',painted:false});
 assert.equal(out.emptyHides,'hide_pet');
 assert.deepEqual(out.inactive.map(m=>[m.type,m.visible]),[['viewport',false]]);
 assert.deepEqual(out.hiddenAck,[{type:'ack',painted:false},[]]);
 assert.deepEqual(out.pause.map(m=>[m.type,m.paused??m.visible]),[['viewport',true],['pause',true],['viewport',false]]);
 assert.equal(out.ballWhilePaused.type,'viewport');
 assert.deepEqual([out.tooSmall.type,out.tooSmall.visible],['viewport',false]);
 assert.deepEqual(out.gone.map(m=>[m.type,m.visible,m.selected]),[['viewport',false,false]]);
 assert.deepEqual(out.picking,[{type:'viewport',revision:out.picking[0].revision,visible:false,selected:false,columns:0,rows:0,cellWidth:16,cellHeight:32},'open_picker']);
 assert.deepEqual(out.cancel.map(m=>m.type),['picker','viewport']);
 assert.deepEqual(out.quit,[[{type:'quit'}],'close']);
});

test('invalid engine messages fail closed instead of painting',{skip},()=>{
 const out=json(FAKE+`
c.start(); pick(); ui.state=(0,0,800,600,True); c.track(); r={}
for k,m in {'unknown':{'type':'paint'},'notdict':[1],'rev':{'type':'frame','revision':'1','x':0,'y':0,'columns':1,'rows':1,'text':'\\u28ff'}}.items():
    try: c.handle(m); r[k]='accepted'
    except o.OverlayError as e: r[k]=str(e)
del sent[:]; c.handle({'type':'error','message':'x'}); r['error']=[sent[-1],ui.calls[-1]]
print(json.dumps(r))`);
 assert.match(out.unknown,/Unsupported/);assert.match(out.notdict,/Invalid overlay message/);assert.match(out.rev,/revision/);
 assert.deepEqual(out.error,[{type:'quit'},'close']);
});

test('CLI refuses Wayland/unsupported sessions with one NDJSON error line',{skip},()=>{
 for(const args of [[],['--check-json']]){
  const r=spawnSync(PYTHON,['-I',HELPER,...args],{input:'',encoding:'utf8',timeout:30000,env:{...process.env,DISPLAY:':0',WAYLAND_DISPLAY:'wayland-0',XDG_SESSION_TYPE:'wayland'}});
  assert.equal(r.status,2,r.stderr);
  const lines=r.stdout.trim().split('\n');assert.equal(lines.length,1);const m=JSON.parse(lines[0]);
  const message=args.length?m.errors[0]:m.message;
  if(!args.length)assert.equal(m.type,'error');else assert.deepEqual([m.type,m.ok],['check',false]);
  assert.match(message,process.platform==='linux'?/Wayland.*Xorg/s:/only on Linux/);
 }
 const bad=spawnSync(PYTHON,['-I',HELPER,'--self-test','localhost:0'],{encoding:'utf8',timeout:30000});
 assert.equal(bad.status,2);assert.match(JSON.parse(bad.stdout).message,/explicit isolated display/);
});
