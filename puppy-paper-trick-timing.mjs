import {validatePaperActionInfo} from './puppy-paper-actions.mjs';

// Art-directed "snappy" trick timing (a staging choice, not measured animal
// behaviour): short windup, fast active rotation, brief settle. Pure helper that
// maps action age (s) to the clip progress paperActionPose already consumes.
// Phase boundaries sit exactly on v5 weighted edge boundaries, located by key
// name: windup ends after the first edge arriving at `enter`; settle starts at
// the last edge leaving `exit`. seconds = [windup, active, settle].
export const SNAPPY_TRICK_PROFILES=Object.freeze({
 spin:Object.freeze({enter:'spin0',exit:'spin15',seconds:Object.freeze([.1,.72,.14])}),
 roll:Object.freeze({enter:'bridge6',exit:'bridge6',seconds:Object.freeze([.56,.86,.62])}),
 'roll-down':Object.freeze({enter:'bridge6',exit:'bridge6',seconds:Object.freeze([.32,.86,.62])}),
});
export const TRICK_PHASES=Object.freeze(['windup','active','settle']);
const fail=m=>{throw Error(`Invalid trick timing: ${m}`);};

// Clip edges as key names plus cumulative weighted progress at every edge boundary.
export function trickClipEdges(name,info){
 validatePaperActionInfo(info);
 const list=info.clips[name],weights=info.weights?.[name]??list.map(()=>1),{keyOrder,edges}=info;
 if(!Array.isArray(keyOrder)||!Array.isArray(edges)||edges.length<info.pairs)fail('missing keyOrder/edges');
 const keys=list.map(p=>{const e=edges[p];if(!Array.isArray(e)||e.length!==2||!e.every(k=>Number.isInteger(k)&&typeof keyOrder[k]==='string'))fail(`edge ${p}`);return[keyOrder[e[0]],keyOrder[e[1]]];});
 for(let i=1;i<keys.length;i++)if(edges[list[i-1]][1]!==edges[list[i]][0])fail(`${name} chain breaks at edge ${i}`);
 const total=weights.reduce((a,b)=>a+b,0),bounds=[0];let sum=0;
 for(let i=0;i<weights.length-1;i++){sum+=weights[i];bounds.push(sum/total);}bounds.push(1);
 return{list,keys,bounds};
}

export function createTrickTiming(name,info,profile=SNAPPY_TRICK_PROFILES[name]){
 if(!profile||typeof profile.enter!=='string'||typeof profile.exit!=='string')fail(`profile for ${name}`);
 const s=profile.seconds;if(!Array.isArray(s)||s.length!==3||!s.every(v=>typeof v==='number'&&Number.isFinite(v)&&v>0))fail('seconds');
 const {list,keys,bounds}=trickClipEdges(name,info);
 const first=keys.findIndex(k=>k[1]===profile.enter),last=keys.findLastIndex(k=>k[0]===profile.exit);
 if(first<0)fail(`no edge arrives at ${profile.enter}`);if(last<0)fail(`no edge leaves ${profile.exit}`);
 // Edge index ranges [from,to] per phase; every phase owns at least one edge.
 const ranges=[[0,first],[first+1,last-1],[last,list.length-1]];
 if(!ranges.every(([a,b])=>a<=b))fail(`${name} phases need at least one edge each`);
 const T=[0,s[0],s[0]+s[1],s[0]+s[1]+s[2]],P=[0,bounds[first+1],bounds[last],1];
 // Monotone cubic Hermite (Fritsch-Butland): zero speed at both ends, harmonic
 // mean of adjacent secants inside, so progress is C1 across phase boundaries.
 const d=[0,1,2].map(i=>(P[i+1]-P[i])/(T[i+1]-T[i])),m=[0,2*d[0]*d[1]/(d[0]+d[1]),2*d[1]*d[2]/(d[1]+d[2]),0];
 const duration=T[3];
 const progressAt=age=>{
  if(typeof age!=='number'||!Number.isFinite(age))fail('age');
  if(age<=0)return 0;if(age>=duration)return 1;
  const i=age<T[1]?0:age<T[2]?1:2,h=T[i+1]-T[i],u=(age-T[i])/h,u2=u*u,u3=u2*u;
  const p=(2*u3-3*u2+1)*P[i]+(u3-2*u2+u)*h*m[i]+(-2*u3+3*u2)*P[i+1]+(u3-u2)*h*m[i+1];
  return Math.max(P[i],Math.min(P[i+1],p));
 };
 const phases=Object.freeze(TRICK_PHASES.map((phase,i)=>Object.freeze({phase,start:T[i],end:T[i+1],progressStart:P[i],progressEnd:P[i+1],
  firstEdge:ranges[i][0],lastEdge:ranges[i][1],fromKey:keys[ranges[i][0]][0],toKey:keys[ranges[i][1]][1]})));
 return Object.freeze({name,duration,phases,progressAt});
}

// Timings for every profiled clip present in this action cache (e.g. v5 info).
export function createSnappyTrickTimings(info,profiles=SNAPPY_TRICK_PROFILES){
 return Object.freeze(Object.fromEntries(Object.keys(profiles).filter(n=>Object.prototype.hasOwnProperty.call(info?.clips??{},n)).map(n=>[n,createTrickTiming(n,info,profiles[n])])));
}
