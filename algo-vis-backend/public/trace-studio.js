(function () {
  const DEFAULT_EVENT_COLORS = window.ASMTraceEvents?.colors || {};
  const EVENT_LABELS = window.ASMTraceEvents?.labels || {};

  let trace = null;
  let selectedFrames = new Set();
  let selectionAnchor = 0;
  let currentIndex = 0;
  let availabilityRefreshFrame = 0;
  const pendingAvailabilityFrames = new Set();
  let thumbnailRenderFrame = 0;
  let thumbnailRenderMode = '';
  let thumbnailCullFrame = 0;
  let pendingThumbnails = [];
  const THUMBNAIL_CACHE_LIMIT = 24;
  const thumbnailCache = new Map();
  let rail;
  let timeline;
  let inspector;
  let selectionLabel;
  let targetVariable;
  let targetIndex;
  let styleType;
  let styleColor;
  let styleEditor;
  let objectFillColor;
  let objectStrokeColor;
  let objectColorFields;
  let textStyleFields;
  let textColor;
  let textBackgroundColor;
  let textBackgroundEnabled;
  let textFontSize;
  let textFontSizeButton;
  let textBold;
  let textItalic;
  let textUnderline;
  let textStrike;
  let activeTextStyleKeys = [];
  let textSelectionRange = null;
  let textSelectionDrag = null;
  let variableStyleFields;
  let scopeSelect;
  let eventGapRange;
  let eventGapValue;
  let inspectorMode = 'events';
  let inspectorToolbar;
  let inspectorEventButton;
  let inspectorEventCount;
  let inspectorCameraButton;
  let inspectorObjectButton;
  let inspectorEventsPanel;
  let inspectorCameraPanel;
  let inspectorObjectPanel;
  let frameEventsEditor;
  let frameEventsList;
  let frameFixedEditor;
  let frameFixedList;
  let arrowFrom;
  let arrowTo;
  let arrowColor;
  let effectsList;
  let cameraZoom;
  let cameraZoomValue;
  let cameraAutoCapture;
  let cameraFrameButton;
  let trackingSource;
  let trackingTarget;
  let trackingEffect;
  let trackingIndexExpression;
  let trackingText;
  let trackingAnchor;
  let bindingEditor;
  let bindingRelation;
  let bindingTargetText;
  let bindingModeValue;
  let bindingModeRelative;
  let bindingIndexExpression;
  let bindingIndexField;
  let bindingEmpty;
  let bindingCard;
  let activeBinding = null;
  let markerShapeEditor;
  let markerShapeEmpty;
  let markerShapeCard;
  let markerShapeButtons;
  let objectStateEditor;
  let objectStateEmpty;
  let objectStateCard;
  let objectStateName;
  let objectStateSelect;
  let transitionEditor;
  let transitionEmpty;
  let transitionCard;
  let transitionRelation;
  let transitionSourceKey;
  let transitionMode;
  let activeObjectKey = '';
  let arrowFromIndex;
  let arrowToIndex;
  let cameraTimer = null;
  let undoButton;
  let redoButton;
  let history = [];
  let historyIndex = -1;
  let historyTrace = null;
  let restoringHistory = false;
  let thumbnailSyncFrame = 0;
  let studioRenderDepth = 0;
  let canvasShortcutMenu = null;
  let cameraFrameState = null;
  let cameraFrameDismiss = null;
  let cameraFrameAutoCloseTimer = null;
  let styleDraftId = '';
  let cameraDraftId = '';
  let autoSaveTimer = null;
  let pendingAutoSave = null;
  let suppressAutoSave = false;
  let liveBindingDrag = null;
  let textStylePreviewFrame = 0;

  function el(name, className, text) {
    const node = document.createElement(name);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function option(value, label) {
    const node = document.createElement('option');
    node.value = value;
    node.textContent = label;
    return node;
  }

  function colorControl(value, title) {
    if (window.ASMTraceColorPicker?.create) return window.ASMTraceColorPicker.create(value, title);
    const input = document.createElement('input');
    input.type = 'color';
    input.value = value;
    input.title = title;
    return input;
  }

  function runStudioRender(callback) {
    studioRenderDepth += 1;
    try {
      return callback();
    } finally {
      studioRenderDepth -= 1;
    }
  }

  function renderPlayerFrame(index, options) {
    return runStudioRender(() => window.ASMTracePlayer.render(index, options));
  }

  function setPlayerRules(rules) {
    return runStudioRender(() => window.ASMTracePlayer.setRules(rules));
  }

  function ensureStudioData() {
    trace.studio ||= {};
    trace.studio.positions ||= {};
    trace.studio.bindings ||= {};
    trace.studio.visibility ||= {};
    trace.studio.objectStyles ||= {};
    trace.studio.eventStates ||= {};
    trace.studio.eventInstructionStates ||= {};
    trace.studio.eventSettings ||= { gapMs: 500, autoFixedEnabled: true, defaultEnabled: {}, timelineTypes: {} };
    trace.studio.eventSettings.defaultEnabled ||= {};
    trace.studio.eventSettings.timelineTypes ||= {};
    if (typeof trace.studio.eventSettings.autoFixedEnabled !== 'boolean') {
      trace.studio.eventSettings.autoFixedEnabled =
        typeof trace.studio.eventSettings.defaultEnabled.fixed === 'boolean'
          ? trace.studio.eventSettings.defaultEnabled.fixed
          : true;
    }
    delete trace.studio.eventSettings.defaultEnabled.fixed;
    delete trace.studio.eventSettings.timelineTypes.fixed;
    Object.keys(trace.studio.eventInstructionStates).forEach(key => {
      if (/^fixed:/.test(key)) delete trace.studio.eventInstructionStates[key];
    });
    trace.studio.objects = Array.isArray(trace.studio.objects) ? trace.studio.objects : [];
    trace.studio.arrows = Array.isArray(trace.studio.arrows) ? trace.studio.arrows : [];
    trace.studio.cameraRules = Array.isArray(trace.studio.cameraRules) ? trace.studio.cameraRules : [];
    delete trace.studio.eventColors;
    delete trace.studio.eventSignatureColors;
    delete trace.studio.eventAnimations;
    delete trace.studio.transitionDefaults;
    trace.studio.transitions = (Array.isArray(trace.studio.transitions) ? trace.studio.transitions : []).map(rule => {
      const next = { ...rule, mode: rule?.mode === 'instant' ? 'instant' : 'auto' };
      delete next.duration;
      delete next.easing;
      return next;
    });
    window.ASMTraceEvents?.applyEnabledStates?.(trace);
  }

  function editableSnapshot() {
    return JSON.stringify({ rules: trace?.rules || [], studio: trace?.studio || {} });
  }

  function updateHistoryButtons() {
    if (undoButton) undoButton.disabled = historyIndex <= 0;
    if (redoButton) redoButton.disabled = historyIndex < 0 || historyIndex >= history.length - 1;
  }

  function resetHistory() {
    history = [editableSnapshot()];
    historyIndex = 0;
    historyTrace = trace;
    updateHistoryButtons();
  }

  function recordHistory() {
    if (restoringHistory || !trace) return;
    const snapshot = editableSnapshot();
    if (history[historyIndex] !== snapshot) {
      history.splice(historyIndex + 1);
      history.push(snapshot);
      if (history.length > 100) history.shift();
      historyIndex = history.length - 1;
      updateHistoryButtons();
    }
    writeSourceSettings();
  }

  function restoreHistory(nextIndex) {
    if (!trace || nextIndex < 0 || nextIndex >= history.length || nextIndex === historyIndex) return;
    restoringHistory = true;
    historyIndex = nextIndex;
    const snapshot = JSON.parse(history[historyIndex]);
    trace.rules = snapshot.rules || [];
    trace.studio = snapshot.studio || {};
    ensureStudioData();
    setPlayerRules(trace.rules);
    renderRail();
    renderTimeline();
    renderEffects();
    renderSelection();
    renderObjectStateEditor();
    renderTransitionEditor();
    renderBindingEditor();
    applyCameraForFrame(currentIndex, true);
    restoringHistory = false;
    updateHistoryButtons();
    writeSourceSettings();
  }

  function undo() { restoreHistory(historyIndex - 1); }
  function redo() { restoreHistory(historyIndex + 1); }

  function variables() {
    return Object.entries(trace?.variables || {});
  }

  function frameIdsForScope() {
    if (!trace?.frames?.length) return [];
    if (scopeSelect.value === 'all') return trace.frames.map(frame => frame.id);
    const currentFrame = trace.frames[currentIndex];
    const directiveName = window.ASMTraceViewSource?.directiveName?.(currentFrame) || '';
    if (scopeSelect.value === 'directive' && directiveName) {
      return trace.frames
        .filter(frame => window.ASMTraceViewSource?.directiveName?.(frame) === directiveName)
        .map(frame => frame.id);
    }
    if (scopeSelect.value === 'directive') {
      const selector = window.ASMTraceViewSource?.sourceSelector?.(currentFrame);
      if (selector) {
        return trace.frames
          .filter(frame => window.ASMTraceViewSource?.sourceMatches?.(frame, selector))
          .map(frame => frame.id);
      }
    }
    if (scopeSelect.value === 'forward') {
      const line = Number(currentFrame?.source?.line) || 0;
      const names = new Set(trace.frames
        .filter(frame => (Number(frame.source?.line) || 0) >= line)
        .map(frame => window.ASMTraceViewSource?.directiveName?.(frame))
        .filter(Boolean));
      if (names.size) {
        return trace.frames
          .filter(frame => names.has(window.ASMTraceViewSource?.directiveName?.(frame)))
          .map(frame => frame.id);
      }
      return trace.frames.slice(currentIndex).map(frame => frame.id);
    }
    const ids = [...selectedFrames];
    return ids.length ? ids : [trace.frames[currentIndex].id];
  }

  function frameObjectKey(frame, variableId) {
    const source = frame?.source || {};
    if (source.objectId && source.primaryVariableId === variableId) return source.objectId;
    return variableId;
  }

  function segmentKeyForRuntimeIdentity(frame, wantedIdentity) {
    if (!frame || !wantedIdentity) return '';
    const ordinals = new Map();
    for (const [descriptorIndex, descriptor] of (frame.segments || []).entries()) {
      const variableId = descriptor?.targetVariableId;
      const entry = frame.state?.[variableId];
      if (!variableId || !entry) continue;
      const targetKey = frameObjectKey(frame, variableId);
      const identityBase = String(entry.identity || targetKey);
      const ordinal = ordinals.get(identityBase) || 0;
      ordinals.set(identityBase, ordinal + 1);
      const runtimeIdentity = descriptor.named
        ? `segment:named:${descriptor.id}`
        : `segment:${identityBase}:${ordinal}`;
      if (runtimeIdentity === wantedIdentity) {
        return `segment:${descriptor.id || `${frame.id}-${descriptorIndex}`}`;
      }
    }
    return '';
  }

  function objectStyleKeyForFrame(frameId) {
    if (!String(activeObjectKey).startsWith('segment:')) return activeObjectKey;
    const rendered = document.querySelector(
      `#arraySvg [data-trace-object-key="${CSS.escape(activeObjectKey)}"]`
    );
    const runtimeIdentity = rendered?.dataset?.traceRuntimeIdentity || '';
    if (!runtimeIdentity) return activeObjectKey;
    const frame = trace?.frames?.find(item => item.id === frameId);
    return segmentKeyForRuntimeIdentity(frame, runtimeIdentity);
  }

  function frameBinding(frameId, key) {
    const rootKey = String(key || '').match(/^(text:[^:]+)/)?.[1] || key;
    const stored = trace?.studio?.bindings?.[frameId]?.[rootKey]
      || trace?.studio?.bindings?.[frameId]?.[key];
    if (stored) return stored;
    const frame = trace?.frames?.find(item => item.id === frameId);
    const textId = String(rootKey || '').match(/^text:(.+)$/)?.[1];
    const descriptor = textId
      ? frame?.texts?.find(item => String(item.id) === textId)
      : null;
    const objectBinding = !descriptor
      ? (frame?.objectBindings || []).find(item => {
        const sourceKey = frame?.source?.objectId
          && frame.source.primaryVariableId === item.sourceVariableId
          ? frame.source.objectId
          : item.sourceVariableId;
        return sourceKey === rootKey;
      })
      : null;
    const binding = descriptor?.binding || objectBinding;
    if (!binding) return null;
    const indexExpression = (binding.indexExpressions || []).join(',');
    const resolvedIndices = (binding.indexExpressions || []).map(expression => (
      window.ASMTraceRules?.resolveExpression?.(trace, frame, expression)
    ));
    const resolvedIndex = resolvedIndices.length && resolvedIndices.every(value => Number.isInteger(Number(value)))
      ? resolvedIndices.map(Number).join(',')
      : indexExpression;
    const requestedObjectKey = String(binding.targetObjectKey || '');
    const keepObjectExists = requestedObjectKey && (trace?.snapshots || []).some(snapshot => (
      String(snapshot?.objectId || snapshot?.id || '') === requestedObjectKey
      && (frame?.snapshotIds || []).includes(snapshot.id)
    ));
    const objectTargetKey = requestedObjectKey && !keepObjectExists
      && (trace?.studio?.objects || []).some(object => String(object?.id || '') === requestedObjectKey)
      ? `studio:${requestedObjectKey}`
      : requestedObjectKey;
    return {
      semanticText: Boolean(descriptor),
      semanticDirective: Boolean(objectBinding),
      descriptorLine: descriptor?.line || frame?.source?.line || 0,
      targetKey: binding.canvas
        ? '$canvas'
        : `${binding.targetVariableId || objectTargetKey}${resolvedIndex ? `#${resolvedIndex}` : ''}`,
      sourceAnchor: objectBinding
        ? ([
          String(binding.anchor || '').includes('top') ? 'bottom' : String(binding.anchor || '').includes('bottom') ? 'top' : '',
          String(binding.anchor || '').includes('left') ? 'right' : String(binding.anchor || '').includes('right') ? 'left' : ''
        ].filter(Boolean).join('-') || 'center')
        : 'center',
      targetAnchor: binding.anchor || 'center',
      targetExpression: binding.targetExpression,
      dx: (objectBinding
        ? (String(binding.anchor || '').includes('left') ? -8 : String(binding.anchor || '').includes('right') ? 8 : 0)
        : 0) + (Number(binding.offsetX) || 0),
      dy: (objectBinding
        ? (String(binding.anchor || '').includes('top') ? -8 : String(binding.anchor || '').includes('bottom') ? 8 : 0)
        : 0) + (Number(binding.offsetY) || 0),
      mode: 'relative'
    };
  }

  function textObjectKey(key) {
    return String(key || '').match(/^(text:[^:]+)/)?.[1] || '';
  }

  function textDescriptorForKey(key, frame = trace?.frames?.[currentIndex]) {
    const id = textObjectKey(key).slice(5);
    return id ? frame?.texts?.find(item => String(item.id) === id) || null : null;
  }

  function textDirectiveLine(descriptor) {
    const explicit = Number(descriptor?.line);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;
    return Number(String(descriptor?.id || '').match(/^line-(\d+)$/)?.[1]) || 0;
  }

  function bindSemanticText(sourceKey, targetKey, targetAnchor) {
    const descriptor = textDescriptorForKey(sourceKey);
    if (!descriptor || targetKey === '$canvas') return false;
    const targetId = bindingTargetVariableId(targetKey);
    const targetVariable = trace?.variables?.[targetId];
    const rawObjectKey = String(targetKey || '').split('#')[0];
    const targetObjectKey = rawObjectKey.startsWith('studio:')
      ? rawObjectKey.slice('studio:'.length)
      : rawObjectKey;
    const targetObjectExists = !targetVariable && (
      (trace?.snapshots || []).some(snapshot => String(snapshot?.objectId || snapshot?.id || '') === targetObjectKey)
      || (trace?.studio?.objects || []).some(object => String(object?.id || '') === targetObjectKey)
    );
    if (!targetVariable && !targetObjectExists) return false;
    const indexExpression = String(targetKey).match(/#([^:]+)/)?.[1] || '';
    const targetName = targetVariable?.name || targetId || targetObjectKey;
    const targetExpression = `${targetVariable ? targetName : targetObjectKey}${indexExpression ? `[${indexExpression}]` : ''}`;
    const anchor = String(targetAnchor || 'center').replace(/\s+/g, '-').toLowerCase();
    const sourcePlacement = window.ASMTraceRenderers?.currentPlacement?.(textObjectKey(sourceKey), false);
    const targetPlacement = window.ASMTraceRenderers?.currentPlacement?.(targetKey, false);
    const targetPoint = window.ASMTraceRenderers?.anchorPoint?.(targetPlacement, anchor);
    let offsetX = 0;
    let offsetY = 0;
    if (sourcePlacement && targetPoint) {
      const gap = 8;
      let desiredX = targetPoint.x - sourcePlacement.width / 2;
      let desiredY = targetPoint.y - sourcePlacement.height / 2;
      if (anchor.includes('left')) desiredX = targetPoint.x - sourcePlacement.width - gap;
      if (anchor.includes('right')) desiredX = targetPoint.x + gap;
      if (anchor.includes('top')) desiredY = targetPoint.y - sourcePlacement.height - gap;
      if (anchor.includes('bottom')) desiredY = targetPoint.y + gap;
      offsetX = Math.round((sourcePlacement.x - desiredX) * 100) / 100;
      offsetY = Math.round((sourcePlacement.y - desiredY) * 100) / 100;
    }
    const nextBinding = {
      type: 'semantic',
      targetExpression,
      targetName: targetVariable ? targetName : targetObjectKey,
      ...(targetVariable ? { targetVariableId: targetId } : { targetObjectKey }),
      indexExpressions: indexExpression ? [indexExpression] : [],
      anchor,
      offsetX,
      offsetY,
      canvas: false
    };
    trace.frames.forEach(frame => {
      (frame.texts || []).forEach(text => {
        if (Number(text.line) === Number(descriptor.line) && String(text.id) === String(descriptor.id)) {
          text.binding = { ...nextBinding };
        }
      });
    });
    window.asmUpdateTextDirectiveBinding?.(textDirectiveLine(descriptor), nextBinding);
    activeBinding = {
      sourceKey: textObjectKey(sourceKey),
      targetKey,
      binding: frameBinding(trace.frames[currentIndex]?.id, textObjectKey(sourceKey))
    };
    recordHistory();
    renderPlayerFrame(currentIndex, { animatePositions: false });
    renderRail();
    renderSelection();
    renderBindingEditor();
    return true;
  }

  function traceElementsByKey(container) {
    return new Map(Array.from(container?.querySelectorAll?.('[data-trace-object-key]') || [])
      .map(element => [element.dataset.traceObjectKey, element]));
  }

  function boundDependentElements(container, frameId, targetKey) {
    const bindings = trace?.studio?.bindings?.[frameId] || {};
    const elements = traceElementsByKey(container);
    const target = elements.get(targetKey);
    if (!target) return [];
    const movingElements = [target];
    const resolvedKeys = new Set([targetKey]);
    const dependents = [];
    let changed = true;
    while (changed) {
      changed = false;
      Object.entries(bindings).forEach(([sourceKey, binding]) => {
        if (resolvedKeys.has(sourceKey) || !binding?.targetKey) return;
        const source = elements.get(sourceKey);
        const bindingTarget = elements.get(binding.targetKey);
        if (!source || !bindingTarget) return;
        const targetMoves = movingElements.some(element => element === bindingTarget || element.contains(bindingTarget));
        if (!targetMoves) return;
        resolvedKeys.add(sourceKey);
        movingElements.push(source);
        if (!movingElements.some(element => element !== source && element.contains(source))) dependents.push(source);
        changed = true;
      });
    }
    return dependents;
  }

  function liveTransform(element, dx, dy, baseDataKey) {
    if (!element) return;
    if (element.dataset[baseDataKey] == null) {
      element.dataset[baseDataKey] = element.getAttribute('transform') || '';
    }
    const base = element.dataset[baseDataKey];
    element.setAttribute('transform', `${base} translate(${Number(dx) || 0}, ${Number(dy) || 0})`.trim());
  }

  function moveBoundObjects(targetKey, dx, dy) {
    if (!trace || !targetKey || !document.body.classList.contains('asm-trace-studio-open')) return;
    const frameId = trace.frames[currentIndex]?.id;
    if (!frameId) return;
    if (!liveBindingDrag || liveBindingDrag.targetKey !== targetKey) {
      endBoundObjectDrag();
      const canvas = document.getElementById('arraySvg');
      liveBindingDrag = {
        targetKey,
        elements: boundDependentElements(canvas, frameId, targetKey)
      };
    }
    liveBindingDrag.dx = Number(dx) || 0;
    liveBindingDrag.dy = Number(dy) || 0;
    liveBindingDrag.elements.forEach(element => {
      liveTransform(element, liveBindingDrag.dx, liveBindingDrag.dy, 'traceLiveBindingBaseTransform');
      element.dataset.traceLiveBindingTranslate = `${liveBindingDrag.dx},${liveBindingDrag.dy}`;
    });
  }

  function endBoundObjectDrag() {
    liveBindingDrag?.elements?.forEach(element => {
      delete element.dataset.traceLiveBindingBaseTransform;
      delete element.dataset.traceLiveBindingTranslate;
    });
    liveBindingDrag = null;
  }

  function objectDisplayName(key) {
    if (!key) return '';
    if (trace?.variables?.[key]) return trace.variables[key].name || key;
    const kept = (trace?.snapshots || []).find(snapshot => (
      snapshot.id === key || String(snapshot.objectId || snapshot.id) === key
    ));
    if (kept) return kept.label || kept.objectId || key;
    if (key.startsWith('text:')) {
      const selectedSegment = textSegmentForKey(key);
      if (selectedSegment?.kind === 'expression') return `變數 ${selectedSegment.source || `\${${selectedSegment.expression}}`}`;
      if (selectedSegment) return selectedSegment.text?.trim() || '文字片段';
      const descriptor = trace?.frames?.[currentIndex]?.texts?.find(text => `text:${text.id}` === key);
      const label = (descriptor?.segments || []).map(segment => (
        segment.kind === 'expression' ? segment.source || `\${${segment.expression}}` : segment.text || ''
      )).join('').trim();
      return label || '文字';
    }
    const studioObject = key.startsWith('studio:')
      ? trace?.studio?.objects?.find(object => `studio:${object.id}` === key)
      : null;
    if (studioObject) return studioObject.text || variableName(studioObject.sourceVariableId) || '追蹤物件';
    if (key.startsWith('arrow:')) return '箭頭';
    const variableId = bindingTargetVariableId(key);
    const variable = trace?.variables?.[variableId];
    if (!variable) return key;
    const indexMatch = key.match(/#([^:]+)/);
    if (indexMatch) {
      const suffix = key.endsWith(':index') ? ' 索引' : '';
      return `${variable.name || variableId}[${indexMatch[1]}]${suffix}`;
    }
    if (key.endsWith(':label')) return `${variable.name || variableId} 名稱`;
    return variable.name || variableId;
  }

  function textSegmentForKey(key) {
    const match = String(key || '').match(/^text:([^:]+):segment:([^:]+)(?::range:\d+-\d+)?$/);
    if (!match) return null;
    const descriptor = trace?.frames?.[currentIndex]?.texts?.find(text => String(text.id) === match[1]);
    return descriptor?.segments?.find(segment => String(segment.segmentId) === match[2]) || null;
  }

  function textSelectionData(key = activeObjectKey) {
    const match = String(key || '').match(/^text:([^:]+):segment:/);
    if (!match) return null;
    const frame = trace?.frames?.[currentIndex];
    const descriptor = frame?.texts?.find(text => String(text.id) === match[1]);
    if (!descriptor) return null;
    let cursor = 0;
    const segments = (descriptor.segments || []).map((segment, index) => {
      const raw = segment.kind === 'expression'
        ? window.ASMTraceRules.resolveExpression(trace, frame, segment.expression)
        : segment.text;
      const source = raw == null ? '' : String(raw);
      const parsed = window.parseTTSMarkup?.(source) || { display: source };
      const display = String(parsed.display ?? '');
      const item = {
        segment,
        display,
        start: cursor,
        end: cursor + display.length,
        baseKey: `text:${descriptor.id}:segment:${segment.segmentId || index}`,
        rangeSafe: segment.kind !== 'expression' && !/[{}]/.test(source)
      };
      cursor = item.end;
      return item;
    });
    return { descriptor, segments, value: segments.map(segment => segment.display).join('') };
  }

  function updateTextSelectionKeys(start, end) {
    const data = textSelectionData();
    if (!data) return;
    start = Math.max(0, Math.min(data.value.length, Number(start) || 0));
    end = Math.max(0, Math.min(data.value.length, Number(end) || 0));
    if (end < start) [start, end] = [end, start];
    textSelectionRange = { objectKey: textObjectKey(activeObjectKey), start, end };
    if (end <= start) {
      activeTextStyleKeys = [activeObjectKey];
      renderTextSelectionHighlight();
      return;
    }
    activeTextStyleKeys = data.segments.flatMap(item => {
      const overlapStart = Math.max(start, item.start);
      const overlapEnd = Math.min(end, item.end);
      if (overlapEnd <= overlapStart) return [];
      if (!item.rangeSafe || (overlapStart === item.start && overlapEnd === item.end)) return [item.baseKey];
      return [`${item.baseKey}:range:${overlapStart - item.start}-${overlapEnd - item.start}`];
    });
    if (!activeTextStyleKeys.length) activeTextStyleKeys = [activeObjectKey];
    renderTextSelectionHighlight();
  }

  function textCharacterCount(text) {
    try {
      if (typeof text.getNumberOfChars === 'function') return text.getNumberOfChars();
    } catch {}
    return String(text?.textContent || '').length;
  }

  function textCharacterExtent(text, index) {
    try {
      if (typeof text.getExtentOfChar === 'function') return text.getExtentOfChar(index);
    } catch {}
    const value = String(text?.textContent || '');
    const style = getComputedStyle(text);
    const fontSize = parseFloat(style.fontSize) || Number(text.getAttribute('font-size')) || 10;
    const canvas = textCharacterExtent.canvas ||= document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.font = `${style.fontStyle || 'normal'} ${style.fontWeight || 'normal'} ${fontSize}px ${style.fontFamily || 'Arial'}`;
    const before = context.measureText(value.slice(0, index)).width;
    const glyph = context.measureText(value.slice(index, index + 1));
    const x = (Number(text.getAttribute('x')) || 0) + before;
    const baseline = Number(text.getAttribute('y')) || fontSize;
    const ascent = glyph.actualBoundingBoxAscent || fontSize * 0.8;
    const descent = glyph.actualBoundingBoxDescent || fontSize * 0.2;
    return { x, y: baseline - ascent, width: Math.max(1, glyph.width), height: ascent + descent };
  }

  function textCharacterBounds(text, index) {
    try {
      const extent = textCharacterExtent(text, index);
      if (!extent) return null;
      const matrix = text.getScreenCTM();
      if (!matrix) return null;
      const corners = [
        [extent.x, extent.y],
        [extent.x + extent.width, extent.y],
        [extent.x, extent.y + extent.height],
        [extent.x + extent.width, extent.y + extent.height]
      ].map(([x, y]) => new DOMPoint(x, y).matrixTransform(matrix));
      const left = Math.min(...corners.map(point => point.x));
      const top = Math.min(...corners.map(point => point.y));
      const right = Math.max(...corners.map(point => point.x));
      const bottom = Math.max(...corners.map(point => point.y));
      return { extent, left, top, right, bottom };
    } catch {
      return null;
    }
  }

  function textCharacterAt(clientX, clientY, objectKey = textObjectKey(activeObjectKey)) {
    const canvas = document.getElementById('arraySvg');
    const object = objectKey
      ? canvas?.querySelector?.(`[data-trace-object-key="${CSS.escape(objectKey)}"]`)
      : null;
    const data = textSelectionData();
    if (!object || !data) return null;
    let best = null;
    object.querySelectorAll('.asm-trace-text-segment-value').forEach(text => {
      const group = text.closest('[data-trace-text-base-key]');
      const item = data.segments.find(segment => segment.baseKey === group?.dataset.traceTextBaseKey);
      if (!item) return;
      const sourceStart = Number(group.dataset.traceTextSourceStart) || 0;
      for (let index = 0; index < textCharacterCount(text); index += 1) {
        const bounds = textCharacterBounds(text, index);
        if (!bounds) continue;
        const dx = clientX < bounds.left ? bounds.left - clientX : clientX > bounds.right ? clientX - bounds.right : 0;
        const dy = clientY < bounds.top ? bounds.top - clientY : clientY > bounds.bottom ? clientY - bounds.bottom : 0;
        const distance = Math.hypot(dx, dy);
        const globalIndex = item.rangeSafe ? item.start + sourceStart + index : item.start;
        const rangeEnd = item.rangeSafe ? globalIndex + 1 : item.end;
        if (!best || distance < best.distance) best = { globalIndex, rangeEnd, item, distance };
      }
    });
    return best;
  }

  function renderTextSelectionHighlight() {
    const canvas = document.getElementById('arraySvg');
    canvas?.querySelectorAll('.asm-trace-text-character-selection').forEach(element => element.remove());
    const range = textSelectionRange;
    if (!range || range.end <= range.start || range.objectKey !== textObjectKey(activeObjectKey)) return;
    const object = canvas?.querySelector?.(`[data-trace-object-key="${CSS.escape(range.objectKey)}"]`);
    const data = textSelectionData();
    if (!object || !data) return;
    object.querySelectorAll('.asm-trace-text-segment-value').forEach(text => {
      const group = text.closest('[data-trace-text-base-key]');
      const item = data.segments.find(segment => segment.baseKey === group?.dataset.traceTextBaseKey);
      if (!item) return;
      const sourceStart = Number(group.dataset.traceTextSourceStart) || 0;
      for (let index = 0; index < textCharacterCount(text); index += 1) {
        const globalIndex = item.rangeSafe ? item.start + sourceStart + index : item.start;
        const selected = item.rangeSafe
          ? globalIndex >= range.start && globalIndex < range.end
          : item.end > range.start && item.start < range.end;
        if (!selected) continue;
        const extent = textCharacterExtent(text, index);
        if (!extent) continue;
        const highlight = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        highlight.setAttribute('class', 'asm-trace-text-character-selection');
        highlight.setAttribute('x', extent.x - 0.5);
        highlight.setAttribute('y', extent.y);
        highlight.setAttribute('width', Math.max(1, extent.width + 1));
        highlight.setAttribute('height', Math.max(1, extent.height));
        highlight.setAttribute('rx', '1');
        text.parentNode.insertBefore(highlight, text);
      }
    });
  }

  function beginTextSelection(event) {
    if (event.button !== 0 || !trace || !document.body.classList.contains('asm-trace-studio-open')) return;
    const segment = event.target.closest?.('[data-trace-text-base-key]');
    const object = segment?.closest?.('.asm-trace-text-object');
    if (!segment || !object) return;
    const key = segment.dataset.traceObjectKey || segment.dataset.traceTextBaseKey;
    setActiveObjectKey(key);
    setActiveBindingForKey(key);
    const hit = textCharacterAt(event.clientX, event.clientY, object.dataset.traceObjectKey);
    if (!hit) return;
    textSelectionDrag = {
      pointerId: event.pointerId,
      objectKey: object.dataset.traceObjectKey,
      start: hit.globalIndex,
      startEnd: hit.rangeEnd
    };
    updateTextSelectionKeys(hit.globalIndex, hit.rangeEnd);
    renderStyleEditor();
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function moveTextSelection(event) {
    if (!textSelectionDrag || event.pointerId !== textSelectionDrag.pointerId) return;
    const hit = textCharacterAt(event.clientX, event.clientY, textSelectionDrag.objectKey);
    if (!hit) return;
    const start = Math.min(textSelectionDrag.start, hit.globalIndex);
    const end = Math.max(textSelectionDrag.startEnd, hit.rangeEnd);
    updateTextSelectionKeys(start, end);
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function endTextSelection(event) {
    if (!textSelectionDrag || event.pointerId !== textSelectionDrag.pointerId) return;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
    textSelectionDrag = null;
    renderStyleEditor();
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function objectVisibility(frameId, key) {
    return trace?.studio?.visibility?.[frameId]?.[key] === 'hidden' ? 'hidden' : 'visible';
  }

  function renderObjectStateEditor() {
    if (!objectStateEditor) return;
    objectStateEditor.hidden = !activeObjectKey;
    if (!activeObjectKey) {
      objectStateEmpty.hidden = false;
      objectStateCard.hidden = true;
      return;
    }
    const frameId = trace?.frames?.[currentIndex]?.id;
    objectStateEmpty.hidden = true;
    objectStateCard.hidden = false;
    objectStateName.textContent = objectDisplayName(activeObjectKey);
    objectStateSelect.value = objectVisibility(frameId, activeObjectKey);
  }

  function currentTransitionRule() {
    const frame = trace?.frames?.[currentIndex];
    const previousFrame = trace?.frames?.[currentIndex - 1];
    if (!frame || !previousFrame || !activeObjectKey) return null;
    return window.ASMTraceTransitions?.explicitRule?.(trace, previousFrame, frame, activeObjectKey) || null;
  }

  function renderTransitionEditor() {
    if (!transitionEditor) return;
    transitionEditor.hidden = !activeObjectKey;
    const frame = trace?.frames?.[currentIndex];
    const previousFrame = trace?.frames?.[currentIndex - 1];
    if (!activeObjectKey || !frame || !previousFrame) {
      transitionEmpty.hidden = false;
      transitionCard.hidden = true;
      transitionEmpty.textContent = currentIndex === 0
        ? '第一幀沒有上一幀可供補間'
        : '選取物件以設定幀間動畫';
      return;
    }
    const rule = currentTransitionRule();
    const sourceKey = rule?.sourceKey || activeObjectKey;
    transitionEmpty.hidden = true;
    transitionCard.hidden = false;
    transitionRelation.textContent = rule
      ? `${sourceKey} → ${activeObjectKey}`
      : `自動補間 · ${activeObjectKey}`;
    if (document.activeElement !== transitionSourceKey) transitionSourceKey.value = sourceKey;
    transitionMode.value = rule?.mode === 'instant' ? 'instant' : 'auto';
  }

  function replaceTransitionForFrames(frameIds, nextRule) {
    const targetIds = new Set(frameIds);
    trace.studio.transitions = trace.studio.transitions.flatMap(existing => {
      if (existing.objectKey !== activeObjectKey) return [existing];
      const existingIds = Array.isArray(existing.frameIds) && existing.frameIds.length
        ? existing.frameIds
        : existing.toFrameId ? [existing.toFrameId] : [];
      if (!existingIds.some(frameId => targetIds.has(frameId))) return [existing];
      const remaining = existingIds.filter(frameId => !targetIds.has(frameId));
      return remaining.length ? [{ ...existing, frameIds: remaining, toFrameId: undefined }] : [];
    });
    if (nextRule) trace.studio.transitions.push(nextRule);
  }

  function saveTransitionRule() {
    if (!trace || !activeObjectKey || !transitionMode) return;
    const frameIds = frameIdsForScope().filter(frameId => trace.frames.findIndex(frame => frame.id === frameId) > 0);
    if (!frameIds.length) return;
    const sourceKey = transitionSourceKey.value.trim() || activeObjectKey;
    const mode = transitionMode.value || 'auto';
    const isDefault = sourceKey === activeObjectKey && mode === 'auto';
    replaceTransitionForFrames(frameIds, isDefault ? null : {
      id: `transition-${Date.now().toString(36)}`,
      frameIds,
      objectKey: activeObjectKey,
      sourceKey,
      mode
    });
    recordHistory();
    renderEffects();
    renderRail();
    renderTimeline();
    renderSelection();
    window.ASMTracePlayer?.previewTransition?.(currentIndex);
  }

  function setActiveObjectKey(key) {
    const hadActiveObject = Boolean(activeObjectKey);
    const previousTextObject = textObjectKey(activeObjectKey);
    activeObjectKey = key || '';
    if (previousTextObject !== textObjectKey(activeObjectKey)) textSelectionRange = null;
    activeTextStyleKeys = textSegmentForKey(activeObjectKey) ? [activeObjectKey] : [];
    if (activeObjectKey) inspectorMode = 'object';
    else if (hadActiveObject && inspectorMode === 'object') {
      inspectorMode = hasEventInspectorContent() ? 'events' : 'camera';
    }
    renderObjectStateEditor();
    renderTransitionEditor();
    renderStyleEditor();
    renderTextSelectionHighlight();
    renderInspectorNavigation();
  }

  function renderStyleEditor() {
    if (!styleEditor) return;
    const textSegment = textSegmentForKey(activeObjectKey);
    const isTextSegment = Boolean(textSegment);
    styleEditor.hidden = !activeObjectKey;
    if (!activeObjectKey) return;
    const variableId = bindingTargetVariableId(activeObjectKey);
    const variable = trace?.variables?.[variableId];
    if (variable) {
      if (targetVariable && targetVariable.value !== variableId) targetVariable.value = variableId;
      const indexMatch = String(activeObjectKey).match(/#([^:]+)/);
      if (targetIndex && document.activeElement !== targetIndex) targetIndex.value = indexMatch?.[1] || '';
    }
    if (objectColorFields) objectColorFields.hidden = isTextSegment;
    if (textStyleFields) textStyleFields.hidden = !isTextSegment;
    if (variableStyleFields) variableStyleFields.hidden = !variable || isTextSegment;
    const frameId = trace?.frames?.[currentIndex]?.id;
    const styleKey = isTextSegment && activeTextStyleKeys.length ? activeTextStyleKeys[0] : activeObjectKey;
    const stored = trace?.studio?.objectStyles?.[frameId]?.[styleKey] || {};
    const rendered = document.querySelector(`#arraySvg [data-trace-object-key="${CSS.escape(activeObjectKey)}"]`);
    if (isTextSegment) {
      const renderedText = rendered?.querySelector?.('.asm-trace-text-segment-value');
      const renderedBackground = rendered?.querySelector?.('.asm-trace-text-segment-background');
      const background = stored.background || renderedBackground?.getAttribute?.('fill') || 'none';
      if (textColor && document.activeElement !== textColor) {
        textColor.value = stored.textColor || renderedText?.getAttribute?.('fill') || '#111827';
      }
      if (textBackgroundEnabled) textBackgroundEnabled.checked = background !== 'none' && background !== 'rgba(0,0,0,0)';
      if (textBackgroundColor && document.activeElement !== textBackgroundColor && textBackgroundEnabled?.checked) {
        textBackgroundColor.value = background;
      }
      if (textFontSize && document.activeElement !== textFontSize) {
        textFontSize.value = String(Math.round(Number(stored.fontSize)
          || Number(renderedText?.getAttribute?.('font-size')) || 10));
      }
      if (textBold) textBold.classList.toggle('is-active', stored.bold === true
        || renderedText?.getAttribute?.('font-weight') === 'bold');
      if (textItalic) textItalic.classList.toggle('is-active', stored.italic === true
        || renderedText?.getAttribute?.('font-style') === 'italic');
      if (textUnderline) textUnderline.classList.toggle('is-active', stored.underline === true
        || String(renderedText?.getAttribute?.('text-decoration')).includes('underline'));
      if (textStrike) textStrike.classList.toggle('is-active', stored.strike === true
        || String(renderedText?.getAttribute?.('text-decoration')).includes('line-through'));
      if (textBackgroundEnabled) textBackgroundColor?.classList.toggle('is-active', textBackgroundEnabled.checked);
      if (textFontSizeButton) textFontSizeButton.title = `字體大小 ${textFontSize?.value || 10}px`;
      requestAnimationFrame(renderTextSelectionHighlight);
      return;
    }
    const fillNode = rendered?.matches?.('text')
      ? rendered
      : rendered?.querySelector?.('rect[fill]:not([fill="none"]), circle[fill]:not([fill="none"]), polygon[fill]:not([fill="none"]), text');
    const strokeNode = rendered?.matches?.('path, line, polyline, rect, circle, polygon')
      ? rendered
      : rendered?.querySelector?.('path[stroke]:not([stroke="none"]), line[stroke], polyline[stroke], rect[stroke]:not([stroke="none"]), circle[stroke]:not([stroke="none"])');
    if (objectFillColor && document.activeElement !== objectFillColor) {
      objectFillColor.value = stored.fill || fillNode?.getAttribute?.('fill') || '#ffffff';
    }
    if (objectStrokeColor && document.activeElement !== objectStrokeColor) {
      objectStrokeColor.value = stored.stroke || strokeNode?.getAttribute?.('stroke') || '#59656b';
    }
  }

  function writeObjectColors() {
    if (!trace || !activeObjectKey || !objectFillColor || !objectStrokeColor) return;
    frameIdsForScope().forEach(frameId => {
      const styleKey = objectStyleKeyForFrame(frameId);
      if (!styleKey) return;
      trace.studio.objectStyles[frameId] ||= {};
      trace.studio.objectStyles[frameId][styleKey] = {
        fill: objectFillColor.value,
        stroke: objectStrokeColor.value
      };
    });
    return true;
  }

  function previewStudioStyle(renderTextHighlight = false) {
    if (textStylePreviewFrame) return;
    textStylePreviewFrame = requestAnimationFrame(() => {
      textStylePreviewFrame = 0;
      renderPlayerFrame(currentIndex, { animateEvents: false, animatePositions: false });
      renderSelection();
      scheduleThumbnailSync();
      if (renderTextHighlight) requestAnimationFrame(renderTextSelectionHighlight);
    });
  }

  function previewObjectColors() {
    if (!writeObjectColors()) return;
    previewStudioStyle();
  }

  function saveObjectColors() {
    if (!writeObjectColors()) return;
    commitStudio();
  }

  function writeTextSegmentStyle() {
    if (!trace || !textSegmentForKey(activeObjectKey) || !textColor || !textFontSize) return;
    const keys = activeTextStyleKeys.length ? activeTextStyleKeys : [activeObjectKey];
    frameIdsForScope().forEach(frameId => {
      trace.studio.objectStyles[frameId] ||= {};
      keys.forEach(key => {
        trace.studio.objectStyles[frameId][key] = {
          ...(trace.studio.objectStyles[frameId][key] || {}),
          textColor: textColor.value,
          background: textBackgroundEnabled?.checked ? textBackgroundColor.value : 'none',
          fontSize: Math.max(8, Math.min(72, Number(textFontSize.value) || 10)),
          bold: textBold?.classList.contains('is-active') === true,
          italic: textItalic?.classList.contains('is-active') === true,
          underline: textUnderline?.classList.contains('is-active') === true,
          strike: textStrike?.classList.contains('is-active') === true
        };
      });
    });
    return true;
  }

  function previewTextSegmentStyle() {
    if (!writeTextSegmentStyle()) return;
    previewStudioStyle(true);
  }

  function saveTextSegmentStyle() {
    if (!writeTextSegmentStyle()) return;
    commitStudio();
    requestAnimationFrame(renderTextSelectionHighlight);
  }

  function setObjectVisibility(state) {
    if (!trace || !activeObjectKey) return;
    frameIdsForScope().forEach(frameId => {
      trace.studio.visibility[frameId] ||= {};
      if (state === 'hidden') trace.studio.visibility[frameId][activeObjectKey] = 'hidden';
      else {
        delete trace.studio.visibility[frameId][activeObjectKey];
        if (!Object.keys(trace.studio.visibility[frameId]).length) delete trace.studio.visibility[frameId];
      }
    });
    recordHistory();
    renderPlayerFrame(currentIndex, { animatePositions: false });
    renderRail();
    renderSelection();
    renderObjectStateEditor();
  }

  function bindingTargetVariableId(targetKey) {
    return String(targetKey || '').split('#')[0].split(':label')[0].split(':index')[0];
  }

  function canUseValueBinding(sourceKey, targetKey) {
    const source = trace?.variables?.[sourceKey];
    const target = trace?.variables?.[bindingTargetVariableId(targetKey)];
    const collections = new Set(['sequence', 'matrix', 'stack', 'queue', 'set', 'map']);
    return Boolean(source && target && !collections.has(source.kind) && collections.has(target.kind));
  }

  function fullBindingExpression(binding, targetKey) {
    if (binding?.targetExpression != null) return String(binding.targetExpression);
    const targetName = variableName(bindingTargetVariableId(targetKey));
    const indexExpression = String(binding?.indexExpression || '').trim();
    return binding?.mode === 'value' && indexExpression
      ? `${targetName}[${indexExpression}]`
      : targetName;
  }

  function parseBindingExpression(sourceKey, value, fallbackTargetKey = '') {
    const expression = String(value || '').trim();
    if (!expression) return null;
    const match = expression.match(/^([A-Za-z_$][\w$]*)\s*(?:\[\s*(.*?)\s*\])?$/);
    if (!match) return null;
    const targetEntry = variables().find(([id, variable]) => id === match[1] || variable.name === match[1]);
    const targetKey = targetEntry?.[0] || bindingTargetVariableId(fallbackTargetKey);
    if (!targetKey || !trace?.variables?.[targetKey] || targetKey === sourceKey) return null;
    const indexExpression = String(match[2] || '').trim();
    return {
      targetKey,
      targetExpression: indexExpression ? `${variableName(targetKey)}[${indexExpression}]` : variableName(targetKey),
      indexExpression,
      mode: indexExpression && canUseValueBinding(sourceKey, targetKey) ? 'value' : 'relative'
    };
  }

  function removeTrackingForBinding(sourceKey, targetKey) {
    const targetId = bindingTargetVariableId(targetKey);
    trace.studio.objects = trace.studio.objects.filter(object => !(
      object.type === 'variable-marker'
      && object.sourceVariableId === sourceKey
      && object.target?.variableId === targetId
    ));
  }

  function markerObjectId(sourceKey, targetKey) {
    const targetId = bindingTargetVariableId(targetKey);
    return `tracking-${`${sourceKey}:${targetId}:marker`.replace(/[^A-Za-z0-9_-]/g, '-')}`;
  }

  function activeValueBinding() {
    if (!activeBinding || !trace) return null;
    const frameId = trace.frames[currentIndex]?.id;
    const binding = frameBinding(frameId, activeBinding.sourceKey) || activeBinding.binding;
    const targetKey = binding?.targetKey || activeBinding.targetKey;
    if (!binding || !targetKey || !canUseValueBinding(activeBinding.sourceKey, targetKey)) return null;
    return { binding, sourceKey: activeBinding.sourceKey, targetKey };
  }

  function renderMarkerShapeEditor() {
    if (!markerShapeEditor) return;
    const active = activeValueBinding();
    const visible = Boolean(active);
    markerShapeEditor.hidden = !visible;
    markerShapeEmpty.hidden = Boolean(visible);
    markerShapeCard.hidden = !visible;
    if (!visible) return;
    const shape = active.binding.markerShape || 'array';
    markerShapeButtons.querySelectorAll('button').forEach(button => {
      button.classList.toggle('is-active', button.dataset.markerShape === shape);
    });
  }

  function renderBindingEditor() {
    if (!bindingEditor) return;
    const binding = activeBinding
      ? frameBinding(trace?.frames?.[currentIndex]?.id, activeBinding.sourceKey) || activeBinding.binding
      : null;
    const sourceKey = activeBinding?.sourceKey;
    const targetKey = binding?.targetKey || activeBinding?.targetKey;
    bindingEditor.hidden = !sourceKey;
    if (!sourceKey) {
      bindingEmpty.hidden = false;
      bindingCard.hidden = true;
      renderMarkerShapeEditor();
      return;
    }
    const sourceName = variableName(sourceKey);
    const targetExpression = binding && targetKey ? fullBindingExpression(binding, targetKey) : '';
    bindingEmpty.hidden = true;
    bindingCard.hidden = false;
    bindingRelation.textContent = targetExpression ? `${sourceName} → ${targetExpression}` : sourceName;
    if (document.activeElement !== bindingIndexExpression) bindingIndexExpression.value = targetExpression;
    renderMarkerShapeEditor();
  }

  function setActiveBindingForKey(key) {
    if (!trace || !key) {
      activeBinding = null;
      renderBindingEditor();
      return;
    }
    const binding = frameBinding(trace.frames[currentIndex]?.id, key);
    if (binding) {
      activeBinding = { sourceKey: key, targetKey: binding.targetKey, binding };
      renderBindingEditor();
      return;
    }
    if (key.startsWith('studio:')) {
      const object = trace.studio.objects.find(item => `studio:${item.id}` === key);
      if (object?.sourceVariableId && object.target?.variableId) {
        const sourceBinding = frameBinding(trace.frames[currentIndex]?.id, object.sourceVariableId);
        activeBinding = {
          sourceKey: object.sourceVariableId,
          targetKey: sourceBinding?.targetKey || object.target.variableId,
          binding: sourceBinding
            ? { ...sourceBinding, mode: sourceBinding.mode || 'value' }
            : {
                targetKey: object.target.variableId,
                mode: 'value',
                indexExpression: object.target.indexExpression || variableName(object.sourceVariableId),
                targetExpression: `${variableName(object.target.variableId)}[${object.target.indexExpression || variableName(object.sourceVariableId)}]`,
                markerShape: object.shape || 'array'
              }
        };
        renderBindingEditor();
        return;
      }
    }
    if (trace.variables?.[key]) {
      activeBinding = { sourceKey: key, targetKey: '', binding: null };
      renderBindingEditor();
      return;
    }
    activeBinding = null;
    renderBindingEditor();
  }

  function setBindingMode(mode) {
    if (!activeBinding || !trace) return;
    const { sourceKey } = activeBinding;
    const targetKey = activeBinding.targetKey || activeBinding.binding?.targetKey;
    if (mode === 'value' && !canUseValueBinding(sourceKey, targetKey)) return;
    frameIdsForScope().forEach(frameId => {
      const binding = frameBinding(frameId, sourceKey) || activeBinding.binding || {};
      trace.studio.bindings[frameId] ||= {};
      trace.studio.bindings[frameId][sourceKey] = {
        ...binding,
        targetKey: binding.targetKey || targetKey,
        sourceAnchor: binding.sourceAnchor || 'top',
        targetAnchor: binding.targetAnchor || 'center',
        mode,
        indexExpression: binding.indexExpression || variableName(sourceKey),
        markerShape: binding.markerShape || 'array'
      };
    });
    if (mode === 'value') {
      const expression = activeBinding.binding?.indexExpression || variableName(sourceKey);
      const shape = activeBinding.binding?.markerShape || 'array';
      syncTrackingFromBinding(sourceKey, targetKey, expression, shape);
    }
    else removeTrackingForBinding(sourceKey, targetKey);
    activeBinding.binding = {
      ...(activeBinding.binding || {}),
      targetKey,
      mode,
      indexExpression: activeBinding.binding?.indexExpression || variableName(sourceKey),
      markerShape: activeBinding.binding?.markerShape || 'array'
    };
    refreshAfterPositionChange();
    renderEffects();
    renderBindingEditor();
  }

  function setBindingIndexExpression() {
    if (!activeBinding || !trace) return;
    const sourceKey = activeBinding.sourceKey;
    const parsed = parseBindingExpression(sourceKey, bindingIndexExpression.value, activeBinding.targetKey);
    if (!parsed) return;
    const previous = activeBinding.binding || {};
    frameIdsForScope().forEach(frameId => {
      const binding = frameBinding(frameId, sourceKey) || previous;
      trace.studio.bindings[frameId] ||= {};
      trace.studio.bindings[frameId][sourceKey] = {
        ...binding,
        targetKey: parsed.targetKey,
        sourceAnchor: binding.sourceAnchor || 'top',
        targetAnchor: binding.targetAnchor || 'center',
        mode: parsed.mode,
        targetExpression: parsed.targetExpression,
        indexExpression: parsed.indexExpression,
        markerShape: binding.markerShape || 'array'
      };
    });
    activeBinding.targetKey = parsed.targetKey;
    activeBinding.binding = {
      ...previous,
      ...parsed,
      sourceAnchor: previous.sourceAnchor || 'top',
      targetAnchor: previous.targetAnchor || 'center',
      markerShape: previous.markerShape || 'array'
    };
    if (parsed.mode === 'value' || activeBinding.binding.markerShape === 'arrow') {
      syncTrackingFromBinding(sourceKey, parsed.targetKey, parsed.indexExpression, activeBinding.binding.markerShape);
    } else {
      removeTrackingForBinding(sourceKey, parsed.targetKey);
    }
    refreshAfterPositionChange();
    renderEffects();
    renderBindingEditor();
  }

  function setMarkerShape(shape) {
    const active = activeValueBinding();
    if (!active || !['array', 'arrow'].includes(shape)) return;
    const expression = String(active.binding.indexExpression || '').trim();
    frameIdsForScope().forEach(frameId => {
      const binding = frameBinding(frameId, active.sourceKey) || active.binding;
      trace.studio.bindings[frameId] ||= {};
      trace.studio.bindings[frameId][active.sourceKey] = {
        ...binding,
        targetKey: binding.targetKey || active.targetKey,
        sourceAnchor: binding.sourceAnchor || 'top',
        targetAnchor: binding.targetAnchor || 'center',
        mode: binding.mode || active.binding.mode || 'relative',
        targetExpression: binding.targetExpression || active.binding.targetExpression,
        indexExpression: binding.indexExpression || expression,
        markerShape: shape
      };
    });
    activeBinding.binding = { ...active.binding, markerShape: shape };
    if (active.binding.mode === 'value' || shape === 'arrow') {
      syncTrackingFromBinding(active.sourceKey, active.targetKey, expression, shape);
    } else {
      removeTrackingForBinding(active.sourceKey, active.targetKey);
    }
    refreshAfterPositionChange();
    renderEffects();
    renderBindingEditor();
  }

  function syncTrackingFromBinding(sourceKey, targetKey, indexExpression = '', markerShape = 'array') {
    const source = trace?.variables?.[sourceKey];
    const targetId = bindingTargetVariableId(targetKey);
    const target = trace?.variables?.[targetId];
    const collections = new Set(['sequence', 'matrix', 'stack', 'queue', 'set', 'map']);
    if (!source || !target || collections.has(source.kind) || !collections.has(target.kind)) return;
    const sourceName = source.name || sourceKey;
    const id = markerObjectId(sourceKey, targetKey);
    const expression = String(indexExpression ?? '').trim();
    const marker = {
      id,
      type: 'variable-marker',
      sourceVariableId: sourceKey,
      hideSource: true,
      target: {
        variableId: targetId,
        indexExpression: expression,
        anchor: 'top',
        indexLabel: true
      },
      text: sourceName,
      shape: markerShape || 'array',
      color: '#12a6df',
      stroke: '#0b7ead',
      frameIds: frameIdsForScope(),
      condition: activeCondition(),
      offsetX: 0,
      offsetY: 0
    };
    if (target.kind === 'matrix') marker.target.axis = sourceName.toLowerCase() === 'j' ? 'column' : 'row';
    const index = trace.studio.objects.findIndex(item => item.id === id);
    if (index >= 0) trace.studio.objects[index] = marker;
    else trace.studio.objects.push(marker);
    suppressAutoSave = true;
    if (trackingSource) trackingSource.value = sourceKey;
    if (trackingTarget) trackingTarget.value = targetId;
    if (trackingEffect) trackingEffect.value = 'marker';
    if (trackingIndexExpression) trackingIndexExpression.value = expression;
    if (trackingText) trackingText.value = sourceName;
    if (trackingAnchor) trackingAnchor.value = 'top';
    suppressAutoSave = false;
  }

  function refreshAfterPositionChange() {
    recordHistory();
    renderPlayerFrame(currentIndex, { animatePositions: false });
    renderRail();
    renderSelection();
  }

  function bindPosition(sourceKey, sourceAnchor, targetKey, targetAnchor) {
    if (!trace || !sourceKey || !targetKey || sourceKey === targetKey) return false;
    if (textDescriptorForKey(sourceKey)) return bindSemanticText(sourceKey, targetKey, targetAnchor);
    const sourcePoint = sourceAnchor || 'top';
    const targetPoint = targetAnchor || 'center';
    const targetId = bindingTargetVariableId(targetKey);
    const targetIndexMatch = String(targetKey).match(/#([^:]+)/);
    const indexExpression = targetIndexMatch?.[1] || '';
    const mode = indexExpression && canUseValueBinding(sourceKey, targetId) ? 'value' : 'relative';
    const storedTargetKey = mode === 'value' ? targetId : targetKey;
    const targetExpression = indexExpression
      ? `${variableName(targetId)}[${indexExpression}]`
      : variableName(targetId);
    const markerShape = 'array';
    const frameIds = frameIdsForScope();
    const frameAnchors = new Map();
    frameIds.forEach(frameId => {
      const index = trace.frames.findIndex(frame => frame.id === frameId);
      const frame = trace.frames[index];
      if (!frame) return;
      const previousFrame = index > 0 ? trace.frames[index - 1] : null;
      const source = window.ASMTraceRenderers?.frameAnchorForKey?.(
        trace, frame, sourceKey, sourcePoint, previousFrame
      );
      const target = window.ASMTraceRenderers?.frameAnchorForKey?.(
        trace, frame, targetKey, targetPoint, previousFrame
      );
      if (source && target) frameAnchors.set(frameId, { source, target });
    });
    if (!frameAnchors.size) return false;
    frameAnchors.forEach(({ source, target }, frameId) => {
      trace.studio.bindings[frameId] ||= {};
      trace.studio.bindings[frameId][sourceKey] = {
        targetKey: storedTargetKey,
        sourceAnchor: sourcePoint,
        targetAnchor: targetPoint,
        mode,
        targetExpression,
        indexExpression,
        markerShape,
        dx: source.x - target.x,
        dy: source.y - target.y
      };
    });
    activeBinding = {
      sourceKey,
      targetKey: storedTargetKey,
      binding: {
        targetKey: storedTargetKey,
        sourceAnchor: sourcePoint,
        targetAnchor: targetPoint,
        mode,
        targetExpression,
        indexExpression,
        markerShape
      }
    };
    if (mode === 'value') syncTrackingFromBinding(sourceKey, storedTargetKey, indexExpression, markerShape);
    refreshAfterPositionChange();
    renderBindingEditor();
    return true;
  }

  function unbindPosition(sourceKey) {
    if (!trace || !sourceKey) return false;
    const textDescriptor = textDescriptorForKey(sourceKey);
    if (textDescriptor?.binding) {
      trace.frames.forEach(frame => {
        (frame.texts || []).forEach(text => {
          if (Number(text.line) === Number(textDescriptor.line) && String(text.id) === String(textDescriptor.id)) {
            text.binding = null;
          }
        });
      });
      window.asmUpdateTextDirectiveBinding?.(textDirectiveLine(textDescriptor), null);
      activeBinding = null;
      recordHistory();
      renderPlayerFrame(currentIndex, { animatePositions: false });
      renderRail();
      renderSelection();
      renderBindingEditor();
      return true;
    }
    const currentPlacement = window.ASMTraceRenderers?.currentPlacement?.(sourceKey, false);
    const sourceElement = document.querySelector(`#arraySvg [data-trace-object-key="${CSS.escape(sourceKey)}"]`);
    let absolutePosition = currentPlacement;
    if (currentPlacement && sourceElement?.dataset.tracePositionSpace === 'origin') {
      try {
        const box = sourceElement.getBBox();
        absolutePosition = { x: currentPlacement.x - box.x, y: currentPlacement.y - box.y };
      } catch {}
    }
    let changed = false;
    frameIdsForScope().forEach(frameId => {
      const bindings = trace.studio.bindings[frameId];
      if (!bindings?.[sourceKey]) return;
      delete bindings[sourceKey];
      if (!Object.keys(bindings).length) delete trace.studio.bindings[frameId];
      trace.studio.positions[frameId] ||= {};
      if (absolutePosition) {
        trace.studio.positions[frameId][sourceKey] = {
          x: absolutePosition.x,
          y: absolutePosition.y,
          absolute: true
        };
      }
      changed = true;
    });
    if (changed) refreshAfterPositionChange();
    if (activeBinding?.sourceKey === sourceKey) {
      activeBinding = null;
      renderBindingEditor();
    }
    return changed;
  }

  function activeCondition() {
    return null;
  }

  function cameraRuleForFrame(frame) {
    return window.ASMTraceCamera.ruleForFrame(trace, frame);
  }

  function replaceCameraRuleForScope(rule) {
    const targetFrameIds = new Set(rule.frameIds || []);
    trace.studio.cameraRules = trace.studio.cameraRules.flatMap(existing => {
      if (existing.id === rule.id) return [];
      const existingFrameIds = Array.isArray(existing.frameIds) && existing.frameIds.length
        ? existing.frameIds
        : trace.frames.map(frame => frame.id);
      const remainingFrameIds = existingFrameIds.filter(frameId => !targetFrameIds.has(frameId));
      return remainingFrameIds.length ? [{ ...existing, frameIds: remainingFrameIds }] : [];
    });
    trace.studio.cameraRules.push(rule);
  }

  function sameCameraFrameScope(rule, frameIds) {
    const allFrameIds = trace.frames.map(frame => frame.id);
    const existingIds = Array.isArray(rule?.frameIds) && rule.frameIds.length
      ? rule.frameIds
      : allFrameIds;
    const requested = new Set(frameIds || []);
    return existingIds.length === requested.size
      && existingIds.every(frameId => requested.has(frameId));
  }

  function syncCameraFrameToAutoTarget(target) {
    if (!cameraFrameState?.autoCapture || !target) return;
    cameraFrameState.centerX = target.centerX;
    cameraFrameState.centerY = target.centerY;
    cameraFrameState.width = target.width;
    cameraFrameState.height = target.height;
    cameraFrameState.aspect = target.aspect;
    cameraFrameState.zoom = target.scale;
    cameraFrameState.snapped = null;
    renderCameraFrame();
  }

  function applyCameraForFrame(index, animate = false, delay = 0, previousFrame = null) {
    clearTimeout(cameraTimer);
    const frame = trace?.frames?.[index];
    if (!frame) return;
    cameraTimer = setTimeout(() => {
      if (trace?.frames?.[currentIndex]?.id !== frame.id) return;
      const target = window.ASMTraceCamera.apply(trace, frame, previousFrame, animate);
      syncCameraFrameToAutoTarget(target);
    }, delay);
  }

  function eventColorFor(event) {
    return window.ASMTraceEvents?.color?.(event.type)
      || DEFAULT_EVENT_COLORS[event.type]
      || '#65737a';
  }

  function eventDots(frame) {
    const dots = el('span', 'trace-studio-event-dots');
    const ordered = window.ASMTraceEvents?.ordered?.(frame.events || []) || frame.events || [];
    const visible = ordered.filter(event => (
      event.enabled !== false
      && window.ASMTraceEvents?.showTag(event.type, trace) !== false
    ));
    const uniqueEvents = new Map();
    visible.forEach(event => {
      const key = event.signature || event.type;
      const existing = uniqueEvents.get(key);
      // When equivalent events share a tag, keep an active one in preference to
      // an automatically disabled one.
      if (!existing || (existing.autoAnimationDisabled === true && event.autoAnimationDisabled !== true)) {
        uniqueEvents.set(key, event);
      }
    });
    const events = [...uniqueEvents.values()];
    events.forEach(event => {
      const dot = el('i', 'trace-studio-event-dot');
      dot.style.background = eventColorFor(event);
      const label = EVENT_LABELS[event.type] || event.type;
      const autoDisabled = event.autoAnimationDisabled === true;
      dot.title = label;
      dot.classList.toggle('is-disabled', autoDisabled);
      dots.append(dot);
    });
    return dots;
  }

  function eventSummary(event) {
    const targets = event?.targets || [];
    const expression = target => target?.expression
      || (target?.variableId && target?.indexExpression
        ? `${variableName(target.variableId)}[${target.indexExpression}]`
        : variableName(target?.variableId));
    if (event?.type === 'compare') {
      return `${expression(targets[0])} ${event.operation || '?'} ${expression(targets[1])}`.trim();
    }
    if (event?.type === 'swap') return `${expression(targets[0])} ↔ ${expression(targets[1])}`.trim();
    if (event?.type === 'assign') {
      if (event.expression) return String(event.expression).trim();
      return `${expression(targets.find(target => target.role === 'target') || targets[0])} = ${expression(targets.find(target => target.role === 'source') || targets[1])}`.trim();
    }
    if (event?.type === 'write') {
      const target = expression(targets[0]);
      const operation = String(event.operation || '').trim();
      const compactTarget = String(target || '').replace(/\s+/g, '');
      const compactOperation = operation.replace(/\s+/g, '');
      if (operation && compactTarget && compactOperation.includes(compactTarget)) return operation;
      return `${target} ${operation}`.trim();
    }
    if (event?.type === 'fixed') return targets.map(expression).filter(Boolean).join('、');
    if (event?.type === 'condition') return event.conditionKind || '條件判斷';
    if (event?.type === 'call') return event.expression || event.callee || '';
    if (event?.type === 'function-enter' || event?.type === 'function-exit') return event.function || '';
    return expression(targets[0]) || event?.expression || '';
  }

  function setInstructionEventEnabled(event, enabled) {
    if (!trace || !event) return;
    const key = window.ASMTraceEvents?.instructionKey?.(event) || event.signature || event.type;
    const canonical = window.ASMTraceEvents?.canonicalInstructionKey;
    if (canonical) {
      Object.keys(trace.studio.eventInstructionStates).forEach(savedKey => {
        if (savedKey !== key && canonical(savedKey) === key) {
          delete trace.studio.eventInstructionStates[savedKey];
        }
      });
    }
    trace.studio.eventInstructionStates[key] = Boolean(enabled);
    window.ASMTraceEvents?.applyEnabledStates?.(trace);
    recordHistory();
    renderFrameEventsEditor();
    renderRail();
    renderTimeline();
    renderPlayerFrame(currentIndex, { animateEvents: false, animatePositions: false });
  }

  function setFrameFixedEnabled(frame, event, index, enabled) {
    if (!trace || !frame || !event) return;
    ensureStudioData();
    const key = window.ASMTraceEvents?.eventKey?.(frame.events || [], index)
      || event.signature || event.id;
    trace.studio.eventStates[frame.id] ||= {};
    trace.studio.eventStates[frame.id][key] = Boolean(enabled);
    window.ASMTraceEvents?.applyEnabledStates?.(trace);
    recordHistory();
    renderFrameEventsEditor();
    renderRail();
    renderTimeline();
    renderPlayerFrame(currentIndex, { animateEvents: false, animatePositions: false });
  }

  function setEventGap(value, save = true) {
    if (!trace) return;
    ensureStudioData();
    const gapMs = Math.max(0, Math.min(2000, Number(value) || 0));
    trace.studio.eventSettings.gapMs = gapMs;
    if (eventGapRange) {
      eventGapRange.value = String(gapMs);
      eventGapRange.title = `間隔時間 ${gapMs} ms`;
    }
    if (eventGapValue) eventGapValue.textContent = `${gapMs} ms`;
    if (!save) return;
    window.dispatchEvent(new CustomEvent('asm:trace-event-settings-changed', {
      detail: { document: trace }
    }));
  }

  function renderFrameEventsEditor() {
    if (!frameEventsEditor || !frameEventsList || !frameFixedEditor || !frameFixedList) return;
    const frame = trace?.frames?.[currentIndex];
    const events = frame?.events || [];
    const inspectorEvents = inspectorEventsForFrame(frame);
    frameEventsEditor.hidden = false;
    frameEventsList.replaceChildren();
    frameFixedList.replaceChildren();
    if (!inspectorEvents.length) {
      frameEventsList.append(el('div', 'trace-studio-empty', '本幀沒有事件'));
    }
    inspectorEvents.forEach(({ event, index }, orderedIndex) => {
      const row = el('div', 'trace-studio-frame-event');
      const autoDisabled = event.autoAnimationDisabled === true;
      const control = window.ASMTraceEvents?.controlState?.(event)
        || { checked: event.enabled !== false, available: !autoDisabled };
      const availability = window.ASMTraceEvents?.availabilityKind?.(event)
        || (autoDisabled ? 'missing-target' : 'available');
      row.classList.toggle('is-disabled', !control.checked);
      row.classList.toggle('is-unavailable', !control.available);
      row.classList.toggle('is-missing-target', availability === 'missing-target');
      row.classList.toggle('is-unrenderable', availability === 'unrenderable');
      const sequence = el('span', 'trace-studio-frame-event-order', String(orderedIndex + 1));
      sequence.title = `第 ${orderedIndex + 1} 個事件`;
      const swatch = el('i', 'trace-studio-frame-event-swatch');
      swatch.style.background = eventColorFor(event);
      const copy = el('span', 'trace-studio-frame-event-copy');
      copy.append(el('strong', '', EVENT_LABELS[event.type] || event.type));
      const summary = eventSummary(event);
      if (summary) copy.append(el('small', '', summary));
      const toggle = el('label', 'trace-studio-event-switch');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = control.checked;
      input.setAttribute('aria-label', `${EVENT_LABELS[event.type] || event.type}事件`);
      input.title = input.checked
        ? '關閉此指令的所有事件動畫'
        : '開啟此指令的所有事件動畫';
      input.addEventListener('change', () => setInstructionEventEnabled(event, input.checked));
      toggle.append(input, el('span'));
      row.append(sequence, swatch, copy, toggle);
      frameEventsList.append(row);
    });
    const fixedEvents = fixedEventsForFrame(frame);
    if (!fixedEvents.length) {
      frameFixedList.append(el('div', 'trace-studio-empty', '本幀沒有新增固定格子'));
    }
    fixedEvents.forEach(({ event, index }) => {
      const row = el('div', 'trace-studio-fixed-batch');
      row.classList.toggle('is-disabled', event.enabled === false);
      const icon = el('span', 'trace-studio-fixed-batch-icon', '✓');
      const copy = el('span', 'trace-studio-frame-event-copy');
      copy.append(el('strong', '', '完成格子'));
      const summary = eventSummary(event);
      if (summary) copy.append(el('small', '', summary));
      const toggle = el('label', 'trace-studio-event-switch');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = event.enabled !== false;
      input.setAttribute('aria-label', '本幀自動固定格子');
      input.title = input.checked ? '隱藏本幀固定標記' : '顯示本幀固定標記';
      input.addEventListener('change', () => setFrameFixedEnabled(frame, event, index, input.checked));
      toggle.append(input, el('span'));
      row.append(icon, copy, toggle);
      frameFixedList.append(row);
    });
    renderInspectorNavigation();
  }

  function inspectorEventsForFrame(frame = trace?.frames?.[currentIndex]) {
    const events = frame?.events || [];
    const ordered = window.ASMTraceEvents?.orderedEntries?.(events)
      || events.map((event, index) => ({ event, index }));
    return ordered
      .filter(({ event }) => window.ASMTraceEvents?.showInspector?.(event, trace) !== false)
      .filter(({ event }) => window.ASMTraceEvents?.showTag?.(event.type, trace) !== false);
  }

  function fixedEventsForFrame(frame = trace?.frames?.[currentIndex]) {
    const events = frame?.events || [];
    const ordered = window.ASMTraceEvents?.orderedEntries?.(events)
      || events.map((event, index) => ({ event, index }));
    return ordered.filter(({ event }) => event.type === 'fixed');
  }

  function hasEventInspectorContent(frame = trace?.frames?.[currentIndex]) {
    return inspectorEventsForFrame(frame).length > 0 || fixedEventsForFrame(frame).length > 0;
  }

  function setInspectorMode(mode) {
    if (mode === 'object' && !activeObjectKey) return;
    inspectorMode = mode;
    renderInspectorNavigation();
  }

  function renderInspectorNavigation() {
    if (!inspectorToolbar) return;
    const eventCount = inspectorEventsForFrame().length;
    if (inspectorMode === 'object' && !activeObjectKey) {
      inspectorMode = hasEventInspectorContent() ? 'events' : 'camera';
    }
    inspectorEventButton.disabled = false;
    inspectorEventCount.textContent = String(eventCount);
    inspectorEventCount.hidden = !eventCount;
    inspectorObjectButton.hidden = !activeObjectKey;
    inspectorToolbar.classList.toggle('has-object', Boolean(activeObjectKey));
    [
      [inspectorEventButton, 'events'],
      [inspectorCameraButton, 'camera'],
      [inspectorObjectButton, 'object']
    ].forEach(([button, mode]) => {
      const active = inspectorMode === mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    inspectorEventsPanel.hidden = inspectorMode !== 'events';
    inspectorCameraPanel.hidden = inspectorMode !== 'camera';
    inspectorObjectPanel.hidden = inspectorMode !== 'object' || !activeObjectKey;
  }

  function selectFrame(index, event = {}) {
    const next = Math.max(0, Math.min(trace.frames.length - 1, Number(index) || 0));
    if (event.shiftKey) {
      selectedFrames.clear();
      const start = Math.min(selectionAnchor, next);
      const end = Math.max(selectionAnchor, next);
      for (let cursor = start; cursor <= end; cursor += 1) selectedFrames.add(trace.frames[cursor].id);
    } else if (event.ctrlKey || event.metaKey) {
      const id = trace.frames[next].id;
      if (selectedFrames.has(id) && selectedFrames.size > 1) selectedFrames.delete(id);
      else selectedFrames.add(id);
      selectionAnchor = next;
    } else {
      selectedFrames = new Set([trace.frames[next].id]);
      selectionAnchor = next;
    }
    currentIndex = next;
    if (!activeObjectKey && inspectorMode === 'object') {
      inspectorMode = hasEventInspectorContent(trace.frames[next]) ? 'events' : 'camera';
    }
    renderPlayerFrame(next);
    renderSelection();
  }

  function cancelThumbnailRendering() {
    if (thumbnailRenderFrame) {
      if (thumbnailRenderMode === 'idle' && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(thumbnailRenderFrame);
      } else {
        cancelAnimationFrame(thumbnailRenderFrame);
      }
    }
    thumbnailRenderFrame = 0;
    thumbnailRenderMode = '';
    pendingThumbnails = [];
  }

  function cancelThumbnailCulling() {
    if (thumbnailCullFrame) cancelAnimationFrame(thumbnailCullFrame);
    thumbnailCullFrame = 0;
  }

  function thumbnailWithinViewport(itemTop, itemBottom, viewportTop, viewportBottom, overscan = 0) {
    return itemBottom >= viewportTop - overscan && itemTop <= viewportBottom + overscan;
  }

  function thumbnailPriority(itemTop, itemBottom, viewportTop, viewportBottom, overscan, isCurrent = false) {
    if (thumbnailWithinViewport(itemTop, itemBottom, viewportTop, viewportBottom, 0)) {
      return isCurrent ? 'current' : 'visible';
    }
    if (thumbnailWithinViewport(itemTop, itemBottom, viewportTop, viewportBottom, overscan)) {
      return isCurrent ? 'current' : 'buffer';
    }
    return '';
  }

  function clearThumbnailCache() {
    thumbnailCache.clear();
  }

  function cacheThumbnail(frameId, preview) {
    if (!frameId || !preview) return;
    thumbnailCache.delete(frameId);
    thumbnailCache.set(frameId, preview);
    while (thumbnailCache.size > THUMBNAIL_CACHE_LIMIT) {
      thumbnailCache.delete(thumbnailCache.keys().next().value);
    }
  }

  function takeCachedThumbnail(frameId) {
    const preview = thumbnailCache.get(frameId) || null;
    if (preview) thumbnailCache.delete(frameId);
    return preview;
  }

  function thumbnailPlaceholder() {
    const preview = el('span', 'trace-studio-frame-preview');
    preview.setAttribute('aria-label', '縮圖載入中');
    preview.setAttribute('aria-busy', 'true');
    return preview;
  }

  function shouldRenderThumbnail(button, list) {
    const itemRect = button.getBoundingClientRect();
    const viewportRect = list.getBoundingClientRect();
    const overscan = Math.min(180, Math.max(0, button.offsetHeight || 160));
    return Boolean(thumbnailPriority(
      itemRect.top,
      itemRect.bottom,
      viewportRect.top,
      viewportRect.bottom,
      overscan,
      Number(button.dataset.frameIndex) === currentIndex
    ));
  }

  function installThumbnail(preview, placeholder, frame, fromCache = false) {
    preview.dataset.thumbnailRendered = 'true';
    if (fromCache) preview.dataset.thumbnailCacheHit = 'true';
    else delete preview.dataset.thumbnailCacheHit;
    placeholder.replaceWith(preview);
    window.ASMTraceRenderers?.refreshThumbnailCamera?.(preview, trace, frame);
    if (cameraFrameState && selectedFrames.has(frame.id)) {
      window.ASMTraceRenderers.showMainCameraFrameInThumbnail?.(preview, cameraFrameState);
    }
  }

  function renderThumbnailJob(job) {
    const { frame, index, placeholder, button } = job || {};
    const list = typeof rail?.querySelector === 'function'
      ? rail.querySelector('.trace-studio-frame-list')
      : null;
    if (!frame || !placeholder?.isConnected || (button && list && !shouldRenderThumbnail(button, list))) {
      return false;
    }
    const preview = window.ASMTraceRenderers.createThumbnail(trace, frame, trace.frames[index - 1] || null);
    installThumbnail(preview, placeholder, frame, false);
    return true;
  }

  function refreshThumbnailCulling() {
    thumbnailCullFrame = 0;
    if (!rail || !trace || !document.body.classList.contains('asm-trace-studio-open')) return;
    const list = rail.querySelector('.trace-studio-frame-list');
    if (!list) return;
    cancelThumbnailRendering();
    const viewportRect = list.getBoundingClientRect();
    const viewportCenter = (viewportRect.top + viewportRect.bottom) / 2;
    const jobs = [];
    list.querySelectorAll('.trace-studio-frame').forEach((button, index) => {
      const preview = button.querySelector('.trace-studio-frame-preview');
      if (!preview) return;
      const itemRect = button.getBoundingClientRect();
      const overscan = Math.min(180, Math.max(0, button.offsetHeight || 160));
      const frameIndex = Number(button.dataset.frameIndex);
      const frame = trace.frames[frameIndex];
      const priority = thumbnailPriority(
        itemRect.top,
        itemRect.bottom,
        viewportRect.top,
        viewportRect.bottom,
        overscan,
        frameIndex === currentIndex
      );
      if (!priority) {
        if (preview.dataset.thumbnailRendered === 'true') {
          cacheThumbnail(button.dataset.frameId, preview);
          preview.replaceWith(thumbnailPlaceholder());
        }
        return;
      }
      if (preview.dataset.thumbnailRendered === 'true') return;
      if (!frame) return;
      const cached = takeCachedThumbnail(frame.id);
      if (cached) {
        installThumbnail(cached, preview, frame, true);
        return;
      }
      jobs.push({
        frame,
        index: frameIndex,
        placeholder: preview,
        button,
        priority,
        distance: Math.abs(((itemRect.top + itemRect.bottom) / 2) - viewportCenter)
      });
    });
    const priorityRank = { current: 0, visible: 1, buffer: 2 };
    jobs.sort((left, right) => priorityRank[left.priority] - priorityRank[right.priority]
      || left.distance - right.distance || left.index - right.index);
    if (jobs[0]?.priority === 'current') renderThumbnailJob(jobs.shift());
    pendingThumbnails = jobs;
    scheduleThumbnailRendering();
  }

  function scheduleThumbnailCulling() {
    if (thumbnailCullFrame) return;
    thumbnailCullFrame = requestAnimationFrame(refreshThumbnailCulling);
  }

  function scheduleThumbnailRendering() {
    if (thumbnailRenderFrame || !pendingThumbnails.length) return;
    const priority = pendingThumbnails[0]?.priority || 'visible';
    if (priority === 'buffer' && typeof window.requestIdleCallback === 'function') {
      thumbnailRenderMode = 'idle';
      thumbnailRenderFrame = window.requestIdleCallback(renderThumbnailBatch, { timeout: 500 });
      return;
    }
    thumbnailRenderMode = 'frame';
    thumbnailRenderFrame = requestAnimationFrame(() => renderThumbnailBatch(null));
  }

  function renderThumbnailBatch(deadline = null) {
    thumbnailRenderFrame = 0;
    thumbnailRenderMode = '';
    if (!trace || !document.body.classList.contains('asm-trace-studio-open')) {
      pendingThumbnails = [];
      return;
    }
    // Heap thumbnails perform synchronous SVG layout and getBBox calls. Doing
    // several in one animation frame made the freshly opened Studio stutter.
    if (deadline && !deadline.didTimeout && deadline.timeRemaining() < 6) {
      scheduleThumbnailRendering();
      return;
    }
    renderThumbnailJob(pendingThumbnails.shift());
    scheduleThumbnailRendering();
  }

  function renderRail() {
    cancelThumbnailCulling();
    cancelThumbnailRendering();
    clearThumbnailCache();
    const list = rail.querySelector('.trace-studio-frame-list');
    const scrollTop = list.scrollTop;
    list.replaceChildren();
    trace.frames.forEach((frame, index) => {
      const button = el('button', 'trace-studio-frame');
      button.type = 'button';
      button.dataset.frameId = frame.id;
      button.dataset.frameIndex = index;
      const header = el('span', 'trace-studio-frame-head');
      header.append(el('strong', '', `幀 ${index + 1}`));
      header.append(eventDots(frame));
      if (window.ASMTraceTransitions?.hasCustomTransition?.(trace, frame.id)) {
        const badge = el('i', 'trace-studio-transition-badge', '↝');
        badge.title = '此幀包含自訂幀間動畫';
        header.append(badge);
      }
      const directiveName = window.ASMTraceViewSource?.directiveName?.(frame) || '';
      const source = el(
        'small',
        '',
        `${directiveName ? `${directiveName} · ` : ''}${frame.source?.function || 'global'}:${frame.source?.line || '-'}`
      );
      const preview = thumbnailPlaceholder();
      button.append(header, source, preview);
      button.addEventListener('click', event => selectFrame(index, event));
      list.append(button);
    });
    list.scrollTop = scrollTop;
    scheduleThumbnailCulling();
  }

  function syncCurrentThumbnail() {
    thumbnailSyncFrame = 0;
    if (!rail || !trace) return;
    if (window._canvasInteraction?.mode !== 'drag') return;
    const selected = window._canvasInteraction?.selected;
    const key = selected?.dataset?.traceObjectKey;
    if (!key) return;
    const [dx, dy] = String(selected.getAttribute('data-translate') || '0,0').split(',').map(Number);
    selectedFrames.forEach(frameId => {
      const preview = rail.querySelector(`.trace-studio-frame[data-frame-id="${CSS.escape(frameId)}"] .trace-studio-frame-preview`);
      const thumbnailObject = preview?.querySelector(`[data-trace-object-key="${CSS.escape(key)}"]`);
      if (!thumbnailObject) return;
      liveTransform(thumbnailObject, dx, dy, 'traceLiveBaseTransform');
      boundDependentElements(preview, frameId, key).forEach(element => {
        liveTransform(element, dx, dy, 'traceLiveBindingBaseTransform');
      });
      const frame = trace.frames.find(item => item.id === frameId);
      window.ASMTraceRenderers?.refreshThumbnailCamera?.(preview, trace, frame);
    });
  }

  function revealCurrentFrameInRail() {
    if (!rail || !trace) return;
    const list = rail.querySelector('.trace-studio-frame-list');
    const current = list?.querySelector(`.trace-studio-frame[data-frame-index="${currentIndex}"]`);
    if (!list || !current) return;
    const listRect = list.getBoundingClientRect();
    const currentRect = current.getBoundingClientRect();
    if (currentRect.top < listRect.top || currentRect.bottom > listRect.bottom) {
      current.scrollIntoView({ block: 'nearest' });
    }
    scheduleThumbnailCulling();
  }

  function scheduleThumbnailSync() {
    if (thumbnailSyncFrame) return;
    thumbnailSyncFrame = requestAnimationFrame(syncCurrentThumbnail);
  }

  function renderTimeline() {
    const track = timeline.querySelector('.trace-studio-timeline-track');
    track.replaceChildren();
    trace.frames.forEach((frame, index) => {
      const marker = el('button', 'trace-studio-time-frame');
      marker.type = 'button';
      marker.dataset.frameId = frame.id;
      marker.dataset.frameIndex = index;
      marker.classList.toggle('has-custom-transition', Boolean(
        window.ASMTraceTransitions?.hasCustomTransition?.(trace, frame.id)
      ));
      marker.title = `幀 ${index + 1} · 程式第 ${frame.source?.line || '-'} 行`;
      marker.append(el('span', 'trace-studio-time-number', String(index + 1)), eventDots(frame));
      marker.addEventListener('click', event => selectFrame(index, event));
      track.append(marker);
    });
  }

  function cancelEventAvailabilityRefresh() {
    if (availabilityRefreshFrame) cancelAnimationFrame(availabilityRefreshFrame);
    availabilityRefreshFrame = 0;
    pendingAvailabilityFrames.clear();
  }

  function refreshEventAvailability() {
    availabilityRefreshFrame = 0;
    const frameIds = new Set(pendingAvailabilityFrames);
    pendingAvailabilityFrames.clear();
    if (!trace || !document.body.classList.contains('asm-trace-studio-open')) return;
    const frames = new Map(trace.frames.filter(frame => frameIds.has(frame.id))
      .map(frame => [frame.id, frame]));
    // Rendering a thumbnail evaluates event availability. Never redraw scenes in
    // response to that notification: doing so rebuilds every SVG for every frame.
    [rail, timeline].forEach(container => {
      container?.querySelectorAll('[data-frame-id]').forEach(item => {
        const frame = frames.get(item.dataset.frameId);
        if (!frame) return;
        item.querySelector('.trace-studio-event-dots')?.replaceWith(eventDots(frame));
      });
    });
    if (frameIds.has(trace.frames[currentIndex]?.id)) renderFrameEventsEditor();
  }

  function renderSelection() {
    if (!trace) return;
    rail.querySelectorAll('[data-frame-id]').forEach(item => {
      item.classList.toggle('is-selected', selectedFrames.has(item.dataset.frameId));
      item.classList.toggle('is-current', Number(item.dataset.frameIndex) === currentIndex);
    });
    timeline.querySelectorAll('[data-frame-id]').forEach(item => {
      item.classList.toggle('is-selected', selectedFrames.has(item.dataset.frameId));
      item.classList.toggle('is-current', Number(item.dataset.frameIndex) === currentIndex);
    });
    selectionLabel.textContent = `已選取 ${selectedFrames.size} 幀`;
    if (cameraAutoCapture && !cameraFrameState) {
      const rule = cameraRuleForFrame(trace.frames[currentIndex]);
      cameraAutoCapture.checked = rule?.autoCapture !== false;
      const zoom = Number(rule?.zoom) || 0.92;
      cameraZoom.value = String(zoom);
      cameraZoomValue.textContent = `${zoom.toFixed(2)}x`;
      cameraDraftId = rule?.id || '';
    }
    renderFrameEventsEditor();
    renderTransitionEditor();
  }

  function refreshVariableOptions() {
    const selects = [
      [targetVariable, false], [arrowFrom, false], [arrowTo, false],
      [trackingSource, '選擇變數'], [trackingTarget, '選擇物件']
    ].filter(([select]) => select);
    selects.forEach(([select, allowEmpty]) => {
      const previous = select.value;
      select.replaceChildren();
      if (allowEmpty) select.append(option('', typeof allowEmpty === 'string' ? allowEmpty : '不設定條件'));
      const allVariables = variables();
      const collectionKinds = new Set(['sequence', 'matrix', 'stack', 'queue', 'set', 'map', 'node-graph', 'graph', 'coordinate-system']);
      const scalarVariables = allVariables.filter(([, variable]) => !collectionKinds.has(variable.kind));
      const collectionVariables = allVariables.filter(([, variable]) => collectionKinds.has(variable.kind));
      const choices = select === trackingSource && scalarVariables.length
        ? scalarVariables
        : select === trackingTarget && collectionVariables.length
          ? collectionVariables
          : allVariables;
      choices.forEach(([id, variable]) => select.append(option(id, variable.name)));
      if ([...select.options].some(item => item.value === previous)) select.value = previous;
    });
    if (arrowTo?.options.length > 1 && arrowTo.value === arrowFrom?.value) arrowTo.selectedIndex = 1;
    syncTrackingDefaults(false);
  }

  function scheduleAutoSave(callback, delay = 260) {
    if (suppressAutoSave) return;
    clearTimeout(autoSaveTimer);
    pendingAutoSave = callback;
    autoSaveTimer = setTimeout(() => {
      const save = pendingAutoSave;
      autoSaveTimer = null;
      pendingAutoSave = null;
      save?.();
    }, delay);
  }

  function flushAutoSave() {
    if (!pendingAutoSave) return false;
    clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
    const save = pendingAutoSave;
    pendingAutoSave = null;
    save();
    return true;
  }

  function cancelAutoSave() {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
    pendingAutoSave = null;
  }

  function writeSourceSettings() {
    if (!trace || restoringHistory || !window.asmWriteViewSettings || !window.ASMTraceViewSource?.fromTrace) return;
    return window.asmWriteViewSettings(window.ASMTraceViewSource.fromTrace(trace));
  }

  function writeStyleRule() {
    if (!targetVariable?.value || !styleType?.value) return;
    styleDraftId ||= `studio-style-${Date.now().toString(36)}`;
    const rule = {
      id: styleDraftId,
      name: `${variableName(targetVariable.value)} · ${styleType.value}`,
      match: { frameIds: frameIdsForScope(), stateCondition: activeCondition() },
      actions: [{
        type: 'style',
        targetVariableId: targetVariable.value,
        targetIndexExpression: targetIndex.value.trim(),
        style: { styleType: styleType.value, color: styleColor.value },
        animation: 'trace-lift'
      }]
    };
    const index = trace.rules.findIndex(item => item.id === styleDraftId);
    if (index >= 0) trace.rules[index] = rule;
    else trace.rules.push(rule);
    return true;
  }

  function previewStyleRule() {
    if (!writeStyleRule()) return;
    previewStudioStyle();
  }

  function saveStyleRule() {
    if (!writeStyleRule()) return;
    commitRules();
  }

  function variableName(variableId) {
    return trace?.variables?.[variableId]?.name || variableId || '';
  }

  function syncTrackingDefaults(force = true) {
    if (!trackingSource || !trackingTarget) return;
    const sourceName = variableName(trackingSource.value);
    const targetName = variableName(trackingTarget.value);
    const targetKind = trace?.variables?.[trackingTarget.value]?.kind;
    const matrixMarker = targetKind === 'matrix' && trackingEffect?.value === 'marker';
    const indexExpression = targetKind === 'matrix' && !matrixMarker
      ? (sourceName.toLowerCase() === 'j' ? `0,${sourceName}` : `${sourceName},0`)
      : sourceName;
    if (force || !trackingIndexExpression.value.trim()) trackingIndexExpression.value = indexExpression;
    if (force || !trackingText.value.trim()) trackingText.value = sourceName;
  }

  function trackingKey(effect = trackingEffect?.value) {
    return `${trackingSource?.value || ''}:${trackingTarget?.value || ''}:${effect || ''}`
      .replace(/[^A-Za-z0-9_-]/g, '-');
  }

  function saveTrackingEffect(targetVariableId = '') {
    if (targetVariableId) trackingTarget.value = targetVariableId;
    if (!trackingSource.value || !trackingTarget.value) return;
    const id = `tracking-${trackingKey()}`;
    const frameIds = frameIdsForScope();
    const condition = activeCondition();
    const indexExpression = trackingIndexExpression.value.trim() || variableName(trackingSource.value);
    const target = {
      variableId: trackingTarget.value,
      indexExpression,
      anchor: trackingAnchor.value,
      indexLabel: trackingEffect.value === 'marker'
    };
    if (trackingEffect.value === 'marker' && trace.variables[trackingTarget.value]?.kind === 'matrix') {
      target.axis = variableName(trackingSource.value).toLowerCase() === 'j' ? 'column' : 'row';
    }
    if (trackingEffect.value === 'highlight') {
      const rule = {
        id: `studio-${id}`,
        name: `${variableName(trackingTarget.value)}[${indexExpression}] 動態填色`,
        match: { frameIds, stateCondition: condition },
        actions: [{
          type: 'style',
          targetVariableId: trackingTarget.value,
          targetIndexExpression: indexExpression,
          style: { styleType: 'background', color: '#10b981' },
          animation: 'trace-lift'
        }]
      };
      const ruleIndex = trace.rules.findIndex(item => item.id === rule.id);
      if (ruleIndex >= 0) trace.rules[ruleIndex] = rule;
      else trace.rules.push(rule);
      commitRules();
      return;
    }
    const existingObject = trace.studio.objects.find(item => item.id === id);
    const studioObject = {
      id,
      type: 'variable-marker',
      sourceVariableId: trackingSource.value,
      hideSource: trackingEffect.value === 'marker',
      target,
      text: trackingText.value.trim() || variableName(trackingSource.value),
      shape: existingObject?.shape || 'array',
      color: '#12a6df',
      stroke: '#0b7ead',
      frameIds,
      condition,
      offsetX: 0,
      offsetY: 0
    };
    const objectIndex = trace.studio.objects.findIndex(item => item.id === id);
    if (objectIndex >= 0) trace.studio.objects[objectIndex] = studioObject;
    else trace.studio.objects.push(studioObject);
    commitStudio();
  }

  function viewportPoint(clientX, clientY) {
    const canvas = document.getElementById('arraySvg');
    const viewport = window.getViewport?.() || canvas;
    if (!canvas || !viewport) return null;
    const point = canvas.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    try { return point.matrixTransform(viewport.getScreenCTM().inverse()); } catch { return point; }
  }

  function addArrow() {
    if (!arrowFrom.value || !arrowTo.value) return;
    if (arrowFrom.value === arrowTo.value && arrowFromIndex.value.trim() === arrowToIndex.value.trim()) return;
    const withinSameObject = arrowFrom.value === arrowTo.value
      && arrowFromIndex.value.trim() && arrowToIndex.value.trim();
    trace.studio.arrows.push({
      id: `arrow-${Date.now().toString(36)}`,
      fromVariableId: arrowFrom.value,
      toVariableId: arrowTo.value,
      from: {
        variableId: arrowFrom.value,
        indexExpression: arrowFromIndex.value.trim(),
        anchor: withinSameObject ? 'top' : 'right'
      },
      to: {
        variableId: arrowTo.value,
        indexExpression: arrowToIndex.value.trim(),
        anchor: withinSameObject ? 'top' : 'left'
      },
      frameIds: frameIdsForScope(),
      condition: activeCondition(),
      color: arrowColor.value,
      width: 3
    });
    commitStudio();
  }

  function saveCameraRule(immediate = false) {
    if (!trace || (cameraFrameState && !cameraAutoCapture?.checked)) return;
    const frameIds = frameIdsForScope();
    const draftRule = trace.studio.cameraRules.find(rule => rule.id === cameraDraftId);
    if (!draftRule || !sameCameraFrameScope(draftRule, frameIds)) {
      cameraDraftId = `camera-${Date.now().toString(36)}`;
    }
    const rule = {
      id: cameraDraftId,
      name: '鏡頭設定',
      frameIds,
      condition: activeCondition(),
      zoom: Number(cameraZoom.value) || 0.92,
      offsetX: 0,
      offsetY: 0,
      target: null,
      autoCapture: cameraAutoCapture?.checked !== false
    };
    replaceCameraRuleForScope(rule);
    commitStudio();
    applyCameraForFrame(currentIndex, true, immediate ? 0 : 70);
  }

  function saveCameraAutoCapture() {
    cancelAutoSave();
    if (cameraFrameState) {
      cameraFrameState.autoCapture = cameraAutoCapture.checked;
      if (!cameraFrameState.autoCapture) {
        cameraZoom.value = String(cameraFrameState.zoom);
        cameraZoomValue.textContent = `${cameraFrameState.zoom.toFixed(2)}x`;
        renderCameraFrame();
        return;
      }
      const autoZoom = Number(cameraFrameState.autoZoom) || 0.92;
      cameraZoom.value = String(autoZoom);
      cameraZoomValue.textContent = `${autoZoom.toFixed(2)}x`;
    }
    saveCameraRule(true);
  }

  function traceSvg(name, attributes = {}) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', name);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));
    return node;
  }

  function cameraFrameAnchors() {
    const anchors = [];
    const names = ['center', 'top', 'bottom', 'left', 'right', 'top left', 'top right', 'bottom left', 'bottom right'];
    (window.ASMTraceRenderers?.currentObjectKeys?.() || []).forEach(key => {
      if (window.ASMTraceRenderers?.cameraObjectKey?.(key) !== key) return;
      names.forEach(anchor => {
        const point = window.ASMTraceRenderers?.currentAnchorForKey?.(key, anchor, true);
        if (point) anchors.push({ ...point, key, anchor });
      });
    });
    return anchors;
  }

  function snapCameraCenter(point, disabled = false) {
    if (disabled) return { point, anchor: null };
    const scale = window.getScale?.() || 1;
    const threshold = 12 / scale;
    let best = null;
    let distance = threshold;
    cameraFrameAnchors().forEach(anchor => {
      const next = Math.hypot(point.x - anchor.x, point.y - anchor.y);
      if (next < distance) {
        distance = next;
        best = anchor;
      }
    });
    return { point: best ? { x: best.x, y: best.y } : point, anchor: best };
  }

  function savedCameraAnchor(rule) {
    const binding = rule?.binding;
    if (!binding?.targetKey) return null;
    const key = window.ASMTraceRenderers?.cameraObjectKey?.(binding.targetKey);
    if (!key) return null;
    const anchor = binding.targetAnchor || 'center';
    const point = window.ASMTraceRenderers?.currentAnchorForKey?.(key, anchor, true);
    return point ? { ...point, key, anchor } : null;
  }

  function clearCameraFrameAutoClose() {
    clearTimeout(cameraFrameAutoCloseTimer);
    cameraFrameAutoCloseTimer = null;
  }

  function scheduleCameraFrameAutoClose() {
    clearCameraFrameAutoClose();
    if (!cameraFrameState || cameraFrameState.dragging) return;
    cameraFrameAutoCloseTimer = setTimeout(() => {
      cameraFrameAutoCloseTimer = null;
      if (!cameraFrameState || cameraFrameState.dragging) return;
      closeCameraFrame(true);
    }, 1500);
  }

  function renderCameraFrame() {
    const state = cameraFrameState;
    const viewport = window.getViewport?.();
    if (!state || !viewport) return;
    let overlay = document.getElementById('trace-camera-frame-overlay');
    if (!overlay) {
      overlay = traceSvg('g', {
        id: 'trace-camera-frame-overlay',
        'data-trace-camera-frame': '1'
      });
      overlay.addEventListener('pointerdown', beginCameraFrameDrag);
      viewport.append(overlay);
    }
    overlay.replaceChildren();
    const left = state.centerX - state.width / 2;
    const top = state.centerY - state.height / 2;
    const right = state.centerX + state.width / 2;
    const bottom = state.centerY + state.height / 2;
    const scale = window.getScale?.() || 1;
    const border = traceSvg('rect', {
      x: left, y: top, width: state.width, height: state.height,
      fill: 'rgba(216, 74, 74, 0.16)', stroke: 'rgba(216, 74, 74, 0.78)',
      'stroke-width': 3, 'vector-effect': 'non-scaling-stroke',
      'data-camera-move': '1', style: 'cursor:move'
    });
    const vertical = traceSvg('line', {
      x1: state.centerX, y1: top, x2: state.centerX, y2: bottom,
      stroke: 'rgba(216, 74, 74, 0.92)', 'stroke-width': 3 / scale,
      'stroke-dasharray': `${7 / scale} ${6 / scale}`, 'pointer-events': 'none'
    });
    const horizontal = traceSvg('line', {
      x1: left, y1: state.centerY, x2: right, y2: state.centerY,
      stroke: 'rgba(216, 74, 74, 0.92)', 'stroke-width': 3 / scale,
      'stroke-dasharray': `${7 / scale} ${6 / scale}`, 'pointer-events': 'none'
    });
    const center = traceSvg('circle', {
      cx: state.centerX, cy: state.centerY, r: 7 / scale,
      fill: state.snapped ? '#1d8f83' : '#ffffff', stroke: 'rgba(216, 74, 74, 0.92)',
      'stroke-width': 2 / scale, 'data-camera-move': '1', style: 'cursor:move'
    });
    overlay.append(border, vertical, horizontal, center);
    [['nw', left, top], ['ne', right, top], ['sw', left, bottom], ['se', right, bottom]].forEach(([corner, x, y]) => {
      overlay.append(traceSvg('circle', {
        cx: x, cy: y, r: 7 / scale, fill: '#ffffff', stroke: 'rgba(216, 74, 74, 0.92)',
        'stroke-width': 2 / scale, 'data-camera-resize': corner,
        style: `cursor:${corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize'}`
      }));
    });
    if (state.snapped) {
      overlay.append(traceSvg('circle', {
        cx: state.snapped.x, cy: state.snapped.y, r: 10 / scale,
        fill: '#1d8f83', stroke: '#ffffff', 'stroke-width': 2 / scale,
        'data-camera-bound-anchor': '1',
        'pointer-events': 'none'
      }));
    }
    selectedFrames.forEach(frameId => {
      const preview = rail?.querySelector(`.trace-studio-frame[data-frame-id="${CSS.escape(frameId)}"] .trace-studio-frame-preview`);
      window.ASMTraceRenderers?.showMainCameraFrameInThumbnail?.(preview, state);
    });
  }

  function finishCameraFrameDrag(event) {
    if (!cameraFrameState?.dragging) return;
    const shouldSave = cameraFrameState.hasMoved;
    cameraFrameState.dragging = null;
    window.removeEventListener('pointermove', moveCameraFrame, true);
    window.removeEventListener('pointerup', finishCameraFrameDrag, true);
    try { document.getElementById('arraySvg')?.releasePointerCapture(event.pointerId); } catch {}
    if (shouldSave) scheduleCameraFrameAutoClose();
  }

  function moveCameraFrame(event) {
    const state = cameraFrameState;
    if (!state?.dragging) return;
    const cursor = viewportPoint(event.clientX, event.clientY);
    if (!cursor) return;
    event.preventDefault();
    event.stopPropagation();
    if (!state.hasMoved) {
      const threshold = 1.5 / Math.max(0.01, Number(window.getScale?.()) || 1);
      if (Math.hypot(cursor.x - state.startPointer.x, cursor.y - state.startPointer.y) < threshold) return;
      state.hasMoved = true;
      if (state.autoCapture) {
        state.autoCapture = false;
        cameraAutoCapture.checked = false;
        cameraZoom.value = String(state.zoom);
        cameraZoomValue.textContent = `${state.zoom.toFixed(2)}x`;
      }
    }
    if (state.dragging === 'resize') {
      const widthFromX = Math.abs(cursor.x - state.centerX) * 2;
      const widthFromY = Math.abs(cursor.y - state.centerY) * 2 * state.aspect;
      const requestedWidth = Math.max(120, widthFromX, widthFromY);
      const zoom = Math.max(0.3, Math.min(4, Number(window.cameraScaleForViewportWidth?.(requestedWidth)) || state.zoom));
      const dimensions = window.getCameraViewport?.(zoom);
      state.zoom = zoom;
      state.width = dimensions?.width || requestedWidth;
      state.height = dimensions?.height || state.width / state.aspect;
      cameraZoom.value = String(zoom);
      cameraZoomValue.textContent = `${zoom.toFixed(2)}x`;
      state.snapped = null;
    } else {
      let dx = cursor.x - state.startPointer.x;
      let dy = cursor.y - state.startPointer.y;
      if (event.shiftKey) {
        if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      const next = { x: state.startCenter.x + dx, y: state.startCenter.y + dy };
      const snapped = snapCameraCenter(next, event.ctrlKey);
      state.centerX = snapped.point.x;
      state.centerY = snapped.point.y;
      state.snapped = snapped.anchor;
    }
    renderCameraFrame();
  }

  function beginCameraFrameDrag(event) {
    if (event.button !== 0 || !cameraFrameState) return;
    const cursor = viewportPoint(event.clientX, event.clientY);
    if (!cursor) return;
    event.preventDefault();
    event.stopPropagation();
    clearCameraFrameAutoClose();
    cameraFrameState.dragging = event.target.closest?.('[data-camera-resize]') ? 'resize' : 'move';
    cameraFrameState.startPointer = cursor;
    cameraFrameState.startCenter = { x: cameraFrameState.centerX, y: cameraFrameState.centerY };
    cameraFrameState.hasMoved = false;
    window.addEventListener('pointermove', moveCameraFrame, true);
    window.addEventListener('pointerup', finishCameraFrameDrag, true);
    try { document.getElementById('arraySvg')?.setPointerCapture(event.pointerId); } catch {}
  }

  function closeCameraFrame(save = true) {
    const state = cameraFrameState;
    if (!state) return;
    clearCameraFrameAutoClose();
    window.removeEventListener('pointermove', moveCameraFrame, true);
    window.removeEventListener('pointerup', finishCameraFrameDrag, true);
    if (cameraFrameDismiss) document.removeEventListener('pointerdown', cameraFrameDismiss, true);
    cameraFrameDismiss = null;
    document.getElementById('trace-camera-frame-overlay')?.remove();
    document.body.classList.remove('asm-trace-camera-framing');
    cameraFrameButton?.classList.remove('is-active');
    cameraFrameState = null;
    if (!save || !trace) return;
    saveCameraFrameState(state);
  }

  function saveCameraFrameState(state) {
    if (!state || !trace) return false;
    if (state.autoCapture) {
      cameraAutoCapture.checked = true;
      return false;
    }
    cameraAutoCapture.checked = false;
    cameraZoom.value = String(state.zoom);
    cameraZoomValue.textContent = `${state.zoom.toFixed(2)}x`;
    const binding = state.snapped ? {
      targetKey: state.snapped.key,
      targetAnchor: state.snapped.anchor,
      dx: state.centerX - state.snapped.x,
      dy: state.centerY - state.snapped.y
    } : null;
    replaceCameraRuleForScope({
      id: `camera-frame-${Date.now().toString(36)}`,
      name: '鏡頭範圍',
      frameIds: frameIdsForScope(),
      condition: activeCondition(),
      zoom: state.zoom,
      centerX: state.centerX,
      centerY: state.centerY,
      binding,
      offsetX: 0,
      offsetY: 0,
      target: null,
      autoCapture: false,
      manualFrame: true
    });
    commitStudio();
    applyCameraForFrame(currentIndex, true);
    return true;
  }

  function openCameraFrame() {
    if (cameraFrameState) {
      closeCameraFrame(true);
      return;
    }
    const viewport = window.getCameraViewport?.();
    const activeRule = cameraRuleForFrame(trace.frames[currentIndex]);
    const zoom = activeRule?.manualFrame
      ? Number(activeRule.zoom) || Number(viewport?.scale) || 0.92
      : Number(viewport?.scale) || Number(cameraZoom.value) || 0.92;
    const dimensions = window.getCameraViewport?.(zoom) || viewport;
    const snapped = savedCameraAnchor(activeRule);
    const autoCapture = activeRule?.autoCapture !== false;
    const autoZoom = Number(activeRule?.zoom) || zoom;
    const bounds = window.ASMTraceRenderers?.currentBounds?.();
    if (!viewport && !bounds) return;
    cameraAutoCapture.checked = autoCapture;
    cameraZoom.value = String(zoom);
    cameraZoomValue.textContent = `${zoom.toFixed(2)}x`;
    cameraFrameState = {
      centerX: snapped
        ? snapped.x + (Number(activeRule.binding?.dx) || 0)
        : Number.isFinite(Number(activeRule?.centerX)) ? Number(activeRule.centerX) : viewport?.centerX ?? bounds.centerX,
      centerY: snapped
        ? snapped.y + (Number(activeRule.binding?.dy) || 0)
        : Number.isFinite(Number(activeRule?.centerY)) ? Number(activeRule.centerY) : viewport?.centerY ?? bounds.centerY,
      width: dimensions?.width || 800 / zoom,
      height: dimensions?.height || 450 / zoom,
      aspect: dimensions?.aspect || 16 / 9,
      zoom,
      autoZoom,
      snapped,
      dragging: null,
      hasMoved: false,
      autoCapture
    };
    document.body.classList.add('asm-trace-camera-framing');
    cameraFrameButton?.classList.add('is-active');
    renderCameraFrame();
    setTimeout(() => {
      cameraFrameDismiss = event => {
        if (event.target.closest?.('#trace-camera-frame-overlay, [data-trace-camera-controls]') || cameraFrameButton?.contains(event.target)) return;
        closeCameraFrame(true);
      };
      document.addEventListener('pointerdown', cameraFrameDismiss, true);
    });
  }

  function commitRules() {
    recordHistory();
    setPlayerRules(trace.rules);
    renderEffects();
    renderRail();
    renderSelection();
  }

  function commitStudio() {
    recordHistory();
    renderPlayerFrame(currentIndex);
    renderEffects();
    renderRail();
    renderSelection();
  }

  function renderEffects() {
    effectsList.replaceChildren();
    const studioRules = (trace.rules || []).filter(rule => String(rule.id).startsWith('studio-'));
    studioRules.forEach(rule => {
      const row = el('div', 'trace-studio-effect-row');
      row.append(el('span', '', rule.name || '跨幀規則'));
      const remove = el('button', '', '×');
      remove.type = 'button';
      remove.title = '刪除規則';
      remove.addEventListener('click', () => {
        trace.rules = trace.rules.filter(item => item.id !== rule.id);
        commitRules();
      });
      row.append(remove);
      effectsList.append(row);
    });
    trace.studio.objects.forEach(object => {
      const row = el('div', 'trace-studio-effect-row');
      const targetName = variableName(object.target?.variableId);
      const index = object.target?.indexExpression ? `[${object.target.indexExpression}]` : '';
      const kind = object.type === 'repeat-cells' ? '數值方格' : '位置標記';
      row.append(el('span', '', `${kind} → ${targetName}${index}`));
      const remove = el('button', '', '×');
      remove.type = 'button';
      remove.title = '刪除追蹤物件';
      remove.addEventListener('click', () => {
        trace.studio.objects = trace.studio.objects.filter(item => item.id !== object.id);
        commitStudio();
      });
      row.append(remove);
      effectsList.append(row);
    });
    trace.studio.arrows.forEach(arrow => {
      const row = el('div', 'trace-studio-effect-row');
      const from = trace.variables[arrow.fromVariableId]?.name || '?';
      const to = trace.variables[arrow.toVariableId]?.name || '?';
      const fromIndex = arrow.from?.indexExpression ? `[${arrow.from.indexExpression}]` : '';
      const toIndex = arrow.to?.indexExpression ? `[${arrow.to.indexExpression}]` : '';
      row.append(el('span', '', `箭頭 ${from}${fromIndex} → ${to}${toIndex}`));
      const remove = el('button', '', '×');
      remove.type = 'button';
      remove.title = '刪除箭頭';
      remove.addEventListener('click', () => {
        trace.studio.arrows = trace.studio.arrows.filter(item => item.id !== arrow.id);
        commitStudio();
      });
      row.append(remove);
      effectsList.append(row);
    });
    trace.studio.cameraRules.forEach(rule => {
      const row = el('div', 'trace-studio-effect-row');
      const target = rule.target?.variableId
        ? ` → ${variableName(rule.target.variableId)}${rule.target.indexExpression ? `[${rule.target.indexExpression}]` : ''}`
        : '';
      const mode = rule.autoCapture === false ? '固定鏡頭' : '自動捕捉鏡頭';
      row.append(el('span', '', `${mode} ${Number(rule.zoom).toFixed(2)}x${target}`));
      const remove = el('button', '', '×');
      remove.type = 'button';
      remove.title = '刪除鏡頭設定';
      remove.addEventListener('click', () => {
        trace.studio.cameraRules = trace.studio.cameraRules.filter(item => item.id !== rule.id);
        commitStudio();
        applyCameraForFrame(currentIndex, true);
      });
      row.append(remove);
      effectsList.append(row);
    });
    trace.studio.transitions.forEach(rule => {
      const row = el('div', 'trace-studio-effect-row');
      const frameCount = Array.isArray(rule.frameIds) ? rule.frameIds.length : 1;
      const animationLabel = rule.mode === 'instant' ? '不做動畫' : '自動動畫';
      row.append(el('span', '', `對應 ${rule.sourceKey || rule.objectKey} → ${rule.objectKey} · ${animationLabel} · ${frameCount} 幀`));
      const remove = el('button', '', '×');
      remove.type = 'button';
      remove.title = '刪除幀間動畫';
      remove.addEventListener('click', () => {
        trace.studio.transitions = trace.studio.transitions.filter(item => item.id !== rule.id);
        commitStudio();
        renderTimeline();
        renderTransitionEditor();
      });
      row.append(remove);
      effectsList.append(row);
    });
    if (!effectsList.children.length) effectsList.append(el('div', 'trace-studio-empty', '尚未建立跨幀效果'));
  }

  function field(label, control) {
    const wrapper = el('label', 'trace-studio-field');
    wrapper.append(el('span', '', label), control);
    return wrapper;
  }

  function section(title) {
    const wrapper = el('section', 'trace-studio-section');
    wrapper.append(el('h3', '', title));
    return wrapper;
  }

  function buildInspector() {
    inspector = el('aside', 'trace-studio-inspector');
    const header = el('header', 'trace-studio-inspector-head');
    header.append(el('strong', '', '跨幀屬性'));
    selectionLabel = el('span', '', '已選取 1 幀');
    header.append(selectionLabel);
    inspector.append(header);

    inspectorToolbar = el('nav', 'trace-studio-inspector-toolbar');
    inspectorToolbar.setAttribute('aria-label', '右欄功能');
    const toolbarButton = (mode, icon, label, title) => {
      const button = el('button', 'trace-studio-inspector-tool');
      button.type = 'button';
      button.title = title;
      button.setAttribute('aria-label', label);
      button.append(el('span', 'trace-studio-inspector-tool-icon', icon), el('span', '', label));
      button.addEventListener('click', () => setInspectorMode(mode));
      return button;
    };
    inspectorCameraButton = toolbarButton('camera', '▣', '鏡頭', '鏡頭設定');
    inspectorEventButton = toolbarButton('events', '●', '事件', '本幀事件');
    inspectorEventCount = el('i', 'trace-studio-inspector-tool-count', '0');
    inspectorEventButton.append(inspectorEventCount);
    inspectorObjectButton = toolbarButton('object', '◇', '物件', '選取物件設定');
    inspectorToolbar.append(inspectorCameraButton, inspectorEventButton, inspectorObjectButton);
    inspector.append(inspectorToolbar);

    scopeSelect = document.createElement('select');
    scopeSelect.append(
      option('directive', '目前指令'),
      option('selected', '已選取幀'),
      option('forward', '目前指令之後'),
      option('all', '所有幀')
    );
    inspector.append(field('作用時間線', scopeSelect));
    eventGapRange = document.createElement('input');
    eventGapRange.type = 'range';
    eventGapRange.className = 'trace-studio-event-gap-range';
    eventGapRange.min = '0';
    eventGapRange.max = '2000';
    eventGapRange.step = '10';
    eventGapRange.value = String(trace?.studio?.eventSettings?.gapMs ?? 500);
    eventGapRange.title = `間隔時間 ${eventGapRange.value} ms`;
    eventGapValue = el('output', 'trace-studio-event-gap-value', `${eventGapRange.value} ms`);
    const eventGapControl = el('div', 'trace-studio-event-gap-control');
    eventGapControl.append(eventGapRange, eventGapValue);
    eventGapRange.addEventListener('input', () => {
      setEventGap(eventGapRange.value, false);
      window.dispatchEvent(new CustomEvent('asm:trace-event-gap-input', {
        detail: { document: trace, gapMs: Number(eventGapRange.value) || 0 }
      }));
    });
    eventGapRange.addEventListener('change', () => setEventGap(eventGapRange.value, true));
    inspector.append(field('間隔時間', eventGapControl));

    inspectorEventsPanel = el('div', 'trace-studio-inspector-panel trace-studio-events-panel');
    inspectorCameraPanel = el('div', 'trace-studio-inspector-panel');
    inspectorObjectPanel = el('div', 'trace-studio-inspector-panel');
    inspector.append(inspectorEventsPanel, inspectorCameraPanel, inspectorObjectPanel);

    frameEventsEditor = section('本幀事件');
    frameEventsEditor.classList.add('trace-studio-frame-events-section');
    frameEventsList = el('div', 'trace-studio-frame-events');
    frameEventsEditor.append(frameEventsList);
    frameFixedEditor = section('自動固定');
    frameFixedEditor.classList.add('trace-studio-fixed-section');
    frameFixedList = el('div', 'trace-studio-fixed-batches');
    frameFixedEditor.append(frameFixedList);
    inspectorEventsPanel.append(frameEventsEditor, frameFixedEditor);
    renderFrameEventsEditor();

    objectStateEditor = section('物件狀態');
    objectStateEmpty = el('div', 'trace-studio-object-state-empty', '選取物件以設定顯示狀態');
    objectStateCard = el('div', 'trace-studio-object-state-card');
    objectStateName = el('strong', 'trace-studio-object-state-name', '');
    objectStateSelect = document.createElement('select');
    objectStateSelect.append(option('visible', '顯示'), option('hidden', '隱藏'));
    objectStateSelect.addEventListener('change', () => setObjectVisibility(objectStateSelect.value));
    objectStateCard.append(objectStateName, field('狀態', objectStateSelect));
    objectStateEditor.append(objectStateEmpty, objectStateCard);
    inspectorObjectPanel.append(objectStateEditor);
    renderObjectStateEditor();

    transitionEditor = section('幀間動畫');
    transitionEmpty = el('div', 'trace-studio-transition-empty', '選取物件以設定幀間動畫');
    transitionCard = el('div', 'trace-studio-transition-card');
    transitionRelation = el('strong', 'trace-studio-transition-relation', '');
    const transitionHint = el(
      'div',
      'trace-studio-transition-hint',
      '相同 ID 會自動補間；只有改變對應物件或關閉動畫時才需要設定。'
    );
    const transitionControls = el('div', 'trace-studio-transition-controls');
    transitionSourceKey = document.createElement('input');
    transitionSourceKey.type = 'text';
    transitionSourceKey.placeholder = '上一幀物件 ID';
    transitionSourceKey.setAttribute('aria-label', '上一幀物件 ID');
    transitionMode = document.createElement('select');
    transitionMode.setAttribute('aria-label', '幀間動畫模式');
    transitionMode.append(
      option('auto', '自動動畫'),
      option('instant', '不做動畫')
    );
    const saveTransition = () => scheduleAutoSave(saveTransitionRule, 180);
    transitionSourceKey.addEventListener('change', saveTransition);
    transitionSourceKey.addEventListener('blur', saveTransition);
    transitionMode.addEventListener('change', saveTransition);
    transitionControls.append(
      field('上一幀對應物件', transitionSourceKey),
      field('補間', transitionMode)
    );
    transitionCard.append(transitionRelation, transitionHint, transitionControls);
    transitionEditor.append(transitionEmpty, transitionCard);
    inspectorObjectPanel.append(transitionEditor);
    renderTransitionEditor();

    bindingEditor = section('位置綁定');
    bindingEmpty = el('div', 'trace-studio-binding-empty', '選取物件，拖曳上方綁定點到目標物件');
    bindingCard = el('div', 'trace-studio-binding-card');
    bindingRelation = el('strong', 'trace-studio-binding-relation', '');
    bindingIndexExpression = document.createElement('input');
    bindingIndexExpression.type = 'text';
    bindingIndexExpression.setAttribute('aria-label', '定位位置');
    bindingIndexField = el('label', 'trace-studio-binding-expression');
    bindingIndexField.append(el('span', '', '定位到這個'), bindingIndexExpression, el('span', '', '位置'));
    bindingIndexExpression.addEventListener('input', setBindingIndexExpression);
    bindingIndexExpression.addEventListener('change', setBindingIndexExpression);
    bindingIndexExpression.addEventListener('blur', setBindingIndexExpression);
    bindingCard.append(bindingRelation, bindingIndexField);
    bindingEditor.append(bindingEmpty, bindingCard);
    inspectorObjectPanel.append(bindingEditor);
    renderBindingEditor();

    markerShapeEditor = section('註標形狀');
    markerShapeEmpty = el('div', 'trace-studio-marker-shape-empty', '定位到陣列後可選擇註標形狀');
    markerShapeCard = el('div', 'trace-studio-marker-shape-card');
    markerShapeButtons = el('div', 'trace-studio-marker-shapes');
    [['array', '原始陣列'], ['arrow', '箭頭註標']].forEach(([shape, label]) => {
      const button = el('button', 'trace-studio-marker-shape');
      button.type = 'button';
      button.dataset.markerShape = shape;
      button.title = label;
      const preview = el('span', `trace-studio-marker-preview is-${shape}`);
      if (shape === 'array') preview.append(el('i'), el('b', '', 'i'));
      else preview.append(el('b', '', 'i'), el('i'), el('em'));
      button.append(preview, el('span', '', label));
      button.addEventListener('click', () => setMarkerShape(shape));
      markerShapeButtons.append(button);
    });
    markerShapeCard.append(markerShapeButtons);
    markerShapeEditor.append(markerShapeEmpty, markerShapeCard);
    inspectorObjectPanel.append(markerShapeEditor);
    renderMarkerShapeEditor();

    styleEditor = section('物件與樣式');
    objectFillColor = colorControl('#ffffff', '物件填色');
    objectStrokeColor = colorControl('#59656b', '物件邊框顏色');
    objectFillColor.addEventListener('input', previewObjectColors);
    objectStrokeColor.addEventListener('input', previewObjectColors);
    objectFillColor.addEventListener('change', saveObjectColors);
    objectStrokeColor.addEventListener('change', saveObjectColors);
    objectColorFields = el('div', 'trace-studio-object-color-fields');
    objectColorFields.append(
      field('物件填色', objectFillColor),
      field('物件邊框', objectStrokeColor)
    );
    textColor = colorControl('#111827', '文字顏色');
    textColor.classList.add('trace-studio-text-icon-button', 'is-text-color');
    textColor.setAttribute('aria-label', '文字顏色');
    textColor.prepend(el('span', 'trace-studio-text-color-glyph', 'A'));
    textBackgroundColor = colorControl('#dbeafe', '文字背景顏色');
    textBackgroundColor.classList.add('trace-studio-text-icon-button', 'is-background-color');
    textBackgroundColor.setAttribute('aria-label', '文字背景顏色');
    textBackgroundColor.prepend(el('span', 'trace-studio-text-background-glyph'));
    textBackgroundEnabled = document.createElement('input');
    textBackgroundEnabled.type = 'checkbox';
    textBackgroundEnabled.hidden = true;
    textFontSize = document.createElement('input');
    textFontSize.type = 'range';
    textFontSize.min = '8';
    textFontSize.max = '72';
    textFontSize.step = '1';
    textFontSize.value = '10';
    const saveTextStyle = () => {
      previewTextSegmentStyle();
      scheduleAutoSave(saveTextSegmentStyle);
    };
    textColor.addEventListener('input', previewTextSegmentStyle);
    textColor.addEventListener('change', saveTextSegmentStyle);
    textBackgroundColor.addEventListener('input', () => {
      textBackgroundEnabled.checked = true;
      textBackgroundColor.classList.add('is-active');
      previewTextSegmentStyle();
    });
    textBackgroundColor.addEventListener('change', () => {
      textBackgroundEnabled.checked = true;
      textBackgroundColor.classList.add('is-active');
      saveTextSegmentStyle();
    });
    textBackgroundEnabled.addEventListener('change', saveTextStyle);
    textFontSize.addEventListener('input', () => {
      textFontSizeButton.title = `字體大小 ${textFontSize.value}px`;
      saveTextStyle();
    });
    textFontSize.addEventListener('change', saveTextStyle);
    const textFormatButtons = el('div', 'trace-studio-text-format-buttons');
    const formatButton = (label, title, className = '', togglesStyle = true) => {
      const button = el('button', `trace-studio-text-icon-button ${className}`.trim(), label);
      button.type = 'button';
      button.title = title;
      button.setAttribute('aria-label', title);
      if (togglesStyle) {
        button.addEventListener('click', () => {
          button.classList.toggle('is-active');
          saveTextSegmentStyle();
        });
      }
      textFormatButtons.append(button);
      return button;
    };
    textFontSizeButton = formatButton('A↕', '字體大小 10px', 'is-font-size', false);
    const fontSizePopover = el('div', 'trace-studio-font-size-popover');
    fontSizePopover.hidden = true;
    fontSizePopover.append(textFontSize);
    const fontSizeControl = el('div', 'trace-studio-font-size-control');
    fontSizeControl.append(textFontSizeButton, fontSizePopover);
    textFontSizeButton.addEventListener('click', event => {
      event.stopPropagation();
      fontSizePopover.hidden = !fontSizePopover.hidden;
    });
    document.addEventListener('pointerdown', event => {
      if (!fontSizePopover.hidden && !fontSizeControl.contains(event.target)) fontSizePopover.hidden = true;
    }, true);
    textBold = formatButton('B', '粗體', 'is-bold');
    textItalic = formatButton('I', '斜體', 'is-italic');
    textUnderline = formatButton('U', '底線', 'is-underline');
    textStrike = formatButton('S', '橫線', 'is-strike');
    const clearBackground = formatButton('⊘', '移除文字背景', 'is-clear-background', false);
    clearBackground.addEventListener('click', () => {
      textBackgroundEnabled.checked = false;
      textBackgroundColor.classList.remove('is-active');
      saveTextSegmentStyle();
    });
    textFormatButtons.prepend(textColor, textBackgroundColor, fontSizeControl, textBackgroundEnabled);
    textFormatButtons.append(clearBackground);
    textStyleFields = el('div', 'trace-studio-text-style-fields');
    textStyleFields.append(textFormatButtons);
    targetVariable = document.createElement('select');
    targetIndex = document.createElement('input');
    targetIndex.type = 'text';
    targetIndex.placeholder = '留空、i 或 arr[i]';
    styleType = document.createElement('select');
    styleType.append(
      option('highlight', 'highlight'), option('point', 'point'), option('focus', 'focus'),
      option('mark', 'mark'), option('background', 'background')
    );
    const styleDefaults = {
      highlight: '#ef4444', point: '#f59e0b', focus: '#3b82f6', mark: '#8b5cf6', background: '#10b981'
    };
    styleColor = colorControl(styleDefaults.highlight, '樣式顏色');
    const styleChoices = el('div', 'trace-studio-style-choices');
    const refreshStyleChoices = () => styleChoices.querySelectorAll('button').forEach(button => {
      button.classList.toggle('is-active', button.dataset.styleType === styleType.value);
    });
    Object.keys(styleDefaults).forEach(type => {
      const button = el('button', 'trace-studio-style-choice');
      button.type = 'button';
      button.dataset.styleType = type;
      button.title = type;
      button.append(el('span', `style-icon ${type}`), el('span', '', type));
      button.addEventListener('click', () => {
        styleType.value = type;
        styleType.dispatchEvent(new Event('change'));
      });
      styleChoices.append(button);
    });
    const saveStyle = () => scheduleAutoSave(saveStyleRule);
    styleType.addEventListener('change', () => {
      styleColor.value = styleDefaults[styleType.value];
      styleDraftId = '';
      refreshStyleChoices();
      saveStyle();
    });
    targetVariable.addEventListener('change', () => { styleDraftId = ''; saveStyle(); });
    targetIndex.addEventListener('change', saveStyle);
    targetIndex.addEventListener('blur', saveStyle);
    styleColor.addEventListener('input', previewStyleRule);
    styleColor.addEventListener('change', saveStyleRule);
    refreshStyleChoices();
    variableStyleFields = el('div', 'trace-studio-variable-style-fields');
    variableStyleFields.append(
      field('目標變數', targetVariable), field('元素索引', targetIndex),
      field('樣式', styleChoices), field('樣式顏色', styleColor)
    );
    styleEditor.append(
      objectColorFields,
      textStyleFields,
      variableStyleFields
    );
    styleEditor.hidden = true;
    inspectorObjectPanel.append(styleEditor);

    const camera = section('鏡頭');
    camera.dataset.traceCameraControls = '1';
    cameraZoom = document.createElement('input');
    cameraZoom.type = 'range';
    cameraZoom.min = '0.3';
    cameraZoom.max = '4';
    cameraZoom.step = '0.01';
    cameraZoom.value = '0.92';
    cameraZoomValue = el('output', 'trace-studio-range-value', '0.92x');
    cameraZoom.addEventListener('input', () => {
      const zoom = Number(cameraZoom.value);
      cameraZoomValue.textContent = `${zoom.toFixed(2)}x`;
      if (cameraFrameState) {
        clearCameraFrameAutoClose();
        const dimensions = window.getCameraViewport?.(zoom);
        cameraFrameState.zoom = zoom;
        if (dimensions) {
          cameraFrameState.width = dimensions.width;
          cameraFrameState.height = dimensions.height;
          cameraFrameState.aspect = dimensions.aspect;
        }
        renderCameraFrame();
      }
    });
    const zoomRow = el('div', 'trace-studio-range-row');
    zoomRow.append(cameraZoom, cameraZoomValue);
    cameraAutoCapture = document.createElement('input');
    cameraAutoCapture.type = 'checkbox';
    cameraAutoCapture.checked = true;
    cameraZoom.addEventListener('change', () => {
      if (cameraFrameState) scheduleCameraFrameAutoClose();
      else scheduleAutoSave(saveCameraRule);
    });
    cameraAutoCapture.addEventListener('change', saveCameraAutoCapture);
    cameraFrameButton = el('button', 'trace-studio-secondary trace-studio-camera-frame-button', '▣ 鏡頭範圍');
    cameraFrameButton.type = 'button';
    cameraFrameButton.title = '在畫布上調整鏡頭範圍';
    cameraFrameButton.addEventListener('click', openCameraFrame);
    camera.append(
      field('縮放', zoomRow), field('自動捕捉', cameraAutoCapture), cameraFrameButton
    );
    inspectorCameraPanel.append(camera);

    const effects = section('已建立效果');
    effectsList = el('div', 'trace-studio-effects');
    effects.append(effectsList);
    inspectorObjectPanel.append(effects);
    renderInspectorNavigation();
    return inspector;
  }

  function closeCanvasShortcutMenu() {
    if (canvasShortcutMenu?._dismiss) window.removeEventListener('pointerdown', canvasShortcutMenu._dismiss, true);
    canvasShortcutMenu?.remove();
    canvasShortcutMenu = null;
  }

  function showCanvasShortcutMenu(clientX, clientY) {
    closeCanvasShortcutMenu();
    const menu = el('div', 'trace-studio-canvas-menu');
    menu.append(el('strong', '', '作用時間線'));
    [
      ['directive', '目前指令'],
      ['selected', '已選取幀'],
      ['forward', '目前指令之後'],
      ['all', '所有幀']
    ].forEach(([value, label]) => {
      const button = el('button', value === scopeSelect.value ? 'is-active' : '', label);
      button.type = 'button';
      button.addEventListener('click', () => {
        scopeSelect.value = value;
        closeCanvasShortcutMenu();
      });
      menu.append(button);
    });
    document.body.append(menu);
    const bounds = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(clientX, window.innerWidth - bounds.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(clientY, window.innerHeight - bounds.height - 8))}px`;
    canvasShortcutMenu = menu;
    setTimeout(() => {
      menu._dismiss = event => {
        if (!menu.contains(event.target)) closeCanvasShortcutMenu();
      };
      window.addEventListener('pointerdown', menu._dismiss, true);
    });
  }

  function showObjectStateMenu(clientX, clientY, key) {
    closeCanvasShortcutMenu();
    setActiveObjectKey(key);
    setActiveBindingForKey(key);
    const menu = el('div', 'trace-studio-canvas-menu trace-studio-object-state-menu');
    menu.append(
      el('strong', 'trace-studio-object-menu-name', objectDisplayName(key)),
      el('span', 'trace-studio-object-menu-label', '物件狀態')
    );
    const currentState = objectVisibility(trace?.frames?.[currentIndex]?.id, key);
    [['visible', '顯示'], ['hidden', '隱藏']].forEach(([value, label]) => {
      const button = el('button', value === currentState ? 'is-active' : '', label);
      button.type = 'button';
      button.addEventListener('click', () => {
        setObjectVisibility(value);
        closeCanvasShortcutMenu();
      });
      menu.append(button);
    });
    document.body.append(menu);
    const bounds = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(clientX, window.innerWidth - bounds.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(clientY, window.innerHeight - bounds.height - 8))}px`;
    canvasShortcutMenu = menu;
    setTimeout(() => {
      menu._dismiss = event => {
        if (!menu.contains(event.target)) closeCanvasShortcutMenu();
      };
      window.addEventListener('pointerdown', menu._dismiss, true);
    });
  }

  function closeStudio() {
    cancelThumbnailCulling();
    cancelThumbnailRendering();
    cancelEventAvailabilityRefresh();
    endBoundObjectDrag();
    closeCanvasShortcutMenu();
    flushAutoSave();
    closeCameraFrame(true);
    writeSourceSettings();
    document.body.classList.remove('asm-trace-studio-open');
    activeObjectKey = '';
    renderPlayerFrame(currentIndex, { animatePositions: false });
  }

  function buildUi() {
    const main = document.getElementById('main');
    const vizPanel = document.getElementById('vizPanel');
    if (!main || !vizPanel || document.getElementById('traceStudioRail')) return;

    rail = el('aside', 'trace-studio-rail');
    rail.id = 'traceStudioRail';
    const railHeader = el('header', 'trace-studio-rail-head');
    railHeader.append(el('strong', '', '切片縮圖'));
    const historyControls = el('div', 'trace-studio-history');
    undoButton = el('button', '', '↶');
    undoButton.type = 'button';
    undoButton.title = '復原 (Ctrl+Z)';
    undoButton.addEventListener('click', undo);
    redoButton = el('button', '', '↷');
    redoButton.type = 'button';
    redoButton.title = '重做 (Ctrl+Y)';
    redoButton.addEventListener('click', redo);
    historyControls.append(undoButton, redoButton);
    const close = el('button', '', '返回程式碼');
    close.type = 'button';
    close.addEventListener('click', closeStudio);
    railHeader.append(historyControls, close);
    const frameList = el('div', 'trace-studio-frame-list');
    frameList.addEventListener('scroll', scheduleThumbnailCulling, { passive: true });
    rail.append(railHeader, frameList);

    inspector = buildInspector();
    timeline = el('div', 'trace-studio-timeline');
    timeline.id = 'traceStudioTimeline';
    const timelineHead = el('div', 'trace-studio-timeline-head');
    timelineHead.append(el('strong', '', '事件時間線'), el('small', '', 'Ctrl 或 Shift 可跨幀選取'));
    timeline.append(timelineHead, el('div', 'trace-studio-timeline-track'));

    main.insertBefore(rail, vizPanel);
    main.append(inspector);
    vizPanel.append(timeline);
    window.addEventListener('resize', scheduleThumbnailCulling);

    const canvas = document.getElementById('arraySvg');
    canvas?.addEventListener('pointerdown', beginTextSelection, true);
    canvas?.addEventListener('pointermove', moveTextSelection, true);
    canvas?.addEventListener('pointerup', endTextSelection, true);
    canvas?.addEventListener('pointercancel', endTextSelection, true);
    canvas?.addEventListener('click', event => {
      const object = event.target.closest('[data-trace-variable]');
      if (!object?.dataset.traceVariable) return;
      if (targetVariable) targetVariable.value = object.dataset.traceVariable;
      if (trackingTarget) trackingTarget.value = object.dataset.traceVariable;
      const cell = event.target.closest('[data-trace-index]');
      if (cell?.dataset.traceIndex != null && targetIndex) targetIndex.value = cell.dataset.traceIndex;
    });
    canvas?.addEventListener('pointermove', event => {
      if (event.buttons && window._canvasInteraction?.mode === 'drag') scheduleThumbnailSync();
    });
    canvas?.addEventListener('contextmenu', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const object = event.target.closest('.asm-trace-selectable[data-trace-object-key]');
      if (object) {
        showObjectStateMenu(event.clientX, event.clientY, object.dataset.traceObjectKey);
        return;
      }
      showCanvasShortcutMenu(event.clientX, event.clientY);
    }, true);
  }

  function open(source) {
    cancelThumbnailRendering();
    cancelEventAvailabilityRefresh();
    trace = source || window.ASMTracePlayer?.getDocument?.();
    if (!trace?.frames?.length) return;
    const canvasTab = document.querySelector('.tab-btn[data-tab="tab-canvas"]');
    if (canvasTab && !canvasTab.classList.contains('active')) canvasTab.click();
    ensureStudioData();
    buildUi();
    document.body.classList.add('asm-trace-studio-open');
    if (historyTrace !== trace) resetHistory();
    currentIndex = Math.max(0, window.ASMTracePlayer?.getCurrentFrame?.() || 0);
    activeBinding = null;
    activeObjectKey = '';
    inspectorMode = hasEventInspectorContent(trace.frames[currentIndex]) ? 'events' : 'camera';
    selectedFrames = new Set([trace.frames[currentIndex].id]);
    scopeSelect.value = window.ASMTraceViewSource?.directiveName?.(trace.frames[currentIndex])
      || String(trace.frames[currentIndex]?.source?.statementId || '').startsWith('manual-frame:')
      ? 'directive'
      : 'selected';
    selectionAnchor = currentIndex;
    refreshVariableOptions();
    renderRail();
    renderTimeline();
    renderEffects();
    renderSelection();
    renderObjectStateEditor();
    renderBindingEditor();
    renderPlayerFrame(currentIndex, { animateEvents: false, animatePositions: false });
    applyCameraForFrame(currentIndex, false);
  }

  function installDragHook() {
    const previous = window.onObjectDragEnd;
    window.onObjectDragEnd = function (id, dx, dy, dragType, newPosSpec) {
      const object = document.getElementById(id);
      const key = object?.dataset.traceObjectKey;
      if (trace && document.body.classList.contains('asm-trace-studio-open') && key && dragType !== 'start' && dragType !== 'end') {
        const frameIds = frameIdsForScope();
        const currentFrameId = trace.frames[currentIndex]?.id;
        const binding = frameBinding(currentFrameId, key);
        if (binding) {
          const currentSourceAnchor = window.ASMTraceRenderers?.currentAnchorForKey?.(
            key,
            binding.sourceAnchor || 'top',
            false
          );
          const desiredAnchor = currentSourceAnchor ? {
            x: currentSourceAnchor.x + dx,
            y: currentSourceAnchor.y + dy
          } : null;
          frameIds.forEach(frameId => {
            const next = frameBinding(frameId, key) || binding;
            const frameIndex = trace.frames.findIndex(frame => frame.id === frameId);
            const frame = trace.frames[frameIndex];
            const targetAnchor = frame && desiredAnchor
              ? window.ASMTraceRenderers?.frameAnchorForKey?.(
                trace,
                frame,
                next.targetKey,
                next.targetAnchor || 'center',
                frameIndex > 0 ? trace.frames[frameIndex - 1] : null
              )
              : null;
            trace.studio.bindings[frameId] ||= {};
            trace.studio.bindings[frameId][key] = {
              ...next,
              dx: targetAnchor ? desiredAnchor.x - targetAnchor.x : (Number(next.dx) || 0) + dx,
              dy: targetAnchor ? desiredAnchor.y - targetAnchor.y : (Number(next.dy) || 0) + dy
            };
          });
          refreshAfterPositionChange();
          return;
        }
        const bound = object.getAttribute('data-trace-bound') === '1';
        let baseX;
        let baseY;
        if (!bound && object.dataset.tracePositionX != null) {
          baseX = Number(object.dataset.tracePositionX) || 0;
          baseY = Number(object.dataset.tracePositionY) || 0;
        } else {
          [baseX, baseY] = String(object.getAttribute(bound ? 'data-studio-offset' : 'data-base-offset') || '0,0')
            .split(',').map(Number);
        }
        if (!bound && object.dataset.tracePositionX == null) {
          const placement = window.ASMTraceRenderers?.currentPlacement?.(key, false);
          if (placement) {
            baseX = placement.x;
            baseY = placement.y;
          }
        }
        const targetPosition = {
          x: (Number(baseX) || 0) + dx,
          y: (Number(baseY) || 0) + dy,
          absolute: !bound
        };
        frameIds.forEach(frameId => {
          trace.studio.positions[frameId] ||= {};
          trace.studio.positions[frameId][key] = { ...targetPosition };
        });
        refreshAfterPositionChange();
        return;
      }
      previous?.(id, dx, dy, dragType, newPosSpec);
    };
  }

  window.addEventListener('asm:trace-frame', event => {
    if (!trace || event.detail?.document !== trace) return;
    if (!document.body.classList.contains('asm-trace-studio-open')) return;
    const next = Math.max(0, Math.min(trace.frames.length - 1, Number(event.detail.index) || 0));
    currentIndex = next;
    if (textObjectKey(activeObjectKey) && !textSegmentForKey(activeObjectKey)) {
      setActiveObjectKey('');
      activeBinding = null;
    }
    if (studioRenderDepth === 0) {
      selectedFrames = new Set([trace.frames[next].id]);
      selectionAnchor = next;
    }
    renderSelection();
    renderObjectStateEditor();
    renderBindingEditor();
    applyCameraForFrame(currentIndex, Boolean(event.detail?.previousFrame), 0, event.detail?.previousFrame || null);
    if (studioRenderDepth === 0) revealCurrentFrameInRail();
  });

  window.addEventListener('asm:trace-menu-colors', event => {
    if (!trace || event.detail?.document !== trace) return;
    renderRail();
    renderTimeline();
    renderSelection();
  });

  window.addEventListener('asm:trace-event-settings-changed', event => {
    if (!trace || event.detail?.document !== trace) return;
    setEventGap(trace.studio?.eventSettings?.gapMs ?? 500, false);
    renderFrameEventsEditor();
    renderRail();
    renderTimeline();
    renderInspectorNavigation();
  });

  window.addEventListener('asm:trace-event-availability-changed', event => {
    if (!trace || event.detail?.document !== trace
      || !document.body.classList.contains('asm-trace-studio-open')) return;
    pendingAvailabilityFrames.add(event.detail.frameId);
    if (!availabilityRefreshFrame) {
      availabilityRefreshFrame = requestAnimationFrame(refreshEventAvailability);
    }
  });

  window.addEventListener('asm:trace-event-gap-input', event => {
    if (!trace || event.detail?.document !== trace) return;
    setEventGap(event.detail?.gapMs ?? 500, false);
  });

  window.addEventListener('asm:trace-object-selected', event => {
    if (!trace || !document.body.classList.contains('asm-trace-studio-open')) return;
    const key = event.detail?.key || '';
    setActiveObjectKey(key);
    setActiveBindingForKey(key);
  });

  document.addEventListener('DOMContentLoaded', installDragHook);
  window.addEventListener('keydown', event => {
    if (!document.body.classList.contains('asm-trace-studio-open') || !(event.ctrlKey || event.metaKey)) return;
    const tag = event.target?.tagName?.toLowerCase();
    if (['input', 'textarea', 'select'].includes(tag) || event.target?.isContentEditable) return;
    const key = event.key.toLowerCase();
    if (key !== 'z' && key !== 'y') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (key === 'y' || event.shiftKey) redo();
    else undo();
  }, true);
  window.ASMTraceStudio = {
    open,
    close: closeStudio,
    refresh() {
      if (!trace || !document.body.classList.contains('asm-trace-studio-open')) return;
      renderRail();
      renderTimeline();
      renderSelection();
      renderFrameEventsEditor();
      renderInspectorNavigation();
    },
    refreshViewport() {
      if (!trace || !document.body.classList.contains('asm-trace-studio-open')) return;
      applyCameraForFrame(currentIndex, false);
      scheduleThumbnailCulling();
      if (cameraFrameState) {
        const viewport = window.getCameraViewport?.(cameraFrameState.zoom);
        if (viewport) {
          cameraFrameState.width = viewport.width;
          cameraFrameState.height = viewport.height;
          cameraFrameState.aspect = viewport.aspect;
        }
        renderCameraFrame();
      }
    },
    bindPosition,
    unbindPosition,
    moveBoundObjects,
    endBoundObjectDrag,
    flushSourceSettings() {
      flushAutoSave();
      closeCameraFrame(true);
      return writeSourceSettings();
    },
    getBinding: key => frameBinding(trace?.frames?.[currentIndex]?.id, key),
    getBindings: () => trace?.studio?.bindings || {}
  };
})();
