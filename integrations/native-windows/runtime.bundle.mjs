var __esm = (fn, res) => () => (fn && (res = fn(fn = 0)), res);
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined")
    return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// puppy-frame-predictive.mjs
function unfilterRow(type, src, at, cur, prev, w) {
  switch (type) {
    case 0:
      for (let x = 0;x < w; x++)
        cur[x] = src[at + x];
      return;
    case 1:
      for (let x = 0;x < w; x++)
        cur[x] = src[at + x] + (x ? cur[x - 1] : 0) & 255;
      return;
    case 2:
      for (let x = 0;x < w; x++)
        cur[x] = src[at + x] + prev[x] & 255;
      return;
    case 3:
      for (let x = 0;x < w; x++)
        cur[x] = src[at + x] + ((x ? cur[x - 1] : 0) + prev[x] >> 1) & 255;
      return;
    case 4:
      for (let x = 0;x < w; x++)
        cur[x] = src[at + x] + paeth(x ? cur[x - 1] : 0, prev[x], x ? prev[x - 1] : 0) & 255;
      return;
  }
  fail("filter");
}
var quantize5 = (v) => Math.round(v * 31 / 255), expand5 = (q) => Math.round(q * 255 / 31), QUANT, DISPLAY, quantizedGray, fail = (what) => {
  throw Error(`Invalid predictive frames: ${what}`);
}, paeth = (a, b, c) => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};
var init_puppy_frame_predictive = __esm(() => {
  QUANT = Uint8Array.from({ length: 256 }, (_, v) => quantize5(v));
  DISPLAY = Uint8Array.from({ length: 32 }, (_, q) => expand5(q));
  quantizedGray = Uint8Array.from({ length: 256 }, (_, v) => DISPLAY[QUANT[v]]);
});

// puppy-frame-store.mjs
function registerFrameStore(store) {
  if (!store || typeof store.getFrame !== "function" || typeof store.stats !== "function" || !Number.isInteger(store.width) || !Number.isInteger(store.height) || !Number.isInteger(store.frameCount))
    throw Error("Invalid frame store");
  stores.add(store);
  return store;
}
function isGrayFrameSource(value) {
  return value instanceof Uint8Array || stores.has(value);
}
function checkShape(width, height, frameCount) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > MAX_SIDE || height > MAX_SIDE)
    throw Error("Invalid gray frames: dimensions");
  if (!Number.isInteger(frameCount) || frameCount < 1 || frameCount > 4294967295 || !Number.isSafeInteger(width * height * frameCount))
    throw Error("Invalid gray frames: frame count");
}
function grayFrameReader(source, width, height, frameCount) {
  checkShape(width, height, frameCount);
  const n = width * height, byteLength = n * frameCount;
  const check = (index) => {
    if (!Number.isInteger(index) || index < 0 || index >= frameCount)
      throw Error("Invalid gray frames: frame index");
  };
  if (stores.has(source)) {
    if (source.width !== width || source.height !== height || source.frameCount !== frameCount)
      throw Error("Invalid gray frames: store shape");
    return { width, height, frameCount, byteLength, getFrame(index) {
      check(index);
      return source.getFrame(index);
    } };
  }
  if (!(source instanceof Uint8Array))
    throw Error("Invalid gray frames: source");
  if (source.length !== byteLength)
    throw Error("Invalid gray frames: byte length");
  return { width, height, frameCount, byteLength, getFrame(index) {
    check(index);
    return source.subarray(index * n, (index + 1) * n);
  } };
}
var MAX_SIDE = 16384, stores;
var init_puppy_frame_store = __esm(() => {
  init_puppy_frame_predictive();
  stores = new WeakSet;
});

// puppy-frame-indexed.mjs
function indexedIndexLength(header) {
  if (!(header instanceof Uint8Array) || header.length < HEADER || String.fromCharCode(...header.subarray(0, 4)) !== "RVZ5")
    fail3("header");
  const v = viewOf(header), width = v.getUint32(4, true), height = v.getUint32(8, true), frames = v.getUint32(12, true), unique = v.getUint32(16, true);
  if (!width || !height || width > 16384 || height > 16384 || width * height > MAX_PIXELS || !frames || !unique || unique > frames)
    fail3("shape");
  const length2 = HEADER + 4 * frames + RECORD * unique;
  if (length2 > MAX_INDEX)
    fail3("index size");
  return length2;
}
function readIndexedIndex(bytes, fileSize = bytes.length) {
  const length2 = indexedIndexLength(bytes);
  if (bytes.length < length2 || !Number.isSafeInteger(fileSize) || fileSize < length2)
    fail3("truncated index");
  const v = viewOf(bytes), width = v.getUint32(4, true), height = v.getUint32(8, true), frameCount = v.getUint32(12, true), uniqueCount = v.getUint32(16, true);
  const map = new Uint32Array(frameCount), used = new Uint8Array(uniqueCount), rects = new Uint32Array(uniqueCount * 6);
  let payload = 0, expanded = 0;
  for (let i = 0;i < frameCount; i++) {
    const u = v.getUint32(HEADER + i * 4, true);
    if (u >= uniqueCount)
      fail3("map");
    map[i] = u;
    used[u] = 1;
  }
  if (used.includes(0))
    fail3("unreferenced frame");
  for (let u = 0;u < uniqueCount; u++) {
    const at = HEADER + frameCount * 4 + u * RECORD, r = Array.from({ length: 6 }, (_, i) => v.getUint32(at + i * 4, true)), [x, y, w, h, offset, size] = r;
    if (w === 0 !== (h === 0) || !w && (x || y) || x + w > width || y + h > height)
      fail3("rectangle");
    if (offset !== payload || size < 20)
      fail3("offset");
    payload += size;
    expanded += h * (w + 1);
    if (expanded > MAX_EXPANDED)
      fail3("expanded size");
    rects.set(r, u * 6);
  }
  if (length2 + payload !== fileSize)
    fail3("file size");
  return { width, height, frameCount, uniqueCount, map, rects, indexBytes: length2, expandedBytes: expanded, fileSize };
}
function createIndexedFrameStore(index, { read, expand, close = () => {}, frameIndices, kernel = null } = {}) {
  if (typeof read !== "function" || typeof expand !== "function")
    fail3("reader");
  const { width, height, frameCount, uniqueCount, map, rects, indexBytes } = index, n = width * height;
  const retained = frameIndices === undefined ? null : new Uint8Array(frameCount);
  if (retained) {
    if (!Array.isArray(frameIndices) || !frameIndices.length)
      fail3("retained frames");
    for (const i of frameIndices) {
      if (!Number.isInteger(i) || i < 0 || i >= frameCount)
        fail3("retained frame index");
      retained[i] = 1;
    }
  }
  const slots = [{ unique: -1, frame: null }, { unique: -1, frame: null }], cur = new Uint8Array(width), prev = new Uint8Array(width);
  let closed = false, decodes = 0, hits = 0, diskBytes = 0;
  return Object.freeze({
    width,
    height,
    frameCount,
    uniqueCount,
    byteLength: n * frameCount,
    residentPixelBytes: 0,
    get residentBytes() {
      return closed ? 0 : map.byteLength + rects.byteLength + cur.byteLength + prev.byteLength + (retained?.byteLength ?? 0) + slots.reduce((s2, e) => s2 + (e.frame?.byteLength ?? 0), 0);
    },
    stats() {
      return { decodes, hits, cachedFrames: slots.filter((s2) => s2.frame).length, diskReads: decodes, diskBytes, closed };
    },
    getFrame(i) {
      if (closed)
        throw Error("Frame store is disposed");
      if (!Number.isInteger(i) || i < 0 || i >= frameCount)
        fail3("frame index");
      if (retained && !retained[i])
        fail3("frame was not retained");
      const u = map[i];
      if (slots[0].unique === u) {
        hits++;
        return slots[0].frame;
      }
      if (slots[1].unique === u) {
        hits++;
        slots.reverse();
        return slots[0].frame;
      }
      const k = u * 6, x = rects[k], y = rects[k + 1], w = rects[k + 2], h = rects[k + 3], offset = rects[k + 4], size = rects[k + 5], expected = h * (w + 1);
      const compressed = read(indexBytes + offset, size);
      if (!(compressed instanceof Uint8Array) || compressed.length !== size)
        fail3("short read");
      const rows = expand(compressed, expected);
      if (!(rows instanceof Uint8Array) || rows.length !== expected)
        fail3("expanded length");
      const slot = slots.pop();
      slots.unshift(slot);
      slot.unique = -1;
      const frame = slot.frame ??= new Uint8Array(n);
      frame.fill(0);
      prev.fill(0);
      if (kernel?.decodeRows)
        kernel.decodeRows(frame, rows, x, y, w, h, width);
      else
        for (let r = 0, at = 0;r < h; r++) {
          const type = rows[at++];
          if (type > 4)
            fail3("filter");
          unfilterRow(type, rows, at, cur, prev, w);
          at += w;
          for (let c2 = 0;c2 < w; c2++) {
            const q = cur[c2];
            if (q > 31)
              fail3("quantized value");
            frame[(y + r) * width + x + c2] = display[q];
          }
          prev.set(cur.subarray(0, w));
        }
      slot.unique = u;
      decodes++;
      diskBytes += size;
      return frame;
    },
    dispose() {
      if (closed)
        return;
      closed = true;
      for (const slot of slots) {
        slot.frame = null;
        slot.unique = -1;
      }
      close();
    }
  });
}
var HEADER = 20, RECORD = 24, MAX_PIXELS = 16777216, MAX_INDEX, MAX_EXPANDED, fail3 = (why) => {
  throw Error("Invalid indexed frames: " + why);
}, viewOf = (b) => new DataView(b.buffer, b.byteOffset, b.byteLength), display;
var init_puppy_frame_indexed = __esm(() => {
  init_puppy_frame_predictive();
  MAX_INDEX = 64 * 1024 * 1024;
  MAX_EXPANDED = 512 * 1024 * 1024;
  display = Uint8Array.from({ length: 32 }, (_, q) => Math.round(q * 255 / 31));
});

// integrations/native-windows/runtime.mjs
import * as std from "qjs:std";

// puppy-continuous.mjs
var endpoints = Array.from({ length: 34 }, (_, i) => i < 20 ? [i, (i + 1) % 20, false, false] : i < 30 ? [i, 20 + (i - 19) % 10, false, false] : [[0, 20, false, false], [20, 0, false, true], [0, 20, true, false], [20, 0, false, false]][i - 30]);

// puppy-stable.mjs
var mix = (a, b, p) => a + (b - a) * p;
function groundOffset(state, meta) {
  const [a, b] = meta.pairs[state.pair], p = state.blend;
  const v = meta.ground_offsets;
  if (state.pair < 30) {
    const start = state.pair < 20 ? 0 : 20, n = start ? 10 : 20, index = a - start;
    const before = v[start + (index + n - 1) % n], after = v[start + (index + 2) % n];
    return 0.5 * (2 * v[a] + (-before + v[b]) * p + (2 * before - 5 * v[a] + 4 * v[b] - after) * p * p + (-before + 3 * v[a] - 3 * v[b] + after) * p * p * p);
  }
  return mix(v[a], v[b], p);
}

// puppy-clean.mjs
init_puppy_frame_store();
var CLEAN_BYTES = 47 * 17 * 320 * 320;
function retimeRun(phase, knots) {
  if (!knots)
    return phase;
  const count = knots.length - 1;
  if (count < 2 || count > 20 || knots[0] !== 0 || knots[count] !== 20 || knots.some((x, i) => !Number.isFinite(x) || i && x <= knots[i - 1]))
    throw Error("Invalid gait timing");
  const tangent = (i) => {
    i %= count;
    const before = i ? knots[i] - knots[i - 1] : 20 - knots[count - 1], after = knots[i + 1] - knots[i], w1 = 2 * after + before, w2 = after + 2 * before;
    return (w1 + w2) / (w1 * before + w2 * after);
  };
  let index = 0;
  while (index < count - 1 && phase > knots[index + 1])
    index++;
  const h = knots[index + 1] - knots[index], p = Math.max(0, Math.min(1, (phase - knots[index]) / h)), p2 = p * p, p3 = p2 * p;
  return (2 * p3 - 3 * p2 + 1) * index + (p3 - 2 * p2 + p) * h * tangent(index) + (-2 * p3 + 3 * p2) * (index + 1) + (p3 - p2) * h * tangent(index + 1);
}
function cleanGroundOffset(state, meta) {
  if (state.state === "run" && meta.run_sequence) {
    const seq = meta.run_sequence, n = seq.length, i2 = state.pair, p2 = state.blend, v2 = meta.ground_offsets;
    const a2 = v2[seq[(i2 + n - 1) % n]], b2 = v2[seq[i2]], c2 = v2[seq[(i2 + 1) % n]], d2 = v2[seq[(i2 + 2) % n]];
    return 0.5 * (2 * b2 + (-a2 + c2) * p2 + (2 * a2 - 5 * b2 + 4 * c2 - d2) * p2 * p2 + (-a2 + 3 * b2 - 3 * c2 + d2) * p2 * p2 * p2);
  }
  if (state.pair < 30 || state.pair > 40)
    return groundOffset(state, meta);
  const { pair: i, blend: p } = state, v = meta.ground_offsets;
  const a = v[Math.max(30, i - 1)], b = v[i], c = v[i + 1], d = v[Math.min(41, i + 2)];
  return 0.5 * (2 * b + (-a + c) * p + (2 * a - 5 * b + 4 * c - d) * p * p + (-a + 3 * b - 3 * c + d) * p * p * p);
}
function createCachedTween(cache, info, kernel = null) {
  if (!isGrayFrameSource(cache) || cache.byteLength !== CLEAN_BYTES || info.pairs !== 47 || info.samples !== 17 || info.width !== 320 || info.height !== 320 || info.channels !== 1 || info.bytes !== CLEAN_BYTES)
    throw Error("Invalid baked tween cache");
  const frames = grayFrameReader(cache, 320, 320, 47 * 17), output = new Uint8ClampedArray(320 * 320 * 4), stride = 320 * 320;
  for (let i = 3;i < output.length; i += 4)
    output[i] = 255;
  return (state) => {
    if (!Number.isInteger(state.pair) || state.pair < 0 || state.pair >= 47 || !Number.isFinite(state.blend))
      throw Error("Invalid baked tween state");
    const phase = Math.max(0, Math.min(1, state.blend)) * 16, index = Math.min(15, Math.floor(phase)), alpha = phase - index;
    const a = frames.getFrame(state.pair * 17 + index), b = frames.getFrame(state.pair * 17 + index + 1);
    if (kernel?.blendGray)
      kernel.blendGray(output, a, b, alpha);
    else
      for (let i = 0, j = 0;i < stride; i++, j += 4) {
        const value = a[i] * (1 - alpha) + b[i] * alpha;
        output[j] = output[j + 1] = output[j + 2] = value;
      }
    return output;
  };
}

// puppy-paper-world.mjs
var diagonal = 0.0254 * 32;
function createPaperBody() {
  const position = { x: 0, y: 0, z: 0 };
  let target = null, disposed = false;
  const alive = () => {
    if (disposed)
      throw Error("Paper body is disposed");
  };
  return {
    position,
    follow(point) {
      alive();
      if (!point || ![point.x, point.y, point.z].every(Number.isFinite))
        throw Error("Invalid paper body position");
      target = { x: point.x, y: point.y, z: point.z };
    },
    update(dt) {
      alive();
      if (!Number.isFinite(dt) || dt < 0 || dt > 0.1)
        throw Error("Invalid paper body step");
      if (target) {
        position.x = target.x;
        position.z = target.z;
      }
    },
    dispose() {
      disposed = true;
      target = null;
    }
  };
}
var PAPER_SCREEN = Object.freeze({ widthMeters: diagonal * 16 / Math.hypot(16, 9), heightMeters: diagonal * 9 / Math.hypot(16, 9), viewDistance: 0.7 });
var eyeHeight = 0.45;
var eyeZ = 1.65;
var pitch = 9 * Math.PI / 180;
var PAPER_CAMERA = Object.freeze({ fov: 2 * Math.atan(PAPER_SCREEN.heightMeters / (2 * PAPER_SCREEN.viewDistance)) * 180 / Math.PI, aspect: 16 / 9, position: Object.freeze([0, eyeHeight, eyeZ]), target: Object.freeze([0, 0.12, eyeZ - (eyeHeight - 0.12) / Math.tan(pitch)]), canvasMeters: 0.64 });
var PAPER_BODY = Object.freeze({ shoulderMeters: 0.35, referenceShoulderMeters: 0.6 });
var PAPER_LIMB = Object.freeze({ length: PAPER_BODY.shoulderMeters, stanceHeight: PAPER_BODY.shoulderMeters * 5 / 7 });
var bodyRatio = PAPER_BODY.shoulderMeters / PAPER_BODY.referenceShoulderMeters;
var gait = (stride, frequency) => Object.freeze({ stride: stride * bodyRatio, frequency: frequency / Math.sqrt(bodyRatio), speed: stride * frequency * Math.sqrt(bodyRatio) });
var run = gait(2.26, 2.64);
var PAPER_GAITS = Object.freeze({ front: run, rear: run, approach: run, trot: gait(1.36, 2.07), walk: gait(0.9, 1.38) });
var PAPER_DYNAMICS = Object.freeze({ acceleration: 4, deceleration: 5, walkAcceleration: 2, walkDeceleration: 3 });
var PAPER_GROUND = Object.freeze({ near: 0.2, far: -200, away: -8 });
var dz = PAPER_CAMERA.position[2] - PAPER_CAMERA.target[2];
var dy = PAPER_CAMERA.position[1] - PAPER_CAMERA.target[1];
var length = Math.hypot(dz, dy);
var c = dz / length;
var s = dy / length;
function paperCameraPoint(x, y, z) {
  return { x, y: c * (y - eyeHeight) - s * (z - eyeZ), depth: -s * (y - eyeHeight) - c * (z - eyeZ) };
}
function paperGroundTarget(x, z) {
  if (![x, z].every(Number.isFinite))
    throw Error("Invalid paper target");
  z = Math.max(PAPER_GROUND.far, Math.min(PAPER_GROUND.near, z));
  const halfWidth = Math.max(0.72, paperCameraPoint(0, 0, z).depth * PAPER_SCREEN.widthMeters / (2 * PAPER_SCREEN.viewDistance) - PAPER_CAMERA.canvasMeters / 2);
  return [Math.max(-halfWidth, Math.min(halfWidth, x)), z];
}
function createPaperProjection({ viewportWidth, viewportHeight, rect, width, height }) {
  if (![viewportWidth, viewportHeight, rect?.left, rect?.top, rect?.width, rect?.height, width, height].every(Number.isFinite) || Math.min(viewportWidth, viewportHeight, rect.width, rect.height, width, height) <= 0)
    throw Error("Invalid paper viewport");
  const pixelsPerMeter = Math.min(rect.width / PAPER_SCREEN.widthMeters, rect.height / PAPER_SCREEN.heightMeters), f = PAPER_SCREEN.viewDistance * pixelsPerMeter;
  const cx = rect.width / 2, cy = rect.height / 2;
  return {
    project(x, y, z) {
      const p = paperCameraPoint(x, y, z);
      if (p.depth <= 0.02)
        throw Error("Paper point behind camera");
      return { x: (cx + f * p.x / p.depth) / rect.width, y: (cy - f * p.y / p.depth) / rect.height, depth: p.depth };
    },
    placement(x, z, lift = 0) {
      const p = this.project(x, lift, z), sourceSize = f * PAPER_CAMERA.canvasMeters / p.depth;
      return {
        x: p.x,
        y: p.y,
        size: sourceSize / rect.height,
        pixelAspect: rect.width / width / (rect.height / height),
        depth: p.depth,
        groundFromPixel: (px, py) => this.ground(px / width, py / height),
        pixelFromGround: (point) => {
          const q = this.project(point.x, 0, point.z);
          return { x: q.x * width, y: q.y * height };
        }
      };
    },
    ground(u, v) {
      if (![u, v].every(Number.isFinite))
        return null;
      const rx = (u * rect.width - cx) / f, ry = -(v * rect.height - cy) / f;
      const vy = c * ry - s, vz = -s * ry - c;
      if (vy >= -0.00000001)
        return null;
      const t = -PAPER_CAMERA.position[1] / vy;
      return { x: rx * t, z: eyeZ + vz * t };
    },
    focalPixels: f,
    pixelsPerMeter,
    principalPoint: { x: cx, y: cy }
  };
}
function planPaperTravel(distance, { speed = 0.35, acceleration = 0.7, deceleration = 0.5, startSpeed = 0, endSpeed = 0 } = {}) {
  if (![distance, speed, acceleration, deceleration, startSpeed, endSpeed].every(Number.isFinite) || distance < 0 || Math.min(speed, acceleration, deceleration) <= 0 || Math.min(startSpeed, endSpeed) < 0 || Math.max(startSpeed, endSpeed) > speed)
    throw Error("Invalid paper travel");
  const peak = Math.min(speed, Math.sqrt((2 * distance + startSpeed ** 2 / acceleration + endSpeed ** 2 / deceleration) / (1 / acceleration + 1 / deceleration)));
  if (peak + 0.000000001 < Math.max(startSpeed, endSpeed))
    throw Error("Insufficient braking distance");
  const ta = (peak - startSpeed) / acceleration, td = (peak - endSpeed) / deceleration, da = (peak + startSpeed) * ta / 2, dd = (peak + endSpeed) * td / 2, dc = Math.max(0, distance - da - dd), tc = peak ? dc / peak : 0, duration = ta + tc + td;
  return {
    distance,
    duration,
    peak,
    brakingDistance: dd,
    acceleration,
    deceleration,
    at(time) {
      if (!Number.isFinite(time))
        throw Error("Invalid travel time");
      const t = Math.max(0, time);
      if (t >= duration)
        return { distance, speed: endSpeed, stage: "arrived", done: true };
      if (t < ta)
        return { distance: startSpeed * t + 0.5 * acceleration * t * t, speed: startSpeed + acceleration * t, stage: "accelerating", done: false };
      if (t < ta + tc)
        return { distance: da + peak * (t - ta), speed: peak, stage: "cruise", done: false };
      const r = duration - t;
      return { distance: distance - endSpeed * r - 0.5 * deceleration * r * r, speed: endSpeed + deceleration * r, stage: "braking", done: false };
    }
  };
}
function planPaperApproach(distance) {
  const runStride = PAPER_GAITS.approach.stride, walkStride = PAPER_GAITS.walk.stride, runDistance = Math.max(0, Math.floor((distance - 1.1) / runStride)) * runStride, entry = Math.min(0.12, distance * 0.2), walkCycles = Math.max(0, Math.floor((distance - runDistance - entry - 0.25) / walkStride)), walkDistance = walkCycles * walkStride, brakeStart = runDistance + entry + walkDistance;
  return { runStride, walkStride, runDistance, entry, walkDistance, brakeStart, at(d) {
    if (runDistance > 0 && d < runDistance)
      return { clip: "run", progress: d / runStride };
    if (d < runDistance + entry)
      return { clip: "walk-enter", progress: (d - runDistance) / (entry || 1) };
    if (d < brakeStart)
      return { clip: "walk", progress: (d - runDistance - entry) / walkStride };
    return { clip: "brake", progress: Math.max(0, Math.min(1, (d - brakeStart) / Math.max(0.000000001, distance - brakeStart))) };
  } };
}
function planPaperApproachTravel(distance) {
  const geometry = planPaperApproach(distance), walkSpeed = PAPER_GAITS.walk.speed;
  if (!distance)
    return planPaperTravel(0, { speed: walkSpeed });
  const preDistance = geometry.brakeStart - geometry.runDistance, brakeDistance = distance - geometry.brakeStart;
  const entrySpeed = geometry.runDistance ? walkSpeed : Math.min(walkSpeed, Math.sqrt(2 * PAPER_DYNAMICS.walkAcceleration * preDistance));
  const segments = [];
  if (geometry.runDistance)
    segments.push(planPaperTravel(geometry.runDistance, { speed: PAPER_GAITS.approach.speed, ...PAPER_DYNAMICS, endSpeed: walkSpeed }));
  segments.push(planPaperTravel(preDistance, { speed: walkSpeed, startSpeed: geometry.runDistance ? walkSpeed : 0, endSpeed: entrySpeed, acceleration: PAPER_DYNAMICS.walkAcceleration, deceleration: PAPER_DYNAMICS.walkDeceleration }));
  segments.push(planPaperTravel(brakeDistance, { speed: entrySpeed, startSpeed: entrySpeed, acceleration: PAPER_DYNAMICS.walkAcceleration, deceleration: entrySpeed ** 2 / (2 * brakeDistance) }));
  const duration = segments.reduce((a, p) => a + p.duration, 0);
  return { distance, duration, peak: Math.max(...segments.map((p) => p.peak)), brakingDistance: brakeDistance, at(t) {
    if (!Number.isFinite(t))
      throw Error("Invalid approach time");
    if (t >= duration)
      return { distance, speed: 0, stage: "arrived", done: true };
    let offset = 0;
    for (let i = 0;i < segments.length; i++) {
      const p = segments[i];
      if (t < p.duration || i === segments.length - 1) {
        const s2 = p.at(t);
        return { ...s2, distance: offset + s2.distance };
      }
      t -= p.duration;
      offset += p.distance;
    }
  } };
}
function planPaperCarry(distance, { mixed = false, settleSeconds = 0.22 } = {}) {
  if (!Number.isFinite(distance) || distance <= 0 || typeof mixed !== "boolean" || !Number.isFinite(settleSeconds) || settleSeconds <= 0 || settleSeconds > 1)
    throw Error("Invalid carry travel");
  const gait2 = PAPER_GAITS.trot, runDistance = mixed ? Math.max(0, Math.floor((distance - 1.5) / run.stride)) * run.stride : 0;
  const remaining = distance - runDistance, gatherDistance = Math.min(0.088, remaining * 0.2), trotDistance = remaining - gatherDistance;
  const cycles = Math.max(1, Math.ceil(trotDistance / gait2.stride)), stride = trotDistance / cycles;
  const speed = Math.min(gait2.speed, stride * gait2.frequency), entrySpeed = Math.min(speed, 2 * gatherDistance / settleSeconds, Math.sqrt(2 * 2.5 * trotDistance));
  const gatherSeconds = 2 * gatherDistance / entrySpeed;
  const segments = [];
  if (runDistance)
    segments.push(planPaperTravel(runDistance, { speed: run.speed, ...PAPER_DYNAMICS, endSpeed: speed }));
  segments.push(planPaperTravel(trotDistance, { speed, acceleration: 2.5, deceleration: 4, startSpeed: runDistance ? speed : 0, endSpeed: entrySpeed }));
  segments.push(planPaperTravel(gatherDistance, { speed: entrySpeed, startSpeed: entrySpeed, deceleration: entrySpeed / gatherSeconds }));
  const duration = segments.reduce((a, p) => a + p.duration, 0), gatherStart = runDistance + trotDistance;
  return {
    distance,
    duration,
    peak: Math.max(...segments.map((p) => p.peak)),
    brakingDistance: gatherDistance,
    stride,
    runDistance,
    trotDistance,
    gatherStart,
    gatherSeconds,
    poseAt(d) {
      const phase = (d - runDistance) / stride;
      return d < runDistance ? { clip: "run", progress: d / run.stride } : d < gatherStart ? { clip: "carry-trot", progress: phase % 1, cycle: Math.floor(phase) } : { clip: "carry-settle", progress: 1 - Math.sqrt(Math.max(0, (distance - d) / gatherDistance)) };
    },
    at(t) {
      if (!Number.isFinite(t))
        throw Error("Invalid carry time");
      if (t >= duration)
        return { distance, speed: 0, stage: "arrived", done: true };
      let offset = 0;
      for (let i = 0;i < segments.length; i++) {
        const p = segments[i];
        if (t < p.duration || i === segments.length - 1) {
          const s2 = p.at(t);
          return { ...s2, distance: offset + s2.distance };
        }
        t -= p.duration;
        offset += p.distance;
      }
    }
  };
}
function planPaperRun(distance) {
  const cycles = Math.max(1, Math.ceil(distance / run.stride)), stride = distance / cycles || run.stride;
  return { stride, cycles, plan: planPaperTravel(distance, { speed: Math.min(run.speed, stride * run.frequency), ...PAPER_DYNAMICS }) };
}
function planPaperStumble(distance, { entryPhase = 0.25, brakeSeconds = 0.27, catchSeconds = 0.36, catchSpeedRatio = 0.18, duration = 0.82 } = {}) {
  if (![distance, entryPhase, brakeSeconds, catchSeconds, catchSpeedRatio, duration].every(Number.isFinite) || distance <= 0 || entryPhase <= 0 || entryPhase >= 1 || brakeSeconds <= 0 || catchSeconds <= 0 || catchSpeedRatio <= 0 || catchSpeedRatio >= 1 || duration < brakeSeconds + catchSeconds || duration > 3)
    throw Error("Invalid stumble travel");
  const cycles = Math.max(0, Math.ceil(distance / run.stride - entryPhase)), contacts = cycles + entryPhase, a = PAPER_DYNAMICS.acceleration;
  const coefficient = ((1 + catchSpeedRatio) * brakeSeconds + catchSpeedRatio * catchSeconds) / 2;
  const speedAt = (d) => Math.min(run.speed, d / contacts * run.frequency, Math.sqrt(2 * a * d));
  let lo = 0, hi = distance;
  for (let i = 0;i < 60; i++) {
    const d = (lo + hi) / 2;
    if (d + coefficient * speedAt(d) < distance)
      lo = d;
    else
      hi = d;
  }
  const entryDistance = (lo + hi) / 2, entrySpeed = speedAt(entryDistance), stride = entryDistance / contacts, catchSpeed = entrySpeed * catchSpeedRatio;
  const entry = planPaperTravel(entryDistance, { speed: entrySpeed, acceleration: a, deceleration: PAPER_DYNAMICS.deceleration, endSpeed: entrySpeed });
  const plan = planPaperTravel(distance, { speed: entrySpeed, acceleration: a, deceleration: PAPER_DYNAMICS.deceleration, endSpeed: entrySpeed });
  const brakeDistance = (entrySpeed + catchSpeed) * brakeSeconds / 2, impactDistance = distance - entryDistance;
  return {
    plan,
    stride,
    entryDistance,
    entrySpeed,
    entryTime: entry.duration,
    entryPhase,
    duration,
    impactDistance,
    impactAt(age) {
      if (!Number.isFinite(age))
        throw Error("Invalid stumble age");
      const t = Math.max(0, age);
      if (t >= brakeSeconds + catchSeconds)
        return { distance: impactDistance, speed: 0, stage: "rest" };
      if (t < brakeSeconds) {
        const deceleration2 = (entrySpeed - catchSpeed) / brakeSeconds;
        return { distance: entrySpeed * t - deceleration2 * t * t / 2, speed: entrySpeed - deceleration2 * t, stage: "bracing" };
      }
      const u = t - brakeSeconds, deceleration = catchSpeed / catchSeconds;
      return { distance: brakeDistance + catchSpeed * u - deceleration * u * u / 2, speed: catchSpeed - deceleration * u, stage: "catching" };
    }
  };
}
function planPaperWalk(distance) {
  const gait2 = PAPER_GAITS.walk, cycles = Math.max(1, Math.ceil(distance / gait2.stride)), stride = distance / cycles || gait2.stride;
  return { stride, cycles, plan: planPaperTravel(distance, { speed: Math.min(gait2.speed, stride * gait2.frequency), acceleration: PAPER_DYNAMICS.walkAcceleration, deceleration: PAPER_DYNAMICS.walkDeceleration }) };
}
function paperWalkTarget(x, z, direction, distance = 1.05) {
  if (![x, z, direction, distance].every(Number.isFinite) || ![-1, 1].includes(direction) || distance <= 0)
    throw Error("Invalid walk target");
  const radius = Math.max(0.1, paperCameraPoint(0, 0, z).depth * PAPER_SCREEN.widthMeters / (2 * PAPER_SCREEN.viewDistance) - 0.44);
  const next = direction > 0 ? Math.max(x, Math.min(radius, x + distance)) : Math.min(x, Math.max(-radius, x - distance));
  return paperGroundTarget(next, z);
}

// puppy-paper-contact.mjs
init_puppy_frame_store();
var smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
function createPaperFootLock({ maxImageStretch = Infinity } = {}) {
  if (typeof maxImageStretch !== "number" || !(maxImageStretch > 1.08))
    throw Error("Invalid image leg stretch");
  const anchors = new Map;
  let identity = "", samples = 0, episodes = 0, rawMax = 0, max = 0, limited = 0;
  const blocked = new Map, releasing = new Set;
  let releaseEvents = 0, releasingFrames = 0, releasedMax = 0;
  return {
    update(feet, placement, key) {
      if (key !== identity) {
        anchors.clear();
        blocked.clear();
        releasing.clear();
        identity = key;
      }
      const { left, top, side } = placement, scale = side / 320, scaleX = (placement.sideX ?? side) / 320, pins = [], active = new Set;
      for (const foot of feet) {
        if (!foot.stance || foot.y < 245)
          continue;
        if (blocked.has(foot.id)) {
          if (blocked.get(foot.id) === foot.episode)
            continue;
          blocked.delete(foot.id);
        }
        const source = { x: foot.x + 0.5, y: foot.y + 0.5 };
        const x = left + source.x * scaleX, y = top + source.y * scale;
        active.add(foot.id);
        let anchor = anchors.get(foot.id);
        if (!anchor || anchor.episode !== foot.episode) {
          anchor = { x, y, episode: foot.episode, world: placement.groundFromPixel?.(x, y) ?? null, root: placement.root ? { ...placement.root } : null };
          anchors.set(foot.id, anchor);
          episodes++;
        }
        if (anchor.world && placement.pixelFromGround)
          Object.assign(anchor, placement.pixelFromGround(anchor.world));
        let desired = { x: anchor.x, y: anchor.y }, gain = 1;
        if (anchor.world && placement.root && placement.pixelFromGround) {
          const root = placement.root, contact = anchor.root, forward = { x: Math.sin(contact.heading), z: Math.cos(contact.heading) };
          const reach = Math.sqrt(PAPER_LIMB.length ** 2 - PAPER_LIMB.stanceHeight ** 2);
          const hip = { x: anchor.world.x - forward.x * reach + root.x - contact.x, z: anchor.world.z - forward.z * reach + root.z - contact.z }, dx2 = anchor.world.x - hip.x, dz2 = anchor.world.z - hip.z;
          const radius = Math.hypot(dx2, dz2);
          if (radius > reach + 0.000000001) {
            gain = reach / radius;
            desired = placement.pixelFromGround({ x: hip.x + dx2 * gain, z: hip.z + dz2 * gain });
          }
        }
        const dx = (desired.x - x) / scaleX, dy2 = (desired.y - y) / scale, length2 = Math.hypot(dx, dy2), sourceGain = anchor.world && placement.root ? 1 : length2 > 56 ? 56 / length2 : 1;
        const rest = Math.max(16, source.y - 225), strain = Math.hypot(dx, rest + dy2) / rest;
        const strength = Number.isFinite(maxImageStretch) ? 1 - smooth(1.08, maxImageStretch, strain) : 1;
        const isReleasing = strength < 1;
        if (isReleasing && !releasing.has(foot.id)) {
          releaseEvents++;
          releasing.add(foot.id);
        }
        if (!strength) {
          anchors.delete(foot.id);
          blocked.set(foot.id, foot.episode);
          continue;
        }
        const target = { x: source.x + dx * sourceGain * strength, y: source.y + dy2 * sourceGain * strength };
        const actual = { x: Math.floor(left + target.x * scaleX) + 0.5, y: Math.floor(top + target.y * scale) + 0.5 };
        rawMax = Math.max(rawMax, Math.hypot(x - anchor.x, y - anchor.y));
        const residual = Math.hypot(actual.x - anchor.x, actual.y - anchor.y);
        if (isReleasing) {
          releasingFrames++;
          releasedMax = Math.max(releasedMax, residual);
        } else
          max = Math.max(max, residual);
        samples++;
        if (gain < 1 || sourceGain < 1)
          limited++;
        pins.push({ id: foot.id, source, target, anchor: { ...anchor }, actual, limited: gain < 1 || sourceGain < 1, releasing: isReleasing });
      }
      for (const id of anchors.keys())
        if (!active.has(id))
          anchors.delete(id);
      const supported = new Set(feet.filter((f) => f.stance).map((f) => f.id));
      for (const id of blocked.keys())
        if (!supported.has(id))
          blocked.delete(id);
      for (const id of releasing)
        if (!supported.has(id))
          releasing.delete(id);
      return pins;
    },
    reset() {
      anchors.clear();
      blocked.clear();
      releasing.clear();
      identity = "";
    },
    report() {
      return { samples, episodes, rawMax, max, limited, releaseEvents, releasingFrames, releasedMax };
    }
  };
}
function createPaperSupportEpisodes(labels, indices, samples, { cyclic = true } = {}) {
  const step = samples - 1, period = indices.length * step, ids = new Set(indices.flatMap((p) => labels[p].flatMap((f) => f.map((x) => x.id)))), starts = new Map;
  for (const id of ids) {
    const active = Array.from({ length: period + (cyclic ? 0 : 1) }, (_, i) => {
      const p = Math.min(indices.length - 1, Math.floor(i / step)), s2 = i - p * step;
      return labels[indices[p]][s2].some((f) => f.id === id && f.stance);
    });
    starts.set(id, active.map((v, i) => {
      if (!v)
        return -1;
      let start = i;
      while (start > 0 && active[start - 1])
        start--;
      if (cyclic && start === 0 && active.at(-1)) {
        let k = active.length - 1;
        while (k > 0 && active[k - 1])
          k--;
        return k;
      }
      return start;
    }));
  }
  return (feet, pair, blend, phase) => {
    const p = indices.indexOf(pair);
    if (p < 0)
      return feet;
    const q = p * step + Math.round(blend * step), index = cyclic ? q % period : Math.min(period, q), cycle = cyclic ? Math.floor(phase) + Math.floor(q / period) : 0;
    return feet.map((foot) => {
      const start = starts.get(foot.id)?.[index] ?? -1;
      return { ...foot, episode: `${start}/${cycle - (cyclic && start > index ? 1 : 0)}` };
    });
  };
}
function createBakedSupportEpisodes(track) {
  return (feet, pair, blend, phase) => {
    const offset = track.offsets[pair];
    if (offset === undefined)
      return feet;
    const q = offset + Math.round(blend * track.step), index = track.cyclic ? q % track.period : Math.min(track.period, q), cycle = track.cyclic ? Math.floor(phase) + Math.floor(q / track.period) : 0;
    return feet.map((foot) => {
      const start = track.starts[foot.id]?.[index] ?? -1;
      return { ...foot, episode: `${start}/${cycle - (track.cyclic && start > index ? 1 : 0)}` };
    });
  };
}
function footSourcePoint(x, y, pins) {
  if (y <= 225 || !pins.length)
    return { x, y };
  let best = 0, chosen = null;
  for (const pin of pins) {
    const dx = pin.target.x - pin.source.x, dy2 = pin.target.y - pin.source.y;
    const rx = 28 + 2 * Math.abs(dx), ry = 28 + 2 * Math.abs(dy2), r2 = ((x - pin.target.x) / rx) ** 2 + ((y - pin.target.y) / ry) ** 2;
    const weight = r2 < 1 ? (1 - r2) ** 2 * smooth(225, Math.min(245, Math.max(226, pin.target.y)), y) : 0;
    if (weight > best) {
      best = weight;
      chosen = { dx, dy: dy2 };
    }
  }
  return chosen ? { x: x - chosen.dx * best, y: y - chosen.dy * best } : { x, y };
}
function createRearSampler(bytes, info, output, kernel = null) {
  if (!isGrayFrameSource(bytes) || info.pairs !== 18 || info.samples !== 9 || bytes.byteLength !== 18 * 9 * 320 * 320)
    throw Error("Invalid rear sprite cache");
  const frames = grayFrameReader(bytes, 320, 320, 18 * 9), out = output ?? new Uint8ClampedArray(320 * 320 * 4);
  if (!(out instanceof Uint8ClampedArray) || out.length !== 320 * 320 * 4)
    throw Error("Invalid rear output");
  for (let i = 3;i < out.length; i += 4)
    out[i] = 255;
  return (pair, blend) => {
    if (!Number.isInteger(pair) || pair < 0 || pair >= 18 || !Number.isFinite(blend) || blend < 0 || blend > 1)
      throw Error("Invalid rear pose");
    const frame = frames.getFrame(pair * 9 + Math.round(blend * 8));
    if (kernel?.copyGray)
      kernel.copyGray(out, frame);
    else
      for (let j = 0, i = 0;i < 320 * 320; i++, j += 4)
        out[j] = out[j + 1] = out[j + 2] = frame[i];
    return out;
  };
}

// puppy-motion-lookup.mjs
var views = Object.freeze({ front: 0, rear: 1, approach: 2 });
function preparationRoute(tables, kind, { view, flip, seatProgress = 0, desired, nextFlip = false, speed = 0 }) {
  if (!Number.isFinite(speed) || Math.abs(speed) > tables.routes.maxPreparationSpeed)
    throw Error("Motion preparation requires a stopped root");
  const viewIndex = views[view], seat = seatProgress === 0 ? 0 : seatProgress === 1 ? 2 : 1;
  const target = kind === "action" ? desired === "stand" ? 0 : desired === "seat" ? 1 : undefined : views[desired];
  if (viewIndex === undefined || target === undefined || typeof flip !== "boolean" || typeof nextFlip !== "boolean")
    throw Error("Unknown baked motion route");
  const index = kind === "action" ? ((viewIndex * 2 + +flip) * 3 + seat) * 2 + target : ((viewIndex * 2 + +flip) * 3 + target) * 2 + +nextFlip;
  const code = tables.routes[kind]?.[index], route = tables.routes.steps[code];
  if (!route)
    throw Error("Unknown baked motion route");
  return route;
}
function canJoinMotion(tables, name, { view, speed, phase = 0, nextSpeed = speed }) {
  const join = tables.joins[name], epsilon = 0.0000001;
  if (!join || join.view !== view || ![speed, phase, nextSpeed].every(Number.isFinite))
    return false;
  if (speed < join.speed[0] - epsilon || speed > join.speed[1] + epsilon || nextSpeed < join.speed[0] - epsilon || nextSpeed > join.speed[1] + epsilon || join.positiveSpeed && (speed <= 0 || nextSpeed <= 0))
    return false;
  if (join.phase !== undefined) {
    const d = phase - join.phase;
    if (Math.abs(d - Math.round(d)) > epsilon)
      return false;
  }
  if (join.matchVelocity && Math.abs(speed - nextSpeed) > epsilon)
    return false;
  return true;
}

// puppy-paper-seat.mjs
init_puppy_frame_store();
function createPaperSeatSampler(bytes, info, output, kernel = null) {
  const stride = 320 * 320;
  if (!isGrayFrameSource(bytes) || info.width !== 320 || info.height !== 320 || info.pairs !== 3 || info.samples !== 17 || bytes.byteLength !== 3 * 17 * stride)
    throw Error("Invalid paper sitting cache");
  const frames = grayFrameReader(bytes, 320, 320, 3 * 17), out = output ?? new Uint8ClampedArray(stride * 4);
  if (!(out instanceof Uint8ClampedArray) || out.length !== stride * 4)
    throw Error("Invalid seat output");
  for (let i = 3;i < out.length; i += 4)
    out[i] = 255;
  return (progress) => {
    if (!Number.isFinite(progress) || progress < 0 || progress > 1)
      throw Error("Invalid paper sitting progress");
    const q = progress * 3, pair = Math.min(2, Math.floor(q)), sample = Math.round((q - pair) * 16), frame = frames.getFrame(pair * 17 + sample);
    if (kernel?.copyGray)
      kernel.copyGray(out, frame);
    else
      for (let i = 0, j = 0;i < stride; i++, j += 4)
        out[j] = out[j + 1] = out[j + 2] = frame[i];
    return out;
  };
}

// puppy-paper-director.mjs
function createPaperDirector(seed = 731) {
  let value = seed >>> 0, energy = 0.85, last = "", choices = 0, excursions = 0;
  const random = () => {
    value = Math.imul(value, 1664525) + 1013904223 >>> 0;
    return value / 4294967296;
  };
  return {
    update(dt, moving, distance = 0) {
      energy = Math.max(0, Math.min(1, energy + dt * (moving ? -0.05 : 0.025) - (moving ? distance * 0.025 : 0)));
    },
    choose({ x, z, seated }) {
      choices++;
      let candidates = seated ? [{ kind: "watch", weight: 2 }, { kind: "rest", weight: energy < 0.45 ? 5 : 0.5 }, { kind: "wander", weight: energy * 5 }] : [{ kind: "wander", weight: 3 }, { kind: "come", weight: 2 }];
      candidates = candidates.filter((a) => a.kind !== last);
      const total = candidates.reduce((n, a) => n + a.weight, 0);
      let pick = random() * total, selected = candidates.at(-1);
      for (const candidate of candidates) {
        pick -= candidate.weight;
        if (pick <= 0) {
          selected = candidate;
          break;
        }
      }
      last = selected.kind;
      const depths = [-1.6, -8, -3.2];
      const target = last === "come" ? [x, 0.2] : [x > 0 ? -0.5 : 0.5, z < -1 ? -0.15 : depths[excursions++ % depths.length]];
      return { kind: last, target, holdSeconds: 2 + random() * 2, side: random() < 0.5 ? "left" : "right", energy };
    },
    get report() {
      return { energy, last, choices };
    }
  };
}

// puppy-paper-behaviors.mjs
function paperBehaviorPose(state, info) {
  const list = info.clips[state.behavior];
  if (!list)
    throw Error("Unknown paper behavior");
  const progress = state.behavior === "walk" ? state.behaviorProgress % 1 : Math.max(0, Math.min(1, state.behaviorProgress));
  const q = Math.min(list.length - 0.000000001, progress * list.length), i = Math.floor(q), blend = Math.round((q - i) * 8) / 8;
  return { pair: list[i], blend };
}
function createPaperBehaviorSampler(bytes, info, output, kernel = null) {
  const sample = createRearSampler(bytes, info, output, kernel);
  return (state) => {
    const p = paperBehaviorPose(state, info);
    return sample(p.pair, p.blend);
  };
}

// puppy-paper-area.mjs
function createPaperAreaSampler(n = 320) {
  if (!Number.isInteger(n) || n < 2 || n > 640)
    throw Error("Invalid area source size");
  const pitch2 = n + 1;
  let sums = null;
  const integral = (x, y) => {
    x = Math.max(0, Math.min(n, x));
    y = Math.max(0, Math.min(n, y));
    const ix = Math.min(n - 1, Math.floor(x)), iy = Math.min(n - 1, Math.floor(y)), fx = x - ix, fy = y - iy, k = iy * pitch2 + ix;
    return (sums[k] * (1 - fx) + sums[k + 1] * fx) * (1 - fy) + (sums[k + pitch2] * (1 - fx) + sums[k + pitch2 + 1] * fx) * fy;
  };
  return {
    prepare(image) {
      if (image.length !== n * n * 4)
        throw Error("Invalid area source");
      const Type = image instanceof Uint8Array || image instanceof Uint8ClampedArray ? Uint32Array : Float64Array;
      if (!(sums instanceof Type))
        sums = new Type(pitch2 * pitch2);
      else
        sums.fill(0);
      for (let y = 0;y < n; y++) {
        let row = 0;
        for (let x = 0;x < n; x++) {
          row += image[(y * n + x) * 4];
          sums[(y + 1) * pitch2 + x + 1] = sums[y * pitch2 + x + 1] + row;
        }
      }
    },
    sample(x, y, dx, dy2) {
      if (![x, y, dx, dy2].every(Number.isFinite) || Math.min(dx, dy2) <= 0)
        throw Error("Invalid area footprint");
      if (!sums)
        return 0;
      const l = x - dx / 2, r = x + dx / 2, t = y - dy2 / 2, b = y + dy2 / 2;
      return Math.max(0, (integral(r, b) - integral(l, b) - integral(r, t) + integral(l, t)) / (dx * dy2));
    }
  };
}

// puppy-paper-actions.mjs
init_puppy_frame_store();
var PAPER_ACTION_DURATIONS = Object.freeze({ spin: 2.8, roll: 4.6, "roll-down": 4.6, "walk-enter": 0.28, "walk-exit": 0.28 });
var PAPER_ACTION_FORMAT = Object.freeze({ width: 480, height: 480, samples: 9, maxPairs: 256 });
var own = (o, k) => o !== null && typeof o === "object" && !Array.isArray(o) && Object.prototype.hasOwnProperty.call(o, k);
var isPairCount = (n) => Number.isInteger(n) && n > 0 && n <= PAPER_ACTION_FORMAT.maxPairs;
function actionClip(name, info) {
  if (typeof name !== "string" || !own(info?.clips, name))
    throw Error(`Invalid paper action: unknown clip ${JSON.stringify(name)}`);
  if (!isPairCount(info.pairs))
    throw Error("Invalid paper action: pair count");
  const list = info.clips[name];
  if (!Array.isArray(list) || !list.length)
    throw Error(`Invalid paper action: empty clip ${name}`);
  for (const p of list)
    if (!Number.isInteger(p) || p < 0 || p >= info.pairs)
      throw Error(`Invalid paper action: pair ${p} out of range in ${name}`);
  let weights = list.map(() => 1);
  if (info.weights !== undefined) {
    if (info.weights === null || typeof info.weights !== "object" || Array.isArray(info.weights))
      throw Error("Invalid paper action: weights");
    if (own(info.weights, name)) {
      weights = info.weights[name];
      if (!Array.isArray(weights) || weights.length !== list.length)
        throw Error(`Invalid paper action: weights length for ${name}`);
      for (const w of weights)
        if (typeof w !== "number" || !Number.isFinite(w) || w <= 0)
          throw Error(`Invalid paper action: weight ${w} in ${name}`);
    }
  }
  return { list, weights };
}
function validatePaperActionInfo(info, byteLength) {
  const f = PAPER_ACTION_FORMAT;
  if (info === null || typeof info !== "object" || info.width !== f.width || info.height !== f.height || info.samples !== f.samples)
    throw Error("Invalid action cache: format");
  if (!isPairCount(info.pairs))
    throw Error("Invalid action cache: pair count");
  if (info.clips === null || typeof info.clips !== "object" || Array.isArray(info.clips) || !Object.keys(info.clips).length)
    throw Error("Invalid action cache: clips");
  if (info.weights !== undefined) {
    for (const k of Object.keys(info.weights ?? {}))
      if (!own(info.clips, k))
        throw Error(`Invalid action cache: weights for unknown clip ${k}`);
  }
  for (const name of Object.keys(info.clips))
    actionClip(name, info);
  if (byteLength !== undefined && byteLength !== f.width * f.height * f.samples * info.pairs)
    throw Error("Invalid action cache: byte length");
  return info;
}
function paperActionPose(name, progress, info, compiledClips) {
  if (typeof progress !== "number" || !Number.isFinite(progress))
    throw Error("Invalid paper action: progress");
  if (compiledClips && !own(compiledClips, name))
    throw Error(`Invalid paper action: unknown compiled clip ${JSON.stringify(name)}`);
  const { list, weights, total = weights.reduce((a, b) => a + b, 0) } = compiledClips?.[name] ?? actionClip(name, info);
  let t = (name === "walk" ? (progress % 1 + 1) % 1 : Math.max(0, Math.min(1, progress))) * total, index = 0;
  while (index < list.length - 1 && t > weights[index]) {
    t -= weights[index++];
  }
  const blend = Math.round(Math.max(0, Math.min(1, t / weights[index])) * 8) / 8;
  if (!Number.isFinite(blend))
    throw Error("Invalid paper action: blend");
  return { pair: list[index], blend };
}
function createPaperActionSampler(bytes, info, output, compiledClips, kernel = null) {
  if (!isGrayFrameSource(bytes))
    throw Error("Invalid action cache: bytes");
  validatePaperActionInfo(info, bytes.byteLength);
  const stride = info.width * info.height, pairs = info.pairs, frames = grayFrameReader(bytes, info.width, info.height, pairs * 9);
  const out = output ?? new Uint8ClampedArray(stride * 4);
  if (!(out instanceof Uint8ClampedArray) || out.length !== stride * 4)
    throw Error("Invalid action output");
  for (let i = 3;i < out.length; i += 4)
    out[i] = 255;
  return (state) => {
    const p = paperActionPose(state.actionName, state.actionProgress, info, compiledClips), sample = Math.round(p.blend * 8);
    if (p.pair >= pairs || sample < 0 || sample > 8)
      throw Error("Invalid paper action: sample out of range");
    const frame = frames.getFrame(p.pair * 9 + sample);
    if (kernel?.copyGray)
      kernel.copyGray(out, frame);
    else
      for (let i = 0, j = 0;i < stride; i++, j += 4)
        out[j] = out[j + 1] = out[j + 2] = frame[i];
    return out;
  };
}

// puppy-paper-paw-transport.mjs
var TORSO = 226;
var TOE_RIGID = 8;
var MIN_SPAN = 4;
var FOLD_MARGIN = 0.9;
var smooth2 = (t) => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
var finite = (v) => typeof v === "number" && Number.isFinite(v);
var depthRank = (id) => /near/.test(id) ? 0 : /far/.test(id) ? 2 : 1;
function createPawTransport(feet, pins, { opaque = null } = {}) {
  const list = [], seen = new Set;
  for (const foot of Array.isArray(feet) ? feet : []) {
    if (!foot || typeof foot.id !== "string" || seen.has(foot.id) || !finite(foot.x) || !finite(foot.y))
      continue;
    seen.add(foot.id);
    list.push(foot);
  }
  const pinById = new Map;
  for (const pin of Array.isArray(pins) ? pins : []) {
    if (!pin || !seen.has(pin.id) || pinById.has(pin.id))
      continue;
    const { source: s2, target: t } = pin;
    if (!s2 || !t || ![s2.x, s2.y, t.x, t.y].every(finite))
      continue;
    pinById.set(pin.id, pin);
  }
  const limited = [], degenerate = [];
  const identity = (x, y) => finite(x) && finite(y) ? { x, y } : null;
  if (!pinById.size || !list.length)
    return Object.assign(identity, { layers: [], limited, degenerate });
  const byX = [...list].sort((a, b) => a.x - b.x || (a.id < b.id ? -1 : 1));
  const layers = byX.map((foot, i) => {
    const cx = foot.x + 0.5, lo = i ? (byX[i - 1].x + 0.5 + cx) / 2 : -Infinity, hi = i < byX.length - 1 ? (cx + byX[i + 1].x + 0.5) / 2 : Infinity;
    if (!(cx >= lo && cx < hi))
      degenerate.push(foot.id);
    const pin = pinById.get(foot.id), dx = pin ? pin.target.x - pin.source.x : 0;
    let dy2 = pin ? pin.target.y - pin.source.y : 0;
    const toeTop = Math.max(TORSO + MIN_SPAN, (pin ? pin.source.y : foot.y + 0.5) - TOE_RIGID), span = toeTop - TORSO;
    let a = 0;
    if (dy2 < 0) {
      const k = FOLD_MARGIN * span / -dy2;
      if (k < 1) {
        a = 1;
        dy2 = -FOLD_MARGIN * span;
        limited.push(foot.id);
      } else if (k < 1.5)
        a = Math.min(1, 3 - 2 * k);
    }
    return { id: foot.id, lo, hi, dx, dy: dy2, toeTop, span, a, active: !!pin, rank: depthRank(foot.id), y: foot.y, lastY: NaN, lastSy: NaN };
  });
  const gx = (L, s2) => smooth2((s2 - TORSO) / L.span);
  const gy = (L, s2) => {
    const t = (s2 - TORSO) / L.span;
    return t <= 0 ? 0 : t >= 1 ? 1 : (1 - L.a) * smooth2(t) + L.a * t;
  };
  const invY = (L, y) => {
    if (L.dy === 0)
      return y;
    if (y >= L.toeTop + L.dy)
      return y - L.dy;
    if (y === L.lastY)
      return L.lastSy;
    let lo = TORSO, hi = L.toeTop;
    for (let i = 0;i < 48 && hi - lo > 0.000000001; i++) {
      const m = (lo + hi) / 2;
      if (m + L.dy * gy(L, m) < y)
        lo = m;
      else
        hi = m;
    }
    L.lastY = y;
    L.lastSy = (lo + hi) / 2;
    return L.lastSy;
  };
  const order = [...layers].sort((p, q) => (opaque ? 0 : q.active - p.active) || p.rank - q.rank || q.y - p.y || (p.id < q.id ? -1 : 1));
  const sourcePoint = (x, y) => {
    if (!finite(x) || !finite(y))
      return null;
    if (y < TORSO)
      return { x, y };
    let fallback = null;
    for (const L of order) {
      let sx, sy;
      if (L.dx === 0 && L.dy === 0) {
        sx = x;
        sy = y;
      } else {
        sy = invY(L, y);
        sx = sy >= L.toeTop ? x - L.dx : x - L.dx * gx(L, sy);
      }
      if (!(sx >= L.lo && sx < L.hi))
        continue;
      if (!opaque || opaque(sx, sy))
        return { x: sx, y: sy };
      fallback ??= { x: sx, y: sy };
    }
    return fallback;
  };
  return Object.assign(sourcePoint, { layers: order.map(({ id, lo, hi, dx, dy: dy2, toeTop, active, rank }) => ({ id, lo, hi, dx, dy: dy2, toeTop, active, rank })), limited, degenerate });
}

// puppy-companion-sprites.mjs
init_puppy_frame_store();
function createCompanionSpriteSampler(bytes, info, output, kernel = null) {
  const n = 320 * 320;
  if (!isGrayFrameSource(bytes) || info?.width !== 320 || info.height !== 320 || info.samples !== 9 || !Number.isInteger(info.pairs) || info.pairs < 1 || info.pairs > 128 || bytes.byteLength !== info.pairs * 9 * n)
    throw Error("Invalid companion sprite cache");
  for (const key of ["treat-eat", "ball-pickup", "ball-drop"])
    if (!Array.isArray(info.clips?.[key]) || !info.clips[key].length || !info.clips[key].every((p) => Number.isInteger(p) && p >= 0 && p < info.pairs))
      throw Error("Invalid companion sprite clip");
  const frames = grayFrameReader(bytes, 320, 320, info.pairs * 9), rgba = output ?? new Uint8ClampedArray(n * 4);
  if (!(rgba instanceof Uint8ClampedArray) || rgba.length !== n * 4)
    throw Error("Invalid sprite output");
  for (let i = 3;i < rgba.length; i += 4)
    rgba[i] = 255;
  return ({ clip, progress }) => {
    const list = info.clips[clip];
    if (!list || !Number.isFinite(progress) || progress < 0 || progress > 1)
      throw Error("Invalid companion sprite pose");
    const q = progress * list.length, index = Math.min(list.length - 1, Math.floor(q)), s2 = Math.round((q - index) * 8), frame = frames.getFrame(list[index] * 9 + s2);
    if (kernel?.copyGray)
      kernel.copyGray(rgba, frame);
    else
      for (let i = 0, j = 0;i < n; i++, j += 4)
        rgba[j] = rgba[j + 1] = rgba[j + 2] = frame[i];
    return rgba;
  };
}

// puppy-comfort-sprites.mjs
init_puppy_frame_store();
function comfortMotionKey(progress, motion) {
  if (!Number.isFinite(progress) || progress < 0 || progress > 1)
    throw Error("Invalid motion progress");
  const age = progress * motion.duration;
  let key = 0;
  while (key < motion.times.length - 1 && age >= motion.times[key + 1])
    key++;
  return key;
}
function comfortMotion(pose, info) {
  const attention = pose?.clip === "attention-paw" ? info.attentionPaw : pose?.clip === "attention-wall" ? info.attentionWall : null;
  return attention ? pose.release ? attention.releases?.[pose.release.from] : attention : pose?.clip === "scramble" ? info.scramble : pose?.clip === "pickup" ? info.pickups?.[pose.view] : pose?.clip === "carry-trot" ? info.carryTrot : pose?.clip === "carry-settle" ? info.carryTrot?.settle : null;
}
var comfortProgress = (pose) => pose.release?.progress ?? pose.progress;
function validateMotion(motion, count) {
  if (!motion || !Array.isArray(motion.frames) || !Array.isArray(motion.times) || motion.frames.length < 2 || motion.frames.length > 32 || motion.frames.length !== motion.times.length || motion.times[0] !== 0 || !Number.isFinite(motion.duration) || motion.duration <= 0 || motion.duration > 3 || (motion.cyclic ? motion.times.at(-1) >= motion.duration : motion.times.at(-1) !== motion.duration) || motion.frames.some((i) => !Number.isInteger(i) || i < 0 || i >= count) || motion.times.some((t, i) => !Number.isFinite(t) || i && t <= motion.times[i - 1]))
    throw Error("Invalid fetch motion metadata");
  if (!Array.isArray(motion.floorOffsets) || motion.floorOffsets.length !== motion.frames.length || motion.floorOffsets.some((v) => !Number.isFinite(v) || Math.abs(v) > 64))
    throw Error("Invalid fetch floor metadata");
  if (motion.mouth && (!Array.isArray(motion.mouth) || motion.mouth.length !== motion.frames.length || motion.mouth.some((p) => !Array.isArray(p) || p.length !== 2 || p.some((v) => !Number.isFinite(v) || v < 0 || v > 320))))
    throw Error("Invalid fetch mouth metadata");
}
function comfortFrameIndex(progress, info) {
  if (!Number.isFinite(progress) || progress < 0 || progress > 1)
    throw Error("Invalid comfort progress");
  const seconds = progress * 6;
  if (seconds < 0.12 || progress === 1)
    return 0;
  if (seconds < 0.65)
    return seconds < 0.3 ? 1 : 2;
  if (seconds > 5.15)
    return seconds < 5.45 ? 7 : seconds < 5.8 ? 8 : 0;
  const loop = [3, 4, 3, 5, 3, 6, 3, 5, 3, 4, 3, 6];
  return loop[Math.floor((seconds - 0.65) / 0.28) % loop.length];
}
function createComfortSpriteSampler(bytes, info, output) {
  if (!isGrayFrameSource(bytes) || ![1, 2, 3, 4, 5, 6].includes(info?.version) || info.width !== 320 || info.height !== 320 || (info.version >= 4 ? !Number.isInteger(info.frames) || info.frames < 19 || info.frames > 64 : info.frames !== { 1: 9, 2: 13, 3: 19 }[info.version]))
    throw Error("Invalid comfort sprites");
  if (info.version === 3) {
    const s2 = info.scramble;
    if (!s2 || !Array.isArray(s2.frames) || !Array.isArray(s2.times) || s2.frames.length !== 7 || s2.times.length !== 7 || s2.times[0] !== 0 || !Number.isFinite(s2.duration) || s2.duration <= 0 || s2.duration > 3 || s2.times.at(-1) !== s2.duration || s2.frames[0] !== s2.frames.at(-1) || s2.frames.some((i) => !Number.isInteger(i) || i < 0 || i >= info.frames) || s2.times.some((t, i) => !Number.isFinite(t) || i && t <= s2.times[i - 1]))
      throw Error("Invalid scramble metadata");
  }
  if (info.version >= 4) {
    validateMotion(info.scramble, info.frames);
    for (const view of ["rear", "front"])
      validateMotion(info.pickups?.[view], info.frames);
  }
  if (info.version >= 6) {
    validateMotion(info.carryTrot, info.frames);
    validateMotion(info.carryTrot?.settle, info.frames);
    if (info.carryTrot.cyclic !== true || !info.carryTrot.mouth || !info.carryTrot.settle.mouth || !Array.isArray(info.carryTrot.feet) || info.carryTrot.feet.length !== info.carryTrot.frames.length || info.carryTrot.feet.some((list) => !Array.isArray(list) || list.some((f) => typeof f.id !== "string" || typeof f.stance !== "boolean" || ![f.x, f.y].every((v) => Number.isFinite(v) && v >= 0 && v < 320))))
      throw Error("Invalid carry metadata");
  }
  for (const [motion, maxKeys, maxRecovery] of [[info.attentionPaw, 8, 0.3], [info.attentionWall, 12, 0.4]])
    if (motion) {
      validateMotion(motion, info.frames);
      if (motion.frames[0] !== 0 || motion.frames.at(-1) !== 0 || !motion.releases || Object.keys(motion.releases).length > maxKeys)
        throw Error("Invalid attention endpoint");
      for (const frame of new Set(motion.frames)) {
        const exit = motion.releases[frame];
        validateMotion(exit, info.frames);
        if (exit.frames[0] !== frame || exit.frames.at(-1) !== 0 || exit.duration > maxRecovery)
          throw Error("Invalid attention recovery");
      }
    }
  if (output !== undefined && (!(output instanceof Uint8ClampedArray) || output.length !== 320 * 320 * 4))
    throw Error("Invalid comfort output");
  const frames = grayFrameReader(bytes, 320, 320, info.frames);
  let rgba = output ?? null;
  if (rgba)
    for (let i = 3;i < rgba.length; i += 4)
      rgba[i] = 255;
  return (pose) => {
    if (!["tug", "sleep", "scramble", "pickup", "carry-trot", "carry-settle", "attention-paw", "attention-wall"].includes(pose?.clip))
      throw Error("Invalid comfort clip");
    if (!rgba) {
      rgba = new Uint8ClampedArray(320 * 320 * 4);
      for (let i = 3;i < rgba.length; i += 4)
        rgba[i] = 255;
    }
    let index;
    if (["scramble", "pickup", "carry-trot", "carry-settle", "attention-paw", "attention-wall"].includes(pose.clip)) {
      const motion = comfortMotion(pose, info);
      if (!motion)
        throw Error("Invalid scramble/pickup pose");
      index = motion.frames[comfortMotionKey(comfortProgress(pose), motion)];
    } else
      index = pose.clip === "sleep" ? info.sleep?.[pose.variant] : comfortFrameIndex(pose.progress, info);
    if (!Number.isInteger(index))
      throw Error("Invalid sleep variant");
    const frame = frames.getFrame(index), base = pose.base, blend = pose.blend ?? 1;
    if (!Number.isFinite(blend) || blend < 0 || blend > 1)
      throw Error("Invalid sleep blend");
    for (let i = 0, j = 0;i < frame.length; i++, j += 4) {
      const v = frame[pose.right ? Math.floor(i / 320) * 320 + 319 - i % 320 : i];
      rgba[j] = rgba[j + 1] = rgba[j + 2] = base && blend < 1 ? Math.round(base[j] + (v - base[j]) * blend) : v;
    }
    return rgba;
  };
}

// puppy-mouth-anchor.mjs
var MOUTH_ANCHORS = { version: 1, canonical: 320, ballRadiusPx: 17.5, mouthOffsetPx: 25, minScore: 0.9, seed: { family: "approach", frame: 45, box: [158, 108, 68, 50], nose: [191.7, 143.3] }, method: "cv2 TM_CCOEFF_NORMED multi-scale match of measured eyes+nose seed; mouth = nose + scale*offset (down)", unsupported: "front side-view tween, rear, actions (incl. walk-enter/walk), interactions, behaviors watch/rest", families: { approach: { cache: "puppy-paper-approach.bin.gz", sha256: "f5558c57d5a445d396e06c060f9f8d64e6ce0ff5b9b92fa6d77ef9bb2984a2fe", samples: 9, covered: 124, frames: [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, [224.66, 147.5, 0.9, 0.904], [222.44, 147.33, 0.9, 0.915], [219.17, 148.34, 0.9, 0.934], [215.72, 149.59, 0.92, 0.945], [212.89, 150.36, 0.92, 0.957], [209.34, 151.71, 0.94, 0.966], [206.61, 152.52, 0.94, 0.972], [202.85, 153.49, 0.94, 0.965], [202.85, 153.49, 0.94, 0.965], [198.71, 154.18, 0.96, 0.966], [195.56, 154.22, 0.96, 0.97], [191.82, 155.11, 0.98, 0.967], [188.11, 155.2, 0.98, 0.966], [184.12, 154.72, 0.96, 0.966], [180.5, 154.77, 0.96, 0.968], [177.45, 154.9, 0.96, 0.97], [173.13, 154.91, 0.96, 0.965], [173.13, 154.91, 0.96, 0.965], [175.53, 155.91, 0.96, 0.974], [177.69, 157.9, 0.98, 0.976], [179.97, 159.24, 0.98, 0.983], [182.41, 161.16, 0.98, 0.988], [184.55, 162.2, 0.98, 0.987], [186.96, 165.39, 1, 0.991], [189.54, 166, 0.98, 0.986], [191.7, 168.3, 1, 1], [191.7, 168.3, 1, 1], [190.78, 168.33, 1, 0.999], [190.26, 168.08, 0.98, 0.983], [189.46, 169.24, 1, 0.994], [188.66, 169.45, 1, 0.988], [187.9, 169.62, 1, 0.977], [187.07, 168.92, 0.98, 0.971], [186.15, 171.37, 1.02, 0.964], [185.12, 171.44, 1.02, 0.959], [185.12, 171.44, 1.02, 0.959], [183.01, 167.4, 0.98, 0.967], [180.53, 166.1, 1, 0.965], [178.7, 163.98, 0.98, 0.962], [176.6, 160.9, 0.96, 0.958], [174.17, 158.89, 0.96, 0.958], [172.42, 158.03, 0.98, 0.948], [170.58, 155.84, 0.96, 0.945], [168.27, 154.8, 0.98, 0.932], [168.27, 154.8, 0.98, 0.932], [168.28, 154.25, 0.98, 0.941], [167.82, 153.76, 0.98, 0.938], [167.36, 153.07, 0.98, 0.941], [167.1, 151.76, 0.96, 0.941], [166.97, 152.2, 0.98, 0.947], [166.89, 151.46, 0.98, 0.944], [166.21, 151.32, 0.98, 0.944], [166.05, 150.38, 0.98, 0.943], [166.05, 150.38, 0.98, 0.943], [168.13, 148.79, 0.96, 0.945], [169.85, 149.25, 0.98, 0.951], [172.04, 147.99, 0.98, 0.948], [174.87, 146.91, 0.98, 0.947], [176.38, 147.11, 1, 0.947], [179.35, 146.95, 1.02, 0.941], [181.18, 146.19, 1.02, 0.943], [183.86, 145.25, 1.02, 0.942], [183.86, 145.25, 1.02, 0.942], [182.95, 145.34, 1.02, 0.946], [182.65, 145.38, 1.02, 0.953], [181.7, 145.7, 1.02, 0.948], [181.06, 145.96, 1.02, 0.949], [180.46, 145.26, 1, 0.954], [179.53, 146.46, 1.02, 0.949], [179.36, 146.51, 1.02, 0.948], [178.41, 146.53, 1.02, 0.947], [178.41, 146.53, 1.02, 0.947], [180.31, 147.47, 1.02, 0.952], [181.26, 147.72, 1.02, 0.954], [183.14, 147.04, 0.98, 0.957], [184.8, 149.17, 1, 0.967], [186.42, 150.19, 1, 0.966], [188.41, 150.46, 1, 0.966], [189.95, 151.41, 1, 0.971], [191.61, 152.4, 1, 0.971], [191.61, 152.4, 1, 0.971], [189.01, 151.48, 1, 0.971], [186.85, 151.25, 1, 0.979], [184.64, 150.57, 1, 0.975], [182.06, 149.13, 0.98, 0.974], [179.48, 149.48, 1, 0.976], [177.17, 149.61, 1.02, 0.976], [175.2, 149.27, 1.02, 0.979], [172.3, 148.6, 1.02, 0.975], [172.3, 148.6, 1.02, 0.975], [175.21, 151.35, 1.02, 0.979], [177.27, 153.34, 1.02, 0.982], [179.97, 155.12, 1, 0.983], [181.35, 158.65, 1.02, 0.988], [184.96, 160.94, 1, 0.987], [187.54, 163.29, 1, 0.996], [189.22, 166.33, 1.02, 0.992], [191.7, 168.3, 1, 1], [191.7, 168.3, 1, 1], [189.18, 166.28, 1, 0.99], [186.95, 164.07, 0.98, 0.991], [184.75, 163.57, 1, 0.987], [182.21, 160.91, 0.98, 0.986], [180.15, 158.8, 0.96, 0.98], [177.73, 156.71, 0.96, 0.974], [175.67, 155.87, 0.96, 0.97], [173.13, 154.91, 0.96, 0.965], [173.13, 154.91, 0.96, 0.965], [176.75, 154.83, 0.96, 0.966], [180.19, 154.77, 0.96, 0.966], [183.7, 154.69, 0.96, 0.966], [187.78, 153.74, 0.94, 0.965], [191.91, 155.07, 0.98, 0.968], [195.35, 154.27, 0.96, 0.969], [199.09, 154.17, 0.96, 0.968], [202.85, 153.49, 0.94, 0.965], [202.85, 153.49, 0.94, 0.965], [206.07, 152.72, 0.94, 0.968], [209.04, 152.89, 0.96, 0.962], [211.97, 151.51, 0.94, 0.959], [215.45, 150.92, 0.94, 0.941], [218.71, 149.41, 0.92, 0.933], [221.75, 148.5, 0.9, 0.92], [224.95, 147.58, 0.9, 0.903], null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null] }, behaviors: { cache: "puppy-paper-behaviors.bin.gz", sha256: "7918261fb64c57a91739729841fd84c6dd53891196c7fb76ee9c27712ab6ef5d", samples: 9, covered: 90, frames: [[201.21, 166.15, 0.98, 0.959], [200.4, 166.14, 0.98, 0.961], [200.13, 166.16, 0.98, 0.963], [199.21, 166.15, 0.98, 0.964], [198.65, 166.13, 0.98, 0.964], [197.98, 166.12, 0.98, 0.967], [197.08, 166.1, 0.98, 0.966], [196.87, 166.13, 0.98, 0.966], [195.93, 166.1, 0.98, 0.965], [195.93, 166.1, 0.98, 0.965], [196.01, 166.1, 0.98, 0.967], [196.35, 166.05, 0.98, 0.96], [196.85, 166.1, 0.98, 0.966], [197.08, 166.07, 0.98, 0.964], [197.25, 166.07, 0.98, 0.96], [197.72, 166.12, 0.98, 0.963], [198.13, 166.05, 0.98, 0.957], [198.18, 166.04, 0.98, 0.954], [198.18, 166.04, 0.98, 0.954], [198.23, 166.06, 0.98, 0.957], [198.26, 166.09, 0.98, 0.957], [198.28, 166.12, 0.98, 0.958], [198.81, 167.29, 1, 0.968], [198.92, 167.34, 1, 0.966], [198.98, 167.37, 1, 0.964], [199.06, 167.41, 1, 0.962], [199.07, 167.42, 1, 0.96], [199.07, 167.42, 1, 0.96], [199.16, 167.39, 1, 0.96], [199.43, 167.35, 1, 0.96], [199.96, 167.33, 1, 0.965], [200.14, 166.34, 0.98, 0.965], [200.28, 166.27, 0.98, 0.963], [200.84, 166.24, 0.98, 0.965], [201.14, 166.17, 0.98, 0.962], [201.21, 166.15, 0.98, 0.959], [191.7, 168.3, 1, 1], [192.77, 168.21, 1, 0.999], [194.11, 167.32, 0.98, 0.992], [195.54, 167.92, 1, 0.986], [196.71, 166.87, 0.98, 0.982], [197.88, 167.48, 1, 0.978], [199.08, 166.37, 0.98, 0.973], [200.32, 166.2, 0.98, 0.965], [201.21, 166.15, 0.98, 0.959], [201.21, 166.15, 0.98, 0.959], [201.8, 170.56, 1, 0.964], [202.18, 172.74, 0.98, 0.965], [202.46, 176.13, 0.98, 0.966], [203.09, 179.85, 0.98, 0.968], [203.28, 183.55, 0.98, 0.961], [203.98, 187.56, 1, 0.963], [204.72, 190.66, 1, 0.967], [204.91, 194.05, 1, 0.954], [204.91, 194.05, 1, 0.954], [203.9, 194.08, 1, 0.956], [202.88, 194.15, 0.98, 0.958], [201.8, 195, 1, 0.958], [200.65, 195.45, 1, 0.961], [199.66, 196.08, 1, 0.957], [198.46, 196.15, 1, 0.953], [197.37, 196.24, 0.98, 0.95], [196.35, 196.3, 0.98, 0.947], [196.35, 196.3, 0.98, 0.947], [192.86, 196.11, 1, 0.951], [190.53, 196.01, 1, 0.951], [187.51, 196, 1, 0.949], [184.08, 194.32, 0.98, 0.952], [180.99, 193.88, 0.98, 0.949], [177.81, 194.62, 1, 0.949], [175.36, 194.61, 1.02, 0.95], [171.67, 193.62, 1, 0.944], [171.67, 193.62, 1, 0.944], [174.59, 193.5, 1.02, 0.952], [177.38, 192.46, 1.02, 0.95], [180.43, 190.38, 1, 0.957], [183.32, 188.01, 0.98, 0.95], [186.05, 187, 0.98, 0.954], [189.53, 187.6, 1.02, 0.95], [192.59, 185.84, 1, 0.945], [195.46, 183.93, 0.98, 0.942], [195.46, 183.93, 0.98, 0.942], [195.23, 182.08, 0.98, 0.958], [194.56, 180.73, 1, 0.963], [194.34, 179.26, 1, 0.974], [193.93, 177.12, 1, 0.982], [193.33, 175.54, 1.02, 0.983], [192.7, 173.2, 1, 0.996], [192.66, 170.55, 1, 0.992], [191.7, 168.3, 1, 1], null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null] }, seat: { cache: "puppy-paper-seat.bin.gz", sha256: "613dbeeeaec11804e80db0216922c8f62294745514ee6283bdce61a6d784dd5e", samples: 17, covered: 51, frames: [[191.7, 168.3, 1, 1], [187.28, 167.83, 0.98, 0.992], [186.01, 168.11, 0.98, 0.997], [184.36, 167.85, 0.96, 0.997], [182.14, 168.27, 0.96, 0.99], [179.4, 167.97, 0.94, 0.989], [177.05, 167.47, 0.92, 0.991], [174.39, 167.11, 0.9, 0.982], [171.52, 167.84, 0.9, 0.977], [169.74, 168.03, 0.9, 0.978], [166.37, 168.27, 0.9, 0.98], [163.95, 166.65, 0.86, 0.975], [161.1, 167.16, 0.86, 0.973], [158.82, 167.1, 0.86, 0.97], [157.06, 167.85, 0.86, 0.97], [155.39, 167.09, 0.84, 0.966], [152.19, 167.86, 0.84, 0.951], [152.19, 167.86, 0.84, 0.951], [152.24, 167.87, 0.84, 0.952], [152.26, 167.86, 0.84, 0.953], [152.26, 167.85, 0.84, 0.953], [152.27, 167.85, 0.84, 0.953], [152.3, 167.84, 0.84, 0.954], [152.33, 167.83, 0.84, 0.954], [152.69, 166.08, 0.8, 0.956], [152.75, 166.06, 0.8, 0.956], [152.77, 166.04, 0.8, 0.957], [153.16, 166.03, 0.8, 0.957], [153.19, 166.03, 0.8, 0.956], [153.21, 166.02, 0.8, 0.955], [153.23, 166.02, 0.8, 0.955], [153.27, 166.02, 0.8, 0.953], [153.37, 166.03, 0.8, 0.952], [153.28, 166.02, 0.8, 0.952], [153.28, 166.02, 0.8, 0.952], [154.28, 166.02, 0.8, 0.954], [154.49, 166.87, 0.82, 0.951], [155.31, 165.99, 0.8, 0.953], [156.08, 165.96, 0.8, 0.956], [156.67, 166.83, 0.82, 0.958], [157.34, 166.82, 0.82, 0.955], [158.31, 166.73, 0.82, 0.956], [158.83, 166.62, 0.82, 0.96], [159.42, 166.54, 0.82, 0.958], [160.23, 166.48, 0.82, 0.952], [160.85, 166.5, 0.82, 0.954], [161.4, 166.49, 0.82, 0.954], [162.04, 166.45, 0.82, 0.947], [162.98, 166.47, 0.82, 0.947], [163.19, 166.46, 0.82, 0.946], [164.02, 166.47, 0.82, 0.945]] }, arrivalSeat: { cache: "puppy-paper-arrival-seat.bin.gz", sha256: "13acb62fd573ff7ef97bcf59be80757897fe9d1784f187ab278990ff94a643b9", samples: 17, covered: 51, frames: [[195.46, 183.93, 0.98, 0.942], [191.05, 182.87, 0.98, 0.955], [189.92, 182.76, 0.98, 0.95], [187.17, 181.29, 0.96, 0.954], [184.77, 179.89, 0.94, 0.954], [182.36, 179.93, 0.96, 0.955], [179.54, 177.85, 0.94, 0.96], [176.3, 176.4, 0.92, 0.959], [174.08, 175.36, 0.9, 0.966], [171.91, 174.25, 0.9, 0.958], [168.15, 172.23, 0.88, 0.953], [165.17, 170.82, 0.86, 0.963], [162.45, 171.28, 0.88, 0.959], [160.06, 170.01, 0.86, 0.965], [157.6, 169.78, 0.86, 0.959], [155.67, 167.31, 0.82, 0.96], [152.19, 167.86, 0.84, 0.951], [152.19, 167.86, 0.84, 0.951], [152.24, 167.87, 0.84, 0.952], [152.26, 167.86, 0.84, 0.953], [152.26, 167.85, 0.84, 0.953], [152.27, 167.85, 0.84, 0.953], [152.3, 167.84, 0.84, 0.954], [152.33, 167.83, 0.84, 0.954], [152.69, 166.08, 0.8, 0.956], [152.75, 166.06, 0.8, 0.956], [152.77, 166.04, 0.8, 0.957], [153.16, 166.03, 0.8, 0.957], [153.19, 166.03, 0.8, 0.956], [153.21, 166.02, 0.8, 0.955], [153.23, 166.02, 0.8, 0.955], [153.27, 166.02, 0.8, 0.953], [153.37, 166.03, 0.8, 0.952], [153.28, 166.02, 0.8, 0.952], [153.28, 166.02, 0.8, 0.952], [154.28, 166.02, 0.8, 0.954], [154.49, 166.87, 0.82, 0.951], [155.31, 165.99, 0.8, 0.953], [156.08, 165.96, 0.8, 0.956], [156.67, 166.83, 0.82, 0.958], [157.34, 166.82, 0.82, 0.955], [158.31, 166.73, 0.82, 0.956], [158.83, 166.62, 0.82, 0.96], [159.42, 166.54, 0.82, 0.958], [160.23, 166.48, 0.82, 0.952], [160.85, 166.5, 0.82, 0.954], [161.4, 166.49, 0.82, 0.954], [162.04, 166.45, 0.82, 0.947], [162.98, 166.47, 0.82, 0.947], [163.19, 166.46, 0.82, 0.946], [164.02, 166.47, 0.82, 0.945]] }, actions: { sha256: "1e0db7138d087292a3e70c246a1d56af590b3fb50928687a026e7080d7657c38", frames: [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, [192, 168, 1, null], [197, 167, 1, null], [203, 165, 1, null], [209, 165, 1, null], [224, 154, 1, null], [235, 150, 1, null], [242, 149, 1, null], [245, 149, 1, null], [252, 148, 1, null], null, null, null, null, null, [237, 150, 1, null], [245, 149, 1, null], [248, 149, 1, null], [252, 148, 1, null], null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null] } } };
function mouthSourceFrame(family, state, info) {
  if (family === "actions") {
    const p = paperActionPose(state.actionName, state.actionProgress, info);
    return p.pair * 9 + Math.round(p.blend * 8);
  }
  if (family === "approach")
    return state.approachPair * 9 + Math.round(state.blend * 8);
  if (family === "behaviors") {
    const p = paperBehaviorPose(state, info);
    return p.pair * 9 + Math.round(p.blend * 8);
  }
  if (family === "seat" || family === "arrivalSeat") {
    const q = state.seatProgress * 3, pair = Math.min(2, Math.floor(q));
    return pair * 17 + Math.round((q - pair) * 16);
  }
  return null;
}
function mouthAnchor(family, frame, sha256) {
  const f = MOUTH_ANCHORS.families[family];
  if (!f || !Number.isInteger(frame) || sha256 && f.sha256 !== sha256)
    return null;
  const a = f.frames[frame];
  return a ? { x: a[0], y: a[1], scale: a[2], score: a[3] } : null;
}
function projectMouth(anchor, { left, top, side, sideX }, flip = false, { family = null, frame = null } = {}) {
  if (!anchor)
    return null;
  const sx = flip ? 320 - anchor.x : anchor.x, r = MOUTH_ANCHORS.ballRadiusPx;
  const m = { x: left + sx / 320 * sideX, y: top + anchor.y / 320 * side, rx: r / 320 * sideX, ry: r / 320 * side, family, frame, flip: !!flip, scale: anchor.scale, score: anchor.score };
  return [m.x, m.y, m.rx, m.ry].every(Number.isFinite) && m.rx > 0 && m.ry > 0 ? m : null;
}

// puppy-paper-trick-timing.mjs
var SNAPPY_TRICK_PROFILES = Object.freeze({
  spin: Object.freeze({ enter: "spin0", exit: "spin15", seconds: Object.freeze([0.1, 0.72, 0.14]) }),
  roll: Object.freeze({ enter: "bridge6", exit: "bridge6", seconds: Object.freeze([0.56, 0.86, 0.62]) }),
  "roll-down": Object.freeze({ enter: "bridge6", exit: "bridge6", seconds: Object.freeze([0.32, 0.86, 0.62]) })
});
var TRICK_PHASES = Object.freeze(["windup", "active", "settle"]);
var fail2 = (m) => {
  throw Error(`Invalid trick timing: ${m}`);
};
function trickClipEdges(name, info) {
  validatePaperActionInfo(info);
  const list = info.clips[name], weights = info.weights?.[name] ?? list.map(() => 1), { keyOrder, edges } = info;
  if (!Array.isArray(keyOrder) || !Array.isArray(edges) || edges.length < info.pairs)
    fail2("missing keyOrder/edges");
  const keys = list.map((p) => {
    const e = edges[p];
    if (!Array.isArray(e) || e.length !== 2 || !e.every((k) => Number.isInteger(k) && typeof keyOrder[k] === "string"))
      fail2(`edge ${p}`);
    return [keyOrder[e[0]], keyOrder[e[1]]];
  });
  for (let i = 1;i < keys.length; i++)
    if (edges[list[i - 1]][1] !== edges[list[i]][0])
      fail2(`${name} chain breaks at edge ${i}`);
  const total = weights.reduce((a, b) => a + b, 0), bounds = [0];
  let sum = 0;
  for (let i = 0;i < weights.length - 1; i++) {
    sum += weights[i];
    bounds.push(sum / total);
  }
  bounds.push(1);
  return { list, keys, bounds };
}
function createTrickTiming(name, info, profile = SNAPPY_TRICK_PROFILES[name]) {
  if (!profile || typeof profile.enter !== "string" || typeof profile.exit !== "string")
    fail2(`profile for ${name}`);
  const s2 = profile.seconds;
  if (!Array.isArray(s2) || s2.length !== 3 || !s2.every((v) => typeof v === "number" && Number.isFinite(v) && v > 0))
    fail2("seconds");
  const { list, keys, bounds } = trickClipEdges(name, info);
  const first = keys.findIndex((k) => k[1] === profile.enter), last = keys.findLastIndex((k) => k[0] === profile.exit);
  if (first < 0)
    fail2(`no edge arrives at ${profile.enter}`);
  if (last < 0)
    fail2(`no edge leaves ${profile.exit}`);
  const ranges = [[0, first], [first + 1, last - 1], [last, list.length - 1]];
  if (!ranges.every(([a, b]) => a <= b))
    fail2(`${name} phases need at least one edge each`);
  const T = [0, s2[0], s2[0] + s2[1], s2[0] + s2[1] + s2[2]], P = [0, bounds[first + 1], bounds[last], 1];
  const d = [0, 1, 2].map((i) => (P[i + 1] - P[i]) / (T[i + 1] - T[i])), m = [0, 2 * d[0] * d[1] / (d[0] + d[1]), 2 * d[1] * d[2] / (d[1] + d[2]), 0];
  const duration = T[3];
  const progressAt = (age) => {
    if (typeof age !== "number" || !Number.isFinite(age))
      fail2("age");
    if (age <= 0)
      return 0;
    if (age >= duration)
      return 1;
    const i = age < T[1] ? 0 : age < T[2] ? 1 : 2, h = T[i + 1] - T[i], u = (age - T[i]) / h, u2 = u * u, u3 = u2 * u;
    const p = (2 * u3 - 3 * u2 + 1) * P[i] + (u3 - 2 * u2 + u) * h * m[i] + (-2 * u3 + 3 * u2) * P[i + 1] + (u3 - u2) * h * m[i + 1];
    return Math.max(P[i], Math.min(P[i + 1], p));
  };
  const phases = Object.freeze(TRICK_PHASES.map((phase, i) => Object.freeze({
    phase,
    start: T[i],
    end: T[i + 1],
    progressStart: P[i],
    progressEnd: P[i + 1],
    firstEdge: ranges[i][0],
    lastEdge: ranges[i][1],
    fromKey: keys[ranges[i][0]][0],
    toKey: keys[ranges[i][1]][1]
  })));
  return Object.freeze({ name, duration, phases, progressAt });
}
function createSnappyTrickTimings(info, profiles = SNAPPY_TRICK_PROFILES) {
  return Object.freeze(Object.fromEntries(Object.keys(profiles).filter((n) => Object.prototype.hasOwnProperty.call(info?.clips ?? {}, n)).map((n) => [n, createTrickTiming(n, info, profiles[n])])));
}

// puppy-paper.mjs
var PAPER_COMFORT_LIMITS = Object.freeze({ belly: 30, sleep: 120, tug: 30 });
var PAPER_COMFORT_TIMINGS = Object.freeze({ belly: Object.freeze({ key: "roll7", hold: 0.4449823183425605, enter: 1.3, exit: 1.7 }), tugExit: 0.35 });
function createPaperComfortTimings(actionInfo, { key = PAPER_COMFORT_TIMINGS.belly.key } = {}) {
  const { keys, bounds } = trickClipEdges("roll-down", actionInfo), i = keys.findIndex((k) => k[0] === key);
  if (i <= 0)
    throw Error(`Invalid comfort timing: no roll-down edge leaves ${key}`);
  return Object.freeze({ ...PAPER_COMFORT_TIMINGS, belly: Object.freeze({ ...PAPER_COMFORT_TIMINGS.belly, key, hold: bounds[i] }) });
}
var comfortDuration = (name, seconds) => {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0 || seconds > PAPER_COMFORT_LIMITS[name])
    throw Error(`Invalid ${name} duration`);
};
var comfortEase = (u) => u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);
var PAPER_WATCH_TIMING = Object.freeze({ turn: 0.6, hold: 0.65, back: 0.65, total: 1.9 });
function paperWatchProgress(age) {
  const { turn, hold, back } = PAPER_WATCH_TIMING;
  return age < turn ? 0.5 * comfortEase(age / turn) : age < turn + hold ? 0.5 : 0.5 + 0.5 * comfortEase((age - turn - hold) / back);
}
function createPaperActor(animal, info, { manualTricks = false, trickTimings = null, walkTransitions = false, comfortTimings = PAPER_COMFORT_TIMINGS, scrambleSeconds = 0, fetchMotions = null, motionTables = null } = {}) {
  if (!Number.isFinite(scrambleSeconds) || scrambleSeconds < 0 || scrambleSeconds > 3)
    throw Error("Invalid scramble duration");
  if (fetchMotions && (!Number.isFinite(fetchMotions.scramble?.entryPhase) || fetchMotions.scramble.entryPhase <= 0 || fetchMotions.scramble.entryPhase >= 1 || !Number.isFinite(fetchMotions.scramble.brakeSeconds) || fetchMotions.scramble.brakeSeconds <= 0 || fetchMotions.scramble.brakeSeconds > scrambleSeconds || !["front", "rear"].every((v) => Number.isFinite(fetchMotions.pickups?.[v]?.duration) && fetchMotions.pickups[v].duration > 0 && fetchMotions.pickups[v].duration <= 3)))
    throw Error("Invalid fetch actor metadata");
  if (fetchMotions?.scramble.trajectory === "single-pass-target") {
    if (fetchMotions.scramble.entryView !== "rear" || fetchMotions.scramble.duration !== scrambleSeconds)
      throw Error("Invalid single-pass view/duration");
    planPaperStumble(1, fetchMotions.scramble);
  }
  const recovery = fetchMotions?.scramble?.recovery;
  if (recovery && (![recovery.start, recovery.end, recovery.distance, recovery.height].every(Number.isFinite) || recovery.start < fetchMotions.scramble.brakeSeconds || recovery.end <= recovery.start || recovery.end > scrambleSeconds || recovery.distance < 0 || recovery.distance > 0.2 || recovery.height < 0 || recovery.height > 0.1))
    throw Error("Invalid fetch recovery metadata");
  const bellyTiming = comfortTimings?.belly;
  if (!bellyTiming || ![bellyTiming.hold, bellyTiming.enter, bellyTiming.exit, comfortTimings.tugExit].every(Number.isFinite) || bellyTiming.hold <= 0 || bellyTiming.hold >= 1 || bellyTiming.enter <= 0 || bellyTiming.exit <= 0 || comfortTimings.tugExit <= 0)
    throw Error("Invalid comfort timing");
  let state = "idle", age = 0, phase = 0, flip = false, nextFlip = false, target = null, route = false, routeIndex = 0, view = "front", nextView = "front", turnView = "front", turnFlip = false;
  let held = null, waypoints = [];
  let preparationRate = 1;
  let scrambleArmed = false, movingScramble = null, carryMode = null;
  let arrived = false;
  let straight = false, seatProgress = 0, seatVariant = "default", travel = null, approachPlan = null, travelAge = 0, travelDistance = 0, motionSpeed = 0, motionStage = "rest", completed = false;
  let watchSide = "left", restProgress = 0, idleHold = 2.5;
  let pendingAction = null, activeAction = null, actionDone = null, deferred = null, movementMode = "run", stayDown = false, manualDown = false, spinReady = false;
  let comfort = null, comfortSeconds = 0, sleepLook = null, nextSleepLook = { variant: "side", right: false };
  const director = createPaperDirector();
  const points = [[0.12, PAPER_GROUND.away]];
  const enter = (s2) => {
    state = s2;
    age = 0;
    if (s2 === "idle")
      preparationRate = 1;
  };
  const nextRoute = () => {
    const choice = director.choose({ x: animal.position.x, z: animal.position.z, seated: view === "approach" && seatProgress === 1 });
    idleHold = choice.holdSeconds;
    if (choice.kind === "watch") {
      watchSide = choice.side;
      enter("watch");
    } else if (choice.kind === "rest")
      enter("recline");
    else if (choice.kind === "come")
      go(animal.position.x, 0.2, { direct: true });
    else
      go(...choice.target);
  };
  const settle = () => {
    if (view === "approach" && completed)
      seatVariant = "arrival";
    enter(view === "approach" ? "sit-down" : "settle");
  };
  const stop = () => {
    animal.follow({ x: animal.position.x, y: 0, z: animal.position.z }, { x: 0, y: 0, z: 0 }, { heading: 0 });
    motionSpeed = 0;
  };
  const snappyPreparation = () => !!trickTimings?.[pendingAction];
  const viewTurnSeconds = () => snappyPreparation() ? 0.24 : walkTransitions && movementMode === "walk" ? 0.4 : 1;
  const turnSeconds = () => snappyPreparation() ? 0.22 : 0.85;
  const launchSeconds = () => snappyPreparation() ? 0.1 : 0.25;
  const dispatch = (fn, { keepDown = false, urgent = false } = {}) => {
    if (urgent)
      preparationRate = 3;
    if (activeAction || state === "tug" || state === "attention-paw" || state === "attention-wall" || state === "scramble" || state === "pickup" || movementMode === "walk" && state === "run") {
      route = false;
      deferred = () => dispatch(fn, { keepDown, urgent });
      hurryComfort();
      return true;
    }
    if (manualDown && !keepDown) {
      route = false;
      deferred = fn;
      playAction("lie-up", () => {
        manualDown = false;
        view = "approach";
        seatProgress = 1;
        seatVariant = "default";
        enter("idle");
        drain();
      }, 0.55);
      return true;
    }
    return fn();
  };
  const drain = () => {
    const fn = deferred;
    deferred = null;
    if (fn) {
      fn();
      return true;
    }
    return false;
  };
  const bellyAction = (seconds) => {
    const { hold: H, enter: a, exit: b } = bellyTiming, t = { comfort: "belly", hold: [a, a + seconds], duration: a + seconds + b };
    t.progressAt = (age2) => {
      if (!Number.isFinite(age2))
        throw Error("Invalid comfort age");
      return age2 < t.hold[0] ? H * comfortEase(age2 / a) : age2 < t.hold[1] ? H : H + (1 - H) * comfortEase((age2 - t.hold[1]) / b);
    };
    return t;
  };
  const startBelly = (seconds) => {
    manualDown = false;
    stayDown = false;
    restProgress = 0;
    comfort = null;
    const timing = bellyAction(seconds);
    activeAction = { name: "roll-down", duration: timing.duration, timing, comfort: "belly" };
    actionDone = () => finishTrick("roll");
    stop();
    enter("action");
    if (deferred)
      hurryComfort();
  };
  const tugProgress = () => {
    if (!comfort || comfort.kind !== "tug")
      return 0;
    const h = comfort.hurry;
    return h ? h.length > 0 ? Math.min(1, h.progress + (1 - h.progress) * (age - h.age) / h.length) : 1 : Math.min(1, age / comfort.seconds);
  };
  function hurryComfort() {
    const t = activeAction?.timing;
    if (t?.comfort === "belly" && age < t.hold[1]) {
      t.hold[1] = Math.max(t.hold[0], age);
      t.duration = activeAction.duration = t.hold[1] + bellyTiming.exit;
    } else if (state === "tug" && comfort && !comfort.hurry) {
      const progress = tugProgress();
      comfort.hurry = { progress, age, length: Math.min(comfortTimings.tugExit, (1 - progress) * comfort.seconds) };
    } else if ((state === "attention-paw" || state === "attention-wall") && comfort && !comfort.hurry) {
      const motion = state === "attention-wall" ? fetchMotions.attentionWall : fetchMotions.attentionPaw, progress = held?.comfortPose?.clip === state ? held.comfortPose.progress : Math.min(1, age / comfort.seconds), from = motion.frames[comfortMotionKey(progress, motion)];
      comfort.hurry = { from, age, length: motion.releases[from].duration };
    }
  }
  const playAction = (name, done, duration = PAPER_ACTION_DURATIONS[name]) => {
    const timing = trickTimings?.[name];
    duration = timing?.duration ?? duration;
    if (!Number.isFinite(duration) || duration <= 0)
      throw Error("Invalid paper action duration");
    activeAction = { name, duration, timing };
    actionDone = done;
    stop();
    enter("action");
  };
  const finishTrick = (name) => {
    if (name !== "spin") {
      view = "approach";
      flip = false;
      seatProgress = 1;
      seatVariant = "default";
      enter("idle");
    } else {
      view = "front";
      flip = false;
      seatProgress = 0;
      enter("settle");
    }
    drain();
  };
  const issue = (skipEntry = false) => {
    if (skipEntry && deferred) {
      drain();
      return;
    }
    if (movementMode === "walk" && !skipEntry) {
      playAction("walk-enter", () => issue(true));
      return;
    }
    arrived = false;
    completed = false;
    travelAge = 0;
    travelDistance = 0;
    const x = animal.position.x, z = animal.position.z;
    if (straight && view === "approach")
      target[0] = x;
    const dx = target[0] - x, dz2 = target[1] - z, distance = Math.hypot(dx, dz2), run2 = movementMode === "walk" ? planPaperWalk(distance) : planPaperRun(distance);
    phase = Math.ceil(phase);
    travel = { x, z, dx, dz: dz2, heading: Math.atan2(dx, dz2), stride: view === "approach" ? PAPER_GAITS.approach.stride : run2.stride, plan: view === "approach" ? planPaperApproachTravel(distance) : run2.plan };
    approachPlan = view === "approach" ? planPaperApproach(distance) : null;
    stop();
    enter("run");
    if (["trot", "run-trot"].includes(carryMode) && fetchMotions?.carryTrot && view === "approach" && distance > 0) {
      const carry = planPaperCarry(distance, { mixed: carryMode === "run-trot", settleSeconds: fetchMotions.carryTrot.settle.duration });
      Object.assign(travel, { plan: carry, carry, stride: carry.stride });
      approachPlan = null;
    }
    if (scrambleArmed && fetchMotions?.scramble.trajectory === "single-pass-target" && view === fetchMotions.scramble.entryView && !waypoints.length) {
      const stumble = planPaperStumble(distance, fetchMotions.scramble);
      if (motionTables && !canJoinMotion(motionTables, "rear-run/scramble", { view, phase: stumble.entryPhase, speed: stumble.entrySpeed, nextSpeed: stumble.impactAt(0).speed }))
        throw Error("Unsafe baked run/impact connection");
      Object.assign(travel, { plan: stumble.plan, stride: stumble.stride, stumble, scrambleAt: stumble.entryTime });
    } else if (scrambleArmed && fetchMotions && view === "front" && !waypoints.length && fetchMotions.scramble.trajectory !== "single-pass-target") {
      const contact = fetchMotions.scramble.entryPhase, cycle = Math.max(0, Math.floor(distance / travel.stride - contact - 0.15)), d = (cycle + contact) * travel.stride;
      let lo = 0, hi = travel.plan.duration;
      for (let i = 0;i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (travel.plan.at(mid).distance < d)
          lo = mid;
        else
          hi = mid;
      }
      travel.scrambleAt = (lo + hi) / 2;
    }
  };
  const prepareAction = () => {
    const name = pendingAction, desired = name === "spin" ? "front" : "approach";
    if (restProgress > 0) {
      enter("wake");
      return;
    }
    if (motionTables) {
      const [step, target2] = preparationRoute(motionTables, "action", { view, flip, seatProgress, desired: name === "spin" ? "stand" : "seat", speed: motionSpeed });
      if (step !== "ready") {
        if (step === "view-turn")
          turnView = target2;
        else if (step === "turn")
          turnFlip = target2;
        enter(step);
        return;
      }
    } else {
      if (name === "spin" && seatProgress > 0) {
        enter("rise");
        return;
      }
      if (flip && view !== "front") {
        turnView = "front";
        enter("view-turn");
        return;
      }
      if (flip) {
        turnFlip = false;
        enter("turn");
        return;
      }
      if (view !== desired) {
        turnView = view === "front" ? desired : "front";
        enter("view-turn");
        return;
      }
      if (name !== "spin" && seatProgress < 1) {
        enter("sit-down");
        return;
      }
    }
    if (walkTransitions && name === "spin" && !spinReady) {
      spinReady = true;
      enter("launch");
      return;
    }
    pendingAction = null;
    if (name === "sit") {
      enter("idle");
      return;
    }
    if (name === "belly") {
      const seconds = comfortSeconds;
      playAction("lie-down", () => startBelly(seconds), 0.65);
      return;
    }
    if (name === "sleep") {
      stayDown = false;
      sleepLook = { ...nextSleepLook };
      comfort = { kind: "sleep", seconds: comfortSeconds };
      enter("recline");
      return;
    }
    if (name === "tug") {
      stop();
      comfort = { kind: "tug", seconds: comfortSeconds };
      enter("tug");
      return;
    }
    if (name === "attention-paw" || name === "attention-wall") {
      stop();
      held = null;
      comfort = { kind: name, seconds: (name === "attention-wall" ? fetchMotions.attentionWall : fetchMotions.attentionPaw).duration };
      enter(name);
      return;
    }
    if (name === "lie") {
      if (manualTricks) {
        playAction("lie-down", () => {
          manualDown = true;
          enter("down");
          drain();
        }, 0.65);
      } else {
        stayDown = true;
        enter("recline");
      }
      return;
    }
    playAction(name, () => finishTrick(name));
  };
  const prepareDirection = () => {
    if (pendingAction) {
      prepareAction();
      return;
    }
    if (!target) {
      settle();
      return;
    }
    if (motionTables) {
      const [step, targetView] = preparationRoute(motionTables, "direction", { view, flip, desired: nextView, nextFlip, speed: motionSpeed });
      if (step === "view-turn") {
        turnView = targetView;
        enter(step);
      } else if (step === "turn") {
        turnFlip = targetView;
        enter(step);
      } else
        issue();
    } else if (nextView !== view) {
      turnView = view === "front" ? nextView : "front";
      enter("view-turn");
    } else if (view === "front" && nextFlip !== flip) {
      turnFlip = nextFlip;
      enter("turn");
    } else
      issue();
  };
  const requestAction = (name, { urgent = false } = {}) => {
    preparationRate = urgent ? 3 : 1;
    if (name === "roll" && manualDown && state === "down") {
      route = false;
      target = null;
      waypoints = [];
      pendingAction = null;
      stayDown = false;
      manualDown = false;
      restProgress = 0;
      playAction("roll-down", () => finishTrick("roll"));
      return true;
    }
    if (name === "roll" && state === "down" && restProgress === 0.25) {
      route = false;
      target = null;
      waypoints = [];
      pendingAction = null;
      stayDown = false;
      restProgress = 0;
      playAction("roll-down", () => finishTrick("roll"));
      return true;
    }
    if (name === "belly" && state === "down" && (manualDown || restProgress === 0.25)) {
      route = false;
      target = null;
      waypoints = [];
      pendingAction = null;
      startBelly(comfortSeconds);
      return true;
    }
    if (name === "sleep" && state === "sleep" && comfort?.kind === "sleep") {
      comfort.seconds = age + comfortSeconds;
      return true;
    }
    comfort = null;
    route = false;
    target = null;
    waypoints = [];
    pendingAction = name;
    spinReady = false;
    completed = false;
    stayDown = false;
    movementMode = "run";
    stop();
    if (restProgress > 0 || state === "recline" || state === "wake")
      enter("wake");
    else if (["watch", "view-turn", "turn", "arrival-exit"].includes(state)) {} else if (["run", "finish", "launch", "settle"].includes(state))
      enter("finish");
    else if (state === "idle" && seatProgress === 0 && view === "front" && !walkTransitions)
      enter("launch");
    else
      prepareDirection();
    return true;
  };
  const faceTarget = (direct) => {
    nextFlip = target[0] < animal.position.x;
    const dz2 = target[1] - animal.position.z, dx = target[0] - animal.position.x;
    straight = direct;
    nextView = direct ? "approach" : Math.abs(dz2) > 0.16 && Math.abs(dz2) > Math.abs(dx) * 0.7 ? dz2 < 0 ? "rear" : "approach" : "front";
  };
  function go(x, z, { direct = false, walking = false, urgent = false, scramble = false, returnMode = null } = {}) {
    if (![x, z].every(Number.isFinite))
      throw Error("Invalid paper target");
    preparationRate = urgent ? 3 : 1;
    carryMode = returnMode;
    scrambleArmed = !!(scramble && fetchMotions);
    movingScramble = null;
    target = paperGroundTarget(x, z);
    pendingAction = null;
    stayDown = false;
    comfort = null;
    movementMode = walking ? "walk" : "run";
    const dz2 = target[1] - animal.position.z, dx = target[0] - animal.position.x;
    waypoints = [];
    if (!direct && Math.abs(dx) > 0.1 && Math.abs(dz2) > 0.16) {
      waypoints = [target];
      target = dz2 < 0 ? [animal.position.x, target[1]] : [target[0], animal.position.z];
    }
    faceTarget(direct);
    completed = false;
    stop();
    if (restProgress > 0 || state === "recline" || state === "wake")
      enter("wake");
    else if (state === "watch") {} else if (state === "arrival-exit") {} else if (seatProgress > 0 || state === "sit-down" || state === "rise")
      enter("rise");
    else if (state !== "view-turn" && state !== "turn") {
      if (walkTransitions && state === "idle")
        prepareDirection();
      else
        enter(state === "idle" ? "launch" : "finish");
    }
  }
  return {
    attend() {
      if (state !== "run" || !travel || !target || motionSpeed < 0.00000001)
        return dispatch(() => requestAction("sit", { urgent: true }), { urgent: true });
      const n = Math.hypot(travel.dx, travel.dz), remaining = Math.max(0, travel.plan.distance - (travelDistance - (travel.distanceBase ?? 0)));
      const a = movementMode === "walk" ? PAPER_DYNAMICS.walkDeceleration : PAPER_DYNAMICS.deceleration;
      const distance = Math.min(remaining, motionSpeed ** 2 / (2 * a));
      if (!n || distance < 0.0000000001)
        return dispatch(() => requestAction("sit", { urgent: true }), { urgent: true });
      const x = animal.position.x, z = animal.position.z, dx = travel.dx / n * distance, dz2 = travel.dz / n * distance;
      const plan = planPaperTravel(distance, { speed: motionSpeed, startSpeed: motionSpeed, deceleration: motionSpeed ** 2 / (2 * distance) });
      travel = { ...travel, x, z, dx, dz: dz2, plan, distanceBase: travelDistance, attending: true };
      travelAge = 0;
      target = [x + dx, z + dz2];
      waypoints = [];
      route = false;
      deferred = null;
      pendingAction = "sit";
      preparationRate = 3;
      scrambleArmed = false;
      completed = false;
      return true;
    },
    go(x, z) {
      if (![x, z].every(Number.isFinite))
        throw Error("Invalid paper target");
      return dispatch(() => {
        route = false;
        go(x, z);
      });
    },
    chase(x, z, { scramble = false, returnMode = null } = {}) {
      if (![x, z].every(Number.isFinite) || ![null, "brake", "trot", "run-trot"].includes(returnMode))
        throw Error("Invalid paper target/return mode");
      return dispatch(() => {
        route = false;
        go(x, z, { urgent: true, scramble, returnMode });
      }, { urgent: true });
    },
    come() {
      return dispatch(() => {
        route = false;
        if (state === "idle" && seatProgress === 1 && Math.abs(animal.position.z - 0.2) < 0.002)
          return;
        go(animal.position.x, 0.2, { direct: true });
      });
    },
    roam() {
      return dispatch(() => {
        route = true;
        routeIndex = 0;
        go(...points[routeIndex]);
      });
    },
    sit({ urgent = false } = {}) {
      return dispatch(() => requestAction("sit", { urgent }), { urgent });
    },
    spin() {
      return dispatch(() => requestAction("spin"));
    },
    roll() {
      return dispatch(() => requestAction("roll"), { keepDown: true });
    },
    walk(side, distance = 1.05) {
      if (!["left", "right"].includes(side) || !Number.isFinite(distance) || distance <= 0)
        throw Error("Invalid walk command");
      return dispatch(() => {
        const [x, z] = paperWalkTarget(animal.position.x, animal.position.z, side === "left" ? -1 : 1, distance);
        if (Math.abs(x - animal.position.x) < 0.000001)
          return false;
        route = false;
        go(x, z, { walking: true });
        return true;
      });
    },
    look(side = "left") {
      if (state !== "idle" || seatProgress !== 1)
        return false;
      route = false;
      watchSide = side === "right" ? "right" : "left";
      enter("watch");
      return true;
    },
    lie() {
      const name = manualDown || activeAction?.name === "lie-down" || restProgress > 0 ? "sit" : "lie";
      return dispatch(() => requestAction(name));
    },
    belly(seconds = 6) {
      comfortDuration("belly", seconds);
      return dispatch(() => {
        comfortSeconds = seconds;
        return requestAction("belly");
      }, { keepDown: true });
    },
    sleep(seconds = 25, variant = "side", right = false) {
      comfortDuration("sleep", seconds);
      if (!["side", "belly", "curl", "chin"].includes(variant) || typeof right !== "boolean")
        throw Error("Invalid sleep pose");
      return dispatch(() => {
        comfortSeconds = seconds;
        nextSleepLook = { variant, right };
        return requestAction("sleep");
      });
    },
    tug(seconds = 6) {
      comfortDuration("tug", seconds);
      return dispatch(() => {
        comfortSeconds = seconds;
        return requestAction("tug");
      });
    },
    attentionPaw() {
      if (!fetchMotions?.attentionPaw)
        return false;
      return dispatch(() => requestAction("attention-paw"));
    },
    get canAttentionPaw() {
      return !!fetchMotions?.attentionPaw;
    },
    attentionWall() {
      if (!fetchMotions?.attentionWall)
        return false;
      return dispatch(() => requestAction("attention-wall"));
    },
    get canAttentionWall() {
      return !!fetchMotions?.attentionWall;
    },
    get canScramble() {
      return scrambleSeconds > 0;
    },
    get canMovingScramble() {
      return !!fetchMotions;
    },
    get canSinglePassScramble() {
      return fetchMotions?.scramble.trajectory === "single-pass-target";
    },
    get canPickup() {
      return !!fetchMotions;
    },
    get canCarryTrot() {
      return !!fetchMotions?.carryTrot;
    },
    pickup() {
      if (!fetchMotions || state !== "idle" || seatProgress > 0 || !["rear", "front"].includes(view))
        return false;
      route = false;
      target = null;
      waypoints = [];
      pendingAction = null;
      stop();
      comfort = { kind: "pickup", seconds: fetchMotions.pickups[view].duration };
      enter("pickup");
      return true;
    },
    scramble() {
      if (!scrambleSeconds || state !== "idle" || view !== "front" || seatProgress > 0)
        return false;
      route = false;
      target = null;
      waypoints = [];
      pendingAction = null;
      stop();
      comfort = { kind: "scramble", seconds: scrambleSeconds };
      enter("scramble");
      return true;
    },
    rest() {
      return dispatch(() => {
        route = false;
        target = null;
        waypoints = [];
        pendingAction = null;
        stayDown = false;
        comfort = null;
        stop();
        if (restProgress > 0) {
          enter("wake");
        } else if (state === "watch" || state === "arrival-exit") {} else if (seatProgress > 0 || state === "rise" || state === "sit-down")
          enter("sit-down");
        else if (!["idle", "view-turn", "turn"].includes(state))
          enter("finish");
      });
    },
    update(dt) {
      if (!Number.isFinite(dt) || dt < 0 || dt > 0.1)
        throw Error("Invalid paper step");
      const beforeX = animal.position.x, beforeZ = animal.position.z;
      let enteredScramble = false;
      if (state === "run" && travel && target) {
        travelAge += dt;
        const p = travel.plan.at(travelAge), ratio = travel.plan.distance ? p.distance / travel.plan.distance : 1;
        travelDistance = (travel.distanceBase ?? 0) + p.distance;
        motionSpeed = p.speed;
        motionStage = p.stage;
        const gain = travel.plan.distance ? p.speed / travel.plan.distance : 0;
        animal.follow({ x: travel.x + travel.dx * ratio, y: 0, z: travel.z + travel.dz * ratio }, { x: travel.dx * gain, y: 0, z: travel.dz * gain }, { heading: travel.heading });
        arrived = p.done;
        if (scrambleArmed && travel.scrambleAt !== undefined && travelAge >= travel.scrambleAt) {
          const entry = travel.plan.at(travel.scrambleAt), ratio2 = entry.distance / travel.plan.distance, n = travel.plan.distance;
          const x = travel.x + travel.dx * ratio2, z = travel.z + travel.dz * ratio2, ux = travel.dx / n, uz = travel.dz / n;
          const end = paperGroundTarget(x + ux * entry.speed * fetchMotions.scramble.brakeSeconds / 2, z + uz * entry.speed * fetchMotions.scramble.brakeSeconds / 2);
          const distance2 = Math.hypot(end[0] - x, end[1] - z), brake = entry.speed ? 2 * distance2 / entry.speed : 0;
          const fullEnd = paperGroundTarget(end[0] + ux * (recovery?.distance ?? 0), end[1] + uz * (recovery?.distance ?? 0));
          movingScramble = { x, z, ux, uz, speed: entry.speed, brake, distance: distance2, travelBase: entry.distance, hop: Math.hypot(fullEnd[0] - end[0], fullEnd[1] - end[1]), profile: travel.stumble ?? null };
          scrambleArmed = false;
          target = null;
          waypoints = [];
          comfort = { kind: "scramble", seconds: scrambleSeconds };
          enter("scramble");
          age = travelAge - travel.scrambleAt;
          enteredScramble = true;
        }
      }
      if (state === "scramble" && movingScramble) {
        const m = movingScramble, time = age + (enteredScramble ? 0 : dt), t = Math.min(m.brake, time), p = recovery ? Math.max(0, Math.min(1, (time - recovery.start) / (recovery.end - recovery.start))) : 0;
        const hop = m.hop * (1 - Math.cos(Math.PI * p)) / 2, hopSpeed = recovery && p > 0 && p < 1 ? m.hop * Math.PI / (2 * (recovery.end - recovery.start)) * Math.sin(Math.PI * p) : 0;
        const kinematic = m.profile?.impactAt(time), speed = kinematic?.speed ?? (m.brake ? m.speed * (1 - t / m.brake) : 0) + hopSpeed, d = kinematic?.distance ?? (m.brake ? m.speed * t - 0.5 * m.speed / m.brake * t * t : 0) + hop;
        animal.follow({ x: m.x + m.ux * d, y: 0, z: m.z + m.uz * d }, { x: m.ux * speed, y: 0, z: m.uz * speed }, { heading: travel.heading });
        travelDistance = m.travelBase + d;
        motionSpeed = speed;
        motionStage = kinematic?.stage ?? (hopSpeed > 0.00000001 ? "recovery" : speed ? "braking" : "rest");
      }
      animal.update(dt);
      const prepareDt = dt * preparationRate;
      if (!enteredScramble)
        age += ["view-turn", "turn", "rise", "watch", "arrival-exit", "launch", "wake", "finish", "settle"].includes(state) || state === "action" && deferred ? prepareDt : dt;
      const distance = Math.hypot(animal.position.x - beforeX, animal.position.z - beforeZ);
      director.update(dt, state === "run", distance);
      if (state === "run") {
        phase += distance / (travel.carry && travelDistance < travel.carry.runDistance ? PAPER_GAITS.approach.stride : travel.stride);
        if (target && arrived) {
          completed = true;
          stop();
          target = null;
          if (movementMode === "walk")
            playAction("walk-exit", () => {
              movementMode = "run";
              enter(walkTransitions ? "idle" : "settle");
              if (pendingAction)
                prepareDirection();
              else
                drain();
            });
          else
            enter("finish");
        }
      } else if (state === "action" && age >= activeAction.duration) {
        const done = actionDone;
        activeAction = null;
        actionDone = null;
        done();
      } else if (state === "launch" && age >= launchSeconds()) {
        phase = Math.ceil(phase);
        prepareDirection();
      } else if (state === "finish" && age >= 0.22) {
        phase = Math.ceil(phase);
        if (!target && waypoints.length) {
          target = waypoints.shift();
          faceTarget(false);
        }
        if (target && Math.hypot(target[0] - animal.position.x, target[1] - animal.position.z) > 0.12) {
          prepareDirection();
        } else if (pendingAction)
          prepareDirection();
        else
          settle();
      } else if (state === "view-turn" && age >= viewTurnSeconds()) {
        view = turnView;
        prepareDirection();
      } else if (state === "turn" && age >= turnSeconds()) {
        flip = turnFlip;
        prepareDirection();
      } else if (state === "sit-down") {
        seatProgress = Math.min(1, seatProgress + prepareDt / (snappyPreparation() ? 0.35 : 0.95));
        if (seatProgress === 1) {
          seatVariant = "default";
          enter("idle");
          if (pendingAction)
            prepareDirection();
        }
      } else if (state === "rise") {
        seatProgress = Math.max(0, seatProgress - prepareDt / (snappyPreparation() ? 0.28 : 0.65));
        if (seatProgress === 0) {
          if (seatVariant === "arrival")
            enter("arrival-exit");
          else
            prepareDirection();
        }
      } else if (state === "arrival-exit" && age >= 0.22) {
        seatVariant = "default";
        prepareDirection();
      } else if (state === "watch" && age >= PAPER_WATCH_TIMING.total) {
        if (pendingAction)
          prepareDirection();
        else if (target)
          enter("rise");
        else
          enter("idle");
      } else if (state === "recline") {
        const end = stayDown ? 0.25 : 1;
        restProgress = Math.min(end, restProgress + dt / 1.8);
        if (restProgress === end)
          enter(stayDown ? "down" : comfort?.kind === "sleep" ? "sleep" : "nap");
      } else if (state === "sleep" && age >= comfort.seconds) {
        comfort = null;
        enter("wake");
      } else if (state === "tug" && tugProgress() >= 1) {
        comfort = null;
        enter("idle");
        drain();
      } else if ((state === "attention-paw" || state === "attention-wall") && (comfort.hurry ? age - comfort.hurry.age >= comfort.hurry.length : age >= comfort.seconds)) {
        comfort = null;
        enter("idle");
        drain();
      } else if ((state === "scramble" || state === "pickup") && age >= comfort.seconds) {
        comfort = null;
        movingScramble = null;
        stop();
        enter("idle");
        drain();
      } else if (state === "nap" && age >= 5 && !stayDown) {
        enter("wake");
      } else if (state === "wake") {
        restProgress = Math.max(0, restProgress - prepareDt / 1.2);
        if (restProgress === 0) {
          if (pendingAction)
            prepareDirection();
          else if (target)
            enter("rise");
          else
            enter("idle");
        }
      } else if (state === "idle" && route && age >= idleHold)
        nextRoute();
      else if (state === "settle" && age >= 0.35)
        enter("idle");
    },
    sample(clock, { poseFps = 24 } = {}) {
      if (![12, 24, 30].includes(poseFps))
        throw Error("Invalid pose cadence");
      let pair = 20, blend = 0, kind = state, rearPair = null, approachPair = null;
      let seat = state === "sit-down" || state === "rise" || seatProgress > 0 ? Math.round(seatProgress * 48) / 48 : null;
      if (restProgress === 0 && state !== "recline")
        sleepLook = null;
      let behavior = null, behaviorProgress = 0, comfortPose = state === "scramble" ? { clip: "scramble", view, progress: Math.min(1, age / comfort.seconds) } : state === "pickup" ? { clip: "pickup", view, progress: Math.min(1, age / comfort.seconds) } : state === "tug" ? { clip: "tug", progress: tugProgress() } : sleepLook && restProgress > 0.72 ? { clip: "sleep", ...sleepLook, blend: comfortEase((restProgress - 0.72) / 0.28) } : null;
      if (state === "attention-paw" || state === "attention-wall")
        comfortPose = { clip: state, progress: Math.min(1, age / comfort.seconds), ...comfort.hurry ? { release: { from: comfort.hurry.from, progress: Math.min(1, (age - comfort.hurry.age) / comfort.hurry.length) } } : {} };
      if (activeAction?.comfort)
        kind = activeAction.comfort;
      let actionName = activeAction?.name ?? (state === "run" && movementMode === "walk" ? "walk" : null), actionProgress = activeAction ? activeAction.timing ? activeAction.timing.progressAt(age) : Math.min(1, age / activeAction.duration) : phase;
      if (manualDown && state === "down") {
        actionName = "lie-down";
        actionProgress = 1;
      }
      if (walkTransitions && state === "view-turn") {
        actionName = view === "approach" || turnView === "approach" ? "walk-face-front" : "walk-face-rear";
        const t = Math.min(1, age / viewTurnSeconds());
        actionProgress = turnView === "front" ? t : 1 - t;
      }
      if (walkTransitions && state === "turn") {
        actionName = "walk-turn";
        actionProgress = Math.min(1, age / turnSeconds());
      }
      if (view === "approach" && approachPlan && (state === "run" || state === "finish" && completed)) {
        const p = approachPlan.at(travelDistance);
        if (state === "finish" && !travel?.attending) {
          behavior = "brake";
          behaviorProgress = 1;
        } else if (p.clip !== "run") {
          behavior = p.clip;
          behaviorProgress = p.progress;
        }
      }
      if (view === "approach" && travel?.carry && (state === "run" || state === "finish")) {
        const p = state === "finish" ? { clip: "carry-settle", progress: 1 } : travel.carry.poseAt(travelDistance);
        if (p.clip !== "run") {
          comfortPose = p;
          behavior = null;
          actionName = null;
        }
      }
      if (state === "arrival-exit") {
        behavior = "finish";
        behaviorProgress = Math.min(1, age / 0.22);
      }
      if (state === "watch") {
        behavior = `watch-${watchSide}`;
        behaviorProgress = paperWatchProgress(age);
      }
      if (restProgress > 0 || state === "recline" || state === "wake" || state === "nap") {
        behavior = "rest";
        behaviorProgress = restProgress;
      }
      if (state === "run" || state === "finish") {
        const p = state === "finish" ? phase + (Math.ceil(phase) - phase) * Math.min(1, age / 0.22) : phase;
        const q = view !== "front" ? p % 1 * 8 : retimeRun(p % 1 * 20, info.run_timing);
        pair = Math.floor(q) % info.run_sequence.length;
        blend = q - Math.floor(q);
        if (view === "rear")
          rearPair = 5 + pair;
        if (view === "approach")
          approachPair = 5 + pair;
      } else if (state === "view-turn") {
        const q = Math.min(4.999999, age / viewTurnSeconds() * 5), i = Math.floor(q);
        if (view === "approach" || turnView === "approach")
          approachPair = (view === "front" ? 0 : 13) + i;
        else
          rearPair = (view === "front" ? 0 : 13) + i;
        blend = q - i;
      } else if (state === "turn") {
        const t = Math.min(1, age / turnSeconds());
        if (t < 0.15) {
          pair = flip ? 43 : 41;
          blend = t / 0.15;
        } else if (t < 0.85) {
          const q = (t - 0.15) / 0.7 * 11, i = Math.min(10, Math.floor(q));
          pair = flip ? 40 - i : 30 + i;
          blend = flip ? 1 - (q - i) : q - i;
        } else {
          pair = flip ? 44 : 42;
          blend = (t - 0.85) / 0.15;
        }
      } else if (state === "launch") {
        pair = 45;
        blend = Math.min(1, age / launchSeconds());
        if (view === "rear") {
          rearPair = 5;
          blend = 0;
        }
      } else if (state === "settle") {
        pair = 46;
        blend = Math.min(1, age / 0.35);
      } else {
        const q = Math.floor((walkTransitions && state === "idle" ? age : clock) * poseFps) / poseFps * 6;
        pair = 20 + Math.floor(q) % 10;
        blend = q - Math.floor(q);
      }
      if (view === "rear" && (state === "idle" || state === "settle" || state === "turn")) {
        rearPair = 5;
        blend = 0;
      }
      if (view === "approach" && (state === "idle" || state === "settle" || state === "turn" || state === "launch")) {
        approachPair = 5;
        blend = 0;
      }
      blend = Math.round(blend * 16) / 16;
      const key = `${state}/${actionName}/${view}/${turnView}/${poseFps}/${Math.floor(clock * poseFps)}`;
      if (held?.key === key) {
        pair = held.pair;
        blend = held.blend;
        rearPair = held.rearPair;
        approachPair = held.approachPair;
        seat = held.seat;
        behavior = held.behavior;
        behaviorProgress = held.behaviorProgress;
        actionName = held.actionName;
        actionProgress = held.actionProgress;
        comfortPose = held.comfortPose;
      } else
        held = { key, pair, blend, rearPair, approachPair, seat, behavior, behaviorProgress, actionName, actionProgress, comfortPose, posePhase: phase };
      const hopProgress = recovery && movingScramble ? Math.max(0, Math.min(1, (age - recovery.start) / (recovery.end - recovery.start))) : 0;
      return { state: state === "run" || state === "finish" ? "run" : kind, pair, blend, rearPair, approachPair, seatProgress: seat, seatVariant, behavior, behaviorProgress, actionName, actionProgress, queued: !!deferred, view, straight, flip: state === "turn" && !walkTransitions ? false : flip, phase, posePhase: held.posePhase, stride: travel?.carry && travelDistance < travel.carry.runDistance ? PAPER_GAITS.approach.stride : travel?.stride ?? PAPER_GAITS.front.stride, heading: travel?.heading ?? 0, speed: motionSpeed, motionStage, travelDistance, energy: director.report.energy, x: animal.position.x, z: animal.position.z, ...movingScramble ? { bodyLift: recovery && hopProgress > 0 && hopProgress < 1 ? recovery.height * Math.sin(Math.PI * hopProgress) : 0 } : {}, ...comfortPose ? { comfortPose: { ...comfortPose } } : {} };
    },
    get state() {
      return state;
    }
  };
}
function createPaperRenderer(cache, info, meta, width, height, { rear, approach, seat, arrivalSeat, behaviors, actions, interactions, comfort, contacts = true, pawTransport = false, motionTables = null, kernel = null } = {}) {
  if (![width, height].every(Number.isInteger) || width < 2 || height < 2 || width * height > 1e6)
    throw Error("Invalid paper grid");
  const tween = createCachedTween(cache, info, kernel), renderMeta = { ...meta, pairs: info.pair_map, run_sequence: info.run_sequence };
  const out = new Uint8ClampedArray(width * height * 4), area = createPaperAreaSampler();
  const actionScratch = new Uint8ClampedArray(Math.max(320 * 320, (actions?.info.width ?? 320) * (actions?.info.height ?? 320)) * 4);
  const spriteScratch = actionScratch.subarray(0, 320 * 320 * 4);
  for (let i = 3;i < actionScratch.length; i += 4)
    actionScratch[i] = 255;
  const rearSample = rear ? createRearSampler(rear.bytes, rear.info, spriteScratch, kernel) : null, lock = createPaperFootLock({ maxImageStretch: pawTransport ? 1.45 : Infinity });
  const approachSample = approach ? createRearSampler(approach.bytes, approach.info, spriteScratch, kernel) : null;
  const seatSample = seat ? createPaperSeatSampler(seat.bytes, seat.info, spriteScratch, kernel) : null;
  const arrivalSeatSample = arrivalSeat ? createPaperSeatSampler(arrivalSeat.bytes, arrivalSeat.info, spriteScratch, kernel) : null;
  const behaviorSample = behaviors ? createPaperBehaviorSampler(behaviors.bytes, behaviors.info, spriteScratch, kernel) : null;
  const interactionSample = interactions ? createCompanionSpriteSampler(interactions.bytes, interactions.info, spriteScratch, kernel) : null;
  const comfortSample = comfort ? createComfortSpriteSampler(comfort.bytes, comfort.info, spriteScratch) : null;
  const actionSample = actions ? createPaperActionSampler(actions.bytes, actions.info, actionScratch.subarray(0, actions.info.width * actions.info.height * 4), motionTables?.actionClips, kernel) : null, actionArea = actions ? createPaperAreaSampler(actions.info.width) : null;
  const episodes = (key, labels, indices, samples, options) => motionTables?.support[key] ? createBakedSupportEpisodes(motionTables.support[key]) : createPaperSupportEpisodes(labels, indices, samples, options);
  const walkEpisodes = actions ? episodes("walk", actions.info.feet, actions.info.clips.walk, 9) : null;
  const sourceEpisodes = rear ? {
    front: episodes("front", rear.info.frontFeet, [0, 1, 2, 3, 4, 5, 6, 7], 17),
    rear: episodes("rear", rear.info.rearFeet, [5, 6, 7, 8, 9, 10, 11, 12], 9),
    approach: approach ? episodes("approach", approach.info.feet, [5, 6, 7, 8, 9, 10, 11, 12], 9) : null
  } : null;
  const behaviorEpisodes = behaviors ? Object.fromEntries(Object.entries(behaviors.info.clips).map(([name, indices]) => [name, episodes("behavior/" + name, behaviors.info.feet, indices, 9, { cyclic: name === "walk" })])) : {};
  const render = (state, { x = 0.5, y = 0.85, size = 0.85, pixelAspect = 1, contactEnabled = contacts, groundFromPixel, pixelFromGround } = {}) => {
    if (![x, y, size].every(Number.isFinite) || size <= 0 || size > 3)
      throw Error("Invalid paper placement");
    const isRear = state.rearPair !== null && state.rearPair !== undefined && rearSample;
    const isApproach = state.approachPair !== null && state.approachPair !== undefined && approachSample;
    const isSeat = state.seatProgress !== null && state.seatProgress !== undefined && seatSample;
    if (!Number.isFinite(pixelAspect) || pixelAspect < 0.1 || pixelAspect > 10)
      throw Error("Invalid dot pixel aspect");
    const isComfort = state.comfortPose && comfortSample;
    const isInteraction = isComfort || state.interactionPose && interactionSample;
    const isBehavior = !isInteraction && state.behavior && behaviorSample;
    const isAction = !isInteraction && state.actionName && actionSample, sourceN = isAction ? actions.info.width : 320, originX = (sourceN - 320) / 2, originY = (sourceN / 320 - 1) * 300;
    const image = isComfort ? comfortSample({ ...state.comfortPose, ...state.comfortPose.clip === "sleep" && state.comfortPose.blend < 1 && behaviorSample ? { base: behaviorSample({ behavior: "rest", behaviorProgress: state.behaviorProgress }) } : {} }) : isInteraction ? interactionSample(state.interactionPose) : isAction ? actionSample(state) : isBehavior ? behaviorSample(state) : isSeat ? (state.seatVariant === "arrival" && arrivalSeatSample ? arrivalSeatSample : seatSample)(state.seatProgress) : isApproach ? approachSample(state.approachPair, state.blend) : isRear ? rearSample(state.rearPair, state.blend) : tween(state), side = height * size, sideX = side / pixelAspect;
    const motion = isComfort ? comfortMotion(state.comfortPose, comfort.info) : null;
    const left = width * x - sideX / 2, floor = motion ? motion.floorOffsets?.[comfortMotionKey(comfortProgress(state.comfortPose), motion)] ?? motion.floorOffset ?? 0 : isInteraction || isAction || isBehavior || isSeat || isRear || isApproach ? 0 : cleanGroundOffset(state, renderMeta), top = height * y - (300 - floor) / 320 * side;
    let feet = [];
    if (contactEnabled && isComfort && state.comfortPose.clip === "carry-trot") {
      const k = comfortMotionKey(state.comfortPose.progress, motion);
      feet = motion.feet[k].map((f) => ({ ...f, episode: `carry/${state.comfortPose.cycle}/${f.id}` }));
      if (state.flip)
        feet = feet.map((p) => ({ ...p, x: 319 - p.x }));
    } else if (contactEnabled && isAction && state.actionName === "walk") {
      const p = paperActionPose("walk", state.actionProgress, actions.info, motionTables?.actionClips);
      feet = walkEpisodes(actions.info.feet[p.pair][Math.round(p.blend * 8)], p.pair, p.blend, state.actionProgress);
      if (state.flip)
        feet = feet.map((p2) => ({ ...p2, x: 319 - p2.x }));
    } else if (contactEnabled && rear && state.state === "run" && !isAction && !isComfort) {
      const b = isBehavior ? paperBehaviorPose(state, behaviors.info) : null;
      feet = isBehavior ? behaviors.info.feet[b.pair][Math.round(b.blend * 8)] : isApproach ? approach.info.feet[state.approachPair][Math.round(state.blend * 8)] : isRear ? rear.info.rearFeet[state.rearPair][Math.round(state.blend * 8)] : rear.info.frontFeet[state.pair]?.[Math.round(state.blend * 16)] ?? [];
      feet = isBehavior ? behaviorEpisodes[state.behavior](feet, b.pair, b.blend, state.behaviorProgress) : isApproach ? sourceEpisodes.approach(feet, state.approachPair, state.blend, state.posePhase ?? state.phase ?? 0) : isRear ? sourceEpisodes.rear(feet, state.rearPair, state.blend, state.posePhase ?? state.phase ?? 0) : sourceEpisodes.front(feet, state.pair, state.blend, state.posePhase ?? state.phase ?? 0);
      if (state.flip)
        feet = feet.map((p) => ({ ...p, x: 319 - p.x }));
    }
    const pins = lock.update(feet, { left, top, side, sideX, groundFromPixel, pixelFromGround, root: { x: state.x, z: state.z, heading: state.heading ?? 0 } }, `${state.view ?? "front"}/${state.flip}/${state.state === "run"}/${state.comfortPose?.clip ?? state.actionName ?? state.behavior ?? "gallop"}`);
    render.lastPins = pins;
    const transport = pawTransport ? createPawTransport(feet, pins, { opaque: (x2, y2) => {
      const rawX = x2 + originX, rawY = y2 + originY;
      if (rawX < 0 || rawX >= sourceN || rawY < 0 || rawY >= sourceN)
        return false;
      let sx = Math.floor(rawX);
      if (state.flip)
        sx = sourceN - 1 - sx;
      return image[(Math.floor(rawY) * sourceN + sx) * 4] > 16;
    } }) : null;
    render.lastTransport = transport;
    const minify = side < 320 || sideX < 320, filter = isAction ? actionArea : area;
    if (minify && !(kernel?.blit && transport))
      filter.prepare(image);
    if (kernel?.clear)
      kernel.clear(out);
    else {
      out.fill(0);
      for (let i = 3;i < out.length; i += 4)
        out[i] = 255;
    }
    render.lastPlacement = { left, top, side, sideX };
    const mouthFamily = isInteraction ? null : isAction ? "actions" : isBehavior ? "behaviors" : isSeat ? state.seatVariant === "arrival" && arrivalSeatSample ? "arrivalSeat" : "seat" : isApproach ? "approach" : null;
    const mouthInfo = { actions: actions?.info, behaviors: behaviors?.info, seat: seat?.info, arrivalSeat: arrivalSeat?.info, approach: approach?.info }[mouthFamily];
    const mouthFrame = mouthFamily ? mouthSourceFrame(mouthFamily, state, mouthInfo) : null;
    render.lastMouth = projectMouth(mouthFamily ? mouthAnchor(mouthFamily, mouthFrame, mouthInfo?.sha256) : null, { left, top, side, sideX }, state.flip, { family: mouthFamily, frame: mouthFrame });
    if (motion?.mouth) {
      const k = comfortMotionKey(state.comfortPose.progress, motion), p = motion.mouth[k];
      render.lastMouth = projectMouth({ x: p[0], y: p[1], scale: 1, score: null }, { left, top, side, sideX }, state.flip, { family: "comfort", frame: motion.frames[k] });
    }
    const drawTop = top - originY / 320 * side, bottom = top + Math.max(sourceN - originY, ...pins.map((p) => p.target.y + 20)) / 320 * side;
    const drawLeft = left + Math.min(-originX, ...pins.map((p) => p.target.x - 20)) / 320 * sideX, drawRight = left + Math.max(sourceN - originX, ...pins.map((p) => p.target.x + 20)) / 320 * sideX;
    if (kernel?.blit && transport)
      kernel.blit(out, image, { width, height, sourceN, left, top, side, sideX, originX, originY, drawTop, bottom, drawLeft, drawRight, flip: state.flip, layers: transport.layers });
    else
      for (let dy2 = Math.max(0, minify ? Math.floor(drawTop) : Math.ceil(drawTop - 0.5));dy2 < Math.min(height, minify ? Math.ceil(bottom) : Math.ceil(bottom - 0.5)); dy2++)
        for (let dx = Math.max(0, minify ? Math.floor(drawLeft) : Math.ceil(drawLeft - 0.5));dx < Math.min(width, minify ? Math.ceil(drawRight) : Math.ceil(drawRight - 0.5)); dx++) {
          const px = (dx + 0.5 - left) / sideX * 320, py = (dy2 + 0.5 - top) / side * 320;
          const warped = transport ? transport(px, py) : footSourcePoint(px, py, pins);
          if (!warped)
            continue;
          const rawX = warped.x + originX, rawY = warped.y + originY;
          let sx = Math.max(0, Math.min(sourceN - 1, Math.floor(rawX)));
          if (state.flip)
            sx = sourceN - 1 - sx;
          const sy = Math.max(0, Math.min(sourceN - 1, Math.floor(rawY))), j = (dy2 * width + dx) * 4, k = (sy * sourceN + sx) * 4;
          out[j] = out[j + 1] = out[j + 2] = minify ? filter.sample(state.flip ? sourceN - rawX : rawX, rawY, 320 / sideX, 320 / side) : rawY < 0 || rawY >= sourceN || rawX < 0 || rawX >= sourceN ? 0 : image[k];
        }
    return out;
  };
  render.report = () => lock.report();
  render.lastPins = [];
  render.lastMouth = null;
  return render;
}

// braille.mjs
var BRAILLE_BITS = [[1, 8], [2, 16], [4, 32], [64, 128]];
var BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
var clamp = (v) => Math.max(0, Math.min(1, v));
var GLYPHS = Array.from({ length: 256 }, (_, i) => String.fromCharCode(10240 + i));
var grayTable = null;
var grayBrightness = 0;
var grayContrast = 0;
function stableBraille(rgba, width, height, brightness, contrast) {
  if (grayBrightness !== brightness || grayContrast !== contrast) {
    grayTable = Float32Array.from({ length: 256 }, (_, v) => {
      const luma = (0.2126 * v + 0.7152 * v + 0.0722 * v) / 255;
      return luma === 0 ? 0 : clamp((Math.pow(luma, 0.9) * brightness - 0.5) * contrast + 0.5);
    });
    grayBrightness = brightness;
    grayContrast = contrast;
  }
  const table = grayTable, bytePixels = rgba instanceof Uint8Array || rgba instanceof Uint8ClampedArray, columns = Math.ceil(width / 2), rows = Math.ceil(height / 4), masks = new Uint8Array(columns * rows);
  let dots = 0;
  for (let y = 0;y < height; y++)
    for (let x = 0, p = y * width * 4;x < width; x++, p += 4) {
      const r = rgba[p], g = rgba[p + 1], b = rgba[p + 2], a = rgba[p + 3];
      if (a === 0 || r === 0 && g === 0 && b === 0)
        continue;
      let value;
      if (bytePixels && a === 255 && r === g && g === b)
        value = table[r];
      else {
        const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 * (a / 255);
        value = Math.fround(luma === 0 ? 0 : clamp((Math.pow(luma, 0.9) * brightness - 0.5) * contrast + 0.5));
      }
      if (value <= 0)
        continue;
      let n = Math.imul(x + 1, 521288629) ^ Math.imul(y + 1, 1597334677);
      n = Math.imul(n ^ n >>> 16, 73244475);
      n = Math.imul(n ^ n >>> 16, 73244475);
      n = (n ^ n >>> 16) >>> 0;
      if (value > (n + 0.5) / 4294967296) {
        masks[(y >> 2) * columns + (x >> 1)] |= BRAILLE_BITS[y & 3][x & 1];
        dots++;
      }
    }
  const lines = new Array(rows), cells = new Array(columns);
  for (let y = 0;y < rows; y++) {
    for (let x = 0;x < columns; x++)
      cells[x] = GLYPHS[masks[y * columns + x]];
    lines[y] = cells.join("");
  }
  return { text: lines.join(`
`), columns, rows, dots };
}
function rgbaToBraille(rgba, width, height, { brightness = 1, contrast = 1, method = "floyd", kernel = null } = {}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 1e6 || rgba.length !== width * height * 4)
    throw Error("Invalid RGBA image");
  if (!Number.isFinite(brightness) || brightness <= 0 || brightness > 4 || !Number.isFinite(contrast) || contrast <= 0 || contrast > 4 || !["floyd", "bayer", "stable"].includes(method))
    throw Error("Invalid dithering options");
  if (method === "stable")
    return kernel?.braille ? kernel.braille(rgba, width, height, brightness, contrast) : stableBraille(rgba, width, height, brightness, contrast);
  const values = new Float32Array(width * height), bits = new Uint8Array(width * height);
  for (let i = 0;i < values.length; i++) {
    const p = i * 4, luma = (0.2126 * rgba[p] + 0.7152 * rgba[p + 1] + 0.0722 * rgba[p + 2]) / 255 * (rgba[p + 3] / 255);
    values[i] = luma === 0 ? 0 : clamp((Math.pow(luma, 0.9) * brightness - 0.5) * contrast + 0.5);
  }
  if (method === "bayer") {
    for (let y = 0;y < height; y++)
      for (let x = 0;x < width; x++)
        bits[y * width + x] = values[y * width + x] > (BAYER[y % 4][x % 4] + 0.5) / 16 ? 1 : 0;
  } else {
    const add = (x, y, error, weight) => {
      if (x >= 0 && x < width && y < height)
        values[y * width + x] += error * weight / 16;
    };
    for (let y = 0;y < height; y++) {
      const direction = y % 2 ? -1 : 1;
      for (let k = 0;k < width; k++) {
        const x = direction === 1 ? k : width - 1 - k, i = y * width + x, old = values[i], value = old >= 0.5 ? 1 : 0, error = old - value;
        bits[i] = value;
        add(x + direction, y, error, 7);
        add(x - direction, y + 1, error, 3);
        add(x, y + 1, error, 5);
        add(x + direction, y + 1, error, 1);
      }
    }
  }
  const columns = Math.ceil(width / 2), rows = Math.ceil(height / 4), lines = [];
  for (let cy = 0;cy < rows; cy++) {
    let line = "";
    for (let cx = 0;cx < columns; cx++) {
      let mask = 0;
      for (let dy2 = 0;dy2 < 4; dy2++)
        for (let dx = 0;dx < 2; dx++) {
          const x = cx * 2 + dx, y = cy * 4 + dy2;
          if (x < width && y < height && bits[y * width + x])
            mask |= BRAILLE_BITS[dy2][dx];
        }
      line += String.fromCodePoint(10240 + mask);
    }
    lines.push(line);
  }
  return { text: lines.join(`
`), columns, rows, dots: bits.reduce((a, b) => a + b, 0) };
}

// puppy-companion-ball.mjs
function createBallPath({ from = { x: 0, z: 0.2 }, landing = { x: 0, z: -4 }, stop = landing, flight = 0.65, peak = 0.75, deceleration = 0.6 } = {}) {
  if (![from.x, from.z, landing.x, landing.z, stop.x, stop.z, flight, peak, deceleration].every(Number.isFinite) || flight < 0 || peak < 0 || deceleration <= 0)
    throw Error("Invalid ball path");
  from = Object.freeze({ ...from });
  landing = Object.freeze({ ...landing });
  stop = Object.freeze({ ...stop });
  const dx = stop.x - landing.x, dz2 = stop.z - landing.z, distance = Math.hypot(dx, dz2), speed = Math.sqrt(2 * deceleration * distance);
  const roll = distance ? planPaperTravel(distance, { speed, startSpeed: speed, acceleration: deceleration, deceleration }) : null;
  const duration = flight + (roll?.duration ?? 0);
  return Object.freeze({
    duration,
    from,
    landing,
    stop,
    at(age) {
      if (!Number.isFinite(age))
        throw Error("Invalid ball age");
      const t = Math.max(0, age);
      if (t < flight) {
        const p = t / flight;
        return { x: from.x + (landing.x - from.x) * p, z: from.z + (landing.z - from.z) * p, height: 4 * peak * p * (1 - p), spin: 0, speed: 0, phase: "flight", settled: false };
      }
      const state = roll?.at(t - flight), ratio = distance ? state.distance / distance : 1;
      return { x: landing.x + dx * ratio, z: landing.z + dz2 * ratio, height: 0, spin: (state?.distance ?? 0) / 0.035, speed: state?.speed ?? 0, phase: t >= duration ? "rest" : "roll", settled: t >= duration };
    }
  });
}
function createFetchPatterns(random, { canTumble = false } = {}) {
  if (typeof random !== "function")
    throw Error("Fetch pattern RNG is required");
  let count = 0, last = null, lastTumble = -4;
  return (allowTumble = canTumble) => {
    if (typeof allowTumble !== "boolean")
      throw Error("Invalid tumble availability");
    count++;
    const weights = { clean: 4, rolling: 3, miss: 2, tumble: canTumble && allowTumble && count >= 4 && count - lastTumble >= 4 ? 0.6 : 0 };
    if (last)
      weights[last] = 0;
    let pattern = "clean";
    if (count > 1) {
      let pick = random() * Object.values(weights).reduce((a, b) => a + b, 0);
      pattern = Object.keys(weights).find((k) => (pick -= weights[k]) < 0) ?? "clean";
    }
    if (pattern === "tumble")
      lastTumble = count;
    last = pattern;
    return pattern;
  };
}

// puppy-companion-life.mjs
var SAFE = new Set(["idle", "down"]);
var FETCH_RETURN_STYLES = Object.freeze(["auto", "brake", "trot", "run-trot"]);
var HOME = { x: 0, z: 0.2 };
var BALL_TARGET = { x: 0, z: -4 };
var OFFER = { x: 0, z: 0.3 };
var TREAT_OFFSET = { z: 0.08, height: 0.25 };
var COOLDOWN = { ball: 6, treat: 15, tug: 20 };
var CARRY_HEIGHT = 0.19;
var SETTLE_FALLBACK = 0.6;
var MAX_DT = 0.25;
var ARRIVE = 0.05;
var BUTTERFLY_RULES = Object.freeze({ firstMin: 240, firstSpread: 240, cooldownMin: 720, cooldownSpread: 480, maxVisible: 18 });
var LABEL = {
  notifyWall: "뒷발로 서서 벽을 박박 긁는 중",
  start: "기다리는 중",
  pause: "잠시 느긋하게 둘러보는 중",
  lie: "엎드리는 중",
  rest: "엎드려 쉬는 중",
  recover: "앉아서 기운 차리는 중",
  sit: "앉는 중",
  watch: "앉아서 지켜보는 중",
  look: "고개를 돌려 살피는 중",
  observe: "가만히 주변 관찰 중",
  stroll: "옆으로 살짝 걸어가는 중",
  sniff: "잠깐 멈춰 주변을 살피는 중",
  dash: "저 멀리 달려가는 중",
  far: "멀리서 둘러보는 중",
  home: "제자리로 돌아오는 중",
  nest: "쉴 자리를 찾아가는 중",
  patrol: "주변을 왕복 산책하는 중",
  scan: "양쪽을 번갈아 살피는 중",
  roll: "느긋하게 뒹구는 중",
  play: "신나서 한 바퀴 도는 중",
  checkin: "가까이 와서 함께 쉬는 중",
  belly: "배를 보이고 발라당 쉬는 중",
  sleep: "새근새근 잠자는 중",
  tug: "장난감을 물고 당기는 중",
  butterflyNotice: "나비를 발견하고 귀를 쫑긋하는 중",
  butterfly: "나비를 폴짝폴짝 쫓는 중",
  butterflyBye: "날아가는 나비를 바라보는 중",
  fetch: "공을 쫓아가는 중",
  miss: "굴러가는 공을 한 번 놓친 중",
  reChase: "공을 다시 쫓아가는 중",
  tumble: "우당탕 균형을 되찾는 중",
  pickup: "공을 무는 중",
  carry: "공을 물고 돌아오는 중",
  drop: "공을 내려놓는 중",
  offer: "공을 내려놓고 기다리는 중",
  treatSit: "간식 앞에 앉는 중",
  chew: "간식 먹는 중",
  notifySit: "확인할 일을 발견하고 앉는 중",
  notifyContact: "확인할 일이 있어 사용자를 바라보는 중",
  notifyCome: "확인할 일을 알려주러 가까이 오는 중",
  notifyPaw: "앞발로 살살 관심을 끄는 중",
  notify: "확인할 일이 있는 쪽을 바라보는 중"
};
var PENDING_LABEL = { treat: "곧 간식", tug: "곧 터그놀이" };
var GESTURE = { "ball-pickup": 0.65, "ball-drop": 0.65, "treat-eat": 2.4 };
var clamp2 = (v, a, b) => Math.min(b, Math.max(a, v));
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = a + 1831565813 >>> 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function createCompanionLife(actor, { seed = 731, energy = 0.8, returnStyle = "auto" } = {}) {
  for (const name of ["update", "sample", "go", "come", "sit", "lie", "look", "walk", "roll", "rest"])
    if (!actor || typeof actor[name] !== "function")
      throw TypeError(`actor.${name} must be a function`);
  if (!Number.isInteger(seed))
    throw TypeError("seed must be an integer");
  if (!Number.isFinite(energy) || energy < 0 || energy > 1)
    throw RangeError("energy must be within 0..1");
  const validateReturnStyle = (style) => {
    if (!FETCH_RETURN_STYLES.includes(style))
      throw RangeError("returnStyle must be auto, brake, trot or run-trot");
    if (["trot", "run-trot"].includes(style) && !actor.canCarryTrot)
      throw Error("Carry-trot artwork is not available");
  };
  validateReturnStyle(returnStyle);
  const rand = mulberry32(seed), range = (a, b) => a + (b - a) * rand(), side = () => rand() < 0.5 ? "left" : "right";
  const spaceRand = mulberry32(seed ^ 682529223), spaceRange = (a, b) => a + (b - a) * spaceRand();
  const toyRand = mulberry32(seed ^ 1820504397), chooseFetch = createFetchPatterns(toyRand, { canTumble: actor.canScramble === true });
  const returnRand = mulberry32(seed ^ 1941741925);
  let lastReturnMode = null;
  let placeSide = spaceRand() < 0.5 ? -1 : 1, outings = 0, nearSeconds = 0, lastCheckin = -Infinity;
  const encounterRand = mulberry32(seed ^ 1274116755), encounterRange = (a, b) => a + (b - a) * encounterRand();
  let nextButterfly = BUTTERFLY_RULES.firstMin + encounterRange(0, BUTTERFLY_RULES.firstSpread), butterfly = null;
  const needs = { energy, social: 0.5, curiosity: 0.5, drowsiness: 0 };
  const cooldowns = { ball: 0, treat: 0, tug: 0 };
  const episodeCooldowns = { roll: 0, play: 0, belly: 0, sleep: 0 };
  let clock = 0, decisions = 0, lastEpisode = null, quiet = 0;
  let queue = [], hold = 0, holdIntent = null, waiting = null, gesture = null;
  let intent = "start", label = LABEL.start, pending = null, active = null, ball = null, treat = null;
  let fetchPlan = null, notice = null, noticeCount = 0;
  const cmd = (name, args, step, when) => ({ cmd: name, args, intent: step, label: LABEL[step], when });
  const wait = (seconds, step) => ({ hold: seconds, intent: step, label: LABEL[step] });
  const play = (clip, step) => ({ hold: GESTURE[clip], gesture: clip, intent: step, label: LABEL[step] });
  const unseated = () => {
    const s2 = actor.sample(clock);
    return !(actor.state === "idle" && s2.seatProgress === 1 && s2.view === "approach" && (s2.seatVariant ?? "default") === "default");
  };
  const seatedAnyVariant = () => {
    const s2 = actor.sample(clock);
    return actor.state === "idle" && s2.seatProgress === 1 && s2.view === "approach";
  };
  const fx = (fn) => ({ fx: fn });
  const home = () => cmd("go", [HOME.x, HOME.z], "home", () => {
    const s2 = actor.sample(clock);
    return Math.hypot(s2.x - HOME.x, s2.z - HOME.z) > ARRIVE;
  });
  const sit = (step) => cmd("sit", [], step, () => !seatedAnyVariant());
  const lie = () => cmd("lie", [], "lie", () => actor.state !== "down");
  const walkTo = (x) => cmd("walk", () => {
    const dx = x - actor.sample(clock).x;
    return [dx < 0 ? "left" : "right", Math.abs(dx)];
  }, "patrol", () => Math.abs(x - actor.sample(clock).x) > 0.002);
  const roomRadius = (z) => Math.max(0.12, paperCameraPoint(0, 0, z).depth * PAPER_SCREEN.widthMeters / (2 * PAPER_SCREEN.viewDistance) - PAPER_CAMERA.canvasMeters / 2);
  const place = (nap) => {
    const bands = [[1.4, 3], [4, 8], [0.7, 1.4], [9, 15]], band = bands[outings++ % bands.length];
    const z = -(nap ? spaceRange(0.7, 2.6) : spaceRange(...band));
    placeSide *= -1;
    return paperGroundTarget(placeSide * roomRadius(z) * spaceRange(0.5, 0.8), z);
  };
  const travelTo = (target, step) => cmd("go", target, step, () => {
    const s2 = actor.sample(clock);
    return Math.hypot(s2.x - target[0], s2.z - target[1]) > 0.12;
  });
  const quietPlace = () => {
    const s2 = actor.sample(clock);
    if (s2.z <= -0.5 && s2.z >= -3.5 && Math.abs(s2.x) > roomRadius(s2.z) * 0.3 && spaceRand() < 0.65)
      return [];
    return [travelTo(place(true), "nest")];
  };
  const butterflyPoint = () => {
    if (!butterfly)
      return null;
    const elapsed = clock - butterfly.since, p = clamp2(elapsed / 0.65, 0, 1), ease = p * p * (3 - 2 * p);
    const leaving = butterfly.leaving ? clamp2((clock - butterfly.leaving) / 1.1, 0, 1) : 0;
    return {
      x: butterfly.from.x + (butterfly.to.x - butterfly.from.x) * ease + 0.025 * Math.sin(elapsed * 5) + leaving * 0.2 * butterfly.side,
      z: butterfly.from.z + (butterfly.to.z - butterfly.from.z) * ease,
      height: 0.45 + 0.045 * Math.sin((clock - butterfly.start) * 6) + leaving * 0.35,
      phase: (clock - butterfly.start) * 5 % 1,
      opacity: 1 - leaving
    };
  };
  const butterflyEpisode = () => {
    const s2 = actor.sample(clock), radius = roomRadius(s2.z);
    const direction = s2.x > radius - 0.3 ? -1 : s2.x < -radius + 0.3 ? 1 : encounterRand() < 0.5 ? -1 : 1;
    const targets = [clamp2(s2.x + direction * 0.36, -radius, radius), clamp2(s2.x - direction * 0.38, -radius, radius), clamp2(s2.x + direction * 0.24, -radius, radius)];
    const z = s2.z;
    const moveFly = (x) => fx(() => {
      const from = butterflyPoint() ?? { x: s2.x - direction * 0.28, z };
      const heading = x < actor.sample(clock).x ? -1 : 1;
      butterfly = { start: butterfly?.start ?? clock, since: clock, from: { x: from.x, z: from.z }, to: { x: x + heading * 0.23, z }, side: heading, leaving: 0 };
    });
    return [
      sit("butterflyNotice"),
      moveFly(targets[0]),
      cmd("look", [direction < 0 ? "right" : "left"], "butterflyNotice"),
      wait(0.8, "butterflyNotice"),
      ...targets.flatMap((x, i) => [...i ? [moveFly(x)] : [], cmd(typeof actor.chase === "function" ? "chase" : "go", [x, z], "butterfly"), wait(0.3, "butterfly")]),
      fx(() => {
        if (butterfly)
          butterfly.leaving = clock;
      }),
      wait(1.1, "butterflyBye"),
      fx(() => {
        butterfly = null;
        needs.energy -= 0.12;
        needs.curiosity -= 0.25;
      }),
      sit("recover"),
      wait(range(3, 6), "recover")
    ];
  };
  const EPISODES = {
    rest: () => [...quietPlace(), lie(), wait(range(10, 18), "rest"), sit("recover"), wait(range(3, 6), "recover")],
    watch: () => [sit("sit"), cmd("look", [side()], "look"), wait(range(3, 9), "watch"), fx(() => {
      needs.social -= 0.3;
      needs.curiosity += 0.1;
    })],
    observe: () => [sit("sit"), cmd("look", [side()], "look"), wait(range(3, 9), "observe"), fx(() => {
      needs.curiosity -= 0.15;
    })],
    stroll: () => [cmd("walk", [side(), range(0.22, 0.5)], "stroll"), wait(range(4, 9), "sniff"), fx(() => {
      needs.energy -= 0.08;
      needs.curiosity -= 0.2;
    })],
    dash: () => [travelTo(place(false), "dash"), sit("far"), wait(range(8, 16), "far"), fx(() => {
      needs.energy -= 0.22;
      needs.curiosity -= 0.3;
    })],
    scan: () => [sit("sit"), cmd("look", ["left"], "scan"), wait(range(0.5, 1.5), "scan"), cmd("look", ["right"], "scan"), wait(range(2, 4), "observe"), fx(() => {
      needs.curiosity -= 0.25;
    })],
    patrol: () => {
      const x = actor.sample(clock).x, d = range(0.16, 0.3) * (rand() < 0.5 ? -1 : 1);
      return [walkTo(x + d), wait(range(0.6, 1.2), "sniff"), walkTo(x - d), wait(range(0.6, 1.2), "sniff"), walkTo(x), wait(range(1, 3), "observe"), fx(() => {
        needs.energy -= 0.1;
        needs.curiosity -= 0.25;
      })];
    },
    roll: () => [lie(), wait(range(0.7, 1.5), "rest"), cmd("roll", [], "roll"), wait(range(2, 5), "watch"), fx(() => {
      needs.energy -= 0.08;
      needs.curiosity -= 0.15;
    })],
    checkin: () => [home(), sit("sit"), cmd("look", [side()], "look"), wait(range(5, 10), "checkin"), fx(() => {
      needs.social -= 0.4;
    })],
    play: () => [cmd("spin", [], "play"), wait(range(1, 2), "pause"), sit("sit"), wait(range(2, 4), "watch"), fx(() => {
      needs.energy -= 0.12;
      needs.curiosity -= 0.2;
    })],
    belly: () => [cmd("belly", [range(5, 9)], "belly"), wait(range(2, 4), "watch"), fx(() => {
      needs.energy += 0.08;
      needs.curiosity -= 0.15;
    })],
    sleep: () => [...quietPlace(), cmd("sleep", [range(65, 110), ["side", "curl", "chin", "belly"][Math.floor(rand() * 4)], rand() < 0.5], "sleep"), wait(range(2, 4), "recover"), fx(() => {
      needs.energy += 0.3;
    })],
    butterfly: butterflyEpisode
  };
  const weights = () => {
    const { energy: e, social: s2, curiosity: c2 } = needs;
    return {
      rest: e < 0.35 ? 6 : (1 - e) * 1.2,
      watch: 0.8 + s2,
      observe: 0.6 + c2 * 0.6,
      stroll: 1.2 * c2 * e,
      dash: e > 0.55 ? 1.2 * e * c2 : 0,
      scan: 0.35 + c2 * 0.4,
      patrol: e > 0.25 ? 0.7 * c2 * e : 0,
      checkin: clock - lastCheckin >= 90 ? 0.25 + s2 * 0.7 : 0,
      roll: episodeCooldowns.roll === 0 && e > 0.45 ? 0.35 * e : 0,
      play: episodeCooldowns.play === 0 && e > 0.6 && typeof actor.spin === "function" ? 0.25 * e * c2 : 0,
      belly: episodeCooldowns.belly === 0 && typeof actor.belly === "function" ? 0.35 : 0,
      sleep: episodeCooldowns.sleep === 0 && typeof actor.sleep === "function" ? e < 0.4 ? 3 : 0.2 : 0
    };
  };
  function decide() {
    const w = weights();
    if (lastEpisode)
      w[lastEpisode] = 0;
    const kinds = Object.keys(w), total = kinds.reduce((sum, k) => sum + w[k], 0);
    let pick = rand() * total, kind = kinds.find((k) => (pick -= w[k]) < 0) ?? "observe";
    if (nearSeconds >= 40 && needs.energy > 0.4 && lastEpisode !== "dash")
      kind = "dash";
    if (quiet >= 120 && needs.drowsiness >= 0.35 && episodeCooldowns.sleep === 0 && lastEpisode !== "sleep" && typeof actor.sleep === "function")
      kind = "sleep";
    const position = actor.sample(clock);
    if (kind !== "sleep" && clock >= nextButterfly && quiet >= 15 && needs.energy > 0.6 && needs.drowsiness < 0.35 && position.z > -1.2) {
      kind = "butterfly";
      nextButterfly = clock + BUTTERFLY_RULES.cooldownMin + encounterRange(0, BUTTERFLY_RULES.cooldownSpread);
    }
    lastEpisode = kind;
    decisions++;
    if (kind === "checkin")
      lastCheckin = clock;
    if (kind === "roll")
      episodeCooldowns.roll = 90;
    if (kind === "play")
      episodeCooldowns.play = 120;
    if (kind === "belly")
      episodeCooldowns.belly = 80;
    if (kind === "sleep")
      episodeCooldowns.sleep = 100;
    queue = [wait(range(3, 9), "pause"), ...EPISODES[kind]()];
  }
  const landed = () => ball?.mode === "flight" && ball.path.at(clock - ball.start).settled;
  const arrived = () => {
    const s2 = actor.sample(clock), target = fetchPlan.pickupRoot;
    return SAFE.has(actor.state) && Math.hypot(s2.x - target.x, s2.z - target.z) < ARRIVE;
  };
  const fetchGo = typeof actor.chase === "function" ? "chase" : "go";
  const directionalPickup = () => {
    const s2 = actor.sample(clock);
    return actor.canPickup === true && (s2.seatProgress ?? 0) === 0 && ["rear", "front"].includes(s2.view);
  };
  const BALL_STEPS = () => [
    cmd(fetchGo, [fetchPlan.first.x, fetchPlan.first.z, { scramble: fetchPlan.pattern === "tumble" }], "fetch"),
    ...fetchPlan.pattern === "miss" ? [wait(0.12, "miss"), cmd(fetchGo, [fetchPlan.pickupRoot.x, fetchPlan.pickupRoot.z], "reChase")] : [],
    ...fetchPlan.pattern === "tumble" && !actor.canSinglePassScramble ? [...actor.canMovingScramble ? [] : [cmd("scramble", [], "tumble")], cmd(fetchGo, [fetchPlan.pickupRoot.x, fetchPlan.pickupRoot.z], "reChase")] : [],
    { until: () => landed() && arrived() },
    fx(() => {
      ball = { mode: "ground", ...fetchPlan.stop };
    }),
    cmd("pickup", [], "pickup", directionalPickup),
    cmd("sit", [{ urgent: true }], "pickup", () => !directionalPickup() && unseated()),
    { ...play("ball-pickup", "pickup"), when: () => !directionalPickup() },
    fx(() => {
      ball = { mode: "carried" };
    }),
    cmd(fetchGo, [HOME.x, HOME.z, { returnMode: fetchPlan.returnMode }], "carry"),
    cmd("sit", [{ urgent: true }], "drop", unseated),
    play("ball-drop", "drop"),
    fx(() => {
      ball = { mode: "dropped", start: clock, path: createBallPath({ from: OFFER, landing: OFFER, stop: { x: OFFER.x + 0.035, z: OFFER.z + 0.06 }, flight: 0, peak: 0, deceleration: 0.2 }) };
      needs.social -= 0.4;
    }),
    wait(3, "offer"),
    fx(() => {
      ball = null;
      fetchPlan = null;
    })
  ];
  const TREAT_STEPS = () => [
    fx(() => {
      treat = true;
    }),
    cmd("sit", [], "treatSit", () => !seatedAnyVariant()),
    play("treat-eat", "chew"),
    fx(() => {
      treat = null;
      needs.energy += 0.25;
      needs.social -= 0.3;
    })
  ];
  const TUG_STEPS = () => [
    cmd("sit", [], "tug", unseated),
    cmd("tug", [6], "tug"),
    wait(0.5, "watch"),
    fx(() => {
      needs.energy -= 0.12;
      needs.social -= 0.4;
    })
  ];
  function startInteraction() {
    active = pending;
    pending = null;
    decisions++;
    hold = 0;
    queue = active === "ball" ? BALL_STEPS() : active === "tug" ? TUG_STEPS() : TREAT_STEPS();
  }
  function finishInteraction() {
    cooldowns[active] = COOLDOWN[active];
    if (active === "ball")
      lastCheckin = clock;
    active = null;
  }
  function drift(dt) {
    const resting = holdIntent === "rest" || holdIntent === "recover" || actor.state === "sleep" || intent === "belly";
    needs.energy += resting ? 0.04 * dt : -0.004 * dt;
    const asleep = actor.state === "sleep";
    if (!active && !pending && !asleep) {
      const position = actor.sample(clock);
      nearSeconds = position.z > -0.5 && Math.abs(position.x) < 0.32 ? nearSeconds + dt : 0;
    } else
      nearSeconds = 0;
    needs.drowsiness += asleep ? -dt / 60 : dt / 240;
    quiet = active || pending || asleep ? 0 : quiet + dt;
    if (!active) {
      needs.curiosity += 0.01 * dt;
      needs.social += 0.008 * dt;
    }
    for (const k in needs)
      needs[k] = clamp2(needs[k], 0, 1);
  }
  function update(dt) {
    if (typeof dt !== "number" || !Number.isFinite(dt) || dt < 0)
      throw RangeError("dt must be a finite non-negative number");
    dt = Math.min(dt, MAX_DT);
    clock += dt;
    for (const k in cooldowns)
      cooldowns[k] = Math.max(0, cooldowns[k] - dt);
    for (const k in episodeCooldowns)
      episodeCooldowns[k] = Math.max(0, episodeCooldowns[k] - dt);
    drift(dt);
    if (butterfly && clock - butterfly.start > BUTTERFLY_RULES.maxVisible) {
      butterfly = null;
      queue = [sit("recover"), wait(3, "recover")];
      hold = 0;
      holdIntent = null;
      gesture = null;
      waiting = null;
      actor.rest();
    }
    const safe = SAFE.has(actor.state);
    if (waiting) {
      waiting.age += dt;
      if (!safe)
        waiting.left = true;
      if (!safe || !waiting.left && waiting.age < SETTLE_FALLBACK)
        return;
      waiting = null;
    }
    if (hold > 0) {
      hold -= dt;
      if (gesture)
        gesture.elapsed += dt;
      if (pending && !active && safe)
        hold = 0;
      if (hold > 0)
        return;
    }
    holdIntent = null;
    gesture = null;
    if (!safe)
      return;
    if (pending && !active)
      startInteraction();
    if (notice?.phase === "queued" && !active && !pending) {
      notice.phase = "showing";
      const far = () => {
        const s2 = actor.sample(clock);
        return Math.hypot(s2.x - HOME.x, s2.z - HOME.z) > 0.8;
      };
      queue = [
        sit("notifySit"),
        wait(0.45, "notifyContact"),
        fx(() => {
          if (far())
            notice.phase = "approaching";
        }),
        cmd("go", [HOME.x, HOME.z], "notifyCome", far),
        sit("notifySit"),
        fx(() => {
          notice.phase = "showing";
        }),
        wait(0.6, "notifyContact"),
        ...notice.gesture === "wall" ? [cmd("attentionWall", [], "notifyWall"), wait(0.3, "notifyContact")] : actor.canAttentionPaw ? [cmd("attentionPaw", [], "notifyPaw"), wait(0.3, "notifyContact")] : [],
        cmd("look", [notice.side], "notify"),
        wait(2.5, "notify"),
        fx(() => {
          notice = null;
        })
      ];
    }
    for (;; ) {
      if (!queue.length) {
        if (active) {
          finishInteraction();
          if (pending)
            startInteraction();
          else
            decide();
        } else
          decide();
      }
      const step = queue.shift();
      if (step.fx) {
        step.fx();
        for (const k in needs)
          needs[k] = clamp2(needs[k], 0, 1);
        continue;
      }
      if (step.until) {
        if (step.until())
          continue;
        queue.unshift(step);
        return;
      }
      if (step.when && !step.when())
        continue;
      intent = step.intent;
      label = step.label;
      if (step.hold !== undefined) {
        hold = step.hold;
        holdIntent = step.intent;
        if (step.gesture)
          gesture = { clip: step.gesture, duration: step.hold, elapsed: 0 };
        return;
      }
      if (actor[step.cmd](...typeof step.args === "function" ? step.args() : step.args) !== false)
        waiting = { age: 0, left: false };
      return;
    }
  }
  function interact(kind) {
    if (!["ball", "treat", "tug"].includes(kind))
      return false;
    if (kind === "tug" && typeof actor.tug !== "function")
      return false;
    if (pending || active || cooldowns[kind] > 0)
      return false;
    clearNotice();
    quiet = 0;
    if (butterfly || lastEpisode === "butterfly") {
      butterfly = null;
      queue = [];
      hold = 0;
      holdIntent = null;
      gesture = null;
      waiting = null;
    }
    if (kind === "treat" || kind === "tug") {
      pending = kind;
      queue = [];
      hold = 0;
      holdIntent = null;
      gesture = null;
      waiting = null;
      if (kind === "treat")
        treat = true;
      if (typeof actor.attend === "function")
        actor.attend();
      else if (["sleep", "belly"].includes(actor.sample(clock).state))
        actor.sit();
      return true;
    }
    const throwPosition = actor.sample(clock), pattern = chooseFetch(throwPosition.z >= -1.09);
    const landing = { ...BALL_TARGET }, stop = { ...BALL_TARGET };
    if (pattern !== "clean")
      stop.z -= 2.5 + toyRand() * 2;
    let first = pattern === "miss" ? { ...landing } : { ...stop };
    if (pattern === "tumble") {
      if (actor.canSinglePassScramble) {
        Object.assign(landing, { x: throwPosition.x, z: throwPosition.z - 1.15 });
        Object.assign(stop, { x: throwPosition.x, z: landing.z - 1.1 });
        first = { ...stop };
      } else {
        const sign = throwPosition.x > 0.1 ? -1 : throwPosition.x < -0.1 ? 1 : toyRand() < 0.5 ? -1 : 1, z = -1.25, radius = roomRadius(z);
        Object.assign(landing, { x: sign * radius * 0.1, z });
        Object.assign(stop, { x: sign * radius * 0.28, z });
        first = { x: sign * radius * 0.75, z };
      }
    }
    let pickupRoot = { ...stop };
    if (actor.canPickup === true) {
      const from = Math.hypot(first.x - stop.x, first.z - stop.z) < 0.000001 ? throwPosition : first, dx = stop.x - from.x, dz2 = stop.z - from.z, d = Math.hypot(dx, dz2);
      if (d > 0.001) {
        const target = paperGroundTarget(stop.x - dx / d * 0.17, stop.z - dz2 / d * 0.17);
        pickupRoot = { x: target[0], z: target[1] };
      }
      if (pattern === "clean" || pattern === "rolling" || pattern === "tumble" && actor.canSinglePassScramble)
        first = { ...pickupRoot };
    }
    const returns = actor.canCarryTrot ? FETCH_RETURN_STYLES.slice(1).filter((mode) => mode !== lastReturnMode) : ["brake"];
    const returnMode = returnStyle === "auto" ? returns[Math.floor(returnRand() * returns.length)] : returnStyle;
    lastReturnMode = returnMode;
    fetchPlan = { pattern, stop, first, pickupRoot, returnMode };
    active = "ball";
    decisions++;
    ball = { mode: "flight", start: clock, path: createBallPath({ landing, stop }) };
    queue = BALL_STEPS();
    hold = 0;
    holdIntent = null;
    gesture = null;
    waiting = null;
    intent = "fetch";
    label = LABEL.fetch;
    const urgent = typeof actor.chase === "function";
    if ((urgent || SAFE.has(actor.state)) && actor[urgent ? "chase" : "go"](first.x, first.z, { scramble: pattern === "tumble" }) !== false)
      queue.shift();
    return true;
  }
  function clearNotice() {
    if (!notice)
      return;
    const approaching = notice.phase === "approaching";
    notice = null;
    queue = [];
    hold = 0;
    holdIntent = null;
    gesture = null;
    waiting = null;
    intent = "recover";
    label = LABEL.recover;
    if (approaching || actor.state === "attention-paw" || actor.state === "attention-wall")
      actor.attend?.();
  }
  function notify({ kind, side: side2 = "left", gesture: gesture2 = "auto" } = {}) {
    if (!["approval", "input"].includes(kind) || !["left", "right"].includes(side2) || !["auto", "paw", "wall"].includes(gesture2))
      throw Error("Invalid pet notice");
    if (active || pending || notice)
      return false;
    if (gesture2 === "wall" && !actor.canAttentionWall)
      return false;
    const selected = gesture2 === "auto" ? actor.canAttentionWall && noticeCount % 2 === 1 ? "wall" : "paw" : gesture2;
    noticeCount++;
    notice = { kind, side: side2, gesture: selected, phase: "queued" };
    butterfly = null;
    queue = [];
    hold = 0;
    holdIntent = null;
    gesture2 = null;
    waiting = null;
    actor.attend?.();
    return true;
  }
  function treatReport() {
    if (!treat)
      return null;
    const s2 = actor.sample(clock);
    return { x: s2.x, z: s2.z + TREAT_OFFSET.z, height: TREAT_OFFSET.height };
  }
  function ballReport() {
    if (!ball)
      return null;
    const pose = actor.sample(clock);
    if (pose.state === "pickup" && pose.view === "rear")
      return null;
    if (pose.state === "pickup" && pose.comfortPose?.progress >= 0.5)
      return { x: pose.x, z: pose.z, height: CARRY_HEIGHT, carried: true };
    if (ball.mode === "flight" || ball.mode === "dropped")
      return { ...ball.path.at(clock - ball.start), carried: false };
    if (ball.mode === "carried") {
      const s2 = actor.sample(clock);
      return { x: s2.x, z: s2.z, height: CARRY_HEIGHT, carried: true };
    }
    return { x: ball.x, z: ball.z, height: 0, carried: false };
  }
  return {
    update,
    interact,
    notify,
    clearNotice,
    setReturnStyle(style) {
      validateReturnStyle(style);
      returnStyle = style;
      return style;
    },
    get report() {
      const interaction = active ?? pending;
      return {
        intent: actor.state === "scramble" && fetchPlan ? "tumble" : intent,
        label: pending ? `${label} · ${PENDING_LABEL[pending]}` : actor.state === "scramble" && fetchPlan ? LABEL.tumble : label,
        episode: lastEpisode,
        interaction,
        busy: interaction !== null,
        ball: ballReport(),
        fetchPattern: fetchPlan?.pattern ?? null,
        returnStyle,
        returnMode: fetchPlan?.returnMode ?? null,
        treat: treatReport(),
        butterfly: butterflyPoint(),
        tug: actor.state === "tug" ? { progress: actor.sample(clock).comfortPose?.progress ?? 0, grip: 1 } : null,
        attention: notice ? { ...notice } : null,
        snore: actor.state === "sleep" ? clock % 3.6 / 3.6 : null,
        energy: needs.energy,
        drowsiness: needs.drowsiness,
        decisions,
        cooldowns: { ...cooldowns },
        gesture: gesture && SAFE.has(actor.state) ? { clip: gesture.clip, progress: clamp2(gesture.elapsed / gesture.duration, 0, 1) } : null
      };
    }
  };
}

// puppy-companion-objects.mjs
function paintCompanionObjects(pixels, width, height, projection, report, state, mouth = null) {
  const objects = [];
  if (report.gesture)
    return pixels;
  if (report.butterfly) {
    const b = report.butterfly, p = projection.project(b.x, b.height, b.z);
    const edge = projection.project(b.x + 0.04, b.height, b.z), up = projection.project(b.x, b.height + 0.035, b.z);
    const cx = p.x * width, cy = p.y * height, rx = Math.abs(edge.x - p.x) * width, ry = Math.abs(up.y - p.y) * height;
    const opening = 0.22 + 0.78 * Math.abs(Math.sin(b.phase * Math.PI)), tone = Math.round(235 * b.opacity);
    if ([cx, cy, rx, ry, opening, tone].every(Number.isFinite) && rx > 0 && ry > 0 && tone > 0)
      for (let y = Math.max(0, Math.floor(cy - ry));y < Math.min(height, Math.ceil(cy + ry)); y++)
        for (let x = Math.max(0, Math.floor(cx - rx));x < Math.min(width, Math.ceil(cx + rx)); x++) {
          const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry, a = Math.abs(u) / opening;
          const wing = ((a - 0.5) / 0.44) ** 2 + ((v + 0.28) / 0.56) ** 2 < 1 || ((a - 0.36) / 0.29) ** 2 + ((v - 0.43) / 0.37) ** 2 < 1;
          const body = Math.abs(u) < 0.1 && Math.abs(v) < 0.7;
          if (wing || body) {
            const j = (y * width + x) * 4;
            pixels[j] = pixels[j + 1] = pixels[j + 2] = Math.max(pixels[j], body ? tone : Math.round(tone * (0.65 + 0.35 * a)));
          }
        }
  }
  if (Number.isFinite(report.snore) && state.state === "sleep") {
    const placement = projection.placement(state.x, state.z), side = height * placement.size, sideX = side / placement.pixelAspect;
    const left = width * placement.x - sideX / 2, top = height * placement.y - 300 / 320 * side;
    const cycle = report.snore, tone = Math.round(140 * Math.sin(Math.PI * cycle)), unit = Math.max(1, Math.round(side / 160));
    const cx = Math.round(left + 220 / 320 * sideX), cy = Math.round(top + (210 - 16 * cycle) / 320 * side);
    if (tone > 12)
      for (const [gx, gy] of [[0, 0], [1, 0], [2, 0], [1, 1], [0, 2], [1, 2], [2, 2]])
        for (let dy2 = 0;dy2 < unit; dy2++)
          for (let dx = 0;dx < unit; dx++) {
            const x = cx + gx * unit + dx, y = cy + gy * unit + dy2;
            if (x < 0 || x >= width || y < 0 || y >= height)
              continue;
            const j = (y * width + x) * 4;
            pixels[j] = pixels[j + 1] = pixels[j + 2] = Math.max(pixels[j], tone);
          }
  }
  if (report.ball?.carried) {
    if (mouth && [mouth.x, mouth.y, mouth.rx, mouth.ry].every(Number.isFinite) && mouth.rx > 0 && mouth.ry > 0)
      objects.push({ kind: "ball", screen: mouth });
  } else if (report.ball)
    objects.push({ ...report.ball, radius: 0.035, kind: "ball" });
  if (report.treat)
    objects.push({ ...report.treat, height: report.treat.height ?? 0.018, radius: 0.022, kind: "treat" });
  for (const o of objects) {
    let cx, cy, rx, ry;
    if (o.screen)
      ({ x: cx, y: cy, rx, ry } = o.screen);
    else {
      const p = projection.project(o.x, o.height ?? 0, o.z), edge = projection.project(o.x + o.radius, o.height ?? 0, o.z);
      cx = p.x * width;
      cy = p.y * height;
      rx = Math.abs(edge.x - p.x) * width;
      const up = projection.project(o.x, (o.height ?? 0) + o.radius, o.z);
      ry = Math.abs(up.y - p.y) * height;
    }
    if (![cx, cy, rx, ry].every(Number.isFinite) || rx <= 0 || ry <= 0)
      continue;
    const spin = o.spin ?? 0, cos = Math.cos(spin), sin = Math.sin(spin);
    for (let y = Math.max(0, Math.floor(cy - ry));y < Math.min(height, Math.ceil(cy + ry)); y++)
      for (let x = Math.max(0, Math.floor(cx - rx));x < Math.min(width, Math.ceil(cx + rx)); x++) {
        const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry;
        if (u * u + v * v > 1)
          continue;
        const stripe = v * cos + u * sin + 0.25 * (u * cos - v * sin);
        const tone = o.kind === "treat" ? (x + y) % 3 ? 190 : 85 : Math.abs(stripe) < 0.18 ? 85 : 225;
        const j = (y * width + x) * 4;
        pixels[j] = pixels[j + 1] = pixels[j + 2] = tone;
      }
  }
  return pixels;
}

// retrieviewer.mjs
init_puppy_frame_store();
init_puppy_frame_indexed();

// puppy-motion-tables.generated.mjs
var freeze = (v) => {
  if (v && typeof v === "object") {
    for (const x of Object.values(v))
      freeze(x);
    Object.freeze(v);
  }
  return v;
};
var BAKED_MOTION = freeze({ version: 1, sources: { "puppy-stride-meta.json": "30fd474f3ed9337851b2071037d88d60b37cb2bb1c12d48b28c34ebc126b7e3a", "puppy-paper-rear-gallop.json": "fe9b1bf0b88f2a366f28deee6cb63964b8a94d6faa99b111524112832e80705d", "puppy-paper-approach.json": "e7e02589622cecde679de79bb79c71b77494fd2fd850793c2fba9754b46aa474", "puppy-paper-actions-v9.json": "38b35496c552443c7ea99beceac3cd25c670bc91836b22509b1cc97da3d0a9de", "puppy-paper-behaviors.json": "67d8633bc61a2d1c46206969b9aeaaf30073fcc0f0ae7dc9954957d5522edb32", "puppy-companion-comfort.json": "23ed137983ce5a653936a829932f41a16099378d7c0ad99b3f51a2e6091fc6bf", "puppy-paper-actions-v9-q5.bin.gz": "abb4677468206c62937c0247dc4c5823e0a7c4a3a197da40194a08dd594aeef9", "puppy-paper-rear-gallop-q5.bin.gz": "ca731e1979a37ec2e005a80365e3b58358f640b8b26e7036b0e931940a7b1264", "puppy-companion-comfort-q5.bin.gz": "57942c55e9c467d973a08f1e23804b0f756eaed46dddfe3aba7e7c3621996236", "puppy-paper-arrival-seat-q5.bin.gz": "7effa0a2150e8ef9ed37d5b6cb10089672e0ce32599c06db21ad4769144bf246", "puppy-paper-seat-q5.bin.gz": "5480c994de0d034d70eff6ea86095f3722cf87bde72f364dd369b94b1ad66f84", "puppy-paper-behaviors-q5.bin.gz": "e4b79387aca974ceec74a02dc3f02780eb53d38af6ec9ebd69994de744b39716" }, support: { front: { step: 16, period: 128, cyclic: true, offsets: { "0": 0, "1": 16, "2": 32, "3": 48, "4": 64, "5": 80, "6": 96, "7": 112 }, starts: { "hind-near": [123, 123, 123, 123, 123, 123, 123, 123, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 123, 123, 123, 123, 123], "fore-far": [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 75, 75, 75, 75, 75, 75, 75, 75, 75, 75, 75, 75, 75, 75, 75, 75, 75, 75, 75, 75, 75, 75, 75, 75, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1], "fore-near": [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 75, 75, 75, 75, 75, 75, 75, 75, 75, 75, 75, 75, 75, 75, 75, 75, 75, 75, 75, 75, 75, 75, 75, 75, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1], "hind-far": [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1] } }, rear: { step: 8, period: 64, cyclic: true, offsets: { "5": 0, "6": 8, "7": 16, "8": 24, "9": 32, "10": 40, "11": 48, "12": 56 }, starts: { "hind-far": [60, 60, 60, 60, 60, 60, 60, 60, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 60, 60, 60, 60], "hind-near": [62, 62, 62, 62, 62, 62, 62, 62, 62, 62, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 62, 62] } }, approach: { step: 8, period: 64, cyclic: true, offsets: { "5": 0, "6": 8, "7": 16, "8": 24, "9": 32, "10": 40, "11": 48, "12": 56 }, starts: { "fore-left": [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 39, 39, 39, 39, 39, 39, -1, -1, -1, -1, -1, -1, -1, -1, -1, 54, 54, 54, 54, 54, -1, -1, -1, -1, -1], "fore-right": [61, 61, 61, 61, 61, 61, 61, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 31, 31, 31, 31, 31, 31, 31, 31, 31, 31, 31, 31, 31, 31, 31, 31, 31, 31, 31, 31, -1, -1, -1, -1, 55, 55, 55, 55, 55, -1, 61, 61, 61] } }, walk: { step: 8, period: 64, cyclic: true, offsets: { "42": 0, "43": 8, "44": 16, "45": 24, "46": 32, "47": 40, "48": 48, "49": 56 }, starts: { "hind-far": [52, 52, 52, 52, 52, 52, 52, 52, 52, 52, 52, 52, 52, 52, 52, 52, 52, 52, 52, 52, 52, 52, 52, 52, 52, 52, 52, 52, 52, 52, 52, 52, 52, 52, 52, 52, 52, 52, 52, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 52, 52, 52, 52, 52, 52, 52, 52, 52, 52, 52, 52], "hind-near": [58, 58, 58, 58, 58, 58, 58, 58, 58, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 58, 58, 58, 58, 58, 58], "fore-far": [-1, -1, -1, 3, 3, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 21, 21, 21, 21, 21, -1, -1, -1, -1, -1, 31, 31, 31, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 47, 47, 47, 47, 47, -1, -1, -1, -1, -1, -1, -1, 59, 59, 59, -1, -1], "fore-near": [-1, -1, -1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, -1, -1, -1, -1, -1, -1, -1, 33, -1, -1, -1, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, -1, -1] } }, "behavior/walk": { step: 8, period: 32, cyclic: true, offsets: { "0": 0, "1": 8, "2": 16, "3": 24 }, starts: { "fore-left": [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 24, 24, -1, -1, -1, -1, -1, -1], "fore-right": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1] } }, "behavior/walk-enter": { step: 8, period: 8, cyclic: false, offsets: { "4": 0 }, starts: { "fore-left": [-1, -1, -1, -1, -1, -1, -1, -1, -1], "fore-right": [-1, -1, -1, -1, 4, 4, 4, 4, 4] } }, "behavior/brake": { step: 8, period: 32, cyclic: false, offsets: { "5": 0, "6": 8, "7": 16, "8": 24 }, starts: { "fore-left": [-1, -1, -1, -1, -1, -1, -1, -1, -1, 9, 9, 9, 9, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23], "fore-right": [0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 15, 15, 15, 15, 15, 15, 15, 15, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1] } }, "behavior/finish": { step: 8, period: 8, cyclic: false, offsets: { "9": 0 }, starts: {} }, "behavior/watch-left": { step: 8, period: 16, cyclic: false, offsets: { "10": 0, "11": 8 }, starts: {} }, "behavior/watch-right": { step: 8, period: 16, cyclic: false, offsets: { "12": 0, "13": 8 }, starts: {} }, "behavior/rest": { step: 8, period: 32, cyclic: false, offsets: { "14": 0, "15": 8, "16": 16, "17": 24 }, starts: {} } }, actionClips: { spin: { list: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], weights: [1.1168, 0.8052, 0.827, 0.7936, 1.3421, 1.4204, 0.9015, 0.5275, 1.1081, 0.7701, 0.723, 1.0494, 1.4422, 1.3325, 1.0787, 0.8964, 0.8655], total: 17 }, roll: { list: [17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40], weights: [1.122, 1.4089, 1.6479, 0.6752, 0.753, 0.8756, 0.9957, 0.9586, 0.7325, 0.8218, 1.0968, 0.9962, 0.8959, 0.6589, 1.0191, 0.8352, 0.4557, 1.1818, 1.1101, 0.905, 0.6752, 1.6479, 1.4089, 1.122], total: 23.9999 }, "roll-down": { list: [19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40], weights: [1.6886, 0.6919, 0.7717, 0.8973, 1.0203, 0.9823, 0.7506, 0.8422, 1.124, 1.0208, 0.918, 0.6752, 1.0443, 0.8559, 0.467, 1.211, 1.1376, 0.9274, 0.6919, 1.6886, 1.4438, 1.1498], total: 22.0002 }, "lie-down": { list: [17, 18], weights: [0.8866, 1.1134], total: 2 }, "lie-up": { list: [39, 40], weights: [1.1134, 0.8866], total: 2 }, "walk-enter": { list: [41], weights: [1], total: 1 }, walk: { list: [42, 43, 44, 45, 46, 47, 48, 49], weights: [1, 1, 1, 1, 1, 1, 1, 1], total: 8 }, "walk-exit": { list: [50], weights: [1], total: 1 }, "walk-face-front": { list: [51], weights: [1], total: 1 }, "walk-face-rear": { list: [52], weights: [1], total: 1 }, "walk-turn": { list: [53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65], weights: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], total: 13 } }, routes: { maxPreparationSpeed: 0.00000001, steps: [["ready"], ["turn", true], ["view-turn", "rear"], ["view-turn", "approach"], ["turn", false], ["view-turn", "front"], ["rise"], ["sit-down"]], direction: [0, 1, 2, 2, 3, 3, 4, 0, 2, 2, 3, 3, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0], action: [0, 3, 6, 3, 6, 3, 4, 4, 6, 4, 6, 4, 5, 5, 6, 5, 6, 5, 5, 5, 6, 5, 6, 5, 5, 7, 6, 7, 6, 0, 5, 5, 6, 5, 6, 5] }, joins: { "walk-enter/walk": { from: ["puppy-paper-actions-v9", 377], to: ["puppy-paper-actions-v9", 378], poseSha256: "81361614df56226b64be437f189c2e135c13498324286880db0fc06c5df3e86a", view: "front", speed: [0, 0], supportEvidence: "shared-pixels-with-labeled-walk-pose", supports: ["hind-far", "hind-near"], phase: 0 }, "walk/walk-exit": { from: ["puppy-paper-actions-v9", 449], to: ["puppy-paper-actions-v9", 450], poseSha256: "81361614df56226b64be437f189c2e135c13498324286880db0fc06c5df3e86a", view: "front", speed: [0, 0], supportEvidence: "shared-pixels-with-labeled-walk-pose", supports: ["hind-far", "hind-near"], phase: 0 }, "rear-run/scramble": { from: ["puppy-paper-rear-gallop", 63], to: ["puppy-companion-comfort", 25], poseSha256: "fa79a8762b57c0d5b70586a687f10e4a313e227e11e2435f6d7af0cd0866cc83", view: "rear", phase: 0.25, speed: [0, 4.556913271064087], positiveSpeed: true, matchVelocity: true, supports: [], supportEvidence: "source-paw-proxies", airborne: true }, "scramble/pickup-rear": { from: ["puppy-companion-comfort", 36], to: ["puppy-companion-comfort", 13], poseSha256: "8192c504552a3984c80e1c3216e134605d4a930ec14cd7f778036e629e334601", view: "rear", speed: [0, 0], supports: ["hind-far", "hind-near"], supportEvidence: "shared-pixels-with-labeled-rear-pose" }, "carry-settle/arrival-seat": { from: ["puppy-companion-comfort", 44], to: ["puppy-paper-arrival-seat", 0], poseSha256: "5ccf5acd9ca9ea81a0c9fc59d1ab2a2ddab148c942e31009f1a4c18de347fae8", view: "approach", speed: [0, 0], supportEvidence: "shared-pose-only" }, "tug/seat": { from: ["puppy-companion-comfort", 0], to: ["puppy-paper-seat", 50], poseSha256: "19f89a8bcb5a937e528593a8f36db846a0d45a5ee398f1b0873c056e5be2fa0a", view: "approach", speed: [0, 0], supportEvidence: "shared-pose-only" }, "watch-90/seat": { from: ["puppy-paper-behaviors", 90], to: ["puppy-paper-seat", 50], poseSha256: "19f89a8bcb5a937e528593a8f36db846a0d45a5ee398f1b0873c056e5be2fa0a", view: "approach", speed: [0, 0], supportEvidence: "shared-pose-only" }, "watch-107/seat": { from: ["puppy-paper-behaviors", 107], to: ["puppy-paper-seat", 50], poseSha256: "19f89a8bcb5a937e528593a8f36db846a0d45a5ee398f1b0873c056e5be2fa0a", view: "approach", speed: [0, 0], supportEvidence: "shared-pose-only" }, "watch-108/seat": { from: ["puppy-paper-behaviors", 108], to: ["puppy-paper-seat", 50], poseSha256: "19f89a8bcb5a937e528593a8f36db846a0d45a5ee398f1b0873c056e5be2fa0a", view: "approach", speed: [0, 0], supportEvidence: "shared-pose-only" }, "watch-125/seat": { from: ["puppy-paper-behaviors", 125], to: ["puppy-paper-seat", 50], poseSha256: "19f89a8bcb5a937e528593a8f36db846a0d45a5ee398f1b0873c056e5be2fa0a", view: "approach", speed: [0, 0], supportEvidence: "shared-pose-only" } } });

// retrieviewer.mjs
var STEP_SECONDS = 1 / 60;
var MAX_CATCH_UP_SECONDS = 0.1;
var INTERACTIONS = Object.freeze(["ball", "treat", "tug"]);
var DEFAULT_ART_PROFILE = "q5";
var ART_PROFILES = Object.freeze(["original", "q5"]);
var PET_ASSETS = Object.freeze({
  animal: "locomotion-puppy.animal",
  stride: "puppy-stride-tweens-q5.rvz",
  strideInfo: "puppy-stride-meta.json",
  stableInfo: "puppy-stable-meta.json",
  rear: "puppy-paper-rear-gallop",
  approach: "puppy-paper-approach",
  seat: "puppy-paper-seat",
  arrivalSeat: "puppy-paper-arrival-seat",
  behaviors: "puppy-paper-behaviors",
  actions: "puppy-paper-actions-v9",
  interactions: "puppy-companion-interactions-v3",
  comfort: "puppy-companion-comfort"
});
var BUNDLES = ["rear", "approach", "seat", "arrivalSeat", "behaviors", "actions", "interactions", "comfort"];
async function defaultLoadAsset(name) {
  const url = new URL(name, import.meta.url);
  if (url.protocol === "file:") {
    const { readFile } = await import("node:fs/promises");
    try {
      return await readFile(url);
    } catch (error) {
      if (error.code === "ENOENT" && name.endsWith("-compact.bin.gz"))
        throw Error("Original art is optional and not bundled. Supply the preserved original assets with loadAsset, or use the default q5 profile.", { cause: error });
      throw error;
    }
  }
  const r = await fetch(url);
  if (!r.ok)
    throw Error(`${name} HTTP ${r.status}`);
  return r.arrayBuffer();
}
var sharedAssets = new Map;
function heldFrameKey(state, report, { columns, rows, cellAspect = 0.5, camera, poseFps = 24, contactEnabled = true } = {}) {
  const seated = state.state === "idle" && state.seatProgress === 1 && !state.behavior && !state.actionName && !state.comfortPose;
  const down = state.state === "down" && (state.actionName === "lie-down" && state.actionProgress === 1 || state.behavior === "rest");
  if (!seated && !down || report.gesture || report.butterfly || report.snore !== null && report.snore !== undefined)
    return null;
  return JSON.stringify([
    columns,
    rows,
    cellAspect,
    poseFps,
    !!contactEnabled,
    camera?.viewportWidth,
    camera?.viewportHeight,
    camera?.rect?.left,
    camera?.rect?.top,
    camera?.rect?.width,
    camera?.rect?.height,
    state.state,
    state.x,
    state.z,
    state.bodyLift ?? 0,
    state.view,
    state.flip,
    state.seatProgress,
    state.seatVariant,
    state.actionName,
    down ? state.actionProgress : 0,
    state.behavior,
    state.behaviorProgress,
    report.ball,
    report.treat
  ]);
}
function petOptions({ loadAsset = defaultLoadAsset, seed, energy, pawTransport = true, artProfile = DEFAULT_ART_PROFILE, returnStyle = "auto" } = {}) {
  if (typeof loadAsset !== "function")
    throw TypeError("loadAsset must be a function");
  if (seed === undefined)
    seed = globalThis.crypto?.getRandomValues ? globalThis.crypto.getRandomValues(new Uint32Array(1))[0] : 731;
  if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295)
    throw RangeError("seed must be a uint32");
  if (energy !== undefined && (!Number.isFinite(energy) || energy < 0 || energy > 1))
    throw RangeError("energy must be within 0..1");
  if (typeof pawTransport !== "boolean")
    throw TypeError("pawTransport must be boolean");
  if (!ART_PROFILES.includes(artProfile))
    throw RangeError("artProfile must be original or q5");
  if (!FETCH_RETURN_STYLES.includes(returnStyle))
    throw RangeError("returnStyle must be auto, brake, trot or run-trot");
  return { loadAsset, seed, energy, pawTransport, artProfile, returnStyle };
}
function createPetFromAssets(options, lease, kernel = null) {
  const { loadAsset, seed, energy, pawTransport, artProfile, returnStyle } = petOptions(options);
  let data = lease.data;
  const release = lease.release;
  lease = null;
  let { cache, info, meta } = data;
  const assets = { ...data.assets };
  data = null;
  const motionTables = loadAsset === defaultLoadAsset && artProfile === "q5" ? BAKED_MOTION : null;
  let animal, actor, life;
  try {
    if (!assets.actions.info.clips?.["lie-down"] || !assets.actions.info.clips?.["lie-up"])
      throw Error("v9 action cache lacks lie-down/lie-up clips");
    animal = createPaperBody();
    actor = createPaperActor(animal, info, { manualTricks: true, trickTimings: createSnappyTrickTimings(assets.actions.info), comfortTimings: createPaperComfortTimings(assets.actions.info), walkTransitions: true, scrambleSeconds: assets.comfort.info.scramble?.duration ?? 0, fetchMotions: assets.comfort.info.version >= 4 ? assets.comfort.info : null, motionTables });
    life = createCompanionLife(actor, { seed, returnStyle, ...energy === undefined ? {} : { energy } });
  } catch (e) {
    animal?.dispose?.();
    release();
    throw e;
  }
  let paint = null, paintKey = "", time = 0, acc = 0, disposed = false, lastHeldFrameKey = null;
  const alive = () => {
    if (disposed)
      throw Error("Pet is disposed");
  };
  return {
    step(dt) {
      alive();
      if (typeof dt !== "number" || !Number.isFinite(dt) || dt < 0)
        throw RangeError("dt must be finite non-negative seconds");
      acc += Math.min(dt, MAX_CATCH_UP_SECONDS);
      let n = 0;
      while (acc >= STEP_SECONDS - 0.000000001) {
        actor.update(STEP_SECONDS);
        life.update(STEP_SECONDS);
        time += STEP_SECONDS;
        acc = Math.max(0, acc - STEP_SECONDS);
        n++;
      }
      return n;
    },
    needsFrame(options2) {
      alive();
      const key = heldFrameKey(actor.sample(time, { poseFps: options2?.poseFps ?? 24 }), life.report, options2);
      return key === null || key !== lastHeldFrameKey;
    },
    frame({ columns, rows, cellAspect = 0.5, camera, poseFps = 24, contactEnabled = true } = {}) {
      alive();
      if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 1 || rows < 1 || columns * rows * 8 > 1e6)
        throw RangeError("columns/rows must be positive integers within 125000 cells");
      if (typeof cellAspect !== "number" || !Number.isFinite(cellAspect) || cellAspect <= 0)
        throw RangeError("cellAspect must be a positive number");
      if (![12, 24, 30].includes(poseFps))
        throw RangeError("poseFps must be 12, 24 or 30");
      const width = columns * 2, height = rows * 4, key = `${width}x${height}`;
      if (paintKey !== key) {
        paint = createPaperRenderer(cache, info, meta, width, height, { ...assets, pawTransport, motionTables, kernel });
        paintKey = key;
      }
      const viewportWidth = camera?.viewportWidth ?? columns * cellAspect, viewportHeight = camera?.viewportHeight ?? rows;
      const projection = createPaperProjection({ viewportWidth, viewportHeight, rect: camera?.rect ?? { left: 0, top: 0, width: viewportWidth, height: viewportHeight }, width, height });
      const state = actor.sample(time, { poseFps }), report = life.report;
      if (report.gesture)
        state.interactionPose = report.gesture;
      const placement = projection.placement(state.x, state.z, state.bodyLift ?? 0), pixels = paint(state, { ...placement, contactEnabled: !!contactEnabled });
      paintCompanionObjects(pixels, width, height, projection, report, state, paint.lastMouth);
      const { text } = rgbaToBraille(pixels, width, height, { method: "stable", brightness: 1.18, contrast: 1.1, kernel });
      lastHeldFrameKey = heldFrameKey(state, report, { columns, rows, cellAspect, camera, poseFps, contactEnabled });
      return { text, columns, rows, pixels, state, report, placement, projection, artProfile, mouth: paint.lastMouth, contacts: paint.report() };
    },
    interact(kind) {
      alive();
      if (!INTERACTIONS.includes(kind))
        throw TypeError(`Unknown interaction: ${kind}`);
      return life.interact(kind);
    },
    notify(notice) {
      alive();
      return life.notify(notice);
    },
    clearNotice() {
      alive();
      life.clearNotice();
    },
    setReturnStyle(style) {
      alive();
      return life.setReturnStyle(style);
    },
    get disposed() {
      return disposed;
    },
    dispose() {
      if (disposed)
        return;
      disposed = true;
      try {
        animal.dispose?.();
      } finally {
        animal = actor = life = paint = cache = info = meta = null;
        paintKey = "";
        lastHeldFrameKey = null;
        for (const k of BUNDLES)
          assets[k] = null;
        release();
      }
    }
  };
}

// integrations/purrviewer/vendor/retrieviewer/braille.mjs
var BRAILLE_BITS2 = [[1, 8], [2, 16], [4, 32], [64, 128]];
var BAYER2 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
var clamp3 = (v) => Math.max(0, Math.min(1, v));
var GLYPHS2 = Array.from({ length: 256 }, (_, i) => String.fromCharCode(10240 + i));
var grayTable2 = null;
var grayBrightness2 = 0;
var grayContrast2 = 0;
function stableBraille2(rgba, width, height, brightness, contrast) {
  if (grayBrightness2 !== brightness || grayContrast2 !== contrast) {
    grayTable2 = Float32Array.from({ length: 256 }, (_, v) => {
      const luma = (0.2126 * v + 0.7152 * v + 0.0722 * v) / 255;
      return luma === 0 ? 0 : clamp3((Math.pow(luma, 0.9) * brightness - 0.5) * contrast + 0.5);
    });
    grayBrightness2 = brightness;
    grayContrast2 = contrast;
  }
  const table = grayTable2, bytePixels = rgba instanceof Uint8Array || rgba instanceof Uint8ClampedArray, columns = Math.ceil(width / 2), rows = Math.ceil(height / 4), masks = new Uint8Array(columns * rows);
  let dots = 0;
  for (let y = 0;y < height; y++)
    for (let x = 0, p = y * width * 4;x < width; x++, p += 4) {
      const r = rgba[p], g = rgba[p + 1], b = rgba[p + 2], a = rgba[p + 3];
      if (a === 0 || r === 0 && g === 0 && b === 0)
        continue;
      let value;
      if (bytePixels && a === 255 && r === g && g === b)
        value = table[r];
      else {
        const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 * (a / 255);
        value = Math.fround(luma === 0 ? 0 : clamp3((Math.pow(luma, 0.9) * brightness - 0.5) * contrast + 0.5));
      }
      if (value <= 0)
        continue;
      let n = Math.imul(x + 1, 521288629) ^ Math.imul(y + 1, 1597334677);
      n = Math.imul(n ^ n >>> 16, 73244475);
      n = Math.imul(n ^ n >>> 16, 73244475);
      n = (n ^ n >>> 16) >>> 0;
      if (value > (n + 0.5) / 4294967296) {
        masks[(y >> 2) * columns + (x >> 1)] |= BRAILLE_BITS2[y & 3][x & 1];
        dots++;
      }
    }
  const lines = new Array(rows), cells = new Array(columns);
  for (let y = 0;y < rows; y++) {
    for (let x = 0;x < columns; x++)
      cells[x] = GLYPHS2[masks[y * columns + x]];
    lines[y] = cells.join("");
  }
  return { text: lines.join(`
`), columns, rows, dots };
}
function rgbaToBraille2(rgba, width, height, { brightness = 1, contrast = 1, method = "floyd" } = {}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 1e6 || rgba.length !== width * height * 4)
    throw Error("Invalid RGBA image");
  if (!Number.isFinite(brightness) || brightness <= 0 || brightness > 4 || !Number.isFinite(contrast) || contrast <= 0 || contrast > 4 || !["floyd", "bayer", "stable"].includes(method))
    throw Error("Invalid dithering options");
  if (method === "stable")
    return stableBraille2(rgba, width, height, brightness, contrast);
  const values = new Float32Array(width * height), bits = new Uint8Array(width * height);
  for (let i = 0;i < values.length; i++) {
    const p = i * 4, luma = (0.2126 * rgba[p] + 0.7152 * rgba[p + 1] + 0.0722 * rgba[p + 2]) / 255 * (rgba[p + 3] / 255);
    values[i] = luma === 0 ? 0 : clamp3((Math.pow(luma, 0.9) * brightness - 0.5) * contrast + 0.5);
  }
  if (method === "bayer") {
    for (let y = 0;y < height; y++)
      for (let x = 0;x < width; x++)
        bits[y * width + x] = values[y * width + x] > (BAYER2[y % 4][x % 4] + 0.5) / 16 ? 1 : 0;
  } else {
    const add = (x, y, error, weight) => {
      if (x >= 0 && x < width && y < height)
        values[y * width + x] += error * weight / 16;
    };
    for (let y = 0;y < height; y++) {
      const direction = y % 2 ? -1 : 1;
      for (let k = 0;k < width; k++) {
        const x = direction === 1 ? k : width - 1 - k, i = y * width + x, old = values[i], value = old >= 0.5 ? 1 : 0, error = old - value;
        bits[i] = value;
        add(x + direction, y, error, 7);
        add(x - direction, y + 1, error, 3);
        add(x, y + 1, error, 5);
        add(x + direction, y + 1, error, 1);
      }
    }
  }
  const columns = Math.ceil(width / 2), rows = Math.ceil(height / 4), lines = [];
  for (let cy = 0;cy < rows; cy++) {
    let line = "";
    for (let cx = 0;cx < columns; cx++) {
      let mask = 0;
      for (let dy2 = 0;dy2 < 4; dy2++)
        for (let dx = 0;dx < 2; dx++) {
          const x = cx * 2 + dx, y = cy * 4 + dy2;
          if (x < width && y < height && bits[y * width + x])
            mask |= BRAILLE_BITS2[dy2][dx];
        }
      line += String.fromCodePoint(10240 + mask);
    }
    lines.push(line);
  }
  return { text: lines.join(`
`), columns, rows, dots: bits.reduce((a, b) => a + b, 0) };
}

// integrations/purrviewer/src/walk-cycle.mjs
var WALK_STRIDE = 0.18141;

// integrations/purrviewer/src/world.mjs
var gait2 = (stride, frequency) => Object.freeze({ stride, frequency, speed: stride * frequency });
var CAT_GAITS = Object.freeze({
  walk: gait2(WALK_STRIDE, 0.27 / WALK_STRIDE),
  trot: gait2(0.62, 2),
  creep: gait2(WALK_STRIDE, 0.13 / WALK_STRIDE)
});
var GRAVITY = 9.81;
var DECELERATION = 1.8;
var ACCELERATION = Object.freeze({ walk: 0.65, trot: 2, creep: 0.3 });
var coordinate = (n) => Number.isFinite(n) && Math.abs(n) <= 1e6;
function point(x, z) {
  if (!coordinate(x) || !coordinate(z))
    throw new RangeError("Invalid cat target");
}
function options(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Invalid cat options");
}
function travel(length2, speed, acceleration) {
  const peak = Math.min(speed, Math.sqrt(2 * length2 / (1 / acceleration + 1 / DECELERATION)));
  const ta = peak / acceleration, td = peak / DECELERATION;
  const da = peak * ta / 2, dd = peak * td / 2;
  const tc = Math.max(0, length2 - da - dd) / peak;
  const duration = ta + tc + td;
  return { duration, at(t) {
    if (t >= duration)
      return { distance: length2, speed: 0 };
    if (t < ta)
      return { distance: acceleration * t * t / 2, speed: acceleration * t };
    if (t < ta + tc)
      return { distance: da + peak * (t - ta), speed: peak };
    const remaining = duration - t;
    return { distance: length2 - DECELERATION * remaining * remaining / 2, speed: DECELERATION * remaining };
  } };
}
function createCatMotion(config = {}) {
  options(config);
  let { x = 0, z = 0 } = config;
  point(x, z);
  let y = 0, speed = 0, distance = 0, phase = 0, heading = 0, currentGait = "walk";
  let active = null, pending = null, supportY = 0, beltSpeed = 0, beltDistance = 0, wheelRadius = 0.6, wheelPhase = 0;
  function advance(ds) {
    distance += ds;
    phase += ds / CAT_GAITS[currentGait].stride;
  }
  function launch(command) {
    if (command.kind === "wheel") {
      wheelRadius = command.radius;
      wheelPhase = 0;
      active = { ...command, elapsed: 0, covered: 0 };
      return;
    }
    const dx = command.x - x, dz2 = command.z - z, length2 = Math.hypot(dx, dz2);
    if (command.kind === "go")
      currentGait = command.gait;
    if (length2 > 0)
      heading = Math.atan2(dx, dz2);
    if (command.kind === "go" && length2 === 0)
      return;
    active = {
      kind: command.kind,
      x,
      z,
      targetX: command.x,
      targetZ: command.z,
      ux: length2 ? dx / length2 : 0,
      uz: length2 ? dz2 / length2 : 0,
      length: length2,
      elapsed: 0,
      covered: 0,
      ...command.kind === "pounce" ? (() => {
        const apex = Math.max(y, command.landingY) + command.height;
        const vy = Math.sqrt(2 * GRAVITY * (apex - y));
        return {
          startY: y,
          targetY: command.landingY,
          vy,
          duration: (vy + Math.sqrt(2 * GRAVITY * (apex - command.landingY))) / GRAVITY
        };
      })() : { plan: travel(length2, CAT_GAITS[currentGait].speed, ACCELERATION[currentGait]) }
    };
    if (command.kind === "pounce")
      speed = length2 / active.duration;
  }
  function brake() {
    if (!active || active.kind === "pounce" || ["brake", "wheel-brake"].includes(active.kind))
      return;
    if (active.kind === "wheel") {
      const stride = active.stride, minDistance = beltSpeed * beltSpeed / 2.4;
      const distance2 = beltSpeed > 0.15 ? (Math.ceil(wheelPhase + minDistance / stride) - wheelPhase) * stride : minDistance;
      const deceleration = distance2 > 0 ? beltSpeed * beltSpeed / (2 * distance2) : 1.2;
      active = beltSpeed > 0 ? {
        kind: "wheel-brake",
        initialSpeed: beltSpeed,
        deceleration,
        duration: beltSpeed / deceleration,
        elapsed: 0,
        covered: 0,
        stride
      } : null;
      return;
    }
    active = speed > 0 ? {
      kind: "brake",
      x,
      z,
      ux: active.ux,
      uz: active.uz,
      initialSpeed: speed,
      duration: speed / DECELERATION,
      elapsed: 0,
      covered: 0
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
    go(targetX, targetZ, config2 = {}) {
      options(config2);
      const { gait: gait3 = "walk" } = config2;
      point(targetX, targetZ);
      if (typeof gait3 !== "string" || !Object.hasOwn(CAT_GAITS, gait3))
        throw new RangeError("Invalid cat gait");
      request({ kind: "go", x: targetX, z: targetZ, gait: gait3 });
    },
    stop() {
      pending = null;
      brake();
    },
    pounce(targetX, targetZ, config2 = {}) {
      options(config2);
      const { height = 0.18, landingY = 0 } = config2;
      point(targetX, targetZ);
      if (!Number.isFinite(height) || height <= 0 || height > 1)
        throw new RangeError("Invalid pounce height");
      if (!Number.isFinite(landingY) || landingY < 0 || landingY > 1)
        throw RangeError("Invalid landing support");
      request({ kind: "pounce", x: targetX, z: targetZ, height, landingY });
    },
    wheel(config2 = {}) {
      options(config2);
      const { duration = 10, speed: speed2 = 0.65, radius = 0.6, stride = 0.32 } = config2;
      if (![duration, speed2, radius, stride].every(Number.isFinite) || duration < 2 || duration > 30 || speed2 <= 0 || speed2 > 2 || radius < 0.3 || radius > 1 || stride < 0.05 || stride > 1)
        throw RangeError("Invalid wheel motion");
      request({ kind: "wheel", duration, peakSpeed: speed2, radius, stride });
    },
    step(dt) {
      if (!Number.isFinite(dt) || dt < 0 || dt > 0.1)
        throw new RangeError("Invalid cat step");
      let remaining = dt;
      while (active && remaining > 0) {
        const a = active, duration = a.plan?.duration ?? a.duration;
        const used = Math.min(remaining, duration - a.elapsed);
        a.elapsed = Math.min(duration, a.elapsed + used);
        if (duration - a.elapsed < 0.0000000001)
          a.elapsed = duration;
        remaining = Math.max(0, remaining - used);
        const done = a.elapsed >= duration;
        let covered;
        if (["wheel", "wheel-brake"].includes(a.kind)) {
          if (a.kind === "wheel") {
            beltSpeed = a.peakSpeed * Math.sin(Math.PI * a.elapsed / duration) ** 2;
            covered = a.peakSpeed * (a.elapsed / 2 - duration * Math.sin(2 * Math.PI * a.elapsed / duration) / (4 * Math.PI));
          } else {
            beltSpeed = Math.max(0, a.initialSpeed - a.deceleration * a.elapsed);
            covered = a.initialSpeed * a.elapsed - a.deceleration * a.elapsed * a.elapsed / 2;
          }
          const ds = covered - a.covered;
          beltDistance += ds;
          wheelPhase += ds / a.stride;
          a.covered = covered;
          if (done) {
            beltSpeed = 0;
            if (Math.abs(wheelPhase - Math.round(wheelPhase)) < 0.000000001)
              wheelPhase = Math.round(wheelPhase);
            active = null;
            if (pending) {
              const command = pending;
              pending = null;
              launch(command);
            }
          }
          continue;
        } else if (a.kind === "pounce") {
          covered = a.length * (a.elapsed / duration);
          speed = a.length / duration;
          y = a.startY + a.vy * a.elapsed - GRAVITY * a.elapsed * a.elapsed / 2;
        } else if (a.kind === "brake") {
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
          if (a.kind !== "brake") {
            x = a.targetX;
            z = a.targetZ;
          }
          speed = 0;
          if (a.kind === "pounce")
            supportY = a.targetY;
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
      return {
        x,
        y,
        z,
        speed,
        distance,
        phase,
        gait: currentGait,
        moving: active !== null,
        heading,
        supportY,
        airborne: active?.kind === "pounce",
        flightProgress: active?.kind === "pounce" ? active.elapsed / active.duration : 0,
        exercising: ["wheel", "wheel-brake"].includes(active?.kind),
        beltSpeed,
        beltDistance,
        wheelPhase,
        wheelAngle: beltDistance / wheelRadius
      };
    }
  };
}
var diagonal2 = 0.0254 * 32;
var screenWidth = diagonal2 * 16 / Math.hypot(16, 9);
var screenHeight = diagonal2 * 9 / Math.hypot(16, 9);
var pitch2 = 9 * Math.PI / 180;
var c2 = Math.cos(pitch2);
var s2 = Math.sin(pitch2);
function projectCat(x, y, z, config = {}) {
  options(config);
  const { width, height, canvasMeters = 0.6 } = config;
  if (![x, y, z, width, height, canvasMeters].every(Number.isFinite) || width <= 0 || height <= 0 || canvasMeters <= 0)
    throw new RangeError("Invalid cat projection");
  const cameraY = c2 * (y - 0.45) - s2 * (z - 1.65);
  const depth = -s2 * (y - 0.45) - c2 * (z - 1.65);
  if (!Number.isFinite(depth) || depth <= 0)
    throw new RangeError("Cat point behind camera");
  const focal = 0.7 * Math.min(width / screenWidth, height / screenHeight);
  const result = {
    x: width / 2 + focal * x / depth,
    y: height / 2 - focal * cameraY / depth,
    size: focal * canvasMeters / depth,
    depth
  };
  if (!Object.values(result).every(Number.isFinite))
    throw new RangeError("Invalid cat projection range");
  return result;
}
function unprojectCatGround(u, v, { width, height } = {}) {
  if (![u, v, width, height].every(Number.isFinite) || width <= 0 || height <= 0)
    throw RangeError("Invalid cat ground pixel");
  const focal = 0.7 * Math.min(width / screenWidth, height / screenHeight), q = (height / 2 - v) / focal;
  const denominator = s2 - q * c2;
  if (Math.abs(denominator) < 0.0000000001)
    throw RangeError("Cat ground ray at horizon");
  const dz2 = -0.45 * (c2 + q * s2) / denominator, depth = s2 * 0.45 - c2 * dz2;
  if (depth <= 0 || !Number.isFinite(depth))
    throw RangeError("Cat ground behind camera");
  return { x: (u - width / 2) * depth / focal, z: dz2 + 1.65 };
}

// integrations/purrviewer/src/habitat.mjs
var CAT_HABITAT = Object.freeze({
  tower: Object.freeze({ x: -0.61, z: -1.9, lowX: -0.43, lowY: 0.21, highX: -0.65, highY: 0.42, approachX: -0.12 }),
  wheel: Object.freeze({ x: 0.57, z: -1.9, radius: 0.42, catX: 0.53, stride: 0.32 })
});
function paintHabitat(pixels, width, height, angle = 0) {
  const at = (x, y, value) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= width || y >= height)
      return;
    const i = (y * width + x) * 4;
    if (pixels[i])
      return;
    pixels[i] = pixels[i + 1] = pixels[i + 2] = value;
  };
  const point2 = (x, y, z) => projectCat(x, y, z, { width, height });
  const line = (a, b, value = 105) => {
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
    for (let i = 0;i <= n; i++)
      at(a.x + (b.x - a.x) * i / n, a.y + (b.y - a.y) * i / n, value);
  };
  const edge = (x, y, z, xx, yy, zz, value) => line(point2(x, y, z), point2(xx, yy, zz), value);
  const { tower: t, wheel: w } = CAT_HABITAT;
  const platform = (x, y, half) => {
    edge(x - half, y, t.z - 0.12, x + half, y, t.z - 0.12, 150);
    edge(x - half, y, t.z + 0.12, x + half, y, t.z + 0.12, 205);
    edge(x - half, y, t.z - 0.12, x - half, y, t.z + 0.12, 150);
    edge(x + half, y, t.z - 0.12, x + half, y, t.z + 0.12, 150);
    edge(x - half, y - 0.025, t.z + 0.12, x + half, y - 0.025, t.z + 0.12, 100);
  };
  platform(t.x, 0, 0.34);
  platform(t.lowX, t.lowY, 0.21);
  platform(t.highX, t.highY, 0.21);
  for (const [x, top] of [[t.lowX, t.lowY], [t.highX, t.highY]]) {
    edge(x - 0.025, 0, t.z, x - 0.025, top - 0.025, t.z, 90);
    edge(x + 0.025, 0, t.z, x + 0.025, top - 0.025, t.z, 125);
    for (let y = 0.025;y < top - 0.025; y += 0.025)
      edge(x - 0.024, y, t.z, x + 0.024, y + 0.008, t.z, 65);
  }
  for (const [z, value] of [[w.z - 0.08, 65], [w.z, 155]]) {
    let prev = point2(w.x + w.radius, w.radius, z);
    for (let i = 1;i <= 112; i++) {
      const a = i * Math.PI * 2 / 112, next = point2(w.x + w.radius * Math.cos(a), w.radius + w.radius * Math.sin(a), z);
      line(prev, next, value);
      prev = next;
    }
  }
  for (let i = 0;i < 24; i++) {
    const a = i * Math.PI * 2 / 24 - angle;
    edge(w.x + (w.radius - 0.018) * Math.cos(a), w.radius + (w.radius - 0.018) * Math.sin(a), w.z, w.x + (w.radius - 0.05) * Math.cos(a), w.radius + (w.radius - 0.05) * Math.sin(a), w.z, 110);
  }
  edge(w.x - 0.25, -0.025, w.z, w.x + 0.25, -0.025, w.z, 130);
  edge(w.x - 0.25, -0.025, w.z, w.x - 0.18, 0.045, w.z, 95);
  edge(w.x + 0.25, -0.025, w.z, w.x + 0.18, 0.045, w.z, 95);
}

// integrations/purrviewer/src/life.mjs
var GROUND = 0.000001;
var hold = (clip, duration) => ({ clip, duration, elapsed: 0, progress: 0 });
var matHold = (clip, duration) => ({ ...hold(clip, duration), mat: true });
var towerLoad = (duration, facing) => ({ ...hold("tower-load", duration), facing });
var travel2 = (clip, command) => ({ clip, command, issued: false, acknowledged: false, progress: 0 });
var stretchPhases = () => [
  hold("stretch-enter", 1.15),
  hold("stretch-reach", 0.65),
  hold("stretch-hold", 1.25),
  hold("stretch-release", 0.7),
  hold("stretch-leave", 1.15)
];
function createCatLife({ seed = 731 } = {}) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) {
    throw new RangeError("seed must be an unsigned 32-bit integer");
  }
  let randomState = seed;
  const random = () => {
    randomState = randomState + 1831565813 >>> 0;
    let n = Math.imul(randomState ^ randomState >>> 15, randomState | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
  const range = (min, max) => min + random() * (max - min);
  let clock = 0;
  let lastChoice = "observe";
  let roamAfter = 20;
  let playAfter = 90;
  let companyAfter = 60, attentionUntil = 0, eyeAfter = 0;
  let habitatAfter = 100;
  let pending = null;
  let stopSent = false;
  let episode = {
    intent: "observe",
    label: "Watching quietly",
    direct: false,
    phases: [
      hold("sit", 1.2),
      hold("eye-greeting", 3.4),
      hold("tail-swish", 3.6),
      hold("loaf-enter", 0.9),
      hold("loaf-rest", range(12, 24)),
      hold("loaf-leave", 0.9),
      hold("sit", 2)
    ]
  };
  let index = 0;
  const current = () => episode.phases[index];
  const grounded = (sample) => !sample.airborne && sample.y <= (sample.supportY ?? 0) + GROUND;
  const settled = (sample) => grounded(sample) && !sample.moving;
  function toyPhases(sample, target) {
    const dx = target.x - sample.x;
    const dz2 = target.z - sample.z;
    const distance = Math.hypot(dx, dz2);
    const phases = [];
    if (distance > 0.35) {
      phases.push(travel2("creep", {
        kind: "go",
        x: target.x - dx / distance * 0.3,
        z: target.z - dz2 / distance * 0.3,
        gait: "creep"
      }));
    }
    phases.push(hold("crouch", 0.65), travel2("pounce", { kind: "pounce", x: target.x, z: target.z, height: 0.18 }), hold("land", 0.3), hold("bat", 0.9), hold("sit", 2.5));
    return phases;
  }
  function localToy(sample) {
    const direction = Math.abs(sample.x) > 0.3 ? sample.x > 0 ? -1 : 1 : random() < 0.5 ? -1 : 1;
    return { x: sample.x + direction * 0.6, z: sample.z };
  }
  function companyPhases(sample) {
    const target = { x: sample.x < 0 ? -0.18 : 0.18, z: Math.min(0, Math.max(-0.35, sample.z + 0.65)) };
    const phases = [];
    const dx = target.x - sample.x, dz2 = target.z - sample.z, distance = Math.hypot(dx, dz2);
    if (distance > 0.18) {
      const scale = Math.min(1, 0.8 / distance);
      phases.push(travel2("walk", { kind: "go", x: sample.x + dx * scale, z: sample.z + dz2 * scale, gait: "walk" }));
    }
    phases.push(hold("sit", 1.2), ...clock >= eyeAfter ? [hold("eye-greeting", 3.4)] : [], matHold("knead-enter", 0.8), matHold("knead", 4.8), matHold("knead-leave", 0.8), matHold("loaf-rest", range(25, 45)), matHold("loaf-leave", 0.9), matHold("sit", 2));
    companyAfter = clock + range(180, 300);
    return phases;
  }
  function descent(sample) {
    if (!(sample.supportY > 0))
      return [];
    const t = CAT_HABITAT.tower;
    return [
      towerLoad(0.4, 1),
      travel2("tower-down", { kind: "pounce", x: t.approachX, z: t.z, height: 0.055, landingY: 0 }),
      hold("tower-land", 0.4),
      hold("sit", 0.7)
    ];
  }
  function habitatPhases(kind) {
    habitatAfter = clock + range(160, 260);
    const t = CAT_HABITAT.tower, w = CAT_HABITAT.wheel;
    if (kind === "wheel")
      return [
        travel2("walk", { kind: "go", x: w.catX, z: w.z, gait: "walk" }),
        hold("wheel-enter", 0.65),
        travel2("wheel-run", { kind: "wheel", duration: 10, speed: 2 * 10 * w.stride / 10, radius: w.radius, stride: w.stride }),
        hold("wheel-leave", 0.7),
        travel2("walk", { kind: "go", x: w.catX - 0.3, z: w.z + 0.14, gait: "walk" }),
        hold("sit", 3)
      ];
    return [
      travel2("walk", { kind: "go", x: t.approachX, z: t.z, gait: "walk" }),
      towerLoad(0.55, -1),
      travel2("tower-up", { kind: "pounce", x: t.lowX, z: t.z, height: 0.07, landingY: t.lowY }),
      hold("tower-land", 0.35),
      towerLoad(0.4, -1),
      travel2("tower-up", { kind: "pounce", x: t.highX, z: t.z, height: 0.065, landingY: t.highY }),
      hold("tower-land", 0.35),
      hold("sit", 2),
      hold("eye-greeting", 3.4),
      hold("loaf-enter", 0.9),
      hold("loaf-rest", range(15, 25)),
      hold("loaf-leave", 0.9),
      towerLoad(0.4, 1),
      travel2("tower-down", { kind: "pounce", x: t.lowX, z: t.z, height: 0.04, landingY: t.lowY }),
      hold("tower-land", 0.35),
      ...descent({ supportY: t.lowY })
    ];
  }
  function beginInteraction(sample) {
    const { kind, target } = pending;
    const previousPhase = current(), previous = previousPhase.clip;
    const fromSleep = ["sleep", "loaf"].includes(previous);
    const recovery = previous === "wheel-run" ? [hold("wheel-leave", 0.7)] : ["loaf-enter", "loaf-rest"].includes(previous) ? [previousPhase.mat ? matHold("loaf-leave", 0.9) : hold("loaf-leave", 0.9)] : ["knead-enter", "knead"].includes(previous) ? [matHold("knead-leave", 0.8), matHold("loaf-leave", 0.9)] : previous === "knead-leave" ? [matHold("loaf-leave", 0.9)] : fromSleep ? [hold("wake", 1.8), ...kind === "stretch" ? [] : [hold("stretch-leave", 1.15)]] : ["stretch-reach", "stretch-hold"].includes(previous) ? [hold("stretch-release", 0.7), hold("stretch-leave", 1.15)] : ["stretch-enter", "stretch-release", "wake"].includes(previous) ? [hold("stretch-leave", 1.15)] : previous.startsWith("feed-") && previous !== "feed-leave" ? [hold("feed-leave", 1.35)] : ["treat", "stretch", "greet", "company"].includes(kind) && ["walk", "creep", "land"].includes(previous) ? [hold("sit", 0.55)] : [];
    pending = null;
    stopSent = false;
    index = 0;
    episode = {
      intent: kind,
      direct: true,
      label: kind === "toy" ? "Stalking a toy" : kind === "treat" ? "Enjoying a nearby treat" : kind === "stretch" ? "A long supported stretch" : kind === "tail" ? "A little tail-tip attention" : kind === "company" ? "Choosing a quiet place nearby" : "A soft eye greeting",
      phases: [...recovery, ...descent(sample), ...kind === "toy" ? toyPhases(sample, target ?? localToy(sample)) : kind === "treat" ? [
        hold("feed-enter", 1.35),
        hold("feed-sniff", 0.45),
        hold("feed-lick", 3.6),
        hold("feed-finish", 0.45),
        hold("feed-leave", 1.35),
        hold("sit", 1)
      ] : kind === "stretch" ? [...stretchPhases().slice(fromSleep ? 1 : 0), hold("sit", 2)] : kind === "tail" ? [hold("tail-swish", 3.6), hold("sit", 1)] : kind === "company" ? companyPhases(sample) : ["tower", "wheel"].includes(kind) ? habitatPhases(kind) : clock >= eyeAfter ? [hold("sit", 0.45), hold("eye-greeting", 3.4), hold("sit", 1)] : [hold("sit", 1.2)]]
    };
    roamAfter = Math.max(roamAfter, clock + 20);
    playAfter = Math.max(playAfter, clock + 90);
  }
  function choose(sample) {
    const choices = [
      ["observe", 35],
      ["groom", 20],
      ["sleep", 20],
      ["stretch", 8],
      ["roam", clock >= roamAfter ? 12 : 0],
      ["play", clock >= playAfter ? 5 : 0],
      ["company", clock >= companyAfter ? clock < attentionUntil ? 12 : 6 : 0],
      ["tower", clock >= habitatAfter ? 5 : 0],
      ["wheel", clock >= habitatAfter ? 3 : 0]
    ].filter(([kind2, weight]) => kind2 !== lastChoice && weight > 0);
    let ticket = random() * choices.reduce((sum, [, weight]) => sum + weight, 0);
    const kind = choices.find(([, weight]) => (ticket -= weight) < 0)[0];
    lastChoice = kind;
    let phases;
    let label;
    switch (kind) {
      case "observe":
        label = "Watching quietly";
        phases = random() < 0.7 ? [
          hold("sit", 2),
          hold("tail-swish", 3.6),
          hold("loaf-enter", 0.9),
          hold("loaf-rest", range(12, 24)),
          hold("loaf-leave", 0.9),
          hold("sit", 2)
        ] : [hold("sit", range(8, 16)), random() < 0.5 ? hold("eye-greeting", 3.4) : hold("blink", 0.8), hold("tail-tip", 2.8), hold("idle", range(4, 8))];
        break;
      case "groom":
        label = "A little grooming";
        phases = [hold("sit", 0.6), hold("groom", range(5, 9)), hold("sit", 2)];
        break;
      case "sleep":
        label = "A long quiet nap";
        phases = [
          hold("loaf", 2),
          hold("sleep", range(60, 120)),
          hold("wake", 1.8),
          ...stretchPhases().slice(1),
          hold("sit", 2)
        ];
        break;
      case "stretch":
        label = "Stretching out";
        phases = [...stretchPhases(), hold("sit", range(5, 9))];
        break;
      case "roam": {
        label = "A short wander";
        const angle = range(0, Math.PI * 2);
        const distance = range(0.35, 0.8);
        let x = Math.max(-0.55, Math.min(0.55, sample.x + Math.cos(angle) * distance));
        let z = Math.max(-3.5, Math.min(0, sample.z + Math.sin(angle) * distance));
        if (Math.hypot(x - sample.x, z - sample.z) < 0.15) {
          x = sample.x > 0 ? -0.35 : 0.35;
          z = Math.max(-3, Math.min(0, sample.z - 0.3));
        }
        phases = [hold("idle", 0.8), travel2("walk", {
          kind: "go",
          x,
          z,
          gait: "walk"
        }), hold("sit", range(6, 10))];
        roamAfter = clock + 35;
        break;
      }
      case "play":
        label = "An imagined little hunt";
        phases = toyPhases(sample, localToy(sample));
        playAfter = clock + 120;
        break;
      case "company":
        label = "Choosing a quiet place nearby";
        phases = companyPhases(sample);
        break;
      case "tower":
      case "wheel":
        label = kind === "tower" ? "A high quiet perch" : "A short wheel run";
        phases = habitatPhases(kind);
        break;
    }
    episode = { intent: kind, label, direct: false, phases };
    index = 0;
  }
  function advance(sample) {
    const phase = current();
    if (pending && phase.command?.kind !== "pounce") {
      beginInteraction(sample);
    } else if (++index === episode.phases.length) {
      if (episode.direct && ["call", "greet", "treat"].includes(episode.intent))
        attentionUntil = clock + 90;
      choose(sample);
    }
    if (current().clip === "eye-greeting")
      eyeAfter = clock + 20;
  }
  function step(dt, sample) {
    if (!Number.isFinite(dt) || dt < 0 || dt > 0.1) {
      throw new RangeError("dt must be finite and between 0 and .1 seconds");
    }
    if (!sample || !["x", "y", "z"].every((key) => Number.isFinite(sample[key])) || sample.y < 0 || typeof sample.moving !== "boolean") {
      throw new TypeError("motionSample requires finite x/y/z, nonnegative y and boolean moving");
    }
    if (dt === 0)
      return null;
    clock += dt;
    let phase = current();
    const committedPounce = phase.command?.kind === "pounce" && phase.issued;
    if (pending && !committedPounce) {
      if (!grounded(sample))
        return null;
      if (sample.moving || phase.command && phase.issued && !stopSent) {
        if (!stopSent) {
          stopSent = true;
          return { kind: "stop" };
        }
        return null;
      }
      if (stopSent || phase.command && !phase.issued) {
        beginInteraction(sample);
        return null;
      }
    }
    if (phase.done && settled(sample)) {
      advance(sample);
      return null;
    }
    if (phase.command) {
      if (!phase.issued) {
        if (!settled(sample))
          return null;
        phase.issued = true;
        return { ...phase.command };
      }
      if (sample.moving)
        phase.acknowledged = true;
      if (phase.acknowledged && settled(sample)) {
        phase.progress = 1;
        phase.done = true;
      }
      return null;
    }
    if (!settled(sample))
      return null;
    if (pending && !["land", "tower-land"].includes(phase.clip)) {
      phase.exitStart ??= phase.progress;
      phase.exitElapsed = (phase.exitElapsed ?? 0) + dt;
      phase.progress = phase.exitStart + (1 - phase.exitStart) * Math.min(1, phase.exitElapsed / 0.2);
    } else {
      phase.elapsed = Math.min(phase.duration, phase.elapsed + dt);
      phase.progress = Math.min(1, phase.elapsed / phase.duration);
    }
    phase.done = phase.progress >= 1;
    return null;
  }
  return {
    step,
    interact(kind, { target } = {}) {
      if (!["treat", "toy", "call", "stretch", "tail", "greet", "company", "tower", "wheel"].includes(kind))
        return false;
      if (target !== undefined && (!target || !Number.isFinite(target.x) || !Number.isFinite(target.z)))
        return false;
      if (["call", "greet"].includes(kind) && (current().clip === "eye-greeting" || episode.direct && ["call", "greet"].includes(episode.intent) && !pending))
        return true;
      if (kind === "company" && episode.intent === "company" && !pending)
        return true;
      if (["tower", "wheel"].includes(kind) && episode.intent === kind && !pending)
        return true;
      pending = { kind, target: target === undefined ? undefined : { x: target.x, z: target.z } };
      return true;
    },
    get report() {
      const phase = current();
      return {
        intent: episode.intent,
        label: episode.label,
        clip: phase.clip,
        progress: phase.progress,
        busy: Boolean(pending || episode.direct || ["roam", "play"].includes(episode.intent)),
        food: phase.clip.startsWith("feed-") ? { remaining: phase.clip === "feed-lick" ? 1 - phase.progress : ["feed-finish", "feed-leave"].includes(phase.clip) ? 0 : 1 } : null,
        mat: Boolean(phase.mat),
        facing: phase.facing ?? null,
        resting: ["sleep", "loaf-rest"].includes(phase.clip) && !pending,
        sleeping: phase.clip === "sleep",
        restSeconds: phase.clip === "sleep" ? phase.elapsed : 0
      };
    }
  };
}

// integrations/purrviewer/src/contact.mjs
var viewport = { width: 320, height: 180 };
function createCatContacts(track) {
  const radii = track.feet.map((row) => row.map((foot) => Math.min(28, ...row.filter((other) => other.id !== foot.id).map((other) => 0.44 * Math.hypot(other.x - foot.x, other.y - foot.y)))));
  const anchors = new Map;
  let feet = [], mirror = false, pose = 0;
  return {
    reset() {
      anchors.clear();
      feet = [];
    },
    update(sample, flipped) {
      mirror = flipped;
      const n = track.feet.length, phase = (sample.phase % 1 + 1) % 1, index = Math.min(n - 1, Math.floor(phase * n)), cycle = Math.floor(sample.phase);
      pose = index;
      feet = track.feet[index];
      const p = projectCat(sample.x, 0, sample.z, viewport), scale = p.size / 320, sign = mirror ? -1 : 1;
      const active = new Set;
      for (const [j, foot] of feet.entries()) {
        if (!foot.stance)
          continue;
        active.add(foot.id);
        const start = track.starts[foot.id][index], episode = cycle - (start > index ? 1 : 0) + "/" + start;
        let anchor = anchors.get(foot.id);
        if (!anchor || anchor.episode !== episode) {
          anchor = { episode, world: unprojectCatGround(p.x + sign * (foot.x - 160) * scale, p.y + (foot.y - 290) * scale, viewport), released: false };
          anchors.set(foot.id, anchor);
        }
        const target = projectCat(anchor.world.x, 0, anchor.world.z, viewport);
        const dx = 160 + sign * (target.x - p.x) / scale - foot.x, dy2 = 290 + (target.y - p.y) / scale - foot.y;
        anchor.released = Math.hypot(dx, dy2) > Math.min(6, radii[index][j] * 0.22) || Math.abs(dy2) > 3;
      }
      for (const id of anchors.keys())
        if (!active.has(id))
          anchors.delete(id);
    },
    pins(sample) {
      const p = projectCat(sample.x, 0, sample.z, viewport), scale = p.size / 320, sign = mirror ? -1 : 1, pins = [];
      for (const [j, foot] of feet.entries()) {
        const anchor = anchors.get(foot.id);
        if (!foot.stance || !anchor || anchor.released)
          continue;
        const target = projectCat(anchor.world.x, 0, anchor.world.z, viewport);
        pins.push({ id: foot.id, radius: radii[pose][j], source: { x: foot.x, y: foot.y }, target: { x: 160 + sign * (target.x - p.x) / scale, y: 290 + (target.y - p.y) / scale }, world: { ...anchor.world }, episode: anchor.episode });
      }
      return pins;
    }
  };
}
function footSourcePoint2(x, y, pins, out = {}) {
  out.x = x;
  out.y = y;
  if (y <= 225 || !pins.length)
    return out;
  for (const pin of pins) {
    const dx = pin.target.x - pin.source.x, dy2 = pin.target.y - pin.source.y, radius = pin.radius ?? 28;
    if (radius <= 0 || Math.hypot(dx, dy2) > Math.min(6, 0.22 * radius) || Math.abs(dy2) > 3)
      continue;
    if (Math.hypot(x - pin.source.x, y - pin.source.y) >= radius)
      continue;
    let u = x - dx, v = y - dy2;
    for (let i = 0;i < 12; i++) {
      const distance = Math.hypot(u - pin.source.x, v - pin.source.y);
      const t = Math.max(0, Math.min(1, (distance - radius * 0.3) / (radius * 0.7))), weight = 1 - t * t * (3 - 2 * t);
      u = x - dx * weight;
      v = y - dy2 * weight;
    }
    out.x = u;
    out.y = v;
    return out;
  }
  return out;
}

// integrations/purrviewer/src/facing.mjs
function catFacingPath(from, fromMirror, to, toMirror) {
  const path = [];
  const push = (clip, reverse, mirror, view) => path.push({ clip, reverse, mirror, view, seconds: 0.28 });
  if (from === to && (from === "front" || fromMirror === toMirror))
    return path;
  if (from === "rear") {
    push("turn-side-rear", true, fromMirror, "side");
    from = "side";
  }
  if (from === "side") {
    if (to === "rear" && fromMirror === toMirror) {
      push("turn-side-rear", false, fromMirror, "rear");
      return path;
    }
    push("turn-front-side", true, fromMirror, "front");
  }
  if (to === "front")
    return path;
  push("turn-front-side", false, toMirror, "side");
  if (to === "rear")
    push("turn-side-rear", false, toMirror, "rear");
  return path;
}

// integrations/purrviewer/src/purrviewer-core.mjs
function createCatFromAssets({ seed = 731 } = {}, lease, kernel = null) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295)
    throw TypeError("Invalid cat seed");
  let asset = lease.data;
  const release = lease.release, motion = createCatMotion(), life = createCatLife({ seed }), contacts = createCatContacts(asset.meta.walk), sourcePoint = { x: 0, y: 0 };
  let pixels = null, disposed = false, lastClip = "sit", lastFrame = null, prep = null, view = "front", mirror = false, standing = false, settle = null, lastMoving = false, lastLifeClip = "sit", lastPaintKey = "", lastText = "", rasterizations = 0, heldHits = 0;
  const alive = () => {
    if (disposed)
      throw Error("Cat is disposed");
  };
  const direct = (command) => {
    if (command.kind === "go")
      motion.go(command.x, command.z, { gait: command.gait });
    else if (command.kind === "pounce")
      motion.pounce(command.x, command.z, { height: command.height, landingY: command.landingY ?? 0 });
    else if (command.kind === "wheel") {
      view = "side";
      mirror = false;
      settle = null;
      motion.wheel(command);
    } else if (command.kind === "stop") {
      motion.stop();
    }
  };
  function prepare(targetView, targetMirror, { command = null, seated = false } = {}) {
    const steps = [];
    if (!standing)
      steps.push({ clip: "rise-front", seconds: 0.3, view: "front", mirror: false });
    steps.push(...catFacingPath(view, mirror, targetView, targetMirror));
    if (seated)
      steps.push({ clip: "sit-front", seconds: 0.32, view: "front", mirror: false, seated: true });
    if (!steps.length) {
      if (command)
        direct(command);
      return;
    }
    prep = { steps, index: 0, age: 0, command };
    mirror = steps[0].mirror;
    settle = null;
  }
  function issue(command) {
    if (command.kind === "go" && !motion.sample().moving) {
      const s3 = motion.sample(), dx = command.x - s3.x, dz2 = command.z - s3.z, length2 = Math.hypot(dx, dz2);
      if (length2 > 0.01) {
        const targetView = Math.abs(dz2 / length2) > 0.8 ? dz2 > 0 ? "front" : "rear" : "side";
        prepare(targetView, dx < 0, { command });
        return;
      }
    }
    if (command.kind !== "stop")
      settle = null;
    direct(command);
  }
  return {
    step(dt) {
      alive();
      if (!Number.isFinite(dt) || dt < 0 || dt > 0.25)
        throw RangeError("Invalid cat dt");
      let left = dt;
      while (left > 0.0000000001) {
        const step = Math.min(1 / 60, left);
        left -= step;
        if (prep) {
          prep.age += step;
          const part = prep.steps[prep.index];
          if (prep.age >= part.seconds) {
            view = part.view;
            mirror = part.mirror;
            standing = !part.seated;
            prep.age = 0;
            prep.index++;
            if (prep.index === prep.steps.length) {
              const cmd = prep.command;
              prep = null;
              if (cmd)
                direct(cmd);
            } else
              mirror = prep.steps[prep.index].mirror;
          }
          if (prep)
            continue;
        }
        motion.step(step);
        const s3 = motion.sample();
        const command = life.step(step, s3);
        if (command)
          issue(command);
        const report = life.report, clip = report.clip;
        if (s3.moving && !prep && !s3.exercising) {
          if (s3.airborne) {
            mirror = Math.sin(s3.heading) < 0;
            view = "side";
          }
          standing = true;
          settle = null;
        }
        if (clip !== lastLifeClip) {
          if (["stretch-enter", "knead-enter", "feed-enter"].includes(clip) && standing)
            prepare("front", false, { seated: true });
          if (["tower-load", "crouch", "wheel-enter"].includes(clip))
            prepare("side", clip === "tower-load" ? report.facing < 0 : clip === "wheel-enter" ? false : mirror);
          if (["tower-land", "wheel-leave"].includes(clip)) {
            view = "side";
            standing = true;
            settle = null;
            if (clip.startsWith("wheel"))
              mirror = false;
          }
          if (clip === "stretch-reach") {
            view = "side";
            mirror = false;
            settle = null;
          }
          if (clip === "feed-sniff") {
            view = "side";
            mirror = false;
            standing = true;
            settle = null;
          }
          if (clip === "sit" && ["bat", "stretch", "stretch-leave", "feed-leave", "loaf-leave"].includes(lastLifeClip)) {
            view = "front";
            mirror = false;
            standing = false;
            settle = null;
          }
          lastLifeClip = clip;
        }
        const quiet = ["idle", "sit", "blink", "eye-greeting", "groom", "loaf", "sleep", "tail-swish", "tail-tip"].includes(clip);
        if (!s3.moving && !prep && quiet && standing)
          prepare("front", false, { seated: true });
        lastMoving = s3.moving;
        if (s3.moving && !s3.airborne && !s3.exercising && s3.supportY === 0 && !prep && view === "side")
          contacts.update(s3, mirror);
        else
          contacts.reset();
      }
    },
    frame({ columns = 160, rows = 72 } = {}) {
      alive();
      if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 8 || rows < 4 || columns * rows > 125000)
        throw RangeError("Invalid cat viewport");
      const width = columns * 2, height = rows * 4, n = width * height * 4;
      if (!pixels || pixels.length !== n) {
        pixels = new Uint8ClampedArray(n);
        for (let i = 3;i < n; i += 4)
          pixels[i] = 255;
      }
      const s3 = motion.sample(), r = life.report;
      let clip = r.clip ?? "sit", progress = r.progress ?? 0;
      if (s3.moving && !s3.airborne && !s3.exercising) {
        clip = view === "side" ? "walk" : view === "front" ? "walk-front" : "walk-rear";
        progress = (s3.phase % 1 + 1) % 1;
      }
      if (s3.airborne) {
        clip = r.clip === "tower-up" ? "tower-flight" : r.clip === "tower-down" ? "tower-fall" : "pounce";
        progress = s3.flightProgress;
      }
      if (s3.exercising || r.clip === "wheel-run") {
        clip = "wheel-run";
        progress = (s3.wheelPhase % 1 + 1) % 1;
      }
      if (!s3.moving && ["walk", "creep"].includes(clip)) {
        clip = view === "rear" ? "stand-rear" : view === "front" ? "rise-front" : "stand";
        progress = 1;
      }
      if (prep) {
        const part = prep.steps[prep.index];
        clip = part.clip;
        progress = Math.min(1, prep.age / part.seconds);
        if (part.reverse)
          progress = 1 - progress;
      }
      if (settle) {
        clip = settle.clip;
        progress = Math.min(1, settle.age / settle.seconds);
      }
      if (clip === "feed-lick")
        progress = progress >= 1 ? 0 : progress * 9 % 1;
      if (clip === "knead")
        progress = progress >= 1 ? 0 : progress * 4 % 1;
      let keys = asset.meta.clips[clip] ?? asset.meta.clips.sit;
      if (clip === "stand")
        keys = [asset.meta.clips["turn-front-side"].at(-1)];
      if (clip === "sleep") {
        const t = r.restSeconds ?? 0, phase = t % 5.6;
        keys = [Math.floor(t) % 23 === 17 ? asset.meta.clips.sleep[3] : phase > 1.4 && phase < 3.5 ? asset.meta.clips.sleep[1] : asset.meta.clips.sleep[0]];
        progress = 0;
      }
      const pins = clip === "walk" ? contacts.pins(s3) : [];
      const key = keys[Math.min(keys.length - 1, Math.floor(Math.max(0, Math.min(1, progress)) * keys.length))];
      const food = r.food ? Math.ceil(r.food.remaining * 16) / 16 : null;
      const wheelAngle = Math.round(s3.wheelAngle * 120) / 120;
      const p = projectCat(s3.x, s3.y, s3.z, { width, height, canvasMeters: 0.6 }), paintKey = [width, height, key, mirror, p.x, p.y, p.size, food, r.mat, wheelAngle].join("/");
      const dish = p && food !== null ? {
        x: p.x + p.size * (269 / 320 - 0.5),
        y: p.y + p.size * (288 - 290) / 320,
        radius: p.size * 18 / 320,
        remaining: food
      } : null;
      const mat = r.mat ? { x: p.x, y: p.y + p.size * 3 / 320, radiusX: p.size * 72 / 320, radiusY: p.size * 12 / 320 } : null;
      const result = (text) => ({ text, pixels, columns, rows, color: asset.meta.color, state: { ...s3, clip, frame: key }, contacts: pins, report: r, placement: p, dish, mat });
      lastClip = clip;
      lastFrame = key;
      if (paintKey === lastPaintKey) {
        heldHits++;
        return result(lastText);
      }
      if (kernel?.clear)
        kernel.clear(pixels);
      else
        for (let i = 0;i < n; i += 4)
          pixels[i] = pixels[i + 1] = pixels[i + 2] = 0;
      const gray = asset.store.getFrame(key);
      if (p) {
        const size = p.size, left = p.x - size * 0.5, top = p.y - size * (290 / 320), x0 = Math.max(0, Math.floor(left)), y0 = Math.max(0, Math.floor(top)), x1 = Math.min(width, Math.ceil(left + size)), y1 = Math.min(height, Math.ceil(top + size));
        if (kernel?.catBlit)
          kernel.catBlit(pixels, gray, { width, height, x: p.x, y: p.y, size: p.size, mirror, pins });
        else
          for (let y = y0;y < y1; y++)
            for (let x = x0;x < x1; x++) {
              let u = (x + 0.5 - left) * 320 / size - 0.5, v = (y + 0.5 - top) * 320 / size - 0.5;
              if (mirror)
                u = 319 - u;
              if (v > 225 && pins.length) {
                const source = footSourcePoint2(u, v, pins, sourcePoint);
                u = source.x;
                v = source.y;
              }
              if (u < 0 || v < 0 || u > 319 || v > 319)
                continue;
              const a = Math.floor(u), b = Math.floor(v), fu = u - a, fv = v - b, aa = Math.min(319, a + 1), bb = Math.min(319, b + 1);
              const value = Math.round((gray[b * 320 + a] * (1 - fu) + gray[b * 320 + aa] * fu) * (1 - fv) + (gray[bb * 320 + a] * (1 - fu) + gray[bb * 320 + aa] * fu) * fv), at = (y * width + x) * 4;
              pixels[at] = pixels[at + 1] = pixels[at + 2] = value;
            }
        if (mat) {
          for (let y = Math.max(0, Math.floor(mat.y - mat.radiusY));y < Math.min(height, Math.ceil(mat.y + mat.radiusY)); y++)
            for (let x = Math.max(0, Math.floor(mat.x - mat.radiusX));x < Math.min(width, Math.ceil(mat.x + mat.radiusX)); x++) {
              const e = ((x + 0.5 - mat.x) / mat.radiusX) ** 4 + ((y + 0.5 - mat.y) / mat.radiusY) ** 4;
              if (e >= 1)
                continue;
              const at = (y * width + x) * 4;
              if (pixels[at])
                continue;
              const value = e > 0.72 ? 180 : 90;
              pixels[at] = pixels[at + 1] = pixels[at + 2] = value;
            }
        }
        if (dish) {
          const rx = dish.radius, ry = p.size * 4 / 320;
          for (let y = Math.max(0, Math.floor(dish.y - ry - 3));y < Math.min(height, Math.ceil(dish.y + ry + 2)); y++)
            for (let x = Math.max(0, Math.floor(dish.x - rx - 1));x < Math.min(width, Math.ceil(dish.x + rx + 2)); x++) {
              const dx = (x + 0.5 - dish.x) / rx, dy2 = (y + 0.5 - dish.y) / ry, e = dx * dx + dy2 * dy2;
              let value = e < 1 && e > 0.48 ? 150 : e <= 0.48 ? 48 : 0;
              const pasteRadius = Math.sqrt(food) * 0.72;
              if (food > 0 && pasteRadius > 0 && dx * dx + (dy2 + 0.5) * (dy2 + 0.5) < pasteRadius * pasteRadius)
                value = 220;
              if (!value)
                continue;
              const at = (y * width + x) * 4;
              pixels[at] = pixels[at + 1] = pixels[at + 2] = Math.max(pixels[at], value);
            }
        }
      }
      paintHabitat(pixels, width, height, wheelAngle);
      rasterizations++;
      lastPaintKey = paintKey;
      lastText = ((kernel?.braille) ? kernel.braille(pixels, width, height, 1.22, 1.08) : rgbaToBraille2(pixels, width, height, { method: "stable", brightness: 1.22, contrast: 1.08 })).text;
      return result(lastText);
    },
    interact(kind, options2) {
      alive();
      if (!["treat", "toy", "call", "stretch", "tail", "greet", "company", "tower", "wheel"].includes(kind))
        throw TypeError("Invalid cat interaction");
      const accepted = life.interact(kind, options2);
      if (accepted && prep)
        prep.command = null;
      return accepted;
    },
    get report() {
      alive();
      return life.report;
    },
    get stats() {
      alive();
      return { residentPixelBytes: asset.store.residentPixelBytes ?? asset.store.residentBytes, cachedFrames: asset.store.stats().cachedFrames, rgbaBytes: pixels?.byteLength ?? 0, lastClip, lastFrame, leases: lease.users?.() ?? 1, rasterizations, heldHits };
    },
    dispose() {
      if (disposed)
        return;
      disposed = true;
      pixels = null;
      prep = null;
      contacts.reset();
      asset = null;
      lastText = lastPaintKey = "";
      release();
    }
  };
}

// integrations/native-windows/runtime.mjs
init_puppy_frame_indexed();
init_puppy_frame_store();
var config = globalThis.__nativeConfig ?? {};
var root = scriptArgs[1];
var kernel = globalThis.__fast;
var pet = null;
var kind = config.pet ?? "dog";
var disposed = false;
var json = (name) => {
  const source = std.loadFile(root + "/" + name);
  if (source === null)
    throw Error("Missing pet metadata: " + name);
  return JSON.parse(source);
};
function provider() {
  const stores2 = [];
  const release = () => {
    for (const store of stores2)
      store.dispose();
    stores2.length = 0;
  };
  const frames = (name, frameIndices) => {
    const file = std.open(root + "/" + name, "rb");
    if (!file)
      throw Error("Missing pet artwork: " + name);
    let owned = true;
    try {
      const read = (at, n) => {
        if (file.seek(at, std.SEEK_SET) !== 0)
          throw Error("Invalid art seek");
        const bytes = new Uint8Array(n);
        if (file.read(bytes.buffer, 0, n) !== n)
          throw Error("Truncated pet artwork");
        return bytes;
      };
      file.seek(0, std.SEEK_END);
      const size = file.tell(), length2 = indexedIndexLength(read(0, 20)), index = readIndexedIndex(read(0, length2), size);
      const store = registerFrameStore(createIndexedFrameStore(index, { read, expand: (b, n) => kernel.inflate(b, n), close: () => file.close(), frameIndices, kernel }));
      stores2.push(store);
      owned = false;
      return store;
    } finally {
      if (owned)
        file.close();
    }
  };
  return { frames, release };
}
function make(next) {
  if (!["dog", "cat"].includes(next))
    throw Error("Unknown pet");
  const p = provider();
  try {
    if (next === "cat")
      return createCatFromAssets({ seed: config.seed ?? 731 }, { data: { meta: json("integrations/purrviewer/art/ginger.json"), store: p.frames("integrations/purrviewer/art/ginger.rvz") }, release: p.release }, kernel);
    const data = { info: json(PET_ASSETS.strideInfo), meta: json(PET_ASSETS.stableInfo), cache: p.frames(PET_ASSETS.stride), assets: {} };
    for (const key of ["rear", "approach", "seat", "arrivalSeat", "behaviors", "actions", "interactions", "comfort"]) {
      const base = PET_ASSETS[key], info = json(base + ".json");
      const indices = key === "interactions" ? [...new Set(Object.values(info.clips).flatMap((list) => list.flatMap((pair) => Array.from({ length: info.samples }, (_, s3) => pair * info.samples + s3))))] : undefined;
      data.assets[key] = { info, bytes: p.frames(base + "-q5.rvz", indices) };
    }
    return createPetFromAssets({ seed: config.seed ?? 731, returnStyle: config.returnStyle ?? "auto" }, { data, release: p.release }, kernel);
  } catch (error) {
    p.release();
    throw error;
  }
}
pet = make(kind);
globalThis.__desktopReady = true;
globalThis.__desktopFrame = (dt, columns, rows, force = false) => {
  if (disposed)
    throw Error("Native pet is disposed");
  pet.step(dt);
  const options2 = { columns, rows, cellAspect: 0.5 };
  return !force && pet.needsFrame?.(options2) === false ? null : pet.frame(options2).text;
};
globalThis.__desktopInteract = (action) => {
  if (kind === "cat")
    return pet.interact({ ball: "toy", tug: "company", paw: "greet", wall: "greet" }[action] ?? action);
  return action === "paw" || action === "wall" ? pet.notify({ kind: "approval", gesture: action }) : pet.interact(action);
};
globalThis.__desktopSwitchPet = (next) => {
  if (!["dog", "cat"].includes(next))
    throw Error("Unknown pet");
  if (next === kind)
    return true;
  pet.dispose();
  pet = null;
  pet = make(next);
  kind = next;
  return true;
};
globalThis.__desktopDispose = () => {
  if (disposed)
    return;
  disposed = true;
  pet?.dispose();
  pet = null;
};
