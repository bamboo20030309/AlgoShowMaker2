(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ASMTraceViewSource = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const BLOCK_PATTERN = /\/\*\s*@asm-view\s*\r?\n([\s\S]*?)\r?\n\s*@asm-view\s*\*\//m;

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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
      array: 'original-array', sequence: 'original-array', matrix: 'original-matrix',
      scalar: 'original-cell', string: 'original-cell', stack: 'original-stack',
      queue: 'original-queue'
    };
    return legacy[renderer] || renderer || defaultRenderer(variable);
  }

  function activeVariableIds(trace) {
    const ids = new Set(Object.keys(trace?.variables || {}));
    (trace?.frames || []).forEach(frame => Object.keys(frame?.state || {}).forEach(id => ids.add(id)));
    return ids;
  }

  function compactSkins(trace) {
    const variables = trace?.variables || {};
    const activeIds = activeVariableIds(trace);
    const result = {};
    Object.entries(trace?.skins || {}).forEach(([variableId, source]) => {
      if (activeIds.size && !activeIds.has(variableId)) return;
      const variable = variables[variableId] || {};
      const skin = isObject(source) ? clone(source) : {};
      const renderer = canonicalRenderer(skin.renderer, variable);
      if (renderer === defaultRenderer(variable)) delete skin.renderer;
      else skin.renderer = renderer;
      const options = isObject(skin.options) ? { ...skin.options } : {};
      const defaultShowIndex = !['scalar', 'string'].includes(variable.kind);
      if (options.showIndex === defaultShowIndex) delete options.showIndex;
      if (Number(options.gap) === 0) delete options.gap;
      if (Array.isArray(options.range) && !options.range.length) delete options.range;
      if (Object.keys(options).length) skin.options = options;
      else delete skin.options;
      if (Object.keys(skin).length) result[variableId] = skin;
    });
    return result;
  }

  function canonicalInstructionKey(value = '') {
    const signature = String(value || '');
    const fixed = signature.match(/^fixed:(.+@\d+):(.*)$/s);
    if (fixed) return `fixed:${fixed[1].replace(/@\d+$/, '')}:${fixed[2]}`;
    const traced = signature.match(/^([^:]+):([^:]+):\d+:(.*)$/s);
    return traced ? `${traced[1]}:${traced[2]}:${traced[3]}` : signature;
  }

  function compactInstructionStates(states) {
    const result = {};
    Object.entries(isObject(states) ? states : {}).forEach(([key, value]) => {
      const canonical = canonicalInstructionKey(key);
      if (/^fixed:/.test(canonical)) return;
      if (canonical) result[canonical] = value !== false;
    });
    return result;
  }

  function dedupeById(items) {
    const list = Array.isArray(items) ? items.filter(isObject) : [];
    const lastIndex = new Map();
    list.forEach((item, index) => {
      if (item.id) lastIndex.set(item.id, index);
    });
    return list.filter((item, index) => !item.id || lastIndex.get(item.id) === index);
  }

  function compactBinding(binding) {
    if (!isObject(binding)) return binding;
    const next = clone(binding);
    if (next.targetAnchor === 'center') delete next.targetAnchor;
    if (Number(next.dx) === 0) delete next.dx;
    if (Number(next.dy) === 0) delete next.dy;
    return Object.keys(next).length ? next : null;
  }

  function variableReference(variable) {
    if (!variable?.name) return null;
    return {
      name: variable.name,
      functionName: variable.functionName || 'global'
    };
  }

  function legacyVariableReference(key) {
    const match = String(key || '').match(/^(.+):([^:@]+)@\d+$/);
    return match ? { functionName: match[1], name: match[2] } : null;
  }

  function variableReferenceTable(trace, value) {
    const serialized = JSON.stringify(value || {});
    const result = {};
    Object.entries(trace?.variables || {}).forEach(([variableId, variable]) => {
      if (!legacyVariableReference(variableId)) return;
      if (!serialized.includes(variableId)) return;
      const reference = variableReference(variable) || legacyVariableReference(variableId);
      if (reference) result[variableId] = reference;
    });
    return result;
  }

  function remapVariableToken(value, replacements, candidates) {
    if (typeof value !== 'string') return value;
    if (replacements.has(value)) return replacements.get(value);
    const prefix = candidates.find(variableId => value.startsWith(`${variableId}#`)
      || value.startsWith(`${variableId}:label`)
      || value.startsWith(`${variableId}:index`));
    return prefix ? `${replacements.get(prefix)}${value.slice(prefix.length)}` : value;
  }

  function remapVariableReferences(value, replacements, candidates = null) {
    const ordered = candidates || [...replacements.keys()].sort((left, right) => right.length - left.length);
    if (Array.isArray(value)) return value.map(item => remapVariableReferences(item, replacements, ordered));
    if (!value || typeof value !== 'object') return remapVariableToken(value, replacements, ordered);
    const result = {};
    Object.entries(value).forEach(([key, item]) => {
      result[remapVariableToken(key, replacements, ordered)] = remapVariableReferences(item, replacements, ordered);
    });
    return result;
  }

  function resolvedVariableReplacements(settings, trace) {
    const references = isObject(settings?.variableReferences) ? clone(settings.variableReferences) : {};
    const legacyIds = new Set();
    const visit = value => {
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (!value || typeof value !== 'object') {
        const match = String(value || '').match(/^(.+:[^:@]+@\d+)(?:#.*|:(?:label|index).*)?$/);
        if (match) legacyIds.add(match[1]);
        return;
      }
      Object.entries(value).forEach(([key, item]) => {
        const match = key.match(/^(.+:[^:@]+@\d+)(?:#.*|:(?:label|index).*)?$/);
        if (match) legacyIds.add(match[1]);
        visit(item);
      });
    };
    visit(settings);
    legacyIds.forEach(variableId => {
      references[variableId] ||= legacyVariableReference(variableId);
    });
    const replacements = new Map();
    Object.entries(references).forEach(([oldId, reference]) => {
      const variable = trace?.variables?.[oldId]
        || resolveVariableReference(reference, trace?.variables, trace?.frames);
      if (variable?.id && variable.id !== oldId) replacements.set(oldId, variable.id);
    });
    return replacements;
  }

  function cameraRuleForSource(rule, trace) {
    const next = clone(rule);
    const binding = next?.binding;
    if (binding?.targetKey) {
      const reference = variableReference(trace?.variables?.[binding.targetKey])
        || legacyVariableReference(binding.targetKey);
      if (reference) {
        binding.targetVariable = reference;
        delete binding.targetKey;
      }
    }
    if (next?.target?.variableId) {
      const reference = variableReference(trace?.variables?.[next.target.variableId])
        || legacyVariableReference(next.target.variableId);
      if (reference) {
        next.target.variable = reference;
        delete next.target.variableId;
      }
    }
    return next;
  }

  function resolveVariableReference(reference, variables, frames, frameIds) {
    if (!reference?.name) return null;
    const candidates = Object.values(variables || {}).filter(variable => (
      variable?.name === reference.name
      && (!reference.functionName || variable.functionName === reference.functionName)
    ));
    if (candidates.length <= 1) return candidates[0] || null;
    const scopedFrames = (frames || []).filter(frame => !frameIds?.length || frameIds.includes(frame.id));
    return candidates
      .map((variable, index) => ({
        variable,
        index,
        score: scopedFrames.filter(frame => Object.prototype.hasOwnProperty.call(frame?.state || {}, variable.id)).length
      }))
      .sort((left, right) => right.score - left.score || left.index - right.index)[0]?.variable || null;
  }

  function resolveCameraRule(rule, trace) {
    const next = clone(rule);
    const binding = next?.binding;
    if (binding) {
      const existing = trace?.variables?.[binding.targetKey];
      const reference = binding.targetVariable
        || variableReference(existing)
        || legacyVariableReference(binding.targetKey);
      const variable = resolveVariableReference(reference, trace?.variables, trace?.frames, next.frameIds);
      if (variable?.id) binding.targetKey = variable.id;
      if (variable) delete binding.targetVariable;
    }
    if (next?.target) {
      const existing = trace?.variables?.[next.target.variableId];
      const reference = next.target.variable
        || variableReference(existing)
        || legacyVariableReference(next.target.variableId);
      const variable = resolveVariableReference(reference, trace?.variables, trace?.frames, next.frameIds);
      if (variable?.id) next.target.variableId = variable.id;
      if (variable) delete next.target.variable;
    }
    return next;
  }

  function compactCameraRule(rule) {
    const next = clone(rule);
    if (next.condition == null || next.condition === '') delete next.condition;
    if (Number(next.offsetX) === 0) delete next.offsetX;
    if (Number(next.offsetY) === 0) delete next.offsetY;
    if (next.target == null || next.target === '') delete next.target;
    if (next.autoCapture === true) delete next.autoCapture;
    if (next.manualFrame === false) delete next.manualFrame;
    if (next.allFrames === false) delete next.allFrames;
    if (next.binding) {
      next.binding = compactBinding(next.binding);
      if (!next.binding) delete next.binding;
    }
    ['directiveNames', 'frameSelectors', 'sourceSelectors', 'sourceFrameSelectors', 'frameIds'].forEach(key => {
      if (!Array.isArray(next[key])) return;
      next[key] = [...new Map(next[key].map(item => [JSON.stringify(item), item])).values()];
      if (!next[key].length) delete next[key];
    });
    return next;
  }

  function compactTransition(rule) {
    const next = clone(rule);
    if (next.mode === 'auto') delete next.mode;
    delete next.duration;
    delete next.easing;
    return next;
  }

  function removeEmptyStudioCollections(studio) {
    ['objects', 'arrows', 'cameraRules', 'transitions'].forEach(key => {
      if (Array.isArray(studio[key]) && !studio[key].length) delete studio[key];
    });
    ['eventInstructionStates', 'frameMaps', 'positions', 'bindings', 'visibility',
      'objectStyles', 'eventStates'].forEach(key => {
      if (isObject(studio[key]) && !Object.keys(studio[key]).length) delete studio[key];
    });
    return studio;
  }

  function findBlock(source) {
    const text = String(source || '');
    const match = BLOCK_PATTERN.exec(text);
    if (!match) return null;
    return {
      start: match.index,
      end: match.index + match[0].length,
      text: match[0],
      json: match[1]
    };
  }

  function parse(source) {
    const block = findBlock(source);
    if (!block) return null;
    try {
      const value = JSON.parse(block.json);
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('設定內容必須是 JSON 物件');
      }
      return value;
    } catch (error) {
      throw new Error(`@asm-view 格式錯誤：${error.message}`);
    }
  }

  function format(settings) {
    return `/* @asm-view\n${JSON.stringify(settings || {}, null, 2)}\n@asm-view */`;
  }

  function upsert(source, settings) {
    const text = String(source || '');
    const block = findBlock(text);
    const nextBlock = format(settings);
    if (block) return `${text.slice(0, block.start)}${nextBlock}${text.slice(block.end)}`;
    const body = text.replace(/\s+$/, '');
    return `${body}${body ? '\n\n' : ''}${nextBlock}\n`;
  }

  function directiveName(frame) {
    return String(frame?.source?.directiveName || '').trim();
  }

  function frameFunctionName(frame) {
    const direct = String(frame?.source?.functionName || frame?.source?.function || '').trim();
    if (direct) return direct;
    const manual = /^manual-frame:(.*):\d+:\d+$/.exec(String(frame?.source?.statementId || ''));
    return manual?.[1] || 'global';
  }

  function sourceSelector(frame) {
    const directiveKey = String(frame?.source?.directiveKey || '').trim();
    if (directiveKey) {
      const selector = {
        kind: 'manual-frame',
        functionName: frameFunctionName(frame),
        directiveKey
      };
      const logicalDirectiveKey = String(frame?.source?.logicalDirectiveKey || '').trim();
      if (logicalDirectiveKey) selector.logicalDirectiveKey = logicalDirectiveKey;
      return selector;
    }
    const statementId = String(frame?.source?.statementId || '');
    const manual = /^manual-frame:(.*):(\d+):(\d+)$/.exec(statementId);
    if (manual) {
      return {
        kind: 'manual-frame',
        functionName: manual[1],
        directiveIndex: Number(manual[3])
      };
    }
    return statementId ? { statementId } : null;
  }

  function sourceMatches(frame, selector) {
    if (!selector || typeof selector !== 'object') return false;
    if (selector.statementId) {
      return String(frame?.source?.statementId || '') === String(selector.statementId);
    }
    if (selector.directiveKey) {
      const keys = [frame?.source?.directiveKey, ...(frame?.source?.directiveKeyAliases || [])]
        .map(value => String(value || ''));
      const exact = keys.includes(String(selector.directiveKey));
      const logical = selector.logicalDirectiveKey
        && String(frame?.source?.logicalDirectiveKey || '') === String(selector.logicalDirectiveKey);
      return (exact || logical)
        && (!selector.functionName
          || frameFunctionName(frame) === String(selector.functionName));
    }
    if (selector.kind === 'manual-frame' && Number.isFinite(Number(selector.directiveIndex))) {
      const manual = /^manual-frame:(.*):(\d+):(\d+)$/.exec(String(frame?.source?.statementId || ''));
      return Boolean(manual)
        && (!selector.functionName || manual[1] === String(selector.functionName))
        && Number(manual[3]) === Number(selector.directiveIndex);
    }
    const candidate = sourceSelector(frame);
    return candidate?.kind === selector.kind
      && candidate?.functionName === selector.functionName
      && Number(candidate?.directiveIndex) === Number(selector.directiveIndex);
  }

  function selectorKey(selector) {
    return JSON.stringify(selector || null);
  }

  function frameIdsForDescriptor(descriptor, frames) {
    const list = Array.isArray(frames) ? frames : [];
    const ids = new Set(Array.isArray(descriptor?.frameIds) ? descriptor.frameIds : []);
    if (descriptor?.allFrames === true) list.forEach(frame => ids.add(frame.id));
    const names = new Set(Array.isArray(descriptor?.directiveNames) ? descriptor.directiveNames : []);
    if (names.size) list.forEach(frame => {
      if (names.has(directiveName(frame))) ids.add(frame.id);
    });
    (Array.isArray(descriptor?.frameSelectors) ? descriptor.frameSelectors : []).forEach(selector => {
      const matches = list.filter(frame => directiveName(frame) === selector?.directiveName);
      const frame = matches[Number(selector?.occurrence) || 0];
      if (frame) ids.add(frame.id);
    });
    (Array.isArray(descriptor?.sourceSelectors) ? descriptor.sourceSelectors : []).forEach(selector => {
      list.filter(frame => sourceMatches(frame, selector)).forEach(frame => ids.add(frame.id));
    });
    (Array.isArray(descriptor?.sourceFrameSelectors) ? descriptor.sourceFrameSelectors : []).forEach(record => {
      const matches = list.filter(frame => sourceMatches(frame, record?.selector));
      const frame = matches[Number(record?.occurrence) || 0];
      if (frame) ids.add(frame.id);
    });
    return [...ids].filter(id => list.some(frame => frame.id === id));
  }

  function describeFrameIds(frameIds, frames) {
    const list = Array.isArray(frames) ? frames : [];
    const validIds = new Set(list.map(frame => frame.id));
    const selected = new Set((Array.isArray(frameIds) ? frameIds : [])
      .filter(id => id && validIds.has(id)));
    const selectedFrames = list.filter(frame => selected.has(frame.id));
    if (list.length && selected.size === list.length && list.every(frame => selected.has(frame.id))) {
      return { allFrames: true };
    }
    const names = [...new Set(selectedFrames.map(directiveName).filter(Boolean))];
    const completeNamedScope = selectedFrames.length === selected.size
      && selectedFrames.length > 0
      && selectedFrames.every(frame => Boolean(directiveName(frame)))
      && names.every(name => list
        .filter(frame => directiveName(frame) === name)
        .every(frame => selected.has(frame.id)));
    if (completeNamedScope) return { directiveNames: names };

    const unnamedSelectors = [...new Map(selectedFrames
      .filter(frame => !directiveName(frame))
      .map(frame => sourceSelector(frame))
      .filter(Boolean)
      .map(selector => [selectorKey(selector), selector])).values()];
    const completeSourceScope = selectedFrames.length === selected.size
      && selectedFrames.length > 0
      && selectedFrames.every(frame => !directiveName(frame) && sourceSelector(frame))
      && unnamedSelectors.every(selector => list
        .filter(frame => sourceMatches(frame, selector))
        .every(frame => selected.has(frame.id)));
    if (completeSourceScope) {
      return { sourceSelectors: unnamedSelectors };
    }

    const frameSelectors = [];
    const sourceFrameSelectors = [];
    const fallbackIds = [];
    selectedFrames.forEach(frame => {
      const name = directiveName(frame);
      if (!name) {
        const selector = sourceSelector(frame);
        if (!selector) {
          fallbackIds.push(frame.id);
          return;
        }
        const occurrence = list.filter(candidate => sourceMatches(candidate, selector)).indexOf(frame);
        sourceFrameSelectors.push({ selector, occurrence: Math.max(0, occurrence) });
        return;
      }
      const occurrence = list.filter(candidate => directiveName(candidate) === name).indexOf(frame);
      frameSelectors.push({ directiveName: name, occurrence: Math.max(0, occurrence) });
    });
    return {
      ...(frameSelectors.length ? { frameSelectors } : {}),
      ...(sourceFrameSelectors.length ? { sourceFrameSelectors } : {}),
      ...(fallbackIds.length ? { frameIds: [...new Set(fallbackIds)] } : {})
    };
  }

  function encodeScopes(value, frames) {
    if (Array.isArray(value)) return value.map(item => encodeScopes(item, frames));
    if (!value || typeof value !== 'object') return value;
    const next = {};
    Object.entries(value).forEach(([key, item]) => {
      if (key === 'frameIds' && Array.isArray(item)) return;
      next[key] = encodeScopes(item, frames);
    });
    if (Array.isArray(value.frameIds)) Object.assign(next, describeFrameIds(value.frameIds, frames));
    return next;
  }

  function decodeScopes(value, frames) {
    if (Array.isArray(value)) return value.map(item => decodeScopes(item, frames));
    if (!value || typeof value !== 'object') return value;
    const next = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decodeScopes(item, frames)]));
    if (value.allFrames || value.directiveNames || value.frameSelectors
      || value.sourceSelectors || value.sourceFrameSelectors) {
      next.frameIds = frameIdsForDescriptor(value, frames);
    }
    return next;
  }

  function encodeFrameMap(map, frames) {
    const groups = new Map();
    const validIds = new Set((Array.isArray(frames) ? frames : []).map(frame => frame.id));
    Object.entries(map || {}).forEach(([frameId, value]) => {
      if (!validIds.has(frameId) || (isObject(value) && !Object.keys(value).length)) return;
      const signature = JSON.stringify(value);
      if (!groups.has(signature)) groups.set(signature, { frameIds: [], value: clone(value) });
      groups.get(signature).frameIds.push(frameId);
    });
    return [...groups.values()].map(group => ({
      ...describeFrameIds(group.frameIds, frames),
      value: encodeScopes(group.value, frames)
    }));
  }

  function decodeFrameMap(records, frames) {
    const result = {};
    (Array.isArray(records) ? records : []).forEach(record => {
      frameIdsForDescriptor(record, frames).forEach(frameId => {
        result[frameId] = decodeScopes(clone(record.value || {}), frames);
      });
    });
    return result;
  }

  function sanitizeTransitions(transitions) {
    return (Array.isArray(transitions) ? transitions : []).map(rule => {
      const next = { ...rule, mode: rule?.mode === 'instant' ? 'instant' : 'auto' };
      delete next.duration;
      delete next.easing;
      return next;
    });
  }

  function dedupeCameraRulesByScope(rules) {
    const list = Array.isArray(rules) ? rules : [];
    const lastIndex = new Map();
    list.forEach((rule, index) => {
      if (rule?.condition != null && rule.condition !== '') return;
      const frameIds = [...new Set(Array.isArray(rule?.frameIds) ? rule.frameIds : [])].sort();
      if (!frameIds.length && rule?.allFrames !== true) return;
      const scope = rule?.allFrames === true ? 'all' : frameIds.join('\u0000');
      lastIndex.set(scope, index);
    });
    return list.filter((rule, index) => {
      if (rule?.condition != null && rule.condition !== '') return true;
      const frameIds = [...new Set(Array.isArray(rule?.frameIds) ? rule.frameIds : [])].sort();
      if (!frameIds.length && rule?.allFrames !== true) return true;
      const scope = rule?.allFrames === true ? 'all' : frameIds.join('\u0000');
      return lastIndex.get(scope) === index;
    });
  }

  function fromTrace(trace) {
    const frames = trace?.frames || [];
    const studio = clone(trace?.studio || {});
    ['eventColors', 'eventSignatureColors', 'eventAnimations', 'transitionDefaults', 'eventSettings'].forEach(key => {
      delete studio[key];
    });
    studio.transitions = sanitizeTransitions(studio.transitions);
    studio.eventInstructionStates = compactInstructionStates(studio.eventInstructionStates);
    studio.objects = dedupeById(studio.objects);
    studio.arrows = dedupeById(studio.arrows);
    studio.cameraRules = dedupeById(studio.cameraRules)
      .map(rule => compactCameraRule(cameraRuleForSource(rule, trace)));
    studio.transitions = dedupeById(studio.transitions).map(compactTransition);
    const frameMaps = {};
    ['positions', 'bindings', 'visibility', 'objectStyles', 'eventStates'].forEach(key => {
      if (studio[key] && Object.keys(studio[key]).length) frameMaps[key] = encodeFrameMap(studio[key], frames);
      delete studio[key];
    });
    if (Object.keys(frameMaps).length) studio.frameMaps = frameMaps;
    removeEmptyStudioCollections(studio);
    const settings = {
      version: 1,
      rules: encodeScopes(clone(trace?.rules || []), frames),
      skins: compactSkins(trace),
      studio: encodeScopes(studio, frames)
    };
    const variableReferences = variableReferenceTable(trace, settings);
    if (Object.keys(variableReferences).length) settings.variableReferences = variableReferences;
    return settings;
  }

  function compactTraceForSave(trace) {
    if (!trace || typeof trace !== 'object') return trace;
    const next = clone(trace);
    const validFrameIds = new Set((next.frames || []).map(frame => frame.id));
    next.skins = compactSkins(trace);
    next.studio = isObject(next.studio) ? next.studio : {};
    next.studio.eventInstructionStates = compactInstructionStates(next.studio.eventInstructionStates);
    ['positions', 'bindings', 'visibility', 'objectStyles', 'eventStates'].forEach(key => {
      if (!isObject(next.studio[key])) return;
      next.studio[key] = Object.fromEntries(Object.entries(next.studio[key])
        .filter(([frameId, value]) => validFrameIds.has(frameId)
          && (!isObject(value) || Object.keys(value).length)));
    });
    next.studio.objects = dedupeById(next.studio.objects);
    next.studio.arrows = dedupeById(next.studio.arrows);
    next.studio.cameraRules = dedupeById(next.studio.cameraRules).map(compactCameraRule);
    next.studio.transitions = dedupeById(next.studio.transitions).map(compactTransition);
    removeEmptyStudioCollections(next.studio);
    delete next.asmView;
    next.viewSettingsApplied = true;
    return next;
  }

  function applyToTrace(trace, settings) {
    if (!trace || !settings || typeof settings !== 'object') return trace;
    const replacements = resolvedVariableReplacements(settings, trace);
    settings = remapVariableReferences(clone(settings), replacements);
    delete settings.variableReferences;
    const frames = trace.frames || [];
    if (Array.isArray(settings.rules)) trace.rules = decodeScopes(clone(settings.rules), frames);
    if (settings.skins && typeof settings.skins === 'object') {
      trace.skins = { ...(trace.skins || {}), ...clone(settings.skins) };
    }
    if (settings.studio && typeof settings.studio === 'object') {
      const studio = decodeScopes(clone(settings.studio), frames);
      ['eventColors', 'eventSignatureColors', 'eventAnimations', 'transitionDefaults', 'eventSettings'].forEach(key => {
        delete studio[key];
      });
      studio.transitions = sanitizeTransitions(studio.transitions);
      const frameMaps = studio.frameMaps || {};
      delete studio.frameMaps;
      ['positions', 'bindings', 'visibility', 'objectStyles', 'eventStates'].forEach(key => {
        if (frameMaps[key]) studio[key] = decodeFrameMap(frameMaps[key], frames);
      });
      studio.cameraRules = (Array.isArray(studio.cameraRules) ? studio.cameraRules : [])
        .map(rule => resolveCameraRule(rule, trace));
      studio.cameraRules = dedupeCameraRulesByScope(studio.cameraRules);
      trace.studio = studio;
    }
    return trace;
  }

  return {
    findBlock,
    parse,
    format,
    upsert,
    directiveName,
    sourceSelector,
    sourceMatches,
    describeFrameIds,
    frameIdsForDescriptor,
    fromTrace,
    compactTraceForSave,
    applyToTrace
  };
});
