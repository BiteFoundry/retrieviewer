import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./docs/app.mjs', import.meta.url), 'utf8')
  .replace('await import("./runtime/0.0.23/retrieviewer.mjs")', 'await loadRuntime()');

async function setup() {
  class Target {
    constructor() { this.listeners = new Map(); this.dataset = {}; this.style = {}; this.textContent = ''; this.value = ''; }
    addEventListener(type, fn) { const list = this.listeners.get(type) || []; list.push(fn); this.listeners.set(type, list); }
    removeEventListener(type, fn) { this.listeners.set(type, (this.listeners.get(type) || []).filter(item => item !== fn)); }
    async emit(type, event = {}) { for (const fn of [...(this.listeners.get(type) || [])]) await fn(event); }
    setAttribute() {}
    getAttribute() { return ''; }
  }
  const elements = new Map();
  const element = id => { if (!elements.has(id)) elements.set(id, new Target()); return elements.get(id); };
  const stage = element('.dog-stage');
  let rect = {top: 10, bottom: 410, left: 0, right: 600, width: 600, height: 400};
  stage.getBoundingClientRect = () => rect;
  const languages = ['en', 'ko'].map(language => Object.assign(new Target(), {dataset: {language}}));
  const copy = Object.assign(new Target(), {dataset: {copy: 'command'}});
  const document = new Target();
  Object.assign(document, {hidden: false, documentElement: {}, fonts: {ready: Promise.resolve()},
    querySelector: element,
    querySelectorAll: selector => selector === '[data-language]' ? languages : selector === '[data-copy]' ? [copy] : [],
    createElement: () => ({getContext: () => ({measureText: () => ({width: 60})})})});
  const window = new Target();
  const timers = new Map(); let nextTimer = 0, now = 100, resize, intersection, failCopy = false;
  const steps = []; let disposed = false;
  const pet = {step: dt => steps.push(dt), frame: () => ({text: 'dog', state: {state: 'idle'}, report: {busy: false, cooldowns: {}, attention: false}}), setReturnStyle() {}, dispose() { disposed = true; }};
  const context = vm.createContext({document, window, innerHeight: 800, innerWidth: 1000,
    location: {href: 'https://example.com/'}, URL, localStorage: {getItem() {}, setItem() {}},
    navigator: {clipboard: {writeText: async () => { if (failCopy) throw Error('copy'); }}},
    ResizeObserver: class { constructor(fn) { this.fn = fn; resize = this; } observe() {} disconnect() { this.disconnected = true; } },
    IntersectionObserver: class { constructor(fn) { this.fn = fn; intersection = this; } observe() {} disconnect() { this.disconnected = true; } },
    setTimeout: fn => { const id = ++nextTimer; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id),
    performance: {now: () => now}, fetch: async () => ({ok: true, text: async () => 'snapshot'}),
    loadRuntime: async () => ({createPet: async () => pet}), console});
  await vm.runInContext(`(async () => { ${source}\n})()`, context);
  return {document, window, stage, element, languages, copy, steps, timers, resize, intersection,
    setRect(value) { rect = {...rect, ...value}; }, setCopyFailure(value) { failCopy = value; },
    tick() { const [id, fn] = timers.entries().next().value; timers.delete(id); now += 42; fn(); },
    advance(ms) { now += ms; }, isDisposed: () => disposed};
}

test('dog loop tracks viewport, document visibility, manual pause and lifecycle without duplicate timers', async () => {
  const s = await setup();
  await s.element('#play').emit('click');
  assert.equal(s.timers.size, 1); s.tick(); s.tick();
  assert.ok(s.steps.at(-1) > 0);
  s.setRect({top: -2096, bottom: -1696});
  await s.window.emit('scroll');
  assert.equal(s.timers.size, 0);
  const frames = s.stage.dataset.frames;
  s.advance(700); assert.equal(s.stage.dataset.frames, frames);
  s.setRect({top: 10, bottom: 410});
  s.intersection.fn([]); assert.equal(s.timers.size, 1);
  s.tick(); assert.equal(s.steps.at(-1), 0);
  s.document.hidden = true; await s.document.emit('visibilitychange'); assert.equal(s.timers.size, 0);
  s.document.hidden = false; await s.document.emit('visibilitychange'); assert.equal(s.timers.size, 1);
  s.tick(); assert.equal(s.steps.at(-1), 0);
  await s.element('#pause').emit('click'); assert.equal(s.timers.size, 0);
  s.resize.fn(); s.intersection.fn([]); await s.window.emit('pageshow'); assert.equal(s.timers.size, 0);
  await s.element('#pause').emit('click'); assert.equal(s.timers.size, 1);
  s.resize.fn(); s.intersection.fn([]); await s.window.emit('scroll'); await s.window.emit('pageshow');
  assert.equal(s.timers.size, 1); s.tick(); assert.equal(s.steps.at(-1), 0);
  await s.window.emit('pagehide', {persisted: true}); assert.equal(s.timers.size, 0);
  await s.window.emit('pageshow'); assert.equal(s.timers.size, 1);
  await s.window.emit('pagehide', {persisted: false});
  assert.equal(s.timers.size, 0); assert.ok(s.isDisposed());
  assert.ok(s.resize.disconnected && s.intersection.disconnected);
  await s.window.emit('pageshow'); await s.window.emit('scroll'); await s.document.emit('visibilitychange');
  assert.equal(s.timers.size, 0);
});

test('copy success and failure messages follow the selected language', async () => {
  const s = await setup();
  await s.copy.emit('click'); assert.equal(s.element('#copy-status').textContent, 'Command copied.');
  await s.languages[1].emit('click'); assert.equal(s.element('#copy-status').textContent, '명령을 복사했어요.');
  s.setCopyFailure(true); await s.copy.emit('click');
  assert.equal(s.element('#copy-status').textContent, '복사하지 못했어요. 위 명령을 직접 선택해 복사해 주세요.');
  await s.languages[0].emit('click'); assert.equal(s.element('#copy-status').textContent, 'Could not copy. Select and copy the command above.');
});
