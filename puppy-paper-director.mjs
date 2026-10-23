// Bounded local behavior selection, independent of rendering and LLM services.
// Durations/energy are authored character parameters, not canine science claims.
export function createPaperDirector(seed=731){
 let value=seed>>>0,energy=.85,last='',choices=0,excursions=0;
 const random=()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/4294967296;};
 return{
  update(dt,moving,distance=0){energy=Math.max(0,Math.min(1,energy+dt*(moving?-.05:.025)-(moving?distance*.025:0)));},
  choose({x,z,seated}){
   choices++;
   let candidates=seated?[{kind:'watch',weight:2},{kind:'rest',weight:energy<.45?5:.5},{kind:'wander',weight:energy*5}]:[{kind:'wander',weight:3},{kind:'come',weight:2}];
   candidates=candidates.filter(a=>a.kind!==last);const total=candidates.reduce((n,a)=>n+a.weight,0);let pick=random()*total,selected=candidates.at(-1);
   for(const candidate of candidates){pick-=candidate.weight;if(pick<=0){selected=candidate;break;}}
   last=selected.kind;
   // Alternate near/middle/far excursions; do not trap autonomous life inside
   // the old one-meter box. Deep arrivals return before choosing another depth.
   const depths=[-1.6,-8,-3.2];
   const target=last==='come'?[x,.2]:[x>0?-.5:.5,z<-1?-.15:depths[excursions++%depths.length]];
   return{kind:last,target,holdSeconds:2+random()*2,side:random()<.5?'left':'right',energy};
  },get report(){return{energy,last,choices};}
 };
}
