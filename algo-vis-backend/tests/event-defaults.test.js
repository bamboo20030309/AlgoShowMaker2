const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function eventApi() {
  const context = vm.createContext({ window: {
    ASMTraceRules: { resolveExpression() { return null; } }
  } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/trace-events.js'), 'utf8'), context);
  return context.window.ASMTraceEvents;
}

test('initial event animation and timeline defaults match the Event Settings panel', () => {
  const api = eventApi();
  const enabled = new Set(['write', 'assign', 'compare', 'swap']);
  const document = { studio: { eventSettings: { defaultEnabled: {}, timelineTypes: {} } } };
  api.definitions.forEach(definition => {
    assert.equal(api.defaultEnabled({ type: definition.type }, document),
      definition.type === 'fixed' || enabled.has(definition.type),
      `${definition.type} animation default`);
    assert.equal(api.showTag(definition.type, document), enabled.has(definition.type),
      `${definition.type} timeline default`);
  });
});

test('saved event settings continue to override the initial defaults', () => {
  const api = eventApi();
  const document = { studio: { eventSettings: {
    autoFixedEnabled: false,
    defaultEnabled: { condition: true },
    timelineTypes: { condition: true }
  } } };
  assert.equal(api.defaultEnabled({ type: 'condition' }, document), true);
  assert.equal(api.showTag('condition', document), true);
  assert.equal(api.defaultEnabled({ type: 'fixed' }, document), false);
  assert.equal(api.showTag('fixed', document), false);
});

test('auto fixed state follows runtime identity across aliases and batches a frame', () => {
  const api = eventApi();
  const data = { kind: 'sequence', items: [1, 2, 3] };
  const document = {
    variables: {
      'main:arr@1': { name: 'arr', kind: 'sequence' },
      'visit:arr@2': { name: 'arr', kind: 'sequence' }
    },
    studio: {
      eventSettings: { autoFixedEnabled: true, defaultEnabled: {}, timelineTypes: {} },
      eventStates: {},
      eventInstructionStates: { 'fixed:visit:arr@2:0': false }
    },
    frames: [
      {
        id: 'frame-1', source: {},
        state: { 'visit:arr@2': { name: 'arr', identity: 'same-object', data } },
        events: [{ id: 'read-1', type: 'read', order: 1, targets: [
          { variableId: 'visit:arr@2', indexExpression: '0' }
        ] }]
      },
      {
        id: 'frame-2', source: {},
        state: { 'main:arr@1': { name: 'arr', identity: 'same-object', data } },
        events: [{ id: 'read-2', type: 'read', order: 1, targets: [
          { variableId: 'main:arr@1', indexExpression: '0' },
          { variableId: 'main:arr@1', indexExpression: '2' },
          { variableId: 'main:arr@1', indexExpression: '', resolvedIndex: null }
        ] }]
      }
    ]
  };
  api.rebuildAutoFixedEvents(document);
  api.applyEnabledStates(document);
  assert.equal(document.frames[0].events.some(event => event.type === 'fixed'), false,
    'a reference alias must not fix the cell before its actual final use');
  const fixed = document.frames[1].events.filter(event => event.type === 'fixed');
  assert.equal(fixed.length, 1, 'cells completed in one frame are one state batch');
  assert.deepEqual(Array.from(fixed[0].targets, target => target.resolvedIndex), [0, 2]);
  assert.equal(fixed[0].enabled, true);
  assert.equal(api.showInspector(fixed[0]), false);
  assert.equal(document.studio.eventInstructionStates['fixed:visit:arr@2:0'], false,
    'migration cleanup occurs when Studio serializes settings, not while normalizing playback');
});
