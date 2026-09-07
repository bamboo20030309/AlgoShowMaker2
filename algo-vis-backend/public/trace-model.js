(function () {
  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function normalizeData(data) {
    if (!data || typeof data !== 'object') return { kind: 'scalar', value: data ?? null };
    const kind = typeof data.kind === 'string' ? data.kind : 'object';
    if (['sequence', 'matrix', 'stack', 'queue', 'set'].includes(kind)) {
      return { ...data, kind, items: Array.isArray(data.items) ? data.items.map(normalizeData) : [] };
    }
    if (kind === 'map') {
      return {
        ...data,
        entries: Array.isArray(data.entries)
          ? data.entries.map(entry => ({ key: normalizeData(entry.key), value: normalizeData(entry.value) }))
          : []
      };
    }
    if (kind === 'node-graph') {
      return {
        ...data,
        nodes: data.nodes && typeof data.nodes === 'object' ? clone(data.nodes) : {},
        edges: Array.isArray(data.edges) ? clone(data.edges) : []
      };
    }
    if (kind === 'coordinate-system') {
      return { ...data, points: Array.isArray(data.points) ? clone(data.points) : [] };
    }
    return clone(data);
  }

  function defaultRenderer(variable = {}) {
    if (variable.kind === 'matrix') return 'original-matrix';
    if (variable.kind === 'stack') return 'original-stack';
    if (variable.kind === 'queue') return 'original-queue';
    if (['sequence', 'set', 'map'].includes(variable.kind)) return 'original-array';
    if (['scalar', 'string'].includes(variable.kind)) return 'original-cell';
    if (variable.kind === 'node-graph') return 'graph';
    if (variable.kind === 'coordinate-system') return 'coordinate-system';
    return 'object';
  }

  function canonicalRenderer(renderer, variable = {}) {
    const legacy = {
      array: 'original-array',
      sequence: 'original-array',
      matrix: 'original-matrix',
      scalar: 'original-cell',
      string: 'original-cell',
      stack: 'original-stack',
      queue: 'original-queue'
    };
    return legacy[renderer] || renderer || defaultRenderer(variable);
  }

  function normalizeSkins(variables, sourceSkins) {
    const skins = sourceSkins && typeof sourceSkins === 'object' ? clone(sourceSkins) : {};
    Object.entries(variables || {}).forEach(([variableId, variable]) => {
      const skin = skins[variableId] && typeof skins[variableId] === 'object'
        ? skins[variableId]
        : {};
      skins[variableId] = {
        ...skin,
        renderer: canonicalRenderer(skin.renderer, variable),
        options: skin.options && typeof skin.options === 'object' ? skin.options : {}
      };
    });
    return skins;
  }

  function applyFrameConditions(document) {
    if (!window.ASMTraceRules?.expressionMatches) return document;
    const accepted = [];
    let pendingEvents = [];
    (document.frames || []).forEach(frame => {
      const events = [...pendingEvents, ...(frame.events || [])]
        .sort((left, right) => Number(left?.order) - Number(right?.order));
      const candidate = { ...frame, events };
      const evaluationDocument = { ...document, frames: [...accepted, candidate] };
      if (window.ASMTraceRules.expressionMatches(
        evaluationDocument,
        candidate,
        candidate.source?.when
      )) {
        accepted.push(candidate);
        pendingEvents = [];
      } else {
        pendingEvents = events;
      }
    });
    document.frames = accepted;
    return document;
  }

  function normalizeTraceDocument(source = {}) {
    const variables = source.variables && typeof source.variables === 'object' ? clone(source.variables) : {};
    const frames = Array.isArray(source.frames) ? source.frames.map((frame, index) => ({
      id: frame.id || `frame-${index}`,
      source: frame.source && typeof frame.source === 'object' ? clone(frame.source) : {},
      state: Object.fromEntries(Object.entries(frame.state || {}).map(([id, entry]) => [id, {
        name: entry?.name || variables[id]?.name || id,
        identity: String(entry?.identity || ''),
        data: normalizeData(entry?.data)
      }])),
      events: Array.isArray(frame.events) ? clone(frame.events) : [],
      bindings: Array.isArray(frame.bindings) ? clone(frame.bindings) : [],
      objectBindings: Array.isArray(frame.objectBindings) ? clone(frame.objectBindings) : [],
      renderers: frame.renderers && typeof frame.renderers === 'object' ? clone(frame.renderers) : {},
      rendererOptions: frame.rendererOptions && typeof frame.rendererOptions === 'object'
        ? clone(frame.rendererOptions)
        : {},
      captureOnlyVariableIds: Array.isArray(frame.captureOnlyVariableIds)
        ? clone(frame.captureOnlyVariableIds)
        : [],
      texts: Array.isArray(frame.texts) ? clone(frame.texts) : [],
      styles: Array.isArray(frame.styles) ? clone(frame.styles) : [],
      segments: Array.isArray(frame.segments) ? clone(frame.segments) : [],
      snapshotIds: Array.isArray(frame.snapshotIds) ? clone(frame.snapshotIds) : [],
      keepLastFocus: frame.keepLastFocus === true
    })) : [];
    const normalized = {
      schemaVersion: source.schemaVersion || '1.0',
      generatedAt: source.generatedAt || '',
      sourceCode: typeof source.sourceCode === 'string' ? source.sourceCode : '',
      provenance: source.provenance && typeof source.provenance === 'object' ? clone(source.provenance) : null,
      sliceMode: source.sliceMode === 'manual' ? 'manual' : source.sliceMode === 'full' ? 'full' : 'auto',
      variables,
      frames,
      snapshots: Array.isArray(source.snapshots) ? source.snapshots.map(snapshot => ({
        ...clone(snapshot),
        data: normalizeData(snapshot?.data)
      })) : [],
      skins: source.skins && typeof source.skins === 'object' ? clone(source.skins) : {},
      rules: Array.isArray(source.rules) ? clone(source.rules) : [],
      frameDirectives: Array.isArray(source.frameDirectives) ? clone(source.frameDirectives) : [],
      studio: source.studio && typeof source.studio === 'object' ? clone(source.studio) : {},
      asmView: source.asmView && typeof source.asmView === 'object' ? clone(source.asmView) : null
    };
    if (!source.viewSettingsApplied && normalized.asmView && window.ASMTraceViewSource?.applyToTrace) {
      window.ASMTraceViewSource.applyToTrace(normalized, normalized.asmView);
    }
    // Saved slide animations intentionally omit default skins. Rehydrate them
    // in the shared model so editor, Studio, and slide runtime select the same
    // original renderer instead of falling back to the raw data kind.
    normalized.skins = normalizeSkins(normalized.variables, normalized.skins);
    normalized.viewSettingsApplied = Boolean(source.viewSettingsApplied
      || (normalized.asmView && window.ASMTraceViewSource?.applyToTrace));
    applyFrameConditions(normalized);
    window.ASMTraceEvents?.rebuildAutoFixedEvents?.(normalized);
    window.ASMTraceEvents?.applyEnabledStates?.(normalized);
    return normalized;
  }

  function scalarValue(data) {
    if (!data || typeof data !== 'object') return data;
    if (Object.prototype.hasOwnProperty.call(data, 'value')) return data.value;
    return data;
  }

  function comparable(data) {
    return JSON.stringify(normalizeData(data));
  }

  function diffFrame(previous, current) {
    const changes = [];
    const ids = new Set([...Object.keys(previous?.state || {}), ...Object.keys(current?.state || {})]);
    ids.forEach(variableId => {
      const before = previous?.state?.[variableId]?.data;
      const after = current?.state?.[variableId]?.data;
      if (!before && after) {
        changes.push({ type: 'variable-add', variableId, after });
        return;
      }
      if (before && !after) {
        changes.push({ type: 'variable-remove', variableId, before });
        return;
      }
      if (comparable(before) === comparable(after)) return;
      const beforeItems = Array.isArray(before?.items) ? before.items : null;
      const afterItems = Array.isArray(after?.items) ? after.items : null;
      if (beforeItems && afterItems) {
        const count = Math.max(beforeItems.length, afterItems.length);
        for (let index = 0; index < count; index += 1) {
          if (index >= beforeItems.length) changes.push({ type: 'insert', variableId, index, after: afterItems[index] });
          else if (index >= afterItems.length) changes.push({ type: 'remove', variableId, index, before: beforeItems[index] });
          else if (comparable(beforeItems[index]) !== comparable(afterItems[index])) {
            changes.push({ type: 'update', variableId, index, before: beforeItems[index], after: afterItems[index] });
          }
        }
        return;
      }
      changes.push({ type: 'update', variableId, before, after });
    });
    return changes;
  }

  window.ASMTraceModel = {
    clone,
    normalizeData,
    defaultRenderer,
    canonicalRenderer,
    normalizeSkins,
    applyFrameConditions,
    normalizeTraceDocument,
    scalarValue,
    diffFrame
  };
})();
