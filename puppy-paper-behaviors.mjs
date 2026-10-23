import{createRearSampler}from'./puppy-paper-contact.mjs';
export function paperBehaviorPose(state,info){
 const list=info.clips[state.behavior];if(!list)throw Error('Unknown paper behavior');
 const progress=state.behavior==='walk'?state.behaviorProgress%1:Math.max(0,Math.min(1,state.behaviorProgress));
 const q=Math.min(list.length-1e-9,progress*list.length),i=Math.floor(q),blend=Math.round((q-i)*8)/8;
 return{pair:list[i],blend};
}
export function createPaperBehaviorSampler(bytes,info){const sample=createRearSampler(bytes,info);return state=>{const p=paperBehaviorPose(state,info);return sample(p.pair,p.blend);};}
