const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { compile, load } = require('./helpers/compile');
const fixture = require('./fixtures/sorting.json');
const plain = value => JSON.parse(JSON.stringify(value));

// Real model/editor/player/camera/Studio routing. Only SVG and UI edges are spies;
// this checks playback contracts, not visual pixel equality.
function surface(mode, rate) {
  const callbacks = new Map(), timers = new Map(), renders = [], cameras = [];
  const canvas = {};
  let serial = 0, studioOpen = mode === 'studio', resizeCallback = null;
  const promise = Promise.resolve();
  const c = vm.createContext({
    URLSearchParams, localStorage: { getItem: () => '' },
    location: { search: mode === 'runtime' ? '?asmEmbed=runtime' : '' },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    document: { documentElement: {}, getElementById: id => id === 'arraySvg' ? canvas : null, addEventListener() {},
      body: { classList: { contains: () => studioOpen } } },
    getComputedStyle: () => ({ getPropertyValue: () => rate }),
    ResizeObserver: class { constructor(callback) { resizeCallback = callback; } observe() {} },
    setTimeout: fn => { const id = ++serial; timers.set(id, fn); return id; },
    clearTimeout: id => timers.delete(id), requestAnimationFrame: fn => fn(),
    addEventListener(type, fn) { const list = callbacks.get(type) || []; list.push(fn); callbacks.set(type, list); },
    dispatchEvent(event) { for (const fn of callbacks.get(event.type) || []) fn(event); },
    setCamera: (...args) => cameras.push(['manual', ...args]),
    setAutoCamera: (...args) => cameras.push(['auto', ...args]),
    getCameraViewport: () => ({ centerX: 10, centerY: 20 }),
    ASMTraceRenderers: {
      renderFrame(doc, frame, previous, options) {
        renders.push(plain({ frame, previous: previous?.id, options }));
        return promise;
      },
      cameraObjectKey: key => key,
      currentAnchorForKey: () => ({ x: 100, y: 200 }),
      fitCurrentObjectsCamera: (...args) => { cameras.push(['fit', ...args]); return { centerX: 0, centerY: 0 }; }
    }
  });
  c.window = c;
  for (const name of ['trace-view-source.js', 'trace-model.js', 'trace-rules.js', 'trace-events.js',
    'trace-transitions.js', 'trace-camera.js', 'trace-player.js', 'algorithm-animation.js', 'trace-editor.js']) load(c, name);
  if (studioOpen) {
    const source = fs.readFileSync(path.join(__dirname, '../public/trace-studio.js'), 'utf8')
      .replace('window.ASMTraceStudio = {', `window.testStudio = {
        use(value) {
          trace = value;
          renderSelection = renderObjectStateEditor = renderBindingEditor = revealCurrentFrameInRail = () => {};
        },
        camera(index, animate, previous) { applyCameraForFrame(index, animate, 0, previous); }
      }; window.ASMTraceStudio = {`);
    vm.runInContext(source, c);
    c.ASMTraceStudio.open = () => {};
  }
  return { c, cameras, renders, promise,
    resize(width, height) { resizeCallback?.([{ target: canvas, contentRect: { width, height } }]); },
    flush() { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); },
    load(animation) {
      c.ASMTraceEditor.loadAnimation(plain(animation));
      c.testStudio?.use(c.ASMTracePlayer.getDocument());
      this.flush();
      cameras.length = renders.length = 0;
    }
  };
}

for (const name of ['bubble', 'insertion']) test(`${name}: save/reopen routes identical frames, events and camera across three surfaces`, async () => {
  const code = fs.readFileSync(path.join(__dirname, 'fixtures', name + '.cpp'), 'utf8');
  const { trace } = await compile(code, fixture.input);
  trace.studio.eventSettings = { gapMs: 300, defaultEnabled: {}, timelineTypes: {} };
  trace.studio.cameraRules = [{ id: 'authored', manualFrame: true, centerX: 120, centerY: 90, zoom: 1.4 }];
  trace.studio.positions = { [trace.frames[0].id]: { arr: { x: 40, y: 50 } } };
  const saved = JSON.parse(JSON.stringify({ mode: 'trace', code, input: fixture.input, traceDocument: trace }));
  for (const rate of [1.2, 2]) {
    const surfaces = ['algorithm', 'studio', 'runtime'].map(mode => surface(mode, rate));
    for (const s of surfaces) {
      s.load(saved);
      assert.equal(s.c.ASMTracePlayer.getDocument().provenance.engineVersion, 1);
      // Sequential forward playback, then previous and jump/replay paths.
      for (let i = 1; i < trace.frames.length; i++) {
        const completion = s.c.CodeScript.next();
        assert.equal(completion, s.promise, 'controls must receive and await renderer completion');
        await completion; s.flush();
      }
      await s.c.CodeScript.prev(); s.flush();
      await s.c.CodeScript.reset(); s.flush();
      await s.c.CodeScript.goto(2); s.flush();
      assert.equal(s.c.ASMTracePlayer.getCurrentFrame(), 2);
      assert.deepEqual(plain(s.c.ASMTracePlayer.getDocument().studio), plain(trace.studio));
    }
    for (const s of surfaces.slice(1)) {
      assert.deepEqual(s.renders, surfaces[0].renders);
      assert.deepEqual(s.cameras, surfaces[0].cameras);
    }
    assert.equal(surfaces[0].cameras[0].at(-1), 520 / rate);
  }
});

test('shared camera handles auto capture, keep, bindings and instant editing', () => {
  const s = surface('studio', 2);
  const frame = { id: 'f', keepLastFocus: true, state: {} };
  const trace = { frames: [frame], studio: { cameraRules: [] } };
  s.c.ASMTraceCamera.apply(trace, frame, null, false);
  assert.deepEqual(s.cameras.pop(), ['fit', .92, false, 260, 0, 0, true]);
  trace.studio.cameraRules = [{ manualFrame: true, centerX: 1, centerY: 2, zoom: 2,
    binding: { targetKey: 'arr', dx: 3, dy: 4 } }];
  s.c.ASMTraceCamera.apply(trace, frame, null, false);
  assert.deepEqual(s.cameras.pop(), ['manual', 103, 204, 2, false, 260]);
});

test('camera is recalculated after a hidden slide iframe receives its final size', () => {
  const s = surface('runtime', 1);
  const trace = {
    frames: [{ id: 'frame-0', state: {} }],
    studio: { cameraRules: [{ manualFrame: true, centerX: 40, centerY: 50, zoom: 1.6 }] }
  };
  s.c.ASMTracePlayer.apply(trace);
  s.flush();
  s.cameras.length = 0;
  s.resize(0, 0);
  assert.equal(s.cameras.length, 0, 'hidden zero-sized iframe must not commit a camera');
  s.resize(1280, 720);
  assert.deepEqual(s.cameras.pop(), ['manual', 40, 50, 1.6, false, 520]);
});
