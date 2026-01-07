// draw_arrow.js
;(function () {
  const NS = 'http://www.w3.org/2000/svg';

  // 有箭頭的那一端，固定自動縮短的距離（px）
  const ARROW_HEAD_SHRINK = 8;

  // 給每條箭頭一個唯一 id，用來綁 label
  let arrowIdCounter = 0;

  // 沿線飛行的「箭頭頭」
  // Map<lineElement, { heads:[{g,inner,from}], duration, startTime }>
  const emitArrowMap = new Map();
  let emitAnimRunning = false;

  // 工具：顏色字串轉安全 key
  function colorKey(color) {
    return String(color || '').replace(/[^a-zA-Z0-9]+/g, '_') || 'default';
  }

  // 判斷 spec 是否為 outerframe 連接點
  // 例如 { group:"num", direction:"down" }
  function isOuterframeSpec(spec) {
    return !!spec && typeof spec === 'object' && typeof spec.direction === 'string';
  }

  // ---------------------------------------
  // Marker：三角箭頭（整個畫在線段外側）
  // ---------------------------------------
  function ensureArrowMarker(svg, color) {
    if (!svg) return null;

    const key = colorKey(color);
    const markerId = 'arrow-marker-' + key;

    let marker = svg.querySelector('#' + markerId);
    if (marker) return markerId;

    let defs = svg.querySelector('defs');
    if (!defs) {
      defs = document.createElementNS(NS, 'defs');
      svg.insertBefore(defs, svg.firstChild);
    }

    marker = document.createElementNS(NS, 'marker');
    marker.setAttribute('id', markerId);
    marker.setAttribute('viewBox', '0 0 10 10');
    // ★ 讓線段端點接在 marker 的「中間」(x=5)，使箭頭會向線段外側畫出去
    marker.setAttribute('refX', '0');
    marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '3');
    marker.setAttribute('markerHeight', '3');
    marker.setAttribute('markerUnits', 'strokeWidth');
    marker.setAttribute('orient', 'auto-start-reverse');

    const path = document.createElementNS(NS, 'path');
    // 根部在 x=0，尖端在 x=10（以 refX=5 為中心，箭頭會各伸出一半）
    path.setAttribute('d', 'M 0 0 L 10 5 L 0 10 Z');
    path.setAttribute('fill', color || 'rgba(255, 58, 58, 0.7)');

    marker.appendChild(path);
    defs.appendChild(marker);
    return markerId;
  }

  // ---------------------------------------
  // Marker：圓點（整個畫在外側）
  // ---------------------------------------
  function ensureDotMarker(svg, color) {
    if (!svg) return null;

    const key = colorKey(color);
    const markerId = 'dot-marker-' + key;

    let marker = svg.querySelector('#' + markerId);
    if (marker) return markerId;

    let defs = svg.querySelector('defs');
    if (!defs) {
      defs = document.createElementNS(NS, 'defs');
      svg.insertBefore(defs, svg.firstChild);
    }

    marker = document.createElementNS(NS, 'marker');
    marker.setAttribute('id', markerId);
    marker.setAttribute('viewBox', '0 0 10 10');
    // ★ 讓線段端點接在 marker 的「中間」(x=5)，使圓點中心落在線段端點
    marker.setAttribute('refX', '0');
    marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '4');
    marker.setAttribute('markerHeight', '4');
    marker.setAttribute('markerUnits', 'strokeWidth');
    marker.setAttribute('orient', 'auto');

    const circle = document.createElementNS(NS, 'circle');
    circle.setAttribute('cx', '5');
    circle.setAttribute('cy', '5');
    circle.setAttribute('r', '3.5');
    circle.setAttribute('fill', color || 'rgba(255, 58, 58, 0.7)');

    marker.appendChild(circle);
    defs.appendChild(marker);
    return markerId;
  }

  // ---------------------------------------
  // 計算 marker 額外縮短長度
  //（現在箭頭 / 圓點會畫在端點附近，實際縮短交給 ARROW_HEAD_SHRINK）
  // ---------------------------------------
  function computeMarkerLen(svg, type, color) {
    if (type === 'arrow') {
      ensureArrowMarker(svg, color);
      return 0;
    }
    if (type === 'dot') {
      ensureDotMarker(svg, color);
      return 0;
    }
    return 0;
  }

  // ---------------------------------------
  // 更新：重算所有箭頭座標 & label 位置
  // ---------------------------------------
  function updateArrows() {
    const vp = window.getViewport && window.getViewport();
    if (!vp || !window.resolvePos) return;

    const lines = vp.querySelectorAll('#arrow-layer line[data-bind="resolvePos"]');
    lines.forEach(line => {
      const sStr = line.getAttribute('data-start-spec');
      const eStr = line.getAttribute('data-end-spec');
      if (!sStr || !eStr) return;

      let startSpec, endSpec;
      try {
        startSpec = JSON.parse(sStr);
        endSpec   = JSON.parse(eStr);
      } catch {
        return;
      }

      const p1 = window.resolvePos(startSpec);
      const p2 = window.resolvePos(endSpec);

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy);
      if (len === 0) return;

      const ux = dx / len;
      const uy = dy / len;

      let marginStart = parseFloat(line.getAttribute('data-margin-start') || '0');
      let marginEnd   = parseFloat(line.getAttribute('data-margin-end')   || '0');

      const x1 = p1.x + ux * marginStart;
      const y1 = p1.y + uy * marginStart;
      const x2 = p2.x - ux * marginEnd;
      const y2 = p2.y - uy * marginEnd;

      line.setAttribute('x1', x1);
      line.setAttribute('y1', y1);
      line.setAttribute('x2', x2);
      line.setAttribute('y2', y2);

      // 有中間文字的話，更新文字位置
      const lineId = line.getAttribute('id');
      if (lineId && vp.querySelector) {
        const label = vp.querySelector(
          '#arrow-layer text[data-arrow-id="' + CSS.escape(lineId) + '"]'
        );
        if (label) {
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2;
          label.setAttribute('x', mx);
          label.setAttribute('y', my - 4); // 稍微往上提一點
        }
      }
    });

    // emitArrowMap 的 head 位置由動畫迴圈每 frame 自己算，
    // 這裡不需要特別處理，因為它每 frame 都會讀 line 的最新 x1,y1,x2,y2。
  }

  // ---------------------------------------
  // 新動畫迴圈：讓「箭頭頭」沿著線跑
  // ---------------------------------------
  function stepEmitAnim(now) {
    if (!emitAnimRunning) return;
    if (emitArrowMap.size === 0) {
      emitAnimRunning = false;
      return;
    }

    emitArrowMap.forEach((info, line) => {
      if (!line.ownerSVGElement) {
        emitArrowMap.delete(line);
        return;
      }

      const x1 = parseFloat(line.getAttribute('x1') || '0');
      const y1 = parseFloat(line.getAttribute('y1') || '0');
      const x2 = parseFloat(line.getAttribute('x2') || '0');
      const y2 = parseFloat(line.getAttribute('y2') || '0');

      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy);
      if (!len) return;

      const ux = dx / len;
      const uy = dy / len;
      const baseAngle = Math.atan2(dy, dx) * 180 / Math.PI;

      const duration = info.duration || 1000;
      const t = ((now - info.startTime) % duration) / duration; // 0~1
      const dist = t * len;

      info.heads.forEach(head => {
        let px, py, angle;

        if (head.from === 'start') {
          px = x1 + ux * dist;
          py = y1 + uy * dist;
          angle = baseAngle;
        } else {
          px = x2 - ux * dist;
          py = y2 - uy * dist;
          angle = baseAngle + 180;
        }

        head.g.setAttribute(
          'transform',
          `translate(${px},${py}) rotate(${angle})`
        );
      });
    });

    if (emitArrowMap.size > 0) {
      requestAnimationFrame(stepEmitAnim);
    } else {
      emitAnimRunning = false;
    }
  }

  // ---------------------------------------
  // 畫箭頭
  // ---------------------------------------
  function drawArrow(startSpec, endSpec, opt = {}) {
    const vp = window.getViewport && window.getViewport();
    if (!vp || !window.resolvePos) return;

    const svg = vp.ownerSVGElement;
    if (!svg) return;

    const p1 = window.resolvePos(startSpec);
    const p2 = window.resolvePos(endSpec);

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) return;

    const ux = dx / len;
    const uy = dy / len;

    const color = opt.color || 'rgba(255, 58, 58, 0.7)';
    const width = opt.width || 4;

    const headStart = opt.headStart || 'none';   // 'none' | 'arrow' | 'dot'
    const headEnd   = opt.headEnd   || 'arrow';  // 預設終點有箭頭
    const animate   = !!opt.animate;             // 發射箭頭頭效果
    const animColor = opt.animateColor || color;

    // 如果 spec 是 outerframe 連接點，預設不縮短（margin=0）
    const startIsOuter = isOuterframeSpec(startSpec);
    const endIsOuter   = isOuterframeSpec(endSpec);

    // 基本 margin：沒有頭的那端可以短一點，有頭的那端預設長一點
    let baseMarginStart;
    if (opt.marginStart != null) {
      baseMarginStart = Number(opt.marginStart);
    } else {
      baseMarginStart = (startIsOuter? 0 : 8 + width);
    }

    let baseMarginEnd;
    if (opt.marginEnd != null) {
      baseMarginEnd = Number(opt.marginEnd);
    } else {
      baseMarginEnd = (endIsOuter? 0 : 8 + width);
    }

    const extraStart = computeMarkerLen(svg, headStart, color);
    const extraEnd   = computeMarkerLen(svg, headEnd,   color);

    // 1) marker（箭頭/圓點）會「畫在端點附近」
    // 2) 只要那端有 arrow/dot，就把線段端點往裡縮 ARROW_HEAD_SHRINK
    //    這樣箭頭/圓點就會落在「往裡縮一點的位置」
    const shrinkStart = (headStart === 'arrow' || headStart === 'dot') ? ARROW_HEAD_SHRINK : 0;
    const shrinkEnd   = (headEnd   === 'arrow' || headEnd   === 'dot') ? ARROW_HEAD_SHRINK : 0;

    const marginStart = baseMarginStart + shrinkStart;
    const marginEnd   = baseMarginEnd   + shrinkEnd;

    const x1 = p1.x + ux * marginStart;
    const y1 = p1.y + uy * marginStart;
    const x2 = p2.x - ux * marginEnd;
    const y2 = p2.y - uy * marginEnd;

    // 箭頭圖層掛在 viewport 裡
    let layer = vp.querySelector('#arrow-layer');
    if (!layer) {
      layer = document.createElementNS(NS, 'g');
      layer.setAttribute('id', 'arrow-layer');
      vp.appendChild(layer);
    }

    const line = document.createElementNS(NS, 'line');
    const lineId = 'arrow-' + (arrowIdCounter++);
    line.setAttribute('id', lineId);

    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', String(width));

    // 虛線：保留原本功能
    if (opt.dashArray) {
      line.setAttribute('stroke-dasharray', String(opt.dashArray));
    } else if (opt.dashed) {
      line.setAttribute('stroke-dasharray', '6,4');
    }

    // marker-start / marker-end
    if (headStart === 'arrow') {
      const id = ensureArrowMarker(svg, color);
      line.setAttribute('marker-start', `url(#${id})`);
    } else if (headStart === 'dot') {
      const id = ensureDotMarker(svg, color);
      line.setAttribute('marker-start', `url(#${id})`);
    }

    if (headEnd === 'arrow') {
      const id = ensureArrowMarker(svg, color);
      line.setAttribute('marker-end', `url(#${id})`);
    } else if (headEnd === 'dot') {
      const id = ensureDotMarker(svg, color);
      line.setAttribute('marker-end', `url(#${id})`);
    }

    // 儲存 spec & margin，之後 updateArrows 可以重算
    line.setAttribute('data-bind', 'resolvePos');
    line.setAttribute('data-start-spec', JSON.stringify(startSpec));
    line.setAttribute('data-end-spec',   JSON.stringify(endSpec));
    line.setAttribute('data-margin-start', String(marginStart));
    line.setAttribute('data-margin-end',   String(marginEnd));

    layer.appendChild(line);

    // 中間文字（label）
    if (opt.text) {
      const label = document.createElementNS(NS, 'text');
      label.setAttribute('data-arrow-id', lineId);
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      label.setAttribute('x', mx);
      label.setAttribute('y', my - 1); // 稍微提上去一點
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('dominant-baseline', 'central');
      label.setAttribute('fill', opt.text_color || 'black');
      label.setAttribute('font-size', String(opt.text_size || 20));
      label.setAttribute('font-weight', opt.text_weight || 'bold');
      label.textContent = String(opt.text);
      layer.appendChild(label);
    }

    // 發射箭頭頭動畫
    if (animate) {
      const duration =
        (typeof opt.animateDuration === 'number' && opt.animateDuration > 0)
          ? opt.animateDuration
          : 1000;

      const heads = [];

      function createHead(from) {
        const headOuter = document.createElementNS(NS, 'g');
        const headInner = document.createElementNS(NS, 'g');

        const tri = document.createElementNS(NS, 'path');
        tri.setAttribute('d', 'M -3 -2 L 3 0 L -3 2 Z');
        tri.setAttribute('fill', animColor);

        const scaleFactor = width * 0.70;
        headInner.setAttribute('transform', `scale(${scaleFactor})`);

        headInner.appendChild(tri);
        headOuter.appendChild(headInner);
        layer.appendChild(headOuter);

        heads.push({
          g: headOuter,
          inner: headInner,
          from
        });
      }

      if (headEnd   !== 'none') createHead('start');
      if (headStart !== 'none') createHead('end');

      if (heads.length > 0) {
        emitArrowMap.set(line, {
          heads,
          duration,
          startTime: performance.now()
        });

        if (!emitAnimRunning) {
          emitAnimRunning = true;
          requestAnimationFrame(stepEmitAnim);
        }
      }
    }
  }

  // ---------------------------------------
  // 刪除所有箭頭
  // ---------------------------------------
  function clearArrows() {
    const vp = window.getViewport && window.getViewport();
    if (!vp) return;

    const layer = vp.querySelector('#arrow-layer');
    if (layer) layer.innerHTML = '';

    emitArrowMap.clear();
    emitAnimRunning = false;
  }

  // ---------------------------------------
  // Export 全域函式
  // ---------------------------------------
  window.drawArrow    = drawArrow;
  window.updateArrows = updateArrows;
  window.clearArrows  = clearArrows;

})();
