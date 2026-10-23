import {createZoomies,zoomiesAt} from './puppy-zoomies.mjs';
export const ZOOMIES30={width:320,height:320,count:30,runCount:20,pantCount:10,fps:30,tempo:.6};
export function zoomies30At(seconds,options={}){
 // Slow the shared behavior/pose clock, not the display refresh rate.
 const time=seconds*ZOOMIES30.tempo,state=zoomiesAt(time,options);
 if(state.state==='run')state.pose=Math.floor(time*30)%20;
 else if(state.state==='brake')state.pose=19;
 else if(state.state==='settle')state.pose=20;
 else state.pose=20+Math.floor(time*15)%10;
 return state;
}
export function createZoomies30(atlas,width,height){return createZoomies(atlas,width,height,{spec:ZOOMIES30,stateAt:zoomies30At});}
