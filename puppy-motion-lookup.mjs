// Pure lookups over offline data. No source analysis, graph search or I/O here.
const views=Object.freeze({front:0,rear:1,approach:2});
export function preparationRoute(tables,kind,{view,flip,seatProgress=0,desired,nextFlip=false,speed=0}){
 if(!Number.isFinite(speed)||Math.abs(speed)>tables.routes.maxPreparationSpeed)throw Error('Motion preparation requires a stopped root');
 const viewIndex=views[view],seat=seatProgress===0?0:seatProgress===1?2:1;
 const target=kind==='action'?(desired==='stand'?0:desired==='seat'?1:undefined):views[desired];
 if(viewIndex===undefined||target===undefined||typeof flip!=='boolean'||typeof nextFlip!=='boolean')throw Error('Unknown baked motion route');
 const index=kind==='action'?((viewIndex*2+ +flip)*3+seat)*2+target:((viewIndex*2+ +flip)*3+target)*2+ +nextFlip;
 const code=tables.routes[kind]?.[index],route=tables.routes.steps[code];if(!route)throw Error('Unknown baked motion route');
 return route;
}

export function canJoinMotion(tables,name,{view,speed,phase=0,nextSpeed=speed}){
 const join=tables.joins[name],epsilon=1e-7;
 if(!join||join.view!==view||![speed,phase,nextSpeed].every(Number.isFinite))return false;
 if(speed<join.speed[0]-epsilon||speed>join.speed[1]+epsilon||nextSpeed<join.speed[0]-epsilon||nextSpeed>join.speed[1]+epsilon||join.positiveSpeed&&(speed<=0||nextSpeed<=0))return false;
 if(join.phase!==undefined){const d=phase-join.phase;if(Math.abs(d-Math.round(d))>epsilon)return false;}
 if(join.matchVelocity&&Math.abs(speed-nextSpeed)>epsilon)return false;
 return true;
}
