const { test } = require('node:test');
const assert = require('node:assert/strict');
const { findKeepDirectives } = require('../trace-instrumenter');
const { compile } = require('./helpers/compile');

const source = `
#include <bits/stdc++.h>
using namespace std;
int main() {
  vector<int> arr = {3, 1, 2};
  // @frame arr
  // @keep arr as "original" at arr.bottom offset(4,6)
  arr[0] = 1;
  // @frame arr
  // @keep arr as "original" at arr.right
  arr[1] = 3;
  // @frame arr
  // @keep last as "round" at canvas.top
  // @frame arr
}
`;

test('@keep accepts as, at and offset modifiers', () => {
  const directives = findKeepDirectives(source);
  assert.equal(directives.length, 3);
  assert.equal(directives[0].label, 'original');
  assert.equal(directives[0].binding.targetName, 'arr');
  assert.equal(directives[0].binding.anchor, 'bottom');
  assert.equal(directives[0].binding.offsetX, 4);
  assert.equal(directives[0].binding.offsetY, 6);
  assert.equal(directives[2].mode, 'last');
  assert.equal(directives[2].binding.canvas, true);
});

test('@keep exposes stable canvas IDs and suffixes only duplicate names', async () => {
  const { trace } = await compile(source);
  assert.deepEqual(trace.snapshots.map(snapshot => snapshot.objectId), [
    'original', 'original_1', 'round'
  ]);
  assert.deepEqual(trace.snapshots.map(snapshot => snapshot.label), [
    'original', 'original_1', 'round'
  ]);
  assert.equal(trace.snapshots[0].binding.anchor, 'bottom');
  assert.equal(trace.snapshots[0].binding.targetVariableId,
    Object.keys(trace.variables).find(id => trace.variables[id].name === 'arr'));
  assert.equal(trace.snapshots[2].binding.canvas, true);
  assert.ok(trace.frames.at(-1).snapshotIds.includes(trace.snapshots[2].id));
});

test('@keep freezes source styles by default and supports without style', async () => {
  const styledSource = `
#include <bits/stdc++.h>
using namespace std;
int main() {
  vector<int> arr = {3, 1, 2};
  // @frame arr
  // @style arr[0] highlight AV_red
  // @keep arr as "styled"
  // @keep arr as "plain" without style
  // @keep last as "styled_frame"
  // @keep last as "plain_frame" without style
  arr[0] = 1;
  // @frame arr
}
`;
  const directives = findKeepDirectives(styledSource);
  assert.deepEqual(directives.map(item => item.preserveStyle), [true, false, true, false]);

  const { trace } = await compile(styledSource);
  const snapshots = Object.fromEntries(trace.snapshots.map(snapshot => [snapshot.objectId, snapshot]));
  assert.equal(snapshots.styled.styles.length, 1);
  assert.equal(snapshots.styled.styles[0].styleType, 'highlight');
  assert.equal(snapshots.styled.styles[0].color, 'AV_red');
  assert.equal(snapshots.plain.styles.length, 0);
  assert.equal(snapshots.styled_frame.frame.styles.length, 1);
  assert.equal(snapshots.plain_frame.frame.styles.length, 0);
});

test('@keep without at inherits the source frame placement binding', async () => {
  const positionedSource = `
#include <bits/stdc++.h>
using namespace std;
int main() {
  vector<int> arr = {0, 5, 7, 2};
  // @frame arr
  // @keep arr as "init"
  // @frame arr render heap with range(1,3) at init.bottom offset(0,40)
  // @keep arr as "tree_intro"
  arr[1]++;
  // @frame arr render heap with range(1,3)
}
`;
  const { trace } = await compile(positionedSource);
  const snapshots = Object.fromEntries(trace.snapshots.map(snapshot => [snapshot.objectId, snapshot]));

  assert.equal(snapshots.init.binding, null);
  assert.equal(snapshots.tree_intro.binding.targetObjectKey, 'init');
  assert.equal(snapshots.tree_intro.binding.anchor, 'bottom');
  assert.equal(snapshots.tree_intro.binding.offsetX, 0);
  assert.equal(snapshots.tree_intro.binding.offsetY, 40);
});

test('@keep at overrides an inherited source frame placement binding', async () => {
  const positionedSource = `
#include <bits/stdc++.h>
using namespace std;
int main() {
  vector<int> arr = {0, 5, 7, 2};
  // @frame arr
  // @keep arr as "init"
  // @frame arr render heap with range(1,3) at init.bottom offset(0,40)
  // @keep arr as "tree_intro" at init.right offset(12,0)
  arr[1]++;
  // @frame arr render heap with range(1,3)
}
`;
  const { trace } = await compile(positionedSource);
  const tree = trace.snapshots.find(snapshot => snapshot.objectId === 'tree_intro');

  assert.equal(tree.binding.targetObjectKey, 'init');
  assert.equal(tree.binding.anchor, 'right');
  assert.equal(tree.binding.offsetX, 12);
  assert.equal(tree.binding.offsetY, 0);
});

test('@keep rejects unknown without targets', () => {
  assert.throws(() => findKeepDirectives(`
#include <vector>
int main() {
  std::vector<int> arr = {1};
  // @frame arr
  // @keep arr without pointer
}
`), /@keep without 只支援 style/);
});
