// Bounded per-limb paw transport (inverse map, canonical 320px source space).
// Source ownership: x-Voronoi strips fixed once from the original foot x
// positions. Inside a strip every source row below y=225 is translated as a
// whole, x'=x+dx*g(y), y'=y+dy*gy(y): row widths (toes, shin) never stretch in
// x, g reaches 1 at the toe top so the toe block is rigid, and only the shin
// shears/bends. y<=225 is exact identity. A target that no layer claims from
// inside its own strip returns null (vacated or torn background), never a
// copy of the old toe.
const TORSO=226,TOE_RIGID=8,MIN_SPAN=4,FOLD_MARGIN=.9;
const smooth=t=>t<=0?0:t>=1?1:t*t*(3-2*t);
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const depthRank=id=>/near/.test(id)?0:/far/.test(id)?2:1;

export function createPawTransport(feet,pins,{opaque=null}={}){
 const list=[],seen=new Set();
 for(const foot of Array.isArray(feet)?feet:[]){
  if(!foot||typeof foot.id!=='string'||seen.has(foot.id)||!finite(foot.x)||!finite(foot.y))continue;
  seen.add(foot.id);list.push(foot);
 }
 const pinById=new Map();
 for(const pin of Array.isArray(pins)?pins:[]){
  if(!pin||!seen.has(pin.id)||pinById.has(pin.id))continue;
  const s=pin.source,t=pin.target;
  if(!s||!t||![s.x,s.y,t.x,t.y].every(finite))continue;
  pinById.set(pin.id,pin);
 }
 const limited=[],degenerate=[];
 const identity=(x,y)=>finite(x)&&finite(y)?{x,y}:null;
 if(!pinById.size||!list.length)return Object.assign(identity,{layers:[],limited,degenerate});
 // Strips from original foot centers, sorted by (x,id) so input order is irrelevant.
 const byX=[...list].sort((a,b)=>a.x-b.x||(a.id<b.id?-1:1));
 const layers=byX.map((foot,i)=>{
  const cx=foot.x+.5,lo=i?(byX[i-1].x+.5+cx)/2:-Infinity,hi=i<byX.length-1?(cx+byX[i+1].x+.5)/2:Infinity;
  if(!(cx>=lo&&cx<hi))degenerate.push(foot.id);
  const pin=pinById.get(foot.id),dx=pin?pin.target.x-pin.source.x:0;let dy=pin?pin.target.y-pin.source.y:0;
  const toeTop=Math.max(TORSO+MIN_SPAN,(pin?pin.source.y:foot.y+.5)-TOE_RIGID),span=toeTop-TORSO;
  // Vertical profile: smoothstep, blended toward a linear ramp when a negative
  // dy would fold it (max slope 1.5/span vs 1/span). Beyond even the linear
  // limit the vertical shift is clamped and the pin reported as limited.
  let a=0;
  if(dy<0){
   const k=FOLD_MARGIN*span/-dy;
   if(k<1){a=1;dy=-FOLD_MARGIN*span;limited.push(foot.id);}else if(k<1.5)a=Math.min(1,3-2*k);
  }
  return{id:foot.id,lo,hi,dx,dy,toeTop,span,a,active:!!pin,rank:depthRank(foot.id),y:foot.y,lastY:NaN,lastSy:NaN};
 });
 const gx=(L,s)=>smooth((s-TORSO)/L.span);
 const gy=(L,s)=>{const t=(s-TORSO)/L.span;return t<=0?0:t>=1?1:(1-L.a)*smooth(t)+L.a*t;};
 // Monotone vertical inverse; the renderer walks rows, so cache per layer.
 const invY=(L,y)=>{
  if(L.dy===0)return y;
  if(y>=L.toeTop+L.dy)return y-L.dy;
  if(y===L.lastY)return L.lastSy;
  let lo=TORSO,hi=L.toeTop;
  for(let i=0;i<48&&hi-lo>1e-9;i++){const m=(lo+hi)/2;if(m+L.dy*gy(L,m)<y)lo=m;else hi=m;}
  L.lastY=y;L.lastSy=(lo+hi)/2;return L.lastSy;
 };
 // Front-to-back. With an opacity predicate, true depth order with fall-through
 // on transparent source; without one, pinned layers first so anchors stay visible.
 const order=[...layers].sort((p,q)=>(opaque?0:(q.active-p.active))||p.rank-q.rank||q.y-p.y||(p.id<q.id?-1:1));
 const sourcePoint=(x,y)=>{
  if(!finite(x)||!finite(y))return null;
  if(y<TORSO)return{x,y};
  let fallback=null;
  for(const L of order){
   let sx,sy;
   if(L.dx===0&&L.dy===0){sx=x;sy=y;}
   else{sy=invY(L,y);sx=sy>=L.toeTop?x-L.dx:x-L.dx*gx(L,sy);}
   if(!(sx>=L.lo&&sx<L.hi))continue;
   if(!opaque||opaque(sx,sy))return{x:sx,y:sy};
   fallback??={x:sx,y:sy};
  }
  return fallback;
 };
 return Object.assign(sourcePoint,{layers:order.map(({id,lo,hi,dx,dy,toeTop,active,rank})=>({id,lo,hi,dx,dy,toeTop,active,rank})),limited,degenerate});
}
