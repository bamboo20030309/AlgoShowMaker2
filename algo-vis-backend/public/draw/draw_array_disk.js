// draw_array_disk.js
; (function () {
  const NS = 'http://www.w3.org/2000/svg';
  const rowH = 40; // 每層盤子的高度
  const minDiskWidth = 40;
  const diskWidthStep = 20;

  function draw_array_disk(
    g,
    groupID,
    array,
    style,
    index_range = [],
    itemsPerRow = Infinity,
    index = 0
  ) {
    // 1. 正規化與解析 Style
    function normalize(styleList) {
      if (!Array.isArray(styleList)) return [];
      return styleList.map(item => {
        if (typeof item !== "object" || item === null) return item;
        const newItem = { ...item };
        if (Array.isArray(item.elements)) {
          newItem.elements = item.elements
            .map(i => i - index_range[0])
            .filter(i => Number.isInteger(i) && i >= 0 && i <= index_range[1] - index_range[0]);
        }
        return newItem;
      });
    }

    let highlight = style.filter(s => s.type === "highlight");
    let focus = style.filter(s => s.type === "focus");
    let background = style.filter(s => s.type === "background");
    let point = style.filter(s => s.type === "point");
    let mark = style.filter(s => s.type === "mark");
    let pegStyle = style.find(s => s.type === "peg_height");
    let baseStyle = style.find(s => s.type === "base_width");

    highlight = normalize(highlight);
    focus = normalize(focus);
    background = normalize(background);
    point = normalize(point);
    mark = normalize(mark);

    const ranged_array = array.filter((v, i) => i >= index_range[0] && i <= index_range[1]);

    // 計算最大盤子寬度
    const maxVal = array.length > 0 ? Math.max(...array) : 5;
    const maxDiskWidth = minDiskWidth + (maxVal - 1) * diskWidthStep;

    const baseWidth = baseStyle ? parseFloat(baseStyle.color) : maxDiskWidth + 20;
    const pegHeight = pegStyle ? parseFloat(pegStyle.color) : (maxVal + 1) * rowH;

    const centerX = baseWidth / 2;
    const bottomY = pegHeight; // 以底座底部為 0,0 往下畫，所以 y=pegHeight 是地板

    // 更新 g 的佈局資訊
    g.setAttribute('data-layout', 'disk');
    g.setAttribute('data-index-start', String(index_range[0]));
    g.setAttribute('data-row-height', String(rowH));
    g.setAttribute('data-center-x', String(centerX));
    g.setAttribute('data-bottom-y', String(bottomY));

    // 方案 1：影格預索引與標記不活躍
    const nodeMap = new Map();
    Array.from(g.children).forEach(child => {
      if (child.id) nodeMap.set(child.id, child);
      child.setAttribute('data-alive', '0');
    });

    // 1. 畫底座 (Base)
    let base = g.querySelector(':scope > .disk-base');
    if (!base) {
      base = document.createElementNS(NS, 'rect');
      base.classList.add('disk-base');
      g.appendChild(base);
    }
    base.setAttribute('x', centerX - baseWidth / 2);
    base.setAttribute('y', bottomY);
    base.setAttribute('width', baseWidth);
    base.setAttribute('height', 10);
    base.setAttribute('fill', '#e0e0e0');
    base.setAttribute('stroke', '#333');
    base.setAttribute('data-alive', '1');

    // 2. 畫柱子 (Peg)
    let peg = g.querySelector(':scope > .disk-peg');
    if (!peg) {
      peg = document.createElementNS(NS, 'rect');
      peg.classList.add('disk-peg');
      g.appendChild(peg);
    }
    peg.setAttribute('x', centerX - 5);
    peg.setAttribute('y', bottomY - pegHeight);
    peg.setAttribute('width', 10);
    peg.setAttribute('height', pegHeight);
    peg.setAttribute('fill', '#e0e0e0');
    peg.setAttribute('stroke', '#333');
    peg.setAttribute('data-alive', '1');

    // 3. 畫盤子 (Disks)
    // 陣列 index 0 是最上方盤子，所以要從底部開始畫，index 越大 y 越大
    // 地板是 bottomY，盤子由下而上堆疊
    // array[ranged_array.length-1] 在地板，array[0] 在最上面
    ranged_array.forEach((v, i) => {
      // 計算該盤子在畫面上應該處於的高度
      // i=0 是最上面的盤子，y 應該最小
      // y = bottomY - (總數 - i) * rowH
      const diskY = bottomY - (ranged_array.length - i) * rowH;
      const diskW = minDiskWidth + (v - 1) * diskWidthStep;
      const diskX = centerX - diskW / 2;

      const haveFocus = focus.length > 0
        ? focus.some(item => Array.isArray(item.elements) && item.elements.includes(i))
        : true;
      const dimColor = focus.findLast(item => item?.color?.trim())?.color.trim() || '#ccc';
      const haveBackground = background.findLast(m => Array.isArray(m.elements) && m.elements.includes(i));
      let background_color = haveFocus ? '#fff' : dimColor;
      if (haveBackground && haveBackground.color && haveBackground.color.trim() !== "") {
        background_color = haveBackground.color.trim();
      }

      const diskID = `cell-${groupID}-${i}`;
      window.draw_block(g, diskX, diskY, v, diskW, rowH, background_color, diskID, nodeMap);

      // 裝飾元件
      const haveHighlight = highlight.findLast(m => Array.isArray(m.elements) && m.elements.includes(i));
      const havePoint = point.findLast(m => Array.isArray(m.elements) && m.elements.includes(i));
      const haveMark = mark.findLast(m => Array.isArray(m.elements) && m.elements.includes(i));

      if (window.HintWidgets) {
        if (haveHighlight) {
          const hId = `highlight-${groupID}-${i}`;
          const h_color = haveHighlight.color || "red";
          HintWidgets.drawHighlightBox(g, diskX, diskY, diskW, rowH, h_color, hId, nodeMap);
        }
        if (havePoint) {
          const pId = `point-${groupID}-${i}`;
          const p_color = havePoint.color || "red";
          HintWidgets.drawArrow(g, centerX, diskY, p_color, pId, -20, 12, 8, nodeMap);
        }
        if (haveMark) {
          const mId = `mark-${groupID}-${i}`;
          const m_color = haveMark.color || "limegreen";
          HintWidgets.drawMark(g, diskX + diskW - 10, diskY + rowH - 10, m_color, mId, nodeMap);
        }
      }
    });

    // 掃除：移除本影格沒被標記 alive 的舊物件
    Array.from(g.children).forEach(child => {
      if (child.getAttribute('data-alive') === '0') {
        child.remove();
      }
    });
  }

  function getDiskPosition(groupID, index, anchor = "center") {
    const vp = window.getViewport && window.getViewport();
    if (!vp) return { x: 0, y: 0 };
    const g = vp.querySelector('#' + CSS.escape(groupID));
    if (!g) return { x: 0, y: 0 };

    const startIdx = parseInt(g.getAttribute('data-index-start') || '0', 10);
    const rowH = parseFloat(g.getAttribute('data-row-height') || '40');
    const centerX = parseFloat(g.getAttribute('data-center-x') || '0');
    const bottomY = parseFloat(g.getAttribute('data-bottom-y') || '0');

    // 計算該 index 在目前數組中的位置 (從上往下數)
    const localIndex = index;
    // 取出目前的盤子數量 (從 g 下方的 rect.block-cell 數量得知，或從 array length)
    // 假設我們在 hanoi 中傳入的是正確的 localIndex

    // 我們需要知道總共有幾片盤子才能算正確的 y
    const diskCells = g.querySelectorAll(':scope > g[id^="cell-"]');
    const totalDisks = diskCells.length;

    // y = bottomY - (totalDisks - localIndex) * rowH
    // 中心點 X 始終是 centerX

    const [baseX, baseY] = (g.getAttribute('data-base-offset') || '0,0').split(',').map(Number);
    const [dx, dy] = (g.getAttribute('data-translate') || '0,0').split(',').map(Number);

    const worldX = baseX + dx + centerX;
    const worldY = baseY + dy + (bottomY - (totalDisks - localIndex) * rowH);

    const a = (anchor || 'center').toLowerCase();
    let finalX = worldX;
    let finalY = worldY + rowH / 2;

    if (a.includes('top')) finalY = worldY;
    if (a.includes('bottom')) finalY = worldY + rowH;
    // diskX 的左右側需要知道該盤子的寬度，這比較麻煩
    // 暫時以 centerX 為準

    return { x: finalX, y: finalY };
  }

  window.ArrayLayout = window.ArrayLayout || {};
  window.ArrayLayout.disk = {
    getPosition: getDiskPosition
  };
  window.draw_array_disk = draw_array_disk;
})();
