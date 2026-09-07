const { test } = require('node:test');
const assert = require('node:assert/strict');
const viewSource = require('../public/trace-view-source.js');
const { instrumentSource } = require('../trace-instrumenter.js');

function fixture() {
  return {
    variables: {
      arr: { id: 'arr', name: 'arr', kind: 'sequence', functionName: 'main' },
      i: { id: 'i', name: 'i', kind: 'scalar', functionName: 'main' }
    },
    frames: [
      { id: 'frame-0', source: { statementId: 'manual-frame:main:1:0', functionName: 'main', directiveKey: 'manual-frame:first:0' }, state: { arr: {}, i: {} } },
      { id: 'frame-1', source: { statementId: 'manual-frame:main:2:1', functionName: 'main', directiveKey: 'manual-frame:second:0' }, state: { arr: {}, i: {} } }
    ],
    skins: {
      arr: { renderer: 'original-array', options: { showIndex: false, gap: 0 } },
      i: { renderer: 'original-cell', options: { showIndex: false, gap: 0 } },
      'main:arr@old-offset': { renderer: 'original-array', options: { showIndex: true, gap: 0 } }
    },
    rules: [],
    studio: {
      codePanelPosition: { x: 0.36, y: 0.18 },
      positions: {
        'frame-0': { arr: { x: 10, y: 20 } },
        'deleted-frame': { arr: { x: 900, y: 900 } }
      },
      bindings: {}, visibility: {}, objectStyles: {}, eventStates: {},
      eventInstructionStates: {
        'assign:main:10:i++': false,
        'assign:main:11:i++': true,
        'fixed:main:arr@123:0': false,
        'fixed:main:arr@456:0': true
      },
      objects: [], arrows: [], transitions: [],
      cameraRules: [{
        id: 'camera-main', name: '鏡頭範圍', condition: null,
        zoom: 1.5, offsetX: 0, offsetY: 0, target: null,
        autoCapture: true, manualFrame: false,
        binding: { targetKey: 'arr', targetAnchor: 'center', dx: 0, dy: 0 },
        frameIds: ['frame-0', 'deleted-frame']
      }]
    },
    asmView: { skins: { stale: {} } }
  };
}

test('save-time view normalization removes stale/default data without mutating the live trace', () => {
  const trace = fixture();
  const before = JSON.stringify(trace);
  const settings = viewSource.fromTrace(trace);

  assert.equal(JSON.stringify(trace), before, 'normalization must work on a detached copy');
  assert.deepEqual(settings.skins, { arr: { options: { showIndex: false } } });
  assert.deepEqual(settings.studio.eventInstructionStates, {
    'assign:main:i++': true
  });
  assert.equal(settings.studio.objects, undefined);
  assert.equal(settings.studio.arrows, undefined);
  assert.equal(settings.studio.transitions, undefined);
  assert.deepEqual(settings.studio.codePanelPosition, { x: 0.36, y: 0.18 });
  assert.deepEqual(settings.studio.frameMaps.positions, [{
    sourceSelectors: [{ kind: 'manual-frame', functionName: 'main', directiveKey: 'manual-frame:first:0' }],
    value: { arr: { x: 10, y: 20 } }
  }]);
  assert.deepEqual(settings.studio.cameraRules[0], {
    id: 'camera-main', name: '鏡頭範圍', zoom: 1.5,
    binding: { targetVariable: { name: 'arr', functionName: 'main' } },
    sourceSelectors: [{ kind: 'manual-frame', functionName: 'main', directiveKey: 'manual-frame:first:0' }]
  });
});

test('camera scope and variable anchor survive inserted frames and shifted declarations', () => {
  const original = {
    variables: {
      'heapify:arr@100': { id: 'heapify:arr@100', name: 'arr', functionName: 'heapify' }
    },
    frames: [
      { id: 'old-a', source: { functionName: 'heapify', directiveKey: 'manual-frame:a:0' }, state: {} },
      { id: 'old-b', source: { functionName: 'heapify', directiveKey: 'manual-frame:b:0' }, state: { 'heapify:arr@100': {} } }
    ],
    rules: [], skins: {}, studio: {
      cameraRules: [{
        id: 'camera-b', frameIds: ['old-b'], manualFrame: true,
        centerX: 120, centerY: 90, zoom: 1.5,
        binding: { targetKey: 'heapify:arr@100', targetAnchor: 'center' }
      }]
    }
  };
  const settings = viewSource.fromTrace(original);
  const recompiled = {
    variables: {
      'heapify:arr@260': { id: 'heapify:arr@260', name: 'arr', functionName: 'heapify' }
    },
    frames: [
      { id: 'new-extra', source: { functionName: 'heapify', directiveKey: 'manual-frame:extra:0' }, state: {} },
      { id: 'new-a', source: { functionName: 'heapify', directiveKey: 'manual-frame:a:0' }, state: {} },
      { id: 'new-b', source: { functionName: 'heapify', directiveKey: 'manual-frame:b:0' }, state: { 'heapify:arr@260': {} } }
    ],
    rules: [], skins: {}, studio: {}
  };
  viewSource.applyToTrace(recompiled, settings);
  assert.deepEqual(recompiled.studio.cameraRules[0].frameIds, ['new-b']);
  assert.equal(recompiled.studio.cameraRules[0].binding.targetKey, 'heapify:arr@260');
});

test('camera selectors survive frame placement and presentation modifier changes', () => {
  const source = modifiers => instrumentSource(`
#include <vector>
int main() {
  int n = 1;
  std::vector<int> arr = {1};
  // @frame arr ${modifiers}
}`);
  const original = source('render heap with range(0,n)');
  const placed = source('render heap with range(0,n) at canvas.bottom offset(0,40)');
  assert.equal(original.frameDirectives[0].sourceKey, placed.frameDirectives[0].sourceKey,
    'placement-only edits keep the primary frame identity');
  assert.ok(original.frameDirectives[0].sourceKeyAliases.some(key => (
    placed.frameDirectives[0].sourceKeyAliases.includes(key)
  )), 'the new frame keeps a compatibility alias for the old full-text hash');

  const restyled = source('render stack with range(0,n) when n > 0 at canvas.bottom offset(0,40)');
  const savedSelector = viewSource.sourceSelector({
    source: {
      functionName: 'main',
      directiveKey: placed.frameDirectives[0].sourceKey,
      logicalDirectiveKey: placed.frameDirectives[0].logicalSourceKey
    }
  });
  assert.notEqual(placed.frameDirectives[0].sourceKey, restyled.frameDirectives[0].sourceKey);
  assert.equal(viewSource.sourceMatches({
    source: {
      functionName: 'main',
      directiveKey: restyled.frameDirectives[0].sourceKey,
      logicalDirectiveKey: restyled.frameDirectives[0].logicalSourceKey,
      directiveKeyAliases: restyled.frameDirectives[0].sourceKeyAliases
    }
  }, savedSelector), true, 'the logical fallback survives render, range and when edits');
});

test('loading removes unconditional camera rules fully shadowed by a later rule', () => {
  const trace = {
    variables: {},
    frames: [{
      id: 'frame-0',
      source: { functionName: 'main', directiveKey: 'manual-frame:main:0' },
      state: {}
    }],
    rules: [], skins: {}, studio: {}
  };
  viewSource.applyToTrace(trace, {
    version: 1,
    studio: {
      cameraRules: [
        { id: 'old-camera', zoom: 1.2, sourceSelectors: [{
          kind: 'manual-frame', functionName: 'main', directiveKey: 'manual-frame:main:0'
        }] },
        { id: 'new-camera', zoom: 1.6, sourceSelectors: [{
          kind: 'manual-frame', functionName: 'main', directiveKey: 'manual-frame:main:0'
        }] }
      ]
    }
  });
  assert.deepEqual(trace.studio.cameraRules.map(rule => rule.id), ['new-camera']);
});

test('Studio objects, arrows and per-frame maps survive shifted variable declarations', () => {
  const original = {
    variables: {
      'heapify:arr@100': { id: 'heapify:arr@100', name: 'arr', kind: 'sequence', functionName: 'heapify' },
      'heapify:i@120': { id: 'heapify:i@120', name: 'i', kind: 'scalar', functionName: 'heapify' }
    },
    frames: [{
      id: 'old-frame',
      source: { functionName: 'heapify', directiveKey: 'manual-frame:heap:0' },
      state: { 'heapify:arr@100': {}, 'heapify:i@120': {} }
    }],
    skins: { 'heapify:arr@100': { renderer: 'original-stack' } },
    rules: [{ id: 'style', match: { frameIds: ['old-frame'] }, actions: [{ variableId: 'heapify:arr@100' }] }],
    studio: {
      positions: { 'old-frame': { 'heapify:arr@100#1': { x: 30, y: 40 } } },
      bindings: { 'old-frame': { 'heapify:i@120': { targetKey: 'heapify:arr@100', targetAnchor: 'top' } } },
      visibility: { 'old-frame': { 'heapify:i@120:label': 'hidden' } },
      objectStyles: { 'old-frame': { 'heapify:arr@100:index': { fill: '#fff' } } },
      objects: [{
        id: 'marker', type: 'variable-marker', sourceVariableId: 'heapify:i@120',
        target: { variableId: 'heapify:arr@100', indexExpression: 'i' }, frameIds: ['old-frame']
      }],
      arrows: [{
        id: 'arrow', fromVariableId: 'heapify:i@120', toVariableId: 'heapify:arr@100',
        from: { variableId: 'heapify:i@120' }, to: { variableId: 'heapify:arr@100' },
        frameIds: ['old-frame']
      }]
    }
  };
  const settings = viewSource.fromTrace(original);
  assert.deepEqual(settings.variableReferences, {
    'heapify:arr@100': { name: 'arr', functionName: 'heapify' },
    'heapify:i@120': { name: 'i', functionName: 'heapify' }
  });

  const recompiled = {
    variables: {
      'heapify:arr@300': { id: 'heapify:arr@300', name: 'arr', kind: 'sequence', functionName: 'heapify' },
      'heapify:i@340': { id: 'heapify:i@340', name: 'i', kind: 'scalar', functionName: 'heapify' }
    },
    frames: [{
      id: 'new-frame',
      source: { functionName: 'heapify', directiveKey: 'manual-frame:heap:0' },
      state: { 'heapify:arr@300': {}, 'heapify:i@340': {} }
    }],
    skins: {}, rules: [], studio: {}
  };
  viewSource.applyToTrace(recompiled, settings);
  assert.equal(recompiled.skins['heapify:arr@300'].renderer, 'original-stack');
  assert.equal(recompiled.rules[0].actions[0].variableId, 'heapify:arr@300');
  assert.deepEqual(recompiled.studio.positions['new-frame']['heapify:arr@300#1'], { x: 30, y: 40 });
  assert.equal(recompiled.studio.bindings['new-frame']['heapify:i@340'].targetKey, 'heapify:arr@300');
  assert.equal(recompiled.studio.visibility['new-frame']['heapify:i@340:label'], 'hidden');
  assert.equal(recompiled.studio.objectStyles['new-frame']['heapify:arr@300:index'].fill, '#fff');
  assert.equal(recompiled.studio.objects[0].sourceVariableId, 'heapify:i@340');
  assert.equal(recompiled.studio.objects[0].target.variableId, 'heapify:arr@300');
  assert.equal(recompiled.studio.arrows[0].from.variableId, 'heapify:i@340');
  assert.equal(recompiled.studio.arrows[0].to.variableId, 'heapify:arr@300');

  const legacySettings = JSON.parse(JSON.stringify(settings));
  delete legacySettings.variableReferences;
  const legacyReload = JSON.parse(JSON.stringify(recompiled));
  legacyReload.skins = {};
  legacyReload.rules = [];
  legacyReload.studio = {};
  viewSource.applyToTrace(legacyReload, legacySettings);
  assert.equal(legacyReload.studio.objects[0].sourceVariableId, 'heapify:i@340');
  assert.equal(legacyReload.studio.bindings['new-frame']['heapify:i@340'].targetKey, 'heapify:arr@300');
});

test('manual frame source keys ignore line shifts and unrelated frame directives', () => {
  const first = instrumentSource(`
#include <vector>
int main() {
  std::vector<int> arr = {1};
  // @frame arr
}`);
  const shifted = instrumentSource(`
#include <vector>
int main() {
  std::vector<int> arr = {1};
  // unrelated source edit
  // @frame arr render heap
  // @frame arr
}`);
  assert.equal(first.frameDirectives[0].sourceKey, shifted.frameDirectives[1].sourceKey);
});

test('stable frame selectors use the runtime source function field', () => {
  const frame = {
    id: 'frame-runtime',
    source: {
      function: 'heapify',
      statementId: 'manual-frame:heapify:42:3',
      directiveKey: 'manual-frame:heap:0'
    }
  };
  const selector = viewSource.sourceSelector(frame);
  assert.deepEqual(selector, {
    kind: 'manual-frame', functionName: 'heapify', directiveKey: 'manual-frame:heap:0'
  });
  assert.equal(viewSource.sourceMatches(frame, selector), true);
  assert.equal(viewSource.sourceMatches(frame, {
    kind: 'manual-frame', functionName: 'heapify', directiveIndex: 3
  }), true, 'legacy directive-index selectors must still load');
});

test('old verbose settings still load, while the next saved trace snapshot is compact and detached', () => {
  const trace = fixture();
  const oldSettings = {
    version: 1,
    rules: [],
    skins: {
      arr: { renderer: 'original-array', options: { showIndex: false, gap: 0 } },
      'main:arr@old-offset': { renderer: 'original-array', options: { showIndex: true, gap: 0 } }
    },
    studio: {
      eventInstructionStates: { 'assign:main:99:i++': false },
      cameraRules: [{ id: 'old-camera', zoom: 2, frameIds: ['frame-0'] }]
    }
  };
  const loaded = fixture();
  loaded.studio = {};
  viewSource.applyToTrace(loaded, oldSettings);
  assert.equal(loaded.skins['main:arr@old-offset'].renderer, 'original-array');
  assert.equal(loaded.studio.cameraRules[0].id, 'old-camera');

  const compact = viewSource.compactTraceForSave(trace);
  assert.equal(compact.asmView, undefined);
  assert.equal(compact.viewSettingsApplied, true);
  assert.deepEqual(compact.skins, { arr: { options: { showIndex: false } } });
  assert.equal(compact.studio.positions['deleted-frame'], undefined);
  assert.deepEqual(compact.studio.eventInstructionStates, {
    'assign:main:i++': true
  });
  assert.deepEqual(compact.studio.codePanelPosition, { x: 0.36, y: 0.18 });
  compact.studio.positions['frame-0'].arr.x = 999;
  assert.equal(trace.studio.positions['frame-0'].arr.x, 10, 'saved trace must not share mutable state');
});
