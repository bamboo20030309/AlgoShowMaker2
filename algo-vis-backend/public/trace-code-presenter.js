(function () {
  let panel = null;
  let body = null;
  let currentDocument = null;
  let currentFrame = null;
  let currentFocusLine = 0;
  let activeEventId = '';
  let completedEventIds = new Set();
  let cppTokenizer = null;
  let syntaxSource = null;
  let syntaxByLine = new Map();
  let transitionTimer = 0;
  let dragState = null;
  const eventNodes = new Map();

  function ensurePanel() {
    const wrapper = document.getElementById('canvasWrapper');
    if (!wrapper) return null;
    if (panel?.isConnected && panel.parentElement === wrapper) return panel;
    panel = document.createElement('aside');
    panel.id = 'traceCodePanel';
    panel.className = 'asm-trace-code-panel';
    panel.hidden = true;
    panel.setAttribute('aria-label', '目前程式碼片段');
    panel.innerHTML = '<div class="asm-trace-code-body ace-tm"></div>';
    body = panel.querySelector('.asm-trace-code-body');
    wrapper.append(panel);
    bindDragging();
    return panel;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function setPanelPixels(left, top) {
    const wrapper = panel?.parentElement;
    if (!panel || !wrapper) return;
    panel.style.left = `${clamp(left, 8, Math.max(8, wrapper.clientWidth - panel.offsetWidth - 8))}px`;
    panel.style.top = `${clamp(top, 8, Math.max(8, wrapper.clientHeight - panel.offsetHeight - 8))}px`;
  }

  function applyStoredPosition() {
    if (!panel || panel.hidden) return;
    const wrapper = panel.parentElement;
    const saved = currentDocument?.studio?.codePanelPosition;
    if (!wrapper || !Number.isFinite(Number(saved?.x)) || !Number.isFinite(Number(saved?.y))) {
      setPanelPixels(24, 24);
      return;
    }
    const availableX = Math.max(0, wrapper.clientWidth - panel.offsetWidth);
    const availableY = Math.max(0, wrapper.clientHeight - panel.offsetHeight);
    setPanelPixels(clamp(Number(saved.x), 0, 1) * availableX, clamp(Number(saved.y), 0, 1) * availableY);
  }

  function storePanelPosition() {
    const wrapper = panel?.parentElement;
    if (!panel || !wrapper || !currentDocument) return;
    const availableX = Math.max(1, wrapper.clientWidth - panel.offsetWidth);
    const availableY = Math.max(1, wrapper.clientHeight - panel.offsetHeight);
    currentDocument.studio ||= {};
    currentDocument.studio.codePanelPosition = {
      x: Math.round(clamp(panel.offsetLeft / availableX, 0, 1) * 10000) / 10000,
      y: Math.round(clamp(panel.offsetTop / availableY, 0, 1) * 10000) / 10000
    };
  }

  function finishDrag(event) {
    if (!dragState || (event?.pointerId != null && event.pointerId !== dragState.pointerId)) return;
    try { panel?.releasePointerCapture?.(dragState.pointerId); } catch (_) { /* already released */ }
    dragState = null;
    panel?.classList.remove('is-dragging');
    storePanelPosition();
  }

  function bindDragging() {
    if (!panel || panel.dataset.dragBound) return;
    panel.dataset.dragBound = '1';
    panel.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      const rect = panel.getBoundingClientRect();
      dragState = {
        pointerId: event.pointerId,
        dx: event.clientX - rect.left,
        dy: event.clientY - rect.top
      };
      panel.classList.add('is-dragging');
      panel.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });
    panel.addEventListener('pointermove', event => {
      if (!dragState || event.pointerId !== dragState.pointerId) return;
      const wrapperRect = panel.parentElement.getBoundingClientRect();
      setPanelPixels(event.clientX - wrapperRect.left - dragState.dx, event.clientY - wrapperRect.top - dragState.dy);
      event.preventDefault();
    });
    panel.addEventListener('pointerup', finishDrag);
    panel.addEventListener('pointercancel', finishDrag);
  }

  function registerEventNode(eventId, node) {
    if (!eventId) return;
    if (!eventNodes.has(eventId)) eventNodes.set(eventId, []);
    eventNodes.get(eventId).push(node);
  }

  function aceTokenClasses(type = '') {
    return String(type).split('.').filter(part => part && part !== 'text')
      .map(part => `ace_${part.replace(/[^A-Za-z0-9_-]/g, '_')}`);
  }

  function getCppTokenizer() {
    if (cppTokenizer) return cppTokenizer;
    try {
      window.ace?.require?.('ace/theme/textmate');
      const Mode = window.ace?.require?.('ace/mode/c_cpp')?.Mode;
      cppTokenizer = Mode ? new Mode().getTokenizer() : null;
    } catch (_) {
      cppTokenizer = null;
    }
    return cppTokenizer;
  }

  function syntaxForSource(source = '') {
    if (source === syntaxSource) return syntaxByLine;
    syntaxSource = source;
    syntaxByLine = window.ASMTraceCodeModel?.tokenizeSource?.(source, getCppTokenizer()) || new Map();
    return syntaxByLine;
  }

  function appendSyntaxSegment(segment, parent) {
    const tokenClasses = aceTokenClasses(segment.tokenType);
    if (!tokenClasses.length) {
      parent.append(document.createTextNode(segment.text));
      return;
    }
    const span = document.createElement('span');
    span.classList.add(...tokenClasses);
    span.textContent = segment.text;
    parent.append(span);
  }

  function renderSegments(segments, code) {
    let eventWrapper = null;
    let wrapperKey = '';
    segments.forEach(segment => {
      const ids = Array.isArray(segment.eventIds) ? segment.eventIds.filter(Boolean) : [];
      const key = ids.join(' ');
      if (!key) {
        eventWrapper = null;
        wrapperKey = '';
        appendSyntaxSegment(segment, code);
        return;
      }
      if (!eventWrapper || key !== wrapperKey) {
        eventWrapper = document.createElement('span');
        eventWrapper.className = 'asm-trace-code-event-span';
        eventWrapper.dataset.traceEventIds = key;
        ids.forEach(id => registerEventNode(id, eventWrapper));
        code.append(eventWrapper);
        wrapperKey = key;
      }
      appendSyntaxSegment(segment, eventWrapper);
    });
  }

  function renderLine(item, fragmentElement, syntaxLines) {
    if (item.kind === 'ellipsis') {
      const ellipsis = document.createElement('div');
      ellipsis.className = 'asm-trace-code-ellipsis';
      ellipsis.textContent = '⋯';
      fragmentElement.append(ellipsis);
      return;
    }
    const line = document.createElement('div');
    line.className = 'asm-trace-code-line';
    line.dataset.sourceLine = String(item.number);
    const code = document.createElement('code');
    const segments = window.ASMTraceCodeModel.mergeSyntaxSegments(
      item,
      syntaxLines.get(item.number) || []
    );
    renderSegments(segments, code);
    line.append(code);
    fragmentElement.append(line);
  }

  function applyEventClasses() {
    body?.querySelectorAll?.('.asm-trace-code-line.has-active-event')
      .forEach(line => line.classList.remove('has-active-event'));
    body?.querySelectorAll?.('.asm-trace-code-event-span').forEach(node => {
      const ids = String(node.dataset.traceEventIds || '').split(/\s+/).filter(Boolean);
      node.classList.toggle('is-active', Boolean(activeEventId) && ids.includes(activeEventId));
      node.classList.toggle('is-complete', ids.some(id => completedEventIds.has(id)));
      node.classList.remove('is-active-first', 'is-active-last');
    });
    const activeByLine = new Map();
    (eventNodes.get(activeEventId) || []).forEach(node => {
      const line = node.closest('.asm-trace-code-line');
      if (!line) return;
      if (!activeByLine.has(line)) activeByLine.set(line, []);
      activeByLine.get(line).push(node);
    });
    activeByLine.forEach((nodes, line) => {
      line.classList.add('has-active-event');
      nodes[0]?.classList.add('is-active-first');
      nodes.at(-1)?.classList.add('is-active-last');
    });
  }

  function setActiveEvent(eventId = '', phase = 'start') {
    const id = String(eventId || '');
    if (phase === 'end' && id) completedEventIds.add(id);
    activeEventId = phase === 'start' ? id : (activeEventId === id ? '' : activeEventId);
    applyEventClasses();
  }

  function planFocusLine(plan) {
    const lines = (plan.fragments || []).flatMap(fragment => fragment.items || [])
      .filter(item => item.kind === 'line').map(item => Number(item.number)).filter(Number.isFinite);
    return lines.length ? Math.min(...lines) : 0;
  }

  function buildPage(plan, syntaxLines) {
    const page = document.createElement('div');
    page.className = 'asm-trace-code-page';
    const fragments = plan.fragments || [];
    fragments.forEach((fragment, index) => {
      if (index) {
        const divider = document.createElement('div');
        divider.className = 'asm-trace-code-fragment-divider';
        divider.textContent = '⋯';
        page.append(divider);
      }
      const fragmentElement = document.createElement('section');
      fragmentElement.className = 'asm-trace-code-fragment';
      (fragment.items || []).forEach(item => renderLine(item, fragmentElement, syntaxLines));
      page.append(fragmentElement);
    });
    return page;
  }

  function finishPageTransition() {
    if (transitionTimer) clearTimeout(transitionTimer);
    transitionTimer = 0;
    body?.querySelectorAll?.('.asm-trace-code-page.is-leaving').forEach(page => page.remove());
    body?.querySelector?.('.asm-trace-code-page.is-entering')?.classList.remove('is-entering', 'from-above', 'from-below');
    body?.classList.remove('is-switching');
  }

  function showPage(nextPage, nextFocusLine, animate) {
    const previous = body.querySelector('.asm-trace-code-page:not(.is-leaving)');
    finishPageTransition();
    if (!previous || !animate || window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
      body.replaceChildren(nextPage);
      return;
    }
    const movesDown = nextFocusLine >= currentFocusLine;
    previous.classList.add('is-leaving', movesDown ? 'to-above' : 'to-below');
    nextPage.classList.add('is-entering', movesDown ? 'from-below' : 'from-above');
    body.classList.add('is-switching');
    body.append(nextPage);
    void nextPage.offsetHeight;
    requestAnimationFrame(() => {
      previous.classList.add('has-left');
      nextPage.classList.remove('is-entering');
    });
    transitionTimer = setTimeout(finishPageTransition, 460);
  }

  function renderFrame(trace, frame) {
    ensurePanel();
    const animate = Boolean(currentDocument === trace && currentFrame && currentFrame.id !== frame?.id && !dragState);
    const previousDocument = currentDocument;
    currentDocument = trace;
    activeEventId = '';
    completedEventIds = new Set();
    eventNodes.clear();
    if (!panel || !body || !window.ASMTraceCodeModel) return;
    const plan = window.ASMTraceCodeModel.planFrame(trace, frame);
    const syntaxLines = syntaxForSource(plan.sourceCode);
    const fragments = plan.fragments || [];
    const nextFocusLine = planFocusLine(plan);
    showPage(buildPage(plan, syntaxLines), nextFocusLine, animate);
    currentFrame = frame;
    currentFocusLine = nextFocusLine;
    panel.hidden = !fragments.length;
    panel.closest('#canvasWrapper')?.classList.toggle('has-trace-code-panel', fragments.length > 0);
    if (previousDocument !== trace) panel.style.removeProperty('will-change');
    requestAnimationFrame(applyStoredPosition);
    const liveEvent = document.querySelector('[data-trace-active-event-id]')?.dataset?.traceActiveEventId || '';
    if (liveEvent) setActiveEvent(liveEvent, 'start');
  }

  function safeInsetLeft() {
    ensurePanel();
    if (!panel || panel.hidden) return 0;
    const rect = panel.getBoundingClientRect();
    const wrapperRect = panel.parentElement?.getBoundingClientRect?.();
    if (!wrapperRect || rect.left - wrapperRect.left > wrapperRect.width * 0.42) return 0;
    return Math.max(0, rect.right - wrapperRect.left + 20);
  }

  window.addEventListener('resize', () => requestAnimationFrame(applyStoredPosition));

  window.addEventListener('asm:trace-frame', event => {
    if (!event.detail?.document || !event.detail?.frame) return;
    renderFrame(event.detail.document, event.detail.frame);
  });

  window.addEventListener('asm:trace-active-event', event => {
    if (event.detail?.document !== currentDocument || event.detail?.frame !== currentFrame) return;
    setActiveEvent(event.detail?.event?.id || '', event.detail?.phase || 'start');
  });

  window.addEventListener('asm:trace-playback-plan-complete', event => {
    if (event.detail?.document !== currentDocument || event.detail?.frame !== currentFrame) return;
    if (activeEventId) setActiveEvent(activeEventId, 'end');
  });

  window.ASMTraceCodePresenter = {
    renderFrame,
    setActiveEvent,
    safeInsetLeft,
    getPanel: () => ensurePanel()
  };
})();
