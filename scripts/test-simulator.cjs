/* Exercise the complete production IIFE with explicit network/media events.
   No production globals are added: only this VM copy exposes S and tick. */
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');

const sourcePath = process.argv[2] || path.join(__dirname, '../docs/assets/js/main.js');
const htmlPath = path.resolve(path.dirname(sourcePath), '../../index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const videoTag = html.match(/<video\b[^>]*\bid="simVideo"[^>]*>/)[0];

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function flush() { for (let i = 0; i < 16; i++) await Promise.resolve(); }

function simulator(reduced = false) {
  let now = 0, nextId = 1, inClick = false;
  const timers = new Map(), elements = new Map(), observers = [];
  const requests = [], objectURLs = [], revokedURLs = [];
  const playCalls = [], seekCalls = [], playErrors = [];

  class EventTarget {
    constructor() { this.listeners = {}; }
    addEventListener(type, fn, options) {
      (this.listeners[type] ||= []).push({ fn, once: !!(options && options.once) });
    }
    removeEventListener(type, fn) {
      this.listeners[type] = (this.listeners[type] || []).filter(item => item.fn !== fn);
    }
    fire(type, extra = {}) {
      const event = { type, target: this, preventDefault() {}, ...extra };
      for (const item of [...(this.listeners[type] || [])]) {
        if (item.once) this.removeEventListener(type, item.fn);
        item.fn.call(this, event);
      }
    }
  }
  class Element extends EventTarget {
    constructor(selector = '') {
      super();
      this.selector = selector; this.attrs = {}; this.children = []; this.disabled = false;
      this.hidden = false; this.textContent = ''; this.paused = true; this._currentTime = 0;
      this.readyState = 0; this.networkState = 0; this.muted = true; this.error = null;
      this.clientWidth = 320; this.clientHeight = 740; this.offsetWidth = 100;
      this.rect = { top: 0, bottom: 2000, height: 2000, left: 0, right: 200, width: 200 };
      this.loadCalls = 0;
      const classes = new Set();
      this.classList = {
        add: (...xs) => xs.forEach(x => classes.add(x)),
        remove: (...xs) => xs.forEach(x => classes.delete(x)),
        toggle: (x, on) => {
          const use = on === undefined ? !classes.has(x) : on;
          use ? classes.add(x) : classes.delete(x); return use;
        },
        contains: x => classes.has(x)
      };
      this.style = { setProperty() {} };
      this.dataset = new Proxy({}, {
        get: (_, key) => this.getAttribute('data-' + key.replace(/[A-Z]/g, c => '-' + c.toLowerCase())),
        set: (_, key, value) => { this.setAttribute('data-' + key.replace(/[A-Z]/g, c => '-' + c.toLowerCase()), value); return true; }
      });
    }
    setAttribute(key, value) { this.attrs[key] = String(value); }
    getAttribute(key) { return this.attrs[key] ?? null; }
    removeAttribute(key) { delete this.attrs[key]; }
    get src() { return this.getAttribute('src') || ''; }
    set src(value) { this.setAttribute('src', value); }
    get currentSrc() { return this.src; }
    get currentTime() { return this._currentTime; }
    set currentTime(value) {
      if (this.selector === '#simVideo') {
        seekCalls.push({ time: value, readyState: this.readyState });
        if (this.readyState === 0) throw new Error('Cannot seek before loadedmetadata');
      }
      this._currentTime = value;
    }
    click() {
      if (this.disabled) return;
      const before = inClick; inClick = true;
      try { this.fire('click'); } finally { inClick = before; }
    }
    closest(selector) { return selector === '.chip' && this.getAttribute('data-i') !== null ? this : null; }
    getBoundingClientRect() { return this.rect; }
    getContext() { return {}; }
    setPointerCapture() {}
    load() { this.loadCalls++; this.readyState = 0; this.error = null; }
    play() {
      playCalls.push({ time: this._currentTime, src: this.src, readyState: this.readyState, inClick });
      const error = playErrors.shift();
      if (error) { this.paused = true; return Promise.reject(error); }
      this.paused = false; return Promise.resolve();
    }
    pause() { this.paused = true; }
    set innerHTML(value) {
      this._html = value;
      this.children = [...value.matchAll(/data-i="(\d+)" data-s="([^"]+)"/g)].map(match => {
        const child = new Element(); child.setAttribute('data-i', match[1]); child.setAttribute('data-s', match[2]);
        return child;
      });
    }
    get innerHTML() { return this._html || ''; }
  }
  function get(selector) {
    if (!elements.has(selector)) elements.set(selector, new Element(selector));
    return elements.get(selector);
  }
  const root = get('html'); root.setAttribute('data-lang', 'en');
  const video = get('#simVideo');
  for (const attr of videoTag.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) {
    if (!['video', 'id'].includes(attr[1])) video.setAttribute(attr[1], attr[2] ?? '');
  }
  const modes = ['merge', 'separate'].map(mode => { const el = new Element(); el.setAttribute('data-mode', mode); return el; });
  const window = new EventTarget();
  Object.assign(window, {
    matchMedia: query => ({ matches: query.includes('reduced-motion') ? reduced : false }),
    innerHeight: 740, devicePixelRatio: 1, scrollY: 0
  });
  const document = new EventTarget();
  Object.assign(document, {
    documentElement: root, visibilityState: 'visible', hidden: false,
    querySelector: get,
    querySelectorAll: selector => selector === '.seg-b' ? modes : selector === '#simSteps i' ? Array.from({ length: 6 }, () => new Element()) : [],
    createElement: () => new Element()
  });
  class IntersectionObserver {
    constructor(callback, options) { this.callback = callback; this.options = options; this.targets = []; observers.push(this); }
    observe(el) { this.targets.push(el); }
    unobserve(el) { this.targets = this.targets.filter(target => target !== el); }
    disconnect() { this.targets = []; }
  }
  window.IntersectionObserver = IntersectionObserver;
  class FakeBlob { constructor() { this.size = 2400000; this.type = 'video/mp4'; } }
  const URL = {
    createObjectURL(blob) { assert.ok(blob instanceof FakeBlob); const url = 'blob:simulator-test/' + (objectURLs.length + 1); objectURLs.push(url); return url; },
    revokeObjectURL(url) { revokedURLs.push(url); }
  };
  const fetch = (url, options) => {
    const pending = deferred();
    if (options && options.signal) {
      const abort = () => { const error = new Error('Fetch aborted'); error.name = 'AbortError'; pending.reject(error); };
      if (options.signal.aborted) abort();
      else options.signal.addEventListener('abort', abort, { once: true });
    }
    requests.push({ url, options, ...pending }); return pending.promise;
  };
  Object.assign(window, { URL, fetch });
  function timeout(fn, ms = 0) { const id = nextId++; timers.set(id, { at: now + ms, fn }); return id; }
  const context = {
    document, window, IntersectionObserver, URL, fetch, Blob: FakeBlob, Promise, AbortController,
    Image: class { constructor() { this.complete = false; this.naturalWidth = 0; } },
    requestAnimationFrame() {}, setInterval() {}, setTimeout: timeout, clearTimeout: id => timers.delete(id),
    localStorage: { setItem() {} }, console
  };
  vm.createContext(context);
  const source = fs.readFileSync(sourcePath, 'utf8').replace(/\}\)\(\);\s*$/, 'globalThis.audit = { state: function () { return S; }, tick: tick };})();');
  vm.runInContext(source, context, { filename: sourcePath });
  function advance(ms) {
    const end = now + ms;
    for (;;) {
      const pending = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!pending) break;
      timers.delete(pending[0]); now = pending[1].at; pending[1].fn();
    }
    now = end;
  }
  function visible(isIntersecting) {
    const target = get('.sim-device');
    target.rect = { ...target.rect, top: isIntersecting ? 0 : 1000, bottom: isIntersecting ? 600 : 1600 };
    const io = observers.find(observer => observer.targets.includes(target));
    assert.ok(io, 'simulator must observe its visibility');
    io.callback([{ target, isIntersecting, intersectionRatio: isIntersecting ? 1 : 0 }]);
  }
  async function fetched(index = requests.length - 1, response = {}) {
    assert.ok(requests[index], 'expected a pending video fetch');
    requests[index].resolve({ ok: true, status: 200, blob: () => Promise.resolve(new FakeBlob()), ...response });
    await flush();
  }
  async function metadata() {
    video.readyState = 1; video.duration = 24; video.fire('loadedmetadata'); await flush();
  }
  async function load() { visible(true); await fetched(); await metadata(); }
  return {
    get, video, modes, window, document, advance, visible, fetched, metadata, load,
    requests, objectURLs, revokedURLs, playCalls, seekCalls,
    state: context.audit.state, tick: context.audit.tick,
    rejectPlay(name = 'NotAllowedError') { const error = new Error(name); error.name = name; playErrors.push(error); },
    chip(index) { get('#rvChips').fire('click', { target: get('#rvChips').children[index] }); }
  };
}

function notice(x, message) {
  assert.equal(x.get('#simMediaNotice').hidden, false, message || 'media problem should be visible');
  assert.equal(x.get('#simMediaRetry').disabled, false, 'retry must be actionable');
  assert.match(x.get('#simMediaMessage').textContent, /[A-Za-z]/, 'English media message is readable');
}

const tests = [
  ['edit during Finalize cancels output', () => {
    const x = simulator(); x.get('#bKeep').click(); x.advance(500); x.get('#bContinue').click();
    x.get('#bFinalize').click(); x.get('#bEdit').click(); x.chip(0); x.get('#bDiscard').click(); x.advance(1700);
    assert.equal(x.state().phase, 'review'); assert.equal(x.state().c.filter(c => c.s === 'kept').length, 0);
    assert.equal(x.get('#panelReady').hidden, true); assert.equal(x.get('#bFinalize').disabled, false);
  }],
  ['Continue cancels delayed review navigation', () => {
    const x = simulator(); x.get('#bKeep').click(); x.get('#bContinue').click(); x.advance(500);
    assert.equal(x.state().phase, 'output'); assert.notEqual(x.state().playlist, null); assert.equal(x.state().cur, 0);
  }],
  ['manual chip navigation wins over auto advance', () => {
    const x = simulator(); x.get('#bKeep').click(); x.chip(2); x.advance(500); assert.equal(x.state().cur, 2);
  }],
  ['rapid revised decision replaces its timer', () => {
    const x = simulator(); x.get('#bKeep').click(); x.advance(100); x.get('#bDiscard').click();
    x.advance(400); assert.equal(x.state().cur, 0); x.advance(100); assert.equal(x.state().cur, 1);
    assert.equal(x.state().c[0].s, 'discarded');
  }],
  ['manual Previous/Next stop at boundaries', () => {
    const x = simulator(); assert.equal(x.get('#bPrev').disabled, true); x.get('#bPrev').click(); assert.equal(x.state().cur, 0);
    x.get('#bNext').click(); x.get('#bNext').click(); assert.equal(x.state().cur, 2);
    assert.equal(x.get('#bNext').disabled, true); x.get('#bNext').click(); assert.equal(x.state().cur, 2);
  }],
  ['keyboard trim timer cannot override output playback', () => {
    const x = simulator(); x.get('#hStart').fire('keydown', { key: 'ArrowRight' }); x.get('#bKeep').click();
    x.get('#bContinue').click(); x.advance(500); assert.equal(x.state().phase, 'output'); assert.notEqual(x.state().playlist, null);
  }],
  ['Restart cancels active generation', () => {
    const x = simulator(); x.get('#bKeep').click(); x.get('#bContinue').click(); x.get('#bFinalize').click();
    x.get('#bRestart').click(); x.advance(1700); assert.equal(x.state().phase, 'review');
    assert.equal(x.state().c.every(c => c.s === 'pending'), true); assert.equal(x.get('#progress').hidden, true);
  }],
  ['old generation cannot complete a newer one', () => {
    const x = simulator(); x.get('#bKeep').click(); x.get('#bContinue').click(); x.get('#bFinalize').click();
    x.advance(100); x.get('#bEdit').click(); x.get('#bContinue').click(); x.get('#bFinalize').click();
    x.advance(1400); assert.equal(x.state().phase, 'output'); x.advance(100); assert.equal(x.state().phase, 'ready');
  }],
  ['output mode stays fixed during generation', () => {
    const x = simulator(); x.get('#bKeep').click(); x.get('#bContinue').click(); x.get('#bFinalize').click();
    assert.equal(x.modes[1].disabled, true); x.modes[1].click(); assert.equal(x.state().mode, 'merge');
    x.advance(1500); assert.equal(x.modes[1].disabled, false); assert.equal(x.state().phase, 'ready');
  }],
  ['merged output preserves only kept clips and saves separately', () => {
    const x = simulator(); x.get('#bKeep').click(); x.advance(500); x.get('#bNext').click(); x.get('#bKeep').click();
    x.get('#bContinue').click(); x.get('#bFinalize').click(); x.advance(1500);
    assert.equal(x.state().phase, 'ready'); assert.equal(x.state().saved, false);
    assert.equal(x.get('#readyTitle').textContent, 'Ready to Save');
    assert.match(x.get('#readyFiles').innerHTML, /CutCut-merged\.mp4 · 12\.0s/);
    assert.equal(x.state().c[1].s, 'pending'); x.get('#bSave').click(); assert.equal(x.state().saved, true);
    assert.equal(x.get('#bSave').disabled, true); assert.equal(x.get('#readyTitle').textContent, 'Saved (demo)');
  }],
  ['separate output emits one file per kept clip', () => {
    const x = simulator(); x.get('#bKeep').click(); x.get('#bNext').click(); x.get('#bKeep').click();
    x.get('#bContinue').click(); x.modes[1].click(); x.get('#bFinalize').click(); x.advance(1500);
    assert.equal(x.state().phase, 'ready'); assert.match(x.get('#readyFiles').innerHTML, /Clip-01\.mp4/);
    assert.match(x.get('#readyFiles').innerHTML, /Clip-02\.mp4/); assert.doesNotMatch(x.get('#readyFiles').innerHTML, /merged/);
  }],
  ['reduced motion generation cancels on Edit', () => {
    const x = simulator(true); x.get('#bKeep').click(); x.get('#bContinue').click(); x.get('#bFinalize').click();
    x.get('#bEdit').click(); x.advance(300); assert.equal(x.state().phase, 'review');
  }],
  ['all discarded clips cannot continue or finalize', () => {
    const x = simulator(); for (let i = 0; i < 3; i++) { x.get('#bDiscard').click(); x.advance(500); }
    x.get('#bContinue').click(); x.get('#bFinalize').click(); x.advance(1700);
    assert.equal(x.state().phase, 'review'); assert.equal(x.get('#panelReady').hidden, true);
  }],
  ['initial page has no video src and starts no video download', () => {
    const x = simulator(); assert.equal(x.video.getAttribute('src'), null);
    assert.equal(x.video.getAttribute('data-src'), 'assets/video/practice.mp4');
    assert.equal(x.requests.length, 0); assert.equal(x.playCalls.length, 0); assert.equal(x.objectURLs.length, 0);
  }],
  ['one pending fetch and loadedmetadata apply the latest third-candidate intent', async () => {
    const x = simulator(); x.visible(true); x.get('#bNext').click(); x.get('#bNext').click(); x.get('#bReplay').click();
    assert.equal(x.requests.length, 1); assert.equal(x.playCalls.length, 0);
    await x.fetched(); assert.equal(x.requests.length, 1); assert.equal(x.playCalls.length, 0, 'blob availability alone is not metadata');
    assert.equal(x.video.currentTime, 0); assert.match(x.video.src, /^blob:/);
    await x.metadata(); assert.equal(x.state().cur, 2); assert.equal(x.video.currentTime, 17);
    assert.equal(x.playCalls.length, 1); assert.equal(x.playCalls[0].time, 17);
    assert.equal(x.seekCalls.every(call => call.readyState >= 1), true, 'no seek can be attempted before metadata');
  }],
  ['Restart during fetch replaces the pending third-candidate intent with one second', async () => {
    const x = simulator(); x.visible(true); x.chip(2); x.get('#bRestart').click();
    await x.fetched(); await x.metadata(); assert.equal(x.requests.length, 1);
    assert.equal(x.state().cur, 0); assert.equal(x.video.currentTime, 1);
    assert.equal(x.playCalls.length, 1); assert.equal(x.playCalls[0].time, 1);
  }],
  ['Continue while fetching retains the kept-only playlist through metadata and playback', async () => {
    const x = simulator(); x.visible(true); x.get('#bKeep').click(); x.chip(2); x.get('#bKeep').click(); x.get('#bContinue').click();
    await x.fetched(); await x.metadata();
    assert.equal(x.state().phase, 'output'); assert.equal(x.requests.length, 1);
    assert.deepEqual(Array.from(x.state().playlist, clip => [clip.start, clip.end]), [[1, 7], [17, 23]]);
    assert.equal(x.video.currentTime, 1); assert.equal(x.state().c[1].s, 'pending');
    x.video.currentTime = 7; x.tick(); assert.equal(x.video.currentTime, 17); assert.equal(x.state().pi, 1);
    x.video.currentTime = 23; x.tick(); assert.equal(x.state().playlist, null); assert.equal(x.video.paused, true);
  }],
  ['trim during pending load applies the current edge and remains paused while dragging', async () => {
    const x = simulator(); x.visible(true); x.chip(2);
    x.get('#hStart').fire('pointerdown', { clientX: 100, pointerId: 1 });
    x.get('#hStart').fire('pointermove', { clientX: 90, pointerId: 1 });
    const edge = x.state().c[2].start;
    assert.equal(x.state().c[2].s, 'pending');
    await x.fetched(); await x.metadata(); assert.equal(x.video.currentTime, edge);
    assert.equal(x.video.paused, true); assert.equal(x.playCalls.length, 0);
    x.get('#hStart').fire('pointerup', { pointerId: 1 });
    assert.equal(x.playCalls.length, 1); assert.equal(x.playCalls[0].time, edge); assert.equal(x.state().c[2].s, 'pending');
  }],
  ['fetch failure exposes an explicit retry and recovers the latest candidate', async () => {
    const x = simulator(); x.visible(true); x.requests[0].reject(new Error('network offline')); await flush();
    notice(x);
    x.chip(2); assert.equal(x.requests.length, 1, 'navigation must not silently retry a failed load');
    notice(x);
    x.get('#simMediaRetry').click(); assert.equal(x.requests.length, 2);
    x.chip(2); assert.equal(x.requests.length, 2, 'concurrent playback intent reuses the explicit retry');
    await x.fetched(); await x.metadata(); assert.equal(x.video.currentTime, 17); assert.equal(x.video.paused, false);
    assert.equal(x.get('#simMediaNotice').hidden, true);
  }],
  ['HTTP error is actionable and retry does not reuse the failed response', async () => {
    const x = simulator(); x.visible(true); await x.fetched(0, { ok: false, status: 503 });
    notice(x); assert.equal(x.objectURLs.length, 0); x.get('#simMediaRetry').click(); assert.equal(x.requests.length, 2);
    await x.fetched(); await x.metadata(); assert.equal(x.video.currentTime, 1);
  }],
  ['media decode failure revokes the failed blob and explicit retry reloads', async () => {
    const x = simulator(); x.visible(true); await x.fetched();
    const failedURL = x.objectURLs[0]; x.video.error = { code: 4 }; x.video.fire('error'); await flush();
    notice(x); assert.ok(x.revokedURLs.includes(failedURL));
    x.get('#simMediaRetry').click(); assert.equal(x.requests.length, 2);
    await x.fetched(); await x.metadata(); assert.notEqual(x.video.src, failedURL); assert.equal(x.video.paused, false);
  }],
  ['fetch timeout is actionable and ignores a late expired fetch result', async () => {
    const x = simulator(); x.visible(true); x.advance(31000); await flush();
    notice(x); x.get('#simMediaRetry').click(); assert.equal(x.requests.length, 2);
    await x.fetched(0); assert.equal(x.objectURLs.length, 0, 'timed-out request must not attach a late blob');
    await x.fetched(1); await x.metadata(); assert.equal(x.video.currentTime, 1); assert.equal(x.video.paused, false);
  }],
  ['metadata timeout after blob creation permits explicit retry', async () => {
    const x = simulator(); x.visible(true); await x.fetched(); const failedURL = x.video.src;
    x.advance(31000); await flush(); notice(x); assert.ok(x.revokedURLs.includes(failedURL));
    x.get('#simMediaRetry').click(); assert.equal(x.requests.length, 2);
    await x.fetched(); await x.metadata(); assert.equal(x.video.paused, false);
  }],
  ['muted autoplay rejection is bilingual and ready retry calls play synchronously', async () => {
    const x = simulator(); x.rejectPlay(); await x.load(); notice(x);
    assert.equal(x.video.muted, true); assert.match(x.get('#simMediaMessage').textContent, /tap|click|play|retry/i);
    const english = x.get('#simMediaMessage').textContent;
    x.get('#langToggle').click(); assert.match(x.get('#simMediaMessage').textContent, /点击|播放|重试/);
    assert.notEqual(x.get('#simMediaMessage').textContent, english);
    const before = x.playCalls.length; x.get('#simMediaRetry').click();
    assert.equal(x.playCalls.length, before + 1, 'play() must happen in the click stack to preserve activation');
    assert.equal(x.playCalls.at(-1).inClick, true); assert.equal(x.requests.length, 1);
    await flush(); assert.equal(x.video.paused, false); assert.equal(x.get('#simMediaNotice').hidden, true);
  }],
  ['offscreen completion keeps the latest seek without starting playback', async () => {
    const x = simulator(); x.visible(true); x.chip(2); x.visible(false);
    await x.fetched(); await x.metadata(); assert.equal(x.video.currentTime, 17);
    assert.equal(x.video.paused, true); assert.equal(x.playCalls.length, 0);
    x.visible(true); assert.equal(x.playCalls.length, 1); assert.equal(x.playCalls[0].time, 17); assert.equal(x.requests.length, 1);
  }],
  ['pagehide preserves a bfcache blob and revokes it on a real unload', async () => {
    const x = simulator(); await x.load(); const url = x.video.src;
    x.window.fire('pagehide', { persisted: true }); assert.equal(x.revokedURLs.includes(url), false);
    x.window.fire('pagehide', { persisted: false }); assert.equal(x.revokedURLs.filter(item => item === url).length, 1);
    assert.equal(x.video.paused, true);
  }]
];

(async () => {
  let failures = 0;
  for (const [name, run] of tests) {
    try { await run(); await flush(); console.log('PASS ' + name); }
    catch (error) { failures++; console.error('FAIL ' + name + ': ' + error.message); }
  }
  console.log(`${tests.length - failures}/${tests.length} passed`);
  process.exitCode = failures ? 1 : 0;
})();
