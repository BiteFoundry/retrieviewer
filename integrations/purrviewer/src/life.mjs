// Authored companion cadence, not a biological model. The host owns motion/time.
import {CAT_HABITAT} from './habitat.mjs';
const GROUND = 1e-6;
const hold = (clip, duration) => ({clip, duration, elapsed: 0, progress: 0});
const matHold = (clip,duration) => ({...hold(clip,duration),mat:true});
const towerLoad=(duration,facing)=>({...hold('tower-load',duration),facing});
const travel = (clip, command) => ({clip, command, issued: false, acknowledged: false, progress: 0});
const stretchPhases = () => [hold('stretch-enter', 1.15), hold('stretch-reach', .65),
  hold('stretch-hold', 1.25), hold('stretch-release', .7), hold('stretch-leave', 1.15)];

export function createCatLife({seed = 731} = {}) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError('seed must be an unsigned 32-bit integer');
  }
  let randomState = seed;
  const random = () => {
    randomState = (randomState + 0x6d2b79f5) >>> 0;
    let n = Math.imul(randomState ^ randomState >>> 15, randomState | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
  const range = (min, max) => min + random() * (max - min);
  let clock = 0;
  let lastChoice = 'observe';
  let roamAfter = 20;
  let playAfter = 90;
  let companyAfter = 60, attentionUntil = 0, eyeAfter = 0;
  let habitatAfter=100;
  let pending = null;
  let stopSent = false;
  let episode = {intent: 'observe', label: 'Watching quietly', direct: false,
    phases: [hold('sit', 1.2), hold('eye-greeting',3.4),hold('tail-swish', 3.6), hold('loaf-enter', .9),
      hold('loaf-rest', range(12, 24)), hold('loaf-leave', .9), hold('sit', 2)]};
  let index = 0;
  const current = () => episode.phases[index];
  const grounded = sample => !sample.airborne&&sample.y <= (sample.supportY??0)+GROUND;
  const settled = sample => grounded(sample) && !sample.moving;

  function toyPhases(sample, target) {
    const dx = target.x - sample.x;
    const dz = target.z - sample.z;
    const distance = Math.hypot(dx, dz);
    const phases = [];
    if (distance > .35) {
      phases.push(travel('creep', {kind: 'go', x: target.x - dx / distance * .3,
        z: target.z - dz / distance * .3, gait: 'creep'}));
    }
    phases.push(hold('crouch', .65),
      travel('pounce', {kind: 'pounce', x: target.x, z: target.z, height: .18}),
      hold('land', .3), hold('bat', .9), hold('sit', 2.5));
    return phases;
  }

  function localToy(sample) {
    const direction=Math.abs(sample.x)>.3?(sample.x>0?-1:1):(random()<.5?-1:1);
    return {x:sample.x+direction*.6,z:sample.z};
  }

  function companyPhases(sample) {
    const target={x:sample.x<0?-.18:.18,z:Math.min(0,Math.max(-.35,sample.z+.65))};
    const phases=[];
    // Choose one nearby rest place, at most .8m away. A distant cat comes a
    // little closer rather than instantly returning to the front every time.
    const dx=target.x-sample.x,dz=target.z-sample.z,distance=Math.hypot(dx,dz);
    if(distance>.18){const scale=Math.min(1,.8/distance);
      phases.push(travel('walk',{kind:'go',x:sample.x+dx*scale,z:sample.z+dz*scale,gait:'walk'}));}
    phases.push(hold('sit',1.2),...(clock>=eyeAfter?[hold('eye-greeting',3.4)]:[]),matHold('knead-enter',.8),
      matHold('knead',4.8),matHold('knead-leave',.8),matHold('loaf-rest',range(25,45)),
      matHold('loaf-leave',.9),matHold('sit',2));
    companyAfter=clock+range(180,300);
    return phases;
  }

  function descent(sample){
    if(!(sample.supportY>0))return [];
    const t=CAT_HABITAT.tower;
    return [towerLoad(.4,1),travel('tower-down',{kind:'pounce',x:t.approachX,z:t.z,height:.055,landingY:0}),
      hold('tower-land',.4),hold('sit',.7)];
  }
  function habitatPhases(kind){
    habitatAfter=clock+range(160,260);
    const t=CAT_HABITAT.tower,w=CAT_HABITAT.wheel;
    if(kind==='wheel')return [travel('walk',{kind:'go',x:w.catX,z:w.z,gait:'walk'}),
      hold('wheel-enter',.35),travel('wheel-run',{kind:'wheel',duration:10,speed:1.2,radius:w.radius,stride:w.stride}),
      hold('wheel-leave',.7),travel('walk',{kind:'go',x:w.catX-.3,z:w.z+.14,gait:'walk'}),hold('sit',3)];
    return [travel('walk',{kind:'go',x:t.approachX,z:t.z,gait:'walk'}),towerLoad(.55,-1),
      travel('tower-up',{kind:'pounce',x:t.lowX,z:t.z,height:.07,landingY:t.lowY,perch:true}),hold('tower-settle',.18),
      towerLoad(.25,-1),travel('tower-up',{kind:'pounce',x:t.highX,z:t.z,height:.065,landingY:t.highY,perch:true}),
      hold('tower-settle',.18),hold('sit',2),hold('eye-greeting',3.4),hold('loaf-enter',.9),
      hold('loaf-rest',range(15,25)),hold('loaf-leave',.9),towerLoad(.4,1),
      travel('tower-down',{kind:'pounce',x:t.lowX,z:t.z,height:.04,landingY:t.lowY}),hold('tower-land',.35),
      ...descent({supportY:t.lowY})];
  }

  function beginInteraction(sample) {
    const {kind, target} = pending;
    const previousPhase=current(),previous = previousPhase.clip;
    const fromSleep = ['sleep','loaf'].includes(previous);
    const recovery = previous==='wheel-run'?[hold('wheel-leave',.7)]:
      ['loaf-enter', 'loaf-rest'].includes(previous) ? [previousPhase.mat?matHold('loaf-leave',.9):hold('loaf-leave', .9)] :
      ['knead-enter','knead'].includes(previous) ? [matHold('knead-leave',.8),matHold('loaf-leave',.9)] :
      previous==='knead-leave' ? [matHold('loaf-leave',.9)] :
      fromSleep ? [hold('wake', 1.8), ...(kind==='stretch'?[]:[hold('stretch-leave',1.15)])] :
      ['stretch-reach','stretch-hold'].includes(previous) ? [hold('stretch-release', .7),hold('stretch-leave',1.15)] :
      ['stretch-enter','stretch-release','wake'].includes(previous) ? [hold('stretch-leave',1.15)] :
      previous.startsWith('feed-') && previous !== 'feed-leave' ? [hold('feed-leave', 1.35)] :
      ['treat','stretch','greet','company'].includes(kind) && ['walk','creep','land'].includes(previous) ? [hold('sit', .55)] : [];
    pending = null;
    stopSent = false;
    index = 0;
    // Discard every old phase/target; direct play never resumes a stale route.
    episode = {intent: kind, direct: true,
      label: kind === 'toy' ? 'Stalking a toy' : kind === 'treat' ? 'Enjoying a nearby treat' :
        kind==='stretch'?'A long supported stretch':kind==='tail'?'A little tail-tip attention':
          kind==='company'?'Choosing a quiet place nearby':'A soft eye greeting',
      phases: [...recovery,...descent(sample), ...(kind === 'toy' ? toyPhases(sample, target ?? localToy(sample)) :
        kind === 'treat' ? [hold('feed-enter', 1.35), hold('feed-sniff', .45),
          hold('feed-lick', 3.6), hold('feed-finish', .45), hold('feed-leave', 1.35), hold('sit', 1)] :
        kind === 'stretch' ? [...stretchPhases().slice(fromSleep?1:0),hold('sit',2)] :
        kind === 'tail' ? [hold('tail-swish',3.6),hold('sit',1)] :
        kind === 'company' ? companyPhases(sample) :
        ['tower','wheel'].includes(kind)?habitatPhases(kind):
          clock>=eyeAfter?[hold('sit', .45), hold('eye-greeting', 3.4), hold('sit', 1)]:[hold('sit',1.2)])]};
    // Quiet time follows a direct episode before autonomous travel/play returns.
    roamAfter = Math.max(roamAfter, clock + 20);
    playAfter = Math.max(playAfter, clock + 90);
  }

  function choose(sample) {
    const choices = [['observe', 35], ['groom', 20], ['sleep', 20], ['stretch', 8],
      ['roam', clock >= roamAfter ? 12 : 0], ['play', clock >= playAfter ? 5 : 0],
      ['company',clock>=companyAfter?(clock<attentionUntil?12:6):0],
      ['tower',clock>=habitatAfter?5:0],['wheel',clock>=habitatAfter?3:0]]
      .filter(([kind, weight]) => kind !== lastChoice && weight > 0);
    let ticket = random() * choices.reduce((sum, [, weight]) => sum + weight, 0);
    const kind = choices.find(([, weight]) => (ticket -= weight) < 0)[0];
    lastChoice = kind;
    let phases;
    let label;
    switch (kind) {
      case 'observe':
        label = 'Watching quietly';
        phases = random() < .7 ? [hold('sit', 2), hold('tail-swish',3.6),hold('loaf-enter', .9),
          hold('loaf-rest', range(12, 24)), hold('loaf-leave', .9), hold('sit', 2)] :
          [hold('sit', range(8, 16)), random()<.5?hold('eye-greeting',3.4):hold('blink',.8), hold('tail-tip',2.8),hold('idle', range(4, 8))];
        break;
      case 'groom':
        label = 'A little grooming';
        phases = [hold('sit', .6), hold('groom', range(5, 9)), hold('sit', 2)];
        break;
      case 'sleep':
        label = 'A long quiet nap';
        phases = [hold('loaf', 2), hold('sleep', range(60, 120)), hold('wake', 1.8),
          ...stretchPhases().slice(1), hold('sit', 2)];
        break;
      case 'stretch':
        label = 'Stretching out';
        phases = [...stretchPhases(), hold('sit', range(5, 9))];
        break;
      case 'roam': {
        label = 'A short wander';
        const angle = range(0, Math.PI * 2);
        const distance = range(.35, .8);
        let x=Math.max(-.55,Math.min(.55,sample.x+Math.cos(angle)*distance));
        let z=Math.max(-3.5,Math.min(0,sample.z+Math.sin(angle)*distance));
        if(Math.hypot(x-sample.x,z-sample.z)<.15){x=sample.x>.0?-.35:.35;z=Math.max(-3,Math.min(0,sample.z-.3));}
        phases = [hold('idle', .8), travel('walk', {kind: 'go',
          x,z,gait:'walk'}),hold('sit',range(6,10))];
        roamAfter = clock + 35;
        break;
      }
      case 'play':
        label = 'An imagined little hunt';
        phases = toyPhases(sample, localToy(sample));
        playAfter = clock + 120;
        break;
      case 'company':
        label='Choosing a quiet place nearby';phases=companyPhases(sample);break;
      case 'tower':case 'wheel':label=kind==='tower'?'A high quiet perch':'A short wheel run';phases=habitatPhases(kind);break;
    }
    episode = {intent: kind, label, direct: false, phases};
    index = 0;
  }

  function advance(sample) {
    const phase = current();
    // An issued pounce always gets its landing recovery, even when interrupted.
    if (pending && phase.command?.kind !== 'pounce') {
      beginInteraction(sample);
    } else if (++index === episode.phases.length) {
      if(episode.direct&&['call','greet','treat'].includes(episode.intent))attentionUntil=clock+90;
      choose(sample);
    }
    if(current().clip==='eye-greeting')eyeAfter=clock+20;
  }

  function step(dt, sample) {
    if (!Number.isFinite(dt) || dt < 0 || dt > .1) {
      throw new RangeError('dt must be finite and between 0 and .1 seconds');
    }
    if (!sample || !['x', 'y', 'z'].every(key => Number.isFinite(sample[key])) ||
        sample.y < 0 || typeof sample.moving !== 'boolean') {
      throw new TypeError('motionSample requires finite x/y/z, nonnegative y and boolean moving');
    }
    if (dt === 0) return null;
    clock += dt;
    let phase = current();
    const committedPounce = phase.command?.kind === 'pounce' && phase.issued;
    if (pending && !committedPounce) {
      // Never cancel airborne motion, including externally driven ballistic arcs.
      if (!grounded(sample)) return null;
      if (sample.moving || (phase.command && phase.issued && !stopSent)) {
        if (!stopSent) {
          stopSent = true;
          return {kind: 'stop'};
        }
        return null;
      }
      if (stopSent || (phase.command && !phase.issued)) {
        beginInteraction(sample);
        return null;
      }
    }
    if (phase.done && settled(sample)) {
      advance(sample);
      return null; // Expose the next source clip's entry endpoint at progress 0.
    }
    if (phase.command) {
      // A completed/no-op approach needs no invented moving sample. Delayed
      // commands still wait when the actual root has not reached the target.
      if (phase.command.kind === 'go' && settled(sample) &&
          Math.hypot(sample.x - phase.command.x, sample.z - phase.command.z) <= GROUND) {
        phase.progress = 1;
        phase.done = true;
        return null;
      }
      if (!phase.issued) {
        if (!settled(sample)) return null;
        phase.issued = true;
        return {...phase.command};
      }
      if (sample.moving) phase.acknowledged = true;
      if (phase.acknowledged && settled(sample)) {
        phase.progress = 1;
        phase.done = true;
      }
      return null;
    }
    if (!settled(sample)) return null;
    // Complete source endpoints before changing pose. Quiet holds yield in .2s;
    // landing retains its authored recovery duration. No per-behavior timer.
    if (pending && !['land','tower-land','tower-settle'].includes(phase.clip)) {
      phase.exitStart ??= phase.progress;
      phase.exitElapsed = (phase.exitElapsed ?? 0) + dt;
      phase.progress = phase.exitStart + (1 - phase.exitStart) * Math.min(1, phase.exitElapsed / .2);
    } else {
      phase.elapsed = Math.min(phase.duration, phase.elapsed + dt);
      phase.progress = Math.min(1, phase.elapsed / phase.duration);
    }
    phase.done = phase.progress >= 1;
    return null;
  }

  return {
    step,
    interact(kind, {target} = {}) {
      if (!['treat', 'toy', 'call','stretch','tail','greet','company','tower','wheel'].includes(kind)) return false;
      if (target !== undefined && (!target || !Number.isFinite(target.x) || !Number.isFinite(target.z))) return false;
      // Repeated greetings do not restart a half-finished expression or turn
      // quiet attention into an obedience loop. Other interactions still preempt.
      if(['call','greet'].includes(kind)&&(current().clip==='eye-greeting'||
        (episode.direct&&['call','greet'].includes(episode.intent)&&!pending)))return true;
      if(kind==='company'&&episode.intent==='company'&&!pending)return true;
      if(['tower','wheel'].includes(kind)&&episode.intent===kind&&!pending)return true;
      pending = {kind, target: target === undefined ? undefined : {x: target.x, z: target.z}};
      return true;
    },
    get report() {
      const phase = current();
      return {intent: episode.intent, label: episode.label, clip: phase.clip,
        progress: phase.progress, busy: Boolean(pending || episode.direct || ['roam', 'play'].includes(episode.intent)),
        food: phase.clip.startsWith('feed-') ? {remaining: phase.clip === 'feed-lick' ? 1-phase.progress :
          ['feed-finish','feed-leave'].includes(phase.clip) ? 0 : 1} : null,
        mat: Boolean(phase.mat),facing:phase.facing??null,resting:['sleep','loaf-rest'].includes(phase.clip)&&!pending,
        sleeping: phase.clip === 'sleep',restSeconds:phase.clip==='sleep'?phase.elapsed:0};
    }
  };
}
