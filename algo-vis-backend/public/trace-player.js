(function () {
  let document = null;
  let currentFrame = 0;
  let cameraTimer = null;
  let viewportResizeFrame = null;
  let viewportObserver = null;
  let viewportSize = '';
  let activePlaybackPlan = null;
  let lastPlaybackPlan = null;

  function frameCount() {
    return document?.frames?.length || 0;
  }

  function applyPlaybackCamera(frame, previousFrame = null) {
    clearTimeout(cameraTimer);
    if (!frame || window.document.body.classList.contains('asm-trace-studio-open')) return;
    cameraTimer = setTimeout(() => {
      if (document?.frames?.[currentFrame]?.id !== frame.id) return;
      window.ASMTraceCamera.apply(document, frame, previousFrame);
    }, 0);
  }

  function refreshViewportCamera() {
    viewportResizeFrame = null;
    if (!document?.frames?.length) return;
    if (window.document.body.classList.contains('asm-trace-studio-open')
      && window.ASMTraceStudio?.refreshViewport) {
      window.ASMTraceStudio.refreshViewport();
      return;
    }
    window.ASMTraceCamera?.apply?.(document, document.frames[currentFrame], null, false);
  }

  function scheduleViewportCameraRefresh() {
    if (viewportResizeFrame != null) return;
    viewportResizeFrame = window.requestAnimationFrame(refreshViewportCamera);
  }

  function observeViewportSize() {
    if (viewportObserver || typeof window.ResizeObserver !== 'function') return;
    const canvas = window.document.getElementById('arraySvg');
    if (!canvas) return;
    viewportObserver = new window.ResizeObserver(entries => {
      const rect = entries.find(entry => entry.target === canvas)?.contentRect;
      const width = Math.round(Number(rect?.width) || 0);
      const height = Math.round(Number(rect?.height) || 0);
      if (!(width > 0) || !(height > 0)) return;
      const nextSize = `${width}x${height}`;
      if (nextSize === viewportSize) return;
      viewportSize = nextSize;
      scheduleViewportCameraRefresh();
    });
    viewportObserver.observe(canvas);
  }

  function render(index, options = {}) {
    if (!document || !frameCount()) return Promise.resolve();
    const next = Math.max(0, Math.min(frameCount() - 1, index));
    const requestedFrom = Number.isInteger(options.fromIndex) ? options.fromIndex : currentFrame;
    const fromIndex = Math.max(0, Math.min(frameCount() - 1, requestedFrom));
    const direction = Math.sign(next - fromIndex);
    const previous = (options.forceTransition || next !== fromIndex) ? document.frames[fromIndex] : null;
    currentFrame = next;
    const frame = document.frames[currentFrame];
    const transition = window.ASMTraceRenderers.renderFrame(document, frame, previous || null, {
      ...options,
      fromIndex,
      toIndex: currentFrame,
      direction
    });
    const playbackPlan = transition?.playbackPlan || null;
    if (playbackPlan) {
      activePlaybackPlan = playbackPlan;
      lastPlaybackPlan = playbackPlan;
      window.dispatchEvent(new CustomEvent('asm:trace-playback-plan', {
        detail: { document, frame, previousFrame: previous || null, plan: playbackPlan }
      }));
    } else {
      activePlaybackPlan = null;
    }
    window.dispatchEvent(new CustomEvent('asm:trace-frame', {
      detail: {
        document,
        frame,
        previousFrame: previous || null,
        index: currentFrame,
        fromIndex,
        direction
      }
    }));
    applyPlaybackCamera(frame, previous || null);
    if (typeof window.syncCurrentFrameFromCodeScript === 'function') window.syncCurrentFrameFromCodeScript();
    if (typeof window.clearAllEditorHighlights === 'function') window.clearAllEditorHighlights();
    if (typeof window.addEditorHighlight === 'function' && Number(frame.source?.line) > 0) {
      window.addEditorHighlight(Number(frame.source.line));
    }
    if (!playbackPlan) return transition;
    const trackedTransition = Promise.resolve(transition).finally(() => {
      if (activePlaybackPlan !== playbackPlan) return;
      activePlaybackPlan = null;
      window.dispatchEvent(new CustomEvent('asm:trace-playback-plan-complete', {
        detail: { document, frame, plan: playbackPlan }
      }));
    });
    trackedTransition.playbackPlan = playbackPlan;
    return trackedTransition;
  }

  function nextKey(direction) {
    const next = currentFrame + direction;
    if (next >= 0 && next < frameCount()) return render(next);
    return Promise.resolve();
  }

  function installCodeScript() {
    window.CodeScript = {
      next() { return nextKey(1); },
      prev() { return nextKey(-1); },
      next_key_frame() { return nextKey(1); },
      prev_key_frame() { return nextKey(-1); },
      reset() { return render(0); },
      goto(index) { return render(index === -1 ? frameCount() - 1 : index); },
      get_frame_count() { return frameCount(); },
      get_current_frame_index() { return currentFrame; },
      get_current_line() { return Number(document?.frames?.[currentFrame]?.source?.line) || 0; },
      get_key_frames() { return Array.from({ length: frameCount() }, (_, index) => index); },
      get_stop_frames() { return []; },
      is_stop_frame() { return false; },
      is_fast_frame() { return false; },
      is_faston_frame() { return false; },
      is_skip_frame() { return false; },
      has_next_key() { return currentFrame < frameCount() - 1; },
      has_prev_key() { return currentFrame > 0; }
    };
  }

  function apply(source) {
    clearTimeout(cameraTimer);
    activePlaybackPlan = null;
    lastPlaybackPlan = null;
    document = window.ASMTraceModel.normalizeTraceDocument(source);
    currentFrame = 0;
    observeViewportSize();
    installCodeScript();
    if (frameCount()) render(0, { animateEvents: false, animatePositions: false });
    if (typeof window.initFrameInfoFromCodeScript === 'function') window.initFrameInfoFromCodeScript();
    if (typeof window.syncCurrentFrameFromCodeScript === 'function') window.syncCurrentFrameFromCodeScript();
    return document;
  }

  function setRules(rules) {
    if (!document) return;
    document.rules = Array.isArray(rules) ? window.ASMTraceModel.clone(rules) : [];
    render(currentFrame);
  }

  function setSkins(skins) {
    if (!document) return;
    document.skins = skins && typeof skins === 'object' ? window.ASMTraceModel.clone(skins) : {};
    render(currentFrame);
  }

  function previewTransition(index = currentFrame) {
    const target = Math.max(0, Math.min(frameCount() - 1, Number(index) || 0));
    const source = Math.max(0, target - 1);
    if (source === target) {
      render(target);
      return;
    }
    window.ASMTraceRenderers.renderFrame(document, document.frames[source], null, { animatePositions: false });
    requestAnimationFrame(() => render(target, { fromIndex: source, forceTransition: true }));
  }

  window.asmApplyTraceDocument = apply;
  window.ASMTracePlayer = {
    apply,
    render,
    previewTransition,
    setRules,
    setSkins,
    isActive: () => Boolean(document?.frames?.length),
    getDocument: () => document,
    getCurrentFrame: () => currentFrame,
    getActivePlaybackPlan: () => activePlaybackPlan,
    getLastPlaybackPlan: () => lastPlaybackPlan
  };
  observeViewportSize();
})();
