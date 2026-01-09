// compile.js
// 前端：送 code ＋ input 給 /compile，並更新「輸出」與「debug log」

document.getElementById('runBtn').addEventListener('click', async () => {
  const out     = document.getElementById('outputArea');
  const dbg     = document.getElementById('debugArea');
  const inputEl = document.getElementById('inputArea');

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

    const res = await fetch('/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: aceEditor.getValue(),              // 保留原本欄位名 code
        input: inputEl ? inputEl.value : ''      // stdin
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

    // 3. 處理後端直接回傳的動畫腳本 (Concurrency Fix)
    if (data.scriptContent) {
      try {
        // (A) 使用 window.eval 確保在全域執行 (建立 CodeScript 物件)
        window.eval(data.scriptContent);

        // (B) 重置動畫狀態
        if (window.CodeScript && window.CodeScript.reset) {
          window.CodeScript.reset();
        }

        // (C) 呼叫 front.js 的函式來更新介面 (幀條碼、總幀數)
        // 這些函式原本是在 reloadAfterRun 裡呼叫的
        if (typeof initFrameInfoFromCodeScript === 'function') {
           initFrameInfoFromCodeScript();
        }
        if (typeof syncCurrentFrameFromCodeScript === 'function') {
           syncCurrentFrameFromCodeScript();
        }
        
        // (D) 高亮第一行程式碼
        if (typeof csGetCurrentLine === 'function' && typeof addEditorHighlight === 'function') {
           addEditorHighlight(csGetCurrentLine());
        }

      } catch (e) {
        console.error("動畫腳本執行失敗:", e);
        if (dbg) dbg.textContent += '\n[前端錯誤] 動畫腳本執行失敗: ' + e.message;
      }
    }

  } catch (err) {
    console.log(err);
    if (out) out.textContent = 'Request 失敗：\n' + err;
    if (dbg) dbg.textContent = 'Request 失敗，請確認伺服器是否有啟動。';
  }

  // 執行完自動切到「輸出」分頁
  const btn = document.querySelector(
    '.tab-btn[data-tab="tab-output"]:not([style*="display: none"])'
  );
  if (btn) activateTab(btn);
  /*
  // 重載動畫（重新載入 public/code_script.js）
  if (window.reloadAfterRun)
    window.reloadAfterRun();
  else
    reloadCodeScript();
  */
});
