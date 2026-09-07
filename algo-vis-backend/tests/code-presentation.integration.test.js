const { test } = require('node:test');
const assert = require('node:assert/strict');
const { compile, load } = require('./helpers/compile');

test('runtime events retain exact source spans for expression-level code highlighting', async () => {
  const source = `#include <bits/stdc++.h>
using namespace std;
int main() {
  int n = 2;
  vector<int> arr = {3, 1};
  // @frame arr
  for (int i = 0; i < n; i++) {
    if (arr[i] > 0) arr[i]--;
    // @frame arr[i]
    // @style arr[i] point red
  }
  return 0;
}`;
  const { trace, context } = await compile(source);
  load(context, 'trace-code-model.js');
  assert.equal(trace.sourceCode, source);

  const events = trace.frames.flatMap(frame => frame.events);
  const increment = events.find(event => /:i\+\+$/.test(event.signature));
  const comparison = events.find(event => event.type === 'compare' && /arr\[i\]\s*>\s*0/.test(event.signature));
  assert.ok(increment, 'the for increment event should be traced');
  assert.ok(comparison, 'the if comparison event should be traced');
  assert.equal(source.slice(increment.source.from, increment.source.to), 'i++');
  assert.equal(source.slice(comparison.source.from, comparison.source.to), 'arr[i] > 0');

  const frame = trace.frames.find(item => item.events.includes(increment));
  const plan = context.ASMTraceCodeModel.planFrame(trace, frame);
  const visible = plan.fragments.flatMap(fragment => fragment.items)
    .filter(item => item.kind === 'line').map(item => item.text).join('\n');
  assert.match(visible, /for \(int i = 0; i < n; i\+\+\)/);
  assert.doesNotMatch(visible, /#include|using namespace|int main|return 0/);
  assert.doesNotMatch(visible, /@frame|@style|@asm-view/);
  assert.ok(plan.fragments.flatMap(fragment => fragment.items)
    .some(item => item.kind === 'line' && item.number === 11 && item.text.trim() === '}'),
  'the closing brace for the active loop must remain visible');
  const highlightedText = plan.fragments.flatMap(fragment => fragment.items)
    .flatMap(item => item.segments || [])
    .filter(segment => segment.eventIds.includes(increment.id))
    .map(segment => segment.text).join('');
  assert.equal(highlightedText, 'i++');

  load(context, 'vendor/ace/ace.js');
  load(context, 'vendor/ace/mode-c_cpp.js');
  const Mode = context.ace.require('ace/mode/c_cpp').Mode;
  const syntax = context.ASMTraceCodeModel.tokenizeSource(source, new Mode().getTokenizer());
  const forItem = plan.fragments.flatMap(fragment => fragment.items)
    .find(item => item.kind === 'line' && item.text.includes('for (int i'));
  const merged = context.ASMTraceCodeModel.mergeSyntaxSegments(forItem, syntax.get(forItem.number));
  assert.equal(merged.filter(segment => segment.eventIds.includes(increment.id))
    .map(segment => segment.text).join(''), 'i++');
  assert.ok(merged.some(segment => segment.text === 'for' && segment.tokenType === 'keyword.control'));
  assert.ok(merged.some(segment => segment.text === 'int' && segment.tokenType === 'storage.type'));
  assert.ok(merged.some(segment => segment.text === '0' && segment.tokenType === 'constant.numeric'));
  assert.ok(merged.some(segment => segment.text === '++' && segment.tokenType === 'keyword.operator'));
});

test('drawing directives are removed silently while omitted algorithm code uses ellipsis', () => {
  const source = `int main() {
  int i = 0;
  // @frame arr[i]
  // @style arr[i] point red
  i++;
  int unrelated = 1;
  unrelated += 2;
  unrelated += 3;
  unrelated += 4;
  i--;
  /* @asm-view
  { "studio": {} }
  @asm-view */
}`;
  const from = source.indexOf('i++');
  const to = from + 3;
  const event = {
    id: 'event-increment',
    type: 'write',
    line: 5,
    source: {
      from, to, line: 5, endLine: 5, functionName: 'main',
      contexts: [{ type: 'FunctionDefinition', from: 0, to: source.length, openLine: 1, closeLine: 14 }]
    }
  };
  const context = { window: {} };
  context.window = context;
  const vm = require('node:vm');
  const fs = require('node:fs');
  const path = require('node:path');
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/trace-code-model.js'), 'utf8'), context);
  const plan = context.ASMTraceCodeModel.planFrame({ sourceCode: source }, {
    id: 'frame-1', source: { line: 5 }, events: [event]
  });
  const items = plan.fragments[0].items;
  const visible = items.filter(item => item.kind === 'line').map(item => item.text).join('\n');
  assert.doesNotMatch(visible, /@frame|@style|@asm-view|studio/);
  assert.ok(items.some(item => item.kind === 'ellipsis'));
});

test('nearby nested control snippets keep every structural closing brace', () => {
  const source = `#include <bits/stdc++.h>
using namespace std;
int main() {
  int n = 3;
  vector<int> arr = {3, 1, 2};
  // @frame arr
  for (int i = 0; i < n; i++) {
    if (arr[i] > 0) {
      arr[i]--;
    }
    // @frame arr[i]
  }
  return 0;
}`;
  const context = { window: {} };
  context.window = context;
  const vm = require('node:vm');
  const fs = require('node:fs');
  const path = require('node:path');
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/trace-code-model.js'), 'utf8'), context);
  const plan = context.ASMTraceCodeModel.planFrame({ sourceCode: source }, {
    id: 'frame-1', source: { line: 6 }, events: []
  });
  const visibleLines = plan.fragments[0].items.filter(item => item.kind === 'line');
  assert.ok(visibleLines.some(item => item.number === 10 && item.text.trim() === '}'),
    'the nested if closing brace must remain visible');
  assert.ok(visibleLines.some(item => item.number === 12 && item.text.trim() === '}'),
    'the outer for closing brace must remain visible even beyond the normal six-line target');
});

test('code presentation hides line and block comments without altering comment-like strings', () => {
  const source = `int main() {
  // 說明文字不顯示
  const char* url = "https://example.test/a//b"; // 行尾註解不顯示
  /* 多行註解
     也不顯示 */
  int value = 1; /* 內嵌註解 */ value++;
  // @frame value
  return 0;
}`;
  const context = { window: {} };
  context.window = context;
  const vm = require('node:vm');
  const fs = require('node:fs');
  const path = require('node:path');
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/trace-code-model.js'), 'utf8'), context);
  const plan = context.ASMTraceCodeModel.planFrame({ sourceCode: source }, {
    id: 'frame-comments', source: { line: 7 }, events: []
  });
  const visible = plan.fragments.flatMap(fragment => fragment.items)
    .filter(item => item.kind === 'line').map(item => item.text).join('\n');
  assert.doesNotMatch(visible, /說明文字|行尾註解|多行註解|也不顯示|內嵌註解/);
  assert.match(visible, /"https:\/\/example\.test\/a\/\/b"/);
  assert.match(visible, /int value = 1;\s+value\+\+;/);
});
