// compile.js
window.asmApplyAnimationScript = function (scriptContent) {
  if (!scriptContent) return;
  if (window.resetArrows) window.resetArrows();
  if (window.resetMessageCounter) window.resetMessageCounter();
  window.eval(scriptContent);
  if (window.CodeScript && window.CodeScript.reset) {
    window.CodeScript.reset();
  }
  if (typeof initFrameInfoFromCodeScript === 'function') {
    initFrameInfoFromCodeScript();
  }
  if (typeof syncCurrentFrameFromCodeScript === 'function') {
    syncCurrentFrameFromCodeScript();
  }
  if (typeof csGetCurrentLine === 'function' && typeof addEditorHighlight === 'function') {
    addEditorHighlight(csGetCurrentLine());
  }
};

// 前端：送 code ＋ input 給 /compile，並更新「輸出」與「debug log」

document.getElementById('runBtn').addEventListener('click', async () => {
  const runBtn = document.getElementById('runBtn');
  let showDebugAfterRun = false;

  // [新增] 防呆：如果已經在 loading (按鈕變暗轉圈中)，就直接忽略這次點擊
  if (runBtn.classList.contains('loading')) return;

  // [新增] 1. 開始 loading 狀態
  runBtn.classList.add('loading');

  const out     = document.getElementById('outputArea');
  const dbg     = document.getElementById('debugArea');
  const inputEl = document.getElementById('inputArea');
  window.ASMAlgorithmDraft?.save?.();

  if (out) out.textContent = '編譯執行中⋯⋯';
  if (dbg) dbg.textContent = '等待 debug 訊息⋯⋯';

  // TLE 門檻（顯示用；實際判定以後端 error 為主）
  const TLE_MS = 5000;

  // 小工具：安全轉字串
  const toStr = (v) => (v === undefined || v === null) ? '' : String(v);

  // 小工具：判定種類（只用後端回來的 data.error / output）
  function judgeResult(data) {
    const err = toStr(data && data.error).trim();
    const outText = toStr(data && data.output);
    const runTime = (data && typeof data.runTime === 'number') ? data.runTime : null;

    const errLower = err.toLowerCase();
    const outLower = outText.toLowerCase();

    // 1) 先用後端 error 字串判定（最準）
    if (errLower.includes('time limit exceeded')) {
      return { kind: 'TLE', message: err || `Time Limit Exceeded (> ${TLE_MS}ms)` };
    }
    if (errLower.includes('output limit exceeded') || outLower.includes('output limit exceeded')) {
      return { kind: 'OLE', message: err || `Output Limit Exceeded` };
    }
    if (errLower.includes('memory limit exceeded') || errLower.includes('bad_alloc')) {
      return { kind: 'MLE', message: err || 'std::bad_alloc' };
    }

    // 2) 如果 error 有內容但不是上面三種 → Runtime Error / Compile Error / 其他
    if (err !== '') {
      return { kind: 'RE', message: err };
    }

    // 3) 後端沒給 error，但跑超過門檻：當成備援 TLE
    if (typeof runTime === 'number' && runTime > TLE_MS) {
      return {
        kind: 'TLE',
        message: `Time Limit Exceeded（執行時間 ${runTime} ms，限制 ${TLE_MS} ms）`
      };
    }

    // 4) 沒錯誤
    return { kind: 'OK', message: '' };
  }

  try {
    const t0 = performance.now();
    const sourceCode = aceEditor.getValue();
    const sourceInput = inputEl ? inputEl.value : '';
    window.ASMSyntaxTree?.refresh?.(sourceCode);
    let traceConfig = { enabled: true, sliceMode: 'auto', watches: [], skins: {}, rules: [] };
    let traceAnalyzeWarning = '';
    try {
      traceConfig = window.ASMTraceEditor
        ? await window.ASMTraceEditor.getCompileConfig(sourceCode)
        : traceConfig;
    } catch (error) {
      // Keep normal execution available when source analysis cannot understand
      // a valid C++ construct. The compiler remains the source of truth.
      traceConfig = { enabled: false };
      traceAnalyzeWarning = `追蹤分析未完成，先使用一般執行：${error.message}`;
      showDebugAfterRun = true;
    }

    const res = await fetch('/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: sourceCode,                         // 保留原本欄位名 code
        input: sourceInput,                      // stdin captured with this RUN
        trace: traceConfig
      })
    });

    const t1 = performance.now();
    const totalMs = (t1 - t0).toFixed(1);

    let data = {};
    try {
      data = await res.json();
    } catch (e) {
      if (out) out.textContent = '伺服器回傳格式錯誤（非 JSON）';
      if (dbg) dbg.textContent = '無法解析伺服器回傳的 JSON。';
      throw e;
    }

    const compileTime = data.compileTime;
    const runTime     = data.runTime;
    const memoryKB    = data.memoryKB;
    const debug_log   = data.debug_log;
    const traceWarning = [traceAnalyzeWarning, data.traceWarning].filter(Boolean).join('\n');
    if (traceWarning) showDebugAfterRun = true;

    // 統一判定（TLE / OLE / MLE / RE / OK）
    const judge = judgeResult(data);

    // === 顯示輸出（重點：TLE 也要顯示已產生的 output） ===
    const rawOutput = (data.output || '').toString();
    const hasOutput = rawOutput.trim() !== '';

    if (out) {
      let display = '';

      // 1. 若有錯誤（TLE/OLE/MLE/RE），把錯誤訊息附加在後面（不要覆蓋掉 output）
      if (judge.kind !== 'OK') {
        const msg = (judge.message || '').trim();
        display += (msg !== '' ? msg : judge.kind);
        display += `\n`;
      }

      // 2. 放已輸出內容（就算錯誤也保留）
      if (hasOutput) {
        display += rawOutput;
      } else {
        display += '(程式沒有任何輸出)';
      }

      out.textContent = display;
    }

    // === 顯示 debug log ===
    if (dbg) {
      let header = '=== 編譯 / 執行統計資訊 ===\n';
      if (compileTime !== undefined && compileTime !== null) {
        header += `編譯時間：${compileTime} ms\n`;
      }
      if (runTime !== undefined && runTime !== null) {
        header += `執行時間：${runTime} ms\n`;
      }
      if (memoryKB !== undefined && memoryKB !== null) {
        header += `記憶體使用：${memoryKB} KB\n`;
      }
      header += `前端整體耗時（含請求）：約 ${totalMs} ms\n`;

      // 在 debug 區塊顯示判定結果
      if (judge.kind !== 'OK') {
        if (judge.message) header += `\n${judge.message}\n`;
      }

      header += '\n';
      if (traceWarning) header += `${traceWarning}\n`;
      dbg.textContent = header;

      if (Array.isArray(debug_log) && debug_log.length > 0) {
        dbg.textContent += '=== Debug Log ===\n';
        debug_log.forEach(entry => {
          const time = entry.time || '';
          const msg  = entry.msg  || '';
          dbg.textContent += `[${time}] ${msg}\n`;
        });
      } else {
        dbg.textContent += '（沒有收到任何 debug 訊息）';
      }
    }

    // 3. Trace mode returns data; legacy mode returns an animation script.
    if (data.traceDocument) {
      try {
        const traceDocument = window.ASMTraceEditor
          ? window.ASMTraceEditor.applyTraceDocument(data.traceDocument)
          : window.asmApplyTraceDocument(data.traceDocument);
        const traceSettings = window.ASMTraceEditor?.snapshot?.() || {};
        const savedTraceDocument = traceSettings.traceDocument || traceDocument;
        window.dispatchEvent(new CustomEvent('asm:compiled-animation', {
          detail: {
            mode: 'trace',
            code: sourceCode,
            input: sourceInput,
            sliceMode: traceSettings.sliceMode || traceDocument?.sliceMode || 'auto',
            watches: traceSettings.watches || [],
            skins: savedTraceDocument?.skins || traceSettings.skins || {},
            rules: savedTraceDocument?.rules || traceSettings.rules || [],
            traceDocument: savedTraceDocument
          }
        }));
      } catch (e) {
        console.error('Failed to render trace:', e);
        if (dbg) dbg.textContent += '\n[Trace] Failed to render trace: ' + e.message;
        showDebugAfterRun = true;
      }
    } else if (data.scriptContent) {
      try {
        window.asmApplyAnimationScript(data.scriptContent);
        window.dispatchEvent(new CustomEvent('asm:compiled-animation', {
          detail: {
            mode: 'legacy',
            code: sourceCode,
            input: sourceInput,
            scriptContent: data.scriptContent
          }
        }));
      } catch (e) {
        console.error("動畫腳本執行失敗:", e);
        if (dbg) dbg.textContent += '\n[前端錯誤] 動畫腳本執行失敗: ' + e.message;
      }
    }

  } catch (err) {
    console.log(err);
    if (out) out.textContent = 'Request 失敗：\n' + err;
    if (dbg) dbg.textContent = 'Request 失敗，請確認伺服器是否有啟動。';
    showDebugAfterRun = true;
  } finally {
    // [新增] 2. 結束 loading 狀態（無論成功或失敗都會執行）
    // 讓按鈕恢復可點擊、顏色恢復、轉圈圈消失
    runBtn.classList.remove('loading');
  }

  // 追蹤失敗時優先讓使用者看到原因；正常執行則維持輸出分頁。
  const btn = document.querySelector(
    `.tab-btn[data-tab="${showDebugAfterRun ? 'tab-debug' : 'tab-output'}"]:not([style*="display: none"])`
  );
  if (btn) activateTab(btn);
});
