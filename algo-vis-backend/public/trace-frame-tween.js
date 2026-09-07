(function () {
  let activeRun = 0;
  let finishActiveRun = null;
  const markerEntrancesByFrame = new Map();

  const COMPARE_COLORS = Object.freeze({
    true: 'rgb(165, 214, 167)',
    false: 'rgb(239, 154, 154)'
  });
  const COMPARE_TIMING = Object.freeze({ popup: 180, wait: 400, size: 300, result: 420, reset: 260 });
  const ASSIGN_TIMING = Object.freeze({ frame: 160, valueHold: 500, drop: 500, hold: 500, exit: 100 });
  const GENERIC_EVENT_DURATION = Object.freeze({ lift: 340, pulse: 400, fade: 440 });
  const APPEAR_TIMING = Object.freeze({ duration: 220, offsetY: -16 });

  function assignmentEffectDuration(markerAssignment = false) {
    return ASSIGN_TIMING.frame
      + (markerAssignment ? ASSIGN_TIMING.valueHold : 0)
      + ASSIGN_TIMING.drop + ASSIGN_TIMING.hold + ASSIGN_TIMING.exit;
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function parseColor(value, alpha = 1) {
    if (!value) return null;
    const source = String(value).trim().toLowerCase();
    const rgba = source.match(/^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/);
    if (rgba) return { r: +rgba[1], g: +rgba[2], b: +rgba[3], a: +rgba[4] };
    const rgb = source.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
    if (rgb) return { r: +rgb[1], g: +rgb[2], b: +rgb[3], a: alpha };
    const hex = source.match(/^#([\da-f]{3}|[\da-f]{6})$/i);
    if (hex) {
      const value6 = hex[1].length === 3
        ? hex[1].split('').map(character => character + character).join('')
        : hex[1];
      return {
        r: parseInt(value6.slice(0, 2), 16),
        g: parseInt(value6.slice(2, 4), 16),
        b: parseInt(value6.slice(4, 6), 16),
        a: alpha
      };
    }
    const context = parseColor.context
      || (parseColor.context = document.createElement('canvas').getContext('2d'));
    if (!context) return null;
    context.fillStyle = '#000000';
    context.fillStyle = source;
    if (context.fillStyle === source || context.fillStyle.startsWith('#') || context.fillStyle.startsWith('rgb')) {
      return parseColor(context.fillStyle, alpha);
    }
    return null;
  }

  function interpolateColor(from, to, t) {
    return {
      r: Math.round(from.r + (to.r - from.r) * t),
      g: Math.round(from.g + (to.g - from.g) * t),
      b: Math.round(from.b + (to.b - from.b) * t),
      a: from.a + (to.a - from.a) * t
    };
  }

  function rectKey(rect, index, fallbackKey = '$object') {
    const owner = rect.closest?.('[data-trace-object-key]');
    const ownerKey = owner?.dataset?.traceObjectKey || fallbackKey;
    return `${ownerKey}|${rect.getAttribute('data-av-key') || index}`;
  }

  function rectStates(element, fallbackKey = '$object') {
    const states = new Map();
    [...(element?.querySelectorAll?.('rect') || [])].forEach((rect, index) => {
      const opacity = rect.hasAttribute('fill-opacity')
        ? Number(rect.getAttribute('fill-opacity'))
        : 1;
      states.set(rectKey(rect, index, fallbackKey), {
        fill: rect.getAttribute('fill') || '',
        opacity: Number.isFinite(opacity) ? opacity : 1,
        stroke: rect.getAttribute('stroke'),
        strokeOpacity: rect.getAttribute('stroke-opacity'),
        strokeWidth: rect.getAttribute('stroke-width'),
        rx: rect.getAttribute('rx'),
        ry: rect.getAttribute('ry')
      });
    });
    return states;
  }

  function previousVisualElement(previousObjects, sourceKey) {
    if (!sourceKey) return null;
    for (const [topKey, object] of previousObjects || []) {
      if (sourceKey === topKey) return object;
      if (!sourceKey.startsWith(`${topKey}#`) && !sourceKey.startsWith(`${topKey}:`)) continue;
      const child = object.querySelector?.(
        `[data-trace-object-key="${CSS.escape(sourceKey)}"]`
      );
      if (child) return child;
    }
    return null;
  }

  function markerActivationChanged(current, previous) {
    if (!current?.dataset?.traceSourceVariableId || !previous) return false;
    const currentContinuity = String(current.dataset.traceVisualContinuityKey || '');
    const previousContinuity = String(previous.dataset?.traceVisualContinuityKey || '');
    if (currentContinuity && currentContinuity === previousContinuity) return false;
    const currentIdentity = String(current.dataset.traceRuntimeIdentity || '');
    const previousIdentity = String(previous.dataset?.traceRuntimeIdentity || '');
    return Boolean(currentIdentity && previousIdentity && currentIdentity !== previousIdentity);
  }

  function previousVisualByContinuity(previousObjects, continuityKey, preferredKey = '') {
    if (!continuityKey) return null;
    const preferred = previousVisualElement(previousObjects, preferredKey);
    if (String(preferred?.dataset?.traceVisualContinuityKey || '') === continuityKey) {
      return { key: preferredKey, element: preferred };
    }
    for (const [topKey, object] of previousObjects || []) {
      const candidates = [
        object,
        ...(object?.querySelectorAll?.('[data-trace-visual-continuity-key]') || [])
      ];
      const element = candidates.find(candidate => (
        String(candidate?.dataset?.traceVisualContinuityKey || '') === continuityKey
      ));
      if (!element) continue;
      return {
        key: String(element.dataset?.traceObjectKey || '') || topKey,
        element
      };
    }
    return null;
  }

  function markerContinuationFor(element, key, previousPlacements, previousObjects) {
    if (!element?.dataset?.traceSourceVariableId) return null;
    const continuityKey = String(element.dataset.traceVisualContinuityKey || '');
    if (!continuityKey) return null;
    const match = previousVisualByContinuity(previousObjects, continuityKey, key);
    if (!match?.element) return null;
    const placement = previousPlacements?.get?.(match.key)
      || previousPlacements?.get?.(key);
    if (!placement) return null;
    return { ...match, placement };
  }

  function markerNeedsEntrance({
    element, key, previousPlacements, previousObjects,
    currentAutomaticMarkers = new Set(), previousAutomaticMarkers = new Set()
  } = {}) {
    if (!element?.dataset?.traceSourceVariableId) return false;
    const continuation = markerContinuationFor(
      element, key, previousPlacements, previousObjects
    );
    const previousVisual = continuation?.element
      || previousVisualElement(previousObjects, key);
    const sourceExists = Boolean(continuation || previousPlacements?.has?.(key));
    const automaticMarkerAppeared = currentAutomaticMarkers.has(key)
      && !previousAutomaticMarkers.has(key)
      && !continuation;
    return !sourceExists
      || automaticMarkerAppeared
      || markerActivationChanged(element, previousVisual);
  }

  function recursiveMarkerTransitionSteps({
    previousPlacements, currentPlacements, previousObjects, currentElements,
    transitionForKey, duration, eventControlledKeys = new Set()
  } = {}) {
    const steps = [];
    currentElements?.forEach?.((element, key) => {
      const continuityKey = String(element?.dataset?.traceVisualContinuityKey || '');
      const currentIdentity = String(element?.dataset?.traceRuntimeIdentity || '');
      if (!continuityKey || !currentIdentity || eventControlledKeys.has(key)) return;
      const previousMatch = previousVisualByContinuity(previousObjects, continuityKey, key);
      const previousIdentity = String(previousMatch?.element?.dataset?.traceRuntimeIdentity || '');
      if (!previousIdentity || previousIdentity === currentIdentity) return;
      const beforePlacement = previousPlacements?.get?.(previousMatch.key)
        || previousPlacements?.get?.(key);
      const afterPlacement = currentPlacements?.get?.(key);
      if (!beforePlacement || !afterPlacement) return;
      const before = motionPosition(previousMatch.element, beforePlacement);
      const after = motionPosition(element, afterPlacement);
      if (![before?.x, before?.y, after?.x, after?.y].every(Number.isFinite)) return;
      if (Math.abs(before.x - after.x) < 0.1 && Math.abs(before.y - after.y) < 0.1) return;
      const transition = transitionForKey?.(key) || {};
      const mode = transition.requestedMode || transition.mode || 'move';
      if (mode === 'instant' || mode === 'fade') return;
      steps.push({
        id: `recursive-marker-move:${continuityKey}`,
        kind: 'object-transition',
        subtype: 'recursive-marker-move',
        targetKey: key,
        sourceKey: previousMatch.key,
        visualContinuityKey: continuityKey,
        from: { x: before.x, y: before.y },
        to: { x: after.x, y: after.y },
        durationMs: Math.max(1, Number(transition.duration) || Number(duration) || 520),
        easing: String(transition.easing || 'smooth'),
        blocking: true,
        enabled: true,
        source: 'automatic'
      });
    });
    return steps;
  }

  function createPlaybackPlan({
    frame, direction, runId = 0, transitionSteps = [], enteringMarkerKeys = [], eventTimeline = []
  } = {}) {
    const enabledTransitions = transitionSteps.filter(step => step?.enabled !== false);
    const transitionDuration = enabledTransitions.reduce((end, step) => (
      step.blocking === false ? end : Math.max(end, Number(step.durationMs) || 0)
    ), 0);
    const entranceTargets = [...new Set(enteringMarkerKeys)].filter(Boolean);
    const entranceDuration = entranceTargets.length ? APPEAR_TIMING.duration : 0;
    const entranceStart = transitionDuration;
    const eventStart = entranceStart + entranceDuration;
    const eventSteps = eventTimeline.map(slot => ({
      id: `trace-event:${slot.event?.id || slot.event?.order || slot.start}`,
      kind: 'trace-event',
      subtype: String(slot.animation || slot.type || ''),
      eventId: String(slot.event?.id || ''),
      eventType: String(slot.type || slot.event?.type || ''),
      eventOrder: Number(slot.event?.order),
      startMs: Number(slot.start) || 0,
      durationMs: Math.max(0, Number(slot.duration) || 0),
      endMs: Number(slot.end) || 0,
      blocking: true,
      enabled: true
    }));
    const eventEnd = eventTimeline.reduce(
      (end, slot) => Math.max(end, Number(slot.end) || 0), eventStart
    );
    return {
      version: 1,
      id: `frame-playback:${frame?.id || 'unknown'}:${runId}`,
      frameId: String(frame?.id || ''),
      direction: Number(direction) || 0,
      preEventDurationMs: eventStart,
      totalDurationMs: Math.max(eventStart, eventEnd),
      phases: [
        {
          id: 'frame-transition',
          mode: 'parallel',
          startMs: 0,
          durationMs: transitionDuration,
          steps: enabledTransitions
        },
        {
          id: 'object-entrance',
          mode: 'parallel',
          startMs: entranceStart,
          durationMs: entranceDuration,
          steps: entranceTargets.map(targetKey => ({
            id: `marker-enter:${targetKey}`,
            kind: 'object-entrance',
            subtype: 'marker-enter',
            targetKey,
            durationMs: APPEAR_TIMING.duration,
            blocking: true,
            enabled: true,
            source: 'automatic'
          }))
        },
        {
          id: 'trace-events',
          mode: 'sequence',
          startMs: eventStart,
          durationMs: Math.max(0, eventEnd - eventStart),
          steps: eventSteps
        }
      ]
    };
  }

  function playbackPhaseAt(plan, elapsed) {
    return plan?.phases?.find(phase => (
      Number(phase.durationMs) > 0
      && elapsed >= Number(phase.startMs)
      && elapsed < Number(phase.startMs) + Number(phase.durationMs)
    ))?.id || '';
  }

  const PRESENTATION_HINT_SELECTOR = '.highlight-blink, .arrow-bounce';

  function removePresentationHints(element) {
    element?.querySelectorAll?.(PRESENTATION_HINT_SELECTOR).forEach(hint => hint.remove());
  }

  function syncPresentationHints(element) {
    if (!element) return;
    const hints = [];
    if (element.matches?.(PRESENTATION_HINT_SELECTOR)) hints.push(element);
    hints.push(...(element.querySelectorAll?.(PRESENTATION_HINT_SELECTOR) || []));
    hints.forEach(hint => window.HintWidgets?.continuePresentationLoop?.(
      hint,
      hint.dataset?.tracePresentationId || ''
    ));
  }

  function clonePresentationHints(element) {
    if (!element?.querySelector?.(PRESENTATION_HINT_SELECTOR)) return null;
    const overlay = element.cloneNode(true);
    removeAnimationNodes(overlay);
    [...overlay.querySelectorAll('*')].reverse().forEach(node => {
      if (node.matches?.(PRESENTATION_HINT_SELECTOR)
        || node.querySelector?.(PRESENTATION_HINT_SELECTOR)) return;
      node.remove();
    });
    [overlay, ...overlay.querySelectorAll('[id]')].forEach(node => node.removeAttribute?.('id'));
    [overlay, ...overlay.querySelectorAll('[data-trace-object-key]')].forEach(node => {
      node.removeAttribute?.('data-trace-object-key');
      node.removeAttribute?.('data-trace-object-id');
    });
    syncPresentationHints(overlay);
    overlay.classList.add('asm-trace-presentation-overlay');
    overlay.setAttribute('pointer-events', 'none');
    return overlay;
  }

  function alignedRectStates(source, target, fallbackKey = '$object') {
    const states = new Map();
    const sourceRects = [...(source?.querySelectorAll?.('rect') || [])];
    const targetRects = [...(target?.querySelectorAll?.('rect') || [])];
    targetRects.forEach((rect, index) => {
      const sourceRect = sourceRects[index];
      if (!sourceRect) return;
      const opacity = sourceRect.hasAttribute('fill-opacity')
        ? Number(sourceRect.getAttribute('fill-opacity'))
        : 1;
      states.set(rectKey(rect, index, fallbackKey), {
        fill: sourceRect.getAttribute('fill') || '',
        opacity: Number.isFinite(opacity) ? opacity : 1,
        stroke: sourceRect.getAttribute('stroke'),
        strokeOpacity: sourceRect.getAttribute('stroke-opacity'),
        strokeWidth: sourceRect.getAttribute('stroke-width'),
        rx: sourceRect.getAttribute('rx'),
        ry: sourceRect.getAttribute('ry')
      });
    });
    return states;
  }

  function applyRectState(rect, state) {
    if (!rect || !state) return;
    if (state.fill) rect.setAttribute('fill', state.fill);
    else rect.removeAttribute('fill');
    rect.setAttribute('fill-opacity', String(state.opacity));
    [
      ['stroke', state.stroke],
      ['stroke-opacity', state.strokeOpacity],
      ['stroke-width', state.strokeWidth],
      ['rx', state.rx],
      ['ry', state.ry]
    ].forEach(([attribute, value]) => {
      if (value == null) rect.removeAttribute(attribute);
      else rect.setAttribute(attribute, value);
    });
  }

  function alignedTextStates(source, target) {
    const states = [];
    const sourceTexts = [...(source?.querySelectorAll?.('text') || [])];
    const targetTexts = [...(target?.querySelectorAll?.('text') || [])];
    targetTexts.forEach((text, index) => {
      const sourceText = sourceTexts[index];
      if (!sourceText) return;
      states.push({
        text,
        before: {
          content: sourceText.textContent,
          fill: sourceText.getAttribute('fill'),
          fillOpacity: sourceText.getAttribute('fill-opacity'),
          opacity: sourceText.getAttribute('opacity'),
          fontFamily: sourceText.getAttribute('font-family'),
          fontSize: sourceText.getAttribute('font-size'),
          fontWeight: sourceText.getAttribute('font-weight'),
          fontStyle: sourceText.getAttribute('font-style'),
          textDecoration: sourceText.getAttribute('text-decoration')
        },
        after: {
          content: text.textContent,
          fill: text.getAttribute('fill'),
          fillOpacity: text.getAttribute('fill-opacity'),
          opacity: text.getAttribute('opacity'),
          fontFamily: text.getAttribute('font-family'),
          fontSize: text.getAttribute('font-size'),
          fontWeight: text.getAttribute('font-weight'),
          fontStyle: text.getAttribute('font-style'),
          textDecoration: text.getAttribute('text-decoration')
        }
      });
    });
    return states;
  }

  function applyTextState(text, state) {
    if (!text || !state) return;
    text.textContent = state.content ?? '';
    [
      ['fill', state.fill],
      ['fill-opacity', state.fillOpacity],
      ['opacity', state.opacity],
      ['font-family', state.fontFamily],
      ['font-size', state.fontSize],
      ['font-weight', state.fontWeight],
      ['font-style', state.fontStyle],
      ['text-decoration', state.textDecoration]
    ].forEach(([attribute, value]) => {
      if (value == null) text.removeAttribute(attribute);
      else text.setAttribute(attribute, value);
    });
  }

  function topLevelKey(element, root) {
    let current = element;
    let key = element?.dataset?.traceObjectKey || '';
    while (current?.parentElement && current.parentElement !== root) {
      const parentObject = current.parentElement.closest?.('[data-trace-object-key]');
      if (!parentObject || !root.contains(parentObject)) break;
      current = parentObject;
      key = current.dataset.traceObjectKey || key;
    }
    return key;
  }

  function parentObjectKey(element, root) {
    const parent = element?.parentElement?.closest?.('[data-trace-object-key]');
    return parent && root.contains(parent) ? parent.dataset.traceObjectKey || '' : '';
  }

  function motionPosition(element, fallback) {
    if (element?.getAttribute?.('data-trace-position-space') !== 'origin') return fallback;
    const x = Number(element.getAttribute('data-trace-position-x'));
    const y = Number(element.getAttribute('data-trace-position-y'));
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : fallback;
  }

  function previousKeysByRuntimeIdentity(previousObjects) {
    const keys = new Map();
    previousObjects?.forEach?.((element, key) => {
      const identity = element?.dataset?.traceRuntimeIdentity || '';
      if (identity && !keys.has(identity)) keys.set(identity, key);
    });
    return keys;
  }

  function previousAliasKey(sourceKey, topKey, topElement, previousPlacements, identityKeys) {
    if (!sourceKey) return sourceKey;
    const identity = topElement?.dataset?.traceRuntimeIdentity || '';
    const previousTopKey = identity ? identityKeys.get(identity) : '';
    if (previousTopKey && topKey) {
      const suffix = sourceKey === topKey
        ? ''
        : (sourceKey.startsWith(`${topKey}#`) || sourceKey.startsWith(`${topKey}:`)
          ? sourceKey.slice(topKey.length)
          : null);
      if (suffix != null) {
        const alias = `${previousTopKey}${suffix}`;
        if (previousPlacements?.has?.(alias)) return alias;
      }
    }
    return sourceKey;
  }

  function swapSources(document, frame, eventTimeline = []) {
    const sources = new Map();
    orderedEvents(frame).filter(event => (
      event.type === 'swap'
      && event.enabled !== false
      && event.autoAnimationDisabled !== true
    )).forEach(event => {
      const slot = eventTimeline.find(item => item.event === event);
      if (!slot) return;
      const targets = (event.targets || []).filter(target => target.variableId && target.indexExpression);
      if (targets.length < 2 || targets[0].variableId !== targets[1].variableId) return;
      const indices = targets.slice(0, 2).map(target => Number(
        target.resolvedIndex != null && Number.isInteger(Number(target.resolvedIndex))
          ? target.resolvedIndex
          : window.ASMTraceRules?.resolveExpression?.(document, frame, target.indexExpression)
      ));
      if (indices.some(index => !Number.isInteger(index)) || indices[0] === indices[1]) return;
      const variableKey = objectKeyForVariable(frame, targets[0].variableId);
      const keys = indices.map(index => `${variableKey}#${index}`);
      const start = Math.max(0, Number(slot?.start) || 0);
      sources.set(keys[0], { sourceKey: keys[1], start });
      sources.set(keys[1], { sourceKey: keys[0], start });
    });
    return sources;
  }

  function heapLayoutElement(element) {
    if (!element) return null;
    return element.matches?.('[data-layout="heap"]')
      ? element
      : element.querySelector?.('[data-layout="heap"]');
  }

  function heapSwapIndices(event, traceDocument, frame) {
    return (event?.targets || []).slice(0, 2).map(target => {
      const captured = Number(target?.resolvedIndex);
      if (Object.prototype.hasOwnProperty.call(target || {}, 'resolvedIndex')
        && Number.isInteger(captured)) return captured;
      const resolved = Number(window.ASMTraceRules?.resolveExpression?.(
        traceDocument, frame, target?.indexExpression
      ));
      return Number.isInteger(resolved) ? resolved : NaN;
    });
  }

  function svgBox(element) {
    try {
      const box = element?.getBBox?.();
      if (!box) return null;
      return {
        x: Number(box.x) || 0,
        y: Number(box.y) || 0,
        width: Number(box.width) || 0,
        height: Number(box.height) || 0
      };
    } catch {
      return null;
    }
  }

  function prepareHeapResizeSwaps(
    traceDocument, eventFrame, eventTimeline, currentElements, previousObjects, previousIdentityKeys
  ) {
    const stages = [];
    const stagedTopKeys = new Set();
    eventTimeline.forEach(slot => {
      if (slot.type !== 'swap') return;
      const variableId = slot.event?.targets?.[0]?.variableId || '';
      const topKey = objectKeyForVariable(eventFrame, variableId);
      const currentTop = currentElements?.get?.(topKey);
      const currentHeap = heapLayoutElement(currentTop);
      const identity = currentTop?.dataset?.traceRuntimeIdentity || '';
      const previousTopKey = (identity && previousIdentityKeys.get(identity)) || topKey;
      const previousObject = previousObjects?.get?.(previousTopKey);
      const previousHeap = heapLayoutElement(previousObject);
      const previousWidth = Number(previousHeap?.getAttribute?.('data-heap-totalW'));
      const currentWidth = Number(currentHeap?.getAttribute?.('data-heap-totalW'));
      const indices = heapSwapIndices(slot.event, traceDocument, eventFrame);
      const changedWidth = Number.isFinite(previousWidth) && Number.isFinite(currentWidth)
        && Math.abs(previousWidth - currentWidth) > 0.1;
      const previousCells = indices.map(index => (
        [...(previousHeap?.querySelectorAll?.('[data-trace-index]') || [])]
          .find(cell => Number(cell.dataset.traceIndex) === index) || null
      ));
      const currentCells = indices.map(index => (
        [...(currentHeap?.querySelectorAll?.('[data-trace-index]') || [])]
          .find(cell => Number(cell.dataset.traceIndex) === index) || null
      ));
      const changedCellGeometry = previousCells.some((cell, sourcePosition) => {
        const previousBox = svgBox(cell);
        const targetBox = svgBox(currentCells[1 - sourcePosition])
          || svgBox(previousCells[1 - sourcePosition]);
        return previousBox && targetBox && (
          Math.abs(previousBox.width - targetBox.width) > 0.1
          || Math.abs(previousBox.height - targetBox.height) > 0.1
        );
      });
      if ((!changedWidth && !changedCellGeometry) || stagedTopKeys.has(topKey)
        || indices.some(index => !Number.isInteger(index))
        || previousCells.some(cell => !cell)
        || (!changedWidth && currentCells.some(cell => !cell))) return;
      stagedTopKeys.add(topKey);
      stages.push({
        slot, topKey, previousTopKey, currentTop, currentHeap,
        previousObject, previousHeap, previousWidth, currentWidth, indices, currentCells
      });
    });
    return stages;
  }

  function createHeapResizeSwapStages(root, descriptors) {
    const stages = descriptors.map(descriptor => {
      const ghost = descriptor.previousObject.cloneNode(true);
      const presentationOverlay = clonePresentationHints(descriptor.currentTop);
      // The ghost exists to retain pre-swap values and geometry. Frame-authored
      // highlights and points describe the current frame, so keeping their old
      // copies here makes the style look as if it updates only after the swap.
      removePresentationHints(ghost);
      removeAnimationNodes(ghost);
      [ghost, ...ghost.querySelectorAll('[id]')].forEach(element => element.removeAttribute?.('id'));
      ghost.classList.add('asm-trace-heap-resize-ghost');
      ghost.setAttribute('data-trace-heap-resize-ghost', '1');
      ghost.setAttribute('pointer-events', 'none');
      ghost.setAttribute('opacity', '1');
      appendBelowTraceIndicators(root, ghost);
      if (presentationOverlay) appendBelowTraceIndicators(root, presentationOverlay);

      const ghostHeap = heapLayoutElement(ghost);
      const ghostCellStates = new Map();
      [...ghostHeap.querySelectorAll('[data-trace-index]')].forEach(cell => {
        const index = Number(cell.dataset.traceIndex);
        const box = svgBox(cell);
        if (!Number.isInteger(index) || !box || ghostCellStates.has(index)) return;
        ghostCellStates.set(index, {
          cell,
          box,
          baseTransform: cell.getAttribute('transform') || '',
          eventTransforms: [],
          highlight: null
        });
      });
      const currentCellsByIndex = new Map();
      [...descriptor.currentHeap.querySelectorAll('[data-trace-index]')].forEach(cell => {
        const index = Number(cell.dataset.traceIndex);
        if (Number.isInteger(index) && !currentCellsByIndex.has(index)) {
          currentCellsByIndex.set(index, cell);
        }
      });
      const ghostCells = descriptor.indices.map(index => (
        ghostCellStates.get(index)?.cell
      ));
      const cellBoxes = ghostCells.map(cell => svgBox(cell));
      const targetCellBoxes = descriptor.currentCells
        .map((cell, index, cells) => (
          svgBox(cells[1 - index]) || svgBox(ghostCells[1 - index])
        ));
      const cellVisuals = ghostCells.map(cell => {
        const rect = cell.querySelector(':scope > rect');
        return { rect };
      });
      const counterScaledElements = [...ghostHeap.querySelectorAll('text, path')].map(element => {
        const box = svgBox(element);
        return {
          element,
          centerX: box ? box.x + box.width / 2 : 0,
          baseTransform: element.getAttribute('transform') || ''
        };
      });
      const baseTransforms = ghostCells.map(cell => cell.getAttribute('transform') || '');
      const ghostHeapBaseTransform = ghostHeap.getAttribute('transform') || '';
      const ghostWidthElement = ghostHeap.querySelector(':scope > .outerframe-bg') || ghostHeap;
      const currentWidthElement = descriptor.currentHeap.querySelector(':scope > .outerframe-bg')
        || descriptor.currentHeap;

      const resizeWrapper = createSvg('g', {
        'data-trace-heap-resize-current': '1',
        opacity: 0
      });
      const currentParent = descriptor.currentHeap.parentNode;
      currentParent.insertBefore(resizeWrapper, descriptor.currentHeap);
      resizeWrapper.append(descriptor.currentHeap);
      let renderedPreviousWidth = 0;
      let renderedCurrentWidth = 0;
      try {
        renderedPreviousWidth = ghostWidthElement.getBoundingClientRect().width;
        renderedCurrentWidth = currentWidthElement.getBoundingClientRect().width;
      } catch {
        // Fall back to the renderer's logical width when the SVG is not measurable yet.
      }
      const targetWidthRatio = renderedPreviousWidth > 0 && renderedCurrentWidth > 0
        ? renderedCurrentWidth / renderedPreviousWidth
        : (descriptor.previousWidth > 0 ? descriptor.currentWidth / descriptor.previousWidth : 1);

      return {
        ...descriptor,
        ghost,
        ghostCellStates,
        currentCellsByIndex,
        ghostCells,
        cellBoxes,
        targetCellBoxes,
        cellVisuals,
        counterScaledElements,
        baseTransforms,
        ghostHeap,
        ghostHeapBaseTransform,
        ghostWidthElement,
        currentWidthElement,
        resizeWrapper,
        presentationOverlay,
        targetWidthRatio,
        appliedScaleX: 1,
        update(elapsed, eventAdjustments) {
          const swapStart = this.slot.start;
          const swapProgress = easeOutCubic(clamp01(
            (elapsed - swapStart) / Math.max(1, this.slot.duration)
          ));
          let liveTargetWidthRatio = this.targetWidthRatio;
          try {
            const ghostRenderedWidth = this.ghostWidthElement.getBoundingClientRect().width;
            const currentRenderedWidth = this.currentWidthElement.getBoundingClientRect().width;
            const ghostNaturalWidth = ghostRenderedWidth / Math.max(0.001, this.appliedScaleX);
            if (ghostNaturalWidth > 0 && currentRenderedWidth > 0) {
              liveTargetWidthRatio = currentRenderedWidth / ghostNaturalWidth;
            }
          } catch {
            // Keep the initial renderer ratio when the live SVG geometry is unavailable.
          }
          if (this.currentWidth < this.previousWidth) {
            liveTargetWidthRatio = Math.min(1, liveTargetWidthRatio);
          } else if (this.currentWidth > this.previousWidth) {
            liveTargetWidthRatio = Math.max(1, liveTargetWidthRatio);
          }
          const scaleX = 1 + (liveTargetWidthRatio - 1) * swapProgress;
          this.appliedScaleX = scaleX;
          this.ghostCellStates.forEach((state, index) => {
            const adjustment = eventAdjustments?.get?.(`${this.topKey}#${index}`)
              || eventAdjustments?.get?.(`${this.previousTopKey}#${index}`)
              || null;
            const eventX = Number(adjustment?.x) || 0;
            const eventY = Number(adjustment?.y) || 0;
            const eventScale = Number(adjustment?.scale) || 1;
            const centerX = state.box.x + state.box.width / 2;
            const centerY = state.box.y + state.box.height / 2;
            const eventTranslate = Math.abs(eventX) > 0.01 || Math.abs(eventY) > 0.01
              ? `translate(${eventX}, ${eventY})`
              : '';
            const eventScaleTransform = Math.abs(eventScale - 1) > 0.001
              ? `translate(${centerX}, ${centerY}) scale(${eventScale}) translate(${-centerX}, ${-centerY})`
              : '';
            state.eventTransforms = [eventTranslate, eventScaleTransform].filter(Boolean);
            state.cell.setAttribute(
              'transform', [eventTranslate, state.baseTransform, eventScaleTransform].filter(Boolean).join(' ')
            );

            const sourceHighlight = this.currentCellsByIndex.get(index)
              ?.querySelector?.(':scope > .asm-trace-compare-highlight');
            if (sourceHighlight) {
              if (!state.highlight) {
                state.highlight = addHighlight(state.cell, sourceHighlight.getAttribute('stroke') || '#333333');
              }
              state.highlight?.setAttribute('stroke', sourceHighlight.getAttribute('stroke') || '#333333');
              state.highlight?.setAttribute('opacity', sourceHighlight.getAttribute('opacity') || '1');
            } else if (state.highlight) {
              state.highlight.remove();
              state.highlight = null;
            }
          });
          this.ghostCells.forEach((cell, index) => {
            const own = this.cellBoxes[index];
            const target = this.targetCellBoxes[index];
            if (!own || !target || own.width <= 0 || own.height <= 0) return;
            const ownCenterX = own.x + own.width / 2;
            const ownCenterY = own.y + own.height / 2;
            const targetCenterX = target.x + target.width / 2;
            const targetCenterY = target.y + target.height / 2;
            const desiredCenterX = ownCenterX + (targetCenterX - ownCenterX) * swapProgress;
            const desiredCenterY = ownCenterY + (targetCenterY - ownCenterY) * swapProgress;
            const desiredWidth = own.width + (target.width - own.width) * swapProgress;
            const translateX = desiredCenterX / Math.max(0.001, scaleX) - ownCenterX;
            const translateY = desiredCenterY - ownCenterY;
            const transform = `translate(${translateX}, ${translateY})`;
            const state = this.ghostCellStates.get(this.indices[index]);
            cell.setAttribute(
              'transform', [transform, state?.baseTransform || this.baseTransforms[index],
                ...(state?.eventTransforms || [])].filter(Boolean).join(' ')
            );

            const visual = this.cellVisuals[index];
            if (visual?.rect) {
              const localWidth = desiredWidth / Math.max(0.001, scaleX);
              visual.rect.setAttribute('x', String(ownCenterX - localWidth / 2));
              visual.rect.setAttribute('width', String(localWidth));
            }
          });
          const heapScale = Math.abs(scaleX - 1) > 0.001 ? `scale(${scaleX}, 1)` : '';
          this.ghostHeap.setAttribute(
            'transform', [this.ghostHeapBaseTransform, heapScale].filter(Boolean).join(' ')
          );
          const inverseScaleX = 1 / Math.max(0.001, scaleX);
          this.counterScaledElements.forEach(({ element, centerX, baseTransform }) => {
            const counterScale = Math.abs(inverseScaleX - 1) > 0.001
              ? `translate(${centerX}, 0) scale(${inverseScaleX}, 1) translate(${-centerX}, 0)`
              : '';
            element.setAttribute('transform', [baseTransform, counterScale].filter(Boolean).join(' '));
          });
          const finished = swapProgress >= 1;
          this.ghost.setAttribute('opacity', finished ? '0' : '1');
          this.resizeWrapper.setAttribute('opacity', finished ? '1' : '0');
          this.resizeWrapper.removeAttribute('transform');
        },
        remove() {
          this.presentationOverlay?.remove();
          this.ghost.remove();
          if (this.resizeWrapper?.parentNode && this.currentHeap) {
            this.resizeWrapper.parentNode.insertBefore(this.currentHeap, this.resizeWrapper);
            this.resizeWrapper.remove();
          }
        }
      };
    });
    return {
      heldPreviousKeys: new Set(stages.map(stage => stage.previousTopKey)),
      update(elapsed, eventAdjustments) {
        stages.forEach(stage => stage.update(elapsed, eventAdjustments));
      },
      finish() { stages.splice(0).forEach(stage => stage.remove()); }
    };
  }

  function objectKeyForVariable(frame, variableId) {
    const source = frame?.source || {};
    if (source.objectId && source.primaryVariableId === variableId) return source.objectId;
    return variableId;
  }

  function displayEventValue(value) {
    if (value == null) return '';
    if (typeof value !== 'object') return String(value);
    if (Object.prototype.hasOwnProperty.call(value, 'value')) return String(value.value ?? '');
    if (Array.isArray(value.items)) return `[${value.items.map(displayEventValue).join(', ')}]`;
    return String(value.label || value.type || value.kind || '');
  }

  function eventTargetKey(traceDocument, eventFrame, target) {
    if (!target?.variableId) return '';
    const variableKey = objectKeyForVariable(eventFrame, target.variableId);
    const expression = String(target.indexExpression ?? '').trim();
    const variable = traceDocument?.variables?.[target.variableId];
    if (!expression && ['scalar', 'string'].includes(variable?.kind)) {
      return `${variableKey}#0`;
    }
    if (!expression) return variableKey;
    const capturedIndex = Number(target.resolvedIndex);
    const indices = Object.prototype.hasOwnProperty.call(target, 'resolvedIndex')
      && Number.isInteger(capturedIndex)
      ? [capturedIndex]
      : expression.split(',').map(part => Number(
        window.ASMTraceRules?.resolveExpression?.(traceDocument, eventFrame, part.trim())
      ));
    if (!indices.length || indices.some(index => !Number.isInteger(index))) return variableKey;
    return `${variableKey}#${indices.join(',')}`;
  }

  function mutationVisualCommits(traceDocument, eventFrame, eventTimeline) {
    const commits = new Map();
    const remember = (key, slot, commitAt) => {
      if (!key) return;
      const previous = commits.get(key);
      if (!previous || commitAt > previous.time) {
        commits.set(key, { time: commitAt, slot });
      }
    };
    eventTimeline.forEach(slot => {
      if (slot.animation === 'swap') {
        (slot.event?.targets || []).slice(0, 2).forEach(target => {
          const key = eventTargetKey(traceDocument, eventFrame, target);
          remember(key, slot, slot.end);
          remember(`${key}:index`, slot, slot.end);
        });
        return;
      }
      if (slot.animation !== 'assign') return;
      const target = (slot.event?.targets || []).find(item => item.role === 'target')
        || slot.event?.targets?.[0];
      const key = eventTargetKey(traceDocument, eventFrame, target);
      const commitAt = (Number(slot.effectStart) || Number(slot.start) || 0)
        + ASSIGN_TIMING.frame
        + (slot.markerAssignment ? ASSIGN_TIMING.valueHold : 0)
        + ASSIGN_TIMING.drop;
      remember(key, slot, commitAt);
      remember(`${key}:index`, slot, commitAt);
    });
    return commits;
  }

  function comparisonPoint(placements, key) {
    const box = placements?.get?.(key);
    if (!box) return null;
    return {
      x: (Number(box.x) || 0) + (Number(box.width) || 0) / 2,
      y: Number(box.y) || 0,
      width: Number(box.width) || 0,
      height: Number(box.height) || 0
    };
  }

  function markerVisualKey(elements, variableId) {
    for (const [key, element] of elements || []) {
      if (element?.dataset?.traceSourceVariableId === variableId) return key;
    }
    return '';
  }

  function eventOperand(traceDocument, eventFrame, target, value, placements, elements, visualKeyForSource) {
    const logicalKey = eventTargetKey(traceDocument, eventFrame, target);
    let visualKey = typeof visualKeyForSource === 'function' ? visualKeyForSource(logicalKey) : logicalKey;
    if (!elements?.has?.(visualKey)) visualKey = markerVisualKey(elements, target?.variableId) || visualKey;
    const element = elements?.get?.(visualKey) || elements?.get?.(logicalKey);
    const point = comparisonPoint(placements, visualKey) || comparisonPoint(placements, logicalKey);
    if (!element || !point) return null;
    const marker = Boolean(element.dataset?.traceSourceVariableId);
    const markerX = Number(element.dataset?.traceMarkerPopupX);
    const markerY = Number(element.dataset?.traceMarkerPopupY);
    return {
      target,
      logicalKey,
      visualKey,
      element,
      point: marker && Number.isFinite(markerX) && Number.isFinite(markerY)
        ? { ...point, x: markerX, y: markerY }
        : point,
      value: displayEventValue(value),
      numericValue: Number(displayEventValue(value)),
      marker
    };
  }

  function clamp01(value) {
    return Math.max(0, Math.min(1, Number(value) || 0));
  }

  function animationPlaybackRate() {
    const cssRate = Number(getComputedStyle(document.documentElement)
      .getPropertyValue('--asm-animation-playback-rate'));
    return Math.max(0.25, Math.min(4, Number(window.asmGetAnimationPlaybackRate?.()) || cssRate || 1));
  }

  function automaticMarkerKeys(frame) {
    const keys = new Set();
    (frame?.bindings || []).forEach((binding, index) => {
      if (binding?.mode !== 'index' || !binding.sourceVariableId || !binding.targetVariableId) return;
      const targetItems = frame?.state?.[binding.targetVariableId]?.data?.items;
      if (!Array.isArray(targetItems) || !targetItems.length) return;
      keys.add(`studio:auto-frame-binding-${binding.sourceVariableId}-${binding.targetVariableId}-${index}`);
    });
    return keys;
  }

  function eventGap(traceDocument) {
    const value = Number(traceDocument?.studio?.eventSettings?.gapMs);
    return Number.isFinite(value) ? Math.max(0, Math.min(2000, value)) : 500;
  }

  function createSvg(name, attributes = {}, text = '') {
    const element = document.createElementNS('http://www.w3.org/2000/svg', name);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
    if (text !== '') element.textContent = text;
    return element;
  }

  function appendBelowTextLayer(root, element) {
    const textLayer = root.querySelector?.(':scope > .asm-trace-text-layer');
    root.insertBefore(element, textLayer || null);
    return element;
  }

  function appendBelowTraceIndicators(root, element) {
    const foreground = root.querySelector?.(
      ':scope > .asm-trace-bound-object, :scope > .asm-trace-text-layer'
    );
    root.insertBefore(element, foreground || null);
    return element;
  }

  function elementBoundsInRoot(element, root) {
    if (!element || !root) return null;
    try {
      const box = element.getBBox();
      const rootMatrix = root.getScreenCTM();
      const elementMatrix = element.getScreenCTM();
      if (!rootMatrix || !elementMatrix) return null;
      const matrix = rootMatrix.inverse().multiply(elementMatrix);
      const corners = [
        [box.x, box.y],
        [box.x + box.width, box.y],
        [box.x, box.y + box.height],
        [box.x + box.width, box.y + box.height]
      ].map(([x, y]) => new DOMPoint(x, y).matrixTransform(matrix));
      const left = Math.min(...corners.map(point => point.x));
      const top = Math.min(...corners.map(point => point.y));
      const right = Math.max(...corners.map(point => point.x));
      const bottom = Math.max(...corners.map(point => point.y));
      return { x: left, y: top, width: right - left, height: bottom - top };
    } catch {
      return null;
    }
  }

  function markerCellElement(operand) {
    if (!operand?.marker) return null;
    return operand.element.querySelector?.('[data-trace-index="0"] rect')
      || operand.element.querySelector?.('[data-trace-index="0"]')
      || operand.element.querySelector?.('g[id*="cell-"] rect')
      || operand.element.querySelector?.('rect');
  }

  function markerPopupAnchorElement(operand) {
    if (!operand?.marker) return null;
    return operand.element.querySelector?.('.trace-variable-marker-label-box')
      || markerCellElement(operand);
  }

  function markerAssignmentStart(visible, current, delta) {
    const visualValue = Number(visible);
    const currentValue = Number(current);
    const offset = Number(delta) || 0;
    if (!Number.isFinite(visualValue) || !Number.isFinite(currentValue) || Math.abs(offset) < 0.01) {
      return visualValue;
    }
    const previousValue = currentValue + offset;
    // Depending on nesting, getScreenCTM() may already include the initial tween
    // translation. Apply the old-frame delta only when the DOM is still at its
    // destination coordinate.
    return Math.abs(visualValue - previousValue) <= Math.abs(visualValue - currentValue)
      ? visualValue
      : visualValue + offset;
  }

  function compareValuesEqual(operands) {
    if (operands.length < 2) return false;
    const leftNumber = operands[0].numericValue;
    const rightNumber = operands[1].numericValue;
    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber === rightNumber;
    return String(operands[0].value) === String(operands[1].value);
  }

  function compareContactTargets(operands, equalValues) {
    if (operands.length < 2) return [];
    const order = operands
      .map((operand, index) => ({ operand, index }))
      .sort((left, right) => left.operand.point.x - right.operand.point.x || left.index - right.index);
    const left = order[0];
    const right = order[1];
    const contactX = (left.operand.point.x + right.operand.point.x) / 2;
    const leftWidth = Math.max(1, Number(left.operand.point.width) || 1);
    const rightWidth = Math.max(1, Number(right.operand.point.width) || 1);
    const leftCenterY = left.operand.point.y + left.operand.point.height / 2;
    const rightCenterY = right.operand.point.y + right.operand.point.height / 2;
    const sharedCenterY = (leftCenterY + rightCenterY) / 2;
    const verticalGap = equalValues ? 0 : 5;
    const targets = [];
    targets[left.index] = {
      x: contactX - leftWidth / 2 - left.operand.point.x,
      alignY: sharedCenterY - leftCenterY,
      splitY: -verticalGap
    };
    targets[right.index] = {
      x: contactX + rightWidth / 2 - right.operand.point.x,
      alignY: sharedCenterY - rightCenterY,
      splitY: verticalGap
    };
    return targets;
  }

  function compareScaleTargets(operands) {
    if (operands.length < 2) return [];
    const left = operands[0].numericValue;
    const right = operands[1].numericValue;
    if (!Number.isFinite(left) || !Number.isFinite(right) || left === right) return [1, 1];
    return left > right ? [1.14, 0.86] : [0.86, 1.14];
  }

  function addHighlight(element, color) {
    const source = element?.matches?.('rect') ? element : element?.querySelector?.('rect');
    if (!source) return null;
    const highlight = createSvg('rect', {
      class: 'asm-trace-compare-highlight',
      x: source.getAttribute('x') || 0,
      y: source.getAttribute('y') || 0,
      width: source.getAttribute('width') || 0,
      height: source.getAttribute('height') || 0,
      rx: source.getAttribute('rx') || 0,
      fill: 'none',
      stroke: color,
      'stroke-width': 3,
      'pointer-events': 'none'
    });
    element.append(highlight);
    return highlight;
  }

  function displayOperator(operation) {
    return ({ '!=': '≠', '==': '=', '<=': '≤', '>=': '≥' })[operation] || String(operation || '?');
  }

  function createComparisonExpression(root, event, operands, color, preferredTop = null) {
    if (operands.length < 2) return null;
    const centerX = (operands[0].point.x + operands[1].point.x) / 2;
    const top = Number.isFinite(preferredTop)
      ? preferredTop
      : Math.min(operands[0].point.y, operands[1].point.y) - 15;
    const operation = displayOperator(event?.operation);
    const left = `${operands[0].target?.expression || 'left'}(${operands[0].value})`;
    const right = `${operands[1].target?.expression || 'right'}(${operands[1].value})`;
    const fontSize = 14;
    const fallbackWidth = value => Math.max(fontSize * 0.58, Array.from(value).length * fontSize * 0.58);
    const gap = 6;
    const group = createSvg('g', {
      class: 'asm-trace-compare-operator',
      transform: `translate(${centerX}, ${top})`,
      'pointer-events': 'none'
    });
    const textAttributes = {
      y: 0, 'dominant-baseline': 'middle', 'font-family': 'Arial',
      'font-size': fontSize, 'font-weight': 'bold', fill: color
    };
    const leftText = createSvg('text', { ...textAttributes, 'text-anchor': 'start' }, left);
    const operationText = createSvg('text', { ...textAttributes, 'text-anchor': 'middle' }, operation);
    const rightText = createSvg('text', { ...textAttributes, 'text-anchor': 'start' }, right);
    group.append(leftText, operationText, rightText);
    appendBelowTextLayer(root, group);
    const measuredWidth = (node, fallback) => {
      try {
        const width = node.getComputedTextLength();
        return width > 0 ? width : fallback;
      } catch (error) {
        return fallback;
      }
    };
    const leftWidth = measuredWidth(leftText, fallbackWidth(left));
    const operationWidth = measuredWidth(operationText, fallbackWidth(operation));
    const rightWidth = measuredWidth(rightText, fallbackWidth(right));
    const totalWidth = leftWidth + operationWidth + rightWidth + gap * 2;
    const startX = -totalWidth / 2;
    const operationX = startX + leftWidth + gap + operationWidth / 2;
    leftText.setAttribute('x', String(startX));
    operationText.setAttribute('x', String(operationX));
    rightText.setAttribute('x', String(startX + leftWidth + gap + operationWidth + gap));
    if (event?.result !== true) {
      group.append(createSvg('line', {
        x1: operationX - operationWidth / 2 - 2, y1: -8,
        x2: operationX + operationWidth / 2 + 2, y2: 8,
        stroke: color,
        'stroke-width': 2,
        'stroke-linecap': 'square'
      }));
    }
    return group;
  }

  function createMarkerPopup(root, operand, className = 'asm-trace-compare-marker-popup') {
    const source = markerPopupAnchorElement(operand) || (operand.element.matches?.('rect')
      ? operand.element
      : operand.element.querySelector?.('rect'));
    const width = Math.max(16, Number(source?.getAttribute?.('width')) || 18);
    const height = Math.max(16, Number(source?.getAttribute?.('height')) || 18);
    const stroke = source?.getAttribute?.('stroke') || '#333';
    const strokeWidth = source?.getAttribute?.('stroke-width') || 1;
    const group = createSvg('g', {
      class: className,
      'pointer-events': 'none', opacity: 0
    });
    const rect = createSvg('rect', {
      x: -width / 2, y: -height, width, height,
      fill: 'none', stroke, 'stroke-width': strokeWidth,
      'stroke-dasharray': '4 3'
    });
    const text = createSvg('text', {
      x: 0, y: -height / 2,
      'text-anchor': 'middle', 'dominant-baseline': 'middle',
      'font-family': 'Arial', 'font-size': Math.max(7, Math.min(13, height * 0.55)),
      'font-weight': 'bold', fill: source?.nextElementSibling?.getAttribute?.('fill') || '#1f282d'
    }, operand.value);
    group.append(rect, text);
    appendBelowTextLayer(root, group);
    return { group, rect, text, width, height };
  }

  function assignableTargetText(operand) {
    if (!operand || operand.marker) return null;
    return operand.element.matches?.('text')
      ? operand.element
      : operand.element.querySelector?.('text');
  }

  function createAssignmentTransfer(root, sourceOperand, targetOperand, value, sourceVisual = null) {
    if (!sourceOperand || !targetOperand || sourceOperand.marker || targetOperand.marker) return null;
    if (sourceOperand.visualKey === targetOperand.visualKey) return null;
    if (sourceOperand.element.closest?.('[data-trace-visibility="hidden"]')
      || targetOperand.element.closest?.('[data-trace-visibility="hidden"]')) return null;

    let box;
    try {
      box = sourceOperand.element.getBBox();
    } catch (error) {
      return null;
    }
    if (!(box?.width > 0) || !(box?.height > 0)) return null;

    const clone = (sourceVisual || sourceOperand.element).cloneNode(true);
    [clone, ...clone.querySelectorAll('[id], [data-trace-object-key]')].forEach(node => {
      node.removeAttribute?.('id');
      node.removeAttribute?.('data-trace-object-key');
    });
    clone.removeAttribute('transform');
    clone.classList.remove('selected', 'draggable-object', 'asm-trace-selectable');
    removeAnimationNodes(clone);
    const cloneText = clone.matches?.('text') ? clone : clone.querySelector?.('text');
    if (cloneText) cloneText.textContent = displayEventValue(value);

    const group = createSvg('g', {
      class: 'asm-trace-assign-transfer',
      'pointer-events': 'none'
    });
    group.append(clone);
    appendBelowTextLayer(root, group);

    const sourceCenter = {
      x: sourceOperand.point.x,
      y: sourceOperand.point.y + sourceOperand.point.height / 2
    };
    const targetCenter = {
      x: targetOperand.point.x,
      y: targetOperand.point.y + targetOperand.point.height / 2
    };
    const boxCenter = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const sourceScale = {
      x: sourceOperand.point.width / box.width,
      y: sourceOperand.point.height / box.height
    };
    const targetScale = {
      x: targetOperand.point.width / box.width,
      y: targetOperand.point.height / box.height
    };
    const distance = Math.hypot(
      targetCenter.x - sourceCenter.x,
      targetCenter.y - sourceCenter.y
    );
    const arcHeight = Math.min(32, Math.max(10, distance * 0.14));

    return {
      group,
      update(progress, opacity = 1) {
        const x = sourceCenter.x + (targetCenter.x - sourceCenter.x) * progress;
        const y = sourceCenter.y + (targetCenter.y - sourceCenter.y) * progress
          - Math.sin(Math.PI * progress) * arcHeight;
        const scaleX = sourceScale.x + (targetScale.x - sourceScale.x) * progress;
        const scaleY = sourceScale.y + (targetScale.y - sourceScale.y) * progress;
        group.setAttribute(
          'transform',
          `translate(${x}, ${y}) scale(${scaleX}, ${scaleY}) translate(${-boxCenter.x}, ${-boxCenter.y})`
        );
        group.setAttribute('opacity', String(opacity));
      },
      remove() {
        group.remove();
      }
    };
  }

  function prepareAssignmentValues(options, eventFrame, eventTimeline) {
    const targetStates = new Map();
    eventTimeline.forEach(slot => {
      if (slot.animation !== 'assign') return;
      const event = slot.event;
      const target = (event?.targets || []).find(item => item.role === 'target') || event?.targets?.[0];
      if (!target) return;
      const operand = eventOperand(
        options.document, eventFrame, target, event?.payload?.after,
        options.currentPlacements, options.currentElements, key => key
      );
      const targetText = assignableTargetText(operand);
      if (!targetText) return;

      const beforeValue = displayEventValue(event?.payload?.before);
      const afterValue = displayEventValue(event?.payload?.after);
      const state = targetStates.get(targetText);
      if (state) {
        state.finalValue = afterValue;
        return;
      }
      targetStates.set(targetText, { finalValue: afterValue });
      targetText.textContent = beforeValue;
    });

    return {
      finish() {
        targetStates.forEach((state, targetText) => {
          targetText.textContent = state.finalValue;
        });
      }
    };
  }

  function createAssignEffect(
    root, event, traceDocument, eventFrame, placements, elements,
    rawDeltas, appearingKeys, previousObjects
  ) {
    const target = (event?.targets || []).find(item => item.role === 'target') || event?.targets?.[0];
    const source = (event?.targets || []).find(item => item.role === 'source');
    if (!target) return null;
    const operand = eventOperand(
      traceDocument, eventFrame, target, event?.payload?.after,
      placements, elements, key => key
    );
    if (!operand) return null;
    const rawDelta = appearingKeys?.has?.(operand.visualKey)
      ? { x: 0, y: 0 }
      : (rawDeltas?.get?.(operand.visualKey) || { x: 0, y: 0 });
    const markerBounds = operand.marker ? elementBoundsInRoot(markerPopupAnchorElement(operand), root) : null;
    let x = markerBounds
      ? markerAssignmentStart(
        markerBounds.x + markerBounds.width / 2,
        operand.point.x,
        rawDelta.x
      )
      : operand.point.x + (operand.marker ? Number(rawDelta.x) || 0 : 0);
    let y = markerBounds
      ? markerAssignmentStart(markerBounds.y, operand.point.y, rawDelta.y)
      : operand.point.y + (operand.marker ? Number(rawDelta.y) || 0 : 0);
    const beforeValue = displayEventValue(event?.payload?.before);
    const afterValue = displayEventValue(event?.payload?.after);
    const sourceValue = event?.payload?.source ?? event?.payload?.after;
    const sourceLabel = String(source?.expression || afterValue || '').trim();
    const sourceOperand = source
      ? eventOperand(
        traceDocument, eventFrame, source, sourceValue,
        placements, elements, key => key
      )
      : null;
    const previousSourceVisual = sourceOperand
      ? previousVisualElement(previousObjects, sourceOperand.visualKey)
      : null;
    let popup = null;
    let markerIncomingText = null;
    let fallingText = null;
    let transfer = null;
    let targetText = null;
    let finalText = '';
    let originalOpacity = null;
    let landed = false;
    let popupScale = 1;

    if (operand.marker) {
      popup = createMarkerPopup(
        root,
        { ...operand, value: beforeValue },
        'asm-trace-assign-marker-popup'
      );
      markerIncomingText = createSvg('text', {
        class: 'asm-trace-assign-marker-source',
        x: 0,
        y: -popup.height / 2 - 20,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        'font-family': popup.text.getAttribute('font-family') || 'Arial',
        'font-size': popup.text.getAttribute('font-size') || 12,
        'font-weight': popup.text.getAttribute('font-weight') || 'bold',
        fill: popup.text.getAttribute('fill') || '#1f282d',
        opacity: 0,
        'pointer-events': 'none'
      }, sourceLabel);
      popup.group.append(markerIncomingText);
    } else {
      targetText = assignableTargetText(operand);
      finalText = afterValue;
      originalOpacity = targetText?.getAttribute?.('opacity');
      if (targetText) targetText.textContent = beforeValue;
      transfer = createAssignmentTransfer(
        root, sourceOperand, operand, sourceValue, previousSourceVisual
      );
      if (!transfer) {
        const targetY = y + operand.point.height / 2;
        fallingText = createSvg('text', {
          class: 'asm-trace-assign-falling-value',
          x,
          y: targetY - Math.max(24, operand.point.height * 0.8),
          'text-anchor': 'middle',
          'dominant-baseline': 'middle',
          'font-family': targetText?.getAttribute?.('font-family') || 'Arial',
          'font-size': targetText?.getAttribute?.('font-size') || Math.max(12, operand.point.height * 0.48),
          'font-weight': targetText?.getAttribute?.('font-weight') || 'normal',
          fill: targetText?.getAttribute?.('fill') || '#1f282d',
          opacity: 0,
          'pointer-events': 'none'
        }, afterValue);
        fallingText.dataset.targetY = String(targetY);
        appendBelowTextLayer(root, fallingText);
      }
    }

    function landValue() {
      if (landed) return;
      landed = true;
      if (targetText) targetText.textContent = finalText;
      if (popup) popup.text.textContent = afterValue;
      markerIncomingText?.setAttribute('opacity', '0');
      fallingText?.setAttribute('opacity', '0');
    }

    return {
      syncPosition() {
        if (!popup) return;
        const visibleBounds = elementBoundsInRoot(markerPopupAnchorElement(operand), root);
        if (!visibleBounds) return;
        x = visibleBounds.x + visibleBounds.width / 2;
        y = visibleBounds.y;
        popup.group.setAttribute('transform', `translate(${x}, ${y}) scale(${popupScale})`);
      },
      update(elapsed) {
        const frameProgress = easeOutCubic(clamp01(elapsed / ASSIGN_TIMING.frame));
        const dropStart = operand.marker
          ? ASSIGN_TIMING.frame + ASSIGN_TIMING.valueHold
          : 0;
        const dropProgress = easeOutCubic(clamp01((elapsed - dropStart) / ASSIGN_TIMING.drop));
        const exitStart = ASSIGN_TIMING.frame
          + (operand.marker ? ASSIGN_TIMING.valueHold : 0)
          + ASSIGN_TIMING.drop + ASSIGN_TIMING.hold;
        const exit = elapsed > exitStart
          ? easeOutCubic(clamp01((elapsed - exitStart) / ASSIGN_TIMING.exit))
          : 0;
        if (popup) {
          popupScale = 0.82 + 0.18 * frameProgress;
          popup.group.setAttribute('opacity', String(frameProgress * (1 - exit)));
          popup.group.setAttribute(
            'transform',
            `translate(${x}, ${y}) scale(${popupScale})`
          );
          popup.text.setAttribute('opacity', String(frameProgress * (1 - exit)));
          if (markerIncomingText) {
            const sourceY = -popup.height / 2 - 20 * (1 - dropProgress);
            const sourceOpacity = dropProgress < 1
              ? Math.min(frameProgress, clamp01(dropProgress * 4)) * (1 - exit)
              : 0;
            markerIncomingText.setAttribute('y', String(sourceY));
            markerIncomingText.setAttribute('opacity', String(sourceOpacity));
          }
        }
        if (fallingText) {
          const targetY = Number(fallingText.dataset.targetY) || y;
          const startY = targetY - Math.max(24, operand.point.height * 0.8);
          fallingText.setAttribute('y', String(startY + (targetY - startY) * dropProgress));
          fallingText.setAttribute('opacity', String(dropProgress < 1 ? clamp01(dropProgress * 4) : 0));
        }
        transfer?.update(dropProgress, 1 - exit);
        if (dropProgress >= 1) landValue();
      },
      remove() {
        landValue();
        if (targetText) {
          if (originalOpacity == null) targetText.removeAttribute('opacity');
          else targetText.setAttribute('opacity', originalOpacity);
        }
        popup?.group.remove();
        fallingText?.remove();
        transfer?.remove();
      }
    };
  }

  function createSelfCompareSplit(operand, splitDistance, verticalGap = 0) {
    const original = operand?.element;
    const parent = original?.parentNode;
    if (!original || !parent) return null;
    const originalOpacity = original.getAttribute('opacity');
    const clones = [-1, 1].map(direction => {
      const wrapper = createSvg('g', {
        class: 'asm-trace-compare-self-clone',
        opacity: 0,
        'pointer-events': 'none'
      });
      const clone = original.cloneNode(true);
      [clone, ...clone.querySelectorAll('[id], [data-trace-object-key]')].forEach(node => {
        node.removeAttribute?.('id');
        node.removeAttribute?.('data-trace-object-key');
      });
      clone.classList.remove('selected', 'draggable-object', 'asm-trace-selectable');
      clone.querySelectorAll('animate, animateTransform, animateMotion').forEach(node => node.remove());
      wrapper.append(clone);
      parent.insertBefore(wrapper, original.nextSibling);
      return { direction, wrapper, clone };
    });
    return {
      clones,
      update(lift, split, stay) {
        const amount = split * stay;
        original.setAttribute('opacity', String(1 - amount));
        clones.forEach(item => {
          item.wrapper.setAttribute('opacity', String(amount));
          item.wrapper.setAttribute(
            'transform',
            `translate(${item.direction * splitDistance * amount}, ${(-15 * lift + item.direction * verticalGap * split) * stay})`
          );
        });
      },
      remove() {
        if (originalOpacity == null) original.removeAttribute('opacity');
        else original.setAttribute('opacity', originalOpacity);
        clones.forEach(item => item.wrapper.remove());
      }
    };
  }

  function promoteCompareElements(operands) {
    const promoted = [];
    const seen = new Set();
    operands.forEach(operand => {
      const element = operand?.element;
      const parent = element?.parentNode;
      if (operand?.marker || !element || !parent || seen.has(element)) return;
      seen.add(element);
      const placeholder = document.createComment('asm-trace-compare-order');
      parent.insertBefore(placeholder, element);
      parent.append(element);
      promoted.push({ element, parent, placeholder });
    });
    return {
      remove() {
        promoted.forEach(({ element, parent, placeholder }) => {
          if (placeholder.parentNode === parent && element.parentNode === parent) {
            parent.insertBefore(element, placeholder);
          }
          placeholder.remove();
        });
        promoted.length = 0;
      }
    };
  }

  function createCompareEffect(
    root, event, traceDocument, eventFrame, placements, elements,
    visualKeyForSource, positionAdjustments
  ) {
    const color = COMPARE_COLORS[String(event?.result === true)];
    const values = [event?.payload?.left, event?.payload?.right];
    const rawOperands = (event?.targets || []).slice(0, 2).map((target, index) => (
      eventOperand(traceDocument, eventFrame, target, values[index], placements, elements, visualKeyForSource)
    )).filter(Boolean);
    const compareBeforeLayout = new Map();
    const operands = rawOperands.map((operand, index) => {
      const adjustment = typeof positionAdjustments === 'function'
        ? positionAdjustments(operand)
        : positionAdjustments?.get?.(operand.visualKey);
      const point = operand.marker && adjustment
        ? {
          ...operand.point,
          x: operand.point.x + (Number(adjustment.x) || 0),
          y: operand.point.y + (Number(adjustment.y) || 0)
        }
        : { ...operand.point };
      compareBeforeLayout.set(`${operand.visualKey}:${index}`, point);
      return { ...operand, point };
    });
    const equalValues = compareValuesEqual(operands);
    const equalityComparison = ['==', '!='].includes(String(event?.operation || ''));
    let contactTargets = equalityComparison ? compareContactTargets(operands, equalValues) : [];
    const scaleTargets = equalityComparison ? operands.map(() => 1) : compareScaleTargets(operands);
    const selfCompare = operands.length >= 2 && operands[0].visualKey === operands[1].visualKey;
    const selfSplitDistance = selfCompare
      ? Math.max(8, operands[0].point.width / 2)
      : 0;
    const highlights = [];
    const popups = new Map();
    const promotedElements = promoteCompareElements(operands);
    const selfSplit = selfCompare && !operands[0].marker
      ? createSelfCompareSplit(operands[0], selfSplitDistance, equalValues ? 0 : 5)
      : null;
    let expression = null;
    let compareElapsed = 0;
    let popupStartsSynchronized = !operands.some(operand => operand.marker);
    let popupStartsLocked = popupStartsSynchronized;
    let attachedTop = Infinity;
    elements?.forEach?.((element, key) => {
      if (!element?.dataset?.traceSourceVariableId) return;
      if (!operands.some(operand => operand.logicalKey === element.dataset.traceBindingTarget)) return;
      const point = comparisonPoint(placements, key);
      if (!point) return;
      const adjustment = typeof positionAdjustments === 'function'
        ? positionAdjustments({ visualKey: key, element, marker: true })
        : positionAdjustments?.get?.(key);
      attachedTop = Math.min(attachedTop, point.y + (Number(adjustment?.y) || 0));
    });
    const expressionTop = (Number.isFinite(attachedTop)
      ? attachedTop
      : Math.min(...operands.map(operand => operand.point.y))) - 30;

    const popupKey = (operand, index) => selfCompare
      ? `${operand.visualKey}:${index}`
      : operand.visualKey;

    function ensurePopups() {
      operands.forEach((operand, index) => {
        if (!operand.marker) return;
        const key = popupKey(operand, index);
        if (!popups.has(key)) popups.set(key, createMarkerPopup(root, operand));
      });
    }

    function showResult() {
      if (!highlights.length) {
        if (selfSplit) {
          selfSplit.clones.forEach(item => {
            const highlight = addHighlight(item.clone, color);
            if (highlight) highlights.push(highlight);
          });
        } else {
          const highlighted = new Set();
          operands.filter(operand => !operand.marker).forEach(operand => {
            if (highlighted.has(operand.visualKey)) return;
            highlighted.add(operand.visualKey);
            const highlight = addHighlight(operand.element, color);
            if (highlight) highlights.push(highlight);
          });
        }
      }
      popups.forEach(popup => popup.rect.setAttribute('stroke', color));
      if (!expression) expression = createComparisonExpression(root, event, operands, color, expressionTop);
    }

    function setResultOpacity(opacity) {
      const value = String(clamp01(opacity));
      highlights.forEach(highlight => highlight.setAttribute('opacity', value));
      expression?.setAttribute('opacity', value);
    }

    return {
      adjustments: new Map(),
      logicalAdjustments: new Map(),
      syncPosition() {
        if (popupStartsLocked) return;
        const waitEnd = COMPARE_TIMING.popup + COMPARE_TIMING.wait;
        let changed = false;
        operands.forEach(operand => {
          if (!operand.marker) return;
          const bounds = elementBoundsInRoot(markerPopupAnchorElement(operand), root);
          if (!bounds) return;
          operand.point = {
            ...operand.point,
            x: bounds.x + bounds.width / 2,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height
          };
          changed = true;
        });
        if (!changed) return;
        popupStartsSynchronized = true;
        contactTargets = equalityComparison ? compareContactTargets(operands, equalValues) : [];

        const popupReveal = easeOutCubic(clamp01(compareElapsed / COMPARE_TIMING.popup));
        const sizeElapsed = Math.max(0, compareElapsed - waitEnd);
        const alignProgress = equalityComparison
          ? easeOutCubic(clamp01(sizeElapsed / (COMPARE_TIMING.size / 2)))
          : 0;
        const contactProgress = equalityComparison
          ? easeOutCubic(clamp01((sizeElapsed - COMPARE_TIMING.size / 2) / (COMPARE_TIMING.size / 2)))
          : 0;
        operands.forEach((operand, index) => {
          const popup = popups.get(popupKey(operand, index));
          if (!popup) return;
          const contact = contactTargets[index] || { x: 0, alignY: 0, splitY: 0 };
          popup.group.setAttribute('opacity', String(popupReveal));
          popup.group.setAttribute(
            'transform',
            `translate(${operand.point.x + contact.x * contactProgress}, ${operand.point.y + contact.alignY * alignProgress + contact.splitY * contactProgress}) scale(${0.82 + 0.18 * popupReveal})`
          );
        });
        if (compareElapsed >= waitEnd) popupStartsLocked = true;
      },
      update(elapsed) {
        compareElapsed = elapsed;
        const popupEnd = COMPARE_TIMING.popup;
        const waitEnd = popupEnd + COMPARE_TIMING.wait;
        const sizeEnd = waitEnd + COMPARE_TIMING.size;
        const resultEnd = sizeEnd + COMPARE_TIMING.result;
        const resetEnd = resultEnd + COMPARE_TIMING.reset;
        const popupReveal = easeOutCubic(clamp01(elapsed / COMPARE_TIMING.popup));
        const lift = popupReveal;
        const size = elapsed < waitEnd
          ? 0
          : easeOutCubic(clamp01((elapsed - waitEnd) / COMPARE_TIMING.size));
        const sizeElapsed = Math.max(0, elapsed - waitEnd);
        const alignProgress = equalityComparison
          ? easeOutCubic(clamp01(sizeElapsed / (COMPARE_TIMING.size / 2)))
          : size;
        const contactProgress = equalityComparison
          ? easeOutCubic(clamp01((sizeElapsed - COMPARE_TIMING.size / 2) / (COMPARE_TIMING.size / 2)))
          : size;
        const reset = elapsed < resultEnd
          ? 0
          : easeOutCubic(clamp01((elapsed - resultEnd) / COMPARE_TIMING.reset));
        ensurePopups();
        if (elapsed >= waitEnd) {
          showResult();
          setResultOpacity(size * (1 - reset));
        }
        const stay = 1 - reset;
        this.adjustments.clear();
        this.logicalAdjustments.clear();
        operands.forEach((operand, index) => {
          const contact = contactTargets[index] || { x: 0, alignY: 0, splitY: 0 };
          const adjustment = {
            x: operand.marker ? 0 : contact.x * contactProgress * stay,
            y: operand.marker ? 0 : (equalityComparison
              ? (contact.alignY * alignProgress + contact.splitY * contactProgress) * stay
              : (-15 * lift) * stay),
            scale: operand.marker
              ? 1
              : 1 + ((scaleTargets[index] || 1) - 1) * size * stay
          };
          this.adjustments.set(operand.visualKey, adjustment);
          this.logicalAdjustments.set(operand.logicalKey, adjustment);
          const popup = popups.get(popupKey(operand, index));
          if (popup) {
            const popupScale = 0.82 + 0.18 * popupReveal;
            const popupOpacity = (popupStartsSynchronized ? popupReveal : 0) * stay;
            const splitX = contact.x * contactProgress * stay;
            const contactY = equalityComparison
              ? (contact.alignY * alignProgress + contact.splitY * contactProgress) * stay
              : 0;
            const compareScale = 1 + ((scaleTargets[index] || 1) - 1) * size * stay;
            popup.group.setAttribute('opacity', String(popupOpacity));
            popup.group.setAttribute(
              'transform',
              `translate(${operand.point.x + splitX}, ${operand.point.y + contactY}) scale(${popupScale * compareScale})`
            );
          }
        });
        selfSplit?.update(lift, equalityComparison ? contactProgress : size, stay);
        elements?.forEach?.((element, key) => {
          const targetKey = element?.dataset?.traceBindingTarget;
          if (!targetKey || !this.logicalAdjustments.has(targetKey)) return;
          const target = this.logicalAdjustments.get(targetKey);
          this.adjustments.set(key, { x: target.x, y: target.y, scale: 1 });
        });
        if (elapsed >= resetEnd) this.remove();
      },
      remove() {
        highlights.forEach(highlight => highlight.remove());
        expression?.remove();
        popups.forEach(popup => popup.group.remove());
        selfSplit?.remove();
        promotedElements.remove();
        highlights.length = 0;
        expression = null;
        popups.clear();
        compareBeforeLayout.clear();
        this.adjustments.clear();
        this.logicalAdjustments.clear();
      }
    };
  }

  function eventAnimation(document, type) {
    return window.ASMTraceEvents?.animation?.(type) || 'none';
  }

  function orderedEvents(frame) {
    const shared = window.ASMTraceEvents?.ordered?.(frame?.events || []);
    if (Array.isArray(shared)) return shared;
    return (frame?.events || []).map((event, index) => {
      const explicitOrder = Number(event?.order);
      const idOrder = String(event?.id || '').match(/^event-(\d+)$/);
      return {
        event,
        index,
        order: Number.isFinite(explicitOrder)
          ? explicitOrder
          : (idOrder ? Number(idOrder[1]) : Number.MAX_SAFE_INTEGER)
      };
    }).sort((left, right) => left.order - right.order || left.index - right.index)
      .map(item => item.event);
  }

  function updateTargetsMarker(event, elements) {
    if (event?.type !== 'write' || event.update !== true) return false;
    const variableIds = new Set((event.targets || [])
      .map(target => target?.variableId)
      .filter(Boolean));
    if (!variableIds.size) return false;
    for (const [, element] of elements || []) {
      if (![...variableIds].some(variableId => markerDependsOnVariable(element, variableId))) continue;
      return true;
    }
    return false;
  }

  function markerSourceVariableIds(element) {
    try {
      const parsed = JSON.parse(element?.dataset?.traceSourceVariableIds || '[]');
      if (Array.isArray(parsed) && parsed.length) return parsed.filter(Boolean);
    } catch (error) {
      // Older traces only carry the primary source variable.
    }
    return element?.dataset?.traceSourceVariableId
      ? [element.dataset.traceSourceVariableId]
      : [];
  }

  function markerDependsOnVariable(element, variableId) {
    return Boolean(variableId) && markerSourceVariableIds(element).includes(variableId);
  }

  function assignmentTargetMarker(event, elements) {
    if (event?.type !== 'assign') return null;
    const target = (event.targets || []).find(item => item.role === 'target') || event.targets?.[0];
    if (!target?.variableId) return null;
    for (const [key, element] of elements || []) {
      if (element?.dataset?.traceSourceVariableId === target.variableId) {
        return { key, element, target };
      }
    }
    return null;
  }

  function eventMutatesVariable(event, variableId) {
    if (!variableId || !['assign', 'write'].includes(event?.type)) return false;
    const targets = event?.targets || [];
    if (event.type === 'assign') {
      const target = targets.find(item => item.role === 'target') || targets[0];
      return target?.variableId === variableId;
    }
    return targets.some(target => target?.variableId === variableId && target.role !== 'source');
  }

  function variableChangedBeforeEvent(eventFrame, currentEvent, variableId) {
    const events = orderedEvents(eventFrame);
    const currentIndex = events.indexOf(currentEvent);
    if (currentIndex <= 0) return false;
    return events.slice(0, currentIndex)
      .some(event => eventMutatesVariable(event, variableId));
  }

  function markerTargetDelta(marker, value, placements) {
    const currentTargetKey = String(marker?.element?.dataset?.traceBindingTarget || '');
    const separator = currentTargetKey.lastIndexOf('#');
    const index = Number(displayEventValue(value));
    if (separator < 0 || !Number.isInteger(index)) return null;
    const currentTarget = placements?.get?.(currentTargetKey);
    const nextTarget = placements?.get?.(`${currentTargetKey.slice(0, separator)}#${index}`);
    if (!currentTarget || !nextTarget) return null;
    return {
      x: (Number(nextTarget.x) || 0) + (Number(nextTarget.width) || 0) / 2
        - (Number(currentTarget.x) || 0) - (Number(currentTarget.width) || 0) / 2,
      y: (Number(nextTarget.y) || 0) - (Number(currentTarget.y) || 0)
    };
  }

  function markerTargetParts(targetKey) {
    const source = String(targetKey || '');
    const separator = source.lastIndexOf('#');
    const index = Number(source.slice(separator + 1));
    return separator >= 0 && Number.isInteger(index)
      ? { prefix: source.slice(0, separator), index }
      : null;
  }

  function markerTargetPoint(targetKey, placements) {
    const direct = placements?.get?.(targetKey);
    if (direct) {
      return {
        x: (Number(direct.x) || 0) + (Number(direct.width) || 0) / 2,
        y: Number(direct.y) || 0
      };
    }
    const requested = markerTargetParts(targetKey);
    if (!requested) return null;
    const siblings = [];
    placements?.forEach?.((placement, key) => {
      const parts = markerTargetParts(key);
      if (!parts || parts.prefix !== requested.prefix) return;
      siblings.push({
        index: parts.index,
        x: (Number(placement.x) || 0) + (Number(placement.width) || 0) / 2,
        y: Number(placement.y) || 0,
        width: Number(placement.width) || 40
      });
    });
    siblings.sort((left, right) => left.index - right.index);
    if (!siblings.length) return null;
    const nearest = [...siblings].sort((left, right) => (
      Math.abs(left.index - requested.index) - Math.abs(right.index - requested.index)
    ))[0];
    const neighbor = siblings.find(item => item.index !== nearest.index);
    const stepX = neighbor
      ? (neighbor.x - nearest.x) / (neighbor.index - nearest.index)
      : nearest.width;
    const stepY = neighbor
      ? (neighbor.y - nearest.y) / (neighbor.index - nearest.index)
      : 0;
    return {
      x: nearest.x + stepX * (requested.index - nearest.index),
      y: nearest.y + stepY * (requested.index - nearest.index)
    };
  }

  function markerTargetGeometry(targetKey, placements) {
    const direct = placements?.get?.(targetKey);
    if (direct) {
      return {
        x: (Number(direct.x) || 0) + (Number(direct.width) || 0) / 2,
        y: Number(direct.y) || 0,
        width: Number(direct.width) || 40,
        height: Number(direct.height) || 40
      };
    }
    const point = markerTargetPoint(targetKey, placements);
    const requested = markerTargetParts(targetKey);
    if (!point || !requested) return null;
    let nearest = null;
    placements?.forEach?.((placement, key) => {
      const parts = markerTargetParts(key);
      if (!parts || parts.prefix !== requested.prefix) return;
      if (!nearest || Math.abs(parts.index - requested.index) < nearest.distance) {
        nearest = {
          distance: Math.abs(parts.index - requested.index),
          width: Number(placement.width) || 40,
          height: Number(placement.height) || 40
        };
      }
    });
    return {
      ...point,
      width: nearest?.width || 40,
      height: nearest?.height || 40
    };
  }

  function markerArrowPath(entry, state) {
    if (!entry?.markerPointPath || !state) return '';
    const labelTop = Number(entry.markerLabelBox?.getAttribute?.('y')) || -40;
    const labelHeight = Number(entry.markerLabelBox?.getAttribute?.('height')) || 18;
    const arrowTop = labelTop + labelHeight;
    const directionX = (Number(state.targetX) || 0) - (Number(state.x) || 0);
    const directionY = (Number(state.targetY) || 0) - (Number(state.y) || 0) - arrowTop;
    const directionLength = Math.max(0.001, Math.hypot(directionX, directionY));
    const unitX = directionX / directionLength;
    const unitY = directionY / directionLength;
    const perpendicularX = -unitY;
    const perpendicularY = unitX;
    const arrowLength = 20;
    const pointerX = unitX * arrowLength;
    const pointerY = arrowTop + unitY * arrowLength;
    const headLength = 6;
    const headHalfWidth = 3;
    const headBaseX = pointerX - unitX * headLength;
    const headBaseY = pointerY - unitY * headLength;
    const headLeftX = headBaseX + perpendicularX * headHalfWidth;
    const headLeftY = headBaseY + perpendicularY * headHalfWidth;
    const headRightX = headBaseX - perpendicularX * headHalfWidth;
    const headRightY = headBaseY - perpendicularY * headHalfWidth;
    return `M 0 ${arrowTop} L ${pointerX} ${pointerY} M ${headLeftX} ${headLeftY} L ${pointerX} ${pointerY} L ${headRightX} ${headRightY}`;
  }

  function markerForMotionSlot(slot, elements) {
    return markersForMotionSlot(slot, elements)[0] || null;
  }

  function markersForMotionSlot(slot, elements) {
    if (!['assign', 'position'].includes(slot.animation)) return [];
    const targets = slot.event?.targets || [];
    const variableIds = new Set(targets
      .filter(target => target?.role !== 'source')
      .map(target => target?.variableId)
      .filter(Boolean));
    const markers = [];
    for (const [key, element] of elements || []) {
      const target = targets.find(item => (
        item?.role !== 'source' && markerDependsOnVariable(element, item?.variableId)
      ));
      if (!target || !variableIds.has(target.variableId)) continue;
      markers.push({ key, element, target });
    }
    return markers;
  }

  function markersForLogicalEvent(event, elements) {
    if (!['assign', 'write'].includes(event?.type)) return [];
    const targets = event?.targets || [];
    const markers = [];
    for (const [key, element] of elements || []) {
      const target = targets.find(item => (
        item?.role !== 'source'
        && eventMutatesVariable(event, item?.variableId)
        && markerDependsOnVariable(element, item?.variableId)
      ));
      if (target) markers.push({ key, element, target });
    }
    return markers;
  }

  function markerAssignmentMotion(
    traceDocument, eventFrame, eventTimeline, placements, elements, markerEntries = []
  ) {
    const metadata = new Map();
    markerEntries.forEach(entry => {
      if (!entry.markerPointPath) return;
      const currentTarget = String(entry.element?.dataset?.traceBindingTarget || '');
      const targetParts = markerTargetParts(currentTarget);
      const finalBase = elementTranslation(entry.element);
      if (!targetParts || !finalBase) return;
      const previousBase = elementTranslation(entry.previousVisual);
      const labelWidth = Number(entry.markerLabelBox?.getAttribute?.('width')) || 18;
      metadata.set(entry.key, {
        key: entry.key,
        variableId: String(entry.element.dataset.traceSourceVariableId || ''),
        variableIds: markerSourceVariableIds(entry.element),
        indexExpression: String(entry.element.dataset.traceMarkerIndexExpression || ''),
        sortKey: String(entry.element.dataset.traceMarkerSortKey || entry.key),
        currentTarget,
        previousTarget: String(
          entry.previousVisual?.dataset?.traceBindingTarget
          || entry.markerPreviousTarget
          || ''
        ),
        previousBase,
        previousUnresolvedTarget: entry.previousVisual?.dataset?.traceMarkerUnresolved === '1'
          ? {
            targetX: Number(entry.previousVisual.dataset.traceMarkerTargetX),
            targetY: Number(entry.previousVisual.dataset.traceMarkerTargetY)
          }
          : null,
        finalBase,
        labelWidth,
        baseCellWidth: Math.max(
          1,
          Number(entry.element.dataset.traceMarkerBaseCellWidth) || 40
        ),
        bias: { x: 0, y: 0 }
      });
    });
    if (!metadata.size) {
      const adjustments = new Map();
      const arrowStates = new Map();
      return { adjustments, arrowStates, update() {}, finish() { adjustments.clear(); arrowStates.clear(); } };
    }

    const timelineSlotByEvent = new Map(eventTimeline.map(slot => [slot.event, slot]));
    const logicalEvents = orderedEvents(eventFrame);
    eventTimeline.forEach(slot => {
      if (slot.event && !logicalEvents.includes(slot.event)) logicalEvents.push(slot.event);
    });
    let logicalCursor = 0;
    const logicalMotionSlots = logicalEvents.map(event => {
      const visibleSlot = timelineSlotByEvent.get(event);
      const slot = visibleSlot || {
        event,
        animation: 'assign',
        start: logicalCursor,
        motionStart: logicalCursor,
        end: logicalCursor,
        logicalOnly: true
      };
      const markers = visibleSlot
        ? markersForMotionSlot(slot, elements)
        : markersForLogicalEvent(event, elements);
      if (visibleSlot) logicalCursor = Math.max(logicalCursor, Number(visibleSlot.end) || 0);
      return {
        slot,
        markers: markers.filter(marker => metadata.has(marker.key))
      };
    }).filter(item => item.markers.length);

    const finalState = new Map([...metadata].map(([key, item]) => [key, item.currentTarget]));
    const initialState = new Map(finalState);
    metadata.forEach((item, key) => {
      if (item.previousUnresolvedTarget && item.previousBase) initialState.set(key, `unresolved:${key}`);
      else if (markerTargetParts(item.previousTarget)) initialState.set(key, item.previousTarget);
    });
    const markerTargetForEvent = (item, slot, phase) => {
      const parts = markerTargetParts(item.currentTarget);
      if (!parts) return '';
      const target = (slot.event?.targets || []).find(candidate => (
        candidate?.role !== 'source' && item.variableIds.includes(candidate?.variableId)
      ));
      const variableName = traceDocument?.variables?.[target?.variableId]?.name;
      const value = displayEventValue(slot.event?.payload?.[phase]);
      // A missing before/after snapshot is not permission to fall back to the
      // frame's final value. That made a newly-entering marker start from the
      // last assignment in the frame and visually skip earlier movements.
      if (value === '') return '';
      const locals = variableName ? { [variableName]: value } : {};
      const rawResolved = window.ASMTraceRules?.resolveExpression?.(
        traceDocument, eventFrame, item.indexExpression || item.sortKey, locals
      );
      const resolved = rawResolved == null ? NaN : Number(rawResolved);
      return Number.isInteger(resolved) ? `${parts.prefix}#${resolved}` : '';
    };
    const initializedMarkers = new Set();
    logicalMotionSlots.forEach(({ slot, markers }) => {
      markers.forEach(marker => {
        const item = metadata.get(marker.key);
        if (item?.previousTarget || item?.previousUnresolvedTarget) return;
        if (initializedMarkers.has(marker.key)) return;
        const beforeTarget = markerTargetForEvent(item, slot, 'before');
        const afterTarget = markerTargetForEvent(item, slot, 'after');
        const initialTarget = beforeTarget || afterTarget;
        if (!initialTarget) return;
        initialState.set(marker.key, initialTarget);
        initializedMarkers.add(marker.key);
      });
    });

    const positionsForState = state => {
      const groups = new Map();
      const positions = new Map();
      state.forEach((targetKey, key) => {
        const item = metadata.get(key);
        if (targetKey === `unresolved:${key}` && item?.previousBase && item.previousUnresolvedTarget) {
          positions.set(key, { ...item.previousBase, ...item.previousUnresolvedTarget });
          return;
        }
        if (!metadata.has(key) || !markerTargetParts(targetKey)) return;
        if (!groups.has(targetKey)) groups.set(targetKey, []);
        groups.get(targetKey).push(metadata.get(key));
      });
      groups.forEach((group, targetKey) => {
        const target = markerTargetGeometry(targetKey, placements);
        if (!target) return;
        group.sort((left, right) => (
          left.sortKey.localeCompare(right.sortKey, 'en', { numeric: true, sensitivity: 'base' })
          || left.key.localeCompare(right.key)
        ));
        const gap = 8;
        const totalWidth = group.reduce((sum, item) => sum + item.labelWidth, 0)
          + Math.max(0, group.length - 1) * gap;
        const keepArrowsVertical = group.length > 1
          && target.width >= group[0].baseCellWidth * 2 - 0.5;
        let cursor = -totalWidth / 2;
        group.forEach(item => {
          const offsetX = cursor + item.labelWidth / 2;
          positions.set(item.key, {
            x: target.x + offsetX + item.bias.x,
            y: target.y + item.bias.y,
            targetX: keepArrowsVertical ? target.x + offsetX : target.x,
            targetY: target.y + target.height / 2
          });
          cursor += item.labelWidth + gap;
        });
      });
      return positions;
    };

    const unbiasedFinal = positionsForState(finalState);
    metadata.forEach(item => {
      const expected = unbiasedFinal.get(item.key);
      if (!expected) return;
      item.bias = {
        x: item.finalBase.x - expected.x,
        y: item.finalBase.y - expected.y
      };
    });

    const state = new Map(initialState);
    const initialPositions = positionsForState(state);
    metadata.forEach((item, key) => {
      if (!item.previousBase || !initialPositions.has(key)) return;
      initialPositions.set(key, {
        ...initialPositions.get(key),
        // Keep a parked marker's arrow with its previous visual until its
        // assignment motion begins; it has no real cell binding to resolve.
        ...(item.previousUnresolvedTarget
          && Object.values(item.previousUnresolvedTarget).every(Number.isFinite)
          ? item.previousUnresolvedTarget : {}),
        x: item.previousBase.x,
        y: item.previousBase.y
      });
    });
    let currentPositions = new Map(initialPositions);
    const tracks = new Map();
    const addStep = (key, start, end, from, to, fromTarget, toTarget, instant = false) => {
      if (!from || !to) return;
      const positionStable = Math.abs(from.x - to.x) < 0.1 && Math.abs(from.y - to.y) < 0.1;
      const arrowStable = Math.abs(from.targetX - to.targetX) < 0.1
        && Math.abs(from.targetY - to.targetY) < 0.1;
      if (positionStable && arrowStable) return;
      if (!tracks.has(key)) tracks.set(key, []);
      tracks.get(key).push({
        start, end, from: { ...from }, to: { ...to }, fromTarget, toTarget, instant
      });
    };

    logicalMotionSlots.forEach(({ slot, markers }, slotIndex) => {
      let beforeStateChanged = false;
      markers.forEach(marker => {
        const item = metadata.get(marker.key);
        const beforeTarget = markerTargetForEvent(item, slot, 'before');
        if (beforeTarget && state.get(marker.key) !== beforeTarget) {
          state.set(marker.key, beforeTarget);
          beforeStateChanged = true;
        }
      });
      if (slotIndex > 0 && beforeStateChanged) currentPositions = positionsForState(state);
      const nextState = new Map(state);
      markers.forEach(marker => {
        const item = metadata.get(marker.key);
        const afterTarget = markerTargetForEvent(item, slot, 'after');
        if (afterTarget) nextState.set(marker.key, afterTarget);
      });
      const nextPositions = positionsForState(nextState);
      const start = Number(slot.motionStart ?? slot.start) || 0;
      const instant = slot.logicalOnly === true;
      const end = instant ? start : Math.max(start + 1, Number(slot.end) || start + 1);
      metadata.forEach((unused, key) => {
        addStep(
          key, start, end, currentPositions.get(key), nextPositions.get(key),
          state.get(key), nextState.get(key), instant
        );
      });
      state.clear();
      nextState.forEach((value, key) => state.set(key, value));
      currentPositions = nextPositions;
    });

    const adjustments = new Map();
    const arrowStates = new Map();
    return {
      adjustments,
      arrowStates,
      update(elapsed) {
        adjustments.clear();
        arrowStates.clear();
        metadata.forEach((item, key) => {
          const track = tracks.get(key) || [];
          let point = initialPositions.get(key) || item?.finalBase;
          for (const step of track) {
            if (elapsed < step.start) break;
            if (step.instant) {
              point = step.to;
              continue;
            }
            if (elapsed < step.end) {
              const progress = easeOutCubic(clamp01((elapsed - step.start) / (step.end - step.start)));
              point = {
                x: step.from.x + (step.to.x - step.from.x) * progress,
                y: step.from.y + (step.to.y - step.from.y) * progress,
                targetX: step.from.targetX + (step.to.targetX - step.from.targetX) * progress,
                targetY: step.from.targetY + (step.to.targetY - step.from.targetY) * progress
              };
              break;
            }
            point = step.to;
          }
          if (!item) return;
          if (point) {
            adjustments.set(key, {
              x: point.x - item.finalBase.x,
              y: point.y - item.finalBase.y,
              scale: 1,
              absolute: true
            });
            arrowStates.set(key, point);
          }
        });
      },
      finish() { adjustments.clear(); arrowStates.clear(); }
    };
  }

  function eventTargetVisualKeys(traceDocument, eventFrame, event, placements, elements) {
    const keys = new Set();
    (event?.targets || []).forEach(target => {
      const variableId = target?.variableId;
      if (variableId) {
        elements?.forEach?.((element, key) => {
          if (markerDependsOnVariable(element, variableId)) keys.add(key);
        });
      }
      const operand = eventOperand(
        traceDocument, eventFrame, target, event?.payload?.after,
        placements, elements, key => key
      );
      if (operand?.visualKey) keys.add(operand.visualKey);
    });
    return keys;
  }

  function eventHasVisibleAnimationTargets(
    traceDocument, eventFrame, event, animation, placements, elements
  ) {
    const targets = Array.isArray(event?.targets) ? event.targets : [];
    if (animation === 'position') return Boolean(markerForMotionSlot({ animation, event }, elements));
    const visible = target => Boolean(eventOperand(
      traceDocument,
      eventFrame,
      target,
      event?.payload?.after,
      placements,
      elements,
      key => key
    ));
    if (animation === 'assign') {
      const target = targets.find(item => item.role === 'target') || targets[0];
      const variableTargets = targets.filter(item => item?.variableId);
      const targetOperand = target ? eventOperand(
        traceDocument,
        eventFrame,
        target,
        event?.payload?.after,
        placements,
        elements,
        key => key
      ) : null;
      if (!targetOperand) return false;
      // An index marker assignment (for example largest = l) is fully
      // determined by the captured before/after/source values. The source
      // scalar does not need its own box or pointer on the canvas.
      if (targetOperand.marker && Number.isFinite(Number(displayEventValue(event?.payload?.after)))) {
        return true;
      }
      return variableTargets.every(visible);
    }
    if (animation === 'compare' || animation === 'swap') {
      return targets.length >= 2 && targets.slice(0, 2).every(visible);
    }
    const variableTargets = targets.filter(target => target?.variableId);
    return variableTargets.length > 0 && variableTargets.every(visible);
  }

  function eventAvailabilityAnimation(event, elements) {
    // "fixed" is rendered as a persistent cell mark rather than a timed
    // animation. Treat it as its own renderable event so availability does
    // not make the switch look off after the renderer has already drawn it.
    if (event?.type === 'fixed') return 'fixed';
    const positionOnly = updateTargetsMarker(event, elements);
    const standaloneUpdate = event?.type === 'write' && event?.update === true && !positionOnly;
    return positionOnly
      ? 'position'
      : (standaloneUpdate ? 'assign' : eventAnimation(null, event.type));
  }

  function eventAnimationIsRenderable(animation) {
    return ['position', 'assign', 'compare', 'swap', 'fixed'].includes(animation)
      || Boolean(GENERIC_EVENT_DURATION[animation]);
  }

  function eventHasRenderableTargetDefinition(event, animation) {
    const targets = Array.isArray(event?.targets) ? event.targets : [];
    if (animation === 'assign') {
      const target = targets.find(item => item?.role === 'target') || targets[0];
      return Boolean(target?.variableId);
    }
    if (animation === 'compare' || animation === 'swap') {
      return targets.length >= 2 && targets.slice(0, 2).every(target => target?.variableId);
    }
    return targets.some(target => target?.variableId);
  }

  function updateEventAvailability(traceDocument, eventFrame, placements, elements) {
    let changed = false;
    orderedEvents(eventFrame).forEach(event => {
      if (event.type === 'fixed') {
        if (event.autoAnimationDisabled === false
          && !event.autoAnimationUnavailableReason) return;
        event.autoAnimationDisabled = false;
        delete event.autoAnimationUnavailableReason;
        changed = true;
        return;
      }
      const animation = eventAvailabilityAnimation(event, elements);
      const unavailableReason = !eventAnimationIsRenderable(animation)
        || !eventHasRenderableTargetDefinition(event, animation)
        ? 'unrenderable'
        : !eventHasVisibleAnimationTargets(
          traceDocument, eventFrame, event, animation, placements, elements
        ) ? 'missing-target' : '';
      const autoDisabled = Boolean(unavailableReason);
      if (event.autoAnimationDisabled === autoDisabled
        && String(event.autoAnimationUnavailableReason || '') === unavailableReason) return;
      event.autoAnimationDisabled = autoDisabled;
      if (unavailableReason) event.autoAnimationUnavailableReason = unavailableReason;
      else delete event.autoAnimationUnavailableReason;
      changed = true;
    });
    if (changed) {
      queueMicrotask(() => window.dispatchEvent(new CustomEvent(
        'asm:trace-event-availability-changed',
        { detail: { document: traceDocument, frameId: eventFrame?.id || '' } }
      )));
    }
    return changed;
  }

  function buildEventTimeline(
    traceDocument, eventFrame, direction, swapDuration,
    previousPlacements, currentPlacements, elements, initialDelay = 0
  ) {
    if (Number(direction) < 0) return [];
    const compareDuration = Object.values(COMPARE_TIMING).reduce((sum, value) => sum + value, 0);
    const slots = [];
    const seenMarkerAssignments = new Set();
    let cursor = Math.max(0, Number(initialDelay) || 0);
    updateEventAvailability(traceDocument, eventFrame, currentPlacements, elements);
    const enabledEvents = orderedEvents(eventFrame).filter(event => (
      event.enabled !== false && event.autoAnimationDisabled !== true
    ));
    enabledEvents.forEach(event => {
      const positionOnly = updateTargetsMarker(event, elements);
      const standaloneUpdate = event?.type === 'write' && event?.update === true && !positionOnly;
      const animation = positionOnly
        ? 'position'
        : (standaloneUpdate ? 'assign' : eventAnimation(traceDocument, event.type));
      let duration = 0;
      let effectDuration = 0;
      let markerAssignment = null;
      if (positionOnly) duration = swapDuration;
      if (animation === 'assign') {
        const target = (event?.targets || []).find(item => item.role === 'target') || event?.targets?.[0];
        const operand = target ? eventOperand(
          traceDocument, eventFrame, target, event?.payload?.after,
          currentPlacements, elements, key => key
        ) : null;
        const before = operand ? previousPlacements?.get?.(operand.visualKey) : null;
        const after = operand ? currentPlacements?.get?.(operand.visualKey) : null;
        const targetMoves = Boolean(before && after && (
          Math.abs((Number(before.x) || 0) - (Number(after.x) || 0)) > 0.1
          || Math.abs((Number(before.y) || 0) - (Number(after.y) || 0)) > 0.1
        ));
        markerAssignment = assignmentTargetMarker(event, elements);
        const markerDelta = markerAssignment
          ? markerTargetDelta(markerAssignment, event?.payload?.after, currentPlacements)
          : null;
        const markerMovesWithinFrame = Boolean(markerAssignment && (
          seenMarkerAssignments.has(markerAssignment.key)
          || Math.abs(Number(markerDelta?.x) || 0) > 0.1
          || Math.abs(Number(markerDelta?.y) || 0) > 0.1
        ));
        if (markerAssignment) seenMarkerAssignments.add(markerAssignment.key);
        effectDuration = assignmentEffectDuration(Boolean(markerAssignment));
        duration = effectDuration
          + (!standaloneUpdate && (targetMoves || markerMovesWithinFrame) ? swapDuration : 0);
      }
      if (event.type === 'compare' && animation === 'compare') duration = compareDuration;
      if (event.type === 'swap' && animation === 'swap') duration = swapDuration;
      if (!duration && GENERIC_EVENT_DURATION[animation]) duration = GENERIC_EVENT_DURATION[animation];
      if (!duration) return;
      if (slots.length) cursor += eventGap(traceDocument);
      const targetsEntering = [...eventTargetVisualKeys(
        traceDocument, eventFrame, event, currentPlacements, elements
      )].some(key => currentPlacements?.has?.(key) && !previousPlacements?.has?.(key));
      if (targetsEntering) cursor = Math.max(cursor, APPEAR_TIMING.duration + 1);
      const effectStart = cursor;
      const motionStart = cursor + (animation === 'assign' ? effectDuration : 0);
      slots.push({
        event, type: event.type, animation, start: cursor, effectStart, motionStart,
        effectDuration, markerAssignment: Boolean(markerAssignment), duration, end: cursor + duration
      });
      cursor += duration;
    });
    return slots;
  }

  function eventMotionDelays(traceDocument, eventFrame, eventTimeline, placements, elements) {
    const delays = new Map();
    eventTimeline.forEach(slot => {
      if (slot.animation === 'position') {
        const variableIds = new Set((slot.event?.targets || [])
          .map(target => target?.variableId)
          .filter(Boolean));
        elements?.forEach?.((element, key) => {
          if (![...variableIds].some(variableId => markerDependsOnVariable(element, variableId))) return;
          delays.set(key, Math.max(delays.get(key) || 0, slot.start));
        });
        return;
      }
      let targets = [];
      let delay = 0;
      if (slot.animation === 'assign') {
        if (slot.duration <= (Number(slot.effectDuration) || 0)) return;
        targets = [(slot.event?.targets || []).find(item => item.role === 'target')
          || slot.event?.targets?.[0]].filter(Boolean);
        delay = slot.motionStart ?? slot.start;
      } else if (GENERIC_EVENT_DURATION[slot.animation]) {
        targets = slot.event?.targets || [];
        delay = slot.end;
      }
      targets.forEach(target => {
        if (target?.variableId) {
          elements?.forEach?.((element, key) => {
            if (!markerDependsOnVariable(element, target.variableId)) return;
            delays.set(key, Math.max(delays.get(key) || 0, delay));
          });
        }
        const operand = eventOperand(
          traceDocument, eventFrame, target, slot.event?.payload?.after,
          placements, elements, key => key
        );
        if (!operand) return;
        delays.set(operand.visualKey, Math.max(delays.get(operand.visualKey) || 0, delay));
      });
    });
    return delays;
  }

  function createGenericEventEffect(slot, traceDocument, eventFrame, placements, elements) {
    const keys = new Set();
    (slot.event?.targets || []).forEach(target => {
      const operand = eventOperand(
        traceDocument, eventFrame, target, null, placements, elements, key => key
      );
      if (operand?.visualKey) keys.add(operand.visualKey);
    });
    const adjustments = new Map();
    const opacities = new Map();
    return {
      adjustments,
      opacities,
      update(elapsed) {
        const progress = clamp01(elapsed / Math.max(1, slot.duration));
        const eased = easeOutCubic(progress);
        keys.forEach(key => {
          if (slot.animation === 'lift') {
            adjustments.set(key, { x: 0, y: 12 * (1 - eased), scale: 1 });
            opacities.set(key, 0.45 + 0.55 * eased);
          } else if (slot.animation === 'pulse') {
            adjustments.set(key, { x: 0, y: 0, scale: 1 + 0.08 * Math.sin(Math.PI * progress) });
            opacities.set(key, 1 - 0.38 * Math.sin(Math.PI * progress));
          } else if (slot.animation === 'fade') {
            opacities.set(key, 0.18 + 0.82 * eased);
          }
        });
      },
      remove() {
        adjustments.clear();
        opacities.clear();
      }
    };
  }

  function eventSequence(options, eventFrame, eventTimeline) {
    if (!eventTimeline.length) return null;
    const assignmentValues = prepareAssignmentValues(options, eventFrame, eventTimeline);
    const markerMotion = markerAssignmentMotion(
      options.document, eventFrame, eventTimeline,
      options.currentPlacements, options.currentElements, options.markerEntries
    );
    const combinedAdjustments = new Map();
    let activeSlot = null;
    let activeEffect = null;
    let finished = false;
    function announce(slot, phase) {
      if (!slot?.event || typeof window.dispatchEvent !== 'function') return;
      window.dispatchEvent(new CustomEvent('asm:trace-active-event', {
        detail: {
          document: options.document,
          frame: eventFrame,
          event: slot.event,
          slot,
          phase
        }
      }));
    }
    function effectFor(slot) {
      if (!slot) return null;
      if (slot.type === 'compare') {
        const markerPositionAtCompare = operand => {
          const liveAdjustment = markerMotion.adjustments.get(operand.visualKey);
          if (liveAdjustment) return liveAdjustment;
          const variableId = String(operand.element?.dataset?.traceSourceVariableId || '');
          const movedEarlier = variableChangedBeforeEvent(eventFrame, slot.event, variableId);
          return movedEarlier ? null : options.rawDeltas?.get?.(operand.visualKey);
        };
        return createCompareEffect(
          options.root, slot.event, options.document, eventFrame,
          options.currentPlacements, options.currentElements, options.visualKeyForSource,
          markerPositionAtCompare
        );
      }
      if (slot.animation === 'assign') {
        return createAssignEffect(
          options.root, slot.event, options.document, eventFrame,
          options.currentPlacements, options.currentElements, options.rawDeltas,
          options.appearingKeys, options.previousObjects
        );
      }
      if (GENERIC_EVENT_DURATION[slot.animation]) {
        return createGenericEventEffect(
          slot, options.document, eventFrame,
          options.currentPlacements, options.currentElements
        );
      }
      return null;
    }
    return {
      get adjustments() { return combinedAdjustments; },
      get markerArrowStates() { return markerMotion.arrowStates; },
      get opacities() { return activeEffect?.opacities || new Map(); },
      syncPositions() { activeEffect?.syncPosition?.(); },
      update(elapsed) {
        markerMotion.update(elapsed);
        const slot = eventTimeline.find((item, index) => (
          elapsed >= item.start
          && (elapsed < item.end || (index === eventTimeline.length - 1 && elapsed <= item.end))
        )) || null;
        if (slot !== activeSlot) {
          announce(activeSlot, 'end');
          activeEffect?.remove?.();
          activeSlot = slot;
          activeEffect = effectFor(slot);
          if (slot) {
            options.root.dataset.traceActiveEventId = String(slot.event?.id || '');
            options.root.dataset.traceActiveEventType = String(slot.type || '');
            announce(slot, 'start');
          } else {
            delete options.root.dataset.traceActiveEventId;
            delete options.root.dataset.traceActiveEventType;
          }
        }
        if (slot && activeEffect) activeEffect.update(Math.max(0, elapsed - (slot.effectStart ?? slot.start)));
        combinedAdjustments.clear();
        markerMotion.adjustments.forEach((value, key) => combinedAdjustments.set(key, value));
        activeEffect?.adjustments?.forEach?.((value, key) => {
          const existing = combinedAdjustments.get(key);
          combinedAdjustments.set(key, existing
            ? {
              x: (Number(existing.x) || 0) + (Number(value.x) || 0),
              y: (Number(existing.y) || 0) + (Number(value.y) || 0),
              scale: Number(value.scale) || Number(existing.scale) || 1,
              absolute: existing.absolute === true
            }
            : value);
        });
      },
      finish() {
        if (finished) return;
        finished = true;
        announce(activeSlot, 'end');
        activeEffect?.remove?.();
        activeEffect = null;
        activeSlot = null;
        markerMotion.finish();
        combinedAdjustments.clear();
        assignmentValues.finish();
        delete options.root.dataset.traceActiveEventId;
        delete options.root.dataset.traceActiveEventType;
      }
    };
  }

  function removeAnimationNodes(element) {
    element?.querySelectorAll?.('animate, animateTransform, animateMotion').forEach(node => node.remove());
  }

  function wrapAttachedVisual(element) {
    const parent = element?.parentNode;
    if (!parent) return null;
    const wrapper = createSvg('g', {
      class: 'asm-trace-attached-motion',
      'pointer-events': 'none'
    });
    parent.insertBefore(wrapper, element);
    wrapper.append(element);
    return { wrapper, element, baseOpacity: wrapper.getAttribute('opacity') };
  }

  function unwrapAttachedVisual(attachment) {
    const { wrapper, element } = attachment || {};
    if (!wrapper?.parentNode || !element) return;
    wrapper.parentNode.insertBefore(element, wrapper);
    wrapper.remove();
  }

  function elementTranslation(element) {
    const transform = String(element?.getAttribute?.('transform') || '');
    const translate = transform.match(
      /translate\(\s*(-?[\d.]+)(?:[\s,]+(-?[\d.]+))?\s*\)/i
    );
    if (translate) {
      return {
        x: Number(translate[1]) || 0,
        y: Number(translate[2]) || 0
      };
    }
    const matrix = transform.match(
      /matrix\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+(-?[\d.]+)\s*\)/i
    );
    return matrix
      ? { x: Number(matrix[5]) || 0, y: Number(matrix[6]) || 0 }
      : null;
  }

  function segmentGeometry(element) {
    if (!element?.classList?.contains('asm-trace-segment')) return null;
    const geometry = {
      left: Number(element.dataset.traceSegmentLeft),
      right: Number(element.dataset.traceSegmentRight),
      top: Number(element.dataset.traceSegmentTop),
      bottom: Number(element.dataset.traceSegmentBottom),
      arrowY: Number(element.dataset.traceSegmentArrowY)
    };
    return Object.values(geometry).every(Number.isFinite) ? geometry : null;
  }

  function applySegmentGeometry(element, geometry) {
    if (!element || !geometry) return;
    const { left, right, top, bottom, arrowY } = geometry;
    const width = Math.max(0, right - left);
    const head = Math.min(6, Math.max(2, width / 3));
    const role = name => element.querySelector(`[data-trace-segment-role="${name}"]`);
    const leftBoundary = role('left-boundary');
    const rightBoundary = role('right-boundary');
    const widthLine = role('width-line');
    const leftHead = role('left-head');
    const rightHead = role('right-head');
    const label = role('width-label');
    const strokeWidth = Number(widthLine?.getAttribute('stroke-width')) || 2;
    const arrowLeft = Math.min(right, left + strokeWidth / 2);
    const arrowRight = Math.max(arrowLeft, right - strokeWidth / 2);
    if (leftBoundary) {
      leftBoundary.setAttribute('x1', left);
      leftBoundary.setAttribute('x2', left);
      leftBoundary.setAttribute('y1', top);
      leftBoundary.setAttribute('y2', bottom);
    }
    if (rightBoundary) {
      rightBoundary.setAttribute('x1', right);
      rightBoundary.setAttribute('x2', right);
      rightBoundary.setAttribute('y1', top);
      rightBoundary.setAttribute('y2', bottom);
    }
    if (widthLine) {
      widthLine.setAttribute('x1', arrowLeft);
      widthLine.setAttribute('x2', arrowRight);
      widthLine.setAttribute('y1', arrowY);
      widthLine.setAttribute('y2', arrowY);
    }
    leftHead?.setAttribute('d', `M ${arrowLeft + head} ${arrowY - 4} L ${arrowLeft} ${arrowY} L ${arrowLeft + head} ${arrowY + 4}`);
    rightHead?.setAttribute('d', `M ${arrowRight - head} ${arrowY - 4} L ${arrowRight} ${arrowY} L ${arrowRight - head} ${arrowY + 4}`);
    if (label) {
      label.setAttribute('x', left + width / 2);
      label.setAttribute('y', arrowY - 7);
    }
  }

  function interpolateSegmentGeometry(before, after, progress) {
    const result = {};
    Object.keys(after).forEach(key => {
      result[key] = before[key] + (after[key] - before[key]) * progress;
    });
    return result;
  }

  function play(options = {}) {
    const {
      root, document: traceDocument, frame, previousPlacements, currentPlacements,
      previousObjects, currentElements, transitionForKey
    } = options;
    if (!root || !currentPlacements || !currentElements) return Promise.resolve();

    const duration = Math.max(0, Number(options.duration) || 520);
    if (!duration) return Promise.resolve();
    const runId = ++activeRun;
    let resolveRun = null;
    const completion = new Promise(resolve => { resolveRun = resolve; });
    const finishRun = () => {
      if (!resolveRun) return;
      const resolve = resolveRun;
      resolveRun = null;
      if (finishActiveRun === finishRun) finishActiveRun = null;
      resolve();
    };
    finishActiveRun = finishRun;
    const eventFrame = options.eventFrame || frame;
    const currentAutomaticMarkers = automaticMarkerKeys(frame);
    const frameIndex = traceDocument?.frames?.findIndex(item => item.id === frame.id) ?? -1;
    const timelinePreviousFrame = Number(options.direction) >= 0 && frameIndex > 0
      ? traceDocument.frames[frameIndex - 1]
      : options.previousFrame;
    const previousAutomaticMarkers = automaticMarkerKeys(timelinePreviousFrame);
    const now = performance.now();
    markerEntrancesByFrame.forEach((entry, frameId) => {
      if (entry.expiresAt <= now) markerEntrancesByFrame.delete(frameId);
    });
    const entranceSourceFrameId = String(options.previousFrame?.id || '');
    const rememberedEntrance = markerEntrancesByFrame.get(frame.id);
    const enteringMarkerKeys = new Set(
      rememberedEntrance?.sourceFrameId === entranceSourceFrameId
        ? rememberedEntrance.keys
        : []
    );
    const markerContinuations = new Map();
    let detectedMarkerEntrance = false;
    currentElements.forEach((element, key) => {
      if (!element?.dataset?.traceSourceVariableId) return;
      const continuation = markerContinuationFor(
        element, key, previousPlacements, previousObjects
      );
      if (continuation) markerContinuations.set(key, continuation);
      if (markerNeedsEntrance({
        element,
        key,
        previousPlacements,
        previousObjects,
        currentAutomaticMarkers,
        previousAutomaticMarkers
      })) {
        enteringMarkerKeys.add(key);
        detectedMarkerEntrance = true;
      }
    });
    if (detectedMarkerEntrance) {
      markerEntrancesByFrame.set(frame.id, {
        keys: new Set(enteringMarkerKeys),
        sourceFrameId: entranceSourceFrameId,
        expiresAt: now + 2000
      });
    }
    const provisionalEventTimeline = buildEventTimeline(
      traceDocument, eventFrame, options.direction, duration,
      previousPlacements, currentPlacements, currentElements, 0
    );
    const eventControlledKeys = new Set(eventMotionDelays(
      traceDocument, eventFrame, provisionalEventTimeline, currentPlacements, currentElements
    ).keys());
    // Event switches control presentation only. Even a disabled assignment
    // still changes the runtime marker state, so it must not be mistaken for a
    // recursive/frame-level transition to the frame-final position.
    orderedEvents(eventFrame).forEach(event => {
      markersForLogicalEvent(event, currentElements).forEach(marker => {
        eventControlledKeys.add(marker.key);
      });
    });
    const transitionSteps = recursiveMarkerTransitionSteps({
      previousPlacements,
      currentPlacements,
      previousObjects,
      currentElements,
      transitionForKey,
      duration,
      eventControlledKeys
    });
    const preEventPlan = createPlaybackPlan({
      frame,
      direction: options.direction,
      runId,
      transitionSteps,
      enteringMarkerKeys
    });
    const eventTimeline = buildEventTimeline(
      traceDocument, eventFrame, options.direction, duration,
      previousPlacements, currentPlacements, currentElements, preEventPlan.preEventDurationMs
    );
    const playbackPlan = createPlaybackPlan({
      frame,
      direction: options.direction,
      runId,
      transitionSteps,
      enteringMarkerKeys,
      eventTimeline
    });
    root.dataset.tracePlaybackPlanId = playbackPlan.id;
    root.dataset.tracePlaybackPhase = playbackPhaseAt(playbackPlan, 0);
    const previousIdentityKeys = previousKeysByRuntimeIdentity(previousObjects);
    const heapResizeDescriptors = prepareHeapResizeSwaps(
      traceDocument, eventFrame, eventTimeline,
      currentElements, previousObjects, previousIdentityKeys
    );
    const swapMap = swapSources(traceDocument, eventFrame, eventTimeline);
    const motionDelays = eventMotionDelays(
      traceDocument, eventFrame, eventTimeline, currentPlacements, currentElements
    );
    const visualKeyBySource = new Map();
    swapMap.forEach((swap, visualKey) => visualKeyBySource.set(swap.sourceKey, visualKey));
    const rawDeltas = new Map();
    const entries = [];
    const visualCommits = mutationVisualCommits(traceDocument, eventFrame, eventTimeline);
    const currentTopKeys = new Set();
    const attachmentsByKey = new Map();

    root.querySelectorAll('[data-trace-attached-to]').forEach(element => {
      const key = element.getAttribute('data-trace-attached-to') || '';
      if (!key) return;
      if (!attachmentsByKey.has(key)) attachmentsByKey.set(key, []);
      attachmentsByKey.get(key).push(element);
    });

    currentElements.forEach((element, key) => {
      if (!element?.isConnected) return;
      const currentPlacement = currentPlacements.get(key);
      if (!currentPlacement) return;
      const current = motionPosition(element, currentPlacement);
      const plan = transitionForKey?.(key) || { mode: 'move', sourceKey: key, duration };
      const swap = swapMap.get(key);
      const markerContinuation = markerContinuations.get(key);
      const useMarkerContinuation = markerContinuation
        && !swap
        && (plan.requestedMode === 'auto' || !plan.sourceKey || plan.sourceKey === key);
      const requestedSourceKey = useMarkerContinuation
        ? markerContinuation.key
        : swap?.sourceKey || plan.sourceKey || key;
      const topKey = topLevelKey(element, root);
      const topElement = currentElements.get(topKey) || element;
      const sourceKey = previousAliasKey(
        requestedSourceKey, topKey, topElement, previousPlacements, previousIdentityKeys
      );
      const candidatePreviousVisual = useMarkerContinuation
        ? markerContinuation.element
        : previousVisualElement(previousObjects, sourceKey);
      const activationChanged = markerActivationChanged(element, candidatePreviousVisual);
      const previous = activationChanged
        ? null
        : (useMarkerContinuation
          ? markerContinuation.placement
          : previousPlacements?.get(sourceKey));
      const mode = previous && plan.requestedMode === 'auto'
        ? 'move'
        : plan.mode || (previous ? 'move' : 'lift');
      const raw = previous
        ? { x: (Number(previous.x) || 0) - (Number(current.x) || 0), y: (Number(previous.y) || 0) - (Number(current.y) || 0) }
        : { x: 0, y: 24 };
      rawDeltas.set(key, raw);
      if (topKey === key) {
        currentTopKeys.add(key);
        if (sourceKey) currentTopKeys.add(sourceKey);
      }
      entries.push({
        key, sourceKey, element, current, previous, plan, mode, topKey,
        markerContinuation: useMarkerContinuation ? markerContinuation : null,
        motionDelay: Math.max(swap?.start || 0, motionDelays.get(key) || 0)
      });
    });

    entries.forEach(entry => {
      const parentKey = parentObjectKey(entry.element, root);
      const own = rawDeltas.get(entry.key) || { x: 0, y: 0 };
      const parent = rawDeltas.get(parentKey) || { x: 0, y: 0 };
      entry.dx = own.x - parent.x;
      entry.dy = own.y - parent.y;
      entry.target = entry.key === entry.topKey
        ? entry.element.querySelector(':scope > .asm-trace-motion') || entry.element
        : entry.element;
      entry.baseTransform = entry.target.getAttribute('transform') || '';
      entry.baseOpacity = entry.target.getAttribute('opacity');
      entry.appearing = !entry.previous || enteringMarkerKeys.has(entry.key);
      entry.appearanceStart = enteringMarkerKeys.has(entry.key)
        ? playbackPlan.phases.find(phase => phase.id === 'object-entrance').startMs
        : 0;
      if (entry.appearing) entry.target.dataset.traceAppearing = '1';
      entry.attachedVisuals = (attachmentsByKey.get(entry.key) || [])
        .map(wrapAttachedVisual)
        .filter(Boolean);
      try {
        const box = entry.element.getBBox();
        entry.compareCenter = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      } catch (error) {
        entry.compareCenter = { x: 0, y: 0 };
      }
      entry.rects = [...entry.element.querySelectorAll('rect')];
      const previousTop = previousObjects?.get(entry.topKey);
      const markerContinuation = entry.markerContinuation;
      const candidatePreviousVisual = markerContinuation?.element
        || previousVisualElement(previousObjects, entry.sourceKey);
      const previousVisual = markerActivationChanged(entry.element, candidatePreviousVisual)
        ? null
        : candidatePreviousVisual;
      entry.previousVisual = previousVisual;
      entry.previousSegmentGeometry = segmentGeometry(previousVisual);
      entry.currentSegmentGeometry = segmentGeometry(entry.element);
      entry.visualCommit = visualCommits.get(entry.key) || null;
      entry.previousRectStates = previousVisual
        ? alignedRectStates(previousVisual, entry.element, entry.topKey)
        : (previousTop ? rectStates(previousTop, entry.topKey) : new Map());
      entry.currentRectStates = rectStates(entry.element, entry.topKey);
      entry.commitTextStates = previousVisual
        ? alignedTextStates(previousVisual, entry.element)
        : [];
      entry.markerLabelBox = entry.element.querySelector('.trace-variable-marker-label-box');
      entry.markerLabelText = entry.element.querySelector('.trace-variable-marker-label-text');
      entry.markerPointPath = entry.element.querySelector('.trace-variable-marker-point path');
      entry.markerLabelBoxBaseTransform = entry.markerLabelBox?.getAttribute('transform') || '';
      entry.markerLabelTextBaseTransform = entry.markerLabelText?.getAttribute('transform') || '';
      entry.markerPointBasePath = entry.markerPointPath?.getAttribute('d') || '';
    });

    const heapResizeStages = createHeapResizeSwapStages(root, heapResizeDescriptors);
    const ghosts = [];
    previousObjects?.forEach((clone, key) => {
      if (currentTopKeys.has(key) || heapResizeStages.heldPreviousKeys.has(key)) return;
      removeAnimationNodes(clone);
      clone.removeAttribute('id');
      clone.removeAttribute('data-trace-object-key');
      clone.classList.add('asm-trace-transition-ghost');
      clone.setAttribute('pointer-events', 'none');
      syncPresentationHints(clone);
      const wrapper = createSvg('g', { class: 'asm-trace-transition-ghost-motion', 'pointer-events': 'none' });
      wrapper.append(clone);
      root.prepend(wrapper);
      ghosts.push(wrapper);
    });

    const appearingKeys = new Set(entries.filter(entry => entry.appearing).map(entry => entry.key));
    const events = eventSequence({
      ...options,
      rawDeltas,
      markerEntries: entries,
      appearingKeys,
      visualKeyForSource: key => visualKeyBySource.get(key) || key
    }, eventFrame, eventTimeline);
    const eventTimelineDuration = eventTimeline.reduce((end, slot) => Math.max(end, slot.end), 0);
    const motionDuration = entries.reduce((end, entry) => {
      const localDuration = Math.max(1, Number(entry.plan?.duration) || duration);
      const normalEnd = entry.motionDelay + localDuration;
      return Math.max(end, normalEnd);
    }, duration);
    const totalDuration = Math.max(
      eventTimelineDuration,
      motionDuration,
      playbackPlan.totalDurationMs
    );
    let previousTick = performance.now();
    let elapsed = 0;
    function tick(now) {
      if (runId !== activeRun) return;
      elapsed += Math.max(0, now - previousTick) * animationPlaybackRate();
      previousTick = now;
      const playbackPhase = playbackPhaseAt(playbackPlan, elapsed);
      if (playbackPhase) root.dataset.tracePlaybackPhase = playbackPhase;
      else delete root.dataset.tracePlaybackPhase;
      const progress = Math.max(0, Math.min(1, elapsed / duration));
      const eased = easeOutCubic(progress);

      if (elapsed < eventTimelineDuration) {
        events?.update(elapsed);
      } else {
        events?.finish();
      }
      heapResizeStages.update(elapsed, events?.adjustments);

      const motionStates = new Map();
      entries.forEach(entry => {
        const motionElapsed = Math.max(0, elapsed - entry.motionDelay);
        const localDuration = Math.max(1, Number(entry.plan?.duration) || duration);
        const localProgress = Math.max(0, Math.min(1, motionElapsed / localDuration));
        const localEased = easeOutCubic(localProgress);
        const appearElapsed = Math.max(0, elapsed - entry.appearanceStart);
        const appearProgress = clamp01(
          appearElapsed / Math.min(APPEAR_TIMING.duration, localDuration)
        );
        const appearEased = easeOutCubic(appearProgress);
        let dx = entry.dx * (1 - localEased);
        let dy = entry.dy * (1 - localEased);
        if (entry.mode === 'arc' && entry.previous) {
          dy -= Math.sin(Math.PI * localEased) * Math.max(18, Math.min(90, Math.hypot(entry.dx, entry.dy) * 0.22));
        }
        if (entry.mode === 'instant' || entry.mode === 'fade') dx = dy = 0;
        if (entry.appearing) {
          dx = 0;
          dy = APPEAR_TIMING.offsetY * (1 - appearEased);
        }
        if (entry.previousSegmentGeometry && entry.currentSegmentGeometry) {
          dx = 0;
          dy = 0;
          applySegmentGeometry(
            entry.element,
            interpolateSegmentGeometry(
              entry.previousSegmentGeometry,
              entry.currentSegmentGeometry,
              localEased
            )
          );
        }
        const adjustment = events?.adjustments?.get?.(entry.key) || { x: 0, y: 0, scale: 1 };
        const adjustedX = adjustment.absolute === true
          ? Number(adjustment.x) || 0
          : dx + (Number(adjustment.x) || 0);
        const adjustedY = adjustment.absolute === true
          ? Number(adjustment.y) || 0
          : dy + (Number(adjustment.y) || 0);
        motionStates.set(entry.key, {
          x: adjustedX,
          y: adjustedY,
          scale: Number(adjustment.scale) || 1,
          localEased,
          appearProgress,
          appearEased
        });
      });
      entries.forEach(entry => {
        const state = motionStates.get(entry.key);
        const adjustedX = state.x;
        const adjustedY = state.y;
        const translate = Math.abs(adjustedX) > 0.01 || Math.abs(adjustedY) > 0.01
          ? `translate(${adjustedX}, ${adjustedY})`
          : '';
        const scale = state.scale;
        const pivot = entry.compareCenter || { x: 0, y: 0 };
        const scaleTransform = Math.abs(scale - 1) > 0.001
          ? `translate(${pivot.x}, ${pivot.y}) scale(${scale}) translate(${-pivot.x}, ${-pivot.y})`
          : '';
        entry.target.setAttribute('transform', [translate, entry.baseTransform, scaleTransform].filter(Boolean).join(' '));
        entry.attachedVisuals.forEach(attachment => {
          attachment.wrapper.setAttribute('transform', [translate, scaleTransform].filter(Boolean).join(' '));
        });
        const markerArrowState = events?.markerArrowStates?.get?.(entry.key);
        if (entry.markerPointPath && markerArrowState) {
          entry.markerPointPath.setAttribute('d', markerArrowPath(entry, markerArrowState));
        }
        if (entry.appearing) {
          entry.target.setAttribute('opacity', String(state.appearEased));
          if (state.appearProgress >= 1) delete entry.target.dataset.traceAppearing;
          entry.attachedVisuals.forEach(attachment => {
            attachment.wrapper.setAttribute('opacity', String(state.appearEased));
          });
        } else if (entry.mode === 'fade') {
          entry.target.setAttribute('opacity', String(state.localEased));
        }
        if (entry.visualCommit && elapsed < entry.visualCommit.time && !entry.previousVisual) {
          entry.target.setAttribute('opacity', '0');
        }
        const eventOpacity = events?.opacities?.get?.(entry.key);
        if (Number.isFinite(eventOpacity)) entry.target.setAttribute('opacity', String(eventOpacity));

        entry.rects.forEach((rect, index) => {
          const key = rectKey(rect, index);
          const before = entry.previousRectStates.get(key);
          const after = entry.currentRectStates.get(key);
          if (!before || !after) return;
          if (entry.visualCommit) {
            applyRectState(rect, elapsed < entry.visualCommit.time ? before : after);
            return;
          }
          if (before.fill === after.fill && before.opacity === after.opacity) return;
          const fromColor = parseColor(before.fill, before.opacity);
          const toColor = parseColor(after.fill, after.opacity);
          if (!fromColor || !toColor) return;
          const color = interpolateColor(fromColor, toColor, state.localEased);
          rect.setAttribute('fill', `rgb(${color.r},${color.g},${color.b})`);
          rect.setAttribute('fill-opacity', String(color.a));
        });
        if (entry.visualCommit) {
          const usePrevious = elapsed < entry.visualCommit.time;
          entry.commitTextStates.forEach(state => {
            applyTextState(state.text, usePrevious ? state.before : state.after);
          });
        }
      });
      events?.syncPositions?.();

      ghosts.forEach(ghost => {
        const ghostProgress = easeOutCubic(clamp01(elapsed / APPEAR_TIMING.duration));
        ghost.setAttribute('opacity', String(1 - ghostProgress));
        ghost.setAttribute('transform', `translate(0, ${-15 * ghostProgress})`);
      });

      if (elapsed < totalDuration) {
        requestAnimationFrame(tick);
        return;
      }

      entries.forEach(entry => {
        delete entry.target.dataset.traceAppearing;
        if (entry.baseTransform) entry.target.setAttribute('transform', entry.baseTransform);
        else entry.target.removeAttribute('transform');
        if (entry.baseOpacity != null) entry.target.setAttribute('opacity', entry.baseOpacity);
        else entry.target.removeAttribute('opacity');
        entry.attachedVisuals.forEach(attachment => unwrapAttachedVisual(attachment));
        entry.currentRectStates.forEach((state, key) => {
          const rect = entry.rects.find((item, index) => rectKey(item, index) === key);
          if (!rect) return;
          applyRectState(rect, state);
        });
        entry.commitTextStates.forEach(state => applyTextState(state.text, state.after));
        if (entry.currentSegmentGeometry) {
          applySegmentGeometry(entry.element, entry.currentSegmentGeometry);
        }
        if (entry.markerPointPath && entry.markerPointBasePath) {
          entry.markerPointPath.setAttribute('d', entry.markerPointBasePath);
        }
      });
      ghosts.forEach(ghost => ghost.remove());
      heapResizeStages.finish();
      events?.finish?.();
      markerEntrancesByFrame.delete(frame.id);
      delete root.dataset.tracePlaybackPhase;
      finishRun();
    }
    tick(previousTick);
    completion.playbackPlan = playbackPlan;
    return completion;
  }

  function cancel() {
    activeRun += 1;
    finishActiveRun?.();
    document.querySelectorAll(
      '.asm-trace-compare-highlight, .asm-trace-compare-operator, '
      + '.asm-trace-compare-marker-popup, .asm-trace-assign-marker-popup, '
      + '.asm-trace-assign-falling-value, .asm-trace-assign-transfer, '
      + '.asm-trace-compare-self-clone, .asm-trace-transition-ghost-motion, '
      + '.asm-trace-transition-ghost, .asm-trace-heap-resize-ghost'
    ).forEach(element => element.remove());
    document.querySelectorAll('[data-trace-heap-resize-current]').forEach(wrapper => {
      const heap = wrapper.querySelector(':scope > [data-layout="heap"]');
      if (heap && wrapper.parentNode) wrapper.parentNode.insertBefore(heap, wrapper);
      wrapper.remove();
    });
    document.querySelectorAll('[data-trace-appearing]').forEach(element => {
      delete element.dataset.traceAppearing;
    });
    document.querySelectorAll('[data-trace-playback-plan-id]').forEach(element => {
      delete element.dataset.tracePlaybackPhase;
    });
  }

  if (typeof document !== 'undefined') {
    document.documentElement.dataset.asmTraceFrameTweenBuild = 'trace-109';
  }
  window.ASMTraceFrameTween = {
    build: 'trace-109', play, cancel, updateEventAvailability,
    createPlaybackPlan, recursiveMarkerTransitionSteps
  };
})();
