(function () {
  let timer;
  const fallbackMessages = {
    empty: '動畫尚未更新，請先 RUN。',
    current: '動畫已更新。',
    dirty: '程式或輸入已修改，動畫尚未更新。請重新 RUN。',
    outdated: '動畫資料版本過舊，請重新 RUN。'
  };

  function refresh() {
    const indicator = document.getElementById('traceFreshnessNotice');
    if (!indicator) return;
    const trace = window.ASMTraceEditor?.snapshot?.().traceDocument;
    const code = typeof aceEditor !== 'undefined' ? aceEditor.getValue() : '';
    const input = document.getElementById('inputArea')?.value || '';
    const status = window.ASMTraceProvenance.status(trace, code, input);
    const kind = ['current', 'dirty', 'outdated'].includes(status.kind)
      ? status.kind
      : 'empty';
    const message = status.message || fallbackMessages[kind];
    indicator.textContent = '';
    indicator.dataset.status = kind;
    indicator.title = message;
    indicator.setAttribute('aria-label', `動畫狀態：${message}`);
    indicator.hidden = false;
  }
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(refresh, 120);
  }
  document.addEventListener('DOMContentLoaded', () => {
    if (typeof aceEditor !== 'undefined') aceEditor.session.on('change', schedule);
    document.getElementById('inputArea')?.addEventListener('input', schedule);
    refresh();
  });
  window.addEventListener('asm:trace-loaded', schedule);
  window.addEventListener('asm:compiled-animation', schedule);
  window.ASMTraceFreshness = { refresh };
})();
