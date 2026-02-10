// resolve_pos.js
;(function() {

  window.resolvePos = function(spec) {
    if (!spec) return { x: 0, y: 0 };

    // ==========================================
    // 1. 絕對位置 (Absolute)
    // ==========================================
    if (spec.type === 'abs' || ((spec.x !== undefined || spec.y !== undefined) && !spec.ref)) {
      return { 
        x: Number(spec.x || 0), 
        y: Number(spec.y || 0) 
      };
    }

    // ==========================================
    // 2. 相對位置 (Relative)
    // ==========================================
    if (spec.type === 'rel' || spec.ref) {
      const refId = spec.ref; // 對應 C++ 的 refId (或是舊版的 group)
      const vp = window.getViewport ? window.getViewport() : document;
      
      // 找到目標 DOM 元素 (通常是 <g>)
      const el = vp.querySelector('#' + CSS.escape(refId));

      if (!el) {
        console.warn(`[resolvePos] 找不到目標物件 ID: ${refId}`);
        return { x: 0, y: 0 };
      }

      // 準備計算結果
      let calculatedPos = { x: 0, y: 0 };
      const hasIndex = (spec.index !== undefined && spec.index !== null && spec.index !== -1);
      const hasRowCol = (spec.row !== undefined && spec.row !== -1);
      const anchor = spec.anchor || "center";

      // 1. 嘗試查找全域 Layout 定義
      const layoutName = spec.layout || el.getAttribute('data-layout') || 'normal';
      const layouts = window.ArrayLayout || {};
      const layout = layouts[layoutName];
      
      // -----------------------------------------------------
      // 一維陣列抓位置
      // -----------------------------------------------------
      if (hasIndex) {
        if (layout && typeof layout.getPosition === 'function') {
          calculatedPos = layout.getPosition(refId, spec.index, anchor);
        }
      }

      // -----------------------------------------------------
      // 二維陣列抓位置
      // -----------------------------------------------------
      else if (hasRowCol) {
        if (layout && typeof layout.getPosition === 'function') {
          calculatedPos = layout.getPosition(refId, spec.row, spec.col, anchor);
        }
      }

      // -----------------------------------------------------
      // 方法 D: 最通用的 BBox 計算 (整個物件)
      // -----------------------------------------------------
      else {
        calculatedPos = getFallbackBBoxPosition(el, anchor);
      }

      // 最後：加上使用者指定的額外偏移 (dx, dy)
      // C++ Pos 結構把偏移量存在 x/y 或 dx/dy
      const offX = Number(spec.dx !== undefined ? spec.dx : (spec.x || 0));
      const offY = Number(spec.dy !== undefined ? spec.dy : (spec.y || 0));

      return {
        x: calculatedPos.x + offX,
        y: calculatedPos.y + offY
      };
    }

    return { x: 0, y: 0 };
  };

  /**
   * (備用) 通用 BBox 計算邏輯
   * 當上述方法都失效時，計算整個物件的邊緣/中心
   */
  function getFallbackBBoxPosition(el, anchor) {
    let baseX = 0, baseY = 0;
    
    // 讀取 transform
    const transform = el.getAttribute('transform');
    if (transform) {
      const match = /translate\s*\(\s*([+\-]?[\d\.]+)\s*[,\s]\s*([+\-]?[\d\.]+)\s*\)/.exec(transform);
      if (match) {
        baseX = parseFloat(match[1]);
        baseY = parseFloat(match[2]);
      }
    } else {
      baseX = parseFloat(el.getAttribute('x')) || 0;
      baseY = parseFloat(el.getAttribute('y')) || 0;
    }

    // 讀取尺寸
    let w = 0, h = 0;
    try {
      if (el.getBBox) {
        const bbox = el.getBBox();
        baseX += bbox.x;
        baseY += bbox.y;
        w = bbox.width;
        h = bbox.height;
      } else {
        const r = el.getBoundingClientRect();
        w = r.width;
        h = r.height;
      }
    } catch(e) {}

    // 計算錨點
    const cx = baseX + w / 2;
    const cy = baseY + h / 2;
    const left = baseX;
    const right = baseX + w;
    const top = baseY;
    const bottom = baseY + h;

    const a = (anchor || '').toLowerCase();
    let x = cx, y = cy;

    if (a.includes('left'))   x = left;
    if (a.includes('right'))  x = right;
    if (a.includes('top'))    y = top;
    if (a.includes('bottom')) y = bottom;

    return { x, y };
  }

})();