(function () {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const TRACE_ROOT_OFFSET = { x: 90, y: 80 };
  const renderers = new Map();
  let currentScene = null;

  function eventAnimation(type) {
    return window.ASMTraceEvents?.animation?.(type) || 'none';
  }

  function svg(name, attributes = {}, text = '') {
    const element = document.createElementNS(SVG_NS, name);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
    if (text !== '') element.textContent = text;
    return element;
  }

  function displayValue(data) {
    if (!data || typeof data !== 'object') return String(data ?? '');
    if (Object.prototype.hasOwnProperty.call(data, 'value')) return String(data.value ?? '');
    if (data.kind === 'reference') return data.address || 'null';
    if (data.kind === 'pair') return (data.items || []).map(displayValue).join(', ');
    return data.label || data.type || data.kind || '';
  }

  function applyHighlight(element, highlight = {}) {
    const color = highlight.color || highlight.fill || highlight.stroke;
    const typed = highlight.styleTypes || {};
    const background = typed.background || (highlight.styleType === 'background' ? color : '');
    const stroke = typed.highlight || typed.focus
      || (highlight.styleType && highlight.styleType !== 'background' ? color : '');
    if (background) element.setAttribute('fill', background);
    if (stroke) element.setAttribute('stroke', stroke);
    if (highlight.fill) element.setAttribute('fill', highlight.fill);
    if (highlight.stroke) element.setAttribute('stroke', highlight.stroke);
    if (highlight.animation) element.classList.add(highlight.animation);
    if (highlight.eventType) element.dataset.eventType = highlight.eventType;
  }

  function originalStyles(highlights = {}, itemCount = 1) {
    const styles = [];
    Object.entries(highlights).forEach(([key, highlight]) => {
      const indices = key === '$object'
        ? Array.from({ length: itemCount }, (_, index) => index)
        : [Number(key)];
      const valid = indices.filter(index => Number.isInteger(index) && index >= 0 && index < itemCount);
      if (!valid.length) return;
      if (highlight.fixedMark) {
        styles.push({ type: 'mark', color: highlight.fixedMark, elements: valid });
      }
      const typedStyles = highlight.styleTypes || {};
      Object.entries(typedStyles).forEach(([type, color]) => {
        if (color) styles.push({ type, color, elements: valid });
      });
      if (!Object.keys(typedStyles).length && highlight.styleType && highlight.color) {
        styles.push({ type: highlight.styleType, color: highlight.color, elements: valid });
      }
      if (highlight.fill && !typedStyles.background) {
        styles.push({ type: 'background', color: highlight.fill, elements: valid });
      }
      if (highlight.stroke && !typedStyles.highlight) {
        styles.push({ type: 'highlight', color: highlight.stroke, elements: valid });
      }
    });
    return styles;
  }

  function originalBoundsHeight(group, fallback = 78) {
    const top = Number(group.getAttribute('data-outerframe-top'));
    const bottom = Number(group.getAttribute('data-outerframe-bottom'));
    if (Number.isFinite(top) && Number.isFinite(bottom) && bottom > top) return bottom - top + 24;
    try {
      const box = group.getBBox();
      if (box.height > 0) return box.height + 24;
    } catch (error) {
      // The SVG may be detached while an embedded editor is initializing.
    }
    return fallback;
  }

  function measuredBox(element, fallback) {
    const left = Number(element?.getAttribute?.('data-outerframe-left'));
    const top = Number(element?.getAttribute?.('data-outerframe-top'));
    const right = Number(element?.getAttribute?.('data-outerframe-right'));
    const bottom = Number(element?.getAttribute?.('data-outerframe-bottom'));
    if ([left, top, right, bottom].every(Number.isFinite) && right > left && bottom > top) {
      return { x: left, y: top, width: right - left, height: bottom - top };
    }
    try {
      const box = element.getBBox();
      if (box.width > 0 && box.height > 0) return box;
    } catch (error) {
      // Use the renderer's deterministic estimate below.
    }
    return fallback;
  }

  function safeKey(value) {
    return String(value || 'object').replace(/[^A-Za-z0-9_-]/g, '-');
  }

  function markSelectable(element, key, context = {}, parentKey = '') {
    if (!element || !key) return element;
    element.classList.add('asm-trace-selectable');
    if (context.interactive !== false && context.movable === true) {
      element.classList.add('draggable-object');
      element.setAttribute('data-trace-movable', '1');
    }
    element.setAttribute('data-trace-object-key', key);
    if (parentKey) element.setAttribute('data-trace-parent-key', parentKey);
    if (!element.id) element.id = `${context.idPrefix || 'trace'}-part-${safeKey(key)}`;
    element.setAttribute('data-translate', '0,0');
    element.setAttribute('data-base-transform', element.getAttribute('transform') || '');
    return element;
  }

  function originalValues(entry) {
    if (entry.data?.kind === 'map') {
      return (entry.data.entries || []).map(item => `${displayValue(item.key)}: ${displayValue(item.value)}`);
    }
    if (Array.isArray(entry.data?.items)) return entry.data.items.map(displayValue);
    return [displayValue(entry.data)];
  }

  function isScalarRenderer(variable, rendererName) {
    return rendererName === 'original-cell'
      || ['scalar', 'string'].includes(variable?.kind);
  }

  function removeScalarIndexLabels(content, variable, rendererName) {
    if (!isScalarRenderer(variable, rendererName)) return;
    content.querySelectorAll('[id$="-index"], [data-trace-index-label]').forEach(label => label.remove());
  }

  function renderOriginal(group, entry, context) {
    if (typeof window.draw_array_normal !== 'function') {
      return Array.isArray(entry.data?.items) ? renderSequence(group, entry, context) : renderScalar(group, entry, context);
    }
    const id = `${context.idPrefix || 'trace-original'}-${context.variableId.replace(/[^A-Za-z0-9_-]/g, '-')}`;
    const rendererOptions = context.skin?.options || {};
    const gap = Number.isFinite(Number(rendererOptions.gap)) ? Number(rendererOptions.gap) : 0;
    const requested = context.rendererName || 'original-array';
    const isScalarCell = isScalarRenderer(context.variable, requested);
    const configuredShowIndex = rendererOptions.showIndex;
    const configuredIndexMode = Number(rendererOptions.indexMode);
    const indexMode = isScalarCell ? 0 : Number.isFinite(configuredIndexMode)
      ? Math.max(0, Math.min(4, Math.trunc(configuredIndexMode)))
      : (configuredShowIndex === false ? 0 : 1);
    const isMatrix = requested === 'original-matrix' || context.variable.kind === 'matrix';
    let values = originalValues(entry);
    let itemsPerRow = Infinity;
    if (isMatrix) {
      const rows = Array.isArray(entry.data?.items) ? entry.data.items : [];
      const columns = Math.max(1, ...rows.map(row => Array.isArray(row?.items) ? row.items.length : 0));
      values = rows.flatMap(row => Array.from({ length: columns }, (_, index) => displayValue(row?.items?.[index])));
      itemsPerRow = columns;
    }
    if (!values.length) values = [''];
    const configuredColumns = Number(rendererOptions.columns);
    if (Number.isFinite(configuredColumns) && configuredColumns > 0) {
      itemsPerRow = Math.max(1, Math.trunc(configuredColumns));
    }
    const configuredRange = Array.isArray(rendererOptions.range) ? rendererOptions.range : [];
    const rangeStart = Number.isFinite(Number(configuredRange[0]))
      ? Math.max(0, Math.min(values.length, Math.trunc(Number(configuredRange[0]))))
      : 0;
    const rangeEndExclusive = Number.isFinite(Number(configuredRange[1]))
      ? Math.max(rangeStart, Math.min(values.length, Math.trunc(Number(configuredRange[1]))))
      : values.length;
    const range = [rangeStart, rangeEndExclusive - 1];
    const visibleCount = Math.max(0, rangeEndExclusive - rangeStart);
    const styles = originalStyles(context.highlights, values.length);
    const mode = requested.replace(/^original-/, '');
    if (mode === 'heap' && typeof window.draw_array_heap === 'function') {
      window.draw_array_heap(group, id, values, styles, range, indexMode, gap);
    } else if (mode === 'segment-tree' && typeof window.draw_array_segment_tree === 'function') {
      window.draw_array_segment_tree(group, id, values, styles, range, indexMode, gap, [], [], [], [], [], [], []);
    } else if (mode === 'bit' && typeof window.draw_array_BIT === 'function') {
      window.draw_array_BIT(group, id, values, styles, range, indexMode, gap);
    } else if (mode === 'disk' && typeof window.draw_array_disk === 'function') {
      window.draw_array_disk(group, id, values, styles, range, itemsPerRow, indexMode);
    } else if (mode === 'stack' && typeof window.draw_array_stack === 'function') {
      window.draw_array_stack(group, id, values, styles, range, indexMode, gap);
    } else if (mode === 'queue' && typeof window.draw_array_queue === 'function') {
      window.draw_array_queue(group, id, values, styles, range, indexMode, gap);
    } else {
      window.draw_array_normal(group, id, values, styles, range, itemsPerRow, indexMode, gap);
    }
    group.setAttribute('data-trace-range-start', String(rangeStart));
    group.setAttribute('data-trace-range-end', String(rangeEndExclusive));
    removeScalarIndexLabels(group, context.variable, requested);
    Array.from({ length: visibleCount }, (_, localIndex) => rangeStart + localIndex).forEach((logicalIndex, localIndex) => {
      const cell = group.querySelector(`#${CSS.escape(`cell-${id}-${localIndex}`)}`);
      const cellKey = isMatrix
        ? `${context.variableId}#${Math.floor(logicalIndex / itemsPerRow)},${logicalIndex % itemsPerRow}`
        : `${context.variableId}#${logicalIndex}`;
      if (cell) {
        cell.setAttribute('data-trace-index', String(logicalIndex));
        markSelectable(cell, cellKey, context, context.variableId);
      }
      ['highlight', 'point', 'mark'].forEach(kind => {
        const hint = group.querySelector(`#${CSS.escape(`${kind}-${id}-${localIndex}`)}`);
        if (!hint) return;
        hint.setAttribute('data-trace-attached-to', cellKey);
        hint.setAttribute('data-trace-attachment-kind', kind);
        if (kind === 'highlight' || kind === 'point') {
          const highlight = context.highlights?.[String(logicalIndex)]
            || context.highlights?.$object
            || {};
          const sourceIdentity = String(
            highlight.sourceStyleIds?.[kind]
            || highlight.sourceStyleId
            || highlight.eventId
            || `${context.variableId}:${logicalIndex}`
          );
          window.HintWidgets?.continuePresentationLoop?.(
            hint,
            `${kind}:${sourceIdentity}`
          );
        }
      });
      const indexLabel = group.querySelector(`#${CSS.escape(`cell-${id}-${localIndex}-index`)}`);
      if (indexLabel) {
        indexLabel.setAttribute('data-trace-index-label', String(logicalIndex));
        markSelectable(indexLabel, `${cellKey}:index`, context, context.variableId);
      }
    });
    group.querySelectorAll(':scope > .outerframe-label').forEach(label => {
      label.textContent = context.variable?.name || '';
      label.setAttribute('font-family', 'Arial');
      label.setAttribute('font-size', '16');
      label.setAttribute('font-weight', 'bold');
      markSelectable(label, `${context.variableId}:label`, context, context.variableId);
    });
    return originalBoundsHeight(group, isMatrix ? Math.max(78, Math.ceil(visibleCount / itemsPerRow) * 52 + 24) : 78);
  }

  function renderSequence(group, entry, context) {
    const items = Array.isArray(entry.data?.items) ? entry.data.items : [];
    const cellSize = Math.max(32, Math.min(72, Number(context.skin?.options?.cellSize) || 52));
    const gap = Number.isFinite(Number(context.skin?.options?.gap)) ? Number(context.skin.options.gap) : 0;
    items.forEach((item, index) => {
      const x = index * (cellSize + gap);
      const logicalIndex = context.rowIndex == null ? String(index) : `${context.rowIndex},${index}`;
      const cellKey = `${context.variableId}#${logicalIndex}`;
      const cell = markSelectable(svg('g', {
        transform: `translate(${x}, 0)`,
        'data-trace-index': context.rowIndex == null ? index : logicalIndex
      }), cellKey, context, context.variableId);
      const rect = svg('rect', { x: 0, y: 0, width: cellSize, height: cellSize, fill: '#ffffff', stroke: '#59656b', 'stroke-width': 1 });
      applyHighlight(rect, context.highlights?.[String(index)] || context.highlights?.$object);
      cell.append(rect, svg('text', {
        x: cellSize / 2,
        y: cellSize / 2 + 6,
        'text-anchor': 'middle',
        'font-family': 'Arial',
        'font-size': Math.max(14, Math.min(24, cellSize * 0.36)),
        fill: '#1f282d'
      }, displayValue(item)));
      if (context.skin?.options?.showIndex !== false) {
        const indexLabel = markSelectable(svg('text', {
          x: cellSize / 2,
          y: cellSize + 18,
          'text-anchor': 'middle',
          'font-family': 'Arial',
          'font-size': 12,
          fill: '#7b858a'
        }, String(index)), `${cellKey}:index`, context, context.variableId);
        cell.append(indexLabel);
      }
      group.append(cell);
    });
    return Math.max(cellSize + 24, 78);
  }

  function renderMatrix(group, entry, context) {
    const rows = Array.isArray(entry.data?.items) ? entry.data.items : [];
    let height = 0;
    rows.forEach((row, rowIndex) => {
      const rowGroup = svg('g', { transform: `translate(0, ${rowIndex * 58})` });
      renderSequence(rowGroup, { data: { items: row?.items || [] } }, {
        ...context,
        rowIndex,
        skin: { ...context.skin, options: { ...context.skin?.options, showIndex: false } }
      });
      group.append(rowGroup);
      height = (rowIndex + 1) * 58;
    });
    return Math.max(70, height + 10);
  }

  function renderScalar(group, entry, context) {
    const rect = svg('rect', { x: 0, y: 0, width: 150, height: 52, fill: '#ffffff', stroke: '#59656b', 'stroke-width': 1 });
    applyHighlight(rect, context.highlights?.$object);
    group.append(rect, svg('text', {
      x: 75, y: 33, 'text-anchor': 'middle', 'font-family': 'Arial', 'font-size': 24, fill: '#1f282d'
    }, displayValue(entry.data)));
    return 68;
  }

  function renderObject(group, entry) {
    const fields = entry.data?.fields && typeof entry.data.fields === 'object' ? entry.data.fields : {};
    const lines = Object.entries(fields);
    const height = Math.max(58, 32 + lines.length * 26);
    group.append(svg('rect', { x: 0, y: 0, width: 260, height, fill: '#ffffff', stroke: '#59656b', 'stroke-width': 1 }));
    if (!lines.length) {
      group.append(svg('text', { x: 16, y: 34, 'font-family': 'Arial', 'font-size': 16, fill: '#667278' }, entry.data?.type || 'Object'));
    } else {
      lines.forEach(([key, value], index) => group.append(svg('text', {
        x: 16, y: 30 + index * 26, 'font-family': 'Arial', 'font-size': 16, fill: '#1f282d'
      }, `${key}: ${displayValue(value)}`)));
    }
    return height + 16;
  }

  function renderGraph(group, entry) {
    const nodes = Object.entries(entry.data?.nodes || {});
    const edges = Array.isArray(entry.data?.edges) ? entry.data.edges : [];
    const positions = {};
    nodes.forEach(([id, node], index) => {
      positions[id] = {
        x: Number(node.x) || 70 + (index % 6) * 110,
        y: Number(node.y) || 45 + Math.floor(index / 6) * 90
      };
    });
    edges.forEach(edge => {
      const from = positions[edge.from];
      const to = positions[edge.to];
      if (from && to) group.append(svg('line', { x1: from.x, y1: from.y, x2: to.x, y2: to.y, stroke: '#59656b', 'stroke-width': 2 }));
    });
    nodes.forEach(([id, node]) => {
      const position = positions[id];
      group.append(svg('circle', { cx: position.x, cy: position.y, r: 24, fill: '#ffffff', stroke: '#59656b', 'stroke-width': 1 }));
      group.append(svg('text', { x: position.x, y: position.y + 6, 'text-anchor': 'middle', 'font-family': 'Arial', 'font-size': 16 }, node.label ?? node.value ?? id));
    });
    return Math.max(110, 80 + Math.ceil(nodes.length / 6) * 90);
  }

  function renderCoordinateSystem(group, entry) {
    const width = 520;
    const height = 240;
    group.append(svg('line', { x1: 30, y1: height / 2, x2: width, y2: height / 2, stroke: '#59656b' }));
    group.append(svg('line', { x1: width / 2, y1: 10, x2: width / 2, y2: height - 10, stroke: '#59656b' }));
    const points = Array.isArray(entry.data?.points) ? entry.data.points : [];
    const xs = points.map(point => Number(point.x) || 0);
    const ys = points.map(point => Number(point.y) || 0);
    const maxX = Math.max(1, ...xs.map(Math.abs));
    const maxY = Math.max(1, ...ys.map(Math.abs));
    points.forEach(point => {
      const x = width / 2 + (Number(point.x) || 0) / maxX * (width / 2 - 40);
      const y = height / 2 - (Number(point.y) || 0) / maxY * (height / 2 - 24);
      group.append(svg('circle', { cx: x, cy: y, r: 6, fill: point.color || '#1d8f83' }));
      if (point.label) group.append(svg('text', { x: x + 9, y: y - 8, 'font-family': 'Arial', 'font-size': 13 }, point.label));
    });
    return height + 20;
  }

  function register(name, renderer) {
    if (typeof name === 'string' && typeof renderer === 'function') renderers.set(name, renderer);
  }

  function studioPosition(document, frame, key) {
    const position = document.studio?.positions?.[frame.id]?.[key];
    return {
      x: Number(position?.x) || 0,
      y: Number(position?.y) || 0,
      absolute: position?.absolute === true
    };
  }

  function snapshotObjectKey(snapshot) {
    return String(snapshot?.objectId || snapshot?.id || '');
  }

  function keepSnapshotObjectKeys(document, frame, sourceObjectKey = '') {
    const snapshotsById = new Map((document?.snapshots || []).map(snapshot => [snapshot.id, snapshot]));
    const objectKeys = (frame?.snapshotIds || []).map(snapshotId => (
      snapshotObjectKey(snapshotsById.get(snapshotId))
    )).filter(Boolean);
    const sourceIndex = sourceObjectKey ? objectKeys.indexOf(sourceObjectKey) : -1;
    return sourceIndex >= 0 ? objectKeys.slice(0, sourceIndex) : objectKeys;
  }

  function keepUnionPlacement(document, frame, placements, sourceObjectKey = '') {
    const snapshotsById = new Map((document?.snapshots || []).map(snapshot => [snapshot.id, snapshot]));
    const visibilityStates = document?.studio?.visibility?.[frame?.id] || {};
    const snapshotIdsByObjectKey = new Map((frame?.snapshotIds || []).map(snapshotId => {
      const objectKey = snapshotObjectKey(snapshotsById.get(snapshotId));
      return [objectKey, snapshotId];
    }));
    const boxes = keepSnapshotObjectKeys(document, frame, sourceObjectKey).map(objectKey => {
      const snapshotId = snapshotIdsByObjectKey.get(objectKey);
      if (!objectKey || (visibilityStates[objectKey] || visibilityStates[snapshotId]) === 'hidden') return null;
      return placements.get(objectKey) || null;
    }).filter(box => box && [box.x, box.y, box.width, box.height].every(Number.isFinite));
    if (!boxes.length) return null;
    const left = Math.min(...boxes.map(box => box.x));
    const top = Math.min(...boxes.map(box => box.y));
    const right = Math.max(...boxes.map(box => box.x + box.width));
    const bottom = Math.max(...boxes.map(box => box.y + box.height));
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  function snapshotStudioPosition(document, frame, snapshot) {
    const positions = document.studio?.positions?.[frame.id] || {};
    const objectKey = snapshotObjectKey(snapshot);
    const key = Object.prototype.hasOwnProperty.call(positions, objectKey)
      ? objectKey
      : snapshot.id;
    return studioPosition(document, frame, key);
  }

  function objectKeyForVariable(frame, variableId) {
    const source = frame?.source || {};
    if (source.objectId && source.primaryVariableId === variableId) return source.objectId;
    return variableId;
  }

  function objectPositions(rootSvg) {
    const positions = new Map();
    rootSvg.querySelectorAll('#asm-trace-root [data-trace-object-key]').forEach(object => {
      const rendered = String(object.getAttribute('data-trace-render-position') || '').split(',').map(Number);
      const [x, y] = rendered.length === 2 && rendered.every(Number.isFinite)
        ? rendered
        : String(object.getAttribute('data-base-offset') || '0,0').split(',').map(Number);
      positions.set(object.dataset.traceObjectKey, { x: Number(x) || 0, y: Number(y) || 0 });
    });
    return positions;
  }

  function objectMotionPositions(rootSvg, fallbackPositions) {
    const positions = new Map(fallbackPositions || objectPositions(rootSvg));
    rootSvg.querySelectorAll(
      '#asm-trace-root [data-trace-object-key][data-trace-position-space="origin"]'
    ).forEach(object => {
      const x = Number(object.getAttribute('data-trace-position-x'));
      const y = Number(object.getAttribute('data-trace-position-y'));
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      positions.set(object.dataset.traceObjectKey, { x, y });
    });
    return positions;
  }

  function captureTopLevelObjects(rootSvg) {
    const root = rootSvg.querySelector('#asm-trace-root');
    const captured = new Map();
    if (!root) return captured;
    root.querySelectorAll('[data-trace-object-key]').forEach(element => {
      const parentObject = element.parentElement?.closest?.('[data-trace-object-key]');
      if (parentObject && root.contains(parentObject)) return;
      const key = element.dataset.traceObjectKey;
      if (!key || captured.has(key)) return;
      const clone = element.cloneNode(true);
      clone.querySelectorAll('animate, animateTransform, animateMotion').forEach(animation => animation.remove());
      [clone, ...clone.querySelectorAll('[id]')].forEach(node => node.removeAttribute?.('id'));
      clone.removeAttribute('data-trace-object-key');
      clone.classList.add('asm-trace-transition-ghost');
      clone.setAttribute('pointer-events', 'none');
      captured.set(key, clone);
    });
    return captured;
  }

  function transitionVisualSignature(element) {
    if (!element) return '';
    const visual = element.querySelector?.(':scope > .asm-trace-motion') || element;
    const clone = visual.cloneNode(true);
    clone.querySelectorAll('animate, animateTransform, animateMotion').forEach(animation => animation.remove());
    clone.querySelectorAll('[data-trace-binding-handle], [data-trace-anchor]').forEach(control => control.remove());
    [clone, ...clone.querySelectorAll('[id]')].forEach(node => node.removeAttribute?.('id'));
    return clone.innerHTML.replace(/\s+/g, ' ').trim();
  }

  function capturedKeysByRuntimeIdentity(captured) {
    const keys = new Map();
    captured?.forEach?.((element, key) => {
      const identity = element?.dataset?.traceRuntimeIdentity || '';
      if (identity && !keys.has(identity)) keys.set(identity, key);
    });
    return keys;
  }

  function capturedObjectFor(captured, element, requestedKey, identityKeys) {
    if (requestedKey && captured?.has?.(requestedKey)) {
      return { key: requestedKey, element: captured.get(requestedKey) };
    }
    const identity = element?.dataset?.traceRuntimeIdentity || '';
    const aliasKey = identity ? identityKeys.get(identity) : '';
    return {
      key: aliasKey || requestedKey || '',
      element: aliasKey ? captured.get(aliasKey) : null
    };
  }

  function animationAttributes(plan) {
    const timing = window.ASMTraceTransitions?.timing?.(plan) || {
      dur: '520ms', calcMode: 'spline', keySplines: '0.22 1 0.36 1'
    };
    const attributes = {
      dur: timing.dur,
      begin: 'indefinite',
      fill: 'freeze',
      calcMode: timing.calcMode,
      keyTimes: '0;1'
    };
    if (timing.keySplines) attributes.keySplines = timing.keySplines;
    return attributes;
  }

  function startSvgAnimation(animation) {
    if (!animation) return;
    requestAnimationFrame(() => {
      if (!animation.isConnected || typeof animation.beginElement !== 'function') return;
      animation.beginElement();
    });
  }

  function animateOpacity(element, plan, from = 0, to = 1) {
    const animation = svg('animate', {
      attributeName: 'opacity',
      from, to,
      ...animationAttributes(plan)
    });
    element.prepend(animation);
    startSvgAnimation(animation);
  }

  function animatePosition(motion, previous, current, enabled, plan = null, additive = false) {
    if (!enabled || !plan || plan.mode === 'instant' || Number(plan.duration) <= 0) return;
    if (plan.mode === 'fade') {
      animateOpacity(motion, plan);
      return;
    }
    if (!previous || plan.mode === 'lift') {
      const attributes = {
        attributeName: 'transform',
        type: 'translate',
        from: '0 24',
        to: '0 0',
        ...animationAttributes(plan)
      };
      if (additive) attributes.additive = 'sum';
      const animation = svg('animateTransform', attributes);
      motion.prepend(animation);
      startSvgAnimation(animation);
      animateOpacity(motion, plan);
      return;
    }
    const dx = (Number(previous.x) || 0) - (Number(current.x) || 0);
    const dy = (Number(previous.y) || 0) - (Number(current.y) || 0);
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
    const attributes = {
      attributeName: 'transform',
      type: 'translate',
      ...animationAttributes(plan)
    };
    if (plan.mode === 'arc') {
      const arcHeight = Math.max(18, Math.min(90, Math.hypot(dx, dy) * 0.22));
      attributes.values = `${dx} ${dy};${dx / 2} ${dy / 2 - arcHeight};0 0`;
      attributes.keyTimes = '0;0.5;1';
      attributes.calcMode = 'spline';
      attributes.keySplines = '0.22 1 0.36 1;0.22 1 0.36 1';
    } else {
      attributes.from = `${dx} ${dy}`;
      attributes.to = '0 0';
    }
    if (additive) attributes.additive = 'sum';
    const animation = svg('animateTransform', attributes);
    motion.prepend(animation);
    startSvgAnimation(animation);
  }

  function transitionForKey(options, key) {
    return options.transitionForKey?.(key) || null;
  }

  function previousPositionForKey(options, key) {
    const plan = transitionForKey(options, key);
    return {
      plan,
      previous: options.previousPositions?.get(plan?.sourceKey || key)
    };
  }

  function animateObjectPosition(motion, options, key, current) {
    const { plan, previous } = previousPositionForKey(options, key);
    animatePosition(motion, previous, current, options.animatePositions !== false, plan);
  }

  function animateChangedObjects(captured, elements, options) {
    if (options.animatePositions === false || !captured?.size) return;
    const identityKeys = capturedKeysByRuntimeIdentity(captured);
    elements.forEach((element, key) => {
      const plan = transitionForKey(options, key);
      if (plan?.requestedMode !== 'auto' || !plan.sourceExists || Number(plan.duration) <= 0) return;
      const hasDedicatedSwap = (options.frame?.events || []).some(event => (
        event.type === 'swap' && (event.targets || []).some(target => target.variableId === key)
      ));
      if (hasDedicatedSwap) return;
      const previousMatch = capturedObjectFor(
        captured, element, plan.sourceKey || key, identityKeys
      );
      const previous = previousMatch.element;
      if (!previous || transitionVisualSignature(previous) === transitionVisualSignature(element)) return;
      const currentIdentity = element.dataset.traceRuntimeIdentity || '';
      const previousIdentity = previous.dataset.traceRuntimeIdentity || '';
      if (currentIdentity && currentIdentity === previousIdentity) return;
      const motion = element.querySelector(':scope > .asm-trace-motion') || element;
      if (motion.querySelector(':scope > animate[attributeName="opacity"]')) return;
      animateOpacity(motion, plan, 0.35, 1);
    });
  }

  function animateRemovedObjects(root, captured, elements, document, options) {
    if (options.animatePositions === false || !captured?.size) return;
    const consumed = new Set();
    const identityKeys = capturedKeysByRuntimeIdentity(captured);
    elements.forEach((element, key) => {
      const plan = transitionForKey(options, key);
      if (plan?.sourceKey) consumed.add(plan.sourceKey);
      const identity = element?.dataset?.traceRuntimeIdentity || '';
      const aliasKey = identity ? identityKeys.get(identity) : '';
      if (aliasKey) consumed.add(aliasKey);
    });
    const defaults = window.ASMTraceTransitions?.defaults?.(document) || {
      duration: 360, easing: 'smooth'
    };
    captured.forEach((ghost, key) => {
      if (consumed.has(key)) return;
      const plan = { mode: 'fade', duration: defaults.duration, easing: defaults.easing };
      root.prepend(ghost);
      const animation = svg('animate', {
        attributeName: 'opacity', from: 1, to: 0,
        ...animationAttributes(plan)
      });
      const lift = svg('animateTransform', {
        attributeName: 'transform', type: 'translate', additive: 'sum',
        from: '0 0', to: '0 -15',
        ...animationAttributes(plan)
      });
      ghost.append(animation, lift);
      startSvgAnimation(animation);
      startSvgAnimation(lift);
      window.setTimeout(() => ghost.remove(), Number(plan.duration) + 80);
    });
  }

  function ensureArrowMarker(rootSvg, idPrefix = 'asm-trace') {
    const defsId = `${idPrefix}-studio-defs`;
    const markerId = `${idPrefix}-arrowhead`;
    let defs = rootSvg.querySelector(`#${defsId}`);
    if (defs) return markerId;
    defs = svg('defs', { id: defsId });
    const marker = svg('marker', {
      id: markerId, viewBox: '0 0 10 10', refX: 9, refY: 5,
      markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse'
    });
    marker.append(svg('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: 'context-stroke' }));
    defs.append(marker);
    rootSvg.prepend(defs);
    return markerId;
  }

  function ensureKeepArrowMarker(rootSvg, idPrefix, color) {
    const markerId = `${idPrefix}-keep-arrowhead`;
    let marker = rootSvg.querySelector(`#${markerId}`);
    if (marker) return markerId;
    let defs = rootSvg.querySelector('defs');
    if (!defs) {
      defs = svg('defs');
      rootSvg.prepend(defs);
    }
    marker = svg('marker', {
      id: markerId,
      viewBox: '0 0 10 10',
      refX: 0,
      refY: 5,
      markerWidth: 3,
      markerHeight: 3,
      markerUnits: 'strokeWidth',
      orient: 'auto-start-reverse'
    });
    marker.append(svg('path', { d: 'M 0 0 L 10 5 L 0 10 Z', fill: color }));
    defs.append(marker);
    return markerId;
  }

  function closestEdgePoints(from, to) {
    const fromCenter = anchorPoint(from, 'center');
    const toCenter = anchorPoint(to, 'center');
    const horizontal = Math.abs(toCenter.x - fromCenter.x) > Math.abs(toCenter.y - fromCenter.y);
    if (horizontal) {
      const movingRight = toCenter.x >= fromCenter.x;
      return {
        start: anchorPoint(from, movingRight ? 'right' : 'left'),
        end: anchorPoint(to, movingRight ? 'left' : 'right')
      };
    }
    const movingDown = toCenter.y >= fromCenter.y;
    return {
      start: anchorPoint(from, movingDown ? 'bottom' : 'top'),
      end: anchorPoint(to, movingDown ? 'top' : 'bottom')
    };
  }

  function keepArrowObjectKey(fromStageKey, runtimeIdentity, variableId) {
    const sourceKey = String(fromStageKey || 'snapshot');
    const continuityKey = runtimeIdentity
      ? `identity:${runtimeIdentity}`
      : `variable:${variableId || ''}`;
    return `keep-arrow:${sourceKey}:${continuityKey}`;
  }

  function renderKeepLastArrows(rootSvg, root, document, frame, placements, elements, keepNodes, options = {}) {
    if (!keepNodes.length) return;
    const color = 'rgba(255, 58, 58, 0.7)';
    const width = 4;
    const headShrink = 12;
    const markerId = ensureKeepArrowMarker(rootSvg, options.idPrefix || 'asm-trace', color);
    const layer = svg('g', {
      id: `${options.idPrefix || 'asm-trace'}-keep-arrows`,
      class: 'asm-trace-keep-arrows',
      'pointer-events': 'none'
    });
    const byVariable = new Map();
    keepNodes.forEach(node => {
      const groupKey = node.runtimeIdentity
        ? `identity:${node.runtimeIdentity}`
        : `variable:${node.variableId}`;
      if (!byVariable.has(groupKey)) byVariable.set(groupKey, []);
      byVariable.get(groupKey).push(node);
    });

    byVariable.forEach(nodes => {
      const runtimeIdentity = nodes.find(node => node.runtimeIdentity)?.runtimeIdentity || '';
      const variableId = nodes.map(node => node.variableId).find(id => frame.state?.[id])
        || (runtimeIdentity
          ? Object.entries(frame.state || {}).find(([, entry]) => (
            String(entry?.identity || '') === String(runtimeIdentity)
          ))?.[0]
          : '')
        || nodes[0]?.variableId;
      const currentKey = objectKeyForVariable(frame, variableId);
      const current = placements.get(currentKey);
      if (!current || !elements.get(currentKey)) return;
      const stages = nodes.map(node => {
        const snapshotBox = placements.get(node.snapshotId);
        if (!snapshotBox) return null;
        return {
          key: node.snapshotId,
          placement: {
            x: snapshotBox.x + node.relative.x,
            y: snapshotBox.y + node.relative.y,
            width: node.relative.width,
            height: node.relative.height
          }
        };
      }).filter(Boolean);
      stages.push({ key: currentKey, placement: current });

      for (let index = 0; index < stages.length - 1; index += 1) {
        const fromStage = stages[index];
        const toStage = stages[index + 1];
        const points = closestEdgePoints(fromStage.placement, toStage.placement);
        const dx = points.end.x - points.start.x;
        const dy = points.end.y - points.start.y;
        const length = Math.hypot(dx, dy);
        if (length <= headShrink) continue;
        const end = {
          x: points.end.x - (dx / length) * headShrink,
          y: points.end.y - (dy / length) * headShrink
        };
        // Recursive calls give reference parameters a new variableId even when
        // they still point at the same container.  Keep the arrow keyed to the
        // container identity so a continuous arr does not re-enter every frame.
        const key = keepArrowObjectKey(fromStage.key, runtimeIdentity, variableId);
        const line = svg('line', {
          class: 'asm-trace-keep-arrow',
          x1: points.start.x,
          y1: points.start.y,
          x2: end.x,
          y2: end.y,
          stroke: color,
          'stroke-width': width,
          fill: 'none',
          'marker-end': `url(#${markerId})`,
          'data-trace-object-key': key,
          'data-trace-keep-source': fromStage.key,
          'data-trace-keep-target': toStage.key
        });
        layer.append(line);
        placements.set(key, {
          x: Math.min(points.start.x, points.end.x),
          y: Math.min(points.start.y, points.end.y),
          width: Math.max(1, Math.abs(points.end.x - points.start.x)),
          height: Math.max(1, Math.abs(points.end.y - points.start.y))
        });
        elements.set(key, line);
      }
    });
    if (layer.childElementCount) root.prepend(layer);
  }

  function arrowVisible(arrow, frame) {
    if (Array.isArray(arrow.frameIds) && arrow.frameIds.length && !arrow.frameIds.includes(frame.id)) return false;
    return window.ASMTraceRules.conditionMatches(frame, arrow.condition);
  }

  function studioObjectVisible(object, frame) {
    if (Array.isArray(object.frameIds) && object.frameIds.length && !object.frameIds.includes(frame.id)) return false;
    return window.ASMTraceRules.conditionMatches(frame, object.condition);
  }

  function placedObjectKey(placements, requestedKey) {
    const key = String(requestedKey || '');
    if (!key) return '';
    // A keep alias is stored directly, while a Trace Studio object uses the
    // studio: namespace internally. Direct/keep keys intentionally win.
    if (placements.has(key)) return key;
    const studioKey = `studio:${key}`;
    if (placements.has(studioKey)) return studioKey;
    return key;
  }

  function targetPlacement(document, frame, placements, target = {}) {
    const objectKey = target.objectKey || target.targetObjectKey || target.key;
    const variableId = target.variableId || target.targetVariableId;
    if (!objectKey && !variableId) return null;
    if (objectKey === 'keep' || objectKey === '$keep') {
      if (String(target.indexExpression ?? '').trim()) return null;
      return keepUnionPlacement(document, frame, placements);
    }
    const targetObjectKey = objectKey
      ? placedObjectKey(placements, objectKey)
      : objectKeyForVariable(frame, variableId);
    const expression = target.indexExpression;
    if (expression != null && String(expression).trim() !== '') {
      const parts = String(expression).split(',').map(part => part.trim()).filter(Boolean);
      const indices = parts.map(part => {
        const value = window.ASMTraceRules.resolveExpression(document, frame, part);
        return value == null ? NaN : Number(value);
      });
      if (!indices.length || indices.some(index => !Number.isInteger(index))) return null;
      if (target.axis === 'row' || target.axis === 'column') {
        const index = indices[0];
        const cell = placements.get(target.axis === 'row' ? `${targetObjectKey}#${index},0` : `${targetObjectKey}#0,${index}`);
        if (!cell) return null;
        if (target.axis === 'row') {
          return { x: cell.x - 22, y: cell.y, width: 16, height: cell.height };
        }
        return { x: cell.x, y: cell.y + cell.height + 3, width: cell.width, height: 16 };
      }
      const key = `${targetObjectKey}#${indices.join(',')}`;
      if (target.indexLabel === true) return placements.get(`${key}:index`) || placements.get(key) || null;
      return placements.get(key) || null;
    }
    return placements.get(targetObjectKey) || null;
  }

  function ensureLinearIndexPlacement(frame, variableId, index, itemCount, placements) {
    if (!Number.isInteger(index) || !Number.isInteger(itemCount) || itemCount < 1) return null;
    const objectKey = objectKeyForVariable(frame, variableId);
    const key = `${objectKey}#${index}`;
    if (placements.has(key)) return placements.get(key);

    const edgeIndex = index < 0 ? 0 : itemCount - 1;
    const neighbourIndex = index < 0 ? Math.min(1, itemCount - 1) : Math.max(0, itemCount - 2);
    const edge = placements.get(`${objectKey}#${edgeIndex}`);
    const neighbour = placements.get(`${objectKey}#${neighbourIndex}`);
    if (!edge) return null;

    let stepX = Number(edge.width) || 0;
    let stepY = 0;
    if (neighbour && neighbourIndex !== edgeIndex) {
      const indexDelta = edgeIndex - neighbourIndex;
      stepX = ((Number(edge.x) || 0) - (Number(neighbour.x) || 0)) / indexDelta;
      stepY = ((Number(edge.y) || 0) - (Number(neighbour.y) || 0)) / indexDelta;
    }
    const distance = index - edgeIndex;
    const virtualPlacement = {
      ...edge,
      x: (Number(edge.x) || 0) + stepX * distance,
      y: (Number(edge.y) || 0) + stepY * distance
    };
    placements.set(key, virtualPlacement);
    return virtualPlacement;
  }

  function leftmostVisibleIndexPlacement(frame, variableId, placements, elements) {
    const prefix = `${objectKeyForVariable(frame, variableId)}#`;
    const cells = [];
    placements.forEach((placement, key) => {
      if (!key.startsWith(prefix) || !/^\d+$/.test(key.slice(prefix.length))) return;
      // Linear out-of-range placements have no rendered element. Never use
      // those, labels, or decorations as the unknown marker's reference cell.
      if (!elements.has(key) || ![placement.x, placement.y, placement.width, placement.height].every(Number.isFinite)) return;
      cells.push({ key, placement, index: Number(key.slice(prefix.length)) });
    });
    cells.sort((a, b) => a.placement.x - b.placement.x
      || a.placement.y - b.placement.y || a.index - b.index);
    return cells[0] || null;
  }

  function anchorPoint(placement, anchor = 'center') {
    if (!placement) return null;
    const normalized = String(anchor || 'center').toLowerCase();
    let x = placement.x + placement.width / 2;
    let y = placement.y + placement.height / 2;
    if (normalized.includes('left')) x = placement.x;
    if (normalized.includes('right')) x = placement.x + placement.width;
    if (normalized.includes('top')) y = placement.y;
    if (normalized.includes('bottom')) y = placement.y + placement.height;
    return { x, y };
  }

  function resolveAnchor(document, frame, target, placements = currentScene?.placements) {
    return anchorPoint(targetPlacement(document, frame, placements || new Map(), target), target?.anchor);
  }

  function resolvedTargetKey(document, frame, target, placements = currentScene?.placements || new Map()) {
    const objectKey = target?.objectKey || target?.targetObjectKey || target?.key;
    if (objectKey) {
      if ((objectKey === 'keep' || objectKey === '$keep')
        && !String(target?.indexExpression ?? '').trim()) return '$keep';
      const targetObjectKey = placedObjectKey(placements, objectKey);
      const expression = String(target?.indexExpression ?? '').trim();
      if (!expression) return targetObjectKey;
      const indices = expression.split(',').map(part => Number(
        window.ASMTraceRules.resolveExpression(document, frame, part.trim())
      ));
      if (!indices.length || indices.some(index => !Number.isInteger(index))) return targetObjectKey;
      return `${targetObjectKey}#${indices.join(',')}`;
    }
    const variableId = target?.variableId || target?.targetVariableId;
    if (!variableId) return '';
    const targetObjectKey = objectKeyForVariable(frame, variableId);
    const expression = String(target?.indexExpression ?? '').trim();
    if (!expression) return targetObjectKey;
    const indices = expression.split(',').map(part => Number(
      window.ASMTraceRules.resolveExpression(document, frame, part.trim())
    ));
    if (!indices.length || indices.some(index => !Number.isInteger(index))) return targetObjectKey;
    return `${targetObjectKey}#${indices.join(',')}`;
  }

  function translateWithin(element, stop) {
    let x = 0;
    let y = 0;
    let cursor = element;
    while (cursor && cursor !== stop) {
      const match = String(cursor.getAttribute?.('transform') || '').match(/translate\s*\(\s*([+\-\d.]+)(?:[\s,]+([+\-\d.]+))?/);
      if (match) {
        x += Number(match[1]) || 0;
        y += Number(match[2]) || 0;
      }
      cursor = cursor.parentElement;
    }
    return { x, y };
  }

  function collectElementPlacements(content, baseX, baseY, placements, elements) {
    content.querySelectorAll('[data-trace-object-key]').forEach(element => {
      const key = element.dataset.traceObjectKey;
      if (!key) return;
      const box = measuredBox(element, null);
      if (!box) return;
      const shift = translateWithin(element, content);
      placements.set(key, {
        x: baseX + box.x + shift.x,
        y: baseY + box.y + shift.y,
        width: box.width,
        height: box.height
      });
      elements.set(key, element);
      if (element.dataset.tracePositionX == null) {
        element.dataset.tracePositionSpace = 'bounds';
        element.dataset.tracePositionX = String(baseX + box.x + shift.x);
        element.dataset.tracePositionY = String(baseY + box.y + shift.y);
      }
    });
  }

  function renderFrameSegments(root, document, frame, placements, elements, options = {}) {
    const segmentOrdinals = new Map();
    (frame.segments || []).forEach((descriptor, descriptorIndex) => {
      if (!window.ASMTraceRules?.expressionMatches?.(document, frame, descriptor?.when)) return;
      const variableId = descriptor?.targetVariableId;
      const entry = frame.state?.[variableId];
      const items = entry?.data?.items;
      if (!variableId || !Array.isArray(items)) return;

      const targetKey = objectKeyForVariable(frame, variableId);
      const rendererName = frame.renderers?.[variableId]
        || document.skins?.[variableId]?.renderer
        || document.variables?.[variableId]?.kind
        || entry.data?.kind;
      if (rendererName && rendererName !== 'original-array' && rendererName !== 'sequence') return;

      const start = Number(window.ASMTraceRules.resolveExpression(
        document, frame, descriptor.startExpression
      ));
      const end = Number(window.ASMTraceRules.resolveExpression(
        document, frame, descriptor.endExpression
      ));
      const endExclusive = end + (descriptor.endInclusive ? 1 : 0);
      if (!Number.isInteger(start) || !Number.isInteger(end)
        || start < 0 || endExclusive < start || endExclusive > items.length) return;

      const cells = items.map((_, index) => placements.get(`${targetKey}#${index}`) || null);
      const renderedCells = cells.filter(Boolean);
      if (!renderedCells.length) return;
      const targetPlacement = placements.get(targetKey);
      if (!targetPlacement) return;
      const targetElement = elements.get(targetKey);
      const outerframe = targetElement?.matches?.('[data-outerframe-top][data-outerframe-bottom]')
        ? targetElement
        : targetElement?.querySelector?.('[data-outerframe-top][data-outerframe-bottom]');
      const outerframeLocalTop = Number(outerframe?.getAttribute?.('data-outerframe-top'));
      const outerframeLocalBottom = Number(outerframe?.getAttribute?.('data-outerframe-bottom'));
      const targetOriginY = Number(targetElement?.dataset?.tracePositionY);
      const hasStableOuterframe = Number.isFinite(targetOriginY)
        && Number.isFinite(outerframeLocalTop)
        && Number.isFinite(outerframeLocalBottom)
        && outerframeLocalBottom > outerframeLocalTop;
      const boundaryX = index => {
        if (cells[index]) return Number(cells[index].x) || 0;
        if (index === items.length && cells[index - 1]) {
          return (Number(cells[index - 1].x) || 0) + (Number(cells[index - 1].width) || 0);
        }
        return null;
      };
      const left = boundaryX(start);
      const right = boundaryX(endExclusive);
      if (!Number.isFinite(left) || !Number.isFinite(right) || right < left) return;

      // Segment height follows the array frame only. Object bounds may include
      // transient marks, pointers, or highlights and therefore vary per frame.
      const outerframeTop = hasStableOuterframe
        ? targetOriginY + outerframeLocalTop
        : Number(targetPlacement.y) || 0;
      const outerframeBottom = hasStableOuterframe
        ? targetOriginY + outerframeLocalBottom
        : outerframeTop + (Number(targetPlacement.height) || 0);
      const top = outerframeTop - 60;
      const bottom = outerframeBottom + 20;
      const arrowY = top + 5;
      const width = right - left;
      const key = `segment:${descriptor.id || `${frame.id}-${descriptorIndex}`}`;
      const identityBase = String(entry.identity || targetKey);
      const ordinal = segmentOrdinals.get(identityBase) || 0;
      segmentOrdinals.set(identityBase, ordinal + 1);
      const runtimeIdentity = descriptor.named
        ? `segment:named:${descriptor.id}`
        : `segment:${identityBase}:${ordinal}`;
      const stroke = '#000000';
      const strokeWidth = 2;
      const object = markSelectable(svg('g', {
        class: 'asm-trace-object asm-trace-segment',
        'data-trace-object-key': key,
        'data-trace-object-id': key,
        'data-trace-bound': '1',
        'data-trace-binding-target': targetKey,
        'data-trace-segment-target': targetKey,
        'data-trace-runtime-identity': runtimeIdentity,
        'data-trace-render-position': `${left},${top}`,
        'data-trace-segment-left': left,
        'data-trace-segment-right': right,
        'data-trace-segment-top': top,
        'data-trace-segment-bottom': bottom,
        'data-trace-segment-arrow-y': arrowY,
        'stroke-opacity': 0.5,
        'pointer-events': 'visiblePainted'
      }), key, { ...options, movable: false });
      object.append(
        svg('line', { 'data-trace-segment-role': 'left-boundary', x1: left, y1: top, x2: left, y2: bottom, stroke, 'stroke-width': strokeWidth }),
        svg('line', { 'data-trace-segment-role': 'right-boundary', x1: right, y1: top, x2: right, y2: bottom, stroke, 'stroke-width': strokeWidth })
      );
      if (width > 0) {
        const head = Math.min(6, Math.max(2, width / 3));
        const arrowLeft = Math.min(right, left + strokeWidth / 2);
        const arrowRight = Math.max(arrowLeft, right - strokeWidth / 2);
        object.append(
          svg('line', {
            'data-trace-segment-role': 'width-line',
            x1: arrowLeft, y1: arrowY, x2: arrowRight, y2: arrowY,
            stroke, 'stroke-width': strokeWidth, 'stroke-dasharray': '6 4'
          }),
          svg('path', {
            'data-trace-segment-role': 'left-head',
            d: `M ${arrowLeft + head} ${arrowY - 4} L ${arrowLeft} ${arrowY} L ${arrowLeft + head} ${arrowY + 4}`,
            fill: 'none', stroke, 'stroke-width': strokeWidth, 'stroke-linejoin': 'miter'
          }),
          svg('path', {
            'data-trace-segment-role': 'right-head',
            d: `M ${arrowRight - head} ${arrowY - 4} L ${arrowRight} ${arrowY} L ${arrowRight - head} ${arrowY + 4}`,
            fill: 'none', stroke, 'stroke-width': strokeWidth, 'stroke-linejoin': 'miter'
          })
        );
      }
      if (descriptor.showWidth) {
        object.append(svg('text', {
          'data-trace-segment-role': 'width-label',
          x: left + width / 2,
          y: arrowY - 7,
          'text-anchor': 'middle',
          'font-family': 'Arial',
          'font-size': 12,
          fill: '#000000'
        }, String(Math.max(0, endExclusive - start))));
      }
      root.append(object);
      placements.set(key, {
        x: left,
        y: descriptor.showWidth ? arrowY - 21 : top,
        width: Math.max(1, width),
        height: bottom - (descriptor.showWidth ? arrowY - 21 : top)
      });
      elements.set(key, object);
    });
  }

  function translatedTransform(element, dx, dy) {
    const current = element.getAttribute('transform') || '';
    element.setAttribute('transform', `${current} translate(${dx}, ${dy})`.trim());
  }

  function shiftPlacementTree(source, dx, dy, placements, elements) {
    elements.forEach((element, key) => {
      if (element !== source && !source.contains(element)) return;
      const placement = placements.get(key);
      if (!placement) return;
      placements.set(key, { ...placement, x: placement.x + dx, y: placement.y + dy });
    });
  }

  function applyStoredPartPositions(document, frame, placements, elements) {
    const positions = document.studio?.positions?.[frame.id] || {};
    Object.entries(positions).forEach(([key, position]) => {
      const element = elements.get(key);
      const placement = placements.get(key);
      if (!element || !placement || element.dataset.tracePositionApplied === '1') return;
      const dx = position?.absolute === true ? (Number(position.x) || 0) - placement.x : Number(position?.x) || 0;
      const dy = position?.absolute === true ? (Number(position.y) || 0) - placement.y : Number(position?.y) || 0;
      if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
        translatedTransform(element, dx, dy);
        shiftPlacementTree(element, dx, dy, placements, elements);
      }
      const current = placements.get(key) || placement;
      element.dataset.tracePositionSpace = 'bounds';
      element.dataset.tracePositionX = String(current.x);
      element.dataset.tracePositionY = String(current.y);
    });
  }

  function applyVisibilityStates(document, frame, elements) {
    const states = document.studio?.visibility?.[frame.id] || {};
    const editing = window.document.body.classList.contains('asm-trace-studio-open');
    const hiddenElements = Object.entries(states)
      .filter(([, state]) => state === 'hidden')
      .map(([key]) => elements.get(key))
      .filter(Boolean);
    hiddenElements.forEach(element => {
      element.dataset.traceVisibility = 'hidden';
    });
    hiddenElements.forEach(element => {
      if (!editing) {
        element.setAttribute('display', 'none');
        return;
      }
      if (!element.parentElement?.closest('[data-trace-visibility="hidden"]')) {
        element.classList.add('trace-studio-hidden-object');
      }
    });
  }

  function applyObjectColorStyles(document, frame, elements) {
    const styles = document.studio?.objectStyles?.[frame.id] || {};
    Object.entries(styles).forEach(([key, style]) => {
      const element = elements.get(key);
      if (!element || !style) return;
      const fillTargets = element.matches?.('text, rect, circle, ellipse, polygon')
        ? [element]
        : [...element.querySelectorAll(':scope > rect, :scope > circle, :scope > ellipse, :scope > polygon, :scope > .asm-trace-motion > rect, :scope > .asm-trace-motion > circle, :scope > .asm-trace-motion > ellipse, :scope > .asm-trace-motion > polygon, :scope > .asm-trace-motion > g > rect, :scope > .asm-trace-motion > g > circle, :scope > .asm-trace-motion > g > polygon')];
      if (!fillTargets.length) fillTargets.push(...element.querySelectorAll('text'));
      const strokeTargets = element.matches?.('path, line, polyline, rect, circle, ellipse, polygon')
        ? [element]
        : [...element.querySelectorAll('path, line, polyline, rect, circle, ellipse, polygon')];
      if (style.fill) {
        fillTargets.forEach(target => {
          if (target.getAttribute('fill') !== 'none') target.setAttribute('fill', style.fill);
        });
        if (!fillTargets.length && element.matches?.('path, line, polyline')) {
          element.setAttribute('stroke', style.fill);
        }
      }
      if (style.stroke) {
        strokeTargets.forEach(target => {
          if (target.getAttribute('stroke') !== 'none') target.setAttribute('stroke', style.stroke);
        });
      }
    });
  }

  function applyBindings(document, frame, placements, elements) {
    const directiveBindings = {};
    const snapshotsById = new Map((document.snapshots || []).map(snapshot => [snapshot.id, snapshot]));
    const snapshotObjectKeys = new Set((frame.snapshotIds || []).map(id => (
      snapshotObjectKey(snapshotsById.get(id))
    )).filter(Boolean));
    const automaticBindings = [
      ...(frame.objectBindings || []),
      ...(frame.snapshotIds || []).map(id => {
        const snapshot = snapshotsById.get(id);
        return snapshot?.binding
          ? { ...snapshot.binding, sourceObjectKey: snapshotObjectKey(snapshot) }
          : null;
      }).filter(Boolean)
    ];
    automaticBindings.forEach(binding => {
      if (!binding?.sourceVariableId && !binding?.sourceObjectKey) return;
      const sourceKey = binding.sourceObjectKey
        || objectKeyForVariable(frame, binding.sourceVariableId);
      const targetKey = binding.canvas
        ? '$canvas'
        : resolvedTargetKey(document, frame, {
          objectKey: binding.targetObjectKey,
          variableId: binding.targetVariableId,
          indexExpression: (binding.indexExpressions || []).join(',')
        }, placements);
      if (!sourceKey || !targetKey) return;
      const anchor = String(binding.anchor || 'center').toLowerCase();
      const vertical = anchor.includes('top') ? 'bottom' : anchor.includes('bottom') ? 'top' : '';
      const horizontal = anchor.includes('left') ? 'right' : anchor.includes('right') ? 'left' : '';
      directiveBindings[sourceKey] = {
        targetKey,
        sourceAnchor: [vertical, horizontal].filter(Boolean).join('-') || 'center',
        targetAnchor: anchor,
        dx: (anchor.includes('left') ? -8 : anchor.includes('right') ? 8 : 0)
          + (Number(binding.offsetX) || 0),
        dy: (anchor.includes('top') ? -8 : anchor.includes('bottom') ? 8 : 0)
          + (Number(binding.offsetY) || 0),
        semanticDirective: true,
        targetExpression: binding.targetExpression || ''
      };
    });
    const bindings = {
      ...directiveBindings,
      ...(document.studio?.bindings?.[frame.id] || {})
    };
    const applied = new Set();
    const applying = new Set();

    function applyOne(key) {
      if (applied.has(key) || applying.has(key)) return;
      const binding = bindings[key];
      const source = elements.get(key);
      if (!binding || !source) return;
      applying.add(key);
      const targetKey = binding.targetKey === 'keep' ? '$keep' : binding.targetKey;
      if (targetKey === '$keep') {
        // A retained object keeps the placement it had when it was created.
        // Its historical `keep` target therefore contains only older keeps;
        // including future keeps here creates a circular layout that expands
        // the vertical gaps every time another retained object is added.
        keepSnapshotObjectKeys(document, frame,
          snapshotObjectKeys.has(key) ? key : '').forEach(applyOne);
      } else {
        applyOne(targetKey);
      }
      const sourcePlacement = placements.get(key);
      const targetPlacement = targetKey === '$canvas'
        ? { x: 0, y: 0, width: 1100, height: 620 }
        : targetKey === '$keep'
          ? keepUnionPlacement(document, frame, placements,
            snapshotObjectKeys.has(key) ? key : '')
          : placements.get(targetKey);
      if (sourcePlacement && targetPlacement && targetKey !== key) {
        const sourcePoint = anchorPoint(sourcePlacement, binding.sourceAnchor || 'top');
        const targetPoint = anchorPoint(targetPlacement, binding.targetAnchor || 'center');
        const dx = targetPoint.x + (Number(binding.dx) || 0) - sourcePoint.x;
        const dy = targetPoint.y + (Number(binding.dy) || 0) - sourcePoint.y;
        if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
          translatedTransform(source, dx, dy);
          shiftPlacementTree(source, dx, dy, placements, elements);
        }
        source.dataset.traceBound = '1';
        source.dataset.traceBindingTarget = targetKey;
        source.dataset.traceBindingSourceAnchor = binding.sourceAnchor || 'top';
        source.dataset.traceBindingTargetAnchor = binding.targetAnchor || 'center';
        source.dataset.studioOffset = `${Number(binding.dx) || 0},${Number(binding.dy) || 0}`;
      }
      applying.delete(key);
      applied.add(key);
    }

    Object.keys(bindings).forEach(applyOne);
  }

  function animatePartPositions(placements, elements, options = {}) {
    elements.forEach((element, key) => {
      const placement = placements.get(key);
      if (!placement) return;
      if (element.dataset.tracePositionApplied === '1') {
        element.setAttribute('data-trace-render-position', `${placement.x},${placement.y}`);
        return;
      }
      element.setAttribute('data-trace-render-position', `${placement.x},${placement.y}`);
      if (options.animatePositions === false) return;
      const { plan, previous } = previousPositionForKey(options, key);
      if (!previous && !plan?.explicit) return;
      animatePosition(element, previous, placement, true, plan, true);
    });
  }

  function animateSwapEvents(document, frame, placements, elements, enabled) {
    if (!enabled || eventAnimation('swap') !== 'swap') return;
    (frame.events || []).filter(event => (
      event.type === 'swap'
      && event.enabled !== false
      && event.autoAnimationDisabled !== true
    )).forEach(event => {
      const targets = (event.targets || []).filter(target => target.variableId && target.indexExpression);
      if (targets.length < 2 || targets[0].variableId !== targets[1].variableId) return;
      const indices = targets.slice(0, 2).map(target => {
        const value = target.resolvedIndex != null && Number.isInteger(Number(target.resolvedIndex))
          ? target.resolvedIndex
          : window.ASMTraceRules.resolveExpression(document, frame, target.indexExpression);
        return value == null ? NaN : Number(value);
      });
      if (indices.some(index => !Number.isInteger(index)) || indices[0] === indices[1]) return;
      const keys = indices.map(index => `${targets[0].variableId}#${index}`);
      const cells = keys.map(key => elements.get(key));
      const boxes = keys.map(key => placements.get(key));
      if (cells.some(cell => !cell) || boxes.some(box => !box)) return;
      cells.forEach((cell, index) => {
        const other = boxes[1 - index];
        const current = boxes[index];
        const dx = other.x - current.x;
        const dy = other.y - current.y;
        const animation = svg('animateTransform', {
          attributeName: 'transform', type: 'translate', additive: 'sum',
          from: `${dx} ${dy}`, to: '0 0',
          begin: 'indefinite', keyTimes: '0;1', dur: '520ms', fill: 'freeze', calcMode: 'spline',
          keySplines: '0.22 1 0.36 1'
        });
        cell.prepend(animation);
        startSvgAnimation(animation);
      });
    });
  }

  function fixedTargetIndex(document, sourceFrame, target) {
    if (target?.resolvedIndex != null
      && target.resolvedIndex !== ''
      && Number.isInteger(Number(target.resolvedIndex))) return Number(target.resolvedIndex);
    const index = Number(window.ASMTraceRules.resolveExpression(
      document, sourceFrame, target?.indexExpression
    ));
    return Number.isInteger(index) ? index : null;
  }

  function fixedTargetVariableIds(frame, sourceFrame, event, target) {
    const identity = String(
      target?.runtimeIdentity
      || event?.runtimeIdentity
      || sourceFrame?.state?.[target?.variableId]?.identity
      || ''
    );
    if (identity) {
      const aliases = Object.entries(frame?.state || {})
        .filter(([, entry]) => String(entry?.identity || '') === identity)
        .map(([variableId]) => variableId);
      if (aliases.length) return aliases;
    }
    return frame?.state?.[target?.variableId] ? [target.variableId] : [];
  }

  function applyFixedEventStyles(document, frame, highlights) {
    // @keep last renders a cloned frame. Match by stable frame ID instead of
    // object identity so accumulated marks are retained inside the snapshot.
    const currentIndex = document.frames?.findIndex(item => item.id === frame?.id) ?? -1;
    if (currentIndex < 0) return;
    document.frames.slice(0, currentIndex + 1).forEach(sourceFrame => {
      (sourceFrame.events || []).filter(event => (
        event.type === 'fixed'
        // Fixed marks are persistent renderer state, not a timed animation.
        // Their user switch is authoritative even if an older saved trace
        // still carries stale animation-availability metadata.
        && event.enabled !== false
      )).forEach(event => {
        (event.targets || []).forEach(target => {
          if (!target.variableId || target.indexExpression == null) return;
          const index = fixedTargetIndex(document, sourceFrame, target);
          if (index == null) return;
          fixedTargetVariableIds(frame, sourceFrame, event, target).forEach(variableId => {
            highlights[variableId] ||= {};
            highlights[variableId][String(index)] = {
              ...(highlights[variableId][String(index)] || {}),
              fixedMark: '#4caf50'
            };
          });
        });
      });
    });
  }

  function delayedCurrentFixedMarks(root, document, frame, enabled) {
    if (!enabled) return [];
    const targetKeys = new Set();
    (frame.events || []).filter(event => (
      event.type === 'fixed'
      && event.enabled !== false
    )).forEach(event => {
      (event.targets || []).forEach(target => {
        if (!target.variableId || target.indexExpression == null) return;
        const index = fixedTargetIndex(document, frame, target);
        if (index == null) return;
        fixedTargetVariableIds(frame, frame, event, target).forEach(variableId => {
          targetKeys.add(`${objectKeyForVariable(frame, variableId)}#${index}`);
        });
      });
    });
    if (!targetKeys.size) return [];
    return [...root.querySelectorAll('[data-trace-attachment-kind="mark"]')]
      .filter(mark => targetKeys.has(mark.dataset.traceAttachedTo || ''))
      .map(mark => {
        const opacity = mark.getAttribute('opacity');
        mark.setAttribute('opacity', '0');
        return { mark, opacity };
      });
  }

  function revealDelayedFixedMarks(entries) {
    entries.forEach(({ mark, opacity }) => {
      if (!mark?.isConnected) return;
      if (opacity == null) mark.removeAttribute('opacity');
      else mark.setAttribute('opacity', opacity);
    });
  }

  function animateEventTargets(document, frame, placements, elements, enabled) {
    if (!enabled) return;
    const animationClasses = {
      lift: 'trace-lift',
      pulse: 'trace-pulse',
      fade: 'trace-fade'
    };
    (frame.events || []).forEach(event => {
      if (event.enabled === false || event.autoAnimationDisabled === true) return;
      const animation = eventAnimation(event.type);
      if (event.type === 'swap' && animation === 'swap') return;
      const className = animationClasses[animation];
      if (!className) return;
      (event.targets || []).forEach(target => {
        if (!target.variableId) return;
        const index = target.indexExpression
          ? window.ASMTraceRules.resolveExpression(document, frame, target.indexExpression)
          : null;
        const key = Number.isInteger(Number(index))
          ? `${target.variableId}#${Number(index)}`
          : target.variableId;
        const element = elements.get(key) || elements.get(target.variableId);
        element?.classList.add(className);
      });
    });
  }

  const TRACE_TEXT_COLORS = Object.freeze({
    AV_green: 'rgba(165, 214, 167, 0.6)',
    AV_blue: 'rgba(144, 202, 249, 0.6)',
    AV_red: 'rgba(239, 154, 154, 0.6)',
    AV_yellow: 'rgba(252, 255, 64, 0.46)',
    AV_orange: 'orange',
    AV_node_green: '#e8f5e9',
    AV_node_red: '#ef9a9a',
    AV_grey: '#cccccc',
    AV_node_grey: '#cccccc',
    AV_black: '#111827',
    AV_white: '#ffffff'
  });

  function traceTextColor(value, fallback = '') {
    return TRACE_TEXT_COLORS[value] || value || fallback;
  }

  function traceTextMarkup(value) {
    return window.parseTTSMarkup?.(value) || { display: String(value ?? ''), speech: String(value ?? '') };
  }

  function styledTextPieces(document, frame, objectKey, segment, segmentIndex, resolvedText) {
    const baseKey = `${objectKey}:segment:${segment?.segmentId || segmentIndex}`;
    const styles = document.studio?.objectStyles?.[frame.id] || {};
    const baseStyle = styles[baseKey] || {};
    if (segment?.kind === 'expression' || /[{}]/.test(resolvedText)) {
      return [{ text: resolvedText, segmentKey: baseKey, baseKey, sourceStart: 0, sourceEnd: resolvedText.length, storedStyle: baseStyle }];
    }
    const escaped = baseKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`^${escaped}:range:(\\d+)-(\\d+)$`);
    const ranges = Object.entries(styles).map(([key, style]) => {
      const match = key.match(pattern);
      if (!match) return null;
      return {
        key,
        start: Math.max(0, Math.min(resolvedText.length, Number(match[1]) || 0)),
        end: Math.max(0, Math.min(resolvedText.length, Number(match[2]) || 0)),
        style
      };
    }).filter(range => range && range.end > range.start);
    if (!ranges.length) {
      return [{ text: resolvedText, segmentKey: baseKey, baseKey, sourceStart: 0, sourceEnd: resolvedText.length, storedStyle: baseStyle }];
    }
    const boundaries = [...new Set([0, resolvedText.length, ...ranges.flatMap(range => [range.start, range.end])])]
      .sort((left, right) => left - right);
    return boundaries.slice(0, -1).map((start, index) => {
      const end = boundaries[index + 1];
      const covering = ranges.filter(range => range.start <= start && end <= range.end).at(-1);
      return {
        text: resolvedText.slice(start, end),
        segmentKey: covering?.key || baseKey,
        baseKey,
        sourceStart: start,
        sourceEnd: end,
        storedStyle: { ...baseStyle, ...(covering?.style || {}) }
      };
    });
  }

  function renderFrameTexts(root, document, frame, startY, placements, elements, options = {}) {
    let y = startY;
    const textLayer = svg('g', { class: 'asm-trace-text-layer' });
    root.append(textLayer);
    (frame.texts || []).forEach((descriptor, descriptorIndex) => {
      if (!window.ASMTraceRules?.textExpressionMatches?.(document, frame, descriptor?.when)) return;
      const key = `text:${descriptor.id || `${frame.id}-${descriptorIndex}`}`;
      const rawSegments = Array.isArray(descriptor.segments) ? descriptor.segments : [];
      const lines = [[]];
      rawSegments.forEach((segment, segmentIndex) => {
        const expressionValue = segment?.kind === 'expression'
          ? window.ASMTraceRules.resolveExpression(document, frame, segment.expression)
          : segment?.kind === 'template'
            ? String(segment.text || '').replace(/\$\{([^{}]+)\}/g, (_, expression) => {
              const value = window.ASMTraceRules.resolveExpression(document, frame, expression.trim());
              return value == null ? '' : String(value);
            })
            : segment?.text;
        const resolvedText = expressionValue == null ? '' : String(expressionValue);
        styledTextPieces(document, frame, key, segment, segmentIndex, resolvedText).forEach(piece => {
          piece.text.split('\n').forEach((part, partIndex, parts) => {
            const parsed = traceTextMarkup(part);
            const storedStyle = piece.storedStyle;
            lines.at(-1).push({
              ...segment,
              ...piece,
              segmentIndex,
              display: parsed.display,
              speech: parsed.speech,
              textColor: storedStyle.textColor || traceTextColor(segment?.color, '#111827'),
              background: Object.hasOwn(storedStyle, 'background')
                ? storedStyle.background
                : traceTextColor(segment?.background, 'none'),
              fontSize: Math.max(8, Number(storedStyle.fontSize) || Number(segment?.fontSize) || 10),
              bold: Object.hasOwn(storedStyle, 'bold') ? storedStyle.bold === true : segment?.bold === true
            });
            if (partIndex < parts.length - 1) lines.push([]);
          });
        });
      });
      const lineHeight = lines.map(line => Math.max(12, ...line.map(segment => segment.fontSize * 1.25)));
      const measureText = (value, fontSize, bold) => {
        const canvas = renderFrameTexts.measureCanvas ||= window.document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) return Array.from(value).length * fontSize * 0.58;
        context.font = `${bold ? 'bold ' : ''}${fontSize}px Arial`;
        return context.measureText(value).width;
      };
      const widths = lines.map(line => line.reduce((sum, segment) => (
        sum + measureText(segment.display, segment.fontSize, segment.bold)
      ), 0));
      const padX = 6;
      const padY = 4;
      const lineGap = 2;
      const boxWidth = Math.max(28, ...widths) + padX * 2;
      const boxHeight = lineHeight.reduce((sum, height) => sum + height, 0)
        + Math.max(0, lines.length - 1) * lineGap + padY * 2;
      const position = studioPosition(document, frame, key);
      const baseX = position.x;
      const baseY = position.absolute ? position.y : y + position.y;
      const object = markSelectable(svg('g', {
        id: `msg-${options.idPrefix || 'trace'}-text-${String(descriptor.id || descriptorIndex).replace(/[^A-Za-z0-9_-]/g, '-')}`,
        class: 'asm-trace-object draggable-object asm-trace-text-object',
        transform: `translate(${baseX}, ${baseY})`,
        'data-base-offset': `${baseX},${baseY}`,
        'data-translate': '0,0',
        'data-trace-object-key': key,
        'data-trace-object-id': key,
        'data-trace-text-id': descriptor.id || '',
        'data-tts-lines': JSON.stringify(lines.map(line => line.map(segment => segment.speech).join('').trim()))
      }), key, { ...options, movable: true });
      object.dataset.tracePositionApplied = '1';
      object.dataset.tracePositionSpace = 'origin';
      object.dataset.tracePositionX = String(baseX);
      object.dataset.tracePositionY = String(baseY);
      const motion = svg('g', { class: 'asm-trace-motion' });
      const background = svg('rect', {
        x: 0, y: 0, width: boxWidth, height: boxHeight, rx: 6,
        fill: '#ffffff', stroke: '#4b5563', 'stroke-width': 1.2
      });
      motion.append(background);
      let lineTop = padY;
      lines.forEach((line, lineIndex) => {
        const lineGroup = svg('g', {
          transform: `translate(0, ${lineTop})`,
          'data-line-index': lineIndex,
          'data-trace-text-line': '1'
        });
        let cursorX = padX;
        line.forEach(segment => {
          const segmentWidth = measureText(segment.display, segment.fontSize, segment.bold);
          if (!segment.display) return;
          const segmentGroup = svg('g', {
            transform: `translate(${cursorX}, 0)`,
            'data-trace-object-key': segment.segmentKey,
            'data-trace-parent-key': key,
            'data-trace-movable': '0',
            'data-trace-text-segment': segment.kind || 'literal',
            'data-trace-text-expression': segment.kind === 'expression' ? segment.source || `\${${segment.expression}}` : '',
            'data-trace-text-segment-id': segment.segmentId || String(segment.segmentIndex),
            'data-trace-text-base-key': segment.baseKey || segment.segmentKey,
            'data-trace-text-source-start': segment.sourceStart ?? 0,
            'data-trace-text-source-end': segment.sourceEnd ?? segment.display.length
          });
          segmentGroup.append(svg('rect', {
            class: 'asm-trace-text-segment-background',
            x: -2,
            y: 0,
            width: Math.max(4, segmentWidth + 4),
            height: lineHeight[lineIndex],
            rx: 2,
            fill: segment.background && segment.background !== 'none' ? segment.background : 'rgba(0,0,0,0)',
            stroke: 'none',
            'pointer-events': 'all'
          }));
          segmentGroup.append(svg('text', {
            class: 'asm-trace-text-segment-value',
            x: 0,
            y: lineHeight[lineIndex] * 0.78,
            'font-size': segment.fontSize,
            'font-weight': segment.bold ? 'bold' : 'normal',
            'font-style': segment.storedStyle?.italic === true ? 'italic' : 'normal',
            'text-decoration': [
              segment.storedStyle?.underline === true ? 'underline' : '',
              segment.storedStyle?.strike === true ? 'line-through' : ''
            ].filter(Boolean).join(' ') || 'none',
            'font-family': 'Arial',
            fill: segment.textColor,
            'xml:space': 'preserve',
            style: 'white-space:pre'
          }, segment.display));
          lineGroup.append(segmentGroup);
          placements.set(segment.segmentKey, {
            x: baseX + cursorX - 2,
            y: baseY + lineTop,
            width: Math.max(4, segmentWidth + 4),
            height: lineHeight[lineIndex]
          });
          elements.set(segment.segmentKey, segmentGroup);
          cursorX += segmentWidth;
        });
        motion.append(lineGroup);
        lineTop += lineHeight[lineIndex] + lineGap;
      });
      const pointerX = boxWidth / 2;
      motion.append(svg('path', {
        d: `M ${pointerX - 4} ${boxHeight} L ${pointerX} ${boxHeight + 5} L ${pointerX + 4} ${boxHeight} Z`,
        fill: '#ffffff', stroke: '#4b5563', 'stroke-width': 1.2
      }));
      object.append(motion);
      textLayer.append(object);
      animateObjectPosition(motion, options, key, { x: baseX, y: baseY });
      placements.set(key, { x: baseX, y: baseY, width: boxWidth, height: boxHeight + 5 });
      elements.set(key, object);
      y += boxHeight + 28;
    });
    if (!textLayer.childElementCount) textLayer.remove();
    return y;
  }

  function applySemanticTextBindings(document, frame, placements, elements) {
    const canvas = { x: 0, y: 0, width: 1100, height: 620 };
    (frame.texts || []).forEach((descriptor, descriptorIndex) => {
      if (!window.ASMTraceRules?.textExpressionMatches?.(document, frame, descriptor?.when)) return;
      const binding = descriptor?.binding;
      if (!binding) return;
      const key = `text:${descriptor.id || `${frame.id}-${descriptorIndex}`}`;
      const source = elements.get(key);
      const sourcePlacement = placements.get(key);
      if (!source || !sourcePlacement) return;
      const indexExpression = (binding.indexExpressions || []).join(',');
      const target = binding.canvas
        ? canvas
        : targetPlacement(document, frame, placements, {
          objectKey: binding.targetObjectKey,
          variableId: binding.targetVariableId,
          indexExpression
        });
      if (!target) {
        source.setAttribute('display', 'none');
        source.dataset.traceBindingUnavailable = '1';
        return;
      }
      const anchor = String(binding.anchor || 'center').toLowerCase();
      const point = anchorPoint(target, anchor);
      const gap = 8;
      let desiredX = point.x - sourcePlacement.width / 2;
      let desiredY = point.y - sourcePlacement.height / 2;
      if (anchor.includes('left')) desiredX = point.x - sourcePlacement.width - gap;
      if (anchor.includes('right')) desiredX = point.x + gap;
      if (anchor.includes('top')) desiredY = point.y - sourcePlacement.height - gap;
      if (anchor.includes('bottom')) desiredY = point.y + gap;
      desiredX += Number(binding.offsetX) || 0;
      desiredY += Number(binding.offsetY) || 0;
      const dx = desiredX - sourcePlacement.x;
      const dy = desiredY - sourcePlacement.y;
      translatedTransform(source, dx, dy);
      shiftPlacementTree(source, dx, dy, placements, elements);
      source.parentElement?.append(source);
      source.dataset.traceBound = '1';
      source.dataset.traceBindingTarget = binding.canvas
        ? 'canvas'
        : resolvedTargetKey(document, frame, {
          objectKey: binding.targetObjectKey,
          variableId: binding.targetVariableId,
          indexExpression
        }, placements);
      source.dataset.traceSemanticBinding = '1';
      source.dataset.traceBindingAnchor = binding.anchor || 'center';
      source.dataset.traceBindingLine = String(descriptor.line || '');
    });
  }

  function renderStudioObjects(root, document, frame, placements, elements, options = {}, sourceObjects = null) {
    const objects = (sourceObjects || document.studio?.objects || []).filter(object => studioObjectVisible(object, frame));
    objects.forEach(studioObject => {
      // Auto bindings may supply a transient placement without inventing a
      // real array index. It is not persisted in the Trace Studio document.
      const markerPlacement = studioObject.markerUnresolved ? studioObject.markerPlacement : null;
      const target = markerPlacement
        ? anchorPoint(markerPlacement, 'top')
        : resolveAnchor(document, frame, studioObject.target, placements);
      if (!target) return;
      const pointerTarget = markerPlacement ? anchorPoint(markerPlacement, 'center') : studioObject.pointerTarget
        ? resolveAnchor(document, frame, studioObject.pointerTarget, placements)
        : target;
      const key = `studio:${studioObject.id}`;
      const position = studioPosition(document, frame, key);
      const offsetX = (Number(studioObject.offsetX) || 0) + position.x;
      const offsetY = (Number(studioObject.offsetY) || 0) + position.y;
      const baseX = target.x + offsetX;
      const baseY = target.y + offsetY;
      const object = markSelectable(svg('g', {
        id: `${options.idPrefix || 'trace'}-studio-${String(studioObject.id).replace(/[^A-Za-z0-9_-]/g, '-')}`,
        class: 'asm-trace-object asm-trace-bound-object',
        transform: `translate(${baseX}, ${baseY})`,
        'data-base-offset': `${baseX},${baseY}`,
        'data-studio-offset': `${position.x},${position.y}`,
        'data-trace-bound': '1',
        'data-translate': '0,0',
        'data-trace-object-key': key
      }), key, { ...options, movable: true });
      object.dataset.tracePositionApplied = '1';
      object.dataset.tracePositionSpace = 'origin';
      // A bound marker's motion origin is its rendered position, not its
      // persisted Studio drag offset. Keeping the offset in tracePosition made
      // every automatic marker look as though it lived at (0, 0), so recursive
      // heap markers could not tween between their actual cells.
      object.dataset.tracePositionX = String(
        studioObject.type === 'variable-marker' ? baseX : position.x
      );
      object.dataset.tracePositionY = String(
        studioObject.type === 'variable-marker' ? baseY : position.y
      );
      if (studioObject.sourceVariableId) {
        object.dataset.traceSourceVariableId = studioObject.sourceVariableId;
      }
      if (studioObject.sourceRuntimeIdentity) {
        object.dataset.traceRuntimeIdentity = studioObject.sourceRuntimeIdentity;
      }
      if (studioObject.sourceVisualContinuityKey) {
        object.dataset.traceVisualContinuityKey = studioObject.sourceVisualContinuityKey;
      }
      const sourceVariableIds = Array.isArray(studioObject.sourceVariableIds)
        ? studioObject.sourceVariableIds.filter(Boolean)
        : studioObject.sourceVariableId ? [studioObject.sourceVariableId] : [];
      if (sourceVariableIds.length) {
        object.dataset.traceSourceVariableIds = JSON.stringify([...new Set(sourceVariableIds)]);
      }
      if (studioObject.indexExpression) {
        object.dataset.traceMarkerIndexExpression = studioObject.indexExpression;
      }
      const boundTargetKey = markerPlacement ? '' : resolvedTargetKey(document, frame, studioObject.target, placements);
      if (boundTargetKey) object.dataset.traceBindingTarget = boundTargetKey;
      if (markerPlacement) {
        object.dataset.traceMarkerUnresolved = '1';
        object.dataset.traceMarkerTargetX = String(pointerTarget.x + (Number(studioObject.pointerTargetOffsetX) || 0));
        object.dataset.traceMarkerTargetY = String(pointerTarget.y);
      }
      const motion = svg('g', { class: 'asm-trace-motion' });
      object.append(motion);
      let box;
      if (studioObject.type === 'repeat-cells') {
        const raw = window.ASMTraceRules.resolveExpression(document, frame, studioObject.countExpression);
        const count = Math.max(0, Math.min(100, Math.floor(Number(raw) || 0)));
        if (!count) return;
        const width = Math.max(18, Math.min(52, Number(studioObject.cellWidth) || 28));
        const height = Math.max(18, Math.min(64, Number(studioObject.cellHeight) || 34));
        const gap = Number(studioObject.gap) || 0;
        const totalWidth = count * width + Math.max(0, count - 1) * gap;
        for (let index = 0; index < count; index += 1) {
          const cellKey = `${key}#${index}`;
          motion.append(markSelectable(svg('rect', {
            x: -totalWidth / 2 + index * (width + gap), y: -height / 2,
            width, height,
            fill: studioObject.color || '#dcecff',
            stroke: studioObject.stroke || '#3976b8',
            'stroke-width': 1,
            'data-trace-generated-index': index
          }), cellKey, options, key));
        }
        box = { x: -totalWidth / 2, y: -height / 2, width: totalWidth, height };
      } else if (studioObject.type === 'variable-marker') {
        const source = document.variables?.[studioObject.sourceVariableId];
        const sourceEntry = frame.state?.[studioObject.sourceVariableId];
        const label = studioObject.text || source?.name || 'index';
        const shape = studioObject.shape || 'array';
        if (shape === 'arrow') {
          const labelWidth = 18;
          const labelHeight = labelWidth;
          const labelLength = Math.max(1, Array.from(String(label)).length);
          const fontSize = Math.max(4, Math.min(8, (labelWidth - 4) / (labelLength * 0.62)));
          // Mirrors a normal draw_array cell: #333 with a 1px outline.
          const borderColor = '#333';
          const borderWidth = 1;
          const labelTop = -40;
          const labelBottom = labelTop + labelHeight;
          const arrowTop = labelBottom;
          const halfLabelWidth = labelWidth / 2;
          // Aim at the cell center while keeping every rendered arrow the same length.
          const aimX = (pointerTarget?.x ?? target.x)
            + (Number(studioObject.pointerTargetOffsetX) || 0)
            - target.x - offsetX;
          const aimY = (pointerTarget?.y ?? target.y) - target.y - offsetY;
          const directionX = aimX;
          const directionY = aimY - arrowTop;
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
          motion.append(
            svg('rect', {
              class: 'trace-variable-marker-label-box',
              x: -labelWidth / 2,
              y: labelTop,
              width: labelWidth,
              height: labelHeight,
              rx: 0,
              fill: '#bfe8f7',
              'fill-opacity': 0.58,
              stroke: borderColor,
              'stroke-width': borderWidth
            }),
            svg('text', {
              class: 'trace-variable-marker-label-text',
              x: 0, y: labelTop + labelHeight / 2, 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-family': 'Arial', 'font-size': fontSize,
              'font-weight': 'bold', fill: studioObject.textColor || '#1f282d'
            }, label)
          );
          const point = svg('g', { class: 'trace-variable-marker-point' });
          point.append(svg('path', {
            d: `M 0 ${arrowTop} L ${pointerX} ${pointerY} M ${headLeftX} ${headLeftY} L ${pointerX} ${pointerY} L ${headRightX} ${headRightY}`,
            fill: 'none',
            stroke: borderColor,
            'stroke-width': borderWidth,
            'stroke-linecap': 'square',
            'stroke-linejoin': 'miter'
          }));
          motion.append(point);
          object.dataset.traceMarkerBaseCellWidth = String(
            Math.max(1, Number(studioObject.baseCellWidth) || 40)
          );
          const boxLeft = Math.min(-halfLabelWidth, pointerX, headLeftX, headRightX);
          const boxTop = Math.min(labelTop, pointerY, headLeftY, headRightY);
          const boxRight = Math.max(halfLabelWidth, pointerX, headLeftX, headRightX);
          const boxBottom = Math.max(labelBottom, pointerY, headLeftY, headRightY);
          box = { x: boxLeft, y: boxTop, width: boxRight - boxLeft, height: boxBottom - boxTop };
        } else {
          const content = svg('g');
          motion.append(content);
          const sourceSkin = document.skins?.[studioObject.sourceVariableId] || {};
          const rendererName = sourceSkin.renderer || source?.kind || sourceEntry?.data?.kind || 'object';
          const renderer = renderers.get(rendererName) || renderers.get(sourceEntry?.data?.kind) || renderObject;
          const height = renderer(content, sourceEntry, {
            variable: { ...(source || {}), name: label },
            variableId: key,
            skin: sourceSkin,
            rendererName,
            highlights: {},
            diff: [],
            idPrefix: `${options.idPrefix || 'trace'}-marker-original`,
            interactive: options.interactive
          });
          const originalBox = measuredBox(content, { x: 0, y: 0, width: 56, height: Number(height) || 92 });
          const offsetX = -originalBox.x - originalBox.width / 2;
          const offsetY = -originalBox.y - originalBox.height - 8;
          content.setAttribute('transform', `translate(${offsetX}, ${offsetY})`);
          box = {
            x: -originalBox.width / 2,
            y: -originalBox.height - 8,
            width: originalBox.width,
            height: originalBox.height
          };
        }
      } else {
        const source = document.variables?.[studioObject.sourceVariableId];
        const label = studioObject.text || source?.name || '標記';
        const width = Math.max(28, Math.min(120, 18 + String(label).length * 10));
        motion.append(
          svg('rect', { x: -width / 2, y: -28, width, height: 24, rx: 4, fill: studioObject.color || '#1d8f83' }),
          svg('text', {
            x: 0, y: -11, 'text-anchor': 'middle', 'font-family': 'Arial', 'font-size': 16,
            'font-weight': 'bold', fill: studioObject.textColor || '#ffffff'
          }, label),
          svg('path', { d: 'M -5 -4 L 5 -4 L 0 3 Z', fill: studioObject.color || '#1d8f83' })
        );
        box = { x: -width / 2, y: -28, width, height: 31 };
      }
      if (studioObject.type === 'variable-marker') {
        object.dataset.traceMarkerPopupX = String(baseX);
        object.dataset.traceMarkerPopupY = String(baseY + box.y);
        object.dataset.traceMarkerSortKey = String(studioObject.markerSortKey || studioObject.text || '');
      }
      root.append(object);
      animateObjectPosition(motion, options, key, { x: baseX, y: baseY });
      placements.set(key, { x: baseX + box.x, y: baseY + box.y, width: box.width, height: box.height });
      elements.set(key, object);
      collectElementPlacements(motion, baseX, baseY, placements, elements);
    });
  }

  function renderFrameBindings(root, document, frame, placements, elements, options = {}) {
    const bindings = Array.isArray(frame.bindings) ? frame.bindings : [];
    if (!bindings.length) return;
    const pending = [];
    const visualContinuityOrdinals = new Map();

    bindings.forEach((binding, index) => {
      const targetEntry = frame.state?.[binding.targetVariableId];
      const targetItems = Array.isArray(targetEntry?.data?.items) ? targetEntry.data.items : [];
      const targetKind = targetEntry?.data?.kind;
      const indexExpression = binding.indexExpression || binding.sourceName;
      const rawIndexValue = window.ASMTraceRules.resolveExpression(document, frame, indexExpression);
      const resolvedIndexValue = rawIndexValue == null ? NaN : Number(rawIndexValue);
      const hasIndexValue = Number.isInteger(resolvedIndexValue);
      const indexValue = hasIndexValue ? resolvedIndexValue : null;
      if (binding.mode !== 'index'
        || !targetEntry
        || targetKind === 'matrix'
        || !targetItems.length) return;
      const unresolvedReference = hasIndexValue ? null : leftmostVisibleIndexPlacement(
        frame, binding.targetVariableId, placements, elements
      );
      if (hasIndexValue ? !ensureLinearIndexPlacement(
        frame,
        binding.targetVariableId,
        indexValue,
        targetItems.length,
        placements
      ) : !unresolvedReference) return;

      const label = binding.indexExpression
        || binding.sourceName
        || document.variables?.[binding.sourceVariableId]?.name
        || 'index';
      const targetObjectKey = objectKeyForVariable(frame, binding.targetVariableId);
      const targetKey = unresolvedReference?.key || `${targetObjectKey}#${indexValue}`;
      const targetPlacement = unresolvedReference?.placement || placements.get(targetKey);
      const targetElement = elements.get(targetKey);
      const baseCellWidth = Number(
        targetElement?.closest?.('[data-layout]')?.getAttribute?.('data-box-size')
      ) || 40;
      const visualContinuityBase = [
        'auto-marker',
        binding.sourceVariableId,
        binding.targetVariableId,
        binding.sourceName || binding.indexExpression || ''
      ].join(':');
      const visualContinuityOrdinal = visualContinuityOrdinals.get(visualContinuityBase) || 0;
      visualContinuityOrdinals.set(visualContinuityBase, visualContinuityOrdinal + 1);
      pending.push({
        id: `auto-frame-binding-${binding.sourceVariableId}-${binding.targetVariableId}-${index}`,
        type: 'variable-marker',
        sourceVariableId: binding.sourceVariableId,
        sourceVariableIds: binding.sourceVariableIds || [binding.sourceVariableId],
        sourceRuntimeIdentity: frame.state?.[binding.sourceVariableId]?.identity || '',
        // Runtime identity still distinguishes recursive stack activations for
        // event snapshots. This stable role key is only for visual continuity,
        // so the same automatic marker moves instead of re-entering on every call.
        sourceVisualContinuityKey: `${visualContinuityBase}:${visualContinuityOrdinal}`,
        targetVariableId: binding.targetVariableId,
        targetObjectKey,
        targetRuntimeIdentity: targetEntry?.identity || '',
        targetPlacement,
        baseCellWidth,
        indexValue,
        unresolvedIndex: !hasIndexValue,
        label,
        markerSortKey: binding.sourceName
          || document.variables?.[binding.sourceVariableId]?.name
          || label,
        markerSortExpression: indexExpression,
        indexExpression,
        labelWidth: 18,
        target: {
          variableId: binding.targetVariableId,
          indexExpression: String(indexValue),
          anchor: 'top'
        },
        pointerTarget: {
          variableId: binding.targetVariableId,
          indexExpression: String(indexValue),
          anchor: 'center'
        },
        text: label,
        shape: 'arrow',
        color: '#12a6df',
        stroke: '#0b7ead'
      });
    });

    const groups = new Map();
    pending.forEach(item => {
      const target = item.targetPlacement;
      const groupKey = item.unresolvedIndex
        ? `unresolved:${item.targetObjectKey}`
        : target
        ? [target.x, target.y, target.width, target.height]
          .map(value => Math.round((Number(value) || 0) * 10) / 10)
          .join(':')
        : `${item.targetRuntimeIdentity || item.targetObjectKey || item.targetVariableId}#${item.indexValue}`;
      if (!groups.has(groupKey)) groups.set(groupKey, []);
      groups.get(groupKey).push(item);
    });

    const objects = [];
    groups.forEach(group => {
      const orderedGroup = [...group].sort((left, right) => {
        const byVariable = String(left.markerSortKey || '').localeCompare(
          String(right.markerSortKey || ''), 'en', { numeric: true, sensitivity: 'base' }
        );
        if (byVariable) return byVariable;
        const byExpression = String(left.markerSortExpression || '').localeCompare(
          String(right.markerSortExpression || ''), 'en', { numeric: true, sensitivity: 'base' }
        );
        return byExpression || String(left.id).localeCompare(String(right.id));
      });
      const gap = 8;
      const totalWidth = orderedGroup.reduce((total, item) => total + item.labelWidth, 0)
        + Math.max(0, orderedGroup.length - 1) * gap;
      const targetPlacement = orderedGroup[0].targetPlacement || placements.get(
        `${orderedGroup[0].targetObjectKey}#${orderedGroup[0].indexValue}`
      );
      const targetWidth = Math.max(0, Number(targetPlacement?.width) || 0);
      const baseCellWidth = Math.max(1, Number(orderedGroup[0].baseCellWidth) || 40);
      const unresolved = orderedGroup[0].unresolvedIndex;
      // Move the entire group horizontally, preserving the reference cell's
      // top/center anchors. The rightmost label ends 8px before its left edge.
      const markerPlacement = unresolved ? {
        ...targetPlacement,
        x: targetPlacement.x - gap - totalWidth / 2 - targetPlacement.width / 2
      } : null;
      const keepArrowsVertical = orderedGroup.length > 1
        && targetWidth >= baseCellWidth * 2 - 0.5;
      let cursor = -totalWidth / 2;
      orderedGroup.forEach(item => {
        item.offsetX = cursor + item.labelWidth / 2;
        item.pointerTargetOffsetX = keepArrowsVertical ? item.offsetX : 0;
        cursor += item.labelWidth + gap;
        const {
          targetVariableId, targetObjectKey, targetRuntimeIdentity,
          targetPlacement: ignoredTargetPlacement,
          indexValue, unresolvedIndex, labelWidth, label, markerSortExpression, ...object
        } = item;
        if (unresolvedIndex) {
          object.markerUnresolved = true;
          object.markerPlacement = markerPlacement;
          delete object.target;
          delete object.pointerTarget;
        }
        objects.push(object);
      });
    });

    if (objects.length) renderStudioObjects(root, document, frame, placements, elements, options, objects);
  }

  function renderStudioArrows(rootSvg, root, document, frame, placements, elements, options = {}) {
    const arrows = Array.isArray(document.studio?.arrows) ? document.studio.arrows : [];
    if (!arrows.length) return;
    const markerId = ensureArrowMarker(rootSvg, options.idPrefix || 'asm-trace');
    const layer = svg('g', { id: `${options.idPrefix || 'asm-trace'}-studio-arrows` });
    arrows.filter(arrow => arrowVisible(arrow, frame)).forEach(arrow => {
      const fromTarget = arrow.from || { variableId: arrow.fromVariableId, anchor: 'right' };
      const toTarget = arrow.to || { variableId: arrow.toVariableId, anchor: 'left' };
      const from = targetPlacement(document, frame, placements, fromTarget);
      const to = targetPlacement(document, frame, placements, toTarget);
      if (!from || !to) return;
      const color = arrow.color || '#e53935';
      const start = anchorPoint(from, fromTarget.anchor || 'right');
      const end = anchorPoint(to, toTarget.anchor || 'left');
      const key = `arrow:${arrow.id}`;
      const attributes = {
        id: `trace-arrow-${String(arrow.id).replace(/[^A-Za-z0-9_-]/g, '-')}`,
        stroke: color, 'stroke-width': arrow.width || 3, fill: 'none',
        'marker-end': `url(#${markerId})`, 'data-trace-arrow': arrow.id,
        'data-trace-object-key': key
      };
      const withinSameObject = fromTarget.variableId === toTarget.variableId
        && fromTarget.indexExpression && toTarget.indexExpression;
      if (withinSameObject) {
        const lift = Math.max(24, Math.min(70, Math.abs(end.x - start.x) * 0.45));
        layer.append(markSelectable(svg('path', {
          ...attributes,
          d: `M ${start.x} ${start.y} C ${start.x} ${start.y - lift}, ${end.x} ${end.y - lift}, ${end.x} ${end.y}`
        }), key, { ...options, movable: true }));
      } else {
        layer.append(markSelectable(svg('line', {
          ...attributes, x1: start.x, y1: start.y, x2: end.x, y2: end.y
        }), key, { ...options, movable: true }));
      }
      placements.set(key, {
        x: Math.min(start.x, end.x), y: Math.min(start.y, end.y) - (withinSameObject ? 28 : 0),
        width: Math.max(1, Math.abs(end.x - start.x)),
        height: Math.max(1, Math.abs(end.y - start.y) + (withinSameObject ? 28 : 0))
      });
      elements.set(key, layer.lastElementChild);
    });
    root.prepend(layer);
  }

  function renderDecorations(root, document, frame, startY, placements, elements, options = {}) {
    let y = startY;
    for (const decoration of window.ASMTraceRules.decorations(document, frame)) {
      if (decoration.count <= 0) continue;
      const key = `rule:${decoration.ruleId}`;
      const position = studioPosition(document, frame, key);
      const baseX = position.x;
      const baseY = position.absolute ? position.y : y + position.y;
      const object = markSelectable(svg('g', {
        id: `${options.idPrefix || 'trace'}-decoration-${String(decoration.ruleId).replace(/[^A-Za-z0-9_-]/g, '-')}`,
        class: 'asm-trace-object asm-trace-decoration',
        transform: `translate(${baseX}, ${baseY})`,
        'data-base-offset': `${baseX},${baseY}`,
        'data-translate': '0,0',
        'data-trace-object-key': key
      }), key, { ...options, movable: true });
      object.dataset.tracePositionApplied = '1';
      object.dataset.tracePositionSpace = 'origin';
      object.dataset.tracePositionX = String(baseX);
      object.dataset.tracePositionY = String(baseY);
      const motion = svg('g', { class: 'asm-trace-motion' });
      const content = svg('g');
      motion.append(content);
      object.append(motion);
      const items = Array.from({ length: decoration.count }, () => ({ kind: 'scalar', value: '' }));
      const decorationHighlights = Object.fromEntries(items.map((item, index) => [String(index), {
        fill: decoration.color || '#dcecff',
        stroke: decoration.stroke || '#3976b8'
      }]));
      const height = renderOriginal(content, { data: { kind: 'sequence', items } }, {
        variable: { kind: 'sequence', name: decoration.label || '條件產生物件' }, variableId: key,
        skin: { options: { showIndex: false, gap: Number(decoration.gap) || 0 } },
        rendererName: 'original-array', highlights: decorationHighlights, diff: [],
        idPrefix: `${options.idPrefix || 'trace'}-original`, interactive: options.interactive
      });
      root.append(object);
      animateObjectPosition(motion, options, key, { x: baseX, y: baseY });
      const box = measuredBox(content, { x: 0, y: 0, width: Math.max(40, decoration.count * 40), height });
      placements.set(key, { x: baseX + box.x, y: baseY + box.y, width: box.width, height: box.height });
      elements.set(key, object);
      collectElementPlacements(content, baseX, baseY, placements, elements);
      y += Math.max(76, Number(height) || 76) + 28;
    }
    return y;
  }

  function snapshotRuntimeIdentity(document, snapshot) {
    if (snapshot.sourceIdentity) return snapshot.sourceIdentity;
    const frames = document.frames || [];
    const createdIndex = frames.findIndex(item => item.id === snapshot.createdFrameId);
    for (let index = createdIndex >= 0 ? createdIndex : frames.length - 1; index >= 0; index -= 1) {
      const identity = frames[index]?.state?.[snapshot.sourceVariableId]?.identity;
      if (identity) return identity;
    }
    return '';
  }

  function renderSnapshots(root, document, frame, startY, placements, elements, options = {}, keepNodes = []) {
    const snapshotsById = new Map((document.snapshots || []).map(snapshot => [snapshot.id, snapshot]));
    const visibilityStates = document.studio?.visibility?.[frame.id] || {};
    const editingVisibility = window.document.body.classList.contains('asm-trace-studio-open');
    let y = startY;
    (frame.snapshotIds || []).forEach(snapshotId => {
      const snapshot = snapshotsById.get(snapshotId);
      const objectKey = snapshotObjectKey(snapshot);
      const visibility = visibilityStates[objectKey] || visibilityStates[snapshotId];
      if (!snapshot || !objectKey || (!editingVisibility && visibility === 'hidden')) return;
      if (snapshot.kind === 'frame' && snapshot.frame) {
        const position = snapshotStudioPosition(document, frame, snapshot);
        const baseX = position.x;
        const baseY = position.absolute ? position.y : y + position.y;
        const object = markSelectable(svg('g', {
          id: `${options.idPrefix || 'trace'}-${safeKey(objectKey)}`,
          class: 'asm-trace-object asm-trace-snapshot asm-trace-frame-snapshot',
          transform: `translate(${baseX}, ${baseY})`,
          'data-base-offset': `${baseX},${baseY}`,
          'data-translate': '0,0',
          'data-trace-snapshot': snapshotId,
          'data-trace-object-key': objectKey,
          'data-trace-object-id': objectKey
        }), objectKey, { ...options, movable: true });
        object.dataset.tracePositionApplied = '1';
        object.dataset.tracePositionSpace = 'origin';
        object.dataset.tracePositionX = String(baseX);
        object.dataset.tracePositionY = String(baseY);
        const motion = svg('g', { class: 'asm-trace-motion' });
        const content = svg('g');
        motion.append(content);
        object.append(motion);
        root.append(object);
        const sourceIndex = document.frames?.findIndex(item => item.id === snapshot.sourceFrameId) ?? -1;
        const frozenFrame = { ...snapshot.frame, snapshotIds: [] };
        const frozenScene = renderScene(
          root.ownerSVGElement,
          content,
          document,
          frozenFrame,
          sourceIndex > 0 ? document.frames[sourceIndex - 1] : null,
          {
            idPrefix: `${options.idPrefix || 'trace'}-${safeKey(objectKey)}`,
            interactive: false,
            animatePositions: false,
            transform: ''
          }
        );
        const contentBox = measuredBox(content, { x: 0, y: 0, width: 180, height: 100 });
        animateObjectPosition(motion, options, objectKey, { x: baseX, y: baseY });
        placements.set(objectKey, {
          x: baseX + contentBox.x,
          y: baseY + contentBox.y,
          width: contentBox.width,
          height: contentBox.height
        });
        elements.set(objectKey, object);
        Object.keys(snapshot.frame.state || {}).forEach(variableId => {
          const sourceKey = objectKeyForVariable(snapshot.frame, variableId);
          const sourcePlacement = frozenScene.placements.get(sourceKey);
          const sourceElement = frozenScene.elements.get(sourceKey);
          if (!sourcePlacement || !sourceElement) return;
          keepNodes.push({
            snapshotId: objectKey,
            variableId,
            runtimeIdentity: snapshot.frame.state?.[variableId]?.identity || '',
            relative: {
              x: sourcePlacement.x - contentBox.x,
              y: sourcePlacement.y - contentBox.y,
              width: sourcePlacement.width,
              height: sourcePlacement.height
            }
          });
        });
        y += Math.max(76, contentBox.height) + 28;
        return;
      }
      const sourceVariable = document.variables?.[snapshot.sourceVariableId] || {};
      const variable = { ...sourceVariable, id: objectKey, name: snapshot.label || sourceVariable.name || 'Snapshot' };
      const entry = { name: variable.name, data: snapshot.data };
      const baseSkin = document.skins?.[snapshot.sourceVariableId] || {};
      const skin = {
        ...baseSkin,
        options: { ...(baseSkin.options || {}), ...(snapshot.rendererOptions || {}) }
      };
      const rendererName = snapshot.renderer
        || skin.renderer || variable.kind || entry.data?.kind || 'object';
      const renderer = renderers.get(rendererName) || renderers.get(entry.data?.kind) || renderObject;
      const sourceFrame = snapshot.sourceFrameId
        ? document.frames?.find(item => item.id === snapshot.sourceFrameId)
        : null;
      const snapshotStyleFrame = sourceFrame && Array.isArray(snapshot.styles)
        ? { ...sourceFrame, events: [], styles: snapshot.styles }
        : null;
      const snapshotHighlights = snapshotStyleFrame
        ? window.ASMTraceRules.evaluate({ ...document, rules: [] }, snapshotStyleFrame)[snapshot.sourceVariableId] || {}
        : {};
      const position = snapshotStudioPosition(document, frame, snapshot);
      const baseX = position.x;
      const baseY = position.absolute ? position.y : y + position.y;
      const object = markSelectable(svg('g', {
        id: `${options.idPrefix || 'trace'}-${safeKey(objectKey)}`,
        class: 'asm-trace-object asm-trace-snapshot',
        transform: `translate(${baseX}, ${baseY})`,
        'data-base-offset': `${baseX},${baseY}`,
        'data-translate': '0,0',
        'data-trace-variable': objectKey,
        'data-trace-snapshot': snapshotId,
        'data-trace-object-key': objectKey,
        'data-trace-object-id': objectKey
      }), objectKey, { ...options, movable: true });
      object.dataset.tracePositionApplied = '1';
      object.dataset.tracePositionSpace = 'origin';
      object.dataset.tracePositionX = String(baseX);
      object.dataset.tracePositionY = String(baseY);
      const motion = svg('g', { class: 'asm-trace-motion' });
      const content = svg('g');
      motion.append(content);
      object.append(motion);
      root.append(object);
      let height = renderer(content, entry, {
        variable, variableId: objectKey, skin, rendererName,
        highlights: snapshotHighlights, diff: [],
        idPrefix: `${options.idPrefix || 'trace'}-${safeKey(objectKey)}`, interactive: options.interactive
      });
      removeScalarIndexLabels(content, variable, rendererName);
      const contentBox = measuredBox(content, { x: 0, y: 0, width: 180, height: Number(height) || 76 });
      if (!content.querySelector(':scope > .outerframe-label')) {
        const labelY = Math.max(Number(height) || 0, contentBox.y + contentBox.height) + 20;
        motion.append(markSelectable(svg('text', {
          x: contentBox.x + contentBox.width / 2,
          y: labelY,
          'text-anchor': 'middle',
          'font-family': 'Arial',
          'font-size': 16,
          'font-weight': 'bold',
          fill: '#384348'
        }, variable.name), `${objectKey}:label`, options, objectKey));
        height = Math.max(Number(height) || 0, labelY + 8);
      } else {
        height = Math.max(Number(height) || 0, contentBox.y + contentBox.height);
      }
      animateObjectPosition(motion, options, objectKey, { x: baseX, y: baseY });
      const box = measuredBox(object, {
        x: contentBox.x,
        y: Math.min(-20, contentBox.y),
        width: contentBox.width,
        height: Math.max(76, Number(height) || 76, contentBox.height)
      });
      placements.set(objectKey, { x: baseX + box.x, y: baseY + box.y, width: box.width, height: box.height });
      elements.set(objectKey, object);
      collectElementPlacements(motion, baseX, baseY, placements, elements);
      keepNodes.push({
        snapshotId: objectKey,
        variableId: snapshot.sourceVariableId,
        runtimeIdentity: snapshotRuntimeIdentity(document, snapshot),
        relative: {
          x: contentBox.x - box.x,
          y: contentBox.y - box.y,
          width: contentBox.width,
          height: contentBox.height
        }
      });
      y += Math.max(76, Number(height) || 76) + 28;
    });
    return y;
  }

  function renderScene(rootSvg, parent, document, frame, previousFrame = null, options = {}) {
    const idPrefix = options.idPrefix || 'trace';
    const rootAttributes = { transform: options.transform == null ? 'translate(90, 80)' : options.transform };
    if (options.rootId) rootAttributes.id = options.rootId;
    const root = svg('g', rootAttributes);
    parent.append(root);
    const highlights = window.ASMTraceRules.evaluate(document, frame);
    applyFixedEventStyles(document, frame, highlights);
    const diff = window.ASMTraceModel.diffFrame(previousFrame, frame);
    const placements = new Map();
    const elements = new Map();
    const editingVisibility = window.document.body.classList.contains('asm-trace-studio-open');
    const visibilityStates = document.studio?.visibility?.[frame.id] || {};
    const hiddenVariables = new Set((document.studio?.objects || [])
      .filter(object => object.hideSource && object.sourceVariableId && studioObjectVisible(object, frame))
      .map(object => object.sourceVariableId));
    (frame.captureOnlyVariableIds || []).forEach(variableId => hiddenVariables.add(variableId));
    (frame.bindings || []).forEach(binding => {
      if (binding.mode !== 'index') return;
      const sourceVariableIds = binding.sourceVariableIds || [binding.sourceVariableId];
      sourceVariableIds.filter(Boolean).forEach(variableId => hiddenVariables.add(variableId));
    });
    const keepNodes = [];
    let y = renderSnapshots(root, document, frame, 0, placements, elements, options, keepNodes);
    Object.entries(document.variables || {}).forEach(([variableId, variable]) => {
      const entry = frame.state?.[variableId];
      const objectKey = objectKeyForVariable(frame, variableId);
      if (!entry || hiddenVariables.has(variableId)
        || (!editingVisibility && visibilityStates[objectKey] === 'hidden')) return;
      const baseSkin = document.skins?.[variableId] || {};
      const frameOptions = frame.rendererOptions?.[variableId] || {};
      const skin = {
        ...baseSkin,
        options: { ...(baseSkin.options || {}), ...frameOptions }
      };
      const rendererName = frame.renderers?.[variableId]
        || skin.renderer || variable.kind || entry.data?.kind || 'object';
      const renderer = renderers.get(rendererName) || renderers.get(entry.data?.kind) || renderObject;
      const position = studioPosition(document, frame, objectKey);
      const baseX = position.x;
      const baseY = position.absolute ? position.y : y + position.y;
      const object = markSelectable(svg('g', {
        id: `${idPrefix}-${objectKey.replace(/[^A-Za-z0-9_-]/g, '-')}`,
        class: 'asm-trace-object',
        transform: `translate(${baseX}, ${baseY})`,
        'data-base-offset': `${baseX},${baseY}`,
        'data-translate': '0,0',
        'data-trace-variable': variableId,
        'data-trace-object-key': objectKey,
        'data-trace-object-id': objectKey,
        'data-trace-runtime-identity': ['sequence', 'matrix', 'map', 'set', 'object'].includes(entry.data?.kind)
          ? entry.identity || ''
          : ''
      }), objectKey, { ...options, movable: true });
      object.dataset.tracePositionApplied = '1';
      object.dataset.tracePositionSpace = 'origin';
      object.dataset.tracePositionX = String(baseX);
      object.dataset.tracePositionY = String(baseY);
      const motion = svg('g', { class: 'asm-trace-motion' });
      const content = svg('g');
      motion.append(content);
      object.append(motion);
      root.append(object);
      let height = renderer(content, entry, {
        variable, variableId: objectKey, skin, rendererName,
        highlights: highlights[variableId] || {}, diff,
        idPrefix: `${idPrefix}-original`, interactive: options.interactive
      });
      removeScalarIndexLabels(content, variable, rendererName);
      const contentBox = measuredBox(content, { x: 0, y: 0, width: 180, height: Number(height) || 76 });
      if (!content.querySelector(':scope > .outerframe-label')) {
        const labelY = Math.max(Number(height) || 0, contentBox.y + contentBox.height) + 20;
        motion.append(markSelectable(svg('text', {
          x: contentBox.x + contentBox.width / 2,
          y: labelY,
          'text-anchor': 'middle',
          'font-family': 'Arial',
          'font-size': 16,
          'font-weight': 'bold',
          fill: '#384348'
        }, variable.name), `${objectKey}:label`, options, variableId));
        height = Math.max(Number(height) || 0, labelY + 8);
      } else {
        height = Math.max(Number(height) || 0, contentBox.y + contentBox.height);
      }
      animateObjectPosition(motion, options, objectKey, { x: baseX, y: baseY });
      const box = measuredBox(object, {
        x: contentBox.x,
        y: Math.min(-20, contentBox.y),
        width: contentBox.width,
        height: Math.max(76, Number(height) || 76, contentBox.height)
      });
      placements.set(objectKey, { x: baseX + box.x, y: baseY + box.y, width: box.width, height: box.height });
      elements.set(objectKey, object);
      collectElementPlacements(motion, baseX, baseY, placements, elements);
      y += Math.max(76, Number(height) || 76) + 28;
    });
    // Resolve frame/keep/Studio object placement before drawing anything that
    // is anchored to those objects. Otherwise @text, segments, arrows, and
    // automatic markers read the pre-offset coordinates from placements.
    applyBindings(document, frame, placements, elements);
    renderFrameSegments(root, document, frame, placements, elements, options);
    y = renderFrameTexts(root, document, frame, y, placements, elements, options);
    y = renderDecorations(root, document, frame, y, placements, elements, options);
    renderStudioObjects(root, document, frame, placements, elements, options);
    applySemanticTextBindings(document, frame, placements, elements);
    renderFrameBindings(root, document, frame, placements, elements, options);
    renderStudioArrows(rootSvg, root, document, frame, placements, elements, options);
    applyStoredPartPositions(document, frame, placements, elements);
    applyBindings(document, frame, placements, elements);
    renderKeepLastArrows(rootSvg, root, document, frame, placements, elements, keepNodes, options);
    applyObjectColorStyles(document, frame, elements);
    applyVisibilityStates(document, frame, elements);
    window.ASMTraceFrameTween?.updateEventAvailability?.(
      document, frame, placements, elements
    );
    const textLayer = root.querySelector(':scope > .asm-trace-text-layer');
    if (textLayer) root.append(textLayer);
    const transitionEventFrame = Number(options.direction) < 0 && previousFrame ? previousFrame : frame;
    const eventAnimationsEnabled = options.interactive !== false && options.animateEvents !== false;
    animateSwapEvents(document, transitionEventFrame, placements, elements,
      eventAnimationsEnabled && options.animatePositions !== false);
    animateEventTargets(document, transitionEventFrame, placements, elements,
      eventAnimationsEnabled);
    animatePartPositions(placements, elements, options);
    return { root, placements, elements, height: y };
  }

  function renderFrame(document, frame, previousFrame = null, options = {}) {
    const rootSvg = document && window.document.getElementById('arraySvg');
    if (!rootSvg || !frame) return Promise.resolve();
    window.ASMTraceFrameTween?.cancel?.();
    const previousPositions = objectPositions(rootSvg);
    const previousMotionPositions = objectMotionPositions(rootSvg, previousPositions);
    const previousObjects = captureTopLevelObjects(rootSvg);
    const sourceKeys = new Set(previousPositions.keys());
    const transitionForKey = key => previousFrame
      ? window.ASMTraceTransitions?.resolve?.(document, previousFrame, frame, key, sourceKeys)
      : null;
    const useFrameTween = Boolean(
      previousFrame
      && options.animatePositions !== false
      && window.ASMTraceFrameTween?.play
    );
    if (typeof window.clearCanvas === 'function') window.clearCanvas();
    rootSvg.querySelector('#asm-trace-root')?.remove();
    const viewport = window.getViewport?.() || rootSvg;
    const result = renderScene(rootSvg, viewport, document, frame, previousFrame, {
      rootId: 'asm-trace-root',
      idPrefix: 'trace',
      interactive: true,
      transform: `translate(${TRACE_ROOT_OFFSET.x}, ${TRACE_ROOT_OFFSET.y})`,
      previousPositions,
      transitionForKey,
      direction: options.direction,
      animatePositions: useFrameTween ? false : options.animatePositions !== false,
      animateEvents: useFrameTween ? false : options.animateEvents !== false
    });
    const delayedMarks = delayedCurrentFixedMarks(result.root, document, frame, useFrameTween);
    let transition = Promise.resolve();
    if (useFrameTween) {
      const defaults = window.ASMTraceTransitions?.defaults?.(document) || { duration: 520 };
      transition = window.ASMTraceFrameTween.play({
        root: result.root,
        document,
        frame,
        eventFrame: Number(options.direction) < 0 ? previousFrame : frame,
        direction: options.direction,
        previousFrame,
        previousPlacements: previousMotionPositions,
        currentPlacements: result.placements,
        previousObjects,
        currentElements: result.elements,
        transitionForKey,
        duration: defaults.duration
      });
    } else if (previousFrame) {
      const transitionOptions = {
        frame,
        previousPositions,
        transitionForKey,
        animatePositions: options.animatePositions !== false
      };
      animateChangedObjects(previousObjects, result.elements, transitionOptions);
      animateRemovedObjects(result.root, previousObjects, result.elements, document, transitionOptions);
    }
    currentScene = { document, frame, placements: result.placements, elements: result.elements, rootOffset: TRACE_ROOT_OFFSET };
    const playbackPlan = transition?.playbackPlan || null;
    transition = Promise.resolve(transition).then(() => {
      if (currentScene?.frame?.id === frame.id) revealDelayedFixedMarks(delayedMarks);
    });
    if (playbackPlan) transition.playbackPlan = playbackPlan;
    window.dispatchEvent(new CustomEvent('asm:trace-rendered', {
      detail: { document, frame, placements: result.placements, height: result.height }
    }));
    return transition;
  }

  function boundsFromPlacements(placements) {
    const boxes = [...(placements?.values?.() || [])].filter(box => (
      Number.isFinite(box?.x) && Number.isFinite(box?.y)
      && Number(box.width) > 0 && Number(box.height) > 0
    ));
    if (!boxes.length) return null;
    const left = Math.min(...boxes.map(box => box.x));
    const top = Math.min(...boxes.map(box => box.y));
    const right = Math.max(...boxes.map(box => box.x + box.width));
    const bottom = Math.max(...boxes.map(box => box.y + box.height));
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }

  function cameraRuleForFrame(document, frame) {
    return window.ASMTraceCamera.ruleForFrame(document, frame);
  }

  function mainCameraSize(includeCodeInset = true) {
    const canvas = window.document.getElementById('arraySvg');
    const rect = canvas?.getBoundingClientRect?.();
    const width = Number(rect?.width) || canvas?.clientWidth || 800;
    const height = Number(rect?.height) || canvas?.clientHeight || 450;
    return {
      width,
      height,
      aspect: width / Math.max(1, height),
      asmSafeInsetLeft: includeCodeInset
        ? Number(window.ASMTraceCodePresenter?.safeInsetLeft?.()) || 0
        : 0
    };
  }

  function autoCameraView(bounds, zoom = 0.92, offsetX = 0, offsetY = 0, includeCodeInset = true) {
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return null;
    const canvas = mainCameraSize(includeCodeInset);
    const sharedTarget = window.resolveAutoCameraTarget?.(bounds, zoom, offsetX, offsetY, canvas);
    if (sharedTarget) return sharedTarget;
    const padding = window.getAutoCameraPadding?.() || { horizontal: 30, vertical: 20 };
    const paddingX = Number(padding.horizontal) || 30;
    const paddingY = Number(padding.vertical) || 20;
    const availableWidth = Math.max(1, canvas.width - paddingX * 2);
    const availableHeight = Math.max(1, canvas.height - paddingY * 2);
    const maximumFitScale = Math.min(
      availableWidth / bounds.width,
      availableHeight / bounds.height
    );
    const preferredScale = Math.max(0.05, Number(zoom) || 0.92);
    const targetScale = preferredScale <= maximumFitScale + 0.0001
      ? preferredScale
      : Math.max(0.05, Math.min(4, maximumFitScale));
    return {
      centerX: (bounds.left + bounds.right) / 2 + (Number(offsetX) || 0),
      centerY: (bounds.top + bounds.bottom) / 2 + (Number(offsetY) || 0),
      width: canvas.width / targetScale,
      height: canvas.height / targetScale,
      scale: targetScale,
      paddingX,
      paddingY
    };
  }

  function cameraViewForScene(document, frame, placements, boundsOverride = null) {
    const bounds = boundsOverride || boundsFromPlacements(placements);
    if (!bounds) return null;
    const rule = cameraRuleForFrame(document, frame);
    if (rule?.manualFrame && Number.isFinite(Number(rule.centerX)) && Number.isFinite(Number(rule.centerY))) {
      const cameraTargetKey = cameraObjectKey(rule.binding?.targetKey);
      const boundPoint = cameraTargetKey
        ? anchorPoint(cameraTargetKey === 'keep'
          ? keepUnionPlacement(document, frame, placements)
          : placements?.get?.(cameraTargetKey), rule.binding.targetAnchor || 'center')
        : null;
      const viewport = window.getCameraViewport?.(Number(rule.zoom) || 0.92);
      const canvas = mainCameraSize();
      const zoom = Math.max(0.05, Number(rule.zoom) || 0.92);
      return {
        centerX: boundPoint
          ? boundPoint.x + (Number(rule.binding.dx) || 0)
          : Number(rule.centerX) - TRACE_ROOT_OFFSET.x,
        centerY: boundPoint
          ? boundPoint.y + (Number(rule.binding.dy) || 0)
          : Number(rule.centerY) - TRACE_ROOT_OFFSET.y,
        width: Number(viewport?.width) || canvas.width / zoom,
        height: Number(viewport?.height) || canvas.height / zoom
      };
    }
    const focus = rule?.target ? resolveAnchor(document, frame, rule.target, placements) : null;
    const followX = focus ? focus.x - (bounds.left + bounds.right) / 2 : 0;
    const followY = focus ? focus.y - (bounds.top + bounds.bottom) / 2 : 0;
    return autoCameraView(
      bounds,
      Number(rule?.zoom) || 0.92,
      (Number(rule?.offsetX) || 0) + followX,
      (Number(rule?.offsetY) || 0) + followY,
      false
    );
  }

  function setThumbnailCameraView(thumbnail, view) {
    if (!thumbnail || !view || !(view.width > 0) || !(view.height > 0)) return;
    thumbnail.setAttribute('viewBox', `${view.centerX - view.width / 2} ${view.centerY - view.height / 2} ${view.width} ${view.height}`);
  }

  function refreshThumbnailCamera(thumbnail, document, frame) {
    if (!thumbnail || !document || !frame) return;
    const rule = cameraRuleForFrame(document, frame);
    if (rule?.manualFrame) return;
    const root = thumbnail.querySelector('[data-trace-thumbnail-root]');
    let bounds = null;
    try {
      const box = root?.getBBox?.();
      if (box && box.width > 0 && box.height > 0) {
        bounds = {
          left: box.x, top: box.y,
          right: box.x + box.width, bottom: box.y + box.height,
          width: box.width, height: box.height
        };
      }
    } catch (error) {
      // A detached thumbnail will be refreshed on the next rail render.
    }
    setThumbnailCameraView(thumbnail, cameraViewForScene(document, frame, null, bounds));
  }

  function showMainCameraFrameInThumbnail(thumbnail, cameraFrame) {
    if (!thumbnail || !cameraFrame) return;
    setThumbnailCameraView(thumbnail, {
      centerX: cameraFrame.centerX - TRACE_ROOT_OFFSET.x,
      centerY: cameraFrame.centerY - TRACE_ROOT_OFFSET.y,
      width: cameraFrame.width,
      height: cameraFrame.height
    });
  }

  function createThumbnail(document, frame, previousFrame = null) {
    const frameKey = String(frame?.id || 'frame').replace(/[^A-Za-z0-9_-]/g, '-');
    const thumbnail = svg('svg', {
      class: 'trace-studio-frame-preview',
      role: 'img',
      'aria-label': `幀縮圖 ${frameKey}`,
      preserveAspectRatio: 'xMidYMid meet'
    });
    thumbnail.style.cssText = 'position:fixed;left:-10000px;top:-10000px;width:220px;height:112px;visibility:hidden;pointer-events:none;';
    window.document.body.append(thumbnail);
    let result;
    try {
      result = renderScene(thumbnail, thumbnail, document, frame, previousFrame, {
        idPrefix: `trace-thumb-${frameKey}`,
        interactive: false,
        animatePositions: false,
        transform: ''
      });
    } finally {
      thumbnail.remove();
      thumbnail.removeAttribute('style');
    }
    result.root.setAttribute('data-trace-thumbnail-root', '1');
    const placements = Array.from(result.placements.values());
    if (placements.length) {
      const left = Math.min(...placements.map(placement => placement.x));
      const top = Math.min(...placements.map(placement => placement.y));
      const right = Math.max(...placements.map(placement => placement.x + placement.width));
      const bottom = Math.max(...placements.map(placement => placement.y + placement.height));
      thumbnail.dataset.traceBounds = `${left},${top},${right},${bottom}`;
    }
    thumbnail.dataset.traceFrameId = frame.id;
    setThumbnailCameraView(thumbnail, cameraViewForScene(document, frame, result.placements));
    if (!thumbnail.hasAttribute('viewBox')) thumbnail.setAttribute('viewBox', `0 0 220 ${Math.max(100, result.height)}`);
    return thumbnail;
  }

  function frameAnchorForKey(document, frame, key, anchor = 'center', previousFrame = null) {
    if (!document || !frame || !key) return null;
    const host = svg('svg', { width: 1600, height: 1000, 'aria-hidden': 'true' });
    host.style.cssText = 'position:fixed;left:-10000px;top:-10000px;visibility:hidden;pointer-events:none;';
    window.document.body.append(host);
    try {
      const result = renderScene(host, host, document, frame, previousFrame, {
        idPrefix: `trace-measure-${safeKey(frame.id)}`,
        interactive: false,
        animatePositions: false,
        transform: ''
      });
      return anchorPoint(result.placements.get(key), anchor);
    } finally {
      host.remove();
    }
  }

  function fitThumbnails(thumbnails) {
    const boxes = (thumbnails || []).map(thumbnail => {
      const values = String(thumbnail?.dataset?.traceBounds || '').split(',').map(Number);
      if (values.length !== 4 || values.some(value => !Number.isFinite(value))) return null;
      return { x: values[0], y: values[1], width: values[2] - values[0], height: values[3] - values[1] };
    }).filter(box => box && box.width > 0 && box.height > 0);
    if (!boxes.length) return;
    const padding = 12;
    let left = Math.min(...boxes.map(box => box.x)) - padding;
    let top = Math.min(...boxes.map(box => box.y)) - padding;
    let width = Math.max(...boxes.map(box => box.x + box.width)) - left + padding;
    let height = Math.max(...boxes.map(box => box.y + box.height)) - top + padding;
    const aspect = 220 / 112;
    if (width / height > aspect) {
      const nextHeight = width / aspect;
      top -= (nextHeight - height) / 2;
      height = nextHeight;
    } else {
      const nextWidth = height * aspect;
      left -= (nextWidth - width) / 2;
      width = nextWidth;
    }
    const viewBox = `${left} ${top} ${Math.max(1, width)} ${Math.max(1, height)}`;
    thumbnails.forEach(thumbnail => thumbnail.setAttribute('viewBox', viewBox));
  }

  function fitThumbnail(thumbnail) {
    fitThumbnails([thumbnail]);
  }

  register('array', renderSequence);
  register('sequence', renderSequence);
  register('stack', renderSequence);
  register('queue', renderSequence);
  register('set', renderSequence);
  register('matrix', renderMatrix);
  register('scalar', renderScalar);
  register('string', renderScalar);
  register('object', renderObject);
  register('node-graph', renderGraph);
  register('graph', renderGraph);
  register('coordinate-system', renderCoordinateSystem);
  register('original-array', renderOriginal);
  register('original-matrix', renderOriginal);
  register('original-cell', renderOriginal);
  register('original-heap', renderOriginal);
  register('original-segment-tree', renderOriginal);
  register('original-bit', renderOriginal);
  register('original-disk', renderOriginal);
  register('original-stack', renderOriginal);
  register('original-queue', renderOriginal);

  function currentAnchor(target) {
    if (!currentScene) return null;
    const point = resolveAnchor(currentScene.document, currentScene.frame, target, currentScene.placements);
    return point ? { x: point.x + currentScene.rootOffset.x, y: point.y + currentScene.rootOffset.y } : null;
  }

  function currentBounds(options = {}) {
    if (!currentScene?.placements?.size) return null;
    const snapshotsById = new Map((currentScene.document?.snapshots || []).map(snapshot => [snapshot.id, snapshot]));
    const snapshotIds = new Set((currentScene.frame?.snapshotIds || []).map(id => (
      snapshotObjectKey(snapshotsById.get(id)) || id
    )));
    const boxes = [...currentScene.placements.entries()]
      .filter(([key]) => options.includeSnapshots !== false || !snapshotIds.has(key))
      .map(([, box]) => box);
    if (!boxes.length) return null;
    const left = Math.min(...boxes.map(box => box.x)) + currentScene.rootOffset.x;
    const top = Math.min(...boxes.map(box => box.y)) + currentScene.rootOffset.y;
    const right = Math.max(...boxes.map(box => box.x + box.width)) + currentScene.rootOffset.x;
    const bottom = Math.max(...boxes.map(box => box.y + box.height)) + currentScene.rootOffset.y;
    return {
      left, top, right, bottom,
      width: right - left,
      height: bottom - top,
      centerX: (left + right) / 2,
      centerY: (top + bottom) / 2
    };
  }

  function fitCurrentObjectsCamera(
    zoom = 0.92,
    animate = true,
    duration = 520,
    offsetX = 0,
    offsetY = 0,
    includeSnapshots = true
  ) {
    const bounds = currentBounds({ includeSnapshots });
    const view = autoCameraView(bounds, zoom, offsetX, offsetY);
    if (!view) return null;
    const scale = Number(view.scale) || window.cameraScaleForViewportWidth?.(view.width);
    if (!Number.isFinite(Number(scale))) return null;
    window.setCamera?.(view.centerX, view.centerY, Number(scale), animate, duration);
    return { ...view, scale: Number(scale) };
  }

  function currentPlacement(key, viewportCoordinates = true) {
    const placement = key === 'keep' || key === '$keep'
      ? keepUnionPlacement(currentScene?.document, currentScene?.frame, currentScene?.placements || new Map())
      : currentScene?.placements?.get(key);
    if (!placement) return null;
    const offset = viewportCoordinates ? currentScene.rootOffset : { x: 0, y: 0 };
    return {
      x: placement.x + offset.x,
      y: placement.y + offset.y,
      width: placement.width,
      height: placement.height
    };
  }

  function currentAnchorForKey(key, anchor = 'center', viewportCoordinates = true) {
    return anchorPoint(currentPlacement(key, viewportCoordinates), anchor);
  }

  function currentObjectKeys() {
    return currentScene?.placements ? [...currentScene.placements.keys()] : [];
  }

  function cameraObjectKey(key) {
    return String(key || '').split('#')[0].replace(/:(?:label|index)$/, '');
  }

  document.documentElement.dataset.asmTraceRendererBuild = 'trace-136';
  window.ASMTraceRenderers = {
    build: 'trace-136',
    register, renderFrame, createThumbnail, fitThumbnail, fitThumbnails, displayValue,
    resolveAnchor, currentAnchor, currentBounds, fitCurrentObjectsCamera,
    currentPlacement, currentAnchorForKey, currentObjectKeys, cameraObjectKey, frameAnchorForKey, anchorPoint,
    refreshThumbnailCamera, showMainCameraFrameInThumbnail, keepUnionPlacement
  };
})();
