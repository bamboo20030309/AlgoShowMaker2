// front.js
// 前端其餘互動：Ace 初始化、標籤切換、重載 script、動畫控制、分割線拖曳

/**
 * 設定佈局的 Meta 資訊（邊界、屬性等）
 * @param {string} groupID 
 * @param {object} meta 
 */
window.setLayoutMeta = function (groupID, meta) {
  const vp = window.getViewport();
  if (!vp) return;
  let g = vp.querySelector('#' + CSS.escape(groupID));
  if (!g) {
    g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('id', groupID);
    g.classList.add('layout-meta-object');
    vp.appendChild(g);
  }

  if (meta.layout) g.setAttribute('data-layout', meta.layout);
  if (meta.minX !== undefined) g.setAttribute('data-outerframe-left', meta.minX);
  if (meta.maxX !== undefined) g.setAttribute('data-outerframe-right', meta.maxX);
  if (meta.minY !== undefined) g.setAttribute('data-outerframe-top', meta.minY);
  if (meta.maxY !== undefined) g.setAttribute('data-outerframe-bottom', meta.maxY);

  // 設置一個基準偏移量（通常為 0,0，因為 meta 座標已經包含相對偏移）
  if (!g.hasAttribute('data-base-offset')) {
    g.setAttribute('data-base-offset', '0,0');
    g.setAttribute('data-translate', '0,0');
  }
};

// 全域：TTS 是否開聲音（false=靜音，只做默默自動播放）
let TTS_ENABLED = false;

// 全域：目前這一輪 TTS 播放的「世代編號」
// 每次按播放就 +1，pause 時也 +1 讓舊 callback 全失效
let TTS_RUN_ID = 0;
let TTS_HIGHLIGHT_REQUEST = 0;


// 初始化 Ace
const aceEditor = ace.edit("editor");
aceEditor.setTheme("ace/theme/monokai");
aceEditor.session.setMode("ace/mode/c_cpp");
aceEditor.setOptions({
  fontSize: "14pt",
  wrap: true,
  showPrintMargin: false
});

// 保留目前正在編輯的程式碼，避免重新整理後被預設範例覆蓋。
const ALGORITHM_DRAFT_STORAGE_VERSION = 2;
const ALGORITHM_DRAFT_SAVE_DELAY = 450;
const algorithmDraftMode = new URLSearchParams(window.location.search).get('asmEmbed') || 'standalone';
const ALGORITHM_DRAFT_STORAGE_KEY = `asm_algorithm_draft_v${ALGORITHM_DRAFT_STORAGE_VERSION}:${algorithmDraftMode}`;
let algorithmDraftSaveTimer = null;
let algorithmDraftRestored = false;
let algorithmDraftApplying = false;
let algorithmEditorChangedSinceStartup = false;

function readAlgorithmDraft() {
  try {
    const raw = localStorage.getItem(ALGORITHM_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (draft?.version !== ALGORITHM_DRAFT_STORAGE_VERSION || typeof draft.code !== 'string') return null;
    return draft;
  } catch (error) {
    console.warn('無法讀取演算法草稿', error);
    return null;
  }
}

function saveAlgorithmDraft() {
  clearTimeout(algorithmDraftSaveTimer);
  algorithmDraftSaveTimer = null;
  const code = aceEditor.getValue();
  const input = document.getElementById('inputArea')?.value || '';
  if (code.trim() === '// 讀取中...') return false;
  try {
    const cursor = aceEditor.getCursorPosition();
    localStorage.setItem(ALGORITHM_DRAFT_STORAGE_KEY, JSON.stringify({
      version: ALGORITHM_DRAFT_STORAGE_VERSION,
      code,
      input,
      cursor: { row: cursor.row, column: cursor.column },
      scrollTop: aceEditor.session.getScrollTop(),
      updatedAt: Date.now()
    }));
    return true;
  } catch (error) {
    console.warn('無法暫存演算法草稿', error);
    return false;
  }
}

function scheduleAlgorithmDraftSave(editorChanged = false) {
  if (algorithmDraftApplying) return;
  if (editorChanged) algorithmEditorChangedSinceStartup = true;
  clearTimeout(algorithmDraftSaveTimer);
  algorithmDraftSaveTimer = setTimeout(saveAlgorithmDraft, ALGORITHM_DRAFT_SAVE_DELAY);
}

function restoreAlgorithmDraft() {
  const draft = readAlgorithmDraft();
  if (!draft) return false;
  algorithmDraftApplying = true;
  aceEditor.setValue(draft.code, -1);
  if (draft.cursor && Number.isInteger(draft.cursor.row) && Number.isInteger(draft.cursor.column)) {
    aceEditor.moveCursorTo(draft.cursor.row, draft.cursor.column);
    aceEditor.clearSelection();
  }
  if (Number.isFinite(draft.scrollTop)) aceEditor.session.setScrollTop(draft.scrollTop);
  const inputArea = document.getElementById('inputArea');
  if (inputArea && typeof draft.input === 'string') inputArea.value = draft.input;
  algorithmDraftApplying = false;
  algorithmDraftRestored = true;
  return true;
}

aceEditor.session.on('change', () => scheduleAlgorithmDraftSave(true));
restoreAlgorithmDraft();
window.addEventListener('pagehide', saveAlgorithmDraft);
window.addEventListener('beforeunload', saveAlgorithmDraft);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveAlgorithmDraft();
});
window.ASMAlgorithmDraft = {
  save: saveAlgorithmDraft,
  restored: () => algorithmDraftRestored
};

window.asmGetSourceCode = () => aceEditor.getValue();
window.asmEnsureFrameDirectiveName = function (lineNumber, requestedName) {
  const row = Math.max(0, Number(lineNumber) - 1);
  const session = aceEditor.getSession();
  const line = session.getLine(row);
  const existing = line.match(/^\s*\/\/\s*([A-Za-z_][A-Za-z0-9_.-]*)\s*:\s*@frame\b/);
  if (existing) return existing[1];
  if (!/^\s*\/\/\s*@frame\b/.test(line)) return '';
  const used = new Set([...aceEditor.getValue().matchAll(/^\s*\/\/\s*([A-Za-z_][A-Za-z0-9_.-]*)\s*:\s*@frame\b/gm)]
    .map(match => match[1]));
  const base = String(requestedName || `view.${row + 1}`).replace(/[^A-Za-z0-9_.-]/g, '-') || `view.${row + 1}`;
  let name = base;
  let suffix = 2;
  while (used.has(name)) name = `${base}.${suffix++}`;
  const next = line.replace(/^(\s*\/\/\s*)@frame\b/, `$1${name}: @frame`);
  session.replace(new Range(row, 0, row, line.length), next);
  return name;
};
window.asmWriteViewSettings = function (settings) {
  if (!window.ASMTraceViewSource?.upsert) return false;
  const source = aceEditor.getValue();
  const next = window.ASMTraceViewSource.upsert(source, settings);
  if (next === source) return false;
  const oldBlock = window.ASMTraceViewSource.findBlock(source);
  const newBlock = window.ASMTraceViewSource.findBlock(next);
  const session = aceEditor.getSession();
  const document = session.getDocument();
  const selection = aceEditor.getSelectionRange();
  const scrollTop = session.getScrollTop();
  if (oldBlock && newBlock) {
    const start = document.indexToPosition(oldBlock.start, 0);
    const end = document.indexToPosition(oldBlock.end, 0);
    session.replace(new Range(start.row, start.column, end.row, end.column), newBlock.text);
  } else {
    const end = document.indexToPosition(source.length, 0);
    const separator = !source ? '' : source.endsWith('\n\n') ? '' : source.endsWith('\n') ? '\n' : '\n\n';
    session.insert(end, `${separator}${newBlock.text}\n`);
  }
  aceEditor.selection.setSelectionRange(selection, false);
  session.setScrollTop(scrollTop);
  return true;
};

window.asmUpdateTextDirectiveBinding = function (lineNumber, binding) {
  const session = aceEditor.getSession();
  const requestedRow = Math.max(0, Number(lineNumber) - 1);
  const isTextDirective = line => /^\s*\/\/\s*@text\b/i.test(line);
  let row = requestedRow;
  let line = session.getLine(row);
  if (!isTextDirective(line)) {
    const candidates = [];
    for (let index = 0; index < session.getLength(); index += 1) {
      if (isTextDirective(session.getLine(index))) candidates.push(index);
    }
    if (!candidates.length) return false;
    row = candidates.sort((left, right) => (
      Math.abs(left - requestedRow) - Math.abs(right - requestedRow)
    ))[0];
    line = session.getLine(row);
  }
  const atPattern = /\s+at\s+.+?\.(?:top-left|top|top-right|left|center|right|bottom-left|bottom|bottom-right)(?=\s+(?:offset|as|when)\b|\s*$)/i;
  const offsetPattern = /\s+offset\s*\(\s*[+-]?(?:\d+(?:\.\d+)?|\.\d+)\s*,\s*[+-]?(?:\d+(?:\.\d+)?|\.\d+)\s*\)(?=\s+(?:at|as|when)\b|\s*$)/i;
  let next = line.replace(atPattern, '').replace(offsetPattern, '');
  if (binding?.targetExpression && binding?.anchor) {
    const offsetX = Number(binding.offsetX) || 0;
    const offsetY = Number(binding.offsetY) || 0;
    const offset = offsetX || offsetY ? ` offset(${offsetX},${offsetY})` : '';
    const modifier = ` at ${binding.targetExpression}.${String(binding.anchor).replace(/\s+/g, '-').toLowerCase()}${offset}`;
    const aliasIndex = next.search(/\s+as\s+[A-Za-z_][A-Za-z0-9_.-]*\s*$/i);
    next = aliasIndex >= 0
      ? `${next.slice(0, aliasIndex).trimEnd()}${modifier}${next.slice(aliasIndex)}`
      : `${next.trimEnd()}${modifier}`;
  }
  if (next === line) return false;
  session.replace(new Range(row, 0, row, line.length), next);
  return true;
};

// ====== 專門摺疊 //draw{ ... //} 區塊 ======
const Range = ace.require("ace/range").Range;

/**
 * 掃描整個文件，找到所有 //draw{ ... //} 的區塊
 * 回傳每一塊對應的 Range 陣列
 */
function getDrawBlocks(session) {
  const doc = session.getDocument();
  const lineCount = doc.getLength();
  const blocks = [];

  const startMarker = "//draw{";
  const endMarker = "//}";

  for (let i = 0; i < lineCount; i++) {
    const line = doc.getLine(i);
    const startIdx = line.indexOf(startMarker);
    if (startIdx !== -1) {
      const startRow = i;
      const startCol = startIdx + startMarker.length;  // 從 { 之後開始折疊

      let endRow = null;
      let endCol = null;

      // 往下找到最近的 //}
      for (let j = i + 1; j < lineCount; j++) {
        const line2 = doc.getLine(j);
        const endIdx = line2.indexOf(endMarker);
        if (endIdx !== -1) {
          endRow = j;
          // line2: "//}"，index: 0:'/', 1:'/', 2:'}'
          // 我們只把 "//" 收進 fold，保留最後的 '}'。
          const bracePos = endIdx + endMarker.length - 1; // '}' 的 index
          endCol = bracePos;  // Range 的 endCol 是「不包含」，所以剛好只吃到 "//"
          break;
        }
      }

      if (endRow === null) {
        // 保險：沒找到 //} 就折到檔案最後
        endRow = lineCount - 1;
        endCol = doc.getLine(endRow).length;
      }

      blocks.push(new Range(startRow, startCol, endRow, endCol));
      i = endRow; // 跳過這一段，避免重複掃描
    }
  }

  return blocks;
}



/**
 * 把所有 //draw{ ... //} 區塊摺疊起來
 */
function updateDrawBlocksUi() {
  const btn = document.getElementById('toggleDrawBlocksBtn');
  if (btn) {
    btn.textContent = isFold ? "展開 draw" : "摺疊 draw";
    btn.classList.toggle("active", isFold);
    btn.dataset.foldCount = String(aceEditor.getSession().getAllFolds().length);
  }
  const menuBtn = document.getElementById('menuToggleFold');
  if (menuBtn) menuBtn.textContent = isFold ? "展開 draw 區塊" : "摺疊 draw 區塊";
}

function foldDrawBlocks() {
  const session = aceEditor.getSession();
  session.getAllFolds().forEach(fold => session.removeFold(fold));
  const blocks = getDrawBlocks(session);
  blocks.forEach(range => {
    const placeholder = "<->";
    session.addFold(placeholder, range);
  });
  isFold = blocks.length > 0;
  updateDrawBlocksUi();
}


/**
 * 把所有 //draw{ ... //} 區塊展開
 */
function unfoldDrawBlocks() {
  const session = aceEditor.getSession();
  const folds = session.getAllFolds();
  folds.forEach(f => session.removeFold(f));
  isFold = false;
  updateDrawBlocksUi();
}

/**
 * 切換：有摺疊就全部展開，沒有就全部摺疊
 *（給 HTML 的按鈕 onclick 用）
 */
let isFold = false;
function toggleDrawBlocks() {
  const session = aceEditor.getSession();
  if (session.getAllFolds().length > 0) {
    unfoldDrawBlocks();
    return;
  }
  if (!getDrawBlocks(session).length) {
    updateDrawBlocksUi();
    if (typeof showToast === 'function') showToast("找不到 //draw{ ... //} 區塊", "warning");
    return;
  }
  foldDrawBlocks();
}


// ====== 多個高亮控制 API ======

// 用來記錄「所有自訂的高亮」： key = markerId, value = { lineNum, range }
let editorMarkers = {};

// 去除同一行位置的重複 marker DOM 元素，確保每個 top 位置只保留一個可見元素
function deduplicateMarkerLayer() {
  const layer = aceEditor && aceEditor.container && aceEditor.container.querySelector('.ace_marker-layer');
  if (!layer) return;
  const els = layer.querySelectorAll('.code-highlight-line');
  const seen = new Set();
  els.forEach(el => {
    const top = el.style.top;
    if (seen.has(top)) {
      el.style.visibility = 'hidden';
    } else {
      seen.add(top);
      el.style.visibility = '';
    }
  });
}

// 用 MutationObserver 持續監控 marker layer，每次 ACE 重繪時自動去重
let _markerObserver = null;
function initMarkerObserver() {
  if (_markerObserver) return;
  const layer = aceEditor && aceEditor.container && aceEditor.container.querySelector('.ace_marker-layer');
  if (!layer) return;
  _markerObserver = new MutationObserver(() => deduplicateMarkerLayer());
  _markerObserver.observe(layer, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
}

let manualHighlightSet = false;

/**
 * 新增一個高亮，回傳該高亮的 markerId（你之後可以用來刪除）
 * @param {number} lineNum - 程式碼行號 (1-based)
 * @param {boolean} isManual - 是否為手動加入 (若是手動，則自動忽略一般加入並清除之前的)
 * @returns {number|null} markerId
 */
function addEditorHighlight(lineNum, isManual = false) {
  if (!lineNum || lineNum < 1) return null;

  if (isManual) {
    if (!manualHighlightSet) {
      clearAllEditorHighlights();
      manualHighlightSet = true;
    }
  } else {
    if (manualHighlightSet) return null;
  }

  // 同一行若已有 marker，直接回傳现有的 markerId，不重複疊加
  for (const [idStr, info] of Object.entries(editorMarkers)) {
    if (info.lineNum === lineNum) return Number(idStr);
  }

  const session = aceEditor.getSession();
  const row = lineNum - 1;
  const range = new Range(row, 0, row, Infinity);

  const markerId = session.addMarker(range, "code-highlight-line", "fullLine");
  editorMarkers[markerId] = { lineNum, range };

  // ACE 的 fullLine marker 會在 DOM 裡建立兩個元素（各層各一），
  // 造成同一行兩層半透明疊加。在 rAF 後掃描，同 top 位置只保留第一個，其餘隱藏。
  requestAnimationFrame(() => {
    const markerEls = aceEditor.container.querySelectorAll('.ace_marker-layer .code-highlight-line');
    const seenTops = new Set();
    markerEls.forEach(el => {
      const top = el.style.top;
      if (seenTops.has(top)) {
        el.style.visibility = 'hidden'; // 把多餘的疊層隱藏
      } else {
        seenTops.add(top);
        el.style.visibility = '';       // 確保第一個是可見的
      }
    });
  });

  return markerId;
}

/**
 * 一次高亮多行，回傳所有 markerId 的陣列
 * @param {number[]} lineNums - 行號陣列 (1-based)
 * @returns {number[]} markerIds
 */
function addEditorHighlights(lineNums) {
  if (!Array.isArray(lineNums)) return [];

  const ids = [];
  for (const lineNum of lineNums) {
    const id = addEditorHighlight(lineNum);
    if (id !== null) ids.push(id);
  }
  return ids;
}

/**
 * 移除指定的高亮
 * @param {number} markerId - addEditorHighlight 回傳的 id
 */
function removeEditorHighlight(markerId) {
  if (markerId === null || markerId === undefined) return;

  const session = aceEditor.getSession();
  session.removeMarker(markerId);
  delete editorMarkers[markerId];
}

/**
 * 移除目前所有「自訂」的高亮
 * （不會動到 currentMarkerId，那個還是給你原本的單一高亮用）
 */
function clearAllEditorHighlights() {
  manualHighlightSet = false;
  const session = aceEditor.getSession();
  for (const idStr of Object.keys(editorMarkers)) {
    const id = Number(idStr);
    session.removeMarker(id);
  }
  editorMarkers = {};
}

// 點一下左邊行號(gutter)就讓高光消失
aceEditor.on("click", function (e) {
  clearAllEditorHighlights();
});


// 封裝一個從 CodeScript 取得行號的函式
function csGetCurrentLine() {
  if (typeof CodeScript === "undefined") return 0;
  // 假設你的 CodeScript 有這個方法
  if (typeof CodeScript.get_current_line === "function") {
    return CodeScript.get_current_line();
  }
  return 0;
}


// ====== 注入初始程式碼：從 sample_code.cpp 讀取並貼到 Editor ======
fetch('sample_code.cpp')
  .then(response => {
    if (!response.ok) throw new Error('無法讀取 sample_code.cpp');
    return response.text();
  })
  .then(code => {
    if (window.__asmEmbeddedAnimationPayload || algorithmDraftRestored || algorithmEditorChangedSinceStartup) return;
    aceEditor.setValue(code, -1);
    // 一載入就自動把 //draw 區塊摺疊起來
    setTimeout(foldDrawBlocks, 0);
  })
  .catch(err => {
    console.error(err);
    if (window.__asmEmbeddedAnimationPayload || algorithmDraftRestored || algorithmEditorChangedSinceStartup) return;
    // 若讀檔失敗，再 fallback 回原本的初始範例
    const fallbackCode = `#include <bits/stdc++.h>
#include "AV.hpp"
using namespace std;
AV av;
int main() {
    vector<int> num={0};
    av.start_draw();
    for (int i = 0; i < 20; i++) {
        num.push_back(i+1);
        av.start_frame_draw();
        av.frame_draw("num", Pos(0,0), num, {{{"highlight"},{i}}, {{"focus"},{i}}, {{"point"},{i}}, {{"mark"},{i}}, {{"background"},{i}}}, {0},  "normal", 0, 1);
        av.frame_draw("heap", Pos("num","raw bottom-left",0,100), num, {{{"highlight"},{i-1}}, {{"focus"},{i-1}}, {{"point"},{i-1}}, {{"mark"},{i-1}}, {{"background"},{i-1}}}, {0},  "heap", 10, 1);
        av.frame_draw("BIT", Pos("heap","raw bottom-left",0,100), num, {{{"highlight"},{i-1}}, {{"focus"},{i-1}}, {{"point"},{i-1}}, {{"mark"},{i-1}}, {{"background"},{i-1}}}, {0},  "BIT", 10, 1);
        av.arrow( Pos("num","bottom"), Pos("heap","top"), {{"color","black"},{"width","3"}});
        av.arrow( Pos("num",i+1), Pos("BIT",i));
        if(i==3 || i==7 || i==13) {
            av.key_frame_draw("num", Pos(0,0), num, {{{"mark"},AV::AtoB(0,i)}, {{"highlight"},{i}}, {{"point"},{i}}, {{"focus"},{i}}, {{"background"},{i}}}, {0},  "normal", 0, 1);
            av.key_frame_draw("heap", Pos("num","raw bottom-left",0,100), num, {{{"mark"},AV::AtoB(0,i)}, {{"highlight"},{i-1}}, {{"point"},{i-1}}, {{"focus"},{i-1}}, {{"background"},{i-1}}}, {0},  "heap", 10, 1);
            av.key_frame_draw("BIT", Pos("heap","raw bottom-left",0,100), num, {{{"mark"},AV::AtoB(0,i)}, {{"highlight"},{i-1}}, {{"point"},{i-1}}, {{"focus"},{i-1}}, {{"background"},{i-1}}}, {0},  "BIT", 10, 1);
        }
        av.auto_camera();
        av.end_frame_draw();
    }
    av.end_draw();
    return 0;
}`;
    aceEditor.setValue(fallbackCode, -1);
    // fallback 也一樣一開始就摺疊
    setTimeout(foldDrawBlocks, 0);
  });



// 子標籤切換
function activateTab(btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.subContent').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(btn.dataset.tab).classList.add('active');
}
document.querySelectorAll('.tab-btn').forEach(btn =>
  btn.addEventListener('click', () => {
    activateTab(btn);
    // 切換到畫布 Tab 時，SVG 剛從隱藏狀態恢復，需重新計算並對齊鏡頭
    if (btn.dataset.tab === 'tab-canvas') {
      requestAnimationFrame(() => {
        if (window.setAutoCamera) window.setAutoCamera(1.0, false);
      });
    }
    if (btn.dataset.tab === 'tab-syntax-tree') {
      window.ASMSyntaxTree?.ensureCurrent?.(aceEditor.getValue());
    }
  })
);
document.querySelectorAll('.close-subtab').forEach(btn =>
  btn.addEventListener('click', () => {
    const tgt = btn.dataset.target;
    document.getElementById(tgt).classList.remove('active');
    btn.closest('.subTab').style.display = 'none';
    if (!document.querySelector('.tab-btn.active')) {
      const first = document.querySelector('.subTab:not([style*="display: none"]) .tab-btn');
      if (first) activateTab(first);
    }
  })
);

// 重新載入 code_script.js 並重畫
function reloadCodeScript(onReady) {
  document.querySelectorAll('g.draggable-object').forEach(g => g.remove());
  if (window.resetCameraState) window.resetCameraState();
  const prev = document.querySelector('script[data-role="code_script"]');
  if (prev) prev.remove();
  const s = document.createElement('script');
  s.src = 'code_script.js?ts=' + Date.now();
  s.setAttribute('data-role', 'code_script');
  s.onload = () => {
    if (window.CodeScript?.reset) window.CodeScript.reset();
    // CodeScript 準備好後再呼叫 callback
    if (typeof onReady === 'function') onReady();
  };
  document.body.appendChild(s);
}


// ==============================
// 影格 DOM Snapshot 快取系統
// ==============================
const FrameSnapshotCache = (() => {
  const SNAP_INTERVAL = 10;
  const snapshots = new Map();   // key: frameIdx, value: [clonedNode...]

  /** 捕捉當前畫布快照（只在 frameIdx 為 SNAP_INTERVAL 的倍數時執行） */
  function capture(frameIdx) {
    if (frameIdx % SNAP_INTERVAL !== 0) return;
    if (snapshots.has(frameIdx)) return; // 已存在就不重複存
    const vp = window.getViewport && window.getViewport();
    if (!vp) return;
    const nodes = Array.from(vp.children)
      .filter(n => {
        // 排除背景格線
        if (n.tagName.toLowerCase() === 'rect' && n.getAttribute('fill') === 'url(#gridPattern)') return false;
        return true;
      })
      .map(n => n.cloneNode(true));
    snapshots.set(frameIdx, nodes);
  }

  /** 恢復快照：找到最接近且 <= targetIdx 的快照並還原到畫布 */
  function restore(targetIdx) {
    const snapIdx = Math.floor(targetIdx / SNAP_INTERVAL) * SNAP_INTERVAL;
    if (!snapshots.has(snapIdx)) return false;
    const vp = window.getViewport && window.getViewport();
    if (!vp) return false;
    // 徹底清空所有非背景子節點
    Array.from(vp.children).forEach(child => {
      if (child.tagName.toLowerCase() === 'rect' && child.getAttribute('fill') === 'url(#gridPattern)') return;
      vp.removeChild(child);
    });
    // 克隆快照節點並附加到畫布
    snapshots.get(snapIdx).forEach(node => vp.appendChild(node.cloneNode(true)));
    return true;
  }

  /** 清空所有快照（編譯新腳本時呼叫） */
  function clear() {
    snapshots.clear();
  }

  /** 取得目前快照數量（除錯用） */
  function size() {
    return snapshots.size;
  }

  /** 估算快照快取的記憶體佔用 */
  function memoryUsage() {
    let totalBytes = 0;
    const details = [];
    snapshots.forEach((nodes, frameIdx) => {
      let frameBytes = 0;
      let nodeCount = 0;
      nodes.forEach(n => {
        // 用 outerHTML 的字串長度 × 2 (UTF-16) 來粗估 DOM 記憶體
        const html = n.outerHTML || '';
        frameBytes += html.length * 2;
        // 遞迴計算子節點數量
        nodeCount += 1 + (n.querySelectorAll ? n.querySelectorAll('*').length : 0);
      });
      totalBytes += frameBytes;
      details.push({ frame: frameIdx, nodes: nodeCount, bytes: frameBytes });
    });

    // 格式化輸出
    const fmt = (b) => {
      if (b < 1024) return b + ' B';
      if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
      return (b / 1024 / 1024).toFixed(2) + ' MB';
    };

    console.group(`📸 FrameSnapshotCache 記憶體估算 (${snapshots.size} 筆快照)`);
    console.table(details.map(d => ({
      '影格': d.frame,
      'DOM 節點': d.nodes,
      '估算大小': fmt(d.bytes)
    })));
    console.log(`🔹 總計: ${fmt(totalBytes)}`);
    console.groupEnd();

    return { count: snapshots.size, totalBytes, formatted: fmt(totalBytes), details };
  }

  return { capture, restore, clear, size, memoryUsage, SNAP_INTERVAL };
})();
// 掛到 window 方便在 console 呼叫
window.FrameSnapshotCache = FrameSnapshotCache;

// ==============================
// 影格延遲 (Sleep) 系統
// ==============================
let currentFrameSleep = 0;
window.setFrameSleep = function (ms) {
  currentFrameSleep = ms;
};

// ==============================
// 幀條碼：狀態與工具函式
// ==============================

// 總幀數 / 目前幀 / 關鍵幀索引
let totalFrames = 0;
let currentFrame = 0;       // 0-based
let keyFrameIndices = [];

// 從 CodeScript 取得各種資訊（支援 snake_case / camelCase）---
function csGetFrameCount() {
  if (typeof CodeScript === "undefined") return 0;
  if (typeof CodeScript.get_frame_count === "function") return CodeScript.get_frame_count();
  return 0;
}

function csGetKeyFrames() {
  if (typeof CodeScript === "undefined") return [];
  if (typeof CodeScript.get_key_frames === "function") return CodeScript.get_key_frames() || [];
  return [];
}

function csGetCurrentFrameIndex() {
  if (typeof CodeScript === "undefined") return 0;
  if (typeof CodeScript.get_current_frame_index === "function") return CodeScript.get_current_frame_index();
  return 0;
}

function csGotoFrame(idx) {
  if (typeof CodeScript === "undefined") return;
  // 快照恢復：跳轉前先嘗試還原最近的快照
  FrameSnapshotCache.restore(idx);
  if (typeof CodeScript.goto === "function") return CodeScript.goto(idx);
  if (typeof CodeScript.set_frame === "function") return CodeScript.set_frame(idx);
}

// 初始化幀資訊（在 reloadCodeScript 之後呼叫）---
function initFrameInfoFromCodeScript() {
  // 清空舊的快照快取
  FrameSnapshotCache.clear();
  totalFrames = csGetFrameCount();
  keyFrameIndices = csGetKeyFrames();
  currentFrame = csGetCurrentFrameIndex();

  buildFrameBars();
  updateFrameInfoText();
}

// 建立條碼 DOM
function buildFrameBars() {
  const barsContainer = document.getElementById("frameBars");
  if (!barsContainer) return;

  barsContainer.innerHTML = "";

  const keySet = new Set(keyFrameIndices || []);

  for (let i = 0; i < totalFrames; i++) {
    const bar = document.createElement("div");
    bar.classList.add("frame-bar");
    if (keySet.has(i)) bar.classList.add("keyframe");
    bar.dataset.index = i;

    // bar.addEventListener("click", () => {
    //   jumpToFrame(i);
    // });

    barsContainer.appendChild(bar);
  }

  const timeline = document.getElementById("frameTimeline");
  if (timeline && !timeline.dataset.scrubBound) {
    timeline.dataset.scrubBound = "true";
    let isDraggingTimeline = false;

    const scrub = (e) => {
      if (totalFrames <= 0) return;
      const rect = timeline.getBoundingClientRect();
      let clickX = e.clientX - rect.left;
      clickX = Math.max(0, Math.min(clickX, rect.width));
      const targetIdx = Math.floor((clickX / rect.width) * totalFrames);
      const clampedIdx = Math.max(0, Math.min(targetIdx, totalFrames - 1));
      if (clampedIdx !== currentFrame) {
        jumpToFrame(clampedIdx);
      }
    };

    timeline.addEventListener("pointerdown", (e) => {
      isDraggingTimeline = true;
      timeline.setPointerCapture(e.pointerId);
      scrub(e);
    });
    timeline.addEventListener("pointermove", (e) => {
      if (isDraggingTimeline) scrub(e);
    });
    timeline.addEventListener("pointerup", (e) => {
      isDraggingTimeline = false;
      timeline.releasePointerCapture(e.pointerId);
    });
  }

  updateFrameBarsVisual();
}

// 更新「哪一格是 active」---
function updateFrameBarsVisual() {
  const barsContainer = document.getElementById("frameBars");
  if (!barsContainer) return;

  const bars = barsContainer.querySelectorAll(".frame-bar");
  bars.forEach(bar => {
    const idx = Number(bar.dataset.index);
    bar.classList.toggle("active", idx === currentFrame);
    if (idx <= currentFrame) {
      bar.classList.add("reached");
    } else {
      bar.classList.remove("reached");
    }
  });
}

// 更新「第幾幀 / 總幀數」文字
function updateFrameInfoText() {
  const info = document.getElementById("frameInfo");
  if (!info) return;

  const now = (currentFrame || 0) + 1;  // 顯示給使用者 1-based
  const total = totalFrames || 0;
  info.textContent = `${now} / ${total}`;
}

// 點條碼跳到某一幀
function jumpToFrame(idx) {
  csGotoFrame(idx);
  // 跳完之後從 CodeScript 重新抓當前幀
  currentFrame = csGetCurrentFrameIndex();
  updateFrameBarsVisual();
  updateFrameInfoText();
}

// 統一給外面用的「同步目前幀」函式
// （按下一步 / 上一步 / 自動播放 都用這個）
// 紀錄目前這一輪「播放」是從哪一個 index 開始的
let playSessionStartFrame = -1;

function syncCurrentFrameFromCodeScript() {
  currentFrame = csGetCurrentFrameIndex();
  // 快照捕捉：每次影格渲染完成後自動存儲
  FrameSnapshotCache.capture(currentFrame);
  updateFrameBarsVisual();
  updateFrameInfoText();
  if (typeof clearDrawingCanvas === 'function') clearDrawingCanvas();

  // 更新關鍵影格按鈕狀態 (disabled/enabled)
  const nkBtn = document.getElementById('nextKeyFrameBtn');
  const pkBtn = document.getElementById('prevKeyFrameBtn');
  if (nkBtn && typeof CodeScript !== 'undefined') {
    nkBtn.disabled = (typeof CodeScript.has_next_key === 'function') ? !CodeScript.has_next_key() : false;
    nkBtn.style.opacity = nkBtn.disabled ? '0.5' : '1';
    nkBtn.style.pointerEvents = nkBtn.disabled ? 'none' : 'auto';
  }
  if (pkBtn && typeof CodeScript !== 'undefined') {
    pkBtn.disabled = (typeof CodeScript.has_prev_key === 'function') ? !CodeScript.has_prev_key() : false;
    pkBtn.style.opacity = pkBtn.disabled ? '0.5' : '1';
    pkBtn.style.pointerEvents = pkBtn.disabled ? 'none' : 'auto';
  }
}

// RUN 按鈕在 compile.js 把新的 code_script.js 生出來後
// front.js 需要在 reloadCodeScript 完成時重新建立幀資訊
window.reloadAfterRun = function () {
  reloadCodeScript(() => {
    initFrameInfoFromCodeScript();
    syncCurrentFrameFromCodeScript();
  });

  // 新增：同步程式碼高亮
  const line = csGetCurrentLine();
  addEditorHighlight(line);
};


// 首次載入與動畫控制
document.addEventListener('DOMContentLoaded', () => {
  // === 既有初始化：保留 ===
  window._canvasInteraction ||= new window.CanvasInteractionManager(document.getElementById('arraySvg'));

  // 啟動 marker layer 去重監控，確保同一行只有一個 highlight 元素可見
  initMarkerObserver();

  // === 幀條碼初始化 ===
  // Embedded algorithm slides receive their animation from the parent window.
  // Loading the bundled code_script.js first briefly paints its sample arrows,
  // then leaves them fading over the saved slide when the payload arrives.
  if (!new URLSearchParams(window.location.search).has('asmEmbed')) {
    reloadAfterRun();
  } else {
    window.resetArrows?.();
    window.clearCanvas?.();
  }

  // === 輸入框 (inputArea) 歷史紀錄管理 (Undo/Redo) ===
  const inputArea = document.getElementById('inputArea');
  if (inputArea) {
    const historyManager = {
      undoStack: [inputArea.value],
      redoStack: [],
      maxHistory: 100,
      isApplying: false,
      timer: null,

      push(val) {
        if (this.undoStack[this.undoStack.length - 1] === val) return;
        this.undoStack.push(val);
        if (this.undoStack.length > this.maxHistory) this.undoStack.shift();
        this.redoStack = []; // 有新輸入時清空 redo
      },

      undo() {
        if (this.undoStack.length <= 1) return;
        this.isApplying = true;
        this.redoStack.push(this.undoStack.pop());
        inputArea.value = this.undoStack[this.undoStack.length - 1];
        this.isApplying = false;
        scheduleAlgorithmDraftSave();
      },

      redo() {
        if (this.redoStack.length === 0) return;
        this.isApplying = true;
        const val = this.redoStack.pop();
        inputArea.value = val;
        this.undoStack.push(val);
        this.isApplying = false;
        scheduleAlgorithmDraftSave();
      }
    };

    inputArea.addEventListener('input', () => {
      scheduleAlgorithmDraftSave();
      if (historyManager.isApplying) return;
      clearTimeout(historyManager.timer);
      historyManager.timer = setTimeout(() => {
        historyManager.push(inputArea.value);
      }, 300);
    });

    inputArea.addEventListener('keydown', (e) => {
      // 支援 Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        historyManager.undo();
      } else if ((e.ctrlKey && e.key.toLowerCase() === 'y') || (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'z')) {
        e.preventDefault();
        historyManager.redo();
      }
    });

    // 失去焦點或按下 Enter 時立即紀錄
    inputArea.addEventListener('blur', () => {
      historyManager.push(inputArea.value);
      saveAlgorithmDraft();
    });
  }

  // === 控制狀態 ===
  let isPlaying = false;

  // === 元件參照 ===
  const speedSlider = document.getElementById('speedSlider');
  const speedValue = document.getElementById('speedValue');
  const toggleBtn = document.getElementById('playToggleBtn');
  const restartBtn = document.getElementById('restartBtn');
  const prevKeyBtn = document.getElementById('prevKeyFrameBtn');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const nextKeyBtn = document.getElementById('nextKeyFrameBtn');
  const finishBtn = document.getElementById('finishBtn');

  // === 速度 ===
  let speed = +speedSlider.value;

  // 把滑桿的值映射成 TTS rate（0.5x ~ 2.0x）
  function getTtsRate() {
    const val = Number(speedSlider.value) || 0;
    const min = Number(speedSlider.min) || 100;   // 若 HTML 沒設，就假設 100~1500
    const max = Number(speedSlider.max) || 1500;

    const clamped = Math.max(min, Math.min(max, val));
    const norm = (clamped - min) / (max - min); // 0..1，越大越慢
    const inv = 1 - norm;                      // 1..0，越大越快

    const minRate = 0.5;
    const maxRate = 2.0;
    const mappedRate = minRate + inv * (maxRate - minRate);
    return Math.round(mappedRate * 10) / 10;
  }

  const updateSpeedLabel = () => {
    const rate = getTtsRate();
    window.asmAnimationPlaybackRate = rate;
    window.asmGetAnimationPlaybackRate = () => Number(window.asmAnimationPlaybackRate) || 1;
    document.documentElement.style.setProperty('--asm-animation-playback-rate', String(rate));
    document.documentElement.style.setProperty('--asm-trace-lift-duration', `${340 / rate}ms`);
    document.documentElement.style.setProperty('--asm-trace-pulse-duration', `${400 / rate}ms`);
    document.documentElement.style.setProperty('--asm-trace-fade-duration', `${440 / rate}ms`);
    speedValue.textContent = `語速 ${rate.toFixed(1)}x`;

    // 更新滑桿比例 CSS 變數（用於軌道填充顏色）
    const min = parseFloat(speedSlider.min) || 1;
    const max = parseFloat(speedSlider.max) || 2000;
    const val = parseFloat(speedSlider.value);
    const percentage = ((val - min) / (max - min)) * 100;
    // 將百分比同步到包裝容器，供背景楔形條使用
    if (speedSlider.parentElement) {
      speedSlider.parentElement.style.setProperty('--percent', percentage + '%');
    }
  };
  updateSpeedLabel();

  // === UI 同步（整合 ▶ / ⏸）===
  function syncPlayToggleUI() {
    if (!toggleBtn) return;
    const playSvg = `<svg class="step-icon" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
    const pauseSvg = `<svg class="step-icon" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
    toggleBtn.innerHTML = isPlaying ? pauseSvg : playSvg;
    toggleBtn.setAttribute('aria-pressed', isPlaying ? 'true' : 'false');
    toggleBtn.classList.toggle('playing', isPlaying);
  }

  // TTS 驅動的自動播放：逐行讀完目前幀 → 決定下一步
  function playFromCurrentFrameWithTTS(runId, incomingTransition = null) {
    // 如果已經被暫停，或這個 callback 是舊世代，就不要做事
    if (!isPlaying || runId !== TTS_RUN_ID) return;

    const transitionReady = Promise.resolve(incomingTransition).catch(() => {});
    const entries = collectMessageTextInCurrentFrame();

    const advanceAfterReady = () => {
      // 再檢查一次（避免 onend 在 pause 或重新播放後才觸發）
      if (!isPlaying || runId !== TTS_RUN_ID) return;
      clearTTSHighlight();

      const cur = csGetCurrentFrameIndex();
      const total = csGetFrameCount();

      if (typeof CodeScript === 'undefined') {
        isPlaying = false;
        syncPlayToggleUI();
        if (typeof stopStepAuto === 'function') stopStepAuto();
        return;
      }

      const configuredInterval = Number(
        window.ASMTracePlayer?.getDocument?.()?.studio?.eventSettings?.gapMs
      );
      const eventInterval = Number.isFinite(configuredInterval)
        ? Math.max(0, Math.min(2000, configuredInterval))
        : 500;
      const scheduleNextFrame = callback => setTimeout(() => {
        if (!isPlaying || runId !== TTS_RUN_ID) return;
        callback();
      }, eventInterval + (currentFrameSleep || 0));

      // 1) skip_frame：跳過區段 → 直接跳到下一個停靠幀或最後，然後念該幀內容
      if (typeof CodeScript.is_skip_frame === 'function' &&
        CodeScript.is_skip_frame(cur)) {

        if (typeof gotoNextStopOrEnd === 'function') {
          scheduleNextFrame(() => {
            const transition = gotoNextStopOrEnd(true); // 保持播放狀態
            playFromCurrentFrameWithTTS(runId, transition);
          });
        }
        return;
      }

      // 2) stop_frame：停在這幀，不再往下走
      // 修正：只有當這幀不是「本次播放的起點」時才停下來，否則會無法從 stop 點繼續播放
      if (typeof CodeScript.is_stop_frame === 'function' &&
        CodeScript.is_stop_frame(cur) && cur !== playSessionStartFrame) {

        fast = false;
        isPlaying = false;
        syncPlayToggleUI();
        if (typeof stopStepAuto === 'function') stopStepAuto();
        return;
      }

      // 3) 最後一幀：停播
      if (total > 0 && cur >= total - 1) {
        fast = false;
        isPlaying = false;
        syncPlayToggleUI();
        if (typeof stopStepAuto === 'function') stopStepAuto();
        return;
      }

      // 4) fast_frame：跳到下一個 key_frame (track = 1)
      if (typeof CodeScript.is_fast_frame === 'function' &&
        CodeScript.is_fast_frame(cur)) {
        scheduleNextFrame(() => {
          const transition = stepWithTween(() => CodeScript.next_key_frame());
          syncCurrentFrameFromCodeScript();
          playFromCurrentFrameWithTTS(runId, transition);
        });
        return;
      }

      // 5) faston_frame：從這幀開始改用 key_frame 模式
      if (typeof CodeScript.is_faston_frame === 'function' &&
        CodeScript.is_faston_frame(cur)) {
        fast = true;
      }

      // 6) 正常往下一幀
      scheduleNextFrame(() => {
        let transition = Promise.resolve();
        if (fast && typeof CodeScript.next_key_frame === 'function') {
          transition = stepWithTween(() => CodeScript.next_key_frame());
        } else if (typeof CodeScript.next === 'function') {
          transition = stepWithTween(() => CodeScript.next());
        }
        syncCurrentFrameFromCodeScript();
        playFromCurrentFrameWithTTS(runId, transition);
      });
    };

    const afterSpeak = () => {
      if (!isPlaying || runId !== TTS_RUN_ID) return;
      transitionReady.then(() => {
        if (!isPlaying || runId !== TTS_RUN_ID) return;
        advanceAfterReady();
      });
    };

    const fallbackDelay = () => {
      queueMicrotask(() => {
        if (!isPlaying || runId !== TTS_RUN_ID) return;
        afterSpeak();
      });
    };

    if (!entries.length) {
      fallbackDelay();
      return;
    }

    if (typeof speakText !== 'function') {
      console.warn('[TTS] 找不到 speakText 函式，改用 delay 播放。');
      fallbackDelay();
      return;
    }

    const volume = TTS_ENABLED ? 0.3 : 0.0;
    const rate = getTtsRate();
    const ttsProfile = window.getAlgoShowMakerTTSProfile?.({ rate, volume }) || {
      lang: 'zh-TW', rate, volume, pitch: 1,
      preferredVoiceRegex: /(Microsoft).*(Natural|Neural).*(Chinese|Taiwan|zh[-_]?TW)/i
    };

    // === 逐行朗讀 ===
    let entryIdx = 0;
    function speakNextLine() {
      if (!isPlaying || runId !== TTS_RUN_ID) { clearTTSHighlight(); return; }

      if (entryIdx >= entries.length) {
        clearTTSHighlight();
        afterSpeak();
        return;
      }

      const entry = entries[entryIdx];
      scheduleTTSHighlight(entry.groupId, entry.lineIndex, runId);

      speakText(entry.text, {
        lang: ttsProfile.lang,
        voiceName: ttsProfile.voiceName,
        rate: ttsProfile.rate,
        pitch: ttsProfile.pitch,
        volume: ttsProfile.volume,
        preferredVoiceRegex: ttsProfile.preferredVoiceRegex,
        interrupt: true,
        onend: () => {
          if (!isPlaying || runId !== TTS_RUN_ID) { clearTTSHighlight(); return; }
          entryIdx++;
          speakNextLine();
        },
        onerror: () => {
          if (!isPlaying || runId !== TTS_RUN_ID) { clearTTSHighlight(); return; }
          entryIdx++;
          speakNextLine();
        }
      });
    }
    speakNextLine();
  }

  // === TTS 行高亮 ===
  function scheduleTTSHighlight(groupId, lineIndex, runId) {
    clearTTSHighlight();
    const requestId = TTS_HIGHLIGHT_REQUEST;
    const waitForEntrance = () => {
      if (requestId !== TTS_HIGHLIGHT_REQUEST || !isPlaying || runId !== TTS_RUN_ID) return;
      const vp = window.getViewport && window.getViewport();
      const group = vp?.querySelector?.('#' + CSS.escape(groupId));
      const motion = group?.querySelector?.(':scope > .asm-trace-motion');
      if (motion?.dataset?.traceAppearing === '1') {
        requestAnimationFrame(waitForEntrance);
        return;
      }
      highlightTTSLine(groupId, lineIndex);
    };
    waitForEntrance();
  }

  function highlightTTSLine(groupId, lineIndex) {
    clearTTSHighlight();
    const vp = window.getViewport && window.getViewport();
    if (!vp) return;
    const g = vp.querySelector('#' + CSS.escape(groupId));
    if (!g) return;

    // 找到目標元素（tspan 或 text）
    let target = null;
    if (lineIndex >= 0) {
      target = g.querySelector(`[data-line-index="${lineIndex}"]`);
    }
    if (!target) target = g.querySelector('text');
    if (!target) return;

    try {
      const bbox = target.getBBox();
      const hl = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      hl.setAttribute('id', 'tts-line-highlight');
      hl.setAttribute('x', bbox.x - 3);
      hl.setAttribute('y', bbox.y - 2);
      hl.setAttribute('width', bbox.width + 6);
      hl.setAttribute('height', bbox.height + 4);
      hl.setAttribute('fill', 'rgba(175, 175, 175, 0.23)');
      hl.setAttribute('rx', 3);
      hl.setAttribute('pointer-events', 'none');
      // 群組的 getBBox 是群組自己的座標；反白也放進同一群組，避免遺漏 transform。
      if (target.tagName.toLowerCase() === 'g') {
        target.insertBefore(hl, target.firstChild);
      } else {
        const textNode = target.tagName === 'tspan' ? target.parentNode : target;
        textNode.parentNode?.insertBefore(hl, textNode);
      }
    } catch (e) { /* getBBox 可能在元素不可見時失敗 */ }
  }

  function clearTTSHighlight() {
    TTS_HIGHLIGHT_REQUEST += 1;
    const vp = window.getViewport && window.getViewport();
    if (!vp) return;
    vp.querySelectorAll('#tts-line-highlight').forEach(el => el.remove());
  }


  // === 播放/暫停 公用函式 ===
  function play() {
    if (isPlaying) return;
    isPlaying = true;
    fast = false; // 按下 Play 重新回到普通模式
    //startTimer();
    // 開始新的一輪 TTS 播放：+1 產生新的 runId
    TTS_RUN_ID++;
    const myRunId = TTS_RUN_ID;

    // 紀錄這次播放從哪裡開始，避免「起步即止」
    playSessionStartFrame = csGetCurrentFrameIndex();

    syncPlayToggleUI();
    playFromCurrentFrameWithTTS(myRunId);
  }

  function pause() {
    if (!isPlaying) return;
    isPlaying = false;
    // 讓所有舊的 callback（onend / setTimeout）全部失效
    TTS_RUN_ID++;

    syncPlayToggleUI();
    clearTTSHighlight();
    try { window.speechSynthesis.cancel(); } catch { }
  }

  function togglePlay() {
    isPlaying ? pause() : play();
  }

  // === 速度改變：若正在播，重啟計時器 ===
  speedSlider.oninput = (e) => {
    speed = +e.target.value;
    updateSpeedLabel();
    //  if (isPlaying) startTimer();
  };

  // === 所有控制鍵：基礎 bind（給 restart / finish 用） ===
  function bindAction(btn, fn) {
    if (!btn) return;
    btn.onclick = () => {
      pause();   // 停止自動播放
      fn();      // 執行對應動作
      syncCurrentFrameFromCodeScript();
    };
  }

  // === 跳到「下一個停靠幀」，沒有就跳到最後 ===
  function gotoNextStopOrEnd(keepPlaying = false) {
    if (!keepPlaying) {
      stopStepAuto(); // 關掉任何 auto-stepping 模式
      pause();        // 順便停播放（保險）
    }

    const cur = csGetCurrentFrameIndex();

    // 有 get_stop_frames 的情況
    if (typeof CodeScript.get_stop_frames === "function") {
      const stops = CodeScript.get_stop_frames();

      if (Array.isArray(stops) && stops.length > 0) {
        // 找出比目前更後面的停靠幀
        const nextStops = stops.filter(s => s > cur);

        // 還有「未來停靠幀」→ 找到該停靠幀之前的最後一個關鍵幀
        if (nextStops.length > 0) {
          const nextStop = Math.min(...nextStops);
          let target = nextStop;

          if (typeof CodeScript.get_key_frames === "function") {
            const keys = CodeScript.get_key_frames();
            // 在 [cur, nextStop] 範圍內找最大的 key frame
            const candidates = keys.filter(k => k >= cur && k <= nextStop);
            if (candidates.length > 0) {
              target = Math.max(...candidates);
            }
          }

          const transition = CodeScript.goto(target);
          syncCurrentFrameFromCodeScript();
          return transition;
        }
      }
    }

    // 否則 → 沒有下一個 stop，跳到最後一個 frame
    const transition = CodeScript.goto(-1);
    syncCurrentFrameFromCodeScript();
    return transition;
  }

  // === 全域：目前是否有「自動連續步進」在跑 ===
  const stepAuto = {
    activeBtn: null,
    intervalId: null,
    stepFn: null,
    running: false,
    direction: 0,   // +1 往後, -1 往前, 0 不管方向
  };

  function stopStepAuto() {
    if (stepAuto.intervalId) {
      clearInterval(stepAuto.intervalId);
      stepAuto.intervalId = null;
    }
    stepAuto.running = false;
    if (stepAuto.activeBtn) {
      stepAuto.activeBtn.classList.remove('auto-stepping');
      stepAuto.activeBtn = null;
    }
    stepAuto.stepFn = null;
  }

  function startStepAuto(btn, stepFn, direction = 0) {
    // 先把其他模式停掉
    stopStepAuto();
    pause(); // 停掉全局播放

    stepAuto.activeBtn = btn;
    stepAuto.stepFn = stepFn;
    stepAuto.direction = direction;
    btn.classList.add('auto-stepping');

    stepAuto.intervalId = setInterval(async () => {
      if (stepAuto.running) return;
      stepAuto.running = true;
      const before = csGetCurrentFrameIndex();

      await Promise.resolve(stepFn());
      syncCurrentFrameFromCodeScript();

      const after = csGetCurrentFrameIndex();
      const total = csGetFrameCount();

      let needStop = false;

      // 1) 碰到 stop_frame 就停
      if (CodeScript.is_stop_frame && CodeScript.is_stop_frame(after)) {
        needStop = true;
      }

      // 2) 播到底 / 撥到最前面就停
      if (direction > 0 && total > 0 && after >= total - 1) {
        // 往後播且已是最後一幀
        needStop = true;
      }
      if (direction < 0 && after <= 0) {
        // 往前播且已是第 0 幀
        needStop = true;
      }

      // 3) 如果根本動不了（已經在邊界），也停一下（安全保險）
      if (after === before && (direction !== 0)) {
        needStop = true;
      }

      if (needStop) {
        stopStepAuto(); // 會清 interval + 把按鈕 auto-stepping 樣式拿掉
      }
      stepAuto.running = false;
    }, speed);
  }


  // === 可「長按切換模式」的步進按鈕：prev / next / prevKey / nextKey 用 ===
  function bindStepButton(btn, stepFn, direction = 0) {
    if (!btn) return;

    let longPressTimer = null;
    let longPressFired = false;

    const clearLongPressTimer = () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    };

    // 短按：走一步
    const doSingleStep = () => {
      pause();   // 停止全局播放
      stepFn();
      syncCurrentFrameFromCodeScript();
    };

    const onPressStart = (e) => {
      e.preventDefault();
      longPressFired = false;
      clearLongPressTimer();

      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        longPressFired = true;

        // 長按 → 切換 auto 模式
        if (stepAuto.activeBtn === btn) {
          // 如果這顆已經是 auto → 關掉
          stopStepAuto();
        } else {
          // 不是 → 啟動 auto 模式（帶方向）
          startStepAuto(btn, stepFn, direction);
        }
      }, 300); // 長按判定時間
    };

    const onPressEnd = (e) => {
      e.preventDefault();
      clearLongPressTimer();

      if (!longPressFired) {
        // 短按：如果正在 auto，就當作關掉 auto，否則就走一步
        if (stepAuto.activeBtn === btn) {
          stopStepAuto();
        } else {
          doSingleStep();
        }
      }
    };

    // 滑鼠事件
    btn.addEventListener('mousedown', onPressStart);
    btn.addEventListener('mouseup', onPressEnd);
    btn.addEventListener('mouseleave', clearLongPressTimer);

    // 觸控事件
    btn.addEventListener('touchstart', onPressStart, { passive: false });
    btn.addEventListener('touchend', onPressEnd, { passive: false });
    btn.addEventListener('touchcancel', clearLongPressTimer, { passive: false });
  }

  // === 綁定各個按鈕 ===

  // 重來：點一下就好，不用長按模式
  bindAction(restartBtn, () => {
    stopStepAuto(); // 如果有 auto 模式也一起關掉
    CodeScript.reset();
    syncCurrentFrameFromCodeScript();
  });

  // 上一大步 / 下一大步：可長按切換自動模式
  bindStepButton(prevKeyBtn, () => {
    // 如果不在第0幀，且有上一個 Key Frame，才允許往回跳
    if (CodeScript && CodeScript.get_current_frame_index() > 0) {
      if (CodeScript.has_prev_key && !CodeScript.has_prev_key()) return;
      return stepWithTween(() => CodeScript.prev_key_frame(), 300);
    }
  }, -1);

  bindStepButton(nextKeyBtn, () => {
    // 如果還沒到最後一幀，且有下一個 Key Frame，才允許往下跳
    if (CodeScript && CodeScript.get_current_frame_index() < CodeScript.get_frame_count() - 1) {
      if (CodeScript.has_next_key && !CodeScript.has_next_key()) return;
      return stepWithTween(() => CodeScript.next_key_frame(), 300);
    }
  }, +1);

  // 上一步 / 下一步：可長按切換自動模式
  bindStepButton(prevBtn, () => {
    // 如果不在第0幀，才允許上一步
    if (CodeScript && CodeScript.get_current_frame_index() > 0) {
      return stepWithTween(() => CodeScript.prev(), 300);
    }
  }, -1);

  bindStepButton(nextBtn, () => {
    // 如果還沒到最後一幀，才允許下一步
    if (CodeScript && CodeScript.get_current_frame_index() < CodeScript.get_frame_count() - 1) {
      return stepWithTween(() => CodeScript.next(), 300);
    }
  }, +1);

  // 跳到最後：維持你目前的「跳到下一個 stopFrame」邏輯
  bindAction(finishBtn, () => gotoNextStopOrEnd());


  // === ▶ / ⏸ 整合按鈕 ===
  if (toggleBtn) {
    toggleBtn.onclick = togglePlay;
  }

  // === [修正] TTS 按鈕邏輯：防止跳幀 ===
  // 必須放在 DOMContentLoaded 內，才能存取到 isPlaying 變數
  const ttsBtn = document.getElementById('ttsAvBtn');
  if (ttsBtn) {
    // 初始化按鈕狀態 (預設是靜音)
    ttsBtn.textContent = TTS_ENABLED ? "🔊" : "🔇";
    ttsBtn.classList.toggle('active', TTS_ENABLED);

    ttsBtn.onclick = () => {
      // 1. 切換開關變數
      TTS_ENABLED = !TTS_ENABLED;

      // 2. 更新按鈕外觀 (顏色 + 圖示)
      ttsBtn.classList.toggle('active', TTS_ENABLED);
      ttsBtn.textContent = TTS_ENABLED ? "🔊" : "🔇";

      // 3. 靜音處理 (防跳幀核心邏輯)
      if (!TTS_ENABLED) {
        // 只有在「非播放中」的狀態下，才強制中斷聲音
        // 如果正在播放 (isPlaying)，就讓它把這句講完，下一句會自動變靜音
        if (!isPlaying) {
          try { window.speechSynthesis.cancel(); } catch { }
        }
      }
    };
  }

  // 收集目前幀所有訊息文字，以「每行」為單位回傳陣列
  // 回傳格式：[{ groupId, lineIndex, text }, ...]
  function collectMessageTextInCurrentFrame() {
    const vp = window.getViewport && window.getViewport();
    if (!vp) return [];

    const msgGroups = vp.querySelectorAll('g[id^="msg-"]');
    if (!msgGroups.length) return [];

    const entries = [];

    msgGroups.forEach(g => {
      const groupId = g.id;
      const linesJson = g.getAttribute('data-tts-lines');
      if (linesJson) {
        try {
          const lines = JSON.parse(linesJson);
          lines.forEach((text, lineIndex) => {
            if (text && text.trim()) {
              entries.push({ groupId, lineIndex, text: text.trim() });
            }
          });
        } catch (e) { /* JSON 解析失敗，fallback */ }
      }
      // fallback：沒有 data-tts-lines 就用舊的 data-tts-text（整段作為一行）
      if (!linesJson) {
        const tAttr = g.getAttribute('data-tts-text');
        if (tAttr && tAttr.trim()) {
          entries.push({ groupId, lineIndex: -1, text: tAttr.trim() });
        }
      }
    });

    return entries;
  }


  // 初始 UI
  syncPlayToggleUI();
  syncCurrentFrameFromCodeScript();

});



// ==========================================
// Ctrl+A 限制範圍功能
// ==========================================

// 定義需要限制 Ctrl+A 的區域 ID
const restrictedIds = ['inputArea', 'outputArea', 'debugArea'];

restrictedIds.forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;

  // 1. 讓 div/pre 等非輸入元素可以被 focus (這樣才能偵測按鍵)
  // textarea 本身就可以 focus，不用加
  if (el.tagName !== 'TEXTAREA' && el.tagName !== 'INPUT') {
    el.setAttribute('tabindex', '0');
  }

  // 2. 監聽按鍵事件
  el.addEventListener('keydown', function (e) {
    // 偵測 Ctrl+A (Windows) 或 Cmd+A (Mac)
    if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault();  // 阻止瀏覽器預設的「全選網頁」
      e.stopPropagation(); // 阻止事件冒泡

      // A. 針對 輸入框 (Input/Textarea) 使用原生 select()
      if (this.tagName === 'TEXTAREA' || this.tagName === 'INPUT') {
        this.select();
      }
      // B. 針對 普通文字 (pre/div) 使用 Range API 來選取
      else {
        const range = document.createRange();
        range.selectNodeContents(this);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  });
});


// 分隔線拖曳調整寬度
(function () {
  const divider = document.getElementById('divider');
  const codePanel = document.getElementById('codePanel');
  let dragging = false;

  divider.addEventListener('mousedown', e => {
    dragging = true;
    document.body.style.cursor = 'col-resize';
    e.preventDefault();

    // 拖曳開始時：暫時把 transition 關掉，避免卡頓
    codePanel.style.transition = 'none';
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;

    const mainRect = document.getElementById('main').getBoundingClientRect();
    let w = e.clientX - mainRect.left;

    // 限制最小與最大寬度
    w = Math.max(150, Math.min(mainRect.width - 150, w));
    codePanel.style.width = w + 'px';

    // 告訴 Ace Editor 重新計算尺寸
    if (aceEditor) {
      aceEditor.resize();
    }
  });

  document.addEventListener('mouseup', () => {
    if (dragging) {
      dragging = false;
      document.body.style.cursor = '';

      // 拖曳結束後：把 transition 清除 (恢復成 CSS 裡的設定)
      // 這樣按鈕摺疊時依然會有動畫
      codePanel.style.transition = '';
    }
  });
})();

// front.js - 頂部選單擴充邏輯

document.addEventListener('DOMContentLoaded', () => {
  initTopMenuBar();
  //  fetchAlgorithmSamples();
});

function initTopMenuBar() {
  // 1. 綁定 Editor 設定：摺疊/展開 draw
  const toggleFoldBtn = document.getElementById('menuToggleFold');
  if (toggleFoldBtn) {
    toggleFoldBtn.onclick = () => {
      toggleDrawBlocks(); // 呼叫原本 front.js 裡的函式
    };
  }

  // 2. 綁定畫布設定：重置視角
  const resetViewBtn = document.getElementById('menuResetView');
  if (resetViewBtn) {
    resetViewBtn.onclick = () => {
      // 假設 canva.js 暴露了 resetTransform 變數，如果沒有，我們手動重置
      // 這裡直接修改 canva.js 內部變數的 workaround 需要 canva.js 支援
      // 建議在 canva.js 暴露 window.resetCanvasView()
      if (window.resetCanvasView) {
        window.resetCanvasView();
      } else {
        console.warn("需在 canva.js 實作 window.resetCanvasView");
      }
    };
  }

  // 3. 綁定畫布設定：切換格線
  const toggleGridBtn = document.getElementById('menuToggleGrid');
  if (toggleGridBtn) {
    toggleGridBtn.onclick = () => {
      const svg = document.getElementById('arraySvg');
      const grid = svg.querySelector('rect[fill="url(#gridPattern)"]');
      if (grid) {
        const currentDisplay = grid.style.display;
        grid.style.display = currentDisplay === 'none' ? 'block' : 'none';
      }
    };
  }
}

// ==========================================
// 登入/註冊/登出/忘記密碼 模態視窗控制邏輯
// ==========================================

document.addEventListener('DOMContentLoaded', function () {
  // --- 1. 取得 DOM 元素 ---
  const loginModal = document.getElementById("loginModal");
  const loginBtn = document.getElementById("loginTriggerBtn");
  const closeSpan = document.querySelector(".close-modal");
  const toggleBtn = document.getElementById("toggleAuthModeBtn");
  const modalTitle = document.getElementById("modalTitle");
  const actionBtn = document.getElementById("authActionBtn");
  const toggleText = document.getElementById("toggleAuthModeText");
  const authForm = document.querySelector(".auth-form");
  const forgotBtn = document.getElementById("forgotPasswordBtn"); // 忘記密碼按鈕

  if (loginModal) {
  // 取得要隱藏/顯示的區塊
  // 假設你的 HTML 結構是 .form-group 包住 label 和 input
  const formGroups = loginModal.querySelectorAll(".form-group");
  const modalFooter = loginModal.querySelector(".modal-footer");

  // --- 2. 狀態變數 ---
  let isLoginMode = true;   // 登入模式
  let isLogoutMode = false; // 登出模式
  let isForgotMode = false; // 忘記密碼模式
  let isResetMode = false;  // 重置密碼模式
  let currentResetToken = null;

  // --- 3. 檢查網址是否有 reset_token (從 Email 點回來) ---
  const urlParams = new URLSearchParams(window.location.search);
  const resetToken = urlParams.get('reset_token');

  if (resetToken) {
    isResetMode = true;
    currentResetToken = resetToken;

    // 強制打開 Modal
    loginModal.style.display = "block";

    // 清除網址參數 (美觀用，不讓使用者覺得網址很長)
    window.history.replaceState({}, document.title, "/");
  }

  // --- 4. 核心工具：顯示訊息 ---
  function showMsg(msg, type = 'error') {
    let msgDiv = document.getElementById("authMessage");
    if (!msgDiv && modalTitle) {
      msgDiv = document.createElement("div");
      msgDiv.id = "authMessage";
      modalTitle.parentNode.insertBefore(msgDiv, modalTitle.nextSibling);
    }
    if (msgDiv) {
      msgDiv.innerHTML = msg.replace(/\n/g, "<br/>");
      msgDiv.className = type;
      msgDiv.style.display = 'block';
    } else {
      alert(msg);
    }
  }

  function clearMsg() {
    const msgDiv = document.getElementById("authMessage");
    if (msgDiv) {
      msgDiv.style.display = 'none';
      msgDiv.className = '';
    }
  }

  // --- 5. 核心工具：更新介面 (根據四種模式切換) ---
  function updateModalUI() {
    clearMsg();

    // A. 先全部隱藏，下面再依模式打開
    formGroups.forEach(el => el.style.display = 'none');
    modalFooter.style.display = 'none';
    if (forgotBtn) forgotBtn.style.display = 'none'; // 預設隱藏

    if (isResetMode) {
      // === 模式 1: 重置密碼 (輸入新密碼) ===
      modalTitle.innerText = "重置密碼";
      actionBtn.innerText = "確認修改";

      // 只顯示密碼框
      const passwordGroup = document.getElementById("passwordInput").closest('.form-group');
      if (passwordGroup) passwordGroup.style.display = 'block';

      showMsg("驗證成功！請輸入您的新密碼。", "success");
    }
    else if (isForgotMode) {
      // === 模式 2: 忘記密碼 (輸入 Email) ===
      modalTitle.innerText = "忘記密碼";
      actionBtn.innerText = "發送重置信";

      // 只顯示帳號(Email)框
      const usernameGroup = document.getElementById("usernameInput").closest('.form-group');
      if (usernameGroup) usernameGroup.style.display = 'block';

      // 顯示底部 (讓它可以切換回登入)
      modalFooter.style.display = 'block';
      toggleText.innerText = "";
      toggleBtn.innerText = "回到登入";

      showMsg("請輸入註冊 Email，我們將寄送重置連結給您。", "success");
    }
    else if (isLogoutMode) {
      // === 模式 3: 登出確認 ===
      modalTitle.innerText = "登出確認";
      actionBtn.innerText = "確定登出";

      const currentUser = localStorage.getItem('algo_username') || '';
      showMsg(`目前登入帳號：<b>${currentUser}</b><br>您確定要登出嗎？`, "error");
    }
    else {
      // === 模式 4: 一般登入/註冊 ===
      // 恢復顯示所有輸入框
      formGroups.forEach(el => el.style.display = 'block');
      modalFooter.style.display = 'block';
      if (forgotBtn) forgotBtn.style.display = 'inline'; // 顯示忘記密碼

      if (isLoginMode) {
        modalTitle.innerText = "登入";
        actionBtn.innerText = "登入";
        toggleText.innerText = "還沒有帳號？";
        toggleBtn.innerText = "建立帳號";
      } else {
        modalTitle.innerText = "建立新帳號";
        actionBtn.innerText = "註冊";
        toggleText.innerText = "已經有帳號？";
        toggleBtn.innerText = "直接登入";
      }
    }
  }

  // 若因為 reset_token 而開啟，初始化 UI
  if (isResetMode) {
    updateModalUI();
  }

  // --- 6. 事件綁定 ---

  // (A) 打開視窗 (登入按鈕點擊)
  window.handleLoginBtnClick = function () {
    const storedUser = localStorage.getItem('algo_username');
    if (storedUser) {
      isLogoutMode = true; // 已登入 -> 變登出模式
    } else {
      isLogoutMode = false;
      isLoginMode = true;  // 未登入 -> 變登入模式
      isForgotMode = false;
      isResetMode = false;
    }
    updateModalUI();
    loginModal.style.display = "block";
  };
  if (loginBtn) loginBtn.onclick = window.handleLoginBtnClick;

  // (B) 關閉視窗
  if (closeSpan) {
    closeSpan.onclick = function () { loginModal.style.display = "none"; };
  }
  window.onclick = function (event) {
    if (event.target == loginModal) loginModal.style.display = "none";
    if (event.target == saveModal) saveModal.style.display = "none";
  };

  // (C) 忘記密碼按鈕
  if (forgotBtn) {
    forgotBtn.onclick = function (e) {
      e.preventDefault();
      isForgotMode = true;
      isLoginMode = false;
      updateModalUI();
    };
  }

  // (D) 切換按鈕 (建立帳號 / 回到登入)
  if (toggleBtn) {
    toggleBtn.onclick = function (e) {
      e.preventDefault();
      if (isForgotMode) {
        // 如果在忘記密碼模式，按這個變成「取消」回到登入
        isForgotMode = false;
        isLoginMode = true;
      } else {
        // 一般切換
        isLoginMode = !isLoginMode;
      }
      updateModalUI();
    };
  }

  // --- 7. 表單送出 (核心邏輯) ---
  if (authForm) {
    authForm.onsubmit = async function (e) {
      e.preventDefault();

      // 取得輸入值
      const usernameInput = document.getElementById("usernameInput");
      const passwordInput = document.getElementById("passwordInput");
      const username = usernameInput ? usernameInput.value.trim() : "";
      const password = passwordInput ? passwordInput.value.trim() : "";

      // === 狀況 1: 處理登出 (維持不變) ===
      if (isLogoutMode) {
        actionBtn.disabled = true;
        actionBtn.innerText = "登出中...";
        localStorage.removeItem('algo_jwt_token');
        localStorage.removeItem('algo_username');
        showMsg("登出成功！正在重新整理頁面...", "success");
        setTimeout(() => window.location.reload(), 1000);
        return;
      }

      // === 狀況 2: 處理忘記密碼 (維持不變) ===
      if (isForgotMode) {
        if (!username) { showMsg("請輸入 Email", "error"); return; }
        actionBtn.innerText = "寄送中...";
        actionBtn.disabled = true;
        try {
          const res = await fetch('/api/auth/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          showMsg(data.message, "success");
        } catch (err) {
          showMsg(err.message, "error");
        } finally {
          actionBtn.innerText = "發送重置信";
          actionBtn.disabled = false;
        }
        return;
      }

      // === 狀況 3: 處理重置密碼 (維持不變) ===
      if (isResetMode) {
        if (!password || password.length < 8) { showMsg("新密碼需至少 8 碼", "error"); return; }
        actionBtn.innerText = "更新中...";
        actionBtn.disabled = true;
        try {
          const res = await fetch('/api/auth/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: currentResetToken, newPassword: password })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          showMsg(data.message, "success");
          setTimeout(() => {
            isResetMode = false;
            currentResetToken = null;
            isLoginMode = true;
            updateModalUI();
            if (passwordInput) passwordInput.value = "";
          }, 1500);
        } catch (err) {
          showMsg(err.message, "error");
        } finally {
          actionBtn.innerText = "確認修改";
          actionBtn.disabled = false;
        }
        return;
      }

      // === 狀況 4: 一般 登入 / 註冊 ===
      if (!username || !password) {
        showMsg("請輸入帳號與密碼", "error");
        return;
      }

      if (!isLoginMode) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(username)) { showMsg("請輸入有效的 Email", "error"); return; }
        if (password.length < 8) { showMsg("密碼至少需 8 碼", "error"); return; }
      }

      const apiPath = isLoginMode ? '/api/auth/login' : '/api/auth/register';
      const originalBtnText = actionBtn.innerText;

      actionBtn.innerText = "處理中...";
      actionBtn.disabled = true;
      clearMsg();

      // [關鍵] 用來標記是否成功，如果是成功，finally 區塊就暫時不要還原按鈕
      let isSuccess = false;

      try {
        const res = await fetch(apiPath, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '操作失敗');

        if (isLoginMode) {
          // --- 登入成功 ---
          isSuccess = true; // 標記為成功

          // [修改] 1. 改變按鈕樣式與文字 (綠色 + 登入成功)
          actionBtn.innerText = "✔ 登入成功";
          actionBtn.style.backgroundColor = "#198754"; // 成功綠
          actionBtn.style.borderColor = "#198754";
          actionBtn.style.color = "#ffffff";

          showMsg(`登入成功！歡迎，${data.username}`, "success");
          localStorage.setItem('algo_jwt_token', data.token);
          localStorage.setItem('algo_username', data.username);
          window.dispatchEvent(new CustomEvent('asm:auth-changed'));
          updateUserUI(data.username);

          setTimeout(() => {
            loginModal.style.display = "none";
            if (passwordInput) passwordInput.value = "";

            // [修改] 2. 視窗關閉後，把按鈕還原，以免下次打開還是綠的
            actionBtn.innerText = originalBtnText;
            actionBtn.disabled = false;
            actionBtn.style.backgroundColor = "";
            actionBtn.style.borderColor = "";
            actionBtn.style.color = "";
          }, 1500); // 1.5秒後關閉

        } else {
          // --- 註冊成功 ---
          showMsg('註冊成功！正在為您切換至登入頁...', "success");
          setTimeout(() => {
            isLoginMode = true;
            updateModalUI();
            if (usernameInput) usernameInput.value = username;
            if (passwordInput) passwordInput.value = "";
            clearMsg();
          }, 1500);
        }

      } catch (err) {
        console.error(err);
        showMsg(err.message, "error");
      } finally {
        // [修改] 只有在「非成功」的時候才立即還原按鈕
        // 這樣才能讓使用者看到綠色的「登入成功」狀態
        if (!isSuccess) {
          actionBtn.innerText = originalBtnText;
          actionBtn.disabled = false;
        }
      }
    };
  }

  }

  // ==========================================
  // [新增] 存取程式碼功能邏輯
  // ==========================================

  // 1. DOM 元素 (注意：myCodesModal 已被移除，改為 myCodesSidebar)
  const saveModal = document.getElementById("saveCodeModal");
  const myCodesSidebar = document.getElementById("myCodesSidebar"); // [新] 側邊欄
  const algoSidePanel = document.getElementById("algoSidePanel");
  const openSaveBtn = document.getElementById("openSaveModalBtn");
  const openMyCodesBtn = document.getElementById("openMyCodesBtn");
  const algoSamplesBtn = document.getElementById("algoSamplesBtn");
  const closeSaveBtn = document.getElementById("closeSaveModal");
  const closeMyCodesSidebarBtn = document.getElementById("closeMyCodesSidebar"); // [新] 側邊欄關閉紐
  const saveForm = document.getElementById("saveCodeForm");
  const myCodesList = document.getElementById("myCodesList");
  const refreshBtn = document.getElementById("refreshMyCodesBtn");

  // --- [工具] 顯示儲存視窗內的訊息 (保留不動) ---
  function showSaveMsg(msg, type = 'error') {
    const msgDiv = document.getElementById("saveMessage");
    if (msgDiv) {
      msgDiv.textContent = msg;
      msgDiv.className = type;
    }
  }

  // --- [工具] 顯示全域浮動通知 (Toast) (保留不動) ---
  function showToast(msg, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast-msg ${type}`;
    toast.innerText = msg;
    container.appendChild(toast);
    setTimeout(() => {
      if (container.contains(toast)) container.removeChild(toast);
    }, 3500);
  }

  // ==========================================
  // --- 1. 儲存程式碼 (這部分完全保留原本的) ---
  // ==========================================

  if (openSaveBtn) {
    openSaveBtn.onclick = function (e) {
      e.preventDefault();
      if (!localStorage.getItem('algo_username')) {
        showToast("請先登入會員才能儲存程式碼", "warning");
        const loginBtn = document.getElementById("loginTriggerBtn");
        if (loginBtn) loginBtn.click();
        return;
      }
      showSaveMsg("", "");
      if (document.getElementById("saveMessage")) document.getElementById("saveMessage").style.display = "none";

      if (saveModal) saveModal.style.display = "block";
      if (document.getElementById("saveLangSelect")) document.getElementById("saveLangSelect").value = "cpp";
    };
  }
  if (closeSaveBtn) closeSaveBtn.onclick = () => saveModal.style.display = "none";

  if (saveForm) {
    saveForm.onsubmit = async function (e) {
      e.preventDefault();

      showSaveMsg("", "");
      if (document.getElementById("saveMessage")) document.getElementById("saveMessage").style.display = "none";

      const title = document.getElementById("saveTitleInput").value;
      const desc = document.getElementById("saveDescInput").value;
      const language = document.getElementById("saveLangSelect").value;
      const saveInput = document.getElementById("saveInputCheckbox").checked;

      const content = aceEditor ? aceEditor.getValue() : "";
      const inputData = (saveInput && document.getElementById("inputArea"))
        ? document.getElementById("inputArea").value
        : "";

      const token = localStorage.getItem('algo_jwt_token');

      const submitBtn = saveForm.querySelector("button");
      const originalText = "確認儲存";
      submitBtn.innerText = "⏳ 儲存中...";
      submitBtn.disabled = true;
      submitBtn.style.opacity = "0.7";

      try {
        const res = await fetch('/api/codes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            title, desc, language, content,
            inputs: inputData ? [inputData] : []
          })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "儲存失敗");

        showSaveMsg("✅ 儲存成功！", "success");
        submitBtn.innerText = "✔ 儲存成功";
        submitBtn.style.backgroundColor = "#198754";

        setTimeout(() => {
          saveModal.style.display = "none";
          document.getElementById("saveTitleInput").value = "";
          document.getElementById("saveDescInput").value = "";
          submitBtn.innerText = originalText;
          submitBtn.disabled = false;
          submitBtn.style.opacity = "1";
          submitBtn.style.backgroundColor = "";
          if (document.getElementById("saveMessage")) document.getElementById("saveMessage").style.display = "none";

          showToast(`已儲存：${title}`, "success");
        }, 1500);

      } catch (err) {
        showSaveMsg("❌ " + err.message, "error");
        submitBtn.innerText = "再試一次";
        submitBtn.disabled = false;
        submitBtn.style.opacity = "1";
      }
    };
  }

  // ==========================================
  // --- 2. 我的程式碼 (這裡是改動最大的地方) ---
  // ==========================================

  // [修改] 打開側邊欄 (原本是打開 Modal)
  if (openMyCodesBtn) {
    openMyCodesBtn.onclick = function (e) {
      e.preventDefault();

      // (A) 登入檢查
      if (!localStorage.getItem('algo_username')) {
        if (typeof showToast === 'function') showToast("請先登入", "warning");
        const loginBtn = document.getElementById("loginTriggerBtn");
        if (loginBtn) loginBtn.click();
        return;
      }

      // (B) [核心修改] 打開自己前，先強制關閉「演算法範例集」
      if (algoSidePanel) algoSidePanel.classList.remove("open");

      // (C) 打開「我的程式碼」
      if (myCodesSidebar) {
        if (myCodesSidebar.classList.contains("active")) {
          // 1. 如果已經打開，就關閉
          myCodesSidebar.classList.remove("active");
        } else {
          // 2. 如果沒打開，才執行原本的開啟流程

          // (B) 打開自己前，先強制關閉「演算法範例集」
          if (algoSidePanel) algoSidePanel.classList.remove("open");

          // (C) 打開「我的程式碼」並載入
          myCodesSidebar.classList.add("active");
          if (typeof loadMyCodes === 'function') loadMyCodes();
        }
      }
    };
  }

  // [修改] 關閉側邊欄
  if (closeMyCodesSidebarBtn) {
    closeMyCodesSidebarBtn.onclick = function () {
      if (myCodesSidebar) myCodesSidebar.classList.remove("active");
    };
  }

  // 這段可以同時處理兩個側邊欄的關閉邏輯
  window.addEventListener('click', function (e) {
    // (A) 關閉「我的程式碼」
    if (myCodesSidebar && myCodesSidebar.classList.contains("active")) {
      if (!myCodesSidebar.contains(e.target) &&
        e.target !== openMyCodesBtn &&
        !openMyCodesBtn.contains(e.target)) {
        myCodesSidebar.classList.remove("active");
      }
    }

    // (B) 關閉「演算法範例集」
    if (algoSidePanel && algoSidePanel.classList.contains("open")) {
      if (!algoSidePanel.contains(e.target) &&
        e.target !== algoSamplesBtn &&
        !algoSamplesBtn.contains(e.target)) {
        algoSidePanel.classList.remove("open");
      }
    }
  });

  // 重新整理
  if (refreshBtn) refreshBtn.onclick = loadMyCodes;

  // [修改] 載入列表函式 (生成側邊欄專用的 HTML)
  async function loadMyCodes() {
    if (!myCodesList) return;
    myCodesList.innerHTML = '<p style="text-align:center; padding:20px; color:#888;">載入中...</p>';
    const token = localStorage.getItem('algo_jwt_token');

    try {
      const res = await fetch('/api/codes', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("無法讀取列表");

      const data = await res.json();
      const codes = data.codes || [];

      if (codes.length === 0) {
        myCodesList.innerHTML = '<p style="text-align:center; padding:20px; color:#666;">這裡空空如也<br>快去儲存一些程式碼吧！</p>';
        return;
      }

      // 生成列表 HTML
      myCodesList.innerHTML = codes.map(code => `
                <div class="code-item" onclick="loadCodeToEditor('${code.code_uid}')" style="cursor:pointer;">
                    
                    <button class="btn-delete-code" onclick="deleteCode(event, '${code.code_uid}', '${escapeHtml(code.title)}')" title="刪除此程式碼">
                        🗑️
                    </button>

                    <div style="width:100%">
                        <h3 style="margin:0 0 8px 0; font-size:15px; color:#eee; font-weight:500; padding-right: 30px;">
                            ${escapeHtml(code.title)}
                        </h3>
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                            <span style="font-size:12px; color:#2196F3; border:1px solid rgba(33, 150, 243, 0.3); padding:1px 6px; border-radius:4px; background:rgba(33, 150, 243, 0.1);">
                                ${code.language}
                            </span>
                            <span style="font-size:12px; color:#888;">
                                ${new Date(code.created_at).toLocaleDateString()}
                            </span>
                        </div>
                        <p style="margin:0; font-size:13px; color:#999; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                            ${escapeHtml(code.desc || "無描述")}
                        </p>
                    </div>
                </div>
            `).join('');

    } catch (err) {
      myCodesList.innerHTML = `<p style="color:#ff6b6b; text-align:center; padding:20px;">載入失敗: ${err.message}</p>`;
    }
  }

  // [新增] 刪除程式碼函式 (掛在 window 上以便 HTML onclick 呼叫)
  window.deleteCode = async function (event, codeUid, codeTitle) {
    // 1. 阻止事件冒泡 (重要！不然點刪除會變成「刪除後又載入」)
    event.stopPropagation();

    const token = localStorage.getItem('algo_jwt_token');

    try {
      const res = await fetch(`/api/codes/${codeUid}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "刪除失敗");

      // 3. 成功後顯示訊息並重新整理列表
      if (typeof showToast === 'function') {
        showToast("🗑️ 刪除成功", "success");
      } else {
        alert("刪除成功");
      }

      // 重新載入列表
      loadMyCodes();

    } catch (err) {
      console.error(err);
      if (typeof showToast === 'function') {
        showToast("刪除失敗: " + err.message, "error");
      } else {
        alert("刪除失敗: " + err.message);
      }
    }
  };

  // XSS 防護小工具 (保留)
  function escapeHtml(text) {
    if (!text) return "";
    return text.replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // ==========================================
  // --- 3. 載入單一程式碼 (全域函式) ---
  // ==========================================

  // [修改] 劫持原本的載入函式，加上「自動收起側邊欄」的功能
  const originalLoadCode = window.loadCodeToEditor; // 如果有的話先存起來，避免重複定義

  window.loadCodeToEditor = async function (codeId) {
    // (A) 核心載入邏輯 (Fetch + Set Editor)
    try {
      const token = localStorage.getItem('algo_jwt_token');
      const res = await fetch(`/api/codes/${codeId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("讀取失敗");

      const data = await res.json();
      const targetCode = data.code;
      if (!targetCode) throw new Error("資料格式錯誤");

      if (aceEditor) aceEditor.setValue(targetCode.content, 1);

      const inputArea = document.getElementById("inputArea");
      if (inputArea) {
        if (targetCode.inputs && targetCode.inputs.length > 0) {
          inputArea.value = targetCode.inputs[0];
        } else {
          inputArea.value = "";
        }
      }
      saveAlgorithmDraft();

      // 成功提示
      showToast(`✅ 已載入：${targetCode.title}`, "success");

    } catch (err) {
      showToast("❌ 載入錯誤: " + err.message, "error");
    }

    // (B) 載入後自動收起側邊欄 (如果你希望它保持開啟，請註解掉下面這行)
    // if(myCodesSidebar) myCodesSidebar.classList.remove("active");
  };

  // --- Checkbox 點擊優化 (保留) ---
  const checkboxGroup = document.querySelector('.checkbox-group');
  const checkboxInput = document.getElementById('saveInputCheckbox');
  if (checkboxGroup && checkboxInput) {
    checkboxGroup.onclick = function (e) {
      if (e.target !== checkboxInput && e.target.tagName !== 'LABEL') {
        checkboxInput.checked = !checkboxInput.checked;
      }
    };
  }
});

// --- UI 更新函式 (全域) ---
function updateUserUI(username) {
  const loginBtn = document.getElementById("loginTriggerBtn");
  if (loginBtn && username) {
    // [修改] 加入人頭圖示，讓它看起來更像 User Profile
    loginBtn.innerHTML = `<span style="opacity:0.7; margin-right:4px;">👤</span> ${username}`;

    loginBtn.classList.add('logged-in');

    // 關鍵：將點擊事件指向我們剛剛定義的 handleLoginBtnClick
    if (window.handleLoginBtnClick) {
      loginBtn.onclick = window.handleLoginBtnClick;
    }
  }
}

// 頁面載入檢查
document.addEventListener('DOMContentLoaded', () => {
  const storedUser = localStorage.getItem('algo_username');
  if (storedUser) {
    updateUserUI(storedUser);
  }
});

// ==========================================
// 程式碼面板摺疊/展開控制
// ==========================================
document.addEventListener('DOMContentLoaded', function () {
  const panelBtn = document.getElementById('panelToggleBtn');
  const codePanel = document.getElementById('codePanel');

  // 防呆：確認元素存在才執行
  if (panelBtn && codePanel) {
    panelBtn.onclick = function () {
      // 1. 切換 class
      codePanel.classList.toggle('collapsed');

      // 2. 判斷狀態更換圖示與提示
      if (codePanel.classList.contains('collapsed')) {
        // 摺疊狀態：顯示向右箭頭 (準備展開)
        panelBtn.innerText = '▶';
        panelBtn.title = "展開程式碼面板";
      } else {
        // 展開狀態：顯示向左箭頭 (準備摺疊)
        panelBtn.innerText = '◀';
        panelBtn.title = "摺疊程式碼面板";
      }

      // 3. [重要] 通知 Ace Editor 重新計算大小
      // 因為寬度變了，如果不 resize，編輯器文字可能會被切掉或游標錯位
      if (aceEditor) {
        setTimeout(() => {
          aceEditor.resize();
        }, 310); // 配合 CSS transition 0.3s，稍等一下再 resize
      }
    };
  }
});

// ==========================================
//  字體縮放功能 (Ace Editor + IO 同步)
// ==========================================
document.addEventListener('DOMContentLoaded', function () {

  // 1. 輸入/輸出/Debug 區塊 (同步縮放)
  const ioIds = ['inputArea', 'outputArea', 'debugArea'];
  // 找出頁面上實際存在的元素
  const ioElements = ioIds.map(id => document.getElementById(id)).filter(el => el);

  // 取得當前基礎字體大小 (以第一個存在的元素為準，預設 14px)
  let currentIoSize = 14;
  if (ioElements.length > 0) {
    const style = window.getComputedStyle(ioElements[0]);
    currentIoSize = parseFloat(style.fontSize) || 14;
  }

  // [關鍵] 統一調整所有區塊的函式
  const setSharedIoFontSize = (delta) => {
    currentIoSize += delta;

    // 限制範圍 (8px ~ 64px)
    if (currentIoSize < 8) currentIoSize = 8;
    if (currentIoSize > 64) currentIoSize = 64;

    // 同時套用到 "所有" IO 區塊
    ioElements.forEach(el => {
      el.style.fontSize = currentIoSize + 'px';
    });
  };

  // 為每個元素綁定事件
  ioElements.forEach(el => {
    // (A) 滾輪 (Ctrl + 滾輪)
    el.addEventListener('wheel', function (e) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        // 往上滾(deltaY < 0)放大，往下滾(deltaY > 0)縮小
        const delta = (e.deltaY < 0) ? 2 : -2;
        setSharedIoFontSize(delta);
      }
    }, { passive: false });

    // (B) 鍵盤 (Ctrl + +/-)
    el.addEventListener('keydown', function (e) {
      if (e.ctrlKey || e.metaKey) {
        // 支援 = (加號鍵), +, NumPadAdd
        if (e.key === '=' || e.key === '+' || e.key === 'Add') {
          e.preventDefault();
          setSharedIoFontSize(2);
        }
        // 支援 - (減號鍵), NumPadSubtract
        else if (e.key === '-' || e.key === 'Subtract') {
          e.preventDefault();
          setSharedIoFontSize(-2);
        }
        // 支援 0 (重置)
        else if (e.key === '0') {
          e.preventDefault();
          currentIoSize = 14;
          ioElements.forEach(item => item.style.fontSize = '');
        }
      }
    });
  });


  // 2. Ace Editor 程式碼區塊 (修正後)
  // [重要修正] 直接使用 front.js 裡的 aceEditor 變數，不要加 window.
  if (typeof aceEditor !== 'undefined') {

    const changeAceFontSize = (delta) => {
      // 取得目前的字體大小 (支援 px 或 pt)
      const currentSize = parseInt(aceEditor.getFontSize()) || 14;
      let newSize = currentSize + delta;

      if (newSize < 8) newSize = 8;
      if (newSize > 64) newSize = 64;

      aceEditor.setFontSize(newSize);
    };

    // (A) 綁定 Ace 內建鍵盤指令
    aceEditor.commands.addCommands([
      {
        name: "zoomIn",
        bindKey: { win: "Ctrl-=", mac: "Command-=" },
        exec: () => changeAceFontSize(2)
      },
      {
        name: "zoomInNumPad",
        bindKey: { win: "Ctrl-Add", mac: "Command-Add" },
        exec: () => changeAceFontSize(2)
      },
      {
        name: "zoomOut",
        bindKey: { win: "Ctrl--", mac: "Command--" },
        exec: () => changeAceFontSize(-2)
      },
      {
        name: "zoomOutNumPad",
        bindKey: { win: "Ctrl-Subtract", mac: "Command-Subtract" },
        exec: () => changeAceFontSize(-2)
      },
      {
        name: "zoomReset",
        bindKey: { win: "Ctrl-0", mac: "Command-0" },
        exec: () => aceEditor.setFontSize(14)
      }
    ]);

    // (B) 綁定滾輪 (Ctrl + Scroll)
    // 使用 aceEditor.container 確保抓到正確的 DOM 元素
    if (aceEditor.container) {
      aceEditor.container.addEventListener('wheel', function (e) {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          e.stopPropagation();

          const delta = (e.deltaY < 0) ? 2 : -2;
          changeAceFontSize(delta);
        }
      }, { passive: false });
    }
  }
});

// ==========================================
//  快捷鍵：Ctrl + Enter 觸發 RUN
// ==========================================
document.addEventListener('keydown', function (e) {
  // 偵測 Ctrl + Enter (Mac 則是 Cmd + Enter)
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    // 只有當焦點不在「輸入/輸出框」時才阻止預設換行？
    // 或是乾脆直接攔截執行（通常 RUN 的優先級較高）
    // 這裡選擇直接執行，但保留 preventDefault 以免在輸入框內產生多餘換行
    e.preventDefault();

    const runBtn = document.getElementById('runBtn');

    // 確保按鈕存在，且不在 loading 狀態 (避免重複送出)
    if (runBtn && !runBtn.classList.contains('loading')) {
      // 模擬點擊
      runBtn.click();

      // 按鈕視覺回饋 (縮一下)
      runBtn.style.transform = "scale(0.95)";
      setTimeout(() => runBtn.style.transform = "", 100);
    }
  }
});

// ==========================================
//  演算法範例集 - 側邊滑出面板邏輯
// ==========================================
document.addEventListener('DOMContentLoaded', function () {

  const algoBtn = document.getElementById('algoSamplesBtn');
  const sidePanel = document.getElementById('algoSidePanel');
  const listContainer = document.getElementById('algoListContainer');

  // 取得「我的程式碼」側邊欄，以便互斥關閉
  const myCodesSidebar = document.getElementById("myCodesSidebar");

  let isSamplesLoaded = false; // 避免重複 fetch

  // --- [工具] 顯示全域浮動通知 (Toast) (保留不動) ---
  function showToast(msg, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast-msg ${type}`;
    toast.innerText = msg;
    container.appendChild(toast);
    setTimeout(() => {
      if (container.contains(toast)) container.removeChild(toast);
    }, 3500);
  }

  // 1. 按鈕點擊事件：切換面板開關 + 互斥邏輯 + 載入資料
  if (algoBtn && sidePanel) {
    // 使用 onclick 確保覆蓋掉任何殘留的事件綁定
    algoBtn.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation(); // 阻止事件冒泡

      // (A) 互斥邏輯：如果正要打開，先強制關閉「我的程式碼」
      if (!sidePanel.classList.contains('open')) {
        if (myCodesSidebar) myCodesSidebar.classList.remove("active");
      }

      // (B) 切換 open class
      sidePanel.classList.toggle('open');

      // (C) 載入資料：如果是打開狀態且還沒載入過
      if (sidePanel.classList.contains('open')) {
        if (!isSamplesLoaded) {
          fetchAlgoSamples();
        }
      }
    };

    // 點擊面板內部不要關閉
    sidePanel.addEventListener('click', function (e) {
      e.stopPropagation();
    });

    // 點擊網頁其他地方關閉面板 (提升 UX)
    // 注意：這段邏輯在上方已經有寫過通用的 window click listener，
    // 但這裡保留也無妨，或是依賴上方的通用邏輯。
    document.addEventListener('click', function (e) {
      // 如果點擊的不是按鈕，且面板是開的，就關閉
      if (sidePanel.classList.contains('open') &&
        !sidePanel.contains(e.target) &&
        e.target !== algoBtn &&
        !algoBtn.contains(e.target)) {

        sidePanel.classList.remove('open');
      }
    });
  }

  // 2. 從後端抓取範例列表
  async function fetchAlgoSamples() {
    try {
      listContainer.innerHTML = '<div class="loading-text">讀取中...</div>';

      // 呼叫後端 API
      const res = await fetch('/api/samples');

      if (!res.ok) throw new Error('無法載入範例');

      // 預期回傳樹狀 JSON 結構
      const data = await res.json();

      listContainer.innerHTML = ''; // 清空載入中...

      if (!data || data.length === 0) {
        listContainer.innerHTML = '<div class="loading-text">沒有可用的範例</div>';
        return;
      }

      // [關鍵] 開始遞迴渲染
      const menuTree = createRecursiveMenu(data);
      listContainer.appendChild(menuTree);

      isSamplesLoaded = true;

    } catch (err) {
      console.error(err);
      listContainer.innerHTML = `<div class="loading-text" style="color:red;">載入失敗<br>${err.message}</div>`;
    }
  }

  /**
   * 遞迴建立選單 DOM 的函式
   */
  function createRecursiveMenu(items) {
    const fragment = document.createDocumentFragment();

    // 1. 資料分類
    const folders = items.filter(i => i.type === 'folder');
    const codeFiles = items.filter(i => i.type === 'file' && /\.(cpp|c|js|py)$/i.test(i.name));
    const inputFiles = items.filter(i => i.type === 'file' && /\.txt$/i.test(i.name));
    const otherFiles = items.filter(i => i.type === 'file' && !/\.(cpp|c|js|py|txt)$/i.test(i.name));

    // === 2. 渲染資料夾 ===
    folders.forEach(item => {
      const folderDiv = document.createElement('div');
      folderDiv.className = 'algo-item algo-folder';

      const textSpan = document.createElement('span');
      textSpan.textContent = item.name;
      folderDiv.appendChild(textSpan);

      const subMenuDiv = document.createElement('div');
      subMenuDiv.className = 'algo-submenu';

      if (item.children && item.children.length > 0) {
        subMenuDiv.appendChild(createRecursiveMenu(item.children));
      }

      folderDiv.addEventListener('click', (e) => {
        e.stopPropagation();
        folderDiv.classList.toggle('expanded');
      });

      fragment.appendChild(folderDiv);
      fragment.appendChild(subMenuDiv);
    });

    // === 3. 渲染程式碼檔案 (並嚴格匹配測資) ===
    codeFiles.forEach(item => {
      const wrapper = document.createElement('div');
      wrapper.className = 'code-wrapper';

      // A. 程式檔本體
      const fileDiv = document.createElement('div');
      fileDiv.className = 'algo-item algo-file code-file';
      fileDiv.textContent = item.name;
      fileDiv.title = item.path;

      fileDiv.addEventListener('click', async (e) => {
        e.stopPropagation();
        await loadSampleData(item.path, null);
        // 點擊後是否要自動收起面板？看你喜好，這裡先保留開啟
        // sidePanel.classList.remove('open');
      });

      wrapper.appendChild(fileDiv);

      // B. 嚴格篩選測資
      const baseName = item.name.replace(/\.(cpp|c|js|py)$/i, '');

      const relatedInputs = inputFiles.filter(inputFile => {
        const inputName = inputFile.name;
        if (!inputName.startsWith(baseName)) return false;
        const charAfter = inputName[baseName.length];
        const validSeparators = ['-'];
        return validSeparators.includes(charAfter);
      });

      // C. 渲染測資列表
      if (relatedInputs.length > 0) {
        fileDiv.classList.add('has-inputs');

        const inputContainer = document.createElement('div');
        inputContainer.className = 'input-list-container';

        relatedInputs.forEach(inputFile => {
          let displayName = inputFile.name;
          if (displayName.startsWith(baseName)) {
            displayName = displayName.substring(baseName.length);
          }
          displayName = displayName.replace(/^[_.-]+/, '');
          if (!displayName.trim() || displayName === '.txt') {
            displayName = 'Default';
          }

          const inputDiv = document.createElement('div');
          inputDiv.className = 'input-item';
          inputDiv.textContent = displayName;
          inputDiv.title = inputFile.name;

          inputDiv.addEventListener('click', async (e) => {
            e.stopPropagation();
            await loadSampleData(item.path, inputFile.path);
            // 點選測資後，通常會希望面板收起來，方便看結果
            sidePanel.classList.remove('open');
          });

          inputContainer.appendChild(inputDiv);
        });

        wrapper.appendChild(inputContainer);
      }

      fragment.appendChild(wrapper);
    });

    // === 4. 渲染其他檔案 ===
    otherFiles.forEach(item => {
      const fileDiv = document.createElement('div');
      fileDiv.className = 'algo-item algo-file';
      fileDiv.textContent = item.name;
      fileDiv.addEventListener('click', async (e) => {
        e.stopPropagation();
        await loadSampleData(item.path, null);
      });
      fragment.appendChild(fileDiv);
    });

    return fragment;
  }

  /**
   * 載入範例資料 (支援 Code 和 Input)
   */
  async function loadSampleData(codePath, inputPath) {
    // [新增] 載入前先確保「我的程式碼」側邊欄是關閉的
    if (myCodesSidebar) myCodesSidebar.classList.remove("active");

    try {
      // 1. 載入程式碼
      if (codePath) {
        if (aceEditor) aceEditor.setValue("// 讀取中...", -1);

        const res = await fetch(`/api/samples?filename=${encodeURIComponent(codePath)}`);
        if (!res.ok) throw new Error(`無法讀取程式碼: ${codePath}`);
        const codeText = await res.text();

        if (aceEditor) {
          aceEditor.setValue(codeText, 1);
          if (typeof foldDrawBlocks === 'function') setTimeout(foldDrawBlocks, 100);
        }
      }

      // 2. 載入測資 (如果有)
      const inputArea = document.getElementById('inputArea');
      if (inputPath && inputArea) {
        inputArea.value = "(讀取測資中...)";

        const res = await fetch(`/api/samples?filename=${encodeURIComponent(inputPath)}`);
        if (!res.ok) throw new Error(`無法讀取測資: ${inputPath}`);
        const inputText = await res.text();

        inputArea.value = inputText;
        saveAlgorithmDraft();
      }

      // 成功提示 (如果有的話)
      if (typeof showToast === 'function') {
        showToast("✅ 範例載入成功", "success");
      }

    } catch (err) {
      console.error(err);
      if (typeof showToast === 'function') {
        showToast("載入失敗: " + err.message, "error");
      } else {
        alert("載入失敗: " + err.message);
      }
    }
  }
});

// =========================================
// 繪圖畫布功能 (SVG Drawing API)
// =========================================
let clearDrawingCanvas;

document.addEventListener('DOMContentLoaded', () => {
  const svg = document.getElementById('arraySvg');
  if (!svg) return;
  const NS = 'http://www.w3.org/2000/svg';

  window.isDrawingMode = false;
  let currentTool = 'none';
  let isDrawing = false;
  let startX = 0, startY = 0;
  let currentColor = '#ff0000';
  let currentSize = 3;
  let currentShape = null;
  let currentPathData = '';

  // ===== 繪圖復原/重做系統 =====
  let undoStack = [];
  let redoStack = [];
  let erasedInCurrentDrag = []; // 紀錄一次橡皮擦過程中刪除的物件

  function pushUndo(action) {
    undoStack.push(action);
    redoStack = [];
    if (undoStack.length > 50) undoStack.shift();
  }

  function undoDraw() {
    if (activeTextEdit) finalizeTextEdit();
    if (undoStack.length === 0) return;
    const action = undoStack.pop();
    redoStack.push(action);

    if (action.type === 'add') {
      if (action.element.parentNode) action.element.remove();
    } else if (action.type === 'removeMany') {
      action.elements.forEach(item => {
        const { el, parent, nextSibling } = item;
        if (nextSibling) parent.insertBefore(el, nextSibling);
        else parent.appendChild(el);
      });
    } else if (action.type === 'clear') {
      const dl = getDrawingLayer();
      action.elements.forEach(el => dl.appendChild(el));
    }
  }

  function redoDraw() {
    if (activeTextEdit) finalizeTextEdit();
    if (redoStack.length === 0) return;
    const action = redoStack.pop();
    undoStack.push(action);

    if (action.type === 'add') {
      const dl = getDrawingLayer();
      dl.appendChild(action.element);
    } else if (action.type === 'removeMany') {
      action.elements.forEach(item => item.el.remove());
    } else if (action.type === 'clear') {
      const dl = getDrawingLayer();
      dl.innerHTML = '';
    }
  }

  // ===== 文字即時編輯相關 =====
  let activeTextEdit = null;
  const hiddenTextArea = document.createElement('textarea');
  hiddenTextArea.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;width:1px;height:1px;';
  document.body.appendChild(hiddenTextArea);

  // 取得或建立塗鴉圖層，確保在 viewport 的最上層
  function getDrawingLayer() {
    const vp = document.getElementById('viewport');
    if (!vp) return null;
    let dl = document.getElementById('drawingLayer');
    if (!dl) {
      dl = document.createElementNS(NS, 'g');
      dl.id = 'drawingLayer';
      vp.appendChild(dl);
    } else {
      vp.appendChild(dl); // 移到最上層
    }
    return dl;
  }

  clearDrawingCanvas = function () {
    const dl = document.getElementById('drawingLayer');
    if (dl && dl.children.length > 0) {
      const elements = Array.from(dl.children);
      pushUndo({ type: 'clear', elements: elements });
      dl.innerHTML = '';
    }
  };

  // 將滑鼠事件轉換為 viewport 內的座標
  function getLocalCoords(e) {
    const vp = document.getElementById('viewport');
    if (!vp) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const globalToLocal = vp.getScreenCTM().inverse();
    return pt.matrixTransform(globalToLocal);
  }

  // 綁定控制列工具
  const tools = document.querySelectorAll('.drawing-toolbar .draw-tool');
  tools.forEach(btn => {
    btn.addEventListener('click', () => {
      tools.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTool = btn.dataset.tool;
      window.isDrawingMode = (currentTool !== 'none');
      if (activeTextEdit) finalizeTextEdit();

      const dl = getDrawingLayer();
      if (!dl) return;

      if (currentTool === 'none') {
        svg.style.cursor = 'grab';
        dl.style.pointerEvents = 'none';
      } else {
        dl.style.pointerEvents = 'all'; // 讓圖案可以被點擊(供橡皮擦用)
        if (currentTool === 'text') {
          svg.style.cursor = 'text';
        } else {
          svg.style.cursor = 'crosshair';
        }
      }
    });
  });

  // 綁定 Undo / Redo 按鈕
  const undoBtn = document.getElementById('undoDraw');
  const redoBtn = document.getElementById('redoDraw');
  if (undoBtn) undoBtn.addEventListener('click', undoDraw);
  if (redoBtn) redoBtn.addEventListener('click', redoDraw);

  // 全域快捷鍵 (Ctrl+Z, Ctrl+Y)
  window.addEventListener('keydown', e => {
    // 如果正在打字，且焦點在隱藏的文字區塊，則讓其原生處理文字內部的 undo
    if (activeTextEdit && document.activeElement === hiddenTextArea) return;

    if (e.ctrlKey || e.metaKey) {
      if (e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          e.preventDefault();
          redoDraw();
        } else {
          e.preventDefault();
          undoDraw();
        }
      } else if (e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redoDraw();
      }
    }
  });

  let iroPicker = null;
  let currentColorStr = 'rgba(255, 0, 0, 1)';

  const colorToggleBtn = document.getElementById('colorToggleBtn');
  const sizeSlider = document.getElementById('drawSize');
  const slidersPopup = document.getElementById('slidersPopup');
  const sizeValDisplay = document.getElementById('sizeValDisplay');

  // 初始化 iro.js (網頁版高級選色器)
  if (window.iro && document.getElementById('v3-color-picker')) {
    iroPicker = new iro.ColorPicker("#v3-color-picker", {
      width: 150,
      color: currentColorStr,
      borderWidth: 1,
      borderColor: "#e0e0e0",
      layout: [
        {
          component: iro.ui.Box,
        },
        {
          component: iro.ui.Slider,
          options: { sliderType: 'hue', sliderHeight: 20, handleRadius: 8 }
        },
        {
          component: iro.ui.Slider,
          options: { sliderType: 'alpha', sliderHeight: 20, handleRadius: 8 }
        }
      ]
    });

    const valR = document.getElementById('v3-val-r');
    const valG = document.getElementById('v3-val-g');
    const valB = document.getElementById('v3-val-b');
    const valA = document.getElementById('v3-val-a');

    const valH = document.getElementById('v3-val-h');
    const valS = document.getElementById('v3-val-s');
    const valV = document.getElementById('v3-val-v');

    const drawSizeWrapper = document.getElementById('drawSizeWrapper');

    iroPicker.on('color:change', function (color) {
      currentColorStr = color.rgbaString;
      if (colorToggleBtn) {
        colorToggleBtn.style.backgroundColor = currentColorStr;
      }

      if (drawSizeWrapper) {
        drawSizeWrapper.style.setProperty('--fill-color', currentColorStr);
      }

      if (valR) valR.textContent = color.rgba.r;
      if (valG) valG.textContent = color.rgba.g;
      if (valB) valB.textContent = color.rgba.b;
      if (valA) valA.textContent = color.rgba.a.toFixed(2);

      if (valH) valH.textContent = Math.round(color.hsv.h);
      if (valS) valS.textContent = Math.round(color.hsv.s);
      if (valV) valV.textContent = Math.round(color.hsv.v);
    });
  }

  if (colorToggleBtn && slidersPopup) {
    // 點擊顏色選取器時，打開拉桿選單
    colorToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      slidersPopup.style.display = slidersPopup.style.display === 'none' ? 'flex' : 'none';
    });
    // 點擊畫布其他地方自動關閉彈出視窗
    document.addEventListener('click', (e) => {
      if (!slidersPopup.contains(e.target) && e.target !== colorToggleBtn) {
        slidersPopup.style.display = 'none';
      }
    });
  }

  function getRgbaColor() {
    return currentColorStr;
  }

  if (sizeSlider) {
    sizeSlider.addEventListener('input', e => {
      currentSize = parseInt(e.target.value);
      const drawSizeWrapper = document.getElementById('drawSizeWrapper');
      if (drawSizeWrapper) {
        // min 1 max 20，對應比例 0 ~ 1
        const ratio = (currentSize - 1) / 19;
        drawSizeWrapper.style.setProperty('--val', `calc(8px + ${ratio} * (100% - 16px))`);
        drawSizeWrapper.style.setProperty('--ratio', ratio);
      }
    });

    // 預設初始化 (確保面板第一次打開跟目前的初始值吻合)
    const initRatio = (parseInt(sizeSlider.value) - 1) / 19;
    const drawSizeWrapper = document.getElementById('drawSizeWrapper');
    if (drawSizeWrapper) {
      drawSizeWrapper.style.setProperty('--val', `calc(8px + ${initRatio} * (100% - 16px))`);
      drawSizeWrapper.style.setProperty('--ratio', initRatio);
    }
  }

  const clearBtn = document.getElementById('clearDraw');
  if (clearBtn) {
    clearBtn.addEventListener('click', clearDrawingCanvas);
  }
  // ===== 將 textarea 內容同步到 SVG (tspan 支援多行) =====
  function syncTextContent() {
    if (!activeTextEdit) return;
    const { textNode, x } = activeTextEdit;
    const lines = hiddenTextArea.value.split('\n');
    textNode.setAttribute('xml:space', 'preserve');
    // 清空舊內容
    while (textNode.firstChild) textNode.removeChild(textNode.firstChild);
    // 每行建立一個 tspan
    lines.forEach((line, i) => {
      const tspan = document.createElementNS(NS, 'tspan');
      tspan.setAttribute('x', x);
      tspan.setAttribute('dy', i === 0 ? '0' : '1.2em');
      tspan.textContent = line.replace(/ /g, '\u00A0') || '\u200B'; // 保留行尾空白，空行用零寬空格佔位
      textNode.appendChild(tspan);
    });
  }

  // ===== 文字游標位置更新 (支援多行) =====
  function updateTextCursor() {
    if (!activeTextEdit) return;
    const { textNode, cursorLine, fontSize, x, y } = activeTextEdit;

    const pos = hiddenTextArea.selectionStart || 0;
    const before = hiddenTextArea.value.substring(0, pos);
    const lines = before.split('\n');
    const lineIdx = lines.length - 1;
    const colIdx = lines[lineIdx].length;

    // X 位置：用對應 tspan 的 getSubStringLength
    let cursorX = x;
    const tspans = textNode.querySelectorAll('tspan');
    if (tspans.length > lineIdx) {
      const tspan = tspans[lineIdx];
      try {
        // 跳過零寬空格佔位符
        const realText = tspan.textContent.replace(/\u200B/g, '');
        const realLen = realText.length;
        if (colIdx > 0 && realLen > 0) {
          cursorX = x + tspan.getSubStringLength(0, Math.min(colIdx, realLen));
        }
      } catch (e) {
        try { cursorX = x + tspan.getComputedTextLength(); } catch (e2) { }
      }
    }

    // Y 位置：基準 y + 行索引 * 行高
    const lineH = fontSize * 1.2;
    const cursorY = y + lineIdx * lineH;

    cursorLine.setAttribute('x1', cursorX);
    cursorLine.setAttribute('x2', cursorX);
    cursorLine.setAttribute('y1', cursorY - fontSize * 0.8);
    cursorLine.setAttribute('y2', cursorY + fontSize * 0.15);

    // 立即顯示 + 重置閃爍
    cursorLine.setAttribute('opacity', '1');
    clearInterval(activeTextEdit.blinkTimer);
    activeTextEdit.blinkTimer = setInterval(() => {
      const cur = cursorLine.getAttribute('opacity');
      cursorLine.setAttribute('opacity', cur === '0' ? '1' : '0');
    }, 530);
    updateSelection();
  }

  // ===== 反白選取視覺化 =====
  function updateSelection() {
    if (!activeTextEdit || !activeTextEdit.selGroup) return;
    const { textNode, fontSize, x, y, selGroup } = activeTextEdit;
    // 清除舊的選取矩形
    while (selGroup.firstChild) selGroup.removeChild(selGroup.firstChild);

    const s = hiddenTextArea.selectionStart;
    const e = hiddenTextArea.selectionEnd;
    if (s === e) return;

    const val = hiddenTextArea.value;
    const allLines = val.split('\n');
    const bS = val.substring(0, s).split('\n');
    const bE = val.substring(0, e).split('\n');
    const sLine = bS.length - 1, sCol = bS[sLine].length;
    const eLine = bE.length - 1, eCol = bE[eLine].length;
    const tspans = textNode.querySelectorAll('tspan');
    const lineH = fontSize * 1.2;

    for (let ln = sLine; ln <= eLine; ln++) {
      if (ln >= tspans.length) break;
      const tspan = tspans[ln];
      const real = tspan.textContent.replace(/\u200B/g, '');
      let rx = x, rw = 0;
      try {
        if (ln === sLine && ln === eLine) {
          rx = sCol > 0 && real.length > 0 ? x + tspan.getSubStringLength(0, Math.min(sCol, real.length)) : x;
          const ex = eCol > 0 && real.length > 0 ? x + tspan.getSubStringLength(0, Math.min(eCol, real.length)) : x;
          rw = ex - rx;
        } else if (ln === sLine) {
          rx = sCol > 0 && real.length > 0 ? x + tspan.getSubStringLength(0, Math.min(sCol, real.length)) : x;
          rw = (real.length > 0 ? x + tspan.getComputedTextLength() : x) - rx + fontSize * 0.3;
        } else if (ln === eLine) {
          rw = eCol > 0 && real.length > 0 ? tspan.getSubStringLength(0, Math.min(eCol, real.length)) : 0;
        } else {
          rw = real.length > 0 ? tspan.getComputedTextLength() + fontSize * 0.3 : fontSize * 0.3;
        }
      } catch (err) { continue; }
      if (rw <= 0) rw = fontSize * 0.3;
      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', rx);
      rect.setAttribute('y', y + ln * lineH - fontSize * 0.8);
      rect.setAttribute('width', rw);
      rect.setAttribute('height', fontSize);
      rect.setAttribute('fill', 'rgba(51,144,255,0.3)');
      selGroup.appendChild(rect);
    }
  }

  // ===== 完成文字編輯 =====
  function finalizeTextEdit() {
    if (!activeTextEdit) return;
    const { textNode, cursorLine, blinkTimer, selGroup } = activeTextEdit;

    clearInterval(blinkTimer);
    if (cursorLine && cursorLine.parentNode) cursorLine.remove();
    if (selGroup && selGroup.parentNode) selGroup.remove();

    // 空白文字就移除 (排除零寬空格)
    if (textNode) {
      const clean = (textNode.textContent || '').replace(/\u200B/g, '').trim();
      if (!clean && textNode.parentNode) {
        textNode.remove();
      } else if (clean) {
        pushUndo({ type: 'add', element: textNode });
      }
    }

    hiddenTextArea.oninput = null;
    hiddenTextArea.onkeydown = null;
    hiddenTextArea.onkeyup = null;
    hiddenTextArea.value = '';
    activeTextEdit = null;
  }

  // 畫箭頭常式，回傳一段 d string
  function getArrowPath(fromx, fromy, tox, toy) {
    const headlen = 10 + currentSize;
    const dx = tox - fromx;
    const dy = toy - fromy;
    const angle = Math.atan2(dy, dx);
    const p1x = tox - headlen * Math.cos(angle - Math.PI / 6);
    const p1y = toy - headlen * Math.sin(angle - Math.PI / 6);
    const p2x = tox - headlen * Math.cos(angle + Math.PI / 6);
    const p2y = toy - headlen * Math.sin(angle + Math.PI / 6);
    return `M ${fromx} ${fromy} L ${tox} ${toy} M ${tox} ${toy} L ${p1x} ${p1y} M ${tox} ${toy} L ${p2x} ${p2y}`;
  }

  // 滑鼠繪製事件
  svg.addEventListener('mousedown', e => {
    // 若為非左鍵（例如右鍵平移畫布）且正在編輯文字，不中斷打字
    if (e.button !== 0 && activeTextEdit) {
      e.preventDefault();
      setTimeout(() => hiddenTextArea.focus(), 10);
      return;
    }

    // 非文字工具時，若正在編輯文字就先完成
    if (currentTool !== 'text' && activeTextEdit) finalizeTextEdit();
    if (currentTool === 'none') return;
    if (e.button !== 0) return; // 只接受左鍵

    const dl = getDrawingLayer();
    if (!dl) return;

    // 橡皮擦：點擊繪製出來的圖形即刪除
    if (currentTool === 'eraser') {
      if (e.target.parentNode === dl) {
        dl.removeChild(e.target);
      }
      return;
    }

    // 文字工具：即時在畫布上編輯 (像小畫家)
    if (currentTool === 'text') {
      e.stopPropagation();
      e.preventDefault(); // 阻止瀏覽器把焦點搶到 SVG 上
      const coords = getLocalCoords(e);

      // 如果正在編輯另一段文字，先完成它
      if (activeTextEdit) finalizeTextEdit();

      const fontSize = (currentSize * 5 + 10);
      const color = getRgbaColor();

      // 建立 SVG <text> 元素
      const textNode = document.createElementNS(NS, 'text');
      textNode.setAttribute('x', coords.x);
      textNode.setAttribute('y', coords.y);
      textNode.setAttribute('fill', color);
      textNode.setAttribute('font-size', fontSize + 'px');
      textNode.setAttribute('font-family', 'monospace');
      textNode.setAttribute('font-weight', 'bold');
      textNode.textContent = '';
      dl.appendChild(textNode);

      // 建立閃爍游標 (垂直線)
      const cursorLine = document.createElementNS(NS, 'line');
      cursorLine.setAttribute('x1', coords.x);
      cursorLine.setAttribute('y1', coords.y - fontSize * 0.8);
      cursorLine.setAttribute('x2', coords.x);
      cursorLine.setAttribute('y2', coords.y + fontSize * 0.15);
      cursorLine.setAttribute('stroke', color);
      cursorLine.setAttribute('stroke-width', Math.max(1, fontSize / 15));
      dl.appendChild(cursorLine);

      // 閃爍動畫
      let cursorVisible = true;
      const blinkTimer = setInterval(() => {
        cursorVisible = !cursorVisible;
        cursorLine.setAttribute('opacity', cursorVisible ? '1' : '0');
      }, 530);

      // 建立選取反白群組 (插在 text 前面，讓 rect 在文字後面)
      const selGroup = document.createElementNS(NS, 'g');
      dl.insertBefore(selGroup, textNode);

      // 儲存編輯狀態
      activeTextEdit = {
        textNode, cursorLine, blinkTimer, dl, selGroup,
        fontSize, color, x: coords.x, y: coords.y
      };

      // 聚焦隱藏 textarea (延遲確保所有 mousedown handler 都跑完)
      hiddenTextArea.value = '';
      setTimeout(() => hiddenTextArea.focus(), 10);

      // 即時同步文字
      hiddenTextArea.oninput = () => {
        if (!activeTextEdit) return;
        syncTextContent();
        updateTextCursor();
      };

      // 按鍵處理
      hiddenTextArea.onkeydown = (ke) => {
        if (!activeTextEdit) return;
        if (ke.key === 'Escape') {
          ke.preventDefault();
          if (activeTextEdit.textNode.parentNode)
            activeTextEdit.textNode.remove();
          activeTextEdit.textNode = null;
          finalizeTextEdit();
          return;
        }

        // 手動處理上下鍵 (支援 Shift 選取)
        if (ke.key === 'ArrowUp' || ke.key === 'ArrowDown') {
          ke.preventDefault();
          const val = hiddenTextArea.value;
          const allLines = val.split('\n');
          const isShift = ke.shiftKey;
          const hasSel = hiddenTextArea.selectionStart !== hiddenTextArea.selectionEnd;

          // 有選取但沒按 Shift → 先 collapse 到對應端
          if (hasSel && !isShift) {
            const collapsePos = (ke.key === 'ArrowUp')
              ? hiddenTextArea.selectionStart
              : hiddenTextArea.selectionEnd;
            hiddenTextArea.selectionStart = collapsePos;
            hiddenTextArea.selectionEnd = collapsePos;
            updateTextCursor();
            return;
          }

          // 決定 anchor 與 active 端
          const dir = hiddenTextArea.selectionDirection || 'none';
          const anchor = isShift
            ? ((dir === 'backward') ? hiddenTextArea.selectionEnd : hiddenTextArea.selectionStart)
            : hiddenTextArea.selectionStart;
          const active = isShift
            ? ((dir === 'backward') ? hiddenTextArea.selectionStart : hiddenTextArea.selectionEnd)
            : hiddenTextArea.selectionEnd;

          const activeBefore = val.substring(0, active);
          const aLines = activeBefore.split('\n');
          const curLine = aLines.length - 1;
          const curCol = aLines[curLine].length;

          let targetLine;
          if (ke.key === 'ArrowUp') targetLine = Math.max(0, curLine - 1);
          else targetLine = Math.min(allLines.length - 1, curLine + 1);
          if (targetLine === curLine) return;

          const targetCol = Math.min(curCol, allLines[targetLine].length);
          let newPos = 0;
          for (let i = 0; i < targetLine; i++) newPos += allLines[i].length + 1;
          newPos += targetCol;

          if (isShift) {
            // Shift: 保留 anchor，移動 active
            if (newPos <= anchor) {
              hiddenTextArea.selectionStart = newPos;
              hiddenTextArea.selectionEnd = anchor;
              hiddenTextArea.selectionDirection = 'backward';
            } else {
              hiddenTextArea.selectionStart = anchor;
              hiddenTextArea.selectionEnd = newPos;
              hiddenTextArea.selectionDirection = 'forward';
            }
          } else {
            hiddenTextArea.selectionStart = newPos;
            hiddenTextArea.selectionEnd = newPos;
          }
          updateTextCursor();
          return;
        }

        // Home / End (手動處理，支援 Shift 選取)
        if (ke.key === 'Home' || ke.key === 'End') {
          ke.preventDefault();
          const val = hiddenTextArea.value;
          const allLines = val.split('\n');
          const isShift = ke.shiftKey;

          const dir = hiddenTextArea.selectionDirection || 'none';
          const anchor = isShift
            ? ((dir === 'backward') ? hiddenTextArea.selectionEnd : hiddenTextArea.selectionStart)
            : hiddenTextArea.selectionStart;
          const active = isShift
            ? ((dir === 'backward') ? hiddenTextArea.selectionStart : hiddenTextArea.selectionEnd)
            : hiddenTextArea.selectionEnd;

          const aLines = val.substring(0, active).split('\n');
          const curLine = aLines.length - 1;

          // 計算行首/行尾的絕對位置
          let lineStart = 0;
          for (let i = 0; i < curLine; i++) lineStart += allLines[i].length + 1;
          const lineEnd = lineStart + allLines[curLine].length;
          const newPos = (ke.key === 'Home') ? lineStart : lineEnd;

          if (isShift) {
            if (newPos <= anchor) {
              hiddenTextArea.selectionStart = newPos;
              hiddenTextArea.selectionEnd = anchor;
              hiddenTextArea.selectionDirection = 'backward';
            } else {
              hiddenTextArea.selectionStart = anchor;
              hiddenTextArea.selectionEnd = newPos;
              hiddenTextArea.selectionDirection = 'forward';
            }
          } else {
            hiddenTextArea.selectionStart = newPos;
            hiddenTextArea.selectionEnd = newPos;
          }
          updateTextCursor();
          return;
        }

        // Ctrl 快捷鍵 (A/C/V/X/Z/Y) 讓 textarea 原生處理，只延遲同步
        // 其他按鍵延遲更新
        setTimeout(() => {
          syncTextContent();
          updateTextCursor();
        }, 0);
      };

      // 按鍵放開時也更新
      hiddenTextArea.onkeyup = () => {
        if (!activeTextEdit) return;
        updateTextCursor();
      };

      return;
    }

    if (currentTool === 'eraser') {
      erasedInCurrentDrag = [];
    }

    isDrawing = true;
    const coords = getLocalCoords(e);
    startX = coords.x;
    startY = coords.y;

    // 預防事件被 canva.js/interaction.js 等事件處理遮蔽
    e.stopPropagation();

    if (currentTool === 'pen') {
      currentShape = document.createElementNS(NS, 'path');
      currentPathData = `M ${startX} ${startY}`;
      currentShape.setAttribute('d', currentPathData);
      currentShape.setAttribute('fill', 'none');
      currentShape.setAttribute('stroke', getRgbaColor());
      currentShape.setAttribute('stroke-width', currentSize);
      currentShape.setAttribute('stroke-linecap', 'round');
      currentShape.setAttribute('stroke-linejoin', 'round');
      dl.appendChild(currentShape);
    } else if (currentTool === 'rect') {
      currentShape = document.createElementNS(NS, 'rect');
      currentShape.setAttribute('x', startX);
      currentShape.setAttribute('y', startY);
      currentShape.setAttribute('width', 0);
      currentShape.setAttribute('height', 0);
      currentShape.setAttribute('fill', 'none');
      currentShape.setAttribute('stroke', getRgbaColor());
      currentShape.setAttribute('stroke-width', currentSize);
      dl.appendChild(currentShape);
    } else if (currentTool === 'circle') {
      currentShape = document.createElementNS(NS, 'ellipse');
      currentShape.setAttribute('cx', startX);
      currentShape.setAttribute('cy', startY);
      currentShape.setAttribute('rx', 0);
      currentShape.setAttribute('ry', 0);
      currentShape.setAttribute('fill', 'none');
      currentShape.setAttribute('stroke', getRgbaColor());
      currentShape.setAttribute('stroke-width', currentSize);
      dl.appendChild(currentShape);
    } else if (currentTool === 'arrow') {
      currentShape = document.createElementNS(NS, 'path');
      currentShape.setAttribute('fill', 'none');
      currentShape.setAttribute('stroke', getRgbaColor());
      currentShape.setAttribute('stroke-width', currentSize);
      currentShape.setAttribute('stroke-linecap', 'round');
      currentShape.setAttribute('stroke-linejoin', 'round');
      currentShape.setAttribute('d', getArrowPath(startX, startY, startX, startY));
      dl.appendChild(currentShape);
    }
  });

  window.addEventListener('mousemove', e => {
    // 橡皮擦：按著左鍵滑過標註圖形就能刪除
    if (currentTool === 'eraser') {
      const dl = getDrawingLayer();
      if (dl && e.buttons === 1 && e.target.parentNode === dl) {
        const el = e.target;
        erasedInCurrentDrag.push({ el: el, parent: dl, nextSibling: el.nextSibling });
        dl.removeChild(el);
      }
      return;
    }

    if (!isDrawing || !currentShape || currentTool === 'text') return;

    // 如果在畫布上，阻止事件傳遞
    if (e.target.closest('#arraySvg')) {
      e.stopPropagation();
    }

    const coords = getLocalCoords(e);
    const x = coords.x;
    const y = coords.y;

    if (currentTool === 'pen') {
      currentPathData += ` L ${x} ${y}`;
      currentShape.setAttribute('d', currentPathData);
    }
    else if (currentTool === 'rect') {
      currentShape.setAttribute('x', Math.min(x, startX));
      currentShape.setAttribute('y', Math.min(y, startY));
      currentShape.setAttribute('width', Math.abs(x - startX));
      currentShape.setAttribute('height', Math.abs(y - startY));
    }
    else if (currentTool === 'circle') {
      const rx = Math.abs(x - startX) / 2;
      const ry = Math.abs(y - startY) / 2;
      currentShape.setAttribute('cx', Math.min(x, startX) + rx);
      currentShape.setAttribute('cy', Math.min(y, startY) + ry);
      currentShape.setAttribute('rx', rx);
      currentShape.setAttribute('ry', ry);
    }
    else if (currentTool === 'arrow') {
      currentShape.setAttribute('d', getArrowPath(startX, startY, x, y));
    }
  });

  window.addEventListener('mouseup', e => {
    if (currentTool === 'none') return;
    if (isDrawing) {
      isDrawing = false;
      // 只有非橡皮擦且確實有建立物件時才紀錄
      if (currentTool !== 'eraser' && currentShape) {
        pushUndo({ type: 'add', element: currentShape });
      }
      currentShape = null;
      if (e.target.closest('#arraySvg')) {
        e.stopPropagation();
      }
    }
    // 橡皮擦結束時，若有刪除物件則紀錄一次歷史
    if (currentTool === 'eraser' && erasedInCurrentDrag.length > 0) {
      pushUndo({ type: 'removeMany', elements: erasedInCurrentDrag });
      erasedInCurrentDrag = [];
    }
  });
});
