const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { compile } = require('./helpers/compile');
const provenance = require('../public/trace-provenance');
const fixture = require('./fixtures/sorting.json');
for (const name of ['bubble', 'insertion']) {
  test(`${name}: fixed input, sorted state, ordered events and generation identity`, async () => {
    const code = fs.readFileSync(path.join(__dirname, 'fixtures', name + '.cpp'), 'utf8');
    const { trace } = await compile(code, fixture.input);
    const arr = Object.keys(trace.variables).find(id => trace.variables[id].name === 'arr');
    const values = Array.from(trace.frames.at(-1).state[arr].data.items, item => Number(item.value));
    assert.deepEqual(values, fixture.sorted);
    assert.equal(provenance.status(trace, code, fixture.input).kind, 'current',
      'Restart an older development server, or use npm run regression (isolated fresh server).');
    const events = trace.frames.flatMap(frame => frame.events);
    if (name === 'bubble') {
      assert.ok(events.some(e => e.type === 'write' && e.update && /j\+\+/.test(e.expression || e.signature || '')));
      assert.ok(events.some(e => e.type === 'swap'));
      assert.ok(trace.snapshots.length > 0, '@keep last must retain rounds');
    } else {
      assert.ok(events.some(e => e.type === 'write' && e.update));
      assert.ok(events.some(e => e.type === 'assign' && e.targets.some(t => t.resolvedIndex === 0)));
      const shift = trace.frames.find(f => f.events.some(e => e.type === 'assign') &&
        f.events.some(e => e.type === 'write' && e.update));
      assert.ok(shift, 'shift and decrement captured in one frame');
    }
  });
}
