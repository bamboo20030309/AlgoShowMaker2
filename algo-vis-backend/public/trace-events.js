(function () {
  const definitions = [
    { type: 'declare', label: '宣告', color: '#25824d', enabledByDefault: false, timelineByDefault: false },
    { type: 'read', label: '讀取', color: '#3976b8', enabledByDefault: false, timelineByDefault: false },
    { type: 'write', label: '賦值', color: '#c8483f', enabledByDefault: true, timelineByDefault: true },
    { type: 'assign', label: '賦值', color: '#c8483f', enabledByDefault: true, timelineByDefault: true },
    { type: 'compare', label: '比較', color: '#c38a16', enabledByDefault: true, timelineByDefault: true },
    { type: 'condition', label: '條件', color: '#7b61a8', enabledByDefault: false, timelineByDefault: false },
    { type: 'swap', label: '交換', color: '#1d8f83', enabledByDefault: true, timelineByDefault: true },
    { type: 'fixed', label: '自動固定', color: '#4caf50', category: 'state', enabledByDefault: true, timelineByDefault: false },
    { type: 'call', label: '呼叫', color: '#65737a', enabledByDefault: false, timelineByDefault: false },
    { type: 'function-enter', label: '進入函式', color: '#59656b', enabledByDefault: false, timelineByDefault: false },
    { type: 'function-exit', label: '離開函式', color: '#59656b', enabledByDefault: false, timelineByDefault: false }
  ];
  const byType = Object.fromEntries(definitions.map(definition => [definition.type, definition]));
  const animations = Object.freeze({
    declare: 'none',
    read: 'none',
    write: 'assign',
    assign: 'assign',
    compare: 'compare',
    condition: 'pulse',
    swap: 'swap',
    fixed: 'none',
    call: 'none',
    'function-enter': 'none',
    'function-exit': 'none'
  });
  // Availability is frame-specific, while saved instruction switches may apply
  // to many frames. Keep explicit user intent out of the serialized event data
  // so an unavailable occurrence does not permanently disable its instruction.
  const explicitEnabledStates = new WeakSet();

  function baseEventKey(event = {}) {
    if (event.signature) return String(event.signature);
    const targets = (event.targets || []).map(target => (
      `${target.role || ''}:${target.variableId || ''}:${target.expression || ''}:${target.indexExpression || ''}`
    )).join('|');
    return [event.type || 'event', event.line || '', event.operation || '', targets].join(':');
  }

  function eventKey(events, index) {
    const list = Array.isArray(events) ? events : [];
    const event = list[index] || {};
    const base = baseEventKey(event);
    let occurrence = 0;
    for (let cursor = 0; cursor < index; cursor += 1) {
      if (baseEventKey(list[cursor]) === base) occurrence += 1;
    }
    return `${base}::${occurrence}`;
  }

  function canonicalInstructionKey(value = '') {
    const signature = String(value || '');
    // Fixed-cell events use the declaration offset inside their variable ID.
    // That offset changes when unrelated source text is inserted, so remove it.
    const fixed = signature.match(/^fixed:(.+@\d+):(.*)$/s);
    if (fixed) return `fixed:${fixed[1].replace(/@\d+$/, '')}:${fixed[2]}`;
    // Runtime signatures historically contained the source line. A slide RUN,
    // formatting pass, or added comment can move the instruction without
    // changing its meaning. Keep old saved keys readable while using a stable
    // key for all new choices.
    const traced = signature.match(/^([^:]+):([^:]+):\d+:(.*)$/s);
    if (traced) return `${traced[1]}:${traced[2]}:${traced[3]}`;
    return signature;
  }

  function instructionKey(event = {}) {
    return canonicalInstructionKey(baseEventKey(event));
  }

  function instructionState(instructionStates, event) {
    const sourceKey = instructionKey(event);
    if (Object.prototype.hasOwnProperty.call(instructionStates, sourceKey)) {
      return { found: true, value: instructionStates[sourceKey] !== false };
    }
    let found = false;
    let value = false;
    // Prefer the last matching legacy key. JSON property order follows the
    // user's edit history, so newer line-number variants win over older ones.
    Object.entries(instructionStates).forEach(([savedKey, savedValue]) => {
      if (canonicalInstructionKey(savedKey) !== sourceKey) return;
      found = true;
      value = savedValue !== false;
    });
    return { found, value };
  }

  function orderedEntries(events) {
    return (Array.isArray(events) ? events : []).map((event, index) => {
      const explicitOrder = Number(event?.order);
      const idOrder = String(event?.id || '').match(/^event-(\d+)$/);
      return {
        event,
        index,
        order: Number.isFinite(explicitOrder)
          ? explicitOrder
          : (idOrder ? Number(idOrder[1]) : Number.MAX_SAFE_INTEGER)
      };
    }).sort((left, right) => left.order - right.order || left.index - right.index);
  }

  function eventSettings(document) {
    return document?.studio?.eventSettings || {};
  }

  function defaultEnabled(event = {}, document = null) {
    if (event.animate === false) return false;
    if (event.type === 'compare' && (event.targets || []).some(target => !target?.variableId)) return false;
    if (event.type === 'fixed') {
      const settings = eventSettings(document);
      if (typeof settings.autoFixedEnabled === 'boolean') return settings.autoFixedEnabled;
      if (typeof settings.defaultEnabled?.fixed === 'boolean') return settings.defaultEnabled.fixed;
      return true;
    }
    const configured = eventSettings(document).defaultEnabled?.[event.type];
    if (typeof configured === 'boolean') return configured;
    return byType[event.type]?.enabledByDefault !== false;
  }

  const FIXED_KINDS = new Set(['sequence', 'stack', 'queue', 'set']);
  const FIXED_ACCESS_TYPES = new Set(['read', 'write', 'assign', 'swap']);

  function targetIndex(document, frame, target = {}) {
    if (target.resolvedIndex != null
      && target.resolvedIndex !== ''
      && Number.isInteger(Number(target.resolvedIndex))) return Number(target.resolvedIndex);
    const source = String(target.indexExpression ?? '').trim();
    if (!source) return null;
    const resolved = window.ASMTraceRules?.resolveExpression?.(
      document, frame, source
    );
    if (resolved != null && resolved !== '' && Number.isInteger(Number(resolved))) return Number(resolved);
    const numeric = Number(source);
    return Number.isInteger(numeric) ? numeric : null;
  }

  // Rebuild generated fixed state after normalization. This both upgrades old
  // saved traces and guarantees that the editor, Studio and slide runtime use
  // the same runtime-identity-aware result.
  function rebuildAutoFixedEvents(document) {
    const frames = Array.isArray(document?.frames) ? document.frames : [];
    const variables = document?.variables || {};
    const accesses = new Map();
    Object.values(document?.studio?.eventStates || {}).forEach(states => {
      Object.keys(states || {}).forEach(key => {
        if (/^fixed:(?!auto:)/.test(key)) delete states[key];
      });
    });
    frames.forEach(frame => {
      frame.events = (frame.events || []).filter(event => event.type !== 'fixed');
    });
    frames.forEach((frame, frameIndex) => {
      (frame.events || []).filter(event => FIXED_ACCESS_TYPES.has(event.type)).forEach(event => {
        (event.targets || []).forEach(target => {
          const variableId = target?.variableId;
          const entry = frame.state?.[variableId];
          const data = entry?.data;
          const kind = variables?.[variableId]?.kind || data?.kind;
          if (!variableId || !FIXED_KINDS.has(kind) || !Array.isArray(data?.items)) return;
          const index = targetIndex(document, frame, target);
          if (index == null || index < 0 || index >= data.items.length) return;
          const runtimeIdentity = String(entry?.identity || '');
          const objectIdentity = runtimeIdentity || `variable:${variableId}`;
          const key = `${objectIdentity}#${index}`;
          const previous = accesses.get(key) || {};
          accesses.set(key, {
            ...previous,
            variableId,
            variableName: entry?.name || variables?.[variableId]?.name || variableId,
            runtimeIdentity,
            objectIdentity,
            index,
            lastAccessFrameIndex: frameIndex,
            lastEventId: event.id || previous.lastEventId || '',
            lastEventOrder: Number.isFinite(Number(event.order))
              ? Number(event.order)
              : (previous.lastEventOrder || 0)
          });
        });
      });
    });
    const groups = new Map();
    accesses.forEach(access => {
      const key = `${access.lastAccessFrameIndex}#${access.objectIdentity}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(access);
    });
    groups.forEach(group => {
      group.sort((left, right) => left.index - right.index);
      const frame = frames[group[0].lastAccessFrameIndex];
      const lastAccess = group.reduce((latest, access) => (
        access.lastEventOrder >= latest.lastEventOrder ? access : latest
      ), group[0]);
      const stableVariableId = String(lastAccess.variableId || '').replace(/@\d+$/, '');
      const signature = `fixed:auto:${stableVariableId}:${group.map(access => access.index).join(',')}`;
      frame.events.push({
        id: signature,
        type: 'fixed',
        signature,
        autoFixed: true,
        stateChange: true,
        persistent: true,
        runtimeIdentity: group[0].runtimeIdentity,
        line: Number(frame.source?.line) || 0,
        order: lastAccess.lastEventOrder + 0.001,
        phase: 'after',
        afterEventId: lastAccess.lastEventId,
        targets: group.map(access => ({
          role: 'target',
          variableId: access.variableId,
          runtimeIdentity: access.runtimeIdentity,
          expression: `${access.variableName}[${access.index}]`,
          indexExpression: String(access.index),
          resolvedIndex: access.index
        }))
      });
    });
    frames.forEach(frame => frame.events.sort((left, right) => (
      (Number(left?.order) || 0) - (Number(right?.order) || 0)
      || String(left?.signature || left?.id || '').localeCompare(String(right?.signature || right?.id || ''))
    )));
    return document;
  }

  function applyEnabledStates(document) {
    const eventStates = document?.studio?.eventStates || {};
    const instructionStates = document?.studio?.eventInstructionStates || {};
    (document?.frames || []).forEach(frame => {
      const frameStates = eventStates[frame.id] || {};
      (frame.events || []).forEach((event, index) => {
        const key = eventKey(frame.events, index);
        if (event.type === 'fixed') {
          const hasFrameState = Object.prototype.hasOwnProperty.call(frameStates, key);
          if (hasFrameState) explicitEnabledStates.add(event);
          else explicitEnabledStates.delete(event);
          event.enabled = hasFrameState
            ? frameStates[key] !== false
            : defaultEnabled(event, document);
          return;
        }
        const savedInstructionState = instructionState(instructionStates, event);
        const hasInstructionState = savedInstructionState.found;
        const hasFrameState = Object.prototype.hasOwnProperty.call(frameStates, key);
        if (hasInstructionState || hasFrameState) explicitEnabledStates.add(event);
        else explicitEnabledStates.delete(event);
        event.enabled = hasInstructionState
          ? savedInstructionState.value
          : hasFrameState
            ? frameStates[key] !== false
            : defaultEnabled(event, document);
      });
    });
    return document;
  }

  function controlState(event = {}) {
    const available = event.autoAnimationDisabled !== true;
    return {
      // Yellow/red events start visually off. An explicit saved choice remains
      // visible and editable even while this particular occurrence cannot run.
      checked: event.enabled !== false && (available || explicitEnabledStates.has(event)),
      available
    };
  }

  function availabilityKind(event = {}) {
    if (event.autoAnimationDisabled !== true) return 'available';
    return event.autoAnimationUnavailableReason === 'unrenderable'
      ? 'unrenderable'
      : 'missing-target';
  }

  window.ASMTraceEvents = {
    definitions,
    labels: Object.fromEntries(definitions.map(definition => [definition.type, definition.label])),
    colors: Object.fromEntries(definitions.map(definition => [definition.type, definition.color])),
    animations,
    definition(type) {
      return byType[type] || { type, label: type, color: '#65737a', showTag: true };
    },
    color(type) {
      return byType[type]?.color || '#65737a';
    },
    animation(type) {
      return animations[type] || 'none';
    },
    eventKey,
    instructionKey,
    canonicalInstructionKey,
    orderedEntries,
    ordered(events) {
      return orderedEntries(events).map(entry => entry.event);
    },
    defaultEnabled,
    rebuildAutoFixedEvents,
    applyEnabledStates,
    controlState,
    availabilityKind,
    showTag(type, document = null) {
      if (type === 'fixed') return false;
      const configured = eventSettings(document).timelineTypes?.[type];
      if (typeof configured === 'boolean') return configured;
      return byType[type]?.timelineByDefault === true;
    },
    showInspector(event = {}) {
      return event.type !== 'fixed';
    }
  };
})();
