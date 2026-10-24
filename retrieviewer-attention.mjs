// Opt-in attention coordinator. No I/O, timers, models or pet assets on import.
// Screen/app text is data, never an instruction or an executable action.
const MAX_ITEMS=32,MAX_SEEN=128;
const bounded=(value,max=128)=>typeof value==='string'&&value.length>0&&value.length<=max&&!/[\x00-\x1f\x7f]/.test(value);
// Cosmetic, local-only metadata. Never let a malformed title hide a real alert.
const localLabel=value=>typeof value==='string'?value.slice(0,256).replace(/[\x00-\x1f\x7f-\x9f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/g,'').replace(/\s+/g,' ').trim().slice(0,64).replace(/[\ud800-\udbff]$/,'')||undefined:undefined;
export function validateAttentionSnapshot(value){
 if(!value||!bounded(value.source,32)||!bounded(value.scope,256)||!Array.isArray(value.items)||value.items.length>MAX_ITEMS)throw Error('Invalid attention snapshot');
 const identities=new Set();
 const items=value.items.map(item=>{
  if(!item||!bounded(item.id)||!bounded(item.generation)||!(item.turnId===null||Number.isSafeInteger(item.turnId)&&item.turnId>=1)||item.requestId!==undefined&&!bounded(item.requestId)||item.turnId===null&&item.requestId===undefined||!['approval','input'].includes(item.kind))throw Error('Invalid attention item');
  const key=JSON.stringify([item.id,item.generation,item.turnId,item.requestId??null]);if(identities.has(key))throw Error('Duplicate attention item');identities.add(key);
  // No arbitrary source fields, output text, prompts, paths or tokens. A Seat's
  // bounded display label is for local status only, never the remote judge.
  const label=localLabel(item.label);
  return {id:item.id,generation:item.generation,turnId:item.turnId,...item.requestId===undefined?{}:{requestId:item.requestId},kind:item.kind,...label?{label}:{}};
 });
 return {source:value.source,scope:value.scope,items};
}

export function createAttentionMonitor({readSnapshot,onNotice,onClear=()=>{},onChange=()=>{},judgeNotice,judgeTimeoutMs=3500,now=()=>performance.now(),intervalMs=5000,staleMs=15000,noticeCooldownMs=20000}={}){
 if(typeof readSnapshot!=='function'||typeof onNotice!=='function'||typeof onClear!=='function'||typeof onChange!=='function'||typeof now!=='function')throw TypeError('Attention callbacks must be functions');
 if(judgeNotice!==undefined&&typeof judgeNotice!=='function')throw TypeError('judgeNotice must be a function');
 if(!Number.isFinite(judgeTimeoutMs)||judgeTimeoutMs<100||judgeTimeoutMs>15000)throw RangeError('Invalid judge timeout');
 if(!Number.isFinite(intervalMs)||intervalMs<1000||intervalMs>60000||!Number.isFinite(staleMs)||staleMs<intervalMs*2||staleMs>300000||!Number.isFinite(noticeCooldownMs)||noticeCooldownMs<1000||noticeCooldownMs>300000)throw RangeError('Invalid attention timing');
 let disposed=false,paused=false,flight=null,nextRead=0,nextNotice=0,lastSuccess=null,snapshot=null,state='connecting',lastReport='',cueKey=null,judgment=null,lastJudgment=null,target=null,targetKey='';
 const seen=new Map();
 const identity=(value,item)=>JSON.stringify([value.source,value.scope,item.id,item.generation,item.turnId,item.requestId??null]);
 const refreshTarget=()=>{
  const item=snapshot?.items.find(row=>identity(snapshot,row)===cueKey)??snapshot?.items.find(row=>row.kind==='approval')??snapshot?.items[0];
  target=item?{seatId:item.id,label:item.label??(item.id.length<=32?item.id:'Seat '+item.id.slice(-8)),kind:item.kind}:null;
  targetKey=JSON.stringify(target);
 };
 const clearCue=()=>{if(cueKey!==null){cueKey=null;refreshTarget();onClear();}};
 const cancelJudgment=()=>{const old=judgment;judgment=null;old?.controller.abort();};
 const report=()=>({state,pendingCount:snapshot?.items.length??0,target:target?{...target}:null,retainedNotices:seen.size,inFlight:flight!==null,...judgeNotice?{judging:!!judgment&&!judgment.ready,lastJudgment}:{}});
 const changed=()=>{const key=state+'|'+(snapshot?.items.length??0)+'|'+targetKey+'|'+!!judgment+'|'+lastJudgment;if(key!==lastReport){lastReport=key;onChange(report());}};
 const clear=next=>{snapshot=null;refreshTarget();lastSuccess=null;state=next;cancelJudgment();clearCue();changed();};
 function startRead(t){
  const operation={controller:new AbortController()};flight=operation;nextRead=t+intervalMs;
  operation.done=(async()=>{
   try{
    const result=validateAttentionSnapshot(await readSnapshot({signal:operation.controller.signal}));
    if(disposed||paused||flight!==operation)return;
    // A scope change cannot inherit either pending facts or dedupe identities.
    if(snapshot&&(snapshot.scope!==result.scope||snapshot.source!==result.source))seen.clear();
    snapshot=result;lastSuccess=now();state='connected';
    if(cueKey!==null&&!snapshot.items.some(item=>identity(snapshot,item)===cueKey))clearCue();
    if(judgment&&!snapshot.items.some(item=>identity(snapshot,item)===judgment.key))cancelJudgment();
    refreshTarget();
   }catch{
    if(disposed||paused||flight!==operation)return;
    // No source stderr, credentials, or stale pending facts escape on failure.
    clear('unavailable');
   }finally{
    if(flight===operation){flight=null;nextRead=now()+intervalMs;if(!disposed&&!paused)changed();}
   }
  })();
 }
 return {
  tick({active=true}={}){
   if(disposed)return;
   const t=now();if(!Number.isFinite(t))throw RangeError('Invalid attention clock');
   if(!active){
    if(!paused){paused=true;const old=flight;flight=null;old?.controller.abort();clear('paused');}
    return;
   }
   if(paused){paused=false;nextRead=t;state='connecting';changed();}
   if(snapshot&&t-lastSuccess>=staleMs)clear('stale');
   if(!flight&&t>=nextRead)startRead(t);
   // Advice settles independently of alert delivery. It cannot delay, retract,
   // repeat, or move an already-confirmed human-input notification.
   if(judgment){
    if(!judgment.ready&&t-judgment.start>=judgeTimeoutMs){judgment.ready=true;judgment.decision='uncertain';judgment.controller.abort();}
    if(judgment.ready){lastJudgment=judgment.decision==='notify'?'model_notify':judgment.decision==='ignore'?'rule_override':'rule_fallback';judgment=null;}
   }
   // A refresh already in flight may resolve/replace the candidate. Do not emit
   // an old cue in the microtask gap just before that fresh snapshot arrives.
   if(!flight&&snapshot&&state==='connected'&&t<lastSuccess+staleMs&&t>=nextNotice){
    // Approval and generic input for the same exact turn are one notification.
    let item=null;
    for(const row of snapshot.items)if(!seen.has(identity(snapshot,row))){if(!item)item=row;if(row.kind==='approval'){item=row;break;}}
    if(item&&onNotice({kind:item.kind,side:'left'})===true){
     const key=identity(snapshot,item);seen.set(key,true);cueKey=key;
     refreshTarget();
     if(judgeNotice){
      cancelJudgment();lastJudgment='rule_first';
      const operation={key,controller:new AbortController(),ready:false,start:t};judgment=operation;
      const facts={kind:item.kind,pendingCount:snapshot.items.length,signal:operation.controller.signal};
      operation.done=Promise.resolve().then(()=>{if(operation.controller.signal.aborted)throw Error('Canceled judgment');return judgeNotice(facts);}).then(result=>{
       if(judgment===operation&&!disposed&&!paused&&!operation.controller.signal.aborted){operation.decision=['notify','ignore','uncertain'].includes(result?.decision)?result.decision:'uncertain';operation.ready=true;}
      },()=>{if(judgment===operation&&!disposed&&!paused){operation.decision='uncertain';operation.ready=true;}});
     }
     // Still-pending identities cannot be evicted into repeated notifications.
     const live=new Set(snapshot.items.map(row=>identity(snapshot,row)));
     for(const prior of seen.keys()){if(seen.size<=MAX_SEEN)break;if(!live.has(prior))seen.delete(prior);}
     nextNotice=t+noticeCooldownMs;
    }
   }
   changed();
  },
  get status(){return report();},
  // For host shutdown/verification, not a second polling loop.
  async settled(){await flight?.done;await judgment?.done;},
  dispose(){if(disposed)return;disposed=true;const old=flight;flight=null;old?.controller.abort();cancelJudgment();snapshot=null;refreshTarget();clearCue();seen.clear();state='off';},
 };
}
