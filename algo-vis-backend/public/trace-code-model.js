(function () {
  const NON_CODE_EVENT_TYPES = new Set(['fixed', 'keep']);
  const CONTROL_CONTEXT_TYPES = new Set([
    'ForStatement', 'IfStatement', 'WhileStatement', 'DoStatement', 'SwitchStatement'
  ]);

  function sourceLines(source = '') {
    const lines = [];
    let start = 0;
    let number = 1;
    for (let cursor = 0; cursor <= source.length; cursor += 1) {
      if (cursor < source.length && source[cursor] !== '\n') continue;
      let end = cursor;
      if (end > start && source[end - 1] === '\r') end -= 1;
      lines.push({ number, start, end, text: source.slice(start, end) });
      start = cursor + 1;
      number += 1;
    }
    return lines;
  }

  function commentMaskedLines(lines) {
    const masked = new Map();
    let blockComment = false;
    lines.forEach(line => {
      const output = [...line.text];
      let quote = '';
      let escaped = false;
      for (let cursor = 0; cursor < line.text.length; cursor += 1) {
        const char = line.text[cursor];
        const next = line.text[cursor + 1];
        if (blockComment) {
          output[cursor] = ' ';
          if (char === '*' && next === '/') {
            output[cursor + 1] = ' ';
            blockComment = false;
            cursor += 1;
          }
          continue;
        }
        if (quote) {
          if (escaped) escaped = false;
          else if (char === '\\') escaped = true;
          else if (char === quote) quote = '';
          continue;
        }
        if (char === '"' || char === "'") {
          quote = char;
          continue;
        }
        if (char === '/' && next === '/') {
          for (let rest = cursor; rest < output.length; rest += 1) output[rest] = ' ';
          break;
        }
        if (char === '/' && next === '*') {
          output[cursor] = ' ';
          output[cursor + 1] = ' ';
          blockComment = true;
          cursor += 1;
        }
      }
      masked.set(line.number, output.join('').replace(/\s+$/, ''));
    });
    return masked;
  }

  function mainWrapperLines(lines) {
    const hidden = new Set();
    let signatureStart = -1;
    let braceDepth = 0;
    let opened = false;
    let blockComment = false;
    let quote = '';
    let escaped = false;
    for (let index = 0; index < lines.length; index += 1) {
      const text = lines[index].text;
      if (signatureStart < 0 && /\bmain\s*\(/.test(text)) signatureStart = index;
      if (signatureStart < 0) continue;
      if (!opened) hidden.add(lines[index].number);
      for (let cursor = 0; cursor < text.length; cursor += 1) {
        const char = text[cursor];
        const next = text[cursor + 1];
        if (blockComment) {
          if (char === '*' && next === '/') {
            blockComment = false;
            cursor += 1;
          }
          continue;
        }
        if (quote) {
          if (escaped) escaped = false;
          else if (char === '\\') escaped = true;
          else if (char === quote) quote = '';
          continue;
        }
        if (char === '/' && next === '/') break;
        if (char === '/' && next === '*') {
          blockComment = true;
          cursor += 1;
          continue;
        }
        if (char === '"' || char === "'") {
          quote = char;
          continue;
        }
        if (char === '{') {
          braceDepth += 1;
          opened = true;
        } else if (char === '}' && opened) {
          braceDepth -= 1;
          if (braceDepth === 0) {
            hidden.add(lines[index].number);
            return hidden;
          }
        }
      }
    }
    return hidden;
  }

  function presentationLineNumbers(lines, displayLines = commentMaskedLines(lines)) {
    const hidden = mainWrapperLines(lines);
    let asmView = false;
    lines.forEach(line => {
      const text = line.text;
      if (/\/\*\s*@asm-view\b/i.test(text)) asmView = true;
      if (asmView) hidden.add(line.number);
      if (/@asm-view\s*\*\//i.test(text)) asmView = false;
      if (/^\s*\/\/.*@(?:frame|keep|text|style|segment|layout|asm(?:[-\w]*)?)\b/i.test(text)) {
        hidden.add(line.number);
      }
      if (!String(displayLines.get(line.number) || '').trim()) hidden.add(line.number);
      if (/^\s*#\s*include\b/i.test(text)
        || /^\s*using\s+namespace\b/i.test(text)
        || /^\s*return\s+0\s*;\s*(?:\/\/.*)?$/i.test(text)
        || /^\s*AV\s+[A-Za-z_]\w*\s*;/i.test(text)
        || /\bav\s*\.\s*(?:start_draw|start_frame_draw|frame_draw|end_draw)\s*\(/i.test(text)) {
        hidden.add(line.number);
      }
    });
    return hidden;
  }

  function compactLookup(text) {
    const compact = [];
    const offsets = [];
    for (let index = 0; index < text.length; index += 1) {
      if (/\s/.test(text[index])) continue;
      compact.push(text[index]);
      offsets.push(index);
    }
    return { text: compact.join(''), offsets };
  }

  function signatureExpression(event = {}) {
    const signature = String(event.signature || '');
    const match = signature.match(/^[^:]+:[^:]+:\d+:(.*)$/s);
    return String(event.expression || match?.[1] || '').trim();
  }

  function fallbackEventSource(event, lines, source) {
    const lineNumber = Number(event?.line);
    const line = lines[lineNumber - 1];
    if (!line) return null;
    const expression = signatureExpression(event);
    if (expression) {
      const haystack = compactLookup(line.text);
      const needle = compactLookup(expression).text;
      const compactStart = needle ? haystack.text.indexOf(needle) : -1;
      if (compactStart >= 0) {
        const localStart = haystack.offsets[compactStart];
        const compactEnd = compactStart + needle.length - 1;
        const localEnd = (haystack.offsets[compactEnd] ?? localStart) + 1;
        return {
          functionName: String(event.source?.functionName || ''),
          from: line.start + localStart,
          to: line.start + localEnd,
          line: line.number,
          column: localStart + 1,
          endLine: line.number,
          endColumn: localEnd + 1,
          text: source.slice(line.start + localStart, line.start + localEnd),
          contexts: []
        };
      }
    }
    const first = line.text.search(/\S/);
    const localStart = first >= 0 ? first : 0;
    return {
      functionName: String(event.source?.functionName || ''),
      from: line.start + localStart,
      to: line.end,
      line: line.number,
      column: localStart + 1,
      endLine: line.number,
      endColumn: line.text.length + 1,
      text: source.slice(line.start + localStart, line.end),
      contexts: []
    };
  }

  function eventSourceFor(event, lines, source, hidden) {
    if (!event || NON_CODE_EVENT_TYPES.has(event.type)) return null;
    const recorded = event.source;
    const from = Number(recorded?.from);
    const to = Number(recorded?.to);
    const candidate = Number.isFinite(from) && Number.isFinite(to) && to > from
      ? {
        ...recorded,
        from: Math.max(0, Math.min(source.length, from)),
        to: Math.max(0, Math.min(source.length, to)),
        contexts: Array.isArray(recorded.contexts) ? recorded.contexts : []
      }
      : fallbackEventSource(event, lines, source);
    if (!candidate || candidate.to <= candidate.from) return null;
    const lineNumber = Number(candidate.line) || Number(event.line) || 0;
    if (!lineNumber || hidden.has(lineNumber)) return null;
    return { event, ...candidate, line: lineNumber };
  }

  function nearestVisibleLine(lines, hidden, preferredLine) {
    const visible = line => line && !hidden.has(line.number) && line.text.trim();
    for (let distance = 0; distance < lines.length; distance += 1) {
      const before = lines[preferredLine - 1 - distance];
      if (visible(before)) return before;
      const after = lines[preferredLine - 1 + distance];
      if (distance && visible(after)) return after;
    }
    return null;
  }

  function clusterSources(sources) {
    const sorted = [...sources].sort((left, right) => left.line - right.line || left.from - right.from);
    const clusters = [];
    sorted.forEach(source => {
      const current = clusters.at(-1);
      const lastLine = current?.at(-1)?.line;
      if (!current || source.line - lastLine > 5) clusters.push([source]);
      else current.push(source);
    });
    if (clusters.length <= 3) return clusters;
    return [clusters[0], clusters[1], clusters.slice(2).flat()];
  }

  function sourceLimit(cluster, lines) {
    const functions = cluster.flatMap(source => source.contexts || [])
      .filter(context => context.type === 'FunctionDefinition');
    const context = functions.at(-1);
    return {
      start: Math.max(1, Number(context?.openLine) || 1),
      end: Math.min(lines.length, Number(context?.closeLine) || lines.length)
    };
  }

  function addNearbyLines(selected, lines, hidden, cluster, targetCount = 6) {
    const limit = sourceLimit(cluster, lines);
    let before = Math.min(...cluster.map(source => source.line)) - 1;
    let after = Math.max(...cluster.map(source => Number(source.endLine) || source.line)) + 1;
    const isVisible = line => line >= limit.start && line <= limit.end
      && !hidden.has(line) && Boolean(lines[line - 1]?.text.trim());
    while (selected.size < targetCount && (before >= limit.start || after <= limit.end)) {
      if (before >= limit.start) {
        if (isVisible(before)) selected.add(before);
        before -= 1;
        if (selected.size >= targetCount) break;
      }
      if (after <= limit.end) {
        if (isVisible(after)) selected.add(after);
        after += 1;
      }
    }
  }

  function addContextLines(selected, cluster, hidden) {
    const contexts = cluster.flatMap(source => source.contexts || []);
    const unique = new Map();
    contexts.forEach(context => {
      const key = `${context.type}:${context.from}:${context.to}`;
      unique.set(key, context);
    });
    const controls = [...unique.values()].filter(context => CONTROL_CONTEXT_TYPES.has(context.type)).slice(-2);
    const chosen = controls.length
      ? controls
      : [...unique.values()].filter(context => context.type === 'FunctionDefinition').slice(-1);
    chosen.forEach(context => {
      const open = Number(context.openLine);
      const close = Number(context.closeLine);
      if (open > 0 && !hidden.has(open)) selected.add(open);
      if (close > 0 && !hidden.has(close)) selected.add(close);
    });
  }

  function sourceBraceDeltas(lines) {
    const deltas = new Map();
    let blockComment = false;
    let quote = '';
    let escaped = false;
    lines.forEach(line => {
      let delta = 0;
      for (let cursor = 0; cursor < line.text.length; cursor += 1) {
        const char = line.text[cursor];
        const next = line.text[cursor + 1];
        if (blockComment) {
          if (char === '*' && next === '/') {
            blockComment = false;
            cursor += 1;
          }
          continue;
        }
        if (quote) {
          if (escaped) escaped = false;
          else if (char === '\\') escaped = true;
          else if (char === quote) quote = '';
          continue;
        }
        if (char === '/' && next === '/') break;
        if (char === '/' && next === '*') {
          blockComment = true;
          cursor += 1;
          continue;
        }
        if (char === '"' || char === "'") {
          quote = char;
          continue;
        }
        if (char === '{') delta += 1;
        else if (char === '}') delta -= 1;
      }
      deltas.set(line.number, delta);
    });
    return deltas;
  }

  function addStructuralClosingLines(selected, lines, hidden) {
    if (!selected.size) return;
    const deltas = sourceBraceDeltas(lines);
    let balance = [...selected].reduce((sum, number) => sum + (deltas.get(number) || 0), 0);
    if (balance <= 0) return;
    let cursor = Math.max(...selected) + 1;
    let scannedBalance = balance;
    while (cursor <= lines.length && balance > 0) {
      const nextBalance = scannedBalance + (deltas.get(cursor) || 0);
      if (nextBalance < balance) {
        if (!hidden.has(cursor) && lines[cursor - 1]?.text.trim()) selected.add(cursor);
        balance = Math.max(0, nextBalance);
      }
      scannedBalance = nextBalance;
      cursor += 1;
    }
  }

  function segmentsForLine(line, cluster) {
    const ranges = cluster.map(source => ({
      eventId: String(source.event?.id || ''),
      start: Math.max(line.start, source.from) - line.start,
      end: Math.min(line.end, source.to) - line.start
    })).filter(range => range.eventId && range.end > range.start);
    const boundaries = new Set([0, line.text.length]);
    ranges.forEach(range => {
      boundaries.add(Math.max(0, Math.min(line.text.length, range.start)));
      boundaries.add(Math.max(0, Math.min(line.text.length, range.end)));
    });
    const points = [...boundaries].sort((left, right) => left - right);
    return points.slice(0, -1).map((start, index) => {
      const end = points[index + 1];
      return {
        text: line.text.slice(start, end),
        from: line.start + start,
        to: line.start + end,
        eventIds: ranges.filter(range => start >= range.start && end <= range.end)
          .map(range => range.eventId)
      };
    }).filter(segment => segment.text);
  }

  function tokenizeSource(source = '', tokenizer = null) {
    const byLine = new Map();
    if (!tokenizer?.getLineTokens) return byLine;
    let state = 'start';
    sourceLines(source).forEach(line => {
      let result;
      try {
        result = tokenizer.getLineTokens(line.text, state);
      } catch (_) {
        result = null;
      }
      const tokens = [];
      let cursor = 0;
      (result?.tokens || []).forEach(token => {
        const value = String(token?.value || '');
        if (!value) return;
        tokens.push({
          type: String(token?.type || 'text'),
          text: value,
          from: line.start + cursor,
          to: line.start + cursor + value.length
        });
        cursor += value.length;
      });
      if (cursor < line.text.length) {
        tokens.push({
          type: 'text',
          text: line.text.slice(cursor),
          from: line.start + cursor,
          to: line.end
        });
      }
      byLine.set(line.number, tokens);
      if (result?.state != null) state = result.state;
    });
    return byLine;
  }

  function mergeSyntaxSegments(item, syntaxTokens = []) {
    const sourceSegments = Array.isArray(item?.segments) ? item.segments : [];
    if (!sourceSegments.length || !syntaxTokens.length) return sourceSegments;
    const merged = [];
    sourceSegments.forEach(segment => {
      const boundaries = new Set([segment.from, segment.to]);
      syntaxTokens.forEach(token => {
        if (token.to <= segment.from || token.from >= segment.to) return;
        boundaries.add(Math.max(segment.from, token.from));
        boundaries.add(Math.min(segment.to, token.to));
      });
      const points = [...boundaries].sort((left, right) => left - right);
      points.slice(0, -1).forEach((from, index) => {
        const to = points[index + 1];
        if (to <= from) return;
        const token = syntaxTokens.find(candidate => candidate.from <= from && candidate.to >= to);
        merged.push({
          text: item.text.slice(from - item.sourceStart, to - item.sourceStart),
          from,
          to,
          eventIds: [...(segment.eventIds || [])],
          tokenType: String(token?.type || 'text')
        });
      });
    });
    return merged.filter(segment => segment.text);
  }

  function fragmentForCluster(cluster, lines, hidden, displayLines) {
    const selected = new Set();
    cluster.forEach(source => {
      const endLine = Number(source.endLine) || source.line;
      for (let line = source.line; line <= endLine; line += 1) {
        if (!hidden.has(line)) selected.add(line);
      }
    });
    addNearbyLines(selected, lines, hidden, cluster);
    addContextLines(selected, cluster, hidden);
    addStructuralClosingLines(selected, lines, hidden);
    const numbers = [...selected].filter(number => lines[number - 1] && !hidden.has(number))
      .sort((left, right) => left - right);
    const items = [];
    const limit = sourceLimit(cluster, lines);
    const hasOmittedAlgorithm = (from, to) => from <= to && lines.slice(from - 1, to)
      .some(line => !hidden.has(line.number) && line.text.trim());
    if (numbers.length && hasOmittedAlgorithm(limit.start, numbers[0] - 1)) {
      items.push({ kind: 'ellipsis' });
    }
    numbers.forEach((number, index) => {
      const previous = numbers[index - 1];
      if (previous && number > previous + 1) {
        if (hasOmittedAlgorithm(previous + 1, number - 1)) items.push({ kind: 'ellipsis' });
      }
      const line = lines[number - 1];
      const displayText = String(displayLines.get(number) ?? line.text);
      const displayLine = { ...line, end: line.start + displayText.length, text: displayText };
      items.push({
        kind: 'line',
        number,
        sourceStart: displayLine.start,
        sourceEnd: displayLine.end,
        text: displayLine.text,
        segments: segmentsForLine(displayLine, cluster)
      });
    });
    if (numbers.length && hasOmittedAlgorithm(numbers.at(-1) + 1, limit.end)) {
      items.push({ kind: 'ellipsis' });
    }
    return {
      functionName: String(cluster.find(source => source.functionName)?.functionName || ''),
      eventIds: [...new Set(cluster.map(source => String(source.event?.id || '')).filter(Boolean))],
      items
    };
  }

  function planFrame(document, frame) {
    const source = String(document?.sourceCode || '');
    if (!source || !frame) return { frameId: frame?.id || '', sourceCode: source, fragments: [] };
    const lines = sourceLines(source);
    const displayLines = commentMaskedLines(lines);
    const hidden = presentationLineNumbers(lines, displayLines);
    let sources = (frame.events || [])
      .map(event => eventSourceFor(event, lines, source, hidden))
      .filter(Boolean);
    if (!sources.length) {
      const fallback = nearestVisibleLine(lines, hidden, Number(frame.source?.line) || 1);
      if (fallback) {
        sources = [{
          event: null,
          functionName: String(frame.source?.function || ''),
          from: fallback.start,
          to: fallback.end,
          line: fallback.number,
          endLine: fallback.number,
          contexts: []
        }];
      }
    }
    return {
      frameId: frame.id || '',
      sourceCode: source,
      hiddenLines: [...hidden],
      fragments: clusterSources(sources).map(cluster => fragmentForCluster(cluster, lines, hidden, displayLines))
        .filter(fragment => fragment.items.length)
    };
  }

  window.ASMTraceCodeModel = {
    sourceLines,
    commentMaskedLines,
    presentationLineNumbers,
    eventSourceFor,
    tokenizeSource,
    mergeSyntaxSegments,
    planFrame
  };
})();
