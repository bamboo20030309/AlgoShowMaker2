(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ASMTraceProvenance = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // Bump ENGINE_VERSION when newly generated events/state require a new RUN.
  // Renderer-only improvements do not invalidate saved trace data.
  const ENGINE_VERSION = 1;
  const FORMAT_VERSION = 1;
  const text = value => String(value ?? '').replace(/\r\n?/g, '\n');
  function sourceText(code) {
    // Only the trailing Studio settings block is non-executable metadata.
    const source = text(code);
    const block = /\/\*\s*@asm-view\s*\n[\s\S]*?\n\s*@asm-view\s*\*\//.exec(source);
    return block && !source.slice(block.index + block[0].length).trim()
      ? source.slice(0, block.index).trimEnd() : source.trimEnd();
  }
  function fingerprint(value) {
    // Change detector, not a security/integrity hash.
    let a = 2166136261, b = 5381;
    for (const character of value) {
      const n = character.codePointAt(0);
      a = Math.imul(a ^ n, 16777619);
      b = Math.imul(b, 33) ^ n;
    }
    return [value.length, a >>> 0, b >>> 0].join(':');
  }
  function create(code, input) {
    return { engineVersion: ENGINE_VERSION, formatVersion: FORMAT_VERSION,
      sourceFingerprint: fingerprint(sourceText(code)), inputFingerprint: fingerprint(String(input ?? '')) };
  }
  function status(trace, code, input) {
    if (!trace?.frames?.length) return { kind: 'empty', message: '' };
    const saved = trace.provenance;
    const current = create(code, input);
    if (saved?.sourceFingerprint && saved?.inputFingerprint &&
        (saved.sourceFingerprint !== current.sourceFingerprint || saved.inputFingerprint !== current.inputFingerprint)) {
      return { kind: 'dirty', message: '程式或輸入已修改，動畫尚未更新。請 RUN 後再儲存；目前播放的是上次執行結果。' };
    }
    if (!saved || saved.engineVersion !== ENGINE_VERSION || saved.formatVersion !== FORMAT_VERSION ||
        trace.schemaVersion !== '1.0' || !saved.sourceFingerprint || !saved.inputFingerprint) {
      return { kind: 'outdated', message: '動畫資料版本過舊或無法確認相容性。請在編輯器重新 RUN 後儲存；目前仍保留原動畫。' };
    }
    return { kind: 'current', message: '' };
  }
  return { ENGINE_VERSION, FORMAT_VERSION, create, status, sourceText };
});
