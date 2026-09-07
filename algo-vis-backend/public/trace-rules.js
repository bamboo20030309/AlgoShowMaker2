(function () {
  // Event colors belong to the frame/event menus. Objects only receive styles
  // from explicit user rules created in Trace Studio.
  const DEFAULT_RULES = [];

  function eventMatches(event, match = {}) {
    if (match.eventType && event.type !== match.eventType) return false;
    if (match.signature && event.signature !== match.signature) return false;
    if (match.line != null && Number(event.line) !== Number(match.line)) return false;
    if (match.function && event.function !== match.function) return false;
    if (match.result != null && event.result !== match.result) return false;
    if (match.variableId && !(event.targets || []).some(target => target.variableId === match.variableId)) return false;
    return true;
  }

  function stateValue(frame, variableId) {
    const data = frame?.state?.[variableId]?.data;
    return window.ASMTraceModel.scalarValue(data);
  }

  function variableEntry(document, frame, reference) {
    const wanted = String(reference || '').trim();
    if (!wanted) return null;
    if (frame?.state?.[wanted]) return { id: wanted, entry: frame.state[wanted] };
    const match = Object.entries(frame?.state || {}).find(([id, entry]) => (
      entry?.name === wanted || document?.variables?.[id]?.name === wanted
    ));
    return match ? { id: match[0], entry: match[1] } : null;
  }

  function itemAt(data, index) {
    if (!Number.isInteger(index)) return undefined;
    if (Array.isArray(data?.items)) return data.items[index];
    if (Array.isArray(data)) return data[index];
    return undefined;
  }

  const TEMPORAL_FUNCTIONS = new Set(['before', 'prev', 'changed', 'assigned']);
  const MUTATION_EVENTS = new Set(['write', 'assign', 'swap']);

  function previousFrame(document, frame) {
    const index = document?.frames?.findIndex(candidate => candidate === frame || candidate.id === frame?.id) ?? -1;
    return index > 0 ? document.frames[index - 1] : null;
  }

  function scalarData(value) {
    return window.ASMTraceModel.scalarValue(value);
  }

  function targetReference(document, frame, expression, locals = {}) {
    const source = String(expression || '').replace(/\s+/g, '');
    const base = source.match(/^([A-Za-z_]\w*)/)?.[1] || '';
    if (!base) return null;
    const found = variableEntry(document, frame, base);
    if (!found) return null;
    let cursor = base.length;
    const indices = [];
    while (cursor < source.length) {
      if (source[cursor] !== '[') return null;
      let depth = 1;
      let end = cursor + 1;
      while (end < source.length && depth) {
        if (source[end] === '[') depth += 1;
        else if (source[end] === ']') depth -= 1;
        end += 1;
      }
      if (depth) return null;
      const indexExpression = source.slice(cursor + 1, end - 1);
      const index = Number(resolveExpression(document, frame, indexExpression, locals));
      if (!Number.isInteger(index)) return null;
      indices.push(index);
      cursor = end;
    }
    return { variableId: found.id, indices };
  }

  function eventTargetIndex(document, frame, target) {
    const captured = Number(target?.resolvedIndex);
    if (Object.prototype.hasOwnProperty.call(target || {}, 'resolvedIndex')
      && Number.isInteger(captured)) return [captured];
    const expression = String(target?.indexExpression || '').trim();
    if (!expression) return [];
    const indices = expression.split(',').map(part => Number(resolveExpression(document, frame, part.trim())));
    return indices.every(Number.isInteger) ? indices : null;
  }

  function matchingMutationEvents(document, frame, reference) {
    if (!reference) return [];
    return (frame?.events || []).filter(event => {
      if (!MUTATION_EVENTS.has(event.type)) return false;
      return (event.targets || []).some(target => {
        if (target.variableId !== reference.variableId) return false;
        if (event.type !== 'swap' && target.role && target.role !== 'target') return false;
        if (!reference.indices.length) return true;
        const indices = eventTargetIndex(document, frame, target);
        return Array.isArray(indices)
          && indices.length === reference.indices.length
          && indices.every((index, position) => index === reference.indices[position]);
      });
    }).sort((left, right) => Number(left.order) - Number(right.order));
  }

  function temporalValue(document, frame, name, expression, locals = {}) {
    const currentValue = () => resolveExpression(document, frame, expression, locals);
    const priorFrame = previousFrame(document, frame);
    if (name === 'prev') {
      return priorFrame ? resolveExpression(document, priorFrame, expression, locals) : null;
    }

    const reference = targetReference(document, frame, expression, locals);
    const mutations = matchingMutationEvents(document, frame, reference);
    if (name === 'assigned') return mutations.length > 0;
    if (name === 'changed') {
      if (!mutations.length) return false;
      return mutations.some(event => {
        const payload = event?.payload || {};
        if (Object.prototype.hasOwnProperty.call(payload, 'before')
          && Object.prototype.hasOwnProperty.call(payload, 'after')) {
          return JSON.stringify(scalarData(payload.before)) !== JSON.stringify(scalarData(payload.after));
        }
        if (!priorFrame) return true;
        const before = resolveExpression(document, priorFrame, expression, locals);
        return JSON.stringify(before) !== JSON.stringify(currentValue());
      });
    }
    if (name === 'before') {
      const latest = mutations.at(-1);
      if (latest && Object.prototype.hasOwnProperty.call(latest?.payload || {}, 'before')) {
        return scalarData(latest.payload.before);
      }
      if (latest && priorFrame) return resolveExpression(document, priorFrame, expression, locals);
      return currentValue();
    }
    return null;
  }

  function resolveExpression(document, frame, expression, locals = {}) {
    const source = String(expression ?? '').trim();
    if (!source) return null;
    const tokens = [];
    let cursor = 0;
    while (cursor < source.length) {
      if (/\s/.test(source[cursor])) {
        cursor += 1;
        continue;
      }
      const number = source.slice(cursor).match(/^\d+(?:\.\d+)?/);
      if (number) {
        tokens.push({ type: 'number', value: number[0] });
        cursor += number[0].length;
        continue;
      }
      const identifier = source.slice(cursor).match(/^[A-Za-z_]\w*/);
      if (identifier) {
        const logicalOperator = { and: '&&', or: '||' }[identifier[0]] || '';
        tokens.push(logicalOperator
          ? { type: 'operator', value: logicalOperator }
          : { type: 'identifier', value: identifier[0] });
        cursor += identifier[0].length;
        continue;
      }
      const compoundOperator = source.slice(cursor).match(/^(?:&&|\|\||==|!=|<=|>=)/);
      if (compoundOperator) {
        tokens.push({ type: 'operator', value: compoundOperator[0] });
        cursor += compoundOperator[0].length;
        continue;
      }
      if ('+-*/%()[].<>!'.includes(source[cursor])) {
        tokens.push({ type: 'operator', value: source[cursor] });
        cursor += 1;
        continue;
      }
      return null;
    }

    let position = 0;
    const invalid = Symbol('invalid-expression');
    const peek = value => tokens[position]?.value === value;
    const consume = value => {
      if (value && !peek(value)) return null;
      return tokens[position++] || null;
    };

    function parsePrimary() {
      if (peek('(')) {
        consume('(');
        const value = parseLogicalOr();
        if (value === invalid || !consume(')')) return invalid;
        return value;
      }
      const token = tokens[position];
      if (!token) return invalid;
      if (token.type === 'number') {
        position += 1;
        return Number(token.value);
      }
      if (token.type !== 'identifier') return invalid;
      position += 1;
      if (token.value === 'true') return true;
      if (token.value === 'false') return false;
      if (TEMPORAL_FUNCTIONS.has(token.value) && peek('(')) {
        consume('(');
        const argumentStart = position;
        let depth = 1;
        while (position < tokens.length && depth > 0) {
          if (tokens[position].value === '(') depth += 1;
          else if (tokens[position].value === ')') depth -= 1;
          if (depth > 0) position += 1;
        }
        if (depth !== 0 || position <= argumentStart) return invalid;
        const argument = tokens.slice(argumentStart, position).map(item => item.value).join('');
        position += 1;
        return temporalValue(document, frame, token.value, argument, locals);
      }
      if (Object.prototype.hasOwnProperty.call(locals, token.value)) return locals[token.value];
      const found = variableEntry(document, frame, token.value);
      if (!found) return invalid;
      let data = found.entry?.data;
      while (peek('[')) {
        consume('[');
        const index = parseAdditive();
        if (index === invalid || !consume(']') || !Number.isInteger(Number(index))) return invalid;
        data = itemAt(data, Number(index));
        if (data == null) return invalid;
      }
      if (peek('.')) {
        consume('.');
        if (tokens[position]?.type !== 'identifier'
          || !['length', 'size'].includes(tokens[position]?.value)) return invalid;
        position += 1;
        if (peek('(')) {
          consume('(');
          if (!consume(')')) return invalid;
        }
        if (Array.isArray(data?.items)) return data.items.length;
        if (Array.isArray(data)) return data.length;
        return invalid;
      }
      return window.ASMTraceModel.scalarValue(data);
    }

    function parseUnary() {
      if (peek('+')) {
        consume('+');
        return Number(parseUnary());
      }
      if (peek('-')) {
        consume('-');
        return -Number(parseUnary());
      }
      if (peek('!')) {
        consume('!');
        const value = parseUnary();
        return value === invalid ? invalid : !Boolean(value);
      }
      return parsePrimary();
    }

    function parseMultiplicative() {
      let value = parseUnary();
      while (peek('*') || peek('/') || peek('%')) {
        const operator = consume().value;
        const right = parseUnary();
        if (value === invalid || right === invalid) return invalid;
        if (operator === '*') value = Number(value) * Number(right);
        else if (operator === '/') value = Number(value) / Number(right);
        else value = Number(value) % Number(right);
      }
      return value;
    }

    function parseAdditive() {
      let value = parseMultiplicative();
      while (peek('+') || peek('-')) {
        const operator = consume().value;
        const right = parseMultiplicative();
        if (value === invalid || right === invalid) return invalid;
        value = operator === '+' ? Number(value) + Number(right) : Number(value) - Number(right);
      }
      return value;
    }

    function comparable(left, right) {
      const leftNumber = Number(left);
      const rightNumber = Number(right);
      const numeric = left !== '' && right !== ''
        && Number.isFinite(leftNumber) && Number.isFinite(rightNumber);
      return numeric
        ? { left: leftNumber, right: rightNumber }
        : { left: String(left ?? ''), right: String(right ?? '') };
    }

    function parseRelational() {
      let value = parseAdditive();
      while (peek('<') || peek('<=') || peek('>') || peek('>=')) {
        const operator = consume().value;
        const right = parseAdditive();
        if (value === invalid || right === invalid) return invalid;
        const pair = comparable(value, right);
        if (operator === '<') value = pair.left < pair.right;
        else if (operator === '<=') value = pair.left <= pair.right;
        else if (operator === '>') value = pair.left > pair.right;
        else value = pair.left >= pair.right;
      }
      return value;
    }

    function parseEquality() {
      let value = parseRelational();
      while (peek('==') || peek('!=')) {
        const operator = consume().value;
        const right = parseRelational();
        if (value === invalid || right === invalid) return invalid;
        const pair = comparable(value, right);
        value = operator === '==' ? pair.left === pair.right : pair.left !== pair.right;
      }
      return value;
    }

    function parseLogicalAnd() {
      let value = parseEquality();
      while (peek('&&')) {
        consume('&&');
        const right = parseEquality();
        if (value === invalid || right === invalid) return invalid;
        value = Boolean(value) && Boolean(right);
      }
      return value;
    }

    function parseLogicalOr() {
      let value = parseLogicalAnd();
      while (peek('||')) {
        consume('||');
        const right = parseLogicalAnd();
        if (value === invalid || right === invalid) return invalid;
        value = Boolean(value) || Boolean(right);
      }
      return value;
    }

    const value = parseLogicalOr();
    if (value === invalid || position !== tokens.length) return null;
    return value;
  }

  function expressionMatches(document, frame, condition, locals = {}) {
    if (!condition) return true;
    const expression = typeof condition === 'string' ? condition : condition.expression;
    if (!String(expression || '').trim()) return true;
    const value = resolveExpression(document, frame, expression, locals);
    return value != null && Boolean(value);
  }

  function comparisonSnapshotForCondition(document, frame, condition) {
    const identifiers = new Set(condition?.identifiers || []);
    if (!identifiers.size) return null;
    const comparisons = (frame?.events || []).filter(event => event?.type === 'compare')
      .sort((left, right) => Number(left.order) - Number(right.order));
    const relevant = comparisons.filter(event => {
      const eventIdentifiers = new Set();
      const targetVariableNames = new Set();
      (event.targets || []).forEach(target => {
        const variableName = document.variables?.[target.variableId]?.name;
        if (variableName) targetVariableNames.add(variableName);
        const expression = `${target.expression || ''} ${target.indexExpression || ''}`;
        (expression.match(/[A-Za-z_]\w*/g) || []).forEach(name => eventIdentifiers.add(name));
      });
      return targetVariableNames.size >= 2
        && [...targetVariableNames].every(name => identifiers.has(name))
        && [...identifiers].every(name => eventIdentifiers.has(name));
    }).at(-1);
    if (!relevant) return null;

    const state = { ...(frame.state || {}) };
    const cloneData = data => {
      if (!data || typeof data !== 'object') return data;
      if (Array.isArray(data)) return data.map(cloneData);
      return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, cloneData(value)]));
    };
    const payloadForTarget = target => {
      if (target.role === 'left') return relevant.payload?.left;
      if (target.role === 'right') return relevant.payload?.right;
      return null;
    };
    (relevant.targets || []).forEach(target => {
      const entry = state[target.variableId];
      const payload = payloadForTarget(target);
      if (!entry || payload == null) return;
      const resolvedIndex = Number(target.resolvedIndex);
      if (Number.isInteger(resolvedIndex) && Array.isArray(entry.data?.items)) {
        const items = entry.data.items.map(cloneData);
        if (resolvedIndex >= 0 && resolvedIndex < items.length) items[resolvedIndex] = cloneData(payload);
        state[target.variableId] = { ...entry, data: { ...entry.data, items } };
      } else {
        state[target.variableId] = { ...entry, data: cloneData(payload) };
      }

      const indexName = String(target.indexExpression || '').trim();
      if (!/^[A-Za-z_]\w*$/.test(indexName) || !Number.isInteger(resolvedIndex)) return;
      const indexVariableId = Object.keys(state).find(variableId => (
        document.variables?.[variableId]?.name === indexName
      ));
      if (!indexVariableId) return;
      const indexEntry = state[indexVariableId];
      state[indexVariableId] = {
        ...indexEntry,
        data: { kind: 'scalar', value: resolvedIndex }
      };
    });
    return { ...frame, state };
  }

  function textExpressionMatches(document, frame, condition) {
    if (!condition) return true;
    const comparisonFrame = comparisonSnapshotForCondition(document, frame, condition);
    return expressionMatches(document, comparisonFrame || frame, condition);
  }

  function conditionMatches(frame, condition) {
    if (!condition?.variableId) return true;
    const actual = stateValue(frame, condition.variableId);
    const expected = condition.value;
    const leftNumber = Number(actual);
    const rightNumber = Number(expected);
    const numeric = Number.isFinite(leftNumber) && Number.isFinite(rightNumber);
    const left = numeric ? leftNumber : String(actual ?? '');
    const right = numeric ? rightNumber : String(expected ?? '');
    if (condition.operator === 'neq') return left !== right;
    if (condition.operator === 'gt') return left > right;
    if (condition.operator === 'gte') return left >= right;
    if (condition.operator === 'lt') return left < right;
    if (condition.operator === 'lte') return left <= right;
    return left === right;
  }

  function frameMatches(frame, match = {}) {
    if (Array.isArray(match.frameIds) && match.frameIds.length && !match.frameIds.includes(frame?.id)) return false;
    return conditionMatches(frame, match.stateCondition);
  }

  function scalarStateByName(frame, expression) {
    const wanted = String(expression || '').trim();
    for (const entry of Object.values(frame?.state || {})) {
      if (entry?.name !== wanted) continue;
      const value = window.ASMTraceModel.scalarValue(entry.data);
      if (Number.isFinite(Number(value))) return Number(value);
    }
    return null;
  }

  function resolveIndex(target, frame) {
    const capturedIndex = Number(target?.resolvedIndex);
    if (Object.prototype.hasOwnProperty.call(target || {}, 'resolvedIndex')
      && Number.isInteger(capturedIndex)) return capturedIndex;
    const expression = String(target?.indexExpression || '').replace(/\s+/g, '');
    if (!expression) return null;
    if (/^-?\d+$/.test(expression)) return Number(expression);
    const match = expression.match(/^([A-Za-z_]\w*)([+-]\d+)?$/);
    if (!match) return null;
    const base = scalarStateByName(frame, match[1]);
    if (base == null) return null;
    return base + Number(match[2] || 0);
  }

  function resolveTargetIndex(document, frame, action) {
    const expression = action?.targetIndexExpression ?? action?.targetIndex;
    if (expression == null || String(expression).trim() === '') return null;
    const resolved = Number(resolveExpression(document, frame, expression));
    return Number.isInteger(resolved) ? resolved : null;
  }

  function mergeHighlightStyle(current = {}, style = {}, extra = {}) {
    const next = { ...current, ...style, ...extra };
    const styleType = String(style?.styleType || '').trim();
    const color = style?.color;
    if (styleType && color) {
      next.styleTypes = {
        ...(current.styleTypes || {}),
        ...(style.styleTypes || {}),
        [styleType]: color
      };
    } else if (style?.styleTypes) {
      next.styleTypes = { ...(current.styleTypes || {}), ...style.styleTypes };
    }
    const sourceStyleId = String(extra?.sourceStyleId || '').trim();
    if (styleType && sourceStyleId) {
      next.sourceStyleIds = {
        ...(current.sourceStyleIds || {}),
        ...(style.sourceStyleIds || {}),
        [styleType]: sourceStyleId
      };
    } else if (style?.sourceStyleIds) {
      next.sourceStyleIds = {
        ...(current.sourceStyleIds || {}),
        ...style.sourceStyleIds
      };
    }
    return next;
  }

  function evaluate(document, frame) {
    const highlights = {};
    const rules = [...DEFAULT_RULES, ...(Array.isArray(document?.rules) ? document.rules : [])];
    for (const event of frame?.events || []) {
      for (const rule of rules) {
        if (!frameMatches(frame, rule.match) || !eventMatches(event, rule.match)) continue;
        for (const action of rule.actions || []) {
          if (action.targetVariableId || action.type === 'repeat-cells') continue;
          const roles = action.target === 'participants' || !action.target
            ? null
            : new Set(Array.isArray(action.target) ? action.target : [String(action.target).replace(/^participant:/, '')]);
          for (const target of event.targets || []) {
            if (!target.variableId || (roles && !roles.has(target.role))) continue;
            const index = resolveIndex(target, frame);
            const key = index == null ? '$object' : String(index);
            highlights[target.variableId] ||= {};
            highlights[target.variableId][key] = mergeHighlightStyle(
              highlights[target.variableId][key],
              action.style || {},
              {
              animation: action.animation || highlights[target.variableId][key]?.animation || '',
              eventType: event.type,
              eventId: event.id
              }
            );
          }
        }
      }
    }
    const styleColors = {
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
    };
    for (const style of frame?.styles || []) {
      const variableId = style.targetVariableId;
      const entry = frame?.state?.[variableId];
      if (!variableId || !entry) continue;
      const items = Array.isArray(entry.data?.items) ? entry.data.items : [entry.data];
      const allIndices = items.map((_, index) => index);
      const selectorIndices = selector => {
        if (selector?.type === 'index') {
          const index = Number(resolveExpression(document, frame, selector.indexExpression));
          return Number.isInteger(index) ? [index] : [];
        }
        if (selector?.type === 'range') {
          const start = Number(resolveExpression(document, frame, selector.startExpression));
          const end = Number(resolveExpression(document, frame, selector.endExpression));
          if (!Number.isInteger(start) || !Number.isInteger(end)) return [];
          const stop = end + (selector.endInclusive ? 1 : 0);
          return allIndices.filter(index => index >= start && index < stop);
        }
        return allIndices;
      };
      const selectors = style.selector?.type === 'segments'
        ? style.selector.segments || []
        : [style.selector];
      const indices = [...new Set(selectors.flatMap(selectorIndices))];
      indices.forEach(index => {
        if (index < 0 || index >= items.length) return;
        const value = window.ASMTraceModel.scalarValue(items[index]);
        if (!expressionMatches(document, frame, style.when, { value, index })) return;
        const variableHighlights = highlights[variableId] ||= {};
        variableHighlights[String(index)] = mergeHighlightStyle(
          variableHighlights[String(index)],
          {
            styleType: style.styleType,
            color: styleColors[style.color] || style.color
          },
          { sourceStyleId: style.id || '' }
        );
      });
    }
    // Explicit Studio styles are applied after event highlights so the user's
    // cross-frame choices remain visible on read/write/compare frames.
    for (const rule of rules) {
      if (!frameMatches(frame, rule.match)) continue;
      for (const action of rule.actions || []) {
        if (!action.targetVariableId || action.type === 'repeat-cells') continue;
        const targetIndex = resolveTargetIndex(document, frame, action);
        const key = targetIndex != null
          ? String(targetIndex)
          : '$object';
        const variableHighlights = highlights[action.targetVariableId] ||= {};
        variableHighlights[key] = mergeHighlightStyle(
          variableHighlights[key],
          action.style || {},
          {
          animation: action.animation || variableHighlights[key]?.animation || ''
          }
        );
        if (key === '$object') {
          Object.keys(variableHighlights).forEach(index => {
            if (index === '$object') return;
            variableHighlights[index] = mergeHighlightStyle(
              variableHighlights[index],
              action.style || {},
              {
              animation: action.animation || variableHighlights[index]?.animation || ''
              }
            );
          });
        }
      }
    }
    return highlights;
  }

  function decorations(document, frame) {
    const output = [];
    for (const rule of document?.rules || []) {
      if (!frameMatches(frame, rule.match)) continue;
      for (const action of rule.actions || []) {
        if (action.type !== 'repeat-cells') continue;
        const raw = action.countExpression
          ? resolveExpression(document, frame, action.countExpression)
          : stateValue(frame, action.sourceVariableId);
        const count = Math.max(0, Math.min(100, Math.floor(Number(raw) || 0)));
        output.push({ ...action, ruleId: rule.id, count });
      }
    }
    return output;
  }

  window.ASMTraceRules = {
    DEFAULT_RULES,
    eventMatches,
    frameMatches,
    conditionMatches,
    variableEntry,
    resolveExpression,
    temporalValue,
    expressionMatches,
    textExpressionMatches,
    resolveTargetIndex,
    resolveIndex,
    evaluate,
    decorations
  };
})();
