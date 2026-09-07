(function () {
  const clone = value => JSON.parse(JSON.stringify(value));

  // The saved trace is the playback source of truth. Top-level copies are
  // retained for older decks, but must not overwrite the trace's live settings.
  function normalize(animation = {}) {
    const traceDocument = animation.traceDocument && typeof animation.traceDocument === 'object'
      ? clone(animation.traceDocument) : null;
    const hasTrace = Boolean(traceDocument?.frames?.length);
    // Decks store the already-edited runtime document, including older decks
    // written before this marker existed. Its original source view is stale.
    if (hasTrace) {
      traceDocument.viewSettingsApplied = true;
      // Older saved decks kept the generation source next to the trace. Make
      // it available to the shared code presenter without changing the saved
      // animation format or reading the live editor draft.
      if (!traceDocument.sourceCode && typeof animation.code === 'string') {
        traceDocument.sourceCode = animation.code;
      }
    }
    const sliceMode = traceDocument?.sliceMode || animation.sliceMode;
    const skins = traceDocument?.skins ?? animation.skins;
    const rules = traceDocument?.rules ?? animation.rules;
    return {
      mode: hasTrace || animation.mode === 'trace' ? 'trace' : 'legacy',
      code: typeof animation.code === 'string' ? animation.code : '',
      input: typeof animation.input === 'string' ? animation.input : '',
      scriptContent: !hasTrace && typeof animation.scriptContent === 'string' ? animation.scriptContent : '',
      sliceMode: ['manual', 'full'].includes(sliceMode) ? sliceMode : 'auto',
      watches: Array.isArray(animation.watches) ? clone(animation.watches) : [],
      skins: skins && typeof skins === 'object' ? clone(skins) : {},
      rules: Array.isArray(rules) ? clone(rules) : [],
      traceDocument
    };
  }

  window.ASMAlgorithmAnimation = { normalize };
})();
