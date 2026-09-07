const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the renderer's binding adapter without adding a public test API.
const source = fs.readFileSync(path.join(__dirname, '../public/trace-renderer.js'), 'utf8')
  .replace('window.ASMTraceRenderers = {',
    'window.ASMTraceRenderers = { renderFrameBindings, keepArrowObjectKey,')
  .replace('if (objects.length) renderStudioObjects(root, document, frame, placements, elements, options, objects);',
    'root.objects = objects;');
const context = vm.createContext({ window: {}, document: { documentElement: { dataset: {} } } });
vm.runInContext(source, context);

test('keep arrows retain identity across recursive reference variable IDs', () => {
  const key = context.window.ASMTraceRenderers.keepArrowObjectKey;
  assert.equal(
    key('init', 'container-arr', 'heapify:arr@parent'),
    key('init', 'container-arr', 'heapify:arr@child')
  );
  assert.notEqual(
    key('init', 'container-arr', 'heapify:arr@parent'),
    key('init', 'different-arr', 'heapify:arr@child')
  );
  assert.notEqual(
    key('init', '', 'heapify:arr@parent'),
    key('init', '', 'heapify:arr@child')
  );
});

function bindings({ cells, values = { i: null }, count = 5, virtual = [], objectId = '' }) {
  context.window.ASMTraceRules = { resolveExpression: (doc, frame, expr) => values[expr] };
  const key = objectId || 'arr';
  const placements = new Map(cells.map(([index, x, y, width = 40]) =>
    [`${key}#${index}`, { x, y, width, height: 40 }]));
  const elements = new Map([...placements.keys()].map(id => [id, { closest: () => null }]));
  for (const [index, x, y] of virtual) placements.set(`${key}#${index}`, { x, y, width: 40, height: 40 });
  const before = [...placements.keys()];
  const frame = {
    source: objectId ? { objectId, primaryVariableId: 'arr' } : {},
    state: { arr: { identity: 'runtime-arr', data: { kind: 'sequence', items: Array(count).fill(1) } } },
    bindings: Object.keys(values).map(name => ({ mode: 'index', sourceVariableId: name,
      sourceName: name, targetVariableId: 'arr', indexExpression: name }))
  };
  const root = {};
  context.window.ASMTraceRenderers.renderFrameBindings(root, { variables: {} }, frame, placements, elements);
  return { objects: root.objects || [], placements, before };
}

function checkUnknown(result, left, top, names) {
  assert.equal(result.objects.length, names.length);
  const boxes = result.objects.map(object => {
    assert.equal(object.markerUnresolved, true);
    assert.equal(object.target, undefined);
    assert.equal(object.pointerTarget, undefined);
    const p = object.markerPlacement;
    assert.equal(p.y - 40, top - 40, 'same label height as reference cell');
    return { name: object.text, center: p.x + p.width / 2 + object.offsetX };
  }).sort((a, b) => a.center - b.center);
  assert.deepEqual(Array.from(boxes, box => box.name), names);
  assert.equal(boxes.at(-1).center + 9, left - 8);
  for (let i = 1; i < boxes.length; i++) assert.equal(boxes[i].center - boxes[i - 1].center, 26);
  assert.deepEqual([...result.placements.keys()], result.before, 'no fake cell placements');
}

test('unknown marker stays left of horizontal array at the same height', () => {
  checkUnknown(bindings({ cells: [[0, 100, 80], [1, 140, 80]] }), 100, 80, ['i']);
});
test('heap uses visual left edge, not the smallest index', () => {
  checkUnknown(bindings({ cells: [[1, 160, 40], [2, 80, 120], [3, 240, 120], [4, 20, 200]],
    values: { j: undefined, i: null } }), 20, 200, ['i', 'j']);
});
test('stack uses the uppermost cell when left edges tie', () => {
  checkUnknown(bindings({ cells: [[0, 100, 200], [1, 100, 140], [2, 100, 80]] }), 100, 80, ['i']);
});
test('single visible wide cell, nonzero range and object alias', () => {
  checkUnknown(bindings({ cells: [[3, -50, 35, 120]], values: { j: NaN, i: null }, objectId: 'named-array' }),
    -50, 35, ['i', 'j']);
});
test('decorations and virtual out-of-range cells are not reference cells', () => {
  checkUnknown(bindings({ cells: [[2, 100, 80]], virtual: [[-1, -100, 20], [6, -200, 10]] }), 100, 80, ['i']);
  assert.equal(bindings({ cells: [], virtual: [[-1, 0, 0]] }).objects.length, 0);
  assert.equal(bindings({ cells: [], count: 0 }).objects.length, 0);
});
test('known zero, out-of-range and hidden indices retain their existing behavior', () => {
  const zero = bindings({ cells: [[0, 100, 80], [1, 140, 80]], values: { i: 0 } });
  assert.equal(zero.objects[0].target.indexExpression, '0');
  assert.equal(zero.objects[0].markerUnresolved, undefined);
  const outside = bindings({ cells: [[0, 100, 80], [1, 140, 80]], values: { i: -1 } });
  assert.equal(outside.placements.get('arr#-1').x, 60);
  assert.equal(outside.objects[0].target.indexExpression, '-1');
  assert.equal(bindings({ cells: [[2, 100, 80]], values: { i: 1 } }).objects.length, 0);
});
test('unknown and known markers stay in separate groups and retain IDs when resolving', () => {
  const cells = [[0, 100, 80], [1, 140, 80]];
  const before = bindings({ cells, values: { i: null, j: 0 } });
  const after = bindings({ cells, values: { i: 1, j: 0 } });
  assert.equal(before.objects.find(o => o.text === 'i').id, after.objects.find(o => o.text === 'i').id);
  assert.equal(before.objects.find(o => o.text === 'j').offsetX, 0);
  assert.equal(after.objects.find(o => o.text === 'i').target.indexExpression, '1');
  assert.equal(
    before.objects.find(o => o.text === 'i').sourceVisualContinuityKey,
    after.objects.find(o => o.text === 'i').sourceVisualContinuityKey
  );
});

test('recursive automatic markers keep visual continuity without merging runtime identities', () => {
  const tweenSource = fs.readFileSync(path.join(__dirname, '../public/trace-frame-tween.js'), 'utf8')
    .replace('window.ASMTraceFrameTween = {', 'window.ASMTraceFrameTween = { markerActivationChanged,');
  vm.runInContext(tweenSource, context);
  const marker = (runtimeIdentity, continuityKey) => ({
    dataset: {
      traceSourceVariableId: 'heapify:i',
      traceRuntimeIdentity: runtimeIdentity,
      traceVisualContinuityKey: continuityKey
    }
  });
  const parent = marker('activation-parent', 'auto-marker:heapify:i:heapify:arr:0');
  const child = marker('activation-child', 'auto-marker:heapify:i:heapify:arr:0');
  assert.equal(context.window.ASMTraceFrameTween.markerActivationChanged(child, parent), false);
  assert.notEqual(child.dataset.traceRuntimeIdentity, parent.dataset.traceRuntimeIdentity);
  assert.equal(context.window.ASMTraceFrameTween.markerActivationChanged(
    marker('activation-child', 'auto-marker:other:i:arr:0'), parent
  ), true);
});

test('automatic marker continuity does not depend on binding order', () => {
  const cells = [[0, 100, 80], [1, 140, 80]];
  const first = bindings({ cells, values: { i: 1, j: 0 } });
  const reordered = bindings({ cells, values: { j: 0, i: 1 } });
  const firstI = first.objects.find(object => object.text === 'i');
  const reorderedI = reordered.objects.find(object => object.text === 'i');
  assert.notEqual(firstI.id, reorderedI.id, 'render IDs still describe the current binding slot');
  assert.equal(firstI.sourceVisualContinuityKey, reorderedI.sourceVisualContinuityKey);
});

test('a consecutive recursive marker with a different render ID skips entrance', () => {
  const tweenSource = fs.readFileSync(path.join(__dirname, '../public/trace-frame-tween.js'), 'utf8')
    .replace('window.ASMTraceFrameTween = {',
      'window.ASMTraceFrameTween = { markerContinuationFor, markerNeedsEntrance,');
  vm.runInContext(tweenSource, context);
  const continuityKey = 'auto-marker:heapify:i:heapify:arr:i:0';
  const previous = {
    dataset: {
      traceObjectKey: 'old-marker-id',
      traceSourceVariableId: 'heapify:i',
      traceRuntimeIdentity: 'activation-parent',
      traceVisualContinuityKey: continuityKey
    }
  };
  const current = {
    dataset: {
      traceObjectKey: 'new-marker-id',
      traceSourceVariableId: 'heapify:i',
      traceRuntimeIdentity: 'activation-child',
      traceVisualContinuityKey: continuityKey
    }
  };
  const previousPlacements = new Map([['old-marker-id', { x: 100, y: 80 }]]);
  const previousObjects = new Map([['old-marker-id', previous]]);
  const continuation = context.window.ASMTraceFrameTween.markerContinuationFor(
    current, 'new-marker-id', previousPlacements, previousObjects
  );
  assert.equal(continuation.key, 'old-marker-id');
  assert.deepEqual({ ...continuation.placement }, { x: 100, y: 80 });
  assert.equal(context.window.ASMTraceFrameTween.markerNeedsEntrance({
    element: current,
    key: 'new-marker-id',
    previousPlacements,
    previousObjects,
    currentAutomaticMarkers: new Set(['new-marker-id']),
    previousAutomaticMarkers: new Set(['old-marker-id'])
  }), false);
  assert.equal(context.window.ASMTraceFrameTween.markerNeedsEntrance({
    element: current,
    key: 'new-marker-id',
    previousPlacements: new Map(),
    previousObjects: new Map(),
    currentAutomaticMarkers: new Set(['new-marker-id'])
  }), true, 'a real visibility gap still enters');
});

test('recursive marker movement is a blocking playback phase before trace events', () => {
  const continuityKey = 'auto-marker:heapify:i:heapify:arr:0';
  const previous = {
    dataset: {
      traceObjectKey: 'marker-i',
      traceSourceVariableId: 'heapify:i',
      traceRuntimeIdentity: 'activation-parent',
      traceVisualContinuityKey: continuityKey
    },
    getAttribute: () => null
  };
  const current = {
    dataset: {
      traceObjectKey: 'marker-i',
      traceSourceVariableId: 'heapify:i',
      traceRuntimeIdentity: 'activation-child',
      traceVisualContinuityKey: continuityKey
    },
    getAttribute: () => null
  };
  const steps = context.window.ASMTraceFrameTween.recursiveMarkerTransitionSteps({
    previousPlacements: new Map([['marker-i', { x: 100, y: 80 }]]),
    currentPlacements: new Map([['marker-i', { x: 220, y: 160 }]]),
    previousObjects: new Map([['marker-i', previous]]),
    currentElements: new Map([['marker-i', current]]),
    transitionForKey: () => ({ mode: 'move', duration: 360 }),
    duration: 520
  });
  assert.equal(steps.length, 1);
  assert.equal(steps[0].subtype, 'recursive-marker-move');
  assert.equal(steps[0].durationMs, 360);
  assert.equal(steps[0].blocking, true);
  assert.deepEqual({ ...steps[0].from }, { x: 100, y: 80 });
  assert.deepEqual({ ...steps[0].to }, { x: 220, y: 160 });

  const preEvent = context.window.ASMTraceFrameTween.createPlaybackPlan({
    frame: { id: 'frame-child' },
    direction: 1,
    runId: 7,
    transitionSteps: steps,
    enteringMarkerKeys: ['marker-new']
  });
  assert.equal(preEvent.phases[0].id, 'frame-transition');
  assert.equal(preEvent.phases[0].mode, 'parallel');
  assert.equal(preEvent.phases[1].startMs, 360);
  assert.equal(preEvent.preEventDurationMs, 580);

  const event = { id: 'event-42', type: 'assign', order: 42 };
  const plan = context.window.ASMTraceFrameTween.createPlaybackPlan({
    frame: { id: 'frame-child' },
    direction: 1,
    runId: 7,
    transitionSteps: steps,
    enteringMarkerKeys: ['marker-new'],
    eventTimeline: [{ event, type: 'assign', animation: 'assign', start: 580, duration: 240, end: 820 }]
  });
  assert.equal(plan.phases[2].id, 'trace-events');
  assert.equal(plan.phases[2].startMs, 580);
  assert.equal(plan.phases[2].steps[0].eventOrder, 42);
  assert.equal(plan.totalDurationMs, 820);

  const eventControlled = context.window.ASMTraceFrameTween.recursiveMarkerTransitionSteps({
    previousPlacements: new Map([['marker-i', { x: 100, y: 80 }]]),
    currentPlacements: new Map([['marker-i', { x: 220, y: 160 }]]),
    previousObjects: new Map([['marker-i', previous]]),
    currentElements: new Map([['marker-i', current]]),
    eventControlledKeys: new Set(['marker-i'])
  });
  assert.equal(eventControlled.length, 0, 'event-controlled motion must keep its trace-event slot');
});

test('assignment retains the parked arrow until motion starts, then reaches the real cell', () => {
  const tweenSource = fs.readFileSync(path.join(__dirname, '../public/trace-frame-tween.js'), 'utf8')
    .replace('window.ASMTraceFrameTween = {', 'window.ASMTraceFrameTween = { markerAssignmentMotion,');
  context.window.ASMTraceRules = { resolveExpression: (doc, frame, expr, locals) => Number(locals.i) };
  vm.runInContext(tweenSource, context);
  const element = {
    dataset: { traceBindingTarget: 'arr#2', traceSourceVariableId: 'i', traceMarkerIndexExpression: 'i' },
    getAttribute: name => name === 'transform' ? 'translate(180,120)' : null
  };
  const previousVisual = {
    dataset: { traceMarkerUnresolved: '1', traceMarkerTargetX: '63', traceMarkerTargetY: '60' },
    getAttribute: name => name === 'transform' ? 'translate(63,40)' : null
  };
  const entry = { key: 'marker', element, previousVisual, markerPointPath: {},
    markerLabelBox: { getAttribute: () => '18' } };
  const placements = new Map([['arr#2', { x: 160, y: 120, width: 40, height: 40 }]]);
  const event = { type: 'assign', targets: [{ variableId: 'i', role: 'target' }],
    payload: { before: 0.5, after: 2 } };
  const motion = context.window.ASMTraceFrameTween.markerAssignmentMotion(
    { variables: { i: { name: 'i' } } }, {},
    [{ animation: 'assign', event, start: 0, motionStart: 100, end: 200 }],
    placements, new Map([['marker', element]]), [entry]);
  motion.update(99);
  assert.deepEqual({ ...motion.arrowStates.get('marker') }, { x: 63, y: 40, targetX: 63, targetY: 60 });
  motion.update(150);
  assert.ok(motion.arrowStates.get('marker').x > 63);
  assert.ok(motion.arrowStates.get('marker').x < 180);
  motion.update(200);
  assert.deepEqual({ ...motion.arrowStates.get('marker') }, { x: 180, y: 120, targetX: 180, targetY: 140 });
  motion.finish();
  assert.equal(motion.adjustments.size, 0);
});

test('compare marker followers use the original rendered binding rule', () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/trace-frame-tween.js'), 'utf8');
  assert.doesNotMatch(source, /function markerMatchesCompareOperand\(/);
  assert.doesNotMatch(source, /markerMotion\.targetStates/);
  assert.match(source,
    /const targetKey = element\?\.dataset\?\.traceBindingTarget;[\s\S]*?this\.logicalAdjustments\.has\(targetKey\)/);
});

test('a disabled marker assignment still updates logical position after earlier comparisons', () => {
  const tweenSource = fs.readFileSync(path.join(__dirname, '../public/trace-frame-tween.js'), 'utf8')
    .replace('window.ASMTraceFrameTween = {',
      'window.ASMTraceFrameTween = { markerAssignmentMotion,');
  context.window.ASMTraceRules = {
    resolveExpression: (doc, frame, expr, locals) => Number(locals[expr])
  };
  vm.runInContext(tweenSource, context);
  const marker = {
    dataset: {
      traceBindingTarget: 'arr#1',
      traceSourceVariableId: 'i',
      traceMarkerIndexExpression: 'i'
    },
    getAttribute: name => name === 'transform' ? 'translate(140,120)' : null
  };
  const previous = {
    dataset: { traceBindingTarget: 'arr#0' },
    getAttribute: name => name === 'transform' ? 'translate(120,120)' : null
  };
  const entry = {
    key: 'marker-i', element: marker, previousVisual: previous,
    markerPointPath: {}, markerLabelBox: { getAttribute: () => '18' }
  };
  const compare = {
    id: 'compare-before-increment', order: 1, type: 'compare', enabled: true,
    targets: [{ variableId: 'arr', indexExpression: '1' }]
  };
  const hiddenIncrement = {
    id: 'hidden-i-increment', order: 2, type: 'assign', enabled: false,
    targets: [{ variableId: 'i', role: 'target' }],
    payload: { before: 0, after: 1 }
  };
  const eventFrame = { events: [compare, hiddenIncrement] };
  const placements = new Map([
    ['arr#0', { x: 100, y: 120, width: 40, height: 40 }],
    ['arr#1', { x: 140, y: 120, width: 40, height: 40 }]
  ]);
  const motion = context.window.ASMTraceFrameTween.markerAssignmentMotion(
    { variables: { i: { name: 'i' } } }, eventFrame,
    [{ animation: 'compare', event: compare, start: 0, end: 100 }],
    placements, new Map([['marker-i', marker]]), [entry]
  );

  motion.update(50);
  assert.equal(motion.arrowStates.get('marker-i').x, 120);

  motion.update(100);
  assert.equal(motion.arrowStates.get('marker-i').x, 140,
    'disabled animation still commits the logical marker state without adding duration');
});

test('a second unknown marker stays parked until its own assignment', () => {
  context.window.ASMTraceRules = {
    resolveExpression: (doc, frame, expr, locals) => {
      const value = Number(locals[expr]);
      return value === 0 ? null : value;
    }
  };
  const entries = ['i', 'j'].map((name, index) => ({
    key: name,
    element: {
      dataset: { traceBindingTarget: `arr#${index + 2}`, traceSourceVariableId: name,
        traceMarkerIndexExpression: name, traceMarkerSortKey: name },
      getAttribute: () => `translate(${180 + index * 40},120)`
    },
    previousVisual: {
      dataset: { traceMarkerUnresolved: '1', traceMarkerTargetX: String(37 + index * 26), traceMarkerTargetY: '60' },
      getAttribute: () => `translate(${37 + index * 26},40)`
    },
    markerPointPath: {}, markerLabelBox: { getAttribute: () => '18' }
  }));
  const slots = ['i', 'j'].map((name, index) => ({
    animation: 'assign', start: index * 300, motionStart: index * 300 + 100, end: index * 300 + 200,
    event: { type: 'assign', targets: [{ variableId: name, role: 'target' }], payload: { before: 0, after: index + 2 } }
  }));
  const motion = context.window.ASMTraceFrameTween.markerAssignmentMotion(
    { variables: { i: { name: 'i' }, j: { name: 'j' } } }, {}, slots,
    new Map([[ 'arr#2', { x: 160, y: 120, width: 40, height: 40 } ],
      [ 'arr#3', { x: 200, y: 120, width: 40, height: 40 } ]]),
    new Map(entries.map(entry => [entry.key, entry.element])), entries);
  motion.update(250);
  assert.equal(motion.arrowStates.get('i').x, 180);
  assert.deepEqual({ ...motion.arrowStates.get('j') }, { x: 63, y: 40, targetX: 63, targetY: 60 });
  motion.update(399);
  assert.equal(motion.arrowStates.get('j').x, 63);
  motion.update(500);
  assert.equal(motion.arrowStates.get('j').x, 220);
});
