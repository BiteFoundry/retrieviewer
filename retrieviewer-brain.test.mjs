import test from 'node:test';
import assert from 'node:assert/strict';
import {createOpenRouterBrain,anonymousBrainState,parseBrainDecision,OPENROUTER_MODEL} from './integrations/openrouter/brain.mjs';
const apiKey='fixture-secret-not-a-real-key',input={kind:'approval',pendingCount:1};
const reply=(decision='notify',patch={})=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({decision})},...patch}]}),{status:200});
const make=options=>createOpenRouterBrain({apiKey,...options});

test('anonymous inputs and closed-set output reject executable or ambiguous model instructions',()=>{
 assert.deepEqual(anonymousBrainState({...input,room:'secret',prompt:'secret',image:'secret'}),{event:'pending_input',kind:'approval',pending_count:1});
 assert.deepEqual(anonymousBrainState({kind:'none',pendingCount:0}),{event:'no_pending_input',kind:'none',pending_count:0});
 for(const value of [null,{decision:'approve'},{decision:'notify',command:'execute'},{decision:'notify now'},['notify']])assert.throws(()=>parseBrainDecision(value));
 for(const value of [{kind:'none',pendingCount:1},{kind:'approval',pendingCount:0},{kind:'input',pendingCount:33},{kind:'input',pendingCount:'1'}])assert.throws(()=>anonymousBrainState(value));
 assert.throws(()=>make({apiKey:''}),/missing_key/);
 for(const options of [{timeoutMs:0},{timeoutMs:Infinity},{cacheMs:Infinity},{maxRequestsPerDay:0}])assert.throws(()=>make(options));
});

test('fixed paid DeepSeek request, price ceiling, privacy restriction, no tools, secrets or arbitrary event fields in payload',async()=>{
 let calls=0;
 const brain=make({fetch:async(url,options)=>{
  calls++;assert.equal(url,'https://openrouter.ai/api/v1/chat/completions');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer '+apiKey);
  const body=JSON.parse(options.body);assert.equal(body.model,OPENROUTER_MODEL);assert.equal(body.model,'deepseek/deepseek-v4.1-flash-1017');assert.deepEqual(body.provider.max_price,{prompt:0.3,completion:1.2,request:0});assert.equal(body.provider.data_collection,'deny');assert.equal(body.provider.require_parameters,true);assert.deepEqual(body.reasoning,{enabled:false});assert.deepEqual(body.response_format,{type:'json_object'});assert.equal(body.max_tokens,96);assert.equal(body.tools,undefined);assert.equal(body.models,undefined);
  assert.deepEqual(JSON.parse(body.messages[1].content),{event:'pending_input',kind:'approval',pending_count:1});assert.doesNotMatch(options.body,/private-room|private-text|fixture-secret/);
  return reply();
 }});
 assert.equal(calls,0);assert.equal((await brain.decide({...input,id:'private-room',text:'private-text'})).decision,'notify');
 assert.equal((await brain.decide(input)).via,'cache');assert.equal(calls,1);assert.equal(brain.status.cacheHits,1);assert.doesNotMatch(JSON.stringify(brain.status),/fixture-secret|Bearer/);
 brain.dispose();assert.equal(brain.status.state,'off');assert.equal(brain.status.cacheEntries,0);await assert.rejects(brain.decide(input),{code:'disposed'});
});

test('HTTP error/backoff has no raw upstream body and cannot fall back to another model',async()=>{
 let time=0,calls=0;
 const brain=make({now:()=>time,fetch:async()=>{calls++;return new Response('upstream echo '+apiKey,{status:429});}});
 await assert.rejects(brain.decide(input),{code:'rate_limited'});assert.equal(brain.status.state,'fallback');assert.equal(brain.status.dailyUsed,1);
 await assert.rejects(brain.decide(input),{code:'backoff'});assert.equal(calls,1);assert.doesNotMatch(JSON.stringify(brain.status),/upstream echo|fixture-secret/);
 time=60001;await assert.rejects(brain.decide(input),{code:'rate_limited'});assert.equal(calls,2);brain.dispose();
});

test('strict JSON, complete finish, no tool calls, and bounded response bytes',async()=>{
 for(const response of [reply('execute'),reply('notify',{finish_reason:'length'}),reply('notify',{message:{content:'{"decision":"notify","shell":"bad"}'}}),reply('notify',{message:{content:'{"decision":"notify"}',tool_calls:[{name:'click'}]}}),new Response('x'.repeat(40000)),new Response('not JSON')]){
  const brain=make({fetch:async()=>response});await assert.rejects(brain.decide(input));assert.equal(brain.status.state,'fallback');brain.dispose();
 }
 for(const [status,code] of [[401,'authorization_failed'],[403,'authorization_failed'],[404,'route_unavailable'],[500,'service_unavailable']]){
  const brain=make({fetch:async()=>new Response('private',{status})});await assert.rejects(brain.decide(input),{code});brain.dispose();
 }
});

test('request timeout and disposal abort in-flight inference and clean all owned state',async()=>{
 let signal;
 const brain=make({timeoutMs:100,fetch:async(_url,options)=>{signal=options.signal;return new Promise(()=>{});}});
 await assert.rejects(brain.decide(input),{code:'timeout'});assert.equal(signal.aborted,true);assert.equal(brain.status.inFlight,false);brain.dispose();
 const other=make({fetch:async(_url,options)=>{signal=options.signal;return new Promise(()=>{});}});
 const pending=other.decide(input);await assert.rejects(other.decide(input),{code:'busy'});other.dispose();await assert.rejects(pending,{code:'aborted'});assert.equal(signal.aborted,true);assert.equal(other.status.state,'off');
});

test('host cancellation cannot cache a late result or leak transport errors',async()=>{
 const controller=new AbortController();let finish;
 const brain=make({fetch:async()=>new Promise(resolve=>{finish=resolve;})});
 const pending=brain.decide({...input,signal:controller.signal});controller.abort();await assert.rejects(pending,{code:'aborted'});finish(reply());await Promise.resolve();assert.equal(brain.status.cacheEntries,0);brain.dispose();
 const bad=make({fetch:async()=>{throw Error('private transport '+apiKey);}});await assert.rejects(bad.decide(input),error=>error.code==='network_error'&&!error.message.includes(apiKey));bad.dispose();
});

test('daily budget, day rollover, cache expiry and cache capacity are bounded',async()=>{
 let today='2026-10-24',time=0,calls=0;
 const brain=make({now:()=>time,day:()=>today,maxRequestsPerDay:1,cacheMs:1000,fetch:async()=>{calls++;return reply();}});
 await brain.decide(input);time=500;await brain.decide(input);assert.equal(calls,1);time=1001;await assert.rejects(brain.decide(input),{code:'daily_budget'});
 today='2026-10-25';await brain.decide(input);assert.equal(calls,2);brain.dispose();
 const many=make({fetch:async()=>reply()});for(let n=1;n<=25;n++)await many.decide({kind:'input',pendingCount:n});assert.equal(many.status.cacheEntries,16);many.dispose();
});
