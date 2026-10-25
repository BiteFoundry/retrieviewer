// Scalar travel and camera mathematics adapted from MIT Retrieviewer
// puppy-paper-world.mjs; copyright (c) 2026 Retrieviewer contributors.
// License text is retained in vendor/retrieviewer/LICENSE-CODE.
// Cat values below are design choices, not measured juvenile gait data.
import {WALK_STRIDE} from './walk-cycle.mjs';
const gait = (stride, frequency) => Object.freeze({stride, frequency, speed: stride * frequency});
export const CAT_GAITS = Object.freeze({
  walk: gait(WALK_STRIDE, .27/WALK_STRIDE),
  trot: gait(.62, 2),
  creep: gait(WALK_STRIDE, .13/WALK_STRIDE),
});

const GRAVITY = 9.81;
const DECELERATION = 1.8;
const ACCELERATION = Object.freeze({walk: .65, trot: 2, creep: .3});
const coordinate = n => Number.isFinite(n) && Math.abs(n) <= 1e6;
function point(x, z) {
  if (!coordinate(x) || !coordinate(z)) throw new RangeError('Invalid cat target');
}
function options(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid cat options');
}

// Rest-to-rest triangle/trapezoid: both the root and phase consume this integral.
function travel(length, speed, acceleration) {
  const peak = Math.min(speed, Math.sqrt(2 * length / (1 / acceleration + 1 / DECELERATION)));
  const ta = peak / acceleration, td = peak / DECELERATION;
  const da = peak * ta / 2, dd = peak * td / 2;
  const tc = Math.max(0, length - da - dd) / peak;
  const duration = ta + tc + td;
  return {duration, at(t) {
    if (t >= duration) return {distance: length, speed: 0};
    if (t < ta) return {distance: acceleration * t * t / 2, speed: acceleration * t};
    if (t < ta + tc) return {distance: da + peak * (t - ta), speed: peak};
    const remaining = duration - t;
    return {distance: length - DECELERATION * remaining * remaining / 2, speed: DECELERATION * remaining};
  }};
}

export function createCatMotion(config = {}) {
  options(config);
  let {x = 0, z = 0} = config;
  point(x, z);
  let y = 0, speed = 0, distance = 0, phase = 0, heading = 0, currentGait = 'walk';
  let active = null, pending = null, supportY=0, beltSpeed=0, beltDistance=0, wheelRadius=.6,wheelPhase=0;

  function advance(ds) {
    distance += ds;
    phase += ds / CAT_GAITS[currentGait].stride;
  }
  function launch(command) {
    if(command.kind==='wheel'){
      wheelRadius=command.radius;wheelPhase=0;
      active={...command,elapsed:0,covered:0};return;
    }
    const dx = command.x - x, dz = command.z - z, length = Math.hypot(dx, dz);
    if (command.kind === 'go') currentGait = command.gait;
    if (length > 0) heading = Math.atan2(dx, dz);
    if (command.kind === 'go' && length === 0) return;
    active = {
      kind: command.kind, x, z, targetX: command.x, targetZ: command.z,
      ux: length ? dx / length : 0, uz: length ? dz / length : 0,
      length, elapsed: 0, covered: 0,
      ...(command.kind === 'pounce'
        ? (()=>{const apex=Math.max(y,command.landingY)+command.height;
            const vy=Math.sqrt(2*GRAVITY*(apex-y));
            return {startY:y,targetY:command.landingY,vy,
              duration:(vy+Math.sqrt(2*GRAVITY*(apex-command.landingY)))/GRAVITY};})()
        : {plan: travel(length, CAT_GAITS[currentGait].speed, ACCELERATION[currentGait])}),
    };
    if (command.kind === 'pounce') speed = length / active.duration;
  }
  function brake() {
    if (!active || active.kind === 'pounce' || ['brake','wheel-brake'].includes(active.kind)) return;
    if(active.kind==='wheel'){
      const stride=active.stride,minDistance=beltSpeed*beltSpeed/2.4;
      // At useful speed, finish on the supported cycle boundary; never freeze
      // the gathered airborne drawing when an interaction brakes the wheel.
      const distance=beltSpeed>.15?(Math.ceil(wheelPhase+minDistance/stride)-wheelPhase)*stride:minDistance;
      const deceleration=distance>0?beltSpeed*beltSpeed/(2*distance):1.2;
      active=beltSpeed>0?{kind:'wheel-brake',initialSpeed:beltSpeed,deceleration,
        duration:beltSpeed/deceleration,elapsed:0,covered:0,stride}:null;return;
    }
    active = speed > 0 ? {
      kind: 'brake', x, z, ux: active.ux, uz: active.uz,
      initialSpeed: speed, duration: speed / DECELERATION, elapsed: 0, covered: 0,
    } : null;
  }
  function request(command) {
    if (active) {
      pending = command;
      brake();
    }
    if (!active) {
      pending = null;
      launch(command);
    }
  }
  return {
    go(targetX, targetZ, config = {}) {
      options(config);
      const {gait = 'walk'} = config;
      point(targetX, targetZ);
      if (typeof gait !== 'string' || !Object.hasOwn(CAT_GAITS, gait)) throw new RangeError('Invalid cat gait');
      request({kind: 'go', x: targetX, z: targetZ, gait});
    },
    stop() {
      pending = null;
      brake(); // A flight must finish its one physical trajectory.
    },
    pounce(targetX, targetZ, config = {}) {
      options(config);
      const {height = .18,landingY=0} = config;
      point(targetX, targetZ);
      if (!Number.isFinite(height) || height <= 0 || height > 1) throw new RangeError('Invalid pounce height');
      if(!Number.isFinite(landingY)||landingY<0||landingY>1)throw RangeError('Invalid landing support');
      request({kind: 'pounce', x: targetX, z: targetZ, height,landingY});
    },
    wheel(config={}){
      options(config);const {duration=10,speed=.65,radius=.6,stride=.32}=config;
      if(![duration,speed,radius,stride].every(Number.isFinite)||duration<2||duration>30||speed<=0||speed>2||radius<.3||radius>1||stride<.05||stride>1)
        throw RangeError('Invalid wheel motion');
      request({kind:'wheel',duration,peakSpeed:speed,radius,stride});
    },
    step(dt) {
      if (!Number.isFinite(dt) || dt < 0 || dt > .1) throw new RangeError('Invalid cat step');
      let remaining = dt;
      while (active && remaining > 0) {
        const a = active, duration = a.plan?.duration ?? a.duration;
        const used = Math.min(remaining, duration - a.elapsed);
        a.elapsed = Math.min(duration, a.elapsed + used);
        if(duration-a.elapsed<1e-10)a.elapsed=duration;
        remaining = Math.max(0, remaining - used);
        const done = a.elapsed >= duration;
        let covered;
        if(['wheel','wheel-brake'].includes(a.kind)){
          if(a.kind==='wheel'){
            beltSpeed=a.peakSpeed*Math.sin(Math.PI*a.elapsed/duration)**2;
            covered=a.peakSpeed*(a.elapsed/2-duration*Math.sin(2*Math.PI*a.elapsed/duration)/(4*Math.PI));
          }else{
            beltSpeed=Math.max(0,a.initialSpeed-a.deceleration*a.elapsed);
            covered=a.initialSpeed*a.elapsed-a.deceleration*a.elapsed*a.elapsed/2;
          }
          const ds=covered-a.covered;beltDistance+=ds;wheelPhase+=ds/a.stride;a.covered=covered;
          if(done){beltSpeed=0;if(Math.abs(wheelPhase-Math.round(wheelPhase))<1e-9)wheelPhase=Math.round(wheelPhase);
            active=null;if(pending){const command=pending;pending=null;launch(command);}}
          continue;
        }else if (a.kind === 'pounce') {
          covered = a.length * (a.elapsed / duration);
          speed = a.length / duration;
          y = a.startY+a.vy*a.elapsed-GRAVITY*a.elapsed*a.elapsed/2;
        } else if (a.kind === 'brake') {
          covered = a.initialSpeed * a.elapsed - DECELERATION * a.elapsed * a.elapsed / 2;
          speed = Math.max(0, a.initialSpeed - DECELERATION * a.elapsed);
        } else {
          const state = a.plan.at(a.elapsed);
          covered = state.distance;
          speed = state.speed;
        }
        x = a.x + a.ux * covered;
        z = a.z + a.uz * covered;
        advance(covered - a.covered);
        a.covered = covered;
        if (done) {
          // Exact endpoint is used only when the trajectory itself has ended.
          if (a.kind !== 'brake') { x = a.targetX; z = a.targetZ; }
          speed = 0;
          if(a.kind==='pounce')supportY=a.targetY;
          y = supportY;
          active = null;
          if (pending) {
            const command = pending;
            pending = null;
            launch(command);
          }
        }
      }
    },
    sample() {
      return {x, y, z, speed, distance, phase, gait: currentGait, moving: active !== null, heading,
        supportY,airborne:active?.kind==='pounce',flightProgress:active?.kind==='pounce'?active.elapsed/active.duration:0,
        exercising:['wheel','wheel-brake'].includes(active?.kind),beltSpeed,beltDistance,wheelPhase,wheelAngle:beltDistance/wheelRadius};
    },
  };
}

// Fixed assumed 32-inch 16:9 display at .70m; fit it inside any pixel rectangle.
const diagonal = .0254 * 32;
const screenWidth = diagonal * 16 / Math.hypot(16, 9);
const screenHeight = diagonal * 9 / Math.hypot(16, 9);
const pitch = 9 * Math.PI / 180, c = Math.cos(pitch), s = Math.sin(pitch);
export function projectCat(x, y, z, config = {}) {
  options(config);
  const {width, height, canvasMeters = .60} = config;
  if (![x, y, z, width, height, canvasMeters].every(Number.isFinite)
      || width <= 0 || height <= 0 || canvasMeters <= 0) throw new RangeError('Invalid cat projection');
  const cameraY = c * (y - .45) - s * (z - 1.65);
  const depth = -s * (y - .45) - c * (z - 1.65);
  if (!Number.isFinite(depth) || depth <= 0) throw new RangeError('Cat point behind camera');
  const focal = .70 * Math.min(width / screenWidth, height / screenHeight);
  const result = {x: width / 2 + focal * x / depth, y: height / 2 - focal * cameraY / depth,
    size: focal * canvasMeters / depth, depth};
  if (!Object.values(result).every(Number.isFinite)) throw new RangeError('Invalid cat projection range');
  return result;
}

// Invert the same fixed pinhole camera at the ground plane (world y=0).
export function unprojectCatGround(u,v,{width,height}={}){
  if(![u,v,width,height].every(Number.isFinite)||width<=0||height<=0)throw RangeError('Invalid cat ground pixel');
  const focal=.70*Math.min(width/screenWidth,height/screenHeight),q=(height/2-v)/focal;
  const denominator=s-q*c;
  if(Math.abs(denominator)<1e-10)throw RangeError('Cat ground ray at horizon');
  const dz=-.45*(c+q*s)/denominator,depth=s*.45-c*dz;
  if(depth<=0||!Number.isFinite(depth))throw RangeError('Cat ground behind camera');
  return {x:(u-width/2)*depth/focal,z:dz+1.65};
}
