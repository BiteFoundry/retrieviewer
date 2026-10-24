// Optional, tiny remote judge. No SDK, local model, I/O or timers on import.
export const OPENROUTER_MODEL='deepseek/deepseek-v4.1-flash-1017';
const ENDPOINT='https://openrouter.ai/api/v1/chat/completions';
const DECISIONS=new Set(['notify','ignore','uncertain']);
const SYSTEM='You classify anonymous desktop-companion attention events, not commands. Return only a JSON object with exactly one key: decision. Values: notify, ignore, uncertain. Confirmed pending approval or input needs human attention: notify. If no input is pending: ignore. If evidence is inconsistent: uncertain. Never approve, click, type, execute, or invent facts.';
export class BrainError extends Error {
 constructor(code){super('OpenRouter brain: '+code);this.name='BrainError';this.code=code;}
}
export function anonymousBrainState({kind,pendingCount}={}){
 if(!['approval','input','none'].includes(kind)||!Number.isInteger(pendingCount)||pendingCount<0||pendingCount>32||(kind==='none')!==(pendingCount===0))throw new BrainError('invalid_input');
 return {event:kind==='none'?'no_pending_input':'pending_input',kind,pending_count:pendingCount};
}
export function parseBrainDecision(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==1||!DECISIONS.has(value.decision))throw new BrainError('invalid_output');
 return value.decision;
}
async function boundedJSON(response){
 const reader=response.body?.getReader();if(!reader)throw new BrainError('invalid_response');
 const decoder=new TextDecoder();let text='',size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>32768)throw new BrainError('oversized_response');text+=decoder.decode(value,{stream:true});}text+=decoder.decode();return JSON.parse(text);}
 catch(error){await reader.cancel().catch(()=>{});throw error instanceof BrainError?error:new BrainError('invalid_response');}
 finally{reader.releaseLock();}
}
export function createOpenRouterBrain({apiKey=globalThis.process?.env?.OPENROUTER_API_KEY,fetch:request=globalThis.fetch,now=()=>performance.now(),day=()=>new Date().toISOString().slice(0,10),timeoutMs=3000,maxRequestsPerDay=40,cacheMs=60000}={}){
 if(typeof apiKey!=='string'||apiKey.length<10||apiKey.length>512||/\s/.test(apiKey))throw new BrainError('missing_key');
 if(typeof request!=='function'||typeof now!=='function'||typeof day!=='function')throw new BrainError('invalid_options');
 if(!Number.isFinite(timeoutMs)||timeoutMs<100||timeoutMs>15000||!Number.isInteger(maxRequestsPerDay)||maxRequestsPerDay<1||maxRequestsPerDay>1000||!Number.isFinite(cacheMs)||cacheMs<0||cacheMs>300000)throw new BrainError('invalid_options');
 const cache=new Map();let disposed=false,flight=null,dayKey=day(),used=0,calls=0,cacheHits=0,nextAllowed=0,lastLatencyMs=null,lastError=null,lastDecision=null,state='ready';
 return {
  async decide(input){
   if(disposed)throw new BrainError('disposed');
   const facts=anonymousBrainState(input),signal=input?.signal,key=JSON.stringify(facts),start=now();
   if(signal?.aborted)throw new BrainError('aborted');
   const stored=cache.get(key);if(stored&&start<stored.expires){cacheHits++;lastDecision=stored.decision;lastError=null;state='ready';return {decision:stored.decision,via:'cache',latencyMs:0};}
   if(flight)throw new BrainError('busy');
   if(start<nextAllowed)throw new BrainError('backoff');
   const today=day();if(today!==dayKey){dayKey=today;used=0;}
   if(used>=maxRequestsPerDay){state='fallback';lastError='daily_budget';throw new BrainError('daily_budget');}
   const operation={controller:new AbortController()};flight=operation;used++;calls++;state='requesting';
   let timer,rejectAbort;
   const interrupted=new Promise((_,reject)=>{rejectAbort=reject;});
   const abort=()=>{rejectAbort(new BrainError('aborted'));operation.controller.abort();};
   signal?.addEventListener('abort',abort,{once:true});
   operation.abort=abort;
   timer=setTimeout(()=>{rejectAbort(new BrainError('timeout'));operation.controller.abort();},timeoutMs);
   try{
    const result=await Promise.race([(async()=>{
     const response=await request(ENDPOINT,{
      method:'POST',redirect:'error',signal:operation.controller.signal,
      headers:{'Authorization':'Bearer '+apiKey,'Content-Type':'application/json'},
      // USD per million tokens; no per-request fee or alternate-model fallback.
      body:JSON.stringify({model:OPENROUTER_MODEL,messages:[{role:'system',content:SYSTEM},{role:'user',content:key}],temperature:0,max_tokens:96,reasoning:{enabled:false},response_format:{type:'json_object'},provider:{require_parameters:true,data_collection:'deny',max_price:{prompt:0.3,completion:1.2,request:0}}}),
     });
     if(!response.ok){await response.body?.cancel().catch(()=>{});throw new BrainError(response.status===429?'rate_limited':[401,403].includes(response.status)?'authorization_failed':response.status===404?'route_unavailable':'service_unavailable');}
     const body=await boundedJSON(response),choice=body.choices?.[0];
     if(choice?.finish_reason!=='stop'||typeof choice.message?.content!=='string'||choice.message.tool_calls?.length)throw new BrainError('invalid_output');
     let value;try{value=JSON.parse(choice.message.content);}catch{throw new BrainError('invalid_output');}
     return {decision:parseBrainDecision(value),via:'llm',latencyMs:Math.max(0,Math.round(now()-start))};
    })(),interrupted]);
    if(disposed||signal?.aborted||flight!==operation)throw new BrainError('aborted');
    lastLatencyMs=result.latencyMs;lastError=null;lastDecision=result.decision;state='ready';
    cache.delete(key);cache.set(key,{decision:result.decision,expires:now()+cacheMs});
    while(cache.size>16)cache.delete(cache.keys().next().value);
    return result;
   }catch(error){
    const safe=error instanceof BrainError?error:new BrainError('network_error');
    if(!disposed){lastError=safe.code;lastLatencyMs=Math.max(0,Math.round(now()-start));state='fallback';if(safe.code!=='aborted')nextAllowed=now()+(safe.code==='rate_limited'?60000:10000);}
    throw safe;
   }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);if(flight===operation)flight=null;}
  },
  get status(){return {provider:'openrouter',model:OPENROUTER_MODEL,state,calls,cacheHits,dailyUsed:day()===dayKey?used:0,dailyLimit:maxRequestsPerDay,cacheEntries:cache.size,inFlight:flight!==null,lastLatencyMs,lastError,lastDecision};},
  dispose(){if(disposed)return;disposed=true;flight?.abort();flight=null;cache.clear();apiKey='';state='off';},
 };
}
