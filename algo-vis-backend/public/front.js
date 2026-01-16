// front.js
// 前端其餘互動：Ace 初始化、標籤切換、重載 script、動畫控制、分割線拖曳

// 全域：TTS 是否開聲音（false=靜音，只做默默自動播放）
let TTS_ENABLED = false;

// 全域：目前這一輪 TTS 播放的「世代編號」
// 每次按播放就 +1，pause 時也 +1 讓舊 callback 全失效
let TTS_RUN_ID = 0;


// 初始化 Ace
const aceEditor = ace.edit("editor");
aceEditor.setTheme("ace/theme/monokai");
aceEditor.session.setMode("ace/mode/c_cpp");
aceEditor.setOptions({
  fontSize: "14pt",
  wrap: true,
  showPrintMargin: false
});

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
  const endMarker   = "//}";

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
function foldDrawBlocks() {
  const session = aceEditor.getSession();
  const blocks = getDrawBlocks(session);
  blocks.forEach(range => {
    const placeholder = "<->";
    session.addFold(placeholder, range);
  });
}


/**
 * 把所有 //draw{ ... //} 區塊展開
 */
function unfoldDrawBlocks() {
  const session = aceEditor.getSession();
  const folds = session.getAllFolds();
  folds.forEach(f => session.removeFold(f));
}

/**
 * 切換：有摺疊就全部展開，沒有就全部摺疊
 *（給 HTML 的按鈕 onclick 用）
 */
let isFold = true;
function toggleDrawBlocks() {
  const btn = document.getElementById('toggleDrawBlocksBtn');
  if (isFold) {
    // 展開
    unfoldDrawBlocks();
    btn.textContent = "摺疊 draw";
    btn.classList.remove("active");
    isFold = false;
  } else {
    // 摺疊
    foldDrawBlocks();
    btn.textContent = "展開 draw";
    btn.classList.add("active");
    isFold = true;
  }
}


// ====== 多個高亮控制 API ======

// 用來記錄「所有自訂的高亮」： key = markerId, value = { lineNum, range }
let editorMarkers = {};

/**
 * 新增一個高亮，回傳該高亮的 markerId（你之後可以用來刪除）
 * @param {number} lineNum - 程式碼行號 (1-based)
 * @returns {number|null} markerId
 */
function addEditorHighlight(lineNum) {
  if (!lineNum || lineNum < 1) return null;

  const session = aceEditor.getSession();
  const row = lineNum - 1;
  const range = new Range(row, 0, row, Infinity);

  const markerId = session.addMarker(range, "code-highlight-line", "fullLine");
  editorMarkers[markerId] = { lineNum, range };

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
  const session = aceEditor.getSession();
  for (const idStr of Object.keys(editorMarkers)) {
    const id = Number(idStr);
    session.removeMarker(id);
  }
  editorMarkers = {};
}

// 點一下左邊行號(gutter)就讓高光消失
aceEditor.on("click", function(e) {
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
    aceEditor.setValue(code, -1);
    // 一載入就自動把 //draw 區塊摺疊起來
    setTimeout(foldDrawBlocks, 0);
    isFold = false;
  })
  .catch(err => {
    console.error(err);
    // 若讀檔失敗，再 fallback 回原本的初始範例
    const fallbackCode = `#include <bits/stdc++.h>
#include "AV.hpp"
using namespace std;
int main() {
    vector<int> num;
    AV av;
    av.start_draw();
    for (int i = 0; i < 20; i++) {
        num.push_back(i);
        av.start_frame_draw();
        av.frame_draw("num", 0, 0, num, {i-1}, {i-1}, {0}, 0, "normal", 0, 1, false, false);
        av.frame_draw("heap", 0, 150, num, {i-1}, {i-1}, {0}, 0, "heap", 10, 1, false, false);
        if(i==3 || i==7) {
            av.key_frame_draw("num", 0, 0, num, AV::AtoB(0,i), {i-1}, {0}, 0, "normal", 0, 1, false, false);
            av.key_frame_draw("heap", 0, 150, num, AV::AtoB(0,i), {i-1}, {0}, 0, "heap", 10, 1, false, false);
        }
        av.end_frame_draw();
    }
    av.end_draw();
    return 0;
}`;
    aceEditor.setValue(fallbackCode, -1);
    // fallback 也一樣一開始就摺疊
    setTimeout(foldDrawBlocks, 0);
  });



// === 幀與幀之間的過渡動畫（tween） ===
// r,g,b,a 線性補間
function lerpColorWithAlpha(c1, c2, t) {
  return {
    r: Math.round(c1.r + (c2.r - c1.r) * t),
    g: Math.round(c1.g + (c2.g - c1.g) * t),
    b: Math.round(c1.b + (c2.b - c1.b) * t),
    a: (c1.a + (c2.a - c1.a) * t),
  };
}

// 將任何 CSS 顏色格式（含 "red" "blue"）轉成 {r,g,b,a}
function parseColorWithAlpha(fill, alpha = 1) {
  if (!fill) return null;

  let s = fill.trim().toLowerCase();

  // ============ 若有 rgba(...) 先處理 ============
  if (s.startsWith("rgba")) {
    const m = s.match(/rgba\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([0-9.]+)\s*\)/);
    if (m) {
      return {
        r: Number(m[1]),
        g: Number(m[2]),
        b: Number(m[3]),
        a: Number(m[4])
      };
    }
  }

  // ============ 若是 rgb(...) ============
  if (s.startsWith("rgb")) {
    const m = s.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
    if (m) {
      return {
        r: Number(m[1]),
        g: Number(m[2]),
        b: Number(m[3]),
        a: alpha
      };
    }
  }

  // ============ CSS 顏色名稱（EX: "red", "blue"） ============
  // 利用 canvas 解析 CSS 名稱 → 轉成 rgb()
  if (!s.startsWith("#")) {
    const ctx = parseColorWithAlpha._ctx ||
      (parseColorWithAlpha._ctx = document
        .createElement("canvas")
        .getContext("2d"));

    ctx.fillStyle = "#000"; // reset
    ctx.fillStyle = s;      // 這裡 browser 會自動解析顏色名稱
    s = ctx.fillStyle;
  }

  // ============ 若是 hex(#fff / #ffffff) ============
  if (s.startsWith("#")) {
    let hex = s.slice(1);
    if (hex.length === 3) {
      hex = hex.split("").map(c => c + c).join("");
    }
    if (hex.length === 6) {
      return {
        r: parseInt(hex.substring(0, 2), 16),
        g: parseInt(hex.substring(2, 4), 16),
        b: parseInt(hex.substring(4, 6), 16),
        a: alpha
      };
    }
  }

  // 若 browser 能解析，computed 會變成 "rgb(r,g,b)"
  const m2 = s.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);

  if (m2) {
    return {
      r: Number(m2[1]),
      g: Number(m2[2]),
      b: Number(m2[3]),
      a: alpha
    };
  }

  return null;
}


// 統一的 rect key 產生器：避免不同用途的 rect 撞在一起
function getRectKey(rect) {
  return (
    rect.getAttribute('data-av-key') || // 若有自訂 key 就優先用
    [
      rect.getAttribute('x')      || '0',
      rect.getAttribute('y')      || '0',
      rect.getAttribute('width')  || '0',
      rect.getAttribute('height') || '0',
      rect.getAttribute('stroke') || '',          // 區分有無邊框 / 顏色不同
      rect.getAttribute('class')  || ''           // 區分 highlight / normal 等
    ].join('|')
  );
}

// 讀出目前畫布上所有 .draggable-object 的狀態：位置 + 每個 rect 的顏色／透明度
function snapshotDraggablePositions() {
  const vp = window.getViewport && window.getViewport();
  const map = {};
  if (!vp) return map;

  vp.querySelectorAll('.draggable-object').forEach(g => {
    const id = g.id;
    if (!id) return;

    const [baseX, baseY] = (g.getAttribute('data-base-offset') || '0,0')
      .split(',').map(Number);
    const [dx, dy] = (g.getAttribute('data-translate') || '0,0')
      .split(',').map(Number);

    const rects = Array.from(g.querySelectorAll('rect'));
    const rectState = {};

    rects.forEach(r => {
      const key = getRectKey(r);

      rectState[key] = {
        fill:  (r.getAttribute('fill') || '').trim(),
        alpha: r.hasAttribute('fill-opacity')
          ? (parseFloat(r.getAttribute('fill-opacity')) || 1)
          : 1
      };
    });

    map[id] = {
      x: baseX + dx,
      y: baseY + dy,
      rectState  // map: key -> {fill, alpha}
    };
  });

  return map;
}


// 做一次「帶過渡動畫」的步進
// rawStepFn: 你原本要做的 CodeScript.next / prev / next_key_frame...
// duration: 動畫時間（毫秒）

function stepWithTween(rawStepFn, duration = 300) {
  const vp = window.getViewport && window.getViewport();
  if (!vp || typeof rawStepFn !== 'function') {
    // 沒有畫布或沒給函式 → 直接 fallback
    rawStepFn && rawStepFn();
    syncCurrentFrameFromCodeScript();
    return;
  }

  // 1. 記錄「步進前」的狀態（位置 + 顏色）
  const before = snapshotDraggablePositions();

  // 2. 真的走一步（會呼叫 renderFrame，畫出下一幀）
  rawStepFn();
  syncCurrentFrameFromCodeScript();

  // 3. 記錄「步進後」的狀態
  const after = snapshotDraggablePositions();

  const ids = Object.keys(after);
  if (ids.length === 0) {
    // 沒東西可動畫，直接結束
    return;
  }

  const startTime = performance.now();

  function animate(now) {
    let t = (now - startTime) / duration;
    if (t > 1) t = 1;
    if (t < 0) t = 0;

    ids.forEach(id => {
      const endState   = after[id];
      const startState = before[id] || endState;

      const g = vp.querySelector('#' + CSS.escape(id));
      if (!g || !endState) return;

      // ========= 判斷有沒有變化 =========

      // 位置是否變動
      const posChanged = (
        startState.x !== endState.x ||
        startState.y !== endState.y
      );

      // 顏色是否變動（用 rectState 的 key 來比，不再看 index）
      const beforeMap = startState.rectState || {};
      const afterMap  = endState.rectState  || {};

      const allKeys = new Set([
        ...Object.keys(beforeMap),
        ...Object.keys(afterMap)
      ]);

      let hasColorDiff = false;
      for (const k of allKeys) {
        const b = beforeMap[k];
        const a = afterMap[k];

        const bFill  = b ? b.fill  : '';
        const aFill  = a ? a.fill  : '';
        const bAlpha = b ? b.alpha : 1;
        const aAlpha = a ? a.alpha : 1;

        if (bFill !== aFill || bAlpha !== aAlpha) {
          hasColorDiff = true;
          break;
        }
      }

      // 完全沒變化就直接跳過
      if (!posChanged && !hasColorDiff) {
        return;
      }

      // ========= 位置補間（群組 transform） =========

      const fromX = startState.x;
      const fromY = startState.y;
      const toX   = endState.x;
      const toY   = endState.y;

      const curX  = fromX + (toX - fromX) * t;
      const curY  = fromY + (toY - fromY) * t;

      const [baseX, baseY] = (g.getAttribute('data-base-offset') || '0,0')
        .split(',').map(Number);
      const dx = curX - baseX;
      const dy = curY - baseY;

      g.setAttribute('data-translate', `${dx},${dy}`);
      g.setAttribute('transform', `translate(${curX},${curY})`);

      // ========= 顏色 + 透明度補間（每個 rect，靠 key 對應） =========

      const rects = Array.from(g.querySelectorAll('rect'));

      rects.forEach(rect => {
        const key = getRectKey(rect);

        const beforeInfo = beforeMap[key];
        const afterInfo  = afterMap[key];

        // 完全新出現的 rect：before 沒有、after 有
        // 完全消失的 rect：before 有、after 沒有（通常下一幀就不畫了，可以忽略）
        const dst = afterInfo || beforeInfo;
        if (!dst) return;

        const beforeFill  = beforeInfo ? beforeInfo.fill  : dst.fill;
        const afterFill   = dst.fill;
        const beforeAlpha = beforeInfo ? beforeInfo.alpha : 1;
        const afterAlpha  = dst.alpha != null ? dst.alpha  : 1;

        // 完全一樣就不用補間
        if (beforeFill === afterFill && beforeAlpha === afterAlpha) {
          return;
        }

        const c1 = parseColorWithAlpha(beforeFill, beforeAlpha);
        const c2 = parseColorWithAlpha(afterFill,  afterAlpha);

        if (!c1 || !c2) {
          // 解析失敗就直接套目標狀態（避免填成空字串）
          if (afterFill) {
            rect.setAttribute('fill', afterFill);
          } else if (beforeFill) {
            rect.setAttribute('fill', beforeFill);
          }
          rect.setAttribute('fill-opacity', String(afterAlpha));
          return;
        }

        const tColor = t; // 你要做 easing 可以改這裡，例如 1-(1-t)*(1-t)
        const ci = lerpColorWithAlpha(c1, c2, tColor);

        rect.setAttribute('fill', `rgb(${ci.r},${ci.g},${ci.b})`);
        rect.setAttribute('fill-opacity', String(ci.a));
      });
    });

    if (t < 1) {
      requestAnimationFrame(animate);
    } else {
      // ========= 收尾：對齊「步進後」最終狀態 =========
      ids.forEach(id => {
        const endState = after[id];
        const g2 = vp.querySelector('#' + CSS.escape(id));
        if (!g2 || !endState) return;

        const finalMap = endState.rectState || {};
        const rects2 = Array.from(g2.querySelectorAll('rect'));

        rects2.forEach(rect => {
          const key = getRectKey(rect);
          const info = finalMap[key];
          if (!info) return;

          if (info.fill) {
            rect.setAttribute('fill', info.fill.trim());
          }
          rect.setAttribute(
            'fill-opacity',
            String(info.alpha != null ? info.alpha : 1)
          );
        });
      });
    }
  }

  requestAnimationFrame(animate);
}
  
// 子標籤切換
function activateTab(btn) {
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.subContent').forEach(c=>c.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(btn.dataset.tab).classList.add('active');
}
document.querySelectorAll('.tab-btn').forEach(btn =>
  btn.addEventListener('click', () => activateTab(btn))
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
  const prev = document.querySelector('script[data-role="code_script"]');
  if (prev) prev.remove();
  const s = document.createElement('script');
  s.src = 'code_script.js?ts=' + Date.now();
  s.setAttribute('data-role','code_script');
  s.onload = () => {
    if (window.CodeScript?.reset) window.CodeScript.reset();
    // CodeScript 準備好後再呼叫 callback
    if (typeof onReady === 'function') onReady();
  };
  document.body.appendChild(s);
}


// ==============================
// 幀條碼：狀態與工具函式
// ==============================

// 總幀數 / 目前幀 / 關鍵幀索引
let totalFrames      = 0;
let currentFrame     = 0;       // 0-based
let keyFrameIndices  = [];

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
  if (typeof CodeScript.goto === "function")    return CodeScript.goto(idx);
  if (typeof CodeScript.set_frame === "function") return CodeScript.set_frame(idx);
}

// 初始化幀資訊（在 reloadCodeScript 之後呼叫）---
function initFrameInfoFromCodeScript() {
  totalFrames     = csGetFrameCount();
  keyFrameIndices = csGetKeyFrames();
  currentFrame    = csGetCurrentFrameIndex();

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

    bar.addEventListener("click", () => {
      jumpToFrame(i);
    });

    barsContainer.appendChild(bar);
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
  });
}

// 更新「第幾幀 / 總幀數」文字
function updateFrameInfoText() {
  const info = document.getElementById("frameInfo");
  if (!info) return;

  const now   = (currentFrame || 0) + 1;  // 顯示給使用者 1-based
  const total = totalFrames || 0;
  info.textContent = `第 ${now} 幀 / 共 ${total} 幀`;
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
function syncCurrentFrameFromCodeScript() {
  currentFrame = csGetCurrentFrameIndex();
  updateFrameBarsVisual();
  updateFrameInfoText();
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
  new CanvasInteractionManager(document.getElementById('arraySvg'));

  // === 幀條碼初始化 ===
  reloadAfterRun();

  // === 控制狀態 ===
  let timer = null;
  let isPlaying = false;

  // === 元件參照 ===
  const speedSlider   = document.getElementById('speedSlider');
  const speedValue    = document.getElementById('speedValue');
  const toggleBtn     = document.getElementById('playToggleBtn');
  const restartBtn    = document.getElementById('restartBtn');
  const prevKeyBtn    = document.getElementById('prevKeyFrameBtn');
  const prevBtn       = document.getElementById('prevBtn');
  const nextBtn       = document.getElementById('nextBtn');
  const nextKeyBtn    = document.getElementById('nextKeyFrameBtn');
  const finishBtn     = document.getElementById('finishBtn');

  // === 速度 ===
  let speed = +speedSlider.value;

  // 把滑桿的值映射成 TTS rate（0.5x ~ 2.0x）
  function getTtsRate() {
    const val = Number(speedSlider.value) || 0;
    const min = Number(speedSlider.min) || 100;   // 若 HTML 沒設，就假設 100~1500
    const max = Number(speedSlider.max) || 1500;

    const clamped = Math.max(min, Math.min(max, val));
    const norm = (clamped - min) / (max - min); // 0..1，越大越慢
    const inv  = 1 - norm;                      // 1..0，越大越快

    const minRate = 0.5;
    const maxRate = 2.0;
    return minRate + inv * (maxRate - minRate);
  }

  const updateSpeedLabel = () => {
    const rate = getTtsRate();
    // 例如顯示「語速 1.2x」
    speedValue.textContent = `語速 ${rate.toFixed(1)}x`;
  };
  updateSpeedLabel();

  // === UI 同步（整合 ▶ / ⏸）===
  function syncPlayToggleUI() {
    if (!toggleBtn) return;
    toggleBtn.textContent = isPlaying ? '⏸' : '▶';
    toggleBtn.setAttribute('aria-pressed', isPlaying ? 'true' : 'false');
    toggleBtn.classList.toggle('playing', isPlaying);
  }

  // TTS 驅動的自動播放：讀完目前幀 → 決定下一步
  function playFromCurrentFrameWithTTS(runId) {
    // 如果已經被暫停，或這個 callback 是舊世代，就不要做事
    if (!isPlaying || runId !== TTS_RUN_ID) return;

    const content = collectMessageTextInCurrentFrame();

    const afterSpeak = () => {
      // 再檢查一次（避免 onend 在 pause 或重新播放後才觸發）
      if (!isPlaying || runId !== TTS_RUN_ID) return;

      const cur   = csGetCurrentFrameIndex();
      const total = csGetFrameCount();

      if (typeof CodeScript === 'undefined') {
        isPlaying = false;
        syncPlayToggleUI();
        if (typeof stopStepAuto === 'function') stopStepAuto();
        return;
      }

      console.log(CodeScript.is_skip_frame(cur));

      // 1) skip_frame：跳過區段 → 直接跳到下一個停靠幀或最後，然後停播
      if (typeof CodeScript.is_skip_frame === 'function' &&
          CodeScript.is_skip_frame(cur)) {
      
        if (typeof gotoNextStopOrEnd === 'function') {
          gotoNextStopOrEnd();
        }

        fast = false;
        isPlaying = false;
        syncPlayToggleUI();
        if (typeof stopStepAuto === 'function') stopStepAuto();
        return;
      }

      // 2) stop_frame：停在這幀，不再往下走
      if (typeof CodeScript.is_stop_frame === 'function' &&
          CodeScript.is_stop_frame(cur)) {

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

      // 4) fast_frame：直接點一下下一大步
      if (typeof CodeScript.is_fast_frame === 'function' &&
          CodeScript.is_fast_frame(cur)) {
        const Old = CodeScript.get_current_frame_index();
        CodeScript.next_key_frame();
        CodeScript.prev();
        const New = CodeScript.get_current_frame_index();
        if(Old > New) {
          const last = CodeScript.get_frame_count()-1;
          stepWithTween(() => CodeScript.goto(last));
          return;
        }
      }

      // 5) faston_frame：從這幀開始改用 key_frame 模式
      if (typeof CodeScript.is_faston_frame === 'function' &&
          CodeScript.is_faston_frame(cur)) {
        fast = true;
      }

      // 6) 正常往下一幀
      if (fast && typeof CodeScript.next_key_frame === 'function') {
        stepWithTween(() => CodeScript.next_key_frame());
      } else if (typeof CodeScript.next === 'function') {
        stepWithTween(() => CodeScript.next());
      }
      syncCurrentFrameFromCodeScript();

      // 7) 繼續自動播下一幀（用同一個 runId）
      playFromCurrentFrameWithTTS(runId);
    };

    const fallbackDelay = () => {
      const delay = Math.max(60, speed || 500);
      setTimeout(() => {
        // timeout 到的時候也要檢查世代
        if (!isPlaying || runId !== TTS_RUN_ID) return;
        afterSpeak();
      }, delay);
    };

    if (!content) {
      fallbackDelay();
      return;
    }

    if (typeof speakText !== 'function') {
      console.warn('[TTS] 找不到 speakText 函式，改用 delay 播放。');
      fallbackDelay();
      return;
    }

    const volume = TTS_ENABLED ? 0.3 : 0.0;
    const rate   = getTtsRate();

    speakText(content, {
      lang: 'zh-TW',
      rate,
      volume,
      preferredVoiceRegex: /(Microsoft).*(Natural|Neural).*(Chinese|Taiwan|zh[-_]?TW)/i,
      interrupt: true,
      onend: () => {
        // 這裡也要檢查世代
        if (!isPlaying || runId !== TTS_RUN_ID) return;
        afterSpeak();
      },
      onerror: () => {
        if (!isPlaying || runId !== TTS_RUN_ID) return;
        fallbackDelay();
      }
    });
  }

  // === 播放/暫停 公用函式 ===
  function play() {
    if (isPlaying) return;
    isPlaying = true;
    fast = false;
    //startTimer();
    // 開始新的一輪 TTS 播放：+1 產生新的 runId
    TTS_RUN_ID++;
    const myRunId = TTS_RUN_ID;

    syncPlayToggleUI();
    playFromCurrentFrameWithTTS(myRunId);
  }

  function pause() {
    if (!isPlaying) return;
    isPlaying = false;
    // 讓所有舊的 callback（onend / setTimeout）全部失效
    TTS_RUN_ID++;

    syncPlayToggleUI();
    try { window.speechSynthesis.cancel(); } catch {}
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
  function gotoNextStopOrEnd() {
    stopStepAuto(); // 關掉任何 auto-stepping 模式
    pause();        // 順便停播放（保險）

    const cur = csGetCurrentFrameIndex();

    // 有 get_stop_frames 的情況
    if (typeof CodeScript.get_stop_frames === "function") {
      const stops = CodeScript.get_stop_frames();

      if (Array.isArray(stops) && stops.length > 0) {
        // 找出比目前更後面的停靠幀
        const nextStops = stops.filter(s => s > cur);

        // 還有「未來停靠幀」→ 跳到最小的那個
        if (nextStops.length > 0) {
          const nextStop = Math.min(...nextStops);
          CodeScript.goto(nextStop);
          syncCurrentFrameFromCodeScript();
          return;
        }
      }
    }

    // 否則 → 沒有下一個 stop，跳到最後一個 frame
    CodeScript.goto(-1);
    syncCurrentFrameFromCodeScript();
  }

  // === 全域：目前是否有「自動連續步進」在跑 ===
  const stepAuto = {
    activeBtn: null,
    intervalId: null,
    stepFn: null,
    direction: 0,   // +1 往後, -1 往前, 0 不管方向
  };

  function stopStepAuto() {
    if (stepAuto.intervalId) {
      clearInterval(stepAuto.intervalId);
      stepAuto.intervalId = null;
    }
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

    stepAuto.activeBtn  = btn;
    stepAuto.stepFn     = stepFn;
    stepAuto.direction  = direction;
    btn.classList.add('auto-stepping');

    stepAuto.intervalId = setInterval(() => {
      const before = csGetCurrentFrameIndex();

      stepFn();                       // 走一步
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
  bindStepButton(prevKeyBtn, () => stepWithTween(() => CodeScript.prev_key_frame(), 300), -1);
  bindStepButton(nextKeyBtn, () => stepWithTween(() => CodeScript.next_key_frame(), 300), +1);

  // 上一步 / 下一步：可長按切換自動模式
  bindStepButton(prevBtn, () => stepWithTween(() => CodeScript.prev(), 300), -1);
  bindStepButton(nextBtn, () => stepWithTween(() => CodeScript.next(), 300), +1);

  // 跳到最後：維持你目前的「跳到下一個 stopFrame」邏輯
  bindAction(finishBtn, () => gotoNextStopOrEnd());


  // === ▶ / ⏸ 整合按鈕 ===
  if (toggleBtn) {
    toggleBtn.onclick = togglePlay;
  }

  // 只收集「訊息文字」：drawText / drawColoredText 產生的文字
  function collectMessageTextInCurrentFrame() {
    const vp = window.getViewport && window.getViewport();
    if (!vp) return "";

    const msgGroups = vp.querySelectorAll('g[id^="msg-"]');
    if (!msgGroups.length) return "";

    const parts = [];

    msgGroups.forEach(g => {
      const tAttr = g.getAttribute('data-tts-text');
      parts.push(tAttr);
    });

    return parts.join('。');
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
  el.addEventListener('keydown', function(e) {
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
(function() {
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

// === TTS 按鈕：只控制「有聲 / 靜音」，不負責切幀 ===
(function () {
  function bindTTSToggleButton() {
    const btn = document.getElementById('ttsAvBtn');
    if (!btn) return;

    btn.addEventListener('click', () => {
      TTS_ENABLED = !TTS_ENABLED;

      // 視覺效果：開聲音時亮起
      btn.classList.toggle('active', TTS_ENABLED);

      if (!TTS_ENABLED) {
        // 關聲音就把正在播的聲音停掉（但不影響動畫）
        try { window.speechSynthesis.cancel(); } catch {}
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindTTSToggleButton);
  } else {
    bindTTSToggleButton();
  }
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
      // 更新文字狀態
      toggleFoldBtn.textContent = isFold ? "展開 draw 區塊" : "摺疊 draw 區塊";
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
       if(grid) {
         const currentDisplay = grid.style.display;
         grid.style.display = currentDisplay === 'none' ? 'block' : 'none';
       }
    };
  }
}

// ==========================================
// 登入/註冊/登出/忘記密碼 模態視窗控制邏輯
// ==========================================

document.addEventListener('DOMContentLoaded', function() {
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
        if(forgotBtn) forgotBtn.style.display = 'none'; // 預設隱藏

        if (isResetMode) {
            // === 模式 1: 重置密碼 (輸入新密碼) ===
            modalTitle.innerText = "重置密碼";
            actionBtn.innerText = "確認修改";
            
            // 只顯示密碼框
            const passwordGroup = document.getElementById("passwordInput").closest('.form-group');
            if(passwordGroup) passwordGroup.style.display = 'block';
            
            showMsg("驗證成功！請輸入您的新密碼。", "success");
        } 
        else if (isForgotMode) {
            // === 模式 2: 忘記密碼 (輸入 Email) ===
            modalTitle.innerText = "忘記密碼";
            actionBtn.innerText = "發送重置信";
            
            // 只顯示帳號(Email)框
            const usernameGroup = document.getElementById("usernameInput").closest('.form-group');
            if(usernameGroup) usernameGroup.style.display = 'block';
            
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
            if(forgotBtn) forgotBtn.style.display = 'inline'; // 顯示忘記密碼

            if(isLoginMode) {
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
    if(isResetMode) {
        updateModalUI();
    }

    // --- 6. 事件綁定 ---

    // (A) 打開視窗 (登入按鈕點擊)
    window.handleLoginBtnClick = function() {
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
        closeSpan.onclick = function() { loginModal.style.display = "none"; };
    }
    window.onclick = function(event) {
        if (event.target == loginModal)   loginModal.style.display = "none";
        if (event.target == saveModal)    saveModal.style.display = "none";
    };

    // (C) 忘記密碼按鈕
    if (forgotBtn) {
        forgotBtn.onclick = function(e) {
            e.preventDefault();
            isForgotMode = true;
            isLoginMode = false;
            updateModalUI();
        };
    }

    // (D) 切換按鈕 (建立帳號 / 回到登入)
    if (toggleBtn) {
        toggleBtn.onclick = function(e) {
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
        authForm.onsubmit = async function(e) {
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
                    if(!res.ok) throw new Error(data.error);
                    showMsg(data.message, "success");
                } catch(err) {
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
                    if(!res.ok) throw new Error(data.error);
                    showMsg(data.message, "success");
                    setTimeout(() => {
                        isResetMode = false;
                        currentResetToken = null;
                        isLoginMode = true;
                        updateModalUI();
                        if(passwordInput) passwordInput.value = "";
                    }, 1500);
                } catch(err) {
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
                    updateUserUI(data.username);
                    
                    setTimeout(() => {
                        loginModal.style.display = "none";
                        if(passwordInput) passwordInput.value = "";

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
                        if(usernameInput) usernameInput.value = username;
                        if(passwordInput) passwordInput.value = "";
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
            if(container.contains(toast)) container.removeChild(toast);
        }, 3500);
    }

    // ==========================================
    // --- 1. 儲存程式碼 (這部分完全保留原本的) ---
    // ==========================================
    
    if(openSaveBtn) {
        openSaveBtn.onclick = function(e) {
            e.preventDefault();
            if (!localStorage.getItem('algo_username')) {
                showToast("請先登入會員才能儲存程式碼", "warning");
                const loginBtn = document.getElementById("loginTriggerBtn");
                if(loginBtn) loginBtn.click();
                return;
            }
            showSaveMsg("", ""); 
            if(document.getElementById("saveMessage")) document.getElementById("saveMessage").style.display = "none";
            
            if(saveModal) saveModal.style.display = "block";
            if(document.getElementById("saveLangSelect")) document.getElementById("saveLangSelect").value = "cpp"; 
        };
    }
    if(closeSaveBtn) closeSaveBtn.onclick = () => saveModal.style.display = "none";

    if(saveForm) {
        saveForm.onsubmit = async function(e) {
            e.preventDefault();
            
            showSaveMsg("", "");
            if(document.getElementById("saveMessage")) document.getElementById("saveMessage").style.display = "none";

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
                if(!res.ok) throw new Error(data.error || "儲存失敗");

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
                    if(document.getElementById("saveMessage")) document.getElementById("saveMessage").style.display = "none";
                    
                    showToast(`已儲存：${title}`, "success");
                }, 1500);

            } catch(err) {
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
    if(openMyCodesBtn) {
        openMyCodesBtn.onclick = function(e) {
            e.preventDefault();
            
            // (A) 登入檢查
            if (!localStorage.getItem('algo_username')) {
                if(typeof showToast === 'function') showToast("請先登入", "warning");
                const loginBtn = document.getElementById("loginTriggerBtn");
                if(loginBtn) loginBtn.click();
                return;
            }

            // (B) [核心修改] 打開自己前，先強制關閉「演算法範例集」
            if(algoSidePanel) algoSidePanel.classList.remove("open");

            // (C) 打開「我的程式碼」
            if(myCodesSidebar) {
                if (myCodesSidebar.classList.contains("active")) {
                    // 1. 如果已經打開，就關閉
                    myCodesSidebar.classList.remove("active");
                } else {
                    // 2. 如果沒打開，才執行原本的開啟流程
                    
                    // (B) 打開自己前，先強制關閉「演算法範例集」
                    if(algoSidePanel) algoSidePanel.classList.remove("open");

                    // (C) 打開「我的程式碼」並載入
                    myCodesSidebar.classList.add("active");
                    if(typeof loadMyCodes === 'function') loadMyCodes();
                }
            }
        };
    }
    
    // [修改] 關閉側邊欄
    if(closeMyCodesSidebarBtn) {
        closeMyCodesSidebarBtn.onclick = function() {
            if(myCodesSidebar) myCodesSidebar.classList.remove("active");
        };
    }

    // 這段可以同時處理兩個側邊欄的關閉邏輯
    window.addEventListener('click', function(e) {
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
    if(refreshBtn) refreshBtn.onclick = loadMyCodes;

    // [修改] 載入列表函式 (生成側邊欄專用的 HTML)
    async function loadMyCodes() {
        if(!myCodesList) return;
        myCodesList.innerHTML = '<p style="text-align:center; padding:20px; color:#888;">載入中...</p>';
        const token = localStorage.getItem('algo_jwt_token');

        try {
            const res = await fetch('/api/codes', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if(!res.ok) throw new Error("無法讀取列表");
            
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

        } catch(err) {
            myCodesList.innerHTML = `<p style="color:#ff6b6b; text-align:center; padding:20px;">載入失敗: ${err.message}</p>`;
        }
    }

    // [新增] 刪除程式碼函式 (掛在 window 上以便 HTML onclick 呼叫)
    window.deleteCode = async function(event, codeUid, codeTitle) {
        // 1. 阻止事件冒泡 (重要！不然點刪除會變成「刪除後又載入」)
        event.stopPropagation();

        const token = localStorage.getItem('algo_jwt_token');

        try {
            const res = await fetch(`/api/codes/${codeUid}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const data = await res.json();
            
            if(!res.ok) throw new Error(data.error || "刪除失敗");

            // 3. 成功後顯示訊息並重新整理列表
            if(typeof showToast === 'function') {
                showToast("🗑️ 刪除成功", "success");
            } else {
                alert("刪除成功");
            }

            // 重新載入列表
            loadMyCodes();

        } catch(err) {
            console.error(err);
            if(typeof showToast === 'function') {
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
    
    window.loadCodeToEditor = async function(codeId) {
        // (A) 核心載入邏輯 (Fetch + Set Editor)
        try {
            const token = localStorage.getItem('algo_jwt_token');
            const res = await fetch(`/api/codes/${codeId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error("讀取失敗");
            
            const data = await res.json();
            const targetCode = data.code;
            if(!targetCode) throw new Error("資料格式錯誤");

            if(aceEditor) aceEditor.setValue(targetCode.content, 1);
            
            const inputArea = document.getElementById("inputArea");
            if(inputArea) {
                if (targetCode.inputs && targetCode.inputs.length > 0) {
                    inputArea.value = targetCode.inputs[0];
                } else {
                    inputArea.value = "";
                }
            }
            
            // 成功提示
            showToast(`✅ 已載入：${targetCode.title}`, "success");
            
        } catch(err) {
            showToast("❌ 載入錯誤: " + err.message, "error");
        }

        // (B) 載入後自動收起側邊欄 (如果你希望它保持開啟，請註解掉下面這行)
        // if(myCodesSidebar) myCodesSidebar.classList.remove("active");
    };

    // --- Checkbox 點擊優化 (保留) ---
    const checkboxGroup = document.querySelector('.checkbox-group');
    const checkboxInput = document.getElementById('saveInputCheckbox');
    if (checkboxGroup && checkboxInput) {
        checkboxGroup.onclick = function(e) {
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
document.addEventListener('DOMContentLoaded', function() {
    const panelBtn = document.getElementById('panelToggleBtn');
    const codePanel = document.getElementById('codePanel');
    
    // 防呆：確認元素存在才執行
    if (panelBtn && codePanel) {
        panelBtn.onclick = function() {
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
document.addEventListener('DOMContentLoaded', function() {

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
        el.addEventListener('wheel', function(e) {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                // 往上滾(deltaY < 0)放大，往下滾(deltaY > 0)縮小
                const delta = (e.deltaY < 0) ? 2 : -2;
                setSharedIoFontSize(delta);
            }
        }, { passive: false });

        // (B) 鍵盤 (Ctrl + +/-)
        el.addEventListener('keydown', function(e) {
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
                bindKey: {win: "Ctrl-=", mac: "Command-="},
                exec: () => changeAceFontSize(2)
            },
            {
                name: "zoomInNumPad",
                bindKey: {win: "Ctrl-Add", mac: "Command-Add"},
                exec: () => changeAceFontSize(2)
            },
            {
                name: "zoomOut",
                bindKey: {win: "Ctrl--", mac: "Command--"},
                exec: () => changeAceFontSize(-2)
            },
            {
                name: "zoomOutNumPad",
                bindKey: {win: "Ctrl-Subtract", mac: "Command-Subtract"},
                exec: () => changeAceFontSize(-2)
            },
            {
                name: "zoomReset",
                bindKey: {win: "Ctrl-0", mac: "Command-0"},
                exec: () => aceEditor.setFontSize(14)
            }
        ]);

        // (B) 綁定滾輪 (Ctrl + Scroll)
        // 使用 aceEditor.container 確保抓到正確的 DOM 元素
        if (aceEditor.container) {
            aceEditor.container.addEventListener('wheel', function(e) {
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
document.addEventListener('keydown', function(e) {
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
document.addEventListener('DOMContentLoaded', function() {
    
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
            if(container.contains(toast)) container.removeChild(toast);
        }, 3500);
    }

    // 1. 按鈕點擊事件：切換面板開關 + 互斥邏輯 + 載入資料
    if (algoBtn && sidePanel) {
        // 使用 onclick 確保覆蓋掉任何殘留的事件綁定
        algoBtn.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation(); // 阻止事件冒泡
            
            // (A) 互斥邏輯：如果正要打開，先強制關閉「我的程式碼」
            if (!sidePanel.classList.contains('open')) {
                if(myCodesSidebar) myCodesSidebar.classList.remove("active");
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
        sidePanel.addEventListener('click', function(e) {
            e.stopPropagation();
        });

        // 點擊網頁其他地方關閉面板 (提升 UX)
        // 注意：這段邏輯在上方已經有寫過通用的 window click listener，
        // 但這裡保留也無妨，或是依賴上方的通用邏輯。
        document.addEventListener('click', function(e) {
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
        if(myCodesSidebar) myCodesSidebar.classList.remove("active");

        try {
            // 1. 載入程式碼
            if (codePath) {
                if(aceEditor) aceEditor.setValue("// 讀取中...", -1);
                
                const res = await fetch(`/api/samples?filename=${encodeURIComponent(codePath)}`);
                if (!res.ok) throw new Error(`無法讀取程式碼: ${codePath}`);
                const codeText = await res.text();
                
                if(aceEditor) {
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
            }

            // 成功提示 (如果有的話)
            if(typeof showToast === 'function') {
                showToast("✅ 範例載入成功", "success");
            }

        } catch (err) {
            console.error(err);
            if(typeof showToast === 'function') {
                showToast("載入失敗: " + err.message, "error");
            } else {
                alert("載入失敗: " + err.message);
            }
        }
    }
});