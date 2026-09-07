const { test } = require('node:test');
const assert = require('node:assert/strict');
const { compile } = require('./helpers/compile');

test('@style supports mixed index and range segments', async () => {
  const { trace, window } = await compile(`#include <bits/stdc++.h>
using namespace std;
int main() {
  vector<int> arr = {0, 5, 7, 2, 1, 9, 4};
  int i = 1;
  // @frame arr[i] render heap with range(1,6)
  // @style arr[i] point red
  // @style arr[i,i*2:i*2+1] highlight red
  return 0;
}`);
  const frame = trace.frames[0];
  const arrId = Object.keys(trace.variables).find(id => trace.variables[id].name === 'arr');
  const mixed = frame.styles.find(style => style.styleType === 'highlight');
  const point = frame.styles.find(style => style.styleType === 'point');
  assert.equal(mixed.selector.type, 'segments');
  assert.deepEqual(
    JSON.parse(JSON.stringify(mixed.selector.segments)),
    [
      { type: 'index', indexExpression: 'i' },
      {
        type: 'range', startExpression: 'i*2', endExpression: 'i*2+1', endInclusive: true
      }
    ]
  );
  const highlights = window.ASMTraceRules.evaluate(trace, frame)[arrId];
  assert.deepEqual(Object.keys(highlights).sort(), ['1', '2', '3']);
  for (const index of ['1', '2', '3']) {
    assert.equal(highlights[index].styleTypes.highlight, 'red');
  }
  assert.equal(highlights['1'].styleTypes.point, 'red');
  assert.equal(highlights['1'].sourceStyleIds.highlight, mixed.id);
  assert.equal(highlights['1'].sourceStyleIds.point, point.id);
  assert.notEqual(highlights['1'].sourceStyleIds.highlight, highlights['1'].sourceStyleIds.point);
});

test('@style keeps single index and single colon range selectors compatible', async () => {
  const { trace } = await compile(`#include <bits/stdc++.h>
using namespace std;
int main() {
  vector<int> arr = {1, 2, 3};
  int i = 0;
  // @frame arr
  // @style arr[i] point red
  // @style arr[i:i+1] highlight red
  return 0;
}`);
  assert.deepEqual(
    Array.from(trace.frames[0].styles, style => style.selector.type),
    ['index', 'range']
  );
});

test('@style focus accepts multiple segments and an omitted default color', async () => {
  const { trace, window } = await compile(`#include <bits/stdc++.h>
using namespace std;
int main() {
  vector<int> arr = {0, 5, 7, 2, 1, 9, 4};
  int i = 2;
  int n = 6;
  // @frame arr render heap with range(1,n)
  // @style arr[1:i,i+2:n] focus
  // @style arr[i:i+1] focus AV_red
  return 0;
}`);
  const frame = trace.frames[0];
  const arrId = Object.keys(trace.variables).find(id => trace.variables[id].name === 'arr');
  const [defaultFocus, redFocus] = frame.styles.filter(style => style.styleType === 'focus');
  assert.equal(defaultFocus.color, 'AV_grey');
  assert.equal(defaultFocus.selector.type, 'segments');
  assert.equal(redFocus.color, 'AV_red');

  const highlights = window.ASMTraceRules.evaluate(trace, frame)[arrId];
  assert.deepEqual(Object.keys(highlights).sort(), ['1', '2', '3', '4', '5', '6']);
  assert.equal(highlights['1'].styleTypes.focus, '#cccccc');
  assert.equal(highlights['2'].styleTypes.focus, 'rgba(239, 154, 154, 0.6)');
  assert.equal(highlights['3'].styleTypes.focus, 'rgba(239, 154, 154, 0.6)');
  assert.equal(highlights['4'].styleTypes.focus, '#cccccc');
  assert.equal(highlights['6'].styleTypes.focus, '#cccccc');
});

test('@style recognizes AV_grey as the grey palette alias', async () => {
  const { trace, window } = await compile(`#include <bits/stdc++.h>
using namespace std;
int main() {
  vector<int> arr = {0, 5, 7, 2};
  // @frame arr
  // @style arr[1:2] focus AV_grey
  return 0;
}`);
  const frame = trace.frames[0];
  const arrId = Object.keys(trace.variables).find(id => trace.variables[id].name === 'arr');
  const highlights = window.ASMTraceRules.evaluate(trace, frame)[arrId];
  assert.equal(highlights['1'].styleTypes.focus, '#cccccc');
  assert.equal(highlights['2'].styleTypes.focus, '#cccccc');
});
