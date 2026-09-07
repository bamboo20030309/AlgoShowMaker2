// draw_array_queue.js
; (function () {
  const NS = 'http://www.w3.org/2000/svg';
  const baseBoxSize = 40;
  const indexBoxH = 12;
  const outerframe_padding = 8;

  function draw_array_queue(
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
    const sideSpace = 20;
    const cellStepW = baseBoxSize;

    // totalContentW 包含左右箭頭空間
    const totalContentW = size * cellStepW + 2 * sideSpace;
    // totalContentH 包含上下容器間距
    const totalContentH = baseBoxSize + 2 * container_gap;

    // 畫/更新外框 (背景綠色)
    window.draw_array_outerframe(g, groupID, totalContentH, totalContentW, 'rgba(144, 238, 144, 0.25)');

    // 1. 畫兩條綠色的平行線 (管線) + 兩端箭頭（先畫，讓格子疊在上面）
    const qColor = "forestgreen";
    const qWidth = 3;
    const qPath1Id = `queue-upper-${groupID}`;
    const qPath2Id = `queue-lower-${groupID}`;

    let qPath1 = nodeMap.get(qPath1Id);
    let qPath2 = nodeMap.get(qPath2Id);

    if (!qPath1) {
      qPath1 = document.createElementNS(NS, 'path');
      qPath1.setAttribute('id', qPath1Id);
      qPath1.setAttribute('fill', 'none');
      qPath1.setAttribute('stroke-linecap', 'round');
      qPath1.setAttribute('stroke-linejoin', 'round');
      g.appendChild(qPath1);
    }
    if (!qPath2) {
      qPath2 = document.createElementNS(NS, 'path');
      qPath2.setAttribute('id', qPath2Id);
      qPath2.setAttribute('fill', 'none');
      qPath2.setAttribute('stroke-linecap', 'round');
      qPath2.setAttribute('stroke-linejoin', 'round');
      g.appendChild(qPath2);
    }

    const uxL = outerframe_padding, uyT = outerframe_padding;
    const uxR = uxL + totalContentW;
    const uyB = uyT + totalContentH;

    qPath1.setAttribute('d', `M ${uxL},${uyT} L ${uxR},${uyT}`);
    qPath1.setAttribute('stroke', qColor);
    qPath1.setAttribute('stroke-width', qWidth);
    qPath1.setAttribute('data-alive', '1');

    qPath2.setAttribute('d', `M ${uxL},${uyB} L ${uxR},${uyB}`);
    qPath2.setAttribute('stroke', qColor);
    qPath2.setAttribute('stroke-width', qWidth);
    qPath2.setAttribute('data-alive', '1');

    const popArrowId = `queue-pop-arrow-${groupID}`;
    let popArrow = nodeMap.get(popArrowId);
    if (!popArrow) {
      popArrow = document.createElementNS(NS, 'path');
      popArrow.setAttribute('id', popArrowId);
      popArrow.setAttribute('class', 'pop-arrow');
      popArrow.setAttribute('d', 'M 8,-3 L 8,3 L 0,3 L 0,7 L -8,0 L 0,-7 L 0,-3 Z');
      popArrow.setAttribute('fill', 'black');
      g.appendChild(popArrow);
    }
    popArrow.setAttribute('transform', `translate(${uxL + 8}, ${outerframe_padding + totalContentH / 2})`);
    popArrow.setAttribute('data-alive', '1');

    const pushArrowId = `queue-push-arrow-${groupID}`;
    let pushArrow = nodeMap.get(pushArrowId);
    if (!pushArrow) {
      pushArrow = document.createElementNS(NS, 'path');
      pushArrow.setAttribute('id', pushArrowId);
      pushArrow.setAttribute('class', 'push-arrow');
      pushArrow.setAttribute('d', 'M 8,-3 L 8,3 L 0,3 L 0,7 L -8,0 L 0,-7 L 0,-3 Z');
      pushArrow.setAttribute('fill', 'black');
      g.appendChild(pushArrow);
    }
    pushArrow.setAttribute('transform', `translate(${uxR - 8}, ${outerframe_padding + totalContentH / 2})`);
    pushArrow.setAttribute('data-alive', '1');

    // 2. 繪製元素（由左而右：index 0 在前端）
    ranged_array.forEach((v, i) => {
      const x = i * cellStepW + outerframe_padding + sideSpace;
      const y = outerframe_padding + container_gap;

      const haveFocus = focus.length > 0
        ? focus.some(item => Array.isArray(item.elements) && item.elements.includes(i))
        : true;
      const dimColor = focus.findLast(item => item?.color?.trim())?.color.trim() || '#ccc';
      const haveBackground = background.findLast(m => Array.isArray(m.elements) && m.elements.includes(i));
      const background_color = (haveBackground?.color?.trim() || "") || "rgba(200, 255, 200, 0.8)";
      let fillColor = haveFocus ? '#fff' : dimColor;
      fillColor = haveBackground ? background_color : fillColor;

      window.draw_block(g, x, y, v, baseBoxSize, baseBoxSize, fillColor, `cell-${groupID}-${i}`, nodeMap);
    });

    // 3. HintWidgets 獨立迴圈
    if (window.HintWidgets) {
      ranged_array.forEach((v, i) => {
        const x = i * cellStepW + outerframe_padding + sideSpace;
        const y = outerframe_padding + container_gap;

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
          HintWidgets.drawArrow(g, x + baseBoxSize / 2, y, point_color, `point-${groupID}-${i}`, -20, 12, 8, nodeMap);
        }
        if (haveMark) {
          HintWidgets.drawMark(g, x + baseBoxSize - 10, y + baseBoxSize - 10, mark_color, `mark-${groupID}-${i}`, nodeMap);
        }
      });
    }

    Array.from(g.children).forEach(child => {
      if (child.getAttribute('data-alive') === '0') child.remove();
    });

    g.setAttribute('data-layout', 'queue');
    g.setAttribute('data-size', String(size));
    g.setAttribute('data-cell-step', String(cellStepW));
    g.setAttribute('data-index-start', String(index_range[0]));
  }

  function getQueuePosition(groupID, index, anchor = "center") {
    const vp = window.getViewport && window.getViewport();
    const g = vp?.querySelector('#' + CSS.escape(groupID));
    if (!g) return { x: 0, y: 0 };

    const startIdx = parseInt(g.getAttribute('data-index-start') || '0', 10);
    const cellStep = parseFloat(g.getAttribute('data-cell-step') || baseBoxSize);
    const [baseX, baseY] = (g.getAttribute('data-base-offset') || '0,0').split(',').map(Number);
    const [dx, dy] = (g.getAttribute('data-translate') || '0,0').split(',').map(Number);

    const container_gap = 6;
    const sideSpace = 20;
    const localIndex = index - startIdx;

    // x 方向：由左而右。考慮側邊箭頭空間
    const xLocal = localIndex * cellStep + outerframe_padding + sideSpace;
    const yLocal = outerframe_padding + container_gap;

    let ax = baseBoxSize / 2;
    let ay = baseBoxSize / 2;
    const a = anchor.toLowerCase();
    if (a.includes('left')) ax = 0;
    if (a.includes('right')) ax = baseBoxSize;
    if (a.includes('top')) ay = 0;
    if (a.includes('bottom')) ay = baseBoxSize;

    return { x: baseX + dx + xLocal + ax, y: baseY + dy + yLocal + ay };
  }

  window.draw_array_queue = draw_array_queue;
  window.getQueuePosition = getQueuePosition;
  window.ArrayLayout = window.ArrayLayout || {};
  window.ArrayLayout['queue'] = { getPosition: getQueuePosition };
})();
