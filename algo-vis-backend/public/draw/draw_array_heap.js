// draw_array_heap.js
;(function() {
  const NS = 'http://www.w3.org/2000/svg';
  const baseBoxSize = 40;   // 每個節點方塊的基本寬度（也當作高度）
  const indexBoxH   = 12;   // 索引區高度
  const outerframe_padding = 8; // 外框與內容的間距

  /**
   * 在 SVG 群組 g 上，繪製 heap 模式的陣列視覺化。
   * @param {SVGGElement}        g                    - 容器 SVG 群組
   * @param {String}             groupID              - 陣列名稱   
   * @param {Array}              array                - 要繪製的資料陣列
   * @param {Array<StyleiTxtem>} style                - 要繪製的輔助元素
   * @param {Array[2]}           index_range          - 實際顯示的索引起點（通常等於 range[0]）固定兩格 左邊界及右邊界
   * @param {number}             index                - 是否顯示數值下方的索引區
   */
  function draw_array_heap(
    g,
    groupID,
    array,
    style,
    index_range,
    index,
    gap = 0
  ) {
    const ranged_array = array.filter((v, i) => i >= index_range[0] && i <= index_range[1]);
    
    //正規化各個陣列的索引值
    function normalizeIndex(input){
      return input = input
               .map(i => i - index_range[0])
               .filter(i => Number.isInteger(i) && i >= 0 && i <= index_range[1]-index_range[0]);
    }   

    //正規化各個陣列的索引值
    function normalize(styleList) {
      if (!Array.isArray(styleList)) return [];

      return styleList.map(iTxtem => {
        if (typeof iTxtem !== "object" || iTxtem === null) return iTxtem;

        const newiTxtem = { ...iTxtem }; // 複製物件
        if (Array.isArray(iTxtem.elements)) {
          newiTxtem.elements = iTxtem.elements
             .map(i => i - index_range[0])
             .filter(i => Number.isInteger(i) && i >= 0 && i <= index_range[1]-index_range[0]);
        }
        return newiTxtem;
      });
    }

    // 根據 style.type 分組
    let highlight      = style.filter(s => s.type === "highlight");
    let focus          = style.filter(s => s.type === "focus");
    let point          = style.filter(s => s.type === "point");
    let mark           = style.filter(s => s.type === "mark");
    let background     = style.filter(s => s.type === "background");
    let CDVS           = style.find(s => s.type === "CDVS")       ?.elements ?? [];
    
    highlight  = normalize(highlight);
    focus      = normalize(focus);
    point      = normalize(point);
    mark       = normalize(mark);
    background = normalize(background);
    CDVS       = normalizeIndex(CDVS);
    
    const levels    = Math.max(1, Math.ceil(Math.log2(ranged_array.length + 1)));
    const rowH      = baseBoxSize + (index == 1 || index == 3 || index == 4? indexBoxH : 0) + gap; 
    const hPerLevel = rowH;
    const width     = (1 << (levels - 1));
    const totalW    = (baseBoxSize + gap) * width;
    const rows      = levels;
    const cols      = width;

    // 把 heap 排版資訊記在 g 上，給 getPosition 用
    g.setAttribute('data-layout', 'heap');
    g.setAttribute('data-heap-levels', String(levels));
    g.setAttribute('data-row-height', String(rowH)); // 統一使用 data-row-height
    g.setAttribute('data-heap-totalW', String(totalW));
    g.setAttribute('data-box-size', String(baseBoxSize));

    // 方案 1：影格預索引與標記不活躍
    const nodeMap = new Map();
    Array.from(g.children).forEach(child => {
      if (child.id) nodeMap.set(child.id, child);
      child.setAttribute('data-alive', '0');
    });

    window.draw_array_outerframe(g, groupID, rows * rowH - (rows > 0 ? gap : 0), totalW);  // 畫/更新外框
    
    let index_cnt = index_range[0];
    // 1. 繪製所有節點 (O(1) 拿物件)
    ranged_array.forEach((v, i) => {
      const lvl = Math.floor(Math.log2(i + 1));
      const cnt = 1 << lvl;
      const w   = totalW / cnt;
      const pos = i - (cnt - 1);
      const x   = pos * w + w / 2 + outerframe_padding;
      const y   = lvl * hPerLevel + outerframe_padding;

      const haveFocus        =       focus.length  > 0
        ? focus.some(m => Array.isArray(m.elements) && m.elements.includes(i))
        : true;
      const dimColor         =       focus.findLast(m => m?.color?.trim())?.color.trim() || '#ccc';
      const haveBackground   =  background.findLast(m => Array.isArray(m.elements) && m.elements.includes(i));
      const background_color = (background.findLast(m => Array.isArray(m.elements) && m.elements.includes(i)) ?.color?.trim() || "") || "rgb(231, 144, 255)";
      
      let fillColor = haveFocus       ? '#fff' : dimColor;
          fillColor = haveBackground  ? background_color : fillColor;

      if (CDVS.includes(i)) {
        const ratio = Math.min(v / Max, 1); // 限制在 0~1
        const r = Math.round(255 * (1 - ratio) + 40 * ratio);   // 255→40
        const g = Math.round(255 * (1 - ratio) + 183 * ratio);  // 255→183
        const b = Math.round(255 * (1 - ratio) + 255 * ratio);  // 255→255
        fillColor = `rgb(${r}, ${g}, ${b})`;
      }

      const array_content = (index == 2 ? index_cnt : v);
      // 畫 array 方格：使用 nodeMap 加速
      draw_block(g, x-w/2, y, array_content, w, baseBoxSize, fillColor, `cell-${groupID}-${i}`, nodeMap);

      // 畫 index
      if (index==1 || index>=3) {
        const lbl = index>=3 ? (index_range[0] + i).toString(2).padStart(
              index>=4 ? (index_range[0] + ranged_array.length - 1).toString(2).length : 0,
              '0'
            ) : (index_range[0] + i).toString();
        
        draw_block(g, x - w/2, y + baseBoxSize, lbl, w, indexBoxH, fillColor, `cell-${groupID}-${i}-index`, nodeMap);
      }
      index_cnt++;
    });

    // 2. 繪製所有提示元件
    ranged_array.forEach((v, i) => {
      const lvl = Math.floor(Math.log2(i + 1));
      const cnt = 1 << lvl;
      const w   = totalW / cnt;
      const pos = i - (cnt - 1);
      const x   = pos * w + w / 2 + outerframe_padding;
      const y   = lvl * hPerLevel + outerframe_padding;

      const haveHighlight    =   highlight.findLast(m => Array.isArray(m.elements) && m.elements.includes(i));
      const havePoint        =       point.findLast(m => Array.isArray(m.elements) && m.elements.includes(i));
      const haveMark         =        mark.findLast(m => Array.isArray(m.elements) && m.elements.includes(i));

      const highlight_color  =  (highlight.findLast(m => Array.isArray(m.elements) && m.elements.includes(i)) ?.color?.trim() || "") || "red";
      const point_color      =      (point.findLast(m => Array.isArray(m.elements) && m.elements.includes(i)) ?.color?.trim() || "") || "red";
      const mark_color       =       (mark.findLast(m => Array.isArray(m.elements) && m.elements.includes(i)) ?.color?.trim() || "") || "limegreen";

      // 畫各式各樣的提示元件 (使用 nodeMap 加速)
      if (window.HintWidgets){
        const indexH = (index==1 || index>=3 ? indexBoxH : 0);
        // 高光框框
        if (haveHighlight) {
          const hId = `highlight-${groupID}-${i}`;
          HintWidgets.drawHighlightBox(g, x - w/2, y, w, baseBoxSize + indexH, highlight_color, hId, nodeMap);
        }
        // 紅色箭頭
        if (havePoint) {
          const pId = `point-${groupID}-${i}`;
          HintWidgets.drawArrow(g, x, y, point_color, pId, -20, 12, 8, nodeMap);
        }
        // 綠色勾勾
        if (haveMark) {
          const mId = `mark-${groupID}-${i}`;
          HintWidgets.drawMark(g, x + w/2 - 10, y + baseBoxSize - 10, mark_color, mId, nodeMap);
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

  // === heap 專用：由 groupID + index 算出節點中心座標 ===
  function getHeapPosition(groupID, index, anchor = "center") {
    const vp = window.getViewport && window.getViewport();
    if (!vp) return { x: 0, y: 0 };

    const g = vp.querySelector('#' + CSS.escape(groupID));
    if (!g) return { x: 0, y: 0 };

    // 從 g 讀回當初畫 heap 時存的排版資料
    const levels = parseInt(g.getAttribute('data-heap-levels') || '1', 10);
    const rowH   = parseFloat(g.getAttribute('data-row-height') || String(baseBoxSize));
    const totalW = parseFloat(
      g.getAttribute('data-heap-totalW') ||
      String(baseBoxSize * (1 << Math.max(0, levels - 1)))
    );

    const i   = index | 0;             // ranged_array 裡的 index (0-based)
    const lvl = Math.floor(Math.log2(i + 1));
    const cnt = 1 << lvl;              // 此層節點數
    const w   = totalW / cnt;          // 此層每個節點的水平區塊寬度
    const pos = i - (cnt - 1);         // 此層中的第幾個（0-based）

    // g 自己的 base-offset / translate（全局 / 拖曳）
    const [baseX, baseY] = (g.getAttribute('data-base-offset') || '0,0')
      .split(',').map(Number);
    const [dx, dy] = (g.getAttribute('data-translate') || '0,0')
      .split(',').map(Number);

    // 在本層的中心 x，與本層的 y（頂端）
    const boxX = baseX + dx + pos * w + outerframe_padding;
    const boxY = baseY + dy + lvl * rowH + outerframe_padding; 


    const a = (anchor || 'center').toLowerCase();
    
    let finalX = boxX + w / 2; // 預設 Center
    let finalY = boxY + baseBoxSize / 2; // 預設 Center

    if (a.includes('left'))   finalX = boxX;
    if (a.includes('right'))  finalX = boxX + w;
    if (a.includes('top'))    finalY = boxY;
    if (a.includes('bottom')) finalY = boxY + baseBoxSize;

    return { x: finalX, y: finalY };
  }

  window.ArrayLayout = window.ArrayLayout || {};
  window.ArrayLayout.heap = {
    getPosition: getHeapPosition
  };

  window.draw_array_heap = draw_array_heap;
})();
