(function () {
  let mode = 'trace';
  let sliceMode = 'auto';
  let variables = [];
  let frameDirectives = [];
  let analyzedCode = '';
  let currentTrace = null;
  let studioButton = null;
  let eventSettingsButton = null;
  let eventSettingsPanel = null;
  let eventSettingsCloseTimer = null;
  let eventSettingsSaveTimer = null;
  let accountEventSettings = null;
  let accountEventSettingsToken = '';
  let renderedEventSettingsTrace = null;
  let renderedEventSettingsFingerprint = '';
  let useSavedEventSettings = false;
  const embedMode = new URLSearchParams(window.location.search).get('asmEmbed');

  const EVENT_SETTING_TYPES = [
    'declare', 'read', 'write', 'assign', 'compare', 'condition', 'swap',
    'call', 'function-enter', 'function-exit'
  ];
  const DEFAULT_EVENT_GAP_MS = 500;

  function cleanEventSettings(value = {}) {
    const cleanFlags = source => Object.fromEntries(EVENT_SETTING_TYPES.flatMap(type => (
      typeof source?.[type] === 'boolean' ? [[type, source[type]]] : []
    )));
    return {
      gapMs: Number.isFinite(Number(value.gapMs))
        ? Math.max(0, Math.min(2000, Number(value.gapMs)))
        : DEFAULT_EVENT_GAP_MS,
      autoFixedEnabled: typeof value.autoFixedEnabled === 'boolean'
        ? value.autoFixedEnabled
        : (typeof value.defaultEnabled?.fixed === 'boolean' ? value.defaultEnabled.fixed : true),
      defaultEnabled: cleanFlags(value.defaultEnabled),
      timelineTypes: cleanFlags(value.timelineTypes)
    };
  }

  function applyAccountEventSettings() {
    if (!currentTrace || useSavedEventSettings) return;
    currentTrace.studio ||= {};
    currentTrace.studio.eventSettings = cleanEventSettings(accountEventSettings || { gapMs: DEFAULT_EVENT_GAP_MS });
    window.ASMTraceEvents?.applyEnabledStates?.(currentTrace);
  }

  async function loadAccountEventSettings(force = false) {
    if (useSavedEventSettings) return currentTrace?.studio?.eventSettings;
    const token = localStorage.getItem('algo_jwt_token') || '';
    if (!token) {
      accountEventSettings = cleanEventSettings({ gapMs: DEFAULT_EVENT_GAP_MS });
      accountEventSettingsToken = '';
      applyAccountEventSettings();
      return accountEventSettings;
    }
    if (!force && accountEventSettings && accountEventSettingsToken === token) {
      applyAccountEventSettings();
      return accountEventSettings;
    }
    accountEventSettingsToken = token;
    try {
      const response = await fetch('/api/user/preferences/event-settings', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('event settings unavailable');
      const data = await response.json();
      if (accountEventSettingsToken !== token) return accountEventSettings;
      accountEventSettings = cleanEventSettings(data.eventSettings || { gapMs: DEFAULT_EVENT_GAP_MS });
    } catch (error) {
      accountEventSettings = cleanEventSettings({ gapMs: DEFAULT_EVENT_GAP_MS });
    }
    applyAccountEventSettings();
    if (currentTrace) {
      window.ASMTracePlayer?.render?.(window.ASMTracePlayer.getCurrentFrame?.() || 0, {
        animateEvents: false,
        animatePositions: false
      });
      window.ASMTraceStudio?.refresh?.();
      if (!eventSettingsPanel?.hidden) renderEventSettings();
    }
    return accountEventSettings;
  }

  function scheduleAccountEventSettingsSave() {
    const token = localStorage.getItem('algo_jwt_token') || '';
    if (!token || !currentTrace) return;
    accountEventSettings = cleanEventSettings(currentTrace.studio?.eventSettings || { gapMs: DEFAULT_EVENT_GAP_MS });
    accountEventSettingsToken = token;
    clearTimeout(eventSettingsSaveTimer);
    eventSettingsSaveTimer = setTimeout(async () => {
      try {
        await fetch('/api/user/preferences/event-settings', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ eventSettings: accountEventSettings })
        });
      } catch (error) {
        console.warn('無法儲存帳號事件設定');
      }
    }, 240);
  }

  function defaultRenderer(variable) {
    if (variable.kind === 'matrix') return 'original-matrix';
    if (variable.kind === 'stack') return 'original-stack';
    if (variable.kind === 'queue') return 'original-queue';
    if (['sequence', 'set', 'map'].includes(variable.kind)) return 'original-array';
    if (['scalar', 'string'].includes(variable.kind)) return 'original-cell';
    if (variable.kind === 'node-graph') return 'graph';
    if (variable.kind === 'coordinate-system') return 'coordinate-system';
    return 'object';
  }

  function originalRendererName(renderer, variable) {
    const legacy = {
      array: 'original-array',
      sequence: 'original-array',
      matrix: 'original-matrix',
      scalar: 'original-cell',
      string: 'original-cell',
      stack: 'original-stack',
      queue: 'original-queue'
    };
    return legacy[renderer] || renderer || defaultRenderer(variable || {});
  }

  function sourceCode() {
    if (typeof aceEditor !== 'undefined' && aceEditor?.getValue) return aceEditor.getValue();
    const editor = document.getElementById('editor');
    return window.ace?.edit && editor ? window.ace.edit(editor).getValue() : '';
  }

  function updateStudioButton() {
    const disabled = !currentTrace?.frames?.length;
    if (studioButton) studioButton.disabled = disabled;
    if (eventSettingsButton) eventSettingsButton.disabled = disabled;
  }

  function ensureEventSettings() {
    currentTrace.studio ||= {};
    const settings = currentTrace.studio.eventSettings ||= {};
    settings.defaultEnabled ||= {};
    settings.timelineTypes ||= {};
    if (typeof settings.autoFixedEnabled !== 'boolean') {
      settings.autoFixedEnabled = typeof settings.defaultEnabled.fixed === 'boolean'
        ? settings.defaultEnabled.fixed
        : true;
    }
    delete settings.defaultEnabled.fixed;
    delete settings.timelineTypes.fixed;
    if (!Number.isFinite(Number(settings.gapMs))) settings.gapMs = DEFAULT_EVENT_GAP_MS;
    return settings;
  }

  function saveEventSettings() {
    if (!currentTrace) return;
    window.ASMTraceEvents?.applyEnabledStates?.(currentTrace);
    window.ASMTracePlayer?.render?.(window.ASMTracePlayer.getCurrentFrame?.() || 0, {
      animateEvents: false,
      animatePositions: false
    });
    window.ASMTraceStudio?.refresh?.();
    window.dispatchEvent(new CustomEvent('asm:trace-event-settings-changed', {
      detail: { document: currentTrace }
    }));
    scheduleAccountEventSettingsSave();
  }

  function renderEventSettings() {
    if (!eventSettingsPanel || !currentTrace) return;
    const settings = ensureEventSettings();
    const list = eventSettingsPanel.querySelector('.trace-event-settings-list');
    const fingerprint = JSON.stringify(cleanEventSettings(settings));
    if (renderedEventSettingsTrace === currentTrace
      && renderedEventSettingsFingerprint === fingerprint
      && list.childElementCount) return;
    list.replaceChildren();
    window.ASMTraceEvents.definitions.filter(definition => definition.category !== 'state').forEach(definition => {
      const row = document.createElement('div');
      row.className = 'trace-event-settings-row';
      const name = document.createElement('strong');
      name.textContent = definition.label;
      name.style.setProperty('--event-color', definition.color);
      const enabled = document.createElement('input');
      enabled.type = 'checkbox';
      enabled.checked = Object.hasOwn(settings.defaultEnabled, definition.type)
        ? settings.defaultEnabled[definition.type]
        : definition.enabledByDefault !== false;
      enabled.title = '新指令預設播放動畫';
      enabled.addEventListener('change', () => {
        settings.defaultEnabled[definition.type] = enabled.checked;
        saveEventSettings();
      });
      const timeline = document.createElement('input');
      timeline.type = 'checkbox';
      timeline.checked = Object.hasOwn(settings.timelineTypes, definition.type)
        ? settings.timelineTypes[definition.type]
        : definition.timelineByDefault === true;
      timeline.title = '顯示在事件時間線';
      timeline.addEventListener('change', () => {
        settings.timelineTypes[definition.type] = timeline.checked;
        saveEventSettings();
      });
      row.append(name, enabled, timeline);
      list.append(row);
    });
    const autoFixed = eventSettingsPanel.querySelector('.trace-auto-fixed-toggle');
    autoFixed.checked = settings.autoFixedEnabled !== false;
    const gap = eventSettingsPanel.querySelector('.trace-event-gap');
    gap.value = String(settings.gapMs);
    gap.title = `間隔時間 ${settings.gapMs} ms`;
    eventSettingsPanel.querySelector('.trace-event-gap-value').textContent = `${settings.gapMs} ms`;
    renderedEventSettingsTrace = currentTrace;
    renderedEventSettingsFingerprint = fingerprint;
  }

  function buildEventSettingsPanel() {
    const panel = document.createElement('section');
    panel.className = 'trace-event-settings-panel';
    panel.hidden = true;
    const head = document.createElement('header');
    head.innerHTML = '<strong>事件設定</strong><span>預設動畫</span><span>列入事件線</span>';
    const list = document.createElement('div');
    list.className = 'trace-event-settings-list';
    const autoFixedRow = document.createElement('label');
    autoFixedRow.className = 'trace-auto-fixed-settings';
    const autoFixedCopy = document.createElement('span');
    const autoFixedTitle = document.createElement('strong');
    autoFixedTitle.textContent = '自動固定';
    const autoFixedHint = document.createElement('small');
    autoFixedHint.textContent = '依本次執行中物件格子的最後使用位置，自動顯示完成標記';
    autoFixedCopy.append(autoFixedTitle, autoFixedHint);
    const autoFixed = document.createElement('input');
    autoFixed.className = 'trace-auto-fixed-toggle';
    autoFixed.type = 'checkbox';
    autoFixed.title = '顯示自動固定格子';
    autoFixed.addEventListener('change', () => {
      ensureEventSettings().autoFixedEnabled = autoFixed.checked;
      saveEventSettings();
    });
    autoFixedRow.append(autoFixedCopy, autoFixed);
    const gapRow = document.createElement('label');
    gapRow.className = 'trace-event-settings-gap';
    gapRow.append(document.createTextNode('間隔時間'));
    const gap = document.createElement('input');
    gap.className = 'trace-event-gap';
    gap.type = 'range';
    gap.min = '0';
    gap.max = '2000';
    gap.step = '10';
    gap.addEventListener('input', () => {
      ensureEventSettings().gapMs = Math.max(0, Math.min(2000, Number(gap.value) || 0));
      gap.value = String(ensureEventSettings().gapMs);
      gap.title = `間隔時間 ${ensureEventSettings().gapMs} ms`;
      gapRow.querySelector('.trace-event-gap-value').textContent = `${ensureEventSettings().gapMs} ms`;
      window.dispatchEvent(new CustomEvent('asm:trace-event-gap-input', {
        detail: { document: currentTrace, gapMs: ensureEventSettings().gapMs }
      }));
    });
    gap.addEventListener('change', saveEventSettings);
    const gapValue = document.createElement('output');
    gapValue.className = 'trace-event-gap-value';
    gapRow.append(gap, gapValue);
    panel.append(head, list, autoFixedRow, gapRow);
    document.body.append(panel);
    return panel;
  }

  async function analyze(code = sourceCode()) {
    const response = await fetch('/trace/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || '無法分析 C++ 程式碼');

    variables = Array.isArray(data.variables) ? data.variables : [];
    frameDirectives = Array.isArray(data.frameDirectives) ? data.frameDirectives : [];
    sliceMode = frameDirectives.length ? 'manual' : 'auto';
    analyzedCode = code;
    return variables;
  }

  function selectedVariables() {
    if (!frameDirectives.length) return variables;
    const directiveIds = new Set(frameDirectives.flatMap(item => item.variableIds || []));
    return variables.filter(variable => directiveIds.has(variable.id));
  }

  async function getCompileConfig(code) {
    if (code !== analyzedCode) await analyze(code);

    const watches = selectedVariables();
    const skins = Object.fromEntries(watches.map(variable => [variable.id, {
      renderer: defaultRenderer(variable),
      options: {
        showIndex: !['scalar', 'string'].includes(variable.kind),
        gap: 0
      }
    }]));

    return {
      enabled: true,
      sliceMode,
      watches: watches.map(variable => variable.id),
      skins,
      rules: currentTrace?.rules || []
    };
  }

  function applyTraceDocument(trace, options = {}) {
    const skins = Object.fromEntries(Object.entries(trace.skins || {}).map(([variableId, skin]) => [variableId, {
      ...skin,
      renderer: originalRendererName(skin?.renderer, trace.variables?.[variableId])
    }]));

    const incomingStudio = trace.studio && Object.keys(trace.studio).length
      ? { ...trace.studio }
      : { ...(currentTrace?.studio || {}) };
    useSavedEventSettings = Boolean(options.preserveEventSettings && incomingStudio.eventSettings);
    if (!useSavedEventSettings) delete incomingStudio.eventSettings;
    currentTrace = window.ASMTraceModel.normalizeTraceDocument({ ...trace, skins, studio: incomingStudio });
    applyAccountEventSettings();
    currentTrace = window.asmApplyTraceDocument(currentTrace);
    mode = 'trace';
    sliceMode = currentTrace.sliceMode === 'manual' ? 'manual' : 'auto';
    updateStudioButton();
    loadAccountEventSettings();
    setTimeout(() => {
      if (embedMode === 'runtime') {
        window.ASMTraceStudio?.close?.();
        return;
      }
      window.ASMTraceStudio?.open(currentTrace);
    }, 0);
    return currentTrace;
  }

  function loadAnimation(animation = {}) {
    animation = window.ASMAlgorithmAnimation.normalize(animation);
    mode = animation.mode === 'trace' || animation.traceDocument ? 'trace' : 'manual';
    sliceMode = animation.sliceMode === 'manual' ? 'manual' : animation.sliceMode === 'full' ? 'full' : 'auto';
    if (animation.traceDocument?.frames?.length) {
      applyTraceDocument({
        ...animation.traceDocument,
        sliceMode: animation.sliceMode || animation.traceDocument.sliceMode,
        skins: animation.skins || animation.traceDocument.skins,
        rules: animation.rules || animation.traceDocument.rules
      }, { preserveEventSettings: true });
    } else {
      currentTrace = null;
      updateStudioButton();
    }
    window.dispatchEvent(new CustomEvent('asm:trace-loaded'));
  }

  function snapshot() {
    const traceVariables = currentTrace?.variables || {};
    const savedTrace = window.ASMTraceViewSource?.compactTraceForSave?.(currentTrace) || currentTrace;
    const watches = Object.entries(traceVariables).map(([id, variable]) => ({
      id,
      name: variable.name,
      cppType: variable.cppType,
      kind: variable.kind
    }));
    return {
      mode,
      sliceMode,
      watches,
      skins: savedTrace?.skins || {},
      rules: savedTrace?.rules || [],
      traceDocument: savedTrace
    };
  }

  function buildUi() {
    studioButton = document.getElementById('editAnimationBtn');
    eventSettingsButton = document.getElementById('eventSettingsBtn');
    if (!studioButton || studioButton.dataset.traceBound) return;
    studioButton.dataset.traceBound = '1';
    studioButton.addEventListener('click', () => {
      if (currentTrace) window.ASMTraceStudio?.open(currentTrace);
    });
    eventSettingsPanel = buildEventSettingsPanel();
    const clearEventSettingsClose = () => {
      clearTimeout(eventSettingsCloseTimer);
      eventSettingsCloseTimer = null;
    };
    const openEventSettings = () => {
      if (!currentTrace) return;
      clearEventSettingsClose();
      eventSettingsPanel.hidden = false;
      renderEventSettings();
      const rect = eventSettingsButton.getBoundingClientRect();
      eventSettingsPanel.style.left = `${Math.max(8, rect.left)}px`;
      eventSettingsPanel.style.top = `${Math.round(rect.bottom)}px`;
    };
    const scheduleEventSettingsClose = () => {
      clearEventSettingsClose();
      eventSettingsCloseTimer = setTimeout(() => {
        if (eventSettingsPanel) eventSettingsPanel.hidden = true;
      }, 140);
    };
    eventSettingsButton?.addEventListener('pointerenter', openEventSettings);
    eventSettingsButton?.addEventListener('pointerleave', scheduleEventSettingsClose);
    eventSettingsPanel.addEventListener('pointerenter', clearEventSettingsClose);
    eventSettingsPanel.addEventListener('pointerleave', scheduleEventSettingsClose);
    eventSettingsButton?.addEventListener('click', event => {
      if (!currentTrace) return;
      event.stopPropagation();
      openEventSettings();
    });
    document.addEventListener('pointerdown', event => {
      if (!eventSettingsPanel || eventSettingsPanel.hidden) return;
      if (eventSettingsPanel.contains(event.target) || eventSettingsButton?.contains(event.target)) return;
      eventSettingsPanel.hidden = true;
    });
    updateStudioButton();
  }

  window.addEventListener('asm:trace-event-settings-changed', event => {
    if (!currentTrace || event.detail?.document !== currentTrace) return;
    accountEventSettings = cleanEventSettings(currentTrace.studio?.eventSettings || { gapMs: DEFAULT_EVENT_GAP_MS });
    scheduleAccountEventSettingsSave();
    if (!eventSettingsPanel?.hidden) renderEventSettings();
  });

  window.addEventListener('asm:auth-changed', () => loadAccountEventSettings(true));

  document.addEventListener('DOMContentLoaded', buildUi);

  window.ASMTraceEditor = {
    isEnabled: () => true,
    setMode: () => { mode = 'trace'; },
    analyze,
    ensureAnalysis: analyze,
    getCompileConfig,
    applyTraceDocument,
    loadAnimation,
    snapshot
  };
})();
