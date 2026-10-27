// Authored grounded yaw; each half-turn shares an exact standing endpoint.
// Mirroring changes only at the symmetric frontal endpoint, never mid-profile.
export function catFacingPath(from,fromMirror,to,toMirror){
 const path=[];
 const push=(clip,reverse,mirror,view)=>path.push({clip,reverse,mirror,view,seconds:.28});
 if(from===to&&(from==='front'||fromMirror===toMirror))return path;
 if(from==='rear'){push('turn-side-rear',true,fromMirror,'side');from='side';}
 if(from==='side'){
  if(to==='rear'&&fromMirror===toMirror){push('turn-side-rear',false,fromMirror,'rear');return path;}
  push('turn-front-side',true,fromMirror,'front');
 }
 if(to==='front')return path;
 push('turn-front-side',false,toMirror,'side');
 if(to==='rear')push('turn-side-rear',false,toMirror,'rear');
 return path;
}
