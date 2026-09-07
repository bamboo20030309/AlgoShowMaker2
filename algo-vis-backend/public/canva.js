// canva.js
// 畫布初始化、無限座標格、平移、縮放核心邏輯

(function () {
  const NS = 'http://www.w3.org/2000/svg';
  let svg, viewport;
  let translateX = 0;
  let translateY = 0;
  let scale = 1;                 // 邏輯縮放（腳本 / C++ 傳入的值）
  let animationId = null;        // 用於追蹤正在進行的鏡頭動畫
  let isFirstCamera = true;      // 用於判斷是否為首次設定鏡頭
  const GRID_SPACING  = 50;      // 格線間距
  const GRID_EXTENT   = 10000;   // 世界座標覆蓋範圍半徑
  const REFERENCE_HEIGHT = 900;  // 基準高度：以此高度為標準，其他高度按比例換算

  function initCanvas() {
    svg = document.getElementById('arraySvg');

    // 1. 定義 <defs> 與無限格線 pattern
    const defs = document.createElementNS(NS, 'defs');
    const pat = document.createElementNS(NS, 'pattern');
    pat.setAttribute('id', 'gridPattern');
    pat.setAttribute('patternUnits', 'userSpaceOnUse');
    pat.setAttribute('width', GRID_SPACING);
    pat.setAttribute('height', GRID_SPACING);
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', `M ${GRID_SPACING} 0 L 0 0 0 ${GRID_SPACING}`);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#ddd');
    path.setAttribute('stroke-width', '0.5');
    pat.appendChild(path);
    defs.appendChild(pat);
    svg.appendChild(defs);

    // 2. 建立 viewport 群組並添加背景格線矩形
    viewport = document.createElementNS(NS, 'g');
    viewport.setAttribute('id', 'viewport');
    const bg = document.createElementNS(NS, 'rect');
    bg.setAttribute('x', -GRID_EXTENT);
    bg.setAttribute('y', -GRID_EXTENT);
    bg.setAttribute('width', GRID_EXTENT * 2);
    bg.setAttribute('height', GRID_EXTENT * 2);
    bg.setAttribute('fill', 'url(#gridPattern)');
    viewport.appendChild(bg);
    svg.appendChild(viewport);

    bindInteractions();
    updateTransform();
  }

  /**
   * 取得相對於基準高度的螢幕縮放係數
   * 不同高度的螢幕會得到不同的 factor，使 scale=1.0 在任何螢幕上看起來比例一致
   */
  function getScreenScaleFactor() {
    const h = document.documentElement.clientHeight || window.innerHeight;
    if (h === 0) return 1;
    return h / REFERENCE_HEIGHT;
  }

  /**
   * 套用 transform：physicalScale = scale * factor
   * translateX/Y 已經是基於 physicalScale 計算的螢幕像素值
   */
  function updateTransform() {
    const physicalScale = scale * getScreenScaleFactor();
    viewport.setAttribute(
      'transform',
      `translate(${translateX},${translateY}) scale(${physicalScale})`
    );
  }

  function bindInteractions() {
    let dragging = false;
    let startX = 0, startY = 0;

    svg.addEventListener('mousedown', e => {
      // 判斷是否可拖曳：左鍵 (0) 要看是否為繪圖模式，右鍵 (2) 永遠允許拖曳
      if (e.button === 0) {
        if (window.isDrawingMode) return;
        if (document.body.classList.contains('asm-trace-studio-open')
          && e.target.closest?.('[data-trace-binding-handle], [data-trace-source-anchor], [data-trace-camera-frame], .asm-trace-selectable, .draggable-object')) {
          return;
        }
      } else if (e.button === 2) {
        // 右鍵點到 draggable-object 時讓 GUI 編輯器處理
        if (e.target.closest && e.target.closest('.draggable-object')) return;
      } else {
        return; // 其他按鍵不處理
      }

      stopAnimation(); // 手動操作時停止動畫
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
    });

    // 禁用 SVG 上的右鍵選單，避免干擾右鍵拖曳（但在 draggable-object 上讓 GUI 編輯器接管）
    svg.addEventListener('contextmenu', e => {
      if (e.target.closest && e.target.closest('.draggable-object')) return;
      e.preventDefault();
    });
    svg.addEventListener('mousemove', e => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      startX = e.clientX;
      startY = e.clientY;
      translateX += dx;
      translateY += dy;
      updateTransform();
    });
    svg.addEventListener('mouseup', () => dragging = false);
    svg.addEventListener('mouseleave', () => dragging = false);

    svg.addEventListener('wheel', e => {
      e.preventDefault();
      stopAnimation(); // 手動操作時停止動畫
      const rect = svg.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const factor = getScreenScaleFactor();
      const oldPhysical = scale * factor;

      // 滾輪縮放
      const scrollScale = (e.deltaY < 0 ? 1.1 : 1 / 1.1);
      const newPhysical = oldPhysical * scrollScale;
      scale = newPhysical / factor; // 更新邏輯縮放

      // 以滑鼠游標為中心縮放
      const px = (mx - translateX) / oldPhysical;
      const py = (my - translateY) / oldPhysical;
      translateX = mx - newPhysical * px;
      translateY = my - newPhysical * py;
      updateTransform();
    });
  }

  window.resetCanvasView = () => {
    scale = 1;
    translateX = 40;
    translateY = 80;
    if (window.updateTransform) window.updateTransform();
  };

  // ===============================================
  // 清空畫布：保留格線背景（fill = url(#gridPattern)）
  // ===============================================
  window.clearCanvas = function (full = false) {
    const vp = window.getViewport && window.getViewport();
    if (!vp) return;

    const children = Array.from(vp.children);
    children.forEach(node => {
      const tag = node.tagName.toLowerCase();
      const fill = node.getAttribute && node.getAttribute('fill');
      const id = node.getAttribute('id');

      // 保留格線背景 AND 保留箭頭圖層 (arrow-layer)
      if (tag === 'rect' && fill === 'url(#gridPattern)') return;
      if (id === 'arrow-layer') return; // 讓 draw_arrow.js 自己管理
      if (id === 'drawingLayer') return; // 保留塗鴉層

      vp.removeChild(node);
    });

    if (full) {
      vp.setAttribute("transform", "");
      vp.removeAttribute("data-translate");
      vp.removeAttribute("data-scale");
    }

    // 呼叫箭頭清除 (現在它會執行標記，而不是真刪除)
    if (window.clearArrows) {
      window.clearArrows();
    }
  };

  /**
   * 清理所有剩餘的 data-alive="0" 物件 (Sweep)
   */
  window.sweepCanvas = function() {
    const vp = window.getViewport && window.getViewport();
    if (!vp) return;
    const targets = vp.querySelectorAll('.draggable-object[data-alive="0"]');
    targets.forEach(node => {
      // 如果是箭頭層，我們不干涉（它有自己的 Tween 管理）
      if (node.getAttribute('id') === 'arrow-layer') return;
      vp.removeChild(node);
    });
  };

  // 暴露給外部使用
  window.updateTransform = updateTransform;
  window.getViewport     = () => viewport;
  window.getScale        = () => scale * getScreenScaleFactor(); // 回傳物理縮放（供 interaction.js 等外部使用）
  window.getCameraViewport = function (requestedScale = scale) {
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const factor = getScreenScaleFactor();
    const currentPhysical = Math.max(0.0001, scale * factor);
    const nextScale = Math.max(0.05, Number(requestedScale) || scale);
    return {
      centerX: (rect.width / 2 - translateX) / currentPhysical,
      centerY: (rect.height / 2 - translateY) / currentPhysical,
      width: rect.width / (nextScale * factor),
      height: rect.height / (nextScale * factor),
      scale: nextScale,
      aspect: rect.height > 0 ? rect.width / rect.height : 16 / 9
    };
  };
  window.cameraScaleForViewportWidth = function (worldWidth) {
    if (!svg || !(Number(worldWidth) > 0)) return scale;
    return svg.getBoundingClientRect().width / (Number(worldWidth) * getScreenScaleFactor());
  };

  const AUTO_CAMERA_PADDING = Object.freeze({ horizontal: 30, vertical: 20 });

  window.getAutoCameraPadding = () => ({ ...AUTO_CAMERA_PADDING });

  window.resolveAutoCameraTarget = function (bounds, preferredScale = scale, offsetX = 0, offsetY = 0, rectOverride = null) {
    const contentWidth = Number(bounds?.width);
    const contentHeight = Number(bounds?.height);
    if (!(contentWidth > 0) || !(contentHeight > 0)) return null;

    let rect = rectOverride || svg?.getBoundingClientRect?.();
    if (!(Number(rect?.width) > 0) || !(Number(rect?.height) > 0)) {
      const parent = svg?.parentElement;
      rect = {
        width: parent?.clientWidth || 800,
        height: parent?.clientHeight || 600
      };
    }

    const factor = getScreenScaleFactor();
    const safeInsetLeft = Math.max(0, Math.min(
      Number(rect.width) * 0.48,
      Number(rect.asmSafeInsetLeft) || 0
    ));
    const availableWidth = Math.max(1, Number(rect.width) - safeInsetLeft - AUTO_CAMERA_PADDING.horizontal * 2);
    const availableHeight = Math.max(1, Number(rect.height) - AUTO_CAMERA_PADDING.vertical * 2);
    const maximumFitScale = Math.min(
      availableWidth / contentWidth,
      availableHeight / contentHeight
    ) / Math.max(0.0001, factor);
    const requestedScale = Math.min(4, Math.max(0.05, Number(preferredScale) || scale || 2));
    const requestedFits = requestedScale <= maximumFitScale + 0.0001;
    const targetScale = requestedFits
      ? requestedScale
      : Math.max(0.05, Math.min(4, maximumFitScale));
    const physicalScale = targetScale * factor;
    const left = Number(bounds.left ?? bounds.x) || 0;
    const top = Number(bounds.top ?? bounds.y) || 0;
    const right = Number.isFinite(Number(bounds.right)) ? Number(bounds.right) : left + contentWidth;
    const bottom = Number.isFinite(Number(bounds.bottom)) ? Number(bounds.bottom) : top + contentHeight;

    return {
      // setCamera places centerX at the physical canvas center. Shift the
      // camera center left so the object center lands in the unobscured area
      // to the right of the code HUD.
      centerX: (left + right) / 2 + (Number(offsetX) || 0)
        - safeInsetLeft / Math.max(0.0001, physicalScale * 2),
      centerY: (top + bottom) / 2 + (Number(offsetY) || 0),
      scale: targetScale,
      width: Number(rect.width) / physicalScale,
      height: Number(rect.height) / physicalScale,
      aspect: Number(rect.height) > 0 ? Number(rect.width) / Number(rect.height) : 16 / 9,
      paddingX: AUTO_CAMERA_PADDING.horizontal,
      paddingY: AUTO_CAMERA_PADDING.vertical,
      safeInsetLeft,
      maximumFitScale,
      preservedScale: requestedFits
    };
  };

  window.resetCameraState = () => {
    isFirstCamera = true;
    stopAnimation();
  };

  // ===============================================
  // 鏡頭控制 (Camera Control)
  // ===============================================

  let delayTimeoutId = null; // 用於延遲動畫開始的計時器

  /**
   * 停止目前的鏡頭動畫
   */
  function stopAnimation() {
    if (delayTimeoutId) {
      clearTimeout(delayTimeoutId);
      delayTimeoutId = null;
    }
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
  }

  /**
   * 平滑移動鏡頭到目標位置與縮放
   * targetX, targetY: 世界座標
   * targetScale: 邏輯縮放（不含 factor）
   */
  function animateCamera(targetX, targetY, targetScale, duration = 400) {
    stopAnimation();

    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      // 如果 SVG 還沒佈局好，直接立即設定並回傳
      const factor = getScreenScaleFactor();
      scale = targetScale;
      translateX = 0 - targetX * scale * factor;
      translateY = 0 - targetY * scale * factor;
      updateTransform();
      return;
    }

    // 延遲 100ms 後開始動畫
    delayTimeoutId = setTimeout(() => {
      delayTimeoutId = null;

      const factor = getScreenScaleFactor();

      // 計算當前視圖中心的世界座標
      const rect = svg.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const physicalScale = scale * factor;
      const startX = (centerX - translateX) / physicalScale;
      const startY = (centerY - translateY) / physicalScale;
      const startScale = scale;
      const startTime = performance.now();

      function step(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // 使用 Ease-out 效果
        const ease = 1 - Math.pow(1 - progress, 3);

        const currentX     = startX     + (targetX     - startX)     * ease;
        const currentY     = startY     + (targetY     - startY)     * ease;
        const currentScale = startScale + (targetScale - startScale) * ease;

        // 更新全域狀態
        scale = currentScale;
        const f  = getScreenScaleFactor();
        const ps = scale * f;

        // 使用動畫開始時取得的 center，避免每幀 getBoundingClientRect 的子像素差異造成抖動
        translateX = centerX - currentX * ps;
        translateY = centerY - currentY * ps;

        updateTransform();

        if (progress < 1) {
          animationId = requestAnimationFrame(step);
        } else {
          animationId = null;
        }
      }

      animationId = requestAnimationFrame(step);
    }, 100);
  }

  /**
   * 將鏡頭定位到世界座標 (x, y)，並設置邏輯縮放比例
   */
  window.setCamera = function (x, y, newScale, animate = true, duration = 400) {
    if (!svg || !viewport) return;

    // 如果是第一次設定鏡頭，強制使用非動畫模式，避免從 (0,0) 飛入
    if (isFirstCamera) {
      animate = false;
      isFirstCamera = false;
    }

    if (animate) {
      animateCamera(x, y, newScale, duration);
    } else {
      stopAnimation();

      let rect = svg.getBoundingClientRect();
      // 確保 SVG 尺寸有效，否則嘗試使用父容器尺寸
      if (rect.width === 0 || rect.height === 0) {
        const parent = svg.parentElement;
        const pw = parent ? parent.clientWidth : 800;
        const ph = parent ? parent.clientHeight : 600;
        rect = { width: pw, height: ph };
      }
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      scale = newScale;
      const physicalScale = scale * getScreenScaleFactor();
      translateX = centerX - x * physicalScale;
      translateY = centerY - y * physicalScale;

      updateTransform();
    }
  };

  /**
   * 根據 Pos 結構定位鏡頭
   */
  window.setCameraByPos = function (posSpec, newScale, animate = true) {
    const pos = window.resolvePos(posSpec);
    window.setCamera(pos.x, pos.y, newScale, animate);
  };

  /**
   * 自動調整鏡頭以容納所有可見物件
   * @param {number} zoom 優先保留的原始縮放倍率
   * @param {boolean} animate 是否使用動畫
   * @param {number} offsetX 水平偏移 (正值鏡頭右移，物體左移)
   * @param {number} offsetY 垂直偏移
   */
  window.setAutoCamera = function (zoom = 1.0, animate = true, offsetX = 0, offsetY = 0, duration = 400) {
    const vp = window.getViewport();
    if (!vp) return;

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    let found = false;

    // 取得 viewport 下的所有子物件
    Array.from(vp.children).forEach(node => {
      const tag = (node.tagName || "").toLowerCase();
      const fill = node.getAttribute && node.getAttribute('fill');
      const id = node.getAttribute('id');

      // 排除背景格線與塗鴉層
      if (tag === 'rect' && fill === 'url(#gridPattern)') return;
      if (id === 'drawingLayer') return;
      if (id === 'trace-camera-frame-overlay') return;

      // 排除箭頭層：箭頭的端點必然在已繪製物件之間，不會擴大邊界框
      // 且箭頭有 tween 動畫，在動畫完成前座標可能是舊值，會嚴重干擾鏡頭計算
      if (id === 'arrow-layer') return;

      // 排除 stepWithTween 產生的 ghost 物件（正在淡出的舊物件）
      if (node.getAttribute && node.getAttribute('data-ghost') === '1') return;

      // 進階檢查：如果 node 本身是待刪除的，直接跳過
      if (node.getAttribute && node.getAttribute('data-alive') === '0') return;

      // 如果 node 是容器，遞迴檢查子物件（避免容器內的 data-alive="0" 物件被 getBBox 計入）
      const processNode = (target, currentTX, currentTY) => {
        try {
          if (target.getAttribute && (target.getAttribute('data-alive') === '0' || target.style.display === 'none')) return;

          // 累加當前節點的 transform 位移
          let localTX = 0, localTY = 0;
          const transform = target.getAttribute('transform');
          if (transform) {
            const transMatch = /translate\s*\(\s*([+\-]?[\d\.]+)\s*[,\s]\s*([+\-]?[\d\.]+)\s*\)/.exec(transform);
            if (transMatch) {
              localTX = parseFloat(transMatch[1]);
              localTY = parseFloat(transMatch[2]);
            }
          }
          const totalTX = currentTX + localTX;
          const totalTY = currentTY + localTY;

          if (target.children.length === 0 || target.tagName.toLowerCase() === 'text' || target.tagName.toLowerCase() === 'circle') {
            const bbox = target.getBBox();
            if (bbox.width === 0 && bbox.height === 0) return;
            minX = Math.min(minX, bbox.x + totalTX);
            minY = Math.min(minY, bbox.y + totalTY);
            maxX = Math.max(maxX, bbox.x + totalTX + bbox.width);
            maxY = Math.max(maxY, bbox.y + totalTY + bbox.height);
            found = true;
          } else {
            Array.from(target.children).forEach(child => {
              processNode(child, totalTX, totalTY);
            });
          }
        } catch (e) { }
      };

      processNode(node, 0, 0);
    });

    if (!found) {
      window.resetCanvasView();
      return;
    }

    // 先保留原縮放；原縮放放不下時，改用仍可完整容納物件的最大倍率。
    let rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      // 嘗試從父容器獲取尺寸
      const parent = svg.parentElement;
      const pw = parent ? parent.clientWidth : 800;
      const ph = parent ? parent.clientHeight : 600;
      rect = { width: pw, height: ph };
    }

    rect = {
      width: Number(rect.width) || 0,
      height: Number(rect.height) || 0,
      asmSafeInsetLeft: Number(window.ASMTraceCodePresenter?.safeInsetLeft?.()) || 0
    };
    const target = window.resolveAutoCameraTarget({
      left: minX,
      top: minY,
      right: maxX,
      bottom: maxY,
      width: maxX - minX,
      height: maxY - minY
    }, zoom, offsetX, offsetY, rect);
    if (!target) return;

    window.setCamera(target.centerX, target.centerY, target.scale, animate, duration);
    return target;
  };

  // 監聽視窗大小變化：重新以目前的邏輯縮放重新對齊（確保關注點不移位）
  let lastCameraX = 0, lastCameraY = 0;

  // 包裝 setCamera，紀錄最後的目標世界座標
  const _origSetCamera = window.setCamera;
  // 注意：此處不直接覆寫，而是在 setCamera 內部紀錄
  const origSetCamera = window.setCamera;
  window.setCamera = function (x, y, newScale, animate = true, duration = 400) {
    lastCameraX = x;
    lastCameraY = y;
    origSetCamera(x, y, newScale, animate, duration);
  };

  window.addEventListener('resize', () => {
    if (svg && viewport) {
      // 使用最後的目標座標與當前邏輯縮放，靜默重新對齊
      origSetCamera(lastCameraX, lastCameraY, scale, false);
    }
  });

  document.addEventListener('DOMContentLoaded', initCanvas);
})();
