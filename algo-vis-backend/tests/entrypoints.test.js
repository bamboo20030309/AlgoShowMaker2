const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '../public', name), 'utf8');
test('all algorithm surfaces load the same shared modules in dependency order', () => {
  const html = read('algorithm.html');
  const sources = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1].split('?')[0]);
  for (const name of ['trace-code-model.js', 'trace-code-presenter.js', 'trace-camera.js', 'trace-renderer.js', 'trace-player.js', 'trace-provenance.js',
    'algorithm-animation.js', 'trace-editor.js', 'trace-freshness.js', 'trace-studio.js', 'slides-embed.js']) {
    assert.equal(sources.filter(s => s === name).length, 1, name);
  }
  assert.ok(sources.indexOf('trace-camera.js') < sources.indexOf('trace-renderer.js'));
  assert.ok(sources.indexOf('algorithm-animation.js') < sources.indexOf('trace-editor.js'));
  for (const mode of ['runtime', 'editor']) {
    assert.ok(read('slides.js').includes('algorithm.html?asmEmbed=' + mode + '&v=trace-runtime-32'));
  }
  assert.ok(read('front.js').includes("if (!new URLSearchParams(window.location.search).has('asmEmbed'))"),
    'embedded animation surfaces wait for the parent payload instead of painting the bundled sample');
  const controlsStart = html.indexOf('<div class="controls">');
  const freshnessDot = html.indexOf('id="traceFreshnessNotice"');
  const timeline = html.indexOf('id="frameTimeline"');
  assert.ok(controlsStart >= 0 && freshnessDot > controlsStart && timeline > freshnessDot,
    'the shared freshness dot stays in the playback controls before the frame timeline');
  assert.ok(html.includes('trace-freshness.js?v=trace-2'));
  assert.ok(html.includes('canva.js?v=trace-12'));
  assert.ok(html.includes('<script src="vendor/ace/ace.js"></script>'));
  assert.ok(!html.includes('cdnjs.cloudflare.com/ajax/libs/ace'));
  assert.ok(html.includes('trace-model.js?v=trace-20'));
  assert.ok(html.includes('<script src="vendor/ace/mode-c_cpp.js"></script>'));
  assert.ok(html.includes('<script src="vendor/ace/theme-monokai.js"></script>'));
  assert.ok(html.includes('trace-code-model.js?v=code-5'));
  assert.ok(html.includes('trace-code-presenter.js?v=code-4'));
  assert.ok(html.includes('trace-view-source.js?v=trace-14'));
  assert.ok(html.includes('trace-editor.js?v=trace-17'));
  assert.ok(html.includes('compile.js?v=syntax-5'));
  assert.ok(html.includes('style.css?v=freshness-1'));
  const slides = read('slides.html');
  const legacy = read('index.html');
  assert.ok(slides.indexOf('algorithm-animation.js?') < slides.indexOf('slides.js?'));
  assert.ok(html.includes('trace-renderer.js?v=trace-136'));
  assert.ok(read('trace-renderer.js').includes("build: 'trace-136'"));
  assert.ok(read('trace-renderer.js').includes("asmTraceRendererBuild = 'trace-136'"));
  assert.ok(html.includes('trace-rules.js?v=trace-12'));
  for (const name of ['normal', 'heap', 'segment_tree', 'BIT', 'disk', 'stack', 'queue']) {
    assert.ok(html.includes(`draw/draw_array_${name}.js?v=focus-2`));
    assert.ok(slides.includes(`draw/draw_array_${name}.js?v=focus-2`));
    assert.ok(legacy.includes(`draw/draw_array_${name}.js?v=focus-2`));
  }
  assert.ok(html.includes('draw/draw_2Darray.js?v=focus-2'));
  assert.ok(html.includes('trace-events.js?v=trace-27'));
  assert.ok(html.includes('trace-frame-tween.js?v=trace-109'));
  assert.ok(html.includes('trace-player.js?v=trace-19'));
  assert.ok(html.includes('trace-studio.js?v=trace-94'));
  assert.ok(html.includes('front.js?v=random-id-29'));
  assert.ok(html.includes('slides-embed.js?v=trace-7'));
  assert.ok(html.includes('trace.css?v=trace-20'));
  const codeHighlight = read('trace.css').match(/\.ace-tm \.asm-trace-code-event-span\.is-active\s*\{([^}]*)\}/)?.[1] || '';
  assert.match(codeHighlight, /background-color:\s*rgba\(255,\s*214,\s*10,\s*0\.48\)/);
  assert.doesNotMatch(codeHighlight, /(?:^|[;\s])color\s*:/,
    'event emphasis must preserve ACE token foreground colors and use only a background highlight');
  assert.match(read('trace.css'), /\.asm-trace-code-page\s*\{[^}]*transform 420ms/s);
  assert.match(read('trace-code-presenter.js'), /codePanelPosition/);
  assert.match(read('trace-code-presenter.js'), /addEventListener\('pointerdown'/);
  assert.ok(!read('trace-code-presenter.js').includes('<header>'));
  assert.ok(html.includes('draw/draw_array.js?v=trace-2'));
  assert.ok(html.includes('trace-studio.css?v=trace-43'));
  assert.ok(read('trace-studio.js').includes("section('自動固定')"));
  assert.ok(read('trace-studio.js').includes("classList.add('trace-studio-fixed-section')"));
  assert.match(read('trace-studio.css'),
    /\.trace-studio-events-panel\s*\{[^}]*flex-direction:\s*column;/s);
  assert.ok(read('trace-editor.js').includes("className = 'trace-auto-fixed-settings'"));
  assert.ok(!read('trace-studio.js').includes('input.disabled = autoDisabled'));
  assert.ok(!read('trace-studio.js').includes('目前缺少可見動畫目標'));
  assert.ok(read('trace-studio.css').includes('.trace-studio-frame-event.is-missing-target'));
  assert.ok(read('trace-studio.css').includes('.trace-studio-frame-event.is-unrenderable'));
  const saveHandler = read('slides.js').match(/function handleAlgorithmEmbedMessage[\s\S]*?function openAlgorithmEditor/)?.[0] || '';
  assert.ok(saveHandler.includes('refreshAlgorithmSlideInPlace(slide)'));
  assert.ok(!saveHandler.includes('renderDeck()'), 'saving one animation slide must not rebuild the whole deck');
  assert.ok(saveHandler.includes("event.data.type === 'asm-animation-applied'"));
  assert.ok(read('slides.css').includes('.algorithm-editor-modal.is-loading #algorithmEditorFrame'));
  for (const surface of [html, slides, legacy]) {
    assert.ok(surface.includes('draw/draw_array_hintWidget.js?v=trace-4'));
  }
});
