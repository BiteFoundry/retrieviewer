import * as THREE from 'three';
import {createAnimal} from './vendor/procedural-animals/src/index.js';
export const LAB_OPTIONS={variant:'retriever',age:'juvenile',seed:2,quality:'low',worker:false,overrides:{colour:'yellow',stanceSoftMargin:.005}};
export async function makeLabAnimal(extra={}){
 return createAnimal('dog',{...LAB_OPTIONS,...extra,overrides:{...LAB_OPTIONS.overrides,...extra.overrides}});
}
// Never translate the mesh externally. The gait engine owns root motion + IK.
export function makeLabController(animal){
 let target=null,speed=animal.gears.walk;
 return {get target(){return target;},get speed(){return speed;},setSpeed(kind){
  if(!['walk','trot','gallop'].includes(kind))throw Error('Unknown gait');
  speed=animal.gears[kind];if(target)animal.moveTo(target,{speed});
 },go(x,z){
  if(![x,z].every(Number.isFinite))throw Error('Invalid ground target');
  target=new THREE.Vector3(Math.max(-.8,Math.min(.8,x)),0,Math.max(-1.7,Math.min(.3,z)));
  animal.stopAction();animal.moveTo(target,{speed});
 },stop(){target=null;animal.stop();},update(dt){
  if(!Number.isFinite(dt)||dt<0||dt>.1)throw Error('Invalid lab step');animal.update(dt);
  if(target&&animal.position.distanceTo(target)<.025&&animal.speed<.03){target=null;animal.stop();}
 }};
}
