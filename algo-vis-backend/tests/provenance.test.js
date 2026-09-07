const { test } = require('node:test');
const assert = require('node:assert/strict');
const api = require('../public/trace-provenance');
const trace = () => ({ schemaVersion: '1.0', frames: [{}], provenance: api.create('int x = 1;\n', '1\n') });
test('source/input changes, undo and saved JSON retain generation identity', () => {
  const t = JSON.parse(JSON.stringify(trace()));
  assert.equal(api.status(t, 'int x = 1;\n', '1\n').kind, 'current');
  assert.equal(api.status(t, 'int x = 2;\n', '1\n').kind, 'dirty');
  assert.equal(api.status(t, 'int x = 1;\n', '2\n').kind, 'dirty');
  assert.equal(api.status(t, 'int x = 1;\n', '1\n').kind, 'current');
});
test('Studio settings and CRLF do not demand another RUN', () => {
  assert.equal(api.status(trace(), 'int x = 1;\r\n\r\n/* @asm-view\r\n{}\r\n@asm-view */\r\n', '1\n').kind, 'current');
  assert.equal(api.status(trace(), 'int x = 1;', '1\r\n').kind, 'dirty', 'stdin is byte-sensitive');
});
test('multiple view blocks cannot hide executable source changes', () => {
  const code = 'int x = 1;\n/* @asm-view\n{}\n@asm-view */\nint y = 2;\n/* @asm-view\n{}\n@asm-view */';
  const t = { ...trace(), provenance: api.create(code, '') };
  assert.equal(api.status(t, code.replace('y = 2', 'y = 3'), '').kind, 'dirty');
});
test('old, future, incomplete and unknown-format traces warn without mutation', () => {
  for (const t of [{ frames: [{}] }, { ...trace(), provenance: {} },
    { ...trace(), schemaVersion: '2.0' },
    { ...trace(), provenance: { ...trace().provenance, engineVersion: 999 } }]) {
    const before = JSON.stringify(t);
    assert.equal(api.status(t, 'int x = 1;', '1\n').kind, 'outdated');
    assert.equal(JSON.stringify(t), before);
  }
  assert.equal(api.status(null, '', '').kind, 'empty');
});
