const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the real notification handler, replacing only its DOM/rendering edges.
function studioHarness(count = 200) {
  const listeners = new Map();
  const scheduled = new Map();
  const idleScheduled = new Map();
  const counters = { rail: 0, timeline: 0, inspector: 0, dots: 0 };
  let nextId = 1;
  let editing = true;
  let clock = 0;
  let renderCost = 0;
  const drawn = [];
  const trace = { frames: Array.from({ length: count }, (_, i) => ({
    id: `frame-${i}`, events: [{ autoAnimationDisabled: false }]
  })) };
  const items = () => trace.frames.map(frame => ({
    dataset: { frameId: frame.id },
    selected: true,
    preview: {},
    dots: null,
    querySelector(selector) {
      assert.equal(selector, '.trace-studio-event-dots');
      return { replaceWith: dots => { this.dots = dots; } };
    }
  }));
  const railItems = items();
  const timelineItems = items();
  const container = children => ({
    scrollTop: 321,
    querySelectorAll: selector => {
      assert.equal(selector, '[data-frame-id]');
      return children;
    }
  });
  const window = {
    addEventListener: (name, fn) => listeners.set(name, fn),
    requestIdleCallback: fn => { const id = nextId++; idleScheduled.set(id, fn); return id; },
    cancelIdleCallback: id => idleScheduled.delete(id),
    ASMTraceRenderers: { createThumbnail(document, frame, previous) {
      assert.equal(document, trace);
      assert.equal(previous, trace.frames[trace.frames.indexOf(frame) - 1] || null);
      drawn.push(frame.id);
      clock += renderCost;
      return { frameId: frame.id, dataset: {} };
    } }
  };
  const document = { addEventListener() {}, body: { classList: { contains: () => editing } } };
  const source = fs.readFileSync(path.join(__dirname, '../public/trace-studio.js'), 'utf8')
    .replace('window.ASMTraceStudio = {', `window.testStudio = {
      configure(value, left, bottom, calls) {
        trace = value; rail = left; timeline = bottom;
        renderRail = () => calls.rail++;
        renderTimeline = () => calls.timeline++;
        renderFrameEventsEditor = () => calls.inspector++;
        eventDots = frame => { calls.dots++; return frame.events.map(e => e.autoAnimationDisabled); };
      }, cancelEventAvailabilityRefresh, cancelThumbnailRendering, thumbnailWithinViewport,
      thumbnailPriority, cacheThumbnail, takeCachedThumbnail,
      thumbnailCacheSize() { return thumbnailCache.size; },
      queueThumbnails(jobs, priority = 'visible') {
        pendingThumbnails = jobs.map(job => ({ ...job, priority }));
        scheduleThumbnailRendering();
      }
    }; window.ASMTraceStudio = {`);
  vm.runInNewContext(source, {
    window, document, performance: { now: () => clock },
    requestAnimationFrame: fn => { const id = nextId++; scheduled.set(id, fn); return id; },
    cancelAnimationFrame: id => scheduled.delete(id)
  });
  const rail = container(railItems);
  window.testStudio.configure(trace, rail, container(timelineItems), counters);
  return {
    trace, counters, scheduled, idleScheduled, railItems, timelineItems, rail,
    editing: value => { editing = value; },
    cancel: window.testStudio.cancelEventAvailabilityRefresh,
    drawn,
    renderCost: value => { renderCost = value; },
    cancelThumbnails: window.testStudio.cancelThumbnailRendering,
    thumbnailWithinViewport: window.testStudio.thumbnailWithinViewport,
    thumbnailPriority: window.testStudio.thumbnailPriority,
    cacheThumbnail: window.testStudio.cacheThumbnail,
    takeCachedThumbnail: window.testStudio.takeCachedThumbnail,
    thumbnailCacheSize: window.testStudio.thumbnailCacheSize,
    queueThumbnails: (priority = 'visible') => window.testStudio.queueThumbnails(trace.frames.map((frame, index) => ({
      frame, index, placeholder: {
        isConnected: true,
        replaceWith: preview => { railItems[index].preview = preview; }
      }
    })), priority),
    notify: (frameId, document = trace) => listeners.get('asm:trace-event-availability-changed')({
      detail: { document, frameId }
    }),
    flush() {
      const callbacks = [...scheduled.values()]; scheduled.clear();
      callbacks.forEach(fn => fn());
    },
    flushIdle(timeRemaining = 20) {
      const callbacks = [...idleScheduled.values()]; idleScheduled.clear();
      callbacks.forEach(fn => fn({ didTimeout: false, timeRemaining: () => timeRemaining }));
    }
  };
}

test('200 thumbnail notifications coalesce without recreating any scenes or timeline buttons', () => {
  const h = studioHarness();
  const previews = h.railItems.map(item => item.preview);
  for (const frame of h.trace.frames) {
    frame.events[0].autoAnimationDisabled = true;
    h.notify(frame.id); h.notify(frame.id);
  }
  assert.equal(h.scheduled.size, 1);
  h.flush();
  assert.deepEqual(h.counters, { rail: 0, timeline: 0, inspector: 1, dots: 400 });
  assert.equal(h.scheduled.size, 0, 'no thumbnail -> availability -> thumbnail feedback');
  h.railItems.forEach((item, i) => {
    assert.equal(item.preview, previews[i]);
    assert.equal(item.selected, true);
    assert.equal(item.dots[0], true);
    assert.equal(h.timelineItems[i].dots[0], true);
  });
  assert.equal(h.rail.scrollTop, 321);
});

test('only affected frame badges update, using the latest enabled state', () => {
  const h = studioHarness(3);
  h.trace.frames[1].events[0].autoAnimationDisabled = true;
  h.notify('frame-1');
  h.trace.frames[1].events[0].autoAnimationDisabled = false;
  h.notify('frame-1');
  h.flush();
  assert.equal(h.counters.inspector, 0);
  assert.equal(h.counters.dots, 2);
  assert.equal(h.railItems[1].dots[0], false);
  assert.equal(h.railItems[0].dots, null);
});

test('closed editor and stale document notifications do not schedule work', () => {
  const h = studioHarness(1);
  h.notify('frame-0', {});
  h.editing(false);
  h.notify('frame-0');
  assert.equal(h.scheduled.size, 0);
  h.editing(true); h.notify('frame-0'); h.editing(false); h.flush();
  assert.equal(h.counters.dots, 0);
});

test('closing or reopening cancels pending refresh and clears old frame IDs', () => {
  const h = studioHarness(2);
  h.notify('frame-0'); h.cancel();
  assert.equal(h.scheduled.size, 0);
  h.notify('frame-1'); h.flush();
  assert.equal(h.counters.inspector, 0);
  assert.equal(h.counters.dots, 2);
  assert.equal(h.railItems[0].dots, null);
});

test('thumbnail generation waits for a frame and renders at most one scene per callback', () => {
  const h = studioHarness(17);
  h.queueThumbnails();
  assert.equal(h.drawn.length, 0, 'opening Studio must not render a thumbnail synchronously');
  assert.equal(h.scheduled.size, 1);
  h.flush();
  assert.equal(h.drawn.length, 1);
  while (h.scheduled.size) h.flush();
  assert.deepEqual(h.drawn, h.trace.frames.map(frame => frame.id));
  h.railItems.forEach((item, i) => assert.equal(item.preview.frameId, h.trace.frames[i].id));
});

test('expensive thumbnails yield at the time budget; closing cancels obsolete jobs', () => {
  const h = studioHarness(17);
  h.renderCost(9);
  h.queueThumbnails();
  assert.equal(h.drawn.length, 0);
  h.flush();
  assert.equal(h.drawn.length, 1);
  h.cancelThumbnails(); h.flush();
  assert.equal(h.drawn.length, 1);
  assert.equal(h.scheduled.size, 0);
});

test('a hidden studio does not continue rendering pending thumbnails', () => {
  const h = studioHarness(17);
  h.queueThumbnails(); h.editing(false); h.flush();
  assert.equal(h.drawn.length, 0);
  assert.equal(h.scheduled.size, 0);
});

test('thumbnail culling includes the viewport and one-card overscan only', () => {
  const h = studioHarness(1);
  const visible = h.thumbnailWithinViewport;
  assert.equal(visible(100, 254, 100, 600, 154), true, 'visible frame renders');
  assert.equal(visible(-54, 100, 100, 600, 154), true, 'one frame above stays warm');
  assert.equal(visible(600, 754, 100, 600, 154), true, 'one frame below stays warm');
  assert.equal(visible(-209, -55, 100, 600, 154), false, 'older frames are culled');
  assert.equal(visible(755, 909, 100, 600, 154), false, 'later frames are culled');
});

test('thumbnail priority keeps the current frame first, visible frames animated, and buffer frames idle', () => {
  const h = studioHarness(3);
  const priority = h.thumbnailPriority;
  assert.equal(priority(100, 254, 100, 600, 154, true), 'current');
  assert.equal(priority(255, 409, 100, 600, 154, false), 'visible');
  assert.equal(priority(601, 754, 100, 600, 154, false), 'buffer');
  assert.equal(priority(755, 909, 100, 600, 154, false), '');

  h.queueThumbnails('buffer');
  assert.equal(h.scheduled.size, 0);
  assert.equal(h.idleScheduled.size, 1, 'buffer work must wait for browser idle time');
  h.flushIdle();
  assert.equal(h.drawn.length, 1);
});

test('detached thumbnail cache reuses nodes and evicts the least recently stored frame', () => {
  const h = studioHarness(1);
  const first = { dataset: { thumbnailRendered: 'true' } };
  h.cacheThumbnail('frame-0', first);
  assert.equal(h.takeCachedThumbnail('frame-0'), first);
  assert.equal(h.takeCachedThumbnail('frame-0'), null);

  for (let index = 0; index < 25; index += 1) {
    h.cacheThumbnail(`cached-${index}`, { dataset: {} });
  }
  assert.equal(h.thumbnailCacheSize(), 24);
  assert.equal(h.takeCachedThumbnail('cached-0'), null, 'oldest cached thumbnail is evicted');
  assert.ok(h.takeCachedThumbnail('cached-24'));
});
