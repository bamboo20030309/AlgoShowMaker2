const { test } = require('node:test');
const assert = require('node:assert/strict');
const { compile } = require('./helpers/compile');

test('insertion shift remains available at its captured indices after j-- reaches -1', async () => {
  const { trace, window } = await compile(`#include <bits/stdc++.h>
using namespace std;
int main() {
 vector<int> arr = {3, 1, 2};
 int j = 0;
 // @frame arr[j]
 arr[j+1] = arr[j];
 j--;
 // @frame arr[j]
}`);
  const frame = trace.frames.at(-1);
  const assignment = frame.events.find(event => event.type === 'assign');
  const decrement = frame.events.find(event => event.type === 'write' && event.update);
  assert.deepEqual(Array.from(assignment.targets, target => target.resolvedIndex), [1, 0]);
  assert.ok(assignment.order < decrement.order);
  const arr = Object.keys(trace.variables).find(id => trace.variables[id].name === 'arr');
  const j = Object.keys(trace.variables).find(id => trace.variables[id].name === 'j');
  assert.equal(Number(frame.state[j].data.value), -1);
  const elements = new Map([0, 1, 2].map(i => [`${arr}#${i}`, { dataset: {} }]));
  const placements = new Map([0, 1, 2].map(i => [`${arr}#${i}`, { x: i * 40, y: 0, width: 40, height: 40 }]));
  elements.set('marker-j', { dataset: { traceSourceVariableId: j } });
  placements.set('marker-j', { x: -40, y: -40, width: 18, height: 18 });
  window.ASMTraceFrameTween.updateEventAvailability(trace, frame, placements, elements);
  assert.equal(assignment.autoAnimationDisabled, false);
  assert.equal(decrement.autoAnimationDisabled, false);
  elements.delete(`${arr}#0`);
  window.ASMTraceFrameTween.updateEventAvailability(trace, frame, placements, elements);
  assert.equal(assignment.autoAnimationDisabled, true, 'an actually hidden source must still disable assignment');
  assert.equal(decrement.autoAnimationDisabled, false, 'array source visibility does not suppress j--');
});

test('initializer and indexed ++ keep their own indices when a later increment changes j', async () => {
  const { trace } = await compile(`#include <bits/stdc++.h>
using namespace std;
int main() {
 vector<int> arr = {3, 1, 2};
 int j = 0;
 // @frame arr[j]
 int key = arr[j];
 arr[j]++;
 arr[j] += 2;
 j++;
 // @frame arr[j],key
}`);
  const frame = trace.frames.at(-1);
  const initializer = frame.events.find(event => event.type === 'assign');
  assert.equal(initializer.targets.find(target => target.role === 'source').resolvedIndex, 0);
  const updates = frame.events.filter(event => event.type === 'write' && event.update);
  assert.equal(updates[0].targets[0].resolvedIndex, 0);
  assert.equal(updates[1].targets[0].resolvedIndex, undefined, 'scalar j++ is not an indexed array write');
  const compound = frame.events.find(event => event.type === 'write' && !event.update);
  assert.equal(compound.targets[0].resolvedIndex, 0);
  assert.equal(Number(frame.state[updates[1].targets[0].variableId].data.value), 1);
});

test('capturing initializer metadata does not evaluate an index function again', async () => {
  const { trace } = await compile(`#include <bits/stdc++.h>
using namespace std;
int calls = 0;
int nextIndex() { calls++; return 0; }
int main() {
 vector<int> arr = {3, 1};
 int key = arr[nextIndex()];
 // @frame arr,key,calls
}`);
  const frame = trace.frames.at(-1);
  const calls = Object.keys(trace.variables).find(id => trace.variables[id].name === 'calls');
  assert.equal(Number(frame.state[calls].data.value), 1);
  const key = Object.keys(trace.variables).find(id => trace.variables[id].name === 'key');
  const initializer = frame.events.find(event => event.type === 'assign' && event.targets[0]?.variableId === key);
  assert.equal(initializer.targets[1].resolvedIndex, undefined);
});
