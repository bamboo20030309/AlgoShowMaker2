const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const plain = value => JSON.parse(JSON.stringify(value));

function context(mode = 'editor') {
  const listeners = new Map();
  const messages = [];
  const input = { value: '' };
  const c = vm.createContext({
    URLSearchParams, setTimeout() {}, clearTimeout() {},
    requestAnimationFrame(callback) { callback(); return 1; },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    dispatchEvent() {},
    location: { origin: 'http://localhost:3000', search: `?asmEmbed=${mode}` },
    localStorage: { getItem: () => '' },
    document: { addEventListener() {}, body: { classList: { add() {} } },
      getElementById: id => id === 'inputArea' ? input : null },
    addEventListener: (type, fn) => listeners.set(type, fn),
    parent: { postMessage: value => messages.push(plain(value)) },
    aceEditor: { value: '', getValue() { return this.value; }, setValue(value) { this.value = value; } }
  });
  c.window = c;
  c.load = name => vm.runInContext(fs.readFileSync(path.join(__dirname, '../public', name), 'utf8'), c);
  for (const name of ['algorithm-animation.js', 'trace-view-source.js', 'trace-events.js', 'trace-rules.js', 'trace-model.js']) c.load(name);
  c.asmApplyTraceDocument = source => c.ASMTraceModel.normalizeTraceDocument(source);
  return { c, messages, input, send: data => listeners.get('message')({ origin: c.location.origin, data }) };
}

function savedTrace() {
  return { sliceMode: 'manual', variables: {},
    frames: [{ id: 'frame-0', state: {}, events: [{ id: 'event-1', signature: 'j++', type: 'write', update: true, order: 1 }] }],
    skins: { arr: { renderer: 'original-stack' } }, rules: [{ id: 'new-rule' }],
    studio: { positions: { 'frame-0': { arr: { x: 80, y: 120 } } },
      cameraRules: [{ id: 'new-camera', zoom: 2 }], eventInstructionStates: { 'j++': true },
      eventSettings: { gapMs: 740, defaultEnabled: { write: true }, timelineTypes: { write: true } } },
    asmView: { version: 1, rules: [], skins: { arr: { renderer: 'original-array' } },
      studio: { cameraRules: [{ id: 'old-camera', zoom: 0.5 }], eventInstructionStates: { 'j++': false } } }
  };
}

test('normalization applies source view once, preserving later Studio edits and event settings', () => {
  const { c } = context();
  const first = c.ASMTraceModel.normalizeTraceDocument(savedTrace());
  assert.equal(first.studio.cameraRules[0].id, 'old-camera', 'fresh compile imports source view');
  first.studio.cameraRules[0].id = 'edited-camera';
  first.studio.eventInstructionStates['j++'] = true;
  first.studio.eventSettings = { gapMs: 740 };
  const reloaded = c.ASMTraceModel.normalizeTraceDocument(first);
  assert.equal(reloaded.studio.cameraRules[0].id, 'edited-camera');
  assert.equal(reloaded.studio.eventSettings.gapMs, 740);
  assert.equal(reloaded.frames[0].events[0].enabled, true);
});

test('old saved trace wins over its original asm-view and stale top-level copies in both modes', () => {
  const original = savedTrace();
  const results = ['editor', 'runtime'].map(mode => {
    const { c } = context(mode);
    c.load('trace-editor.js');
    c.ASMTraceEditor.loadAnimation({ mode: 'legacy', traceDocument: original, skins: {}, rules: [], scriptContent: 'old();' });
    return plain(c.ASMTraceEditor.snapshot().traceDocument);
  });
  assert.deepEqual(results[0], results[1]);
  assert.equal(results[0].studio.cameraRules[0].id, 'new-camera');
  assert.equal(results[0].skins.arr.renderer, 'original-stack');
  assert.equal(results[0].rules[0].id, 'new-rule');
  assert.equal(results[0].studio.eventSettings.gapMs, 740);
  assert.equal(results[0].frames[0].events[0].enabled, true);
  assert.equal(original.viewSettingsApplied, undefined, 'do not mutate stored deck during loading');
});

test('editor and slide runtime recover the generation source for the shared code presenter', () => {
  const trace = savedTrace();
  delete trace.sourceCode;
  const code = 'int main() { int i = 0; i++; }';
  const results = ['editor', 'runtime'].map(mode => {
    const { c } = context(mode);
    c.load('trace-editor.js');
    c.ASMTraceEditor.loadAnimation({ mode: 'trace', code, traceDocument: trace });
    return c.ASMTraceEditor.snapshot().traceDocument.sourceCode;
  });
  assert.deepEqual(results, [code, code]);
  assert.equal(trace.sourceCode, undefined, 'loading must not mutate the saved deck object');
});

test('compacted default skins restore the original array outerframe in both slide modes', () => {
  const compacted = {
    schemaVersion: '1.0',
    viewSettingsApplied: true,
    sliceMode: 'manual',
    variables: {
      arr: { id: 'arr', name: 'arr', kind: 'sequence', functionName: 'main' }
    },
    frames: [{
      id: 'frame-0', source: { function: 'main', primaryVariableId: 'arr' },
      state: { arr: { name: 'arr', data: { kind: 'sequence', items: [] } } },
      events: []
    }],
    skins: {}, rules: [], studio: {}
  };
  const renderers = ['editor', 'runtime'].map(mode => {
    const { c } = context(mode);
    let appliedTrace = null;
    c.asmApplyTraceDocument = source => {
      appliedTrace = c.ASMTraceModel.normalizeTraceDocument(source);
      return appliedTrace;
    };
    c.load('trace-editor.js');
    c.ASMTraceEditor.loadAnimation({ mode: 'trace', traceDocument: compacted });
    return appliedTrace.skins.arr.renderer;
  });
  assert.deepEqual(renderers, ['original-array', 'original-array']);
});

test('line-number changes do not alter saved instruction switches in editor or slide runtime', () => {
  const trace = savedTrace();
  trace.viewSettingsApplied = true;
  trace.frames[0].events[0] = {
    id: 'event-1', order: 1, type: 'assign', animate: true,
    signature: 'assign:heapify:24:largest = l', expression: 'largest = l'
  };
  trace.studio.eventInstructionStates = {
    'assign:heapify:22:largest = l': false
  };
  const results = ['editor', 'runtime'].map(mode => {
    const { c } = context(mode);
    c.load('trace-editor.js');
    c.ASMTraceEditor.loadAnimation({ mode: 'trace', traceDocument: trace });
    return c.ASMTraceEditor.snapshot().traceDocument.frames[0].events[0].enabled;
  });
  assert.deepEqual(results, [false, false]);

  const { c } = context();
  assert.equal(
    c.ASMTraceEvents.canonicalInstructionKey('fixed:heapify:arr@198:10'),
    'fixed:heapify:arr:10'
  );
});

test('trace loading never runs the cached legacy script, but legacy-only animations still work', () => {
  const { c, send, messages } = context('runtime');
  let loads = 0, scripts = 0, arrowResets = 0;
  c.ASMTraceEditor = { loadAnimation() { loads++; } };
  c.asmApplyAnimationScript = () => scripts++;
  c.resetArrows = () => arrowResets++;
  c.load('slides-embed.js');
  send({ type: 'asm-load-animation', animation: { traceDocument: savedTrace(), scriptContent: 'old();' } });
  assert.equal(loads, 1); assert.equal(scripts, 0); assert.equal(arrowResets, 1);
  assert.equal(messages.filter(message => message.type === 'asm-animation-applied').length, 1);
  send({ type: 'asm-load-animation', animation: { mode: 'legacy', scriptContent: 'legacy();' } });
  assert.equal(scripts, 1); assert.equal(arrowResets, 2);
  assert.equal(messages.filter(message => message.type === 'asm-animation-applied').length, 2);
});

test('saving flushes pending edits before capturing both code and playback data', () => {
  const { c, send, messages } = context();
  const trace = savedTrace();
  const order = [];
  c.ASMTraceFrameTween = { cancel() { order.push('cancel'); } };
  c.resetArrows = () => order.push('reset-arrows');
  c.ASMTraceEditor = { snapshot: () => {
    order.push('snapshot');
    return { mode: 'trace', traceDocument: trace };
  } };
  c.ASMTraceStudio = { flushSourceSettings() {
    order.push('flush-settings');
    trace.studio.positions['frame-0'].arr.x = 200;
    c.aceEditor.value = 'code with latest @asm-view';
  } };
  c.load('slides-embed.js');
  send({ type: 'asm-request-save-animation' });
  const saved = messages[0].animation;
  assert.equal(saved.code, 'code with latest @asm-view');
  assert.equal(saved.traceDocument.studio.positions['frame-0'].arr.x, 200);
  assert.deepEqual(order, ['cancel', 'reset-arrows', 'flush-settings', 'snapshot']);
  trace.studio.positions['frame-0'].arr.x = 999;
  assert.equal(saved.traceDocument.studio.positions['frame-0'].arr.x, 200, 'saved data is detached');
});
