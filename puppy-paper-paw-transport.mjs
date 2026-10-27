// Per-limb inverse transport in canonical source space. Adjacent strips share
// a boundary: over a narrow band on either side their row displacements blend
// to the same midpoint. This joins the shin while retaining rigid toe cores.
// Outside that band the original per-limb inverse, including vacated toes, wins.
const TORSO=226,TOE_RIGID=8,MIN_SPAN=4,FOLD_MARGIN=.9,SEAM=8;
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
 // Build a continuous, piecewise-linear inverse at each row. The half-band
 // never exceeds half a strip, so neighboring bands cannot overlap. Vertical
 // inverse coordinates meet at the same midpoint on the shared boundary.
 let lastRow=NaN,rows=[];
 const sourcePoint=(x,y)=>{
  if(!finite(x)||!finite(y))return null;
  if(y<TORSO)return{x,y};
  if(y!==lastRow){rows=layers.map(L=>{const sy=invY(L,y);return {sy,shift:L.dx*gx(L,sy)};});lastRow=y;}
  for(let i=0;i<layers.length;i++){
   const L=layers[i],r=rows[i],prev=layers[i-1],next=layers[i+1];
   const leftWidth=prev?Math.min(Math.max(SEAM,Math.abs(rows[i-1].shift-r.shift)/2+1),(L.hi-L.lo)/2,(prev.hi-prev.lo)/2):0;
   const rightWidth=next?Math.min(Math.max(SEAM,Math.abs(r.shift-rows[i+1].shift)/2+1),(L.hi-L.lo)/2,(next.hi-next.lo)/2):0;
   const left=prev?L.lo+(rows[i-1].shift+r.shift)/2:-Infinity;
   const right=next?L.hi+(r.shift+rows[i+1].shift)/2:Infinity;
   if(x<left||x>=right)continue;
   let sx=x-r.shift,sy=r.sy;
   if(prev&&x<L.lo+leftWidth+r.shift){
    const edge=L.lo+leftWidth+r.shift,t=(x-left)/(edge-left);
    sx=L.lo+leftWidth*t;sy=(rows[i-1].sy+r.sy)/2+(r.sy-rows[i-1].sy)/2*t;
   }else if(next&&x>L.hi-rightWidth+r.shift){
    const edge=L.hi-rightWidth+r.shift,t=(x-edge)/(right-edge);
    sx=L.hi-rightWidth+rightWidth*t;sy=r.sy+(rows[i+1].sy-r.sy)/2*t;
   }
   return{x:sx,y:sy};
  }
  return null;
 };
 const order=layers;
 return Object.assign(sourcePoint,{layers:order.map(({id,lo,hi,dx,dy,toeTop,active,rank})=>({id,lo,hi,dx,dy,toeTop,active,rank})),limited,degenerate});
}
