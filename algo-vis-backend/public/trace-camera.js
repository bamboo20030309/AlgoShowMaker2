(function () {
  function ruleForFrame(trace, frame) {
    return (trace?.studio?.cameraRules || []).filter(rule => {
      const hasFrameScope = Boolean(rule.frameIds?.length || rule.allFrames
        || rule.directiveNames || rule.frameSelectors || rule.sourceSelectors || rule.sourceFrameSelectors);
      const frameIds = rule.frameIds?.length
        ? rule.frameIds
        : window.ASMTraceViewSource?.frameIdsForDescriptor?.(rule, trace?.frames || []);
      if (hasFrameScope && !frameIds?.includes(frame.id)) return false;
      return window.ASMTraceRules?.conditionMatches?.(frame, rule.condition) !== false;
    }).at(-1) || null;
  }
  function duration(value) {
    const cssRate = Number(getComputedStyle(window.document.documentElement)
      .getPropertyValue('--asm-animation-playback-rate'));
    const rate = Math.max(0.25, Math.min(4, Number(window.asmGetAnimationPlaybackRate?.()) || cssRate || 1));
    return Math.max(1, (Number(value) || 520) / rate);
  }
  function apply(trace, frame, previousFrame = null, animate = Boolean(previousFrame)) {
    if (!frame) return;
    const rule = ruleForFrame(trace, frame);
    const transition = previousFrame
      ? window.ASMTraceTransitions?.resolve?.(trace, previousFrame, frame, '$camera', new Set(['$camera']))
      : null;
    const moving = animate && transition?.mode !== 'instant';
    const ms = duration(transition?.duration);
    const renderer = window.ASMTraceRenderers;
    const zoom = Number(rule?.zoom) || 0.92;
    if (rule?.manualFrame && Number.isFinite(Number(rule.centerX)) && Number.isFinite(Number(rule.centerY))) {
      const key = renderer?.cameraObjectKey?.(rule.binding?.targetKey);
      const anchor = key ? renderer?.currentAnchorForKey?.(key, rule.binding.targetAnchor || 'center', true) : null;
      window.setCamera?.(
        anchor ? anchor.x + (Number(rule.binding.dx) || 0) : Number(rule.centerX),
        anchor ? anchor.y + (Number(rule.binding.dy) || 0) : Number(rule.centerY),
        zoom, moving, ms);
      return;
    }
    if (frame.keepLastFocus && (!rule || (rule.autoCapture !== false && !rule.target))) {
      const target = renderer?.fitCurrentObjectsCamera?.(zoom, moving, ms,
        Number(rule?.offsetX) || 0, Number(rule?.offsetY) || 0, true);
      if (target) return target;
    }
    const focus = rule?.target ? renderer?.currentAnchor?.(rule.target) : null;
    const bounds = focus ? renderer?.currentBounds?.() : null;
    const dx = (Number(rule?.offsetX) || 0) + (focus && bounds ? focus.x - bounds.centerX : 0);
    const dy = (Number(rule?.offsetY) || 0) + (focus && bounds ? focus.y - bounds.centerY : 0);
    if (rule?.autoCapture === false) {
      const view = window.getCameraViewport?.(zoom);
      window.setCamera?.((focus?.x ?? view?.centerX ?? 0) + (Number(rule.offsetX) || 0),
        (focus?.y ?? view?.centerY ?? 0) + (Number(rule.offsetY) || 0), zoom, moving, ms);
      return;
    }
    return renderer?.fitCurrentObjectsCamera?.(zoom, moving, ms, dx, dy, true)
      || window.setAutoCamera?.(zoom, moving, dx, dy, ms);
  }
  window.ASMTraceCamera = { apply, ruleForFrame };
})();
