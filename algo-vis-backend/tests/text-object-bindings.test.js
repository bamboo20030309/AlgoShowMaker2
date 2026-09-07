const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { findFrameDirectives } = require('../trace-instrumenter');
const { compile } = require('./helpers/compile');

const source = `
#include <bits/stdc++.h>
using namespace std;
int main() {
  vector<int> arr = {3, 1, 2};
  // @frame arr
  // @keep arr as "init"
  // @frame arr
  // @text "variable" at arr.top
  // @text "keep" at init.top
  // @text "studio" at note.top
  // @text "canvas" at canvas.top
}
/* @asm-view
{
  "version": 1,
  "studio": {
    "objects": [{
      "id": "note",
      "type": "label",
      "text": "note",
      "target": { "objectKey": "arr", "anchor": "center" }
    }]
  }
}
@asm-view */
`;

test('@text at resolves variables before canvas object IDs', () => {
  const frame = findFrameDirectives(source).at(-1);
  const [variableText, keepText, studioText, canvasText] = frame.texts;
  assert.ok(variableText.binding.targetVariableId);
  assert.equal(variableText.binding.targetObjectKey, undefined);
  assert.equal(keepText.binding.targetVariableId, undefined);
  assert.equal(keepText.binding.targetObjectKey, 'init');
  assert.equal(studioText.binding.targetObjectKey, 'note');
  assert.equal(canvasText.binding.canvas, true);
});

test('@text at keep and Studio IDs survives trace generation', async () => {
  const { trace } = await compile(source);
  const frame = trace.frames.at(-1);
  assert.ok(trace.snapshots.some(snapshot => snapshot.objectId === 'init'));
  assert.equal(frame.texts.find(text => text.segments[0].text === 'keep').binding.targetObjectKey, 'init');
  assert.equal(frame.texts.find(text => text.segments[0].text === 'studio').binding.targetObjectKey, 'note');
});

test('renderer resolves keep IDs before equally named Studio IDs', () => {
  const rendererSource = fs.readFileSync(path.join(__dirname, '../public/trace-renderer.js'), 'utf8')
    .replace('window.ASMTraceRenderers = {',
      'window.ASMTraceRenderers = { targetPlacement, resolvedTargetKey, keepUnionPlacement,');
  const context = vm.createContext({ window: {}, document: { documentElement: { dataset: {} } } });
  vm.runInContext(rendererSource, context);
  context.window.ASMTraceRules = { resolveExpression: () => 0 };
  const placements = new Map([
    ['init', { x: 10, y: 20, width: 100, height: 40 }],
    ['studio:init', { x: 300, y: 20, width: 100, height: 40 }],
    ['studio:note', { x: 500, y: 20, width: 100, height: 40 }]
  ]);
  const targetPlacement = context.window.ASMTraceRenderers.targetPlacement;
  const resolvedTargetKey = context.window.ASMTraceRenderers.resolvedTargetKey;
  assert.equal(targetPlacement({}, {}, placements, { objectKey: 'init' }).x, 10);
  assert.equal(resolvedTargetKey({}, {}, { objectKey: 'init' }, placements), 'init');
  assert.equal(targetPlacement({}, {}, placements, { objectKey: 'note' }).x, 500);
  assert.equal(resolvedTargetKey({}, {}, { objectKey: 'note' }, placements), 'studio:note');
});

test('keep is the union of visible retained objects and excludes arrows and hidden snapshots', () => {
  const rendererSource = fs.readFileSync(path.join(__dirname, '../public/trace-renderer.js'), 'utf8')
    .replace('window.ASMTraceRenderers = {',
      'window.ASMTraceRenderers = { targetPlacement, resolvedTargetKey, keepUnionPlacement,');
  const context = vm.createContext({ window: {}, document: { documentElement: { dataset: {} } } });
  vm.runInContext(rendererSource, context);
  context.window.ASMTraceRules = { resolveExpression: () => 0 };
  const document = {
    snapshots: [
      { id: 'snapshot-1', objectId: 'init' },
      { id: 'snapshot-2', objectId: 'tree_intro' },
      { id: 'snapshot-3', objectId: 'hidden_keep' }
    ],
    studio: { visibility: { 'frame-1': { hidden_keep: 'hidden' } } }
  };
  const frame = { id: 'frame-1', snapshotIds: ['snapshot-1', 'snapshot-2', 'snapshot-3'] };
  const placements = new Map([
    ['init', { x: 100, y: 20, width: 200, height: 80 }],
    ['tree_intro', { x: 150, y: 140, width: 100, height: 160 }],
    ['hidden_keep', { x: -500, y: 400, width: 900, height: 300 }],
    ['keep-arrow:init:tree_intro', { x: 0, y: 0, width: 1000, height: 1000 }]
  ]);
  const renderer = context.window.ASMTraceRenderers;

  assert.deepEqual(
    JSON.parse(JSON.stringify(renderer.keepUnionPlacement(document, frame, placements))),
    { x: 100, y: 20, width: 200, height: 280 }
  );
  assert.equal(renderer.resolvedTargetKey(document, frame, { objectKey: 'keep' }, placements), '$keep');
  assert.equal(renderer.targetPlacement(document, frame, placements, { objectKey: 'keep' }).height, 280);
});

test('a retained keep binding only measures snapshots that existed before it', () => {
  const rendererSource = fs.readFileSync(path.join(__dirname, '../public/trace-renderer.js'), 'utf8')
    .replace('window.ASMTraceRenderers = {',
      'window.ASMTraceRenderers = { targetPlacement, resolvedTargetKey, keepUnionPlacement,');
  const context = vm.createContext({ window: {}, document: { documentElement: { dataset: {} } } });
  vm.runInContext(rendererSource, context);
  const document = {
    snapshots: [
      { id: 'snapshot-1', objectId: 'init' },
      { id: 'snapshot-2', objectId: 'tree_intro' },
      { id: 'snapshot-3', objectId: 'build_heap' }
    ],
    studio: {}
  };
  const frame = {
    id: 'frame-30',
    snapshotIds: ['snapshot-1', 'snapshot-2', 'snapshot-3']
  };
  const placements = new Map([
    ['init', { x: 100, y: 20, width: 200, height: 80 }],
    ['tree_intro', { x: 125, y: 140, width: 150, height: 160 }],
    ['build_heap', { x: 125, y: 340, width: 150, height: 160 }]
  ]);
  const renderer = context.window.ASMTraceRenderers;

  assert.deepEqual(
    JSON.parse(JSON.stringify(renderer.keepUnionPlacement(document, frame, placements, 'tree_intro'))),
    { x: 100, y: 20, width: 200, height: 80 },
    'tree_intro must not use the future build_heap snapshot as a layout target'
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(renderer.keepUnionPlacement(document, frame, placements, 'build_heap'))),
    { x: 100, y: 20, width: 200, height: 280 },
    'build_heap may use init and tree_intro because both already existed'
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(renderer.keepUnionPlacement(document, frame, placements))),
    { x: 100, y: 20, width: 200, height: 480 },
    'the current frame still uses the complete visible keep union'
  );
});

test('relative targets settle before text, segment, marker and arrow layout', () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/trace-renderer.js'), 'utf8');
  const start = source.indexOf('function renderScene(');
  const end = source.indexOf('\n  function renderFrame(', start);
  const renderScene = source.slice(start, end);
  const firstBinding = renderScene.indexOf('applyBindings(document, frame, placements, elements)');
  const segments = renderScene.indexOf('renderFrameSegments(');
  const semanticText = renderScene.indexOf('applySemanticTextBindings(');
  const finalBinding = renderScene.lastIndexOf('applyBindings(document, frame, placements, elements)');
  assert.ok(firstBinding >= 0 && firstBinding < segments,
    'frame and keep offsets must update placements before dependent objects render');
  assert.ok(segments < semanticText && semanticText < finalBinding,
    'semantic text uses settled targets while the final pass keeps Studio bindings authoritative');
});
