const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const canvaSource = fs.readFileSync(path.join(__dirname, '../public/canva.js'), 'utf8');

function element(tagName, rect = { width: 1280, height: 720 }) {
  const attributes = new Map();
  return {
    tagName,
    children: [],
    parentElement: { clientWidth: rect.width, clientHeight: rect.height },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    getAttribute(name) { return attributes.get(name) ?? null; },
    removeAttribute(name) { attributes.delete(name); },
    appendChild(child) { this.children.push(child); return child; },
    addEventListener() {},
    getBoundingClientRect() { return { ...rect, left: 0, top: 0 }; },
    querySelectorAll() { return []; }
  };
}

function cameraSurface(childHeight, topHeight) {
  const canvas = element('svg');
  const document = {
    documentElement: { clientHeight: childHeight },
    getElementById: id => id === 'arraySvg' ? canvas : null,
    createElementNS: (_namespace, tagName) => element(tagName),
    addEventListener(type, callback) { if (type === 'DOMContentLoaded') callback(); }
  };
  const context = vm.createContext({
    document,
    innerHeight: childHeight,
    top: { document: { documentElement: { clientHeight: topHeight } }, innerHeight: topHeight },
    addEventListener() {},
    requestAnimationFrame: callback => { callback(0); return 1; },
    cancelAnimationFrame() {},
    setTimeout: callback => { callback(); return 1; },
    clearTimeout() {},
    performance: { now: () => 0 }
  });
  context.window = context;
  vm.runInContext(canvaSource, context);
  return { context, canvas };
}

test('each canvas keeps the original viewport-relative camera scale', () => {
  const editor = cameraSurface(650, 900);
  const runtime = cameraSurface(720, 900);

  editor.context.setCamera(100, 200, 0.92, false);
  runtime.context.setCamera(100, 200, 0.92, false);

  assert.ok(Math.abs(editor.context.getScale() - 0.92 * 650 / 900) < 1e-12);
  assert.ok(Math.abs(runtime.context.getScale() - 0.92 * 720 / 900) < 1e-12);
  const renderedScale = surface => Number(
    surface.canvas.children[1].getAttribute('transform').match(/scale\(([^)]+)\)/)?.[1]
  );
  assert.ok(Math.abs(renderedScale(editor) - 0.92 * 650 / 900) < 1e-12);
  assert.ok(Math.abs(renderedScale(runtime) - 0.92 * 720 / 900) < 1e-12);
});
