// draw_array_stack.js
; (function () {
  const NS = 'http://www.w3.org/2000/svg';
  const baseBoxSize = 40;
  const indexBoxH = 12;
  const outerframe_padding = 8;

  function draw_array_stack(
    g,
    groupID,
    array,
    style,
    index_range = [],
    index = 0,
    gap_y = 0
  ) {
    const ranged_array = array.filter((v, i) => i >= index_range[0] && i <= index_range[1]);
    const size = ranged_array.length;

    // 正規化
    function normalize(styleList) {
      if (!Array.isArray(styleList)) return [];
      return styleList.map(item => {
        if (typeof item !== "object" || item === null) return item;
        const newItem = { ...item };
        if (Array.isArray(item.elements)) {
          newItem.elements = item.elements
            .map(i => i - index_range[0])
            .filter(i => Number.isInteger(i) && i >= 0 && i < size);
        }
        return newItem;
      });
    }

    let highlight = normalize(style.filter(s => s.type === "highlight"));
    let focus = normalize(style.filter(s => s.type === "focus"));
    let point = normalize(style.filter(s => s.type === "point"));
    let mark = normalize(style.filter(s => s.type === "mark"));
    let background = normalize(style.filter(s => s.type === "background"));

    const nodeMap = new Map();
    Array.from(g.children).forEach(child => {
      if (child.id) nodeMap.set(child.id, child);
      child.setAttribute('data-alive', '0');
    });

    const container_gap = 6;
    const topArrowSpace = 30;
    const cellStep = baseBoxSize + gap_y;

    // totalContentW/H 是「內容區」的大小，會影響 outerframe
    const totalContentW = baseBoxSize + 2 * container_gap;
    const totalContentH = size * cellStep + container_gap + topArrowSpace;
    const offsetY = -(totalContentH + 40); // 抬高以對位底部邊界

    // 畫/更新外框 (背景紅色)
    window.draw_array_outerframe(g, groupID, totalContentH, totalContentW, 'rgba(255, 0, 0, 0.1)', offsetY);

    // 繪製順序調整：1. 外框/U型線/箭頭 (底層) -> 2. 格子 -> 3. 標註 (最上層)

    // 1-1. 畫紅色的 U 型線 (筒子)
    const uColor = "red";
    const uWidth = 3;
    const cornerR = 8;
    const uPathId = `stack-u-${groupID}`;
    let uPath = nodeMap.get(uPathId);
    if (!uPath) {
      uPath = document.createElementNS(NS, 'path');
      uPath.setAttribute('id', uPathId);
      uPath.setAttribute('fill', 'none');
      uPath.setAttribute('stroke-linecap', 'round');
      uPath.setAttribute('stroke-linejoin', 'round');
      g.appendChild(uPath);
    }

    const uxL = outerframe_padding;
    const uyT = outerframe_padding + offsetY;
    const uxR = outerframe_padding + totalContentW;
    const uyB = outerframe_padding + totalContentH + offsetY;

    const d = `M ${uxL},${uyT} 
               L ${uxL},${uyB - cornerR} 
               Q ${uxL},${uyB} ${uxL + cornerR},${uyB}
               L ${uxR - cornerR},${uyB}
               Q ${uxR},${uyB} ${uxR},${uyB - cornerR}
               L ${uxR},${uyT}`;

    uPath.setAttribute('d', d);
    uPath.setAttribute('stroke', uColor);
    uPath.setAttribute('stroke-width', uWidth);
    uPath.setAttribute('data-alive', '1');

    // 1-2. 畫頂部的上下箭頭 (LIFO)
    const arrowId = `stack-arrow-${groupID}`;
    let arrowG = nodeMap.get(arrowId);
    if (!arrowG) {
      arrowG = document.createElementNS(NS, 'g');
      arrowG.setAttribute('id', arrowId);
      g.appendChild(arrowG);

      const lifoArrow = document.createElementNS(NS, 'path');
      lifoArrow.setAttribute('class', 'lifo-arrow');
      lifoArrow.setAttribute('d', 'M -3,-4 L -3,4 L -7,4 L 0,12 L 7,4 L 3,4 L 3,-4 L 7,-4 L 0,-12 L -7,-4 Z');
      lifoArrow.setAttribute('fill', 'black');
      arrowG.appendChild(lifoArrow);
    }
    const topCellY = outerframe_padding + topArrowSpace + offsetY;
    const arrowCenterY = topCellY - 18;
    arrowG.setAttribute('transform', `translate(${outerframe_padding + totalContentW / 2}, ${arrowCenterY})`);
    arrowG.setAttribute('data-alive', '1');

    // 2. 繪製元素（由下而上：index 0 在最底）
    ranged_array.forEach((v, i) => {
      const x = outerframe_padding + container_gap;
      const y = (size - 1 - i) * cellStep + outerframe_padding + topArrowSpace + offsetY;

      const haveFocus = focus.length > 0
        ? focus.some(item => Array.isArray(item.elements) && item.elements.includes(i))
        : true;
      const dimColor = focus.findLast(item => item?.color?.trim())?.color.trim() || '#ccc';
      const haveBackground = background.findLast(m => Array.isArray(m.elements) && m.elements.includes(i));
      const background_color = (haveBackground?.color?.trim() || "") || "rgba(255, 200, 200, 0.8)";
      let fillColor = haveFocus ? '#fff' : dimColor;
      fillColor = haveBackground ? background_color : fillColor;

      window.draw_block(g, x, y, v, baseBoxSize, baseBoxSize, fillColor, `cell-${groupID}-${i}`, nodeMap);
    });

    // 3. HintWidgets 獨立迴圈
    if (window.HintWidgets) {
      ranged_array.forEach((v, i) => {
        const x = outerframe_padding + container_gap;
        const y = (size - 1 - i) * cellStep + outerframe_padding + topArrowSpace + offsetY;

        const haveHighlight = highlight.findLast(m => Array.isArray(m.elements) && m.elements.includes(i));
        const havePoint = point.findLast(m => Array.isArray(m.elements) && m.elements.includes(i));
        const haveMark = mark.findLast(m => Array.isArray(m.elements) && m.elements.includes(i));

        const highlight_color = haveHighlight?.color?.trim() || "red";
        const point_color = havePoint?.color?.trim() || "red";
        const mark_color = haveMark?.color?.trim() || "limegreen";

        if (haveHighlight) {
          HintWidgets.drawHighlightBox(g, x, y, baseBoxSize, baseBoxSize, highlight_color, `highlight-${groupID}-${i}`, nodeMap);
        }
        if (havePoint) {
          HintWidgets.drawArrow(g, x, y + baseBoxSize / 2, point_color, `point-${groupID}-${i}`, -20, 12, 0, nodeMap);
        }
        if (haveMark) {
          HintWidgets.drawMark(g, x + baseBoxSize - 10, y + baseBoxSize - 10, mark_color, `mark-${groupID}-${i}`, nodeMap);
        }
      });
    }

    // 掃除
    Array.from(g.children).forEach(child => {
      if (child.getAttribute('data-alive') === '0') child.remove();
    });

    // 保存佈局資訊 給 getPosition
    g.setAttribute('data-layout', 'stack');
    g.setAttribute('data-size', String(size));
    g.setAttribute('data-cell-step', String(cellStep));
    g.setAttribute('data-index-start', String(index_range[0]));
  }

  // -------------------------------------------------------------------------
  // getStackPosition: 計算特定索引在 stack 中的物理座標
  // -------------------------------------------------------------------------
  function getStackPosition(groupID, index, anchor = "center") {
    const vp = window.getViewport && window.getViewport();
    const g = vp?.querySelector('#' + CSS.escape(groupID));
    if (!g) return { x: 0, y: 0 };

    const size = parseInt(g.getAttribute('data-size') || '0', 10);
    const cellStep = parseFloat(g.getAttribute('data-cell-step') || baseBoxSize);
    const startIdx = parseInt(g.getAttribute('data-index-start') || '0', 10);
    const [baseX, baseY] = (g.getAttribute('data-base-offset') || '0,0').split(',').map(Number);
    const [dx, dy] = (g.getAttribute('data-translate') || '0,0').split(',').map(Number);

    const container_gap = 6;
    const topArrowSpace = 34;
    const localIndex = index - startIdx;
    
    // y 方向：底部錨點邏輯，同步抬高 40px
    const totalContentH = size * cellStep + container_gap + topArrowSpace;
    const offsetY = -(totalContentH + 40);
    
    const xLocal = outerframe_padding + container_gap;
    const yLocal = (size - 1 - localIndex) * cellStep + outerframe_padding + topArrowSpace + offsetY;

    let ax = baseBoxSize / 2;
    let ay = baseBoxSize / 2;
    const a = anchor.toLowerCase();
    if (a.includes('left')) ax = 0;
    if (a.includes('right')) ax = baseBoxSize;
    if (a.includes('top')) ay = 0;
    if (a.includes('bottom')) ay = baseBoxSize;

    return { x: baseX + dx + xLocal + ax, y: baseY + dy + yLocal + ay };
  }

  window.draw_array_stack = draw_array_stack;
  window.getStackPosition = getStackPosition;
  window.ArrayLayout = window.ArrayLayout || {};
  window.ArrayLayout['stack'] = { getPosition: getStackPosition };
})();
