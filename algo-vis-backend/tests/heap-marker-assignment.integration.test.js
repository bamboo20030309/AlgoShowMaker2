const { test } = require('node:test');
const assert = require('node:assert/strict');
const { compile } = require('./helpers/compile');

test('largest = l/r moves the largest marker without rendering l or r', async () => {
  const { trace, window } = await compile(`#include <bits/stdc++.h>
using namespace std;
void heapify(vector<int>& arr, int n, int i) {
  int largest = i;
  int l = 2 * i;
  int r = 2 * i + 1;
  if (l <= n && arr[l] > arr[largest]) largest = l;
  if (r <= n && arr[r] > arr[largest]) largest = r;
  // @frame arr[i,largest] render heap with range(1,n)
}
int main() {
  vector<int> arr = {0, 1, 2, 3};
  heapify(arr, 3, 1);
}`);
  const frame = trace.frames.at(-1);
  const assignments = frame.events.filter(event => /^largest = [lr]$/.test(event.expression || ''));
  assert.deepEqual(Array.from(assignments, event => event.expression), ['largest = l', 'largest = r']);
  const byName = name => Object.keys(trace.variables).find(id => trace.variables[id].name === name);
  const arr = byName('arr');
  const largest = byName('largest');
  const elements = new Map([1, 2, 3].map(index => [`${arr}#${index}`, { dataset: {} }]));
  const placements = new Map([1, 2, 3].map(index => [
    `${arr}#${index}`, { x: index * 40, y: index === 1 ? 0 : 40, width: 40, height: 40 }
  ]));
  elements.set('marker-largest', {
    dataset: {
      traceSourceVariableId: largest,
      traceSourceVariableIds: JSON.stringify([largest]),
      traceBindingTarget: `${arr}#3`
    }
  });
  placements.set('marker-largest', { x: 120, y: 5, width: 18, height: 18 });
  window.ASMTraceFrameTween.updateEventAvailability(trace, frame, placements, elements);
  assignments.forEach(event => assert.equal(event.autoAnimationDisabled, false));

  elements.delete('marker-largest');
  placements.delete('marker-largest');
  window.ASMTraceFrameTween.updateEventAvailability(trace, frame, placements, elements);
  assignments.forEach(event => assert.equal(event.autoAnimationDisabled, true,
    'the assignment still needs its destination marker'));
  assignments.forEach(event => assert.equal(event.autoAnimationUnavailableReason, 'missing-target'));
});

test('an unavailable event defaults off but remains user-controllable and remembers intent', async () => {
  const { window } = await compile(`#include <bits/stdc++.h>
using namespace std;
int main() {
  vector<int> arr = {1};
  // @frame arr
}`);
  const event = { enabled: true, autoAnimationDisabled: true };
  assert.deepEqual(
    JSON.parse(JSON.stringify(window.ASMTraceEvents.controlState(event))),
    { checked: false, available: false }
  );
  event.enabled = false;
  assert.deepEqual(
    JSON.parse(JSON.stringify(window.ASMTraceEvents.controlState(event))),
    { checked: false, available: false }
  );

  const savedEvent = {
    id: 'event-saved', signature: 'assign:main:1:value = 1',
    type: 'assign', enabled: true, autoAnimationDisabled: true
  };
  const savedDocument = {
    studio: { eventInstructionStates: { 'assign:main:1:value = 1': true } },
    frames: [{ id: 'frame-saved', events: [savedEvent] }]
  };
  window.ASMTraceEvents.applyEnabledStates(savedDocument);
  assert.deepEqual(
    JSON.parse(JSON.stringify(window.ASMTraceEvents.controlState(savedEvent))),
    { checked: true, available: false },
    'an explicit saved on state remains visible and editable'
  );
  savedDocument.studio.eventInstructionStates['assign:main:1:value = 1'] = false;
  window.ASMTraceEvents.applyEnabledStates(savedDocument);
  assert.deepEqual(
    JSON.parse(JSON.stringify(window.ASMTraceEvents.controlState(savedEvent))),
    { checked: false, available: false }
  );
  assert.equal(window.ASMTraceEvents.availabilityKind(event), 'missing-target');
  event.autoAnimationUnavailableReason = 'unrenderable';
  assert.equal(window.ASMTraceEvents.availabilityKind(event), 'unrenderable');

  const unsupported = { id: 'event-1', order: 1, type: 'call', enabled: true, targets: [] };
  window.ASMTraceFrameTween.updateEventAvailability(
    {}, { id: 'frame-unsupported', events: [unsupported] }, new Map(), new Map()
  );
  assert.equal(unsupported.autoAnimationDisabled, true);
  assert.equal(unsupported.autoAnimationUnavailableReason, 'unrenderable');

  const malformedAssignment = { id: 'event-2', order: 2, type: 'assign', enabled: true, targets: [] };
  window.ASMTraceFrameTween.updateEventAvailability(
    {}, { id: 'frame-malformed', events: [malformedAssignment] }, new Map(), new Map()
  );
  assert.equal(malformedAssignment.autoAnimationUnavailableReason, 'unrenderable');
});

test('fixed mark availability follows its switch instead of being auto-disabled', async () => {
  const { trace, window } = await compile(`#include <bits/stdc++.h>
using namespace std;
int main() {
  vector<int> arr = {1};
  // @frame arr
}`);
  const frame = trace.frames[0];
  const variableId = Object.keys(trace.variables).find(id => trace.variables[id].name === 'arr');
  const key = `${variableId}#0`;
  const fixed = {
    id: 'fixed-test', order: 1, type: 'fixed', signature: `fixed:${variableId}:0`,
    targets: [{ role: 'target', variableId, expression: 'arr[0]', indexExpression: '0' }]
  };
  frame.events = [fixed];
  window.ASMTraceFrameTween.updateEventAvailability(
    trace,
    frame,
    new Map([[key, { x: 0, y: 0, width: 40, height: 40 }]]),
    new Map([[key, { dataset: {} }]])
  );
  assert.equal(fixed.autoAnimationDisabled, false);
  assert.equal(window.ASMTraceEvents.controlState(fixed).available, true);

  trace.studio.eventSettings ||= {};
  trace.studio.eventSettings.autoFixedEnabled = false;
  window.ASMTraceEvents.applyEnabledStates(trace);
  assert.equal(fixed.enabled, false, 'the fixed mark must obey the disabled setting');
  assert.equal(window.ASMTraceEvents.controlState(fixed).checked, false);
});

test('fixed cells use the actual object last access across function aliases', async () => {
  const { trace } = await compile(`#include <bits/stdc++.h>
using namespace std;
void inspect(vector<int>& values) {
  int seen = values[0];
  // inside: @frame values
}
int main() {
  vector<int> values = {4, 2};
  inspect(values);
  values[0] = 9;
  int tail = values[1];
  // outside: @frame values
}`);
  const fixedFrames = trace.frames.flatMap((frame, frameIndex) => (
    frame.events.filter(event => event.type === 'fixed').map(event => ({ frameIndex, event }))
  ));
  assert.ok(fixedFrames.length > 0);
  assert.equal(fixedFrames.some(({ frameIndex }) => frameIndex === 0), false,
    'the callee alias must not fix cells that the caller accesses later');
  const outside = fixedFrames.filter(({ frameIndex }) => frameIndex === trace.frames.length - 1);
  assert.equal(outside.length, 1, 'the caller final accesses are emitted as one fixed batch');
  assert.deepEqual(Array.from(outside[0].event.targets, target => target.resolvedIndex), [0, 1]);
  assert.equal(outside[0].event.autoFixed, true);
});

test('recursive heapify activations retain distinct runtime identities and ordered marker assignments', async () => {
  const { trace } = await compile(`#include <bits/stdc++.h>
using namespace std;
void heapify(vector<int>& arr, int n, int i) {
  int largest = i;
  int l = 2 * i + 1;
  int r = 2 * i + 2;
  if (l < n && arr[l] > arr[largest]) largest = l;
  if (r < n && arr[r] > arr[largest]) largest = r;
  if (largest != i) {
    swap(arr[i], arr[largest]);
  }
  // heap: @frame arr[i,largest] render heap with range(0,n-1)
  if (largest != i) heapify(arr, n, largest);
}
int main() {
  vector<int> arr = {5, 7, 2, 1, 9, 4};
  heapify(arr, 6, 1);
}`);
  const variableId = name => Object.keys(trace.variables).find(id => trace.variables[id].name === name);
  const iId = variableId('i');
  const largestId = variableId('largest');
  assert.ok(iId && largestId);
  const heapFrames = trace.frames.filter(frame => frame.state[iId]?.identity);
  assert.ok(heapFrames.length >= 2);
  const identities = heapFrames.map(frame => frame.state[iId]?.identity).filter(Boolean);
  assert.ok(new Set(identities).size >= 2, 'recursive i activations must remain distinguishable');
  heapFrames.forEach(frame => {
    const assignments = frame.events.filter(event => /^largest = (i|l|r)$/.test(event.expression || ''));
    const orders = Array.from(assignments, event => event.order);
    assert.deepEqual(orders, [...orders].sort((left, right) => left - right));
  });
});
