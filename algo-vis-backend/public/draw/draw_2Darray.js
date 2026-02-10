// draw_2Darray.js
;(function () {

  const NS = 'http://www.w3.org/2000/svg';
  const baseBoxSize = 40;   // 和其他 array 視覺一致
  const outerframe_padding = 8;

  let initedDefs   = false;

  function ensureDefs() {
    const svg = window.getViewport().ownerSVGElement;
    if (!svg) return;
    if (!svg.querySelector('#highlight-defs')) {
      const defs = document.createElementNS(NS, 'defs');
      defs.setAttribute('id', 'highlight-defs');
      const style = document.createElementNS(NS, 'style');
      style.textContent = `
        @keyframes blink-stroke {
          0%,100% { stroke-opacity:1; }
          50% { stroke-opacity:0; }
        }
        .highlight-blink { animation: blink-stroke 1s infinite; }
      `;
      defs.appendChild(style);
      svg.insertBefore(defs, svg.firstChild);
    }
  }

  function getMaxNumericIn2DArray(matrix) {
    let max = 0; // 這裡用 0 當預設，避免全是空/非數字時變 -Infinity
    if (!Array.isArray(matrix)) return max;

    for (let i = 0; i < matrix.length; i++) {
      const row = matrix[i];
      if (!Array.isArray(row)) continue;
      for (let j = 0; j < row.length; j++) {
        const v = Number(row[j]);
        if (!Number.isNaN(v) && Number.isFinite(v)) {
          if (v > max) max = v;
        }
      }
    }
    return max;
  }

  /**
   * 在畫布上畫一個 2D 陣列表格：
   *  - 最上面一列顯示欄索引（0,1,2,...）
   *  - 最左邊一欄顯示列索引（0,1,2,...）
   *  - 內部每格顯示 matrix[r][c] 的值
   *
   * @param {string}            groupID            - 這個 2D 陣列的群組名稱（也會是 <g> 的 id）
   * @param {Item}              Pos                  - { x: number, y: number }    
   * @param {Array<Array<any>>} matrix             - 二維陣列，例如 [[1,2,3],[4,5,6]]
   * @param {Array<StyleItem>}  style              - 額外設定（可省略）
   * @param {Array<Array<int>>} range              - 要畫的範圍，例如 [[1,1],[9,9]]
   * @param {string}            draw_type          - normal = 畫數字, clear = 不畫數字
   * @param {number}            index              - 要不要索引    0 都不要, 1 留x索引, 2 留y索引, 3 留x,y索引
   */
  function draw2DArray(
    groupID,
    Pos,
    matrix,
    style = {},
    range = {},
    draw_type = 'normal',
    index = 3
  ) {
    const vp = window.getViewport();
    if (!vp) return;
    if (!initedDefs) { ensureDefs(); initedDefs = true; }

    if (!Array.isArray(matrix)) {
      matrix = [];
    }

    const rows = matrix.length;
    const cols = matrix.reduce(
      (max, row) => Math.max(max, Array.isArray(row) ? row.length : 0),
      0
    );

    let startR = 0, startC = 0, endR = rows, endC = cols;
    if(range.length === 1) startR = range[0][0], startC = range[0][1];
    if(range.length === 2) startR = range[0][0], startC = range[0][1], endR = range[1][0]+1, endC = range[1][1]+1;

    if(draw_type === 'clear') index = 0;
    
    const isIndexX   = index%2;
    const isIndexY   = (Math.floor(index / 2)) % 2;

    const total_rows = endR - startR + isIndexY;
    const total_cols = endC - startC + isIndexX;

    const cellW = baseBoxSize;
    const cellH = baseBoxSize;

    const Max = getMaxNumericIn2DArray(matrix);

    let highlight      = style.filter(s => s.type === "highlight");
    let focus          = style.find(s => s.type === "focus")      ?.elements ?? [];
    let point          = style.filter(s => s.type === "point");
    let mark           = style.filter(s => s.type === "mark");
    let background     = style.filter(s => s.type === "background");
    let CDVS           = style.find(s => s.type === "CDVS")       ?.elements ?? [];
    let noneNumber     = style.find(s => s.type === "noneNumber") ?.elements ?? [];

    // 取得或建立 g
    let g = vp.querySelector('#' + groupID);
    if (!g) {
      g = document.createElementNS(NS, 'g');
      g.setAttribute('id', groupID);
      g.classList.add('draggable-object');
      g.setAttribute('data-translate', '0,0');
      vp.appendChild(g);
    }
    g.setAttribute('data-layout', 'array2D');

    // ========= 儲存排版資訊供 getPosition 使用 =========
    g.setAttribute('data-index-mode', String(index));
    g.setAttribute('data-start-r', String(startR));
    g.setAttribute('data-start-c', String(startC));
    g.setAttribute('data-total-rows', String(total_rows));
    g.setAttribute('data-total-cols', String(total_cols));

    // 1) 讀出拖曳偏移
    const [dx, dy] = (g.getAttribute('data-translate') || '0,0').split(',').map(Number);
 
    // 2) 把 CodeScript 本幀的位移存在 data-base-offset
    g.setAttribute('data-base-offset', `${Pos.x},${Pos.y}`);
 
    // 3) 合併 base + 拖曳偏移，更新 transform
    g.setAttribute('transform',`translate(${Pos.x + dx},${Pos.y + dy})`);

    // 每幀重畫前清空內容（保留 data-translate）
    while (g.firstChild) g.removeChild(g.firstChild);



    window.draw_array_outerframe(g, groupID, total_rows * baseBoxSize, total_cols * baseBoxSize);  //畫外框



    // ========= 畫表頭 =========
    if (draw_type === 'normal') {
        if (isIndexX) {
            for (let r = startR; r < endR; r++) {
                const x = 0 + outerframe_padding;
                const y = (r - startR + isIndexY) * cellH + outerframe_padding;
                window.draw_block(g, x, y, r, cellW, cellH, headerColor, `block-${groupID}-${r}-index`);
            }
        }
        if (isIndexY) {
            for (let c = startC; c < endC; c++) {
                const x = (c - startC + isIndexX) * cellW + outerframe_padding;
                const y = 0 + outerframe_padding;
                window.draw_block(g, x, y, c, cellW, cellH, headerColor, `block-${groupID}-index-${c}`);
            }
        }
    }

    // ========= 畫每一列：左側列索引 + 內部資料 =========
    for (let r = startR; r < endR; r++) {
      for (let c = startC; c < Math.min(endC,matrix[r].length); c++) {
        const x = (c - startC + isIndexX) * cellW + outerframe_padding;
        const y = (r - startR + isIndexY) * cellH + outerframe_padding;
        const value = (draw_type === 'clear') ? '' : matrix[r][c];

        const haveFocus        =       focus.length  > 0 ?  focus.some(([a, b]) => a === r && b === c) : true;
        const haveBackground   =  background.findLast(m => Array.isArray(m.elements) && m.elements.some(([a, b]) => a === r && b === c));
        const background_color = (background.findLast(m => Array.isArray(m.elements) && m.elements.some(([a, b]) => a === r && b === c)) ?.color?.trim() || "") || "rgb(231, 144, 255)";

        let fillColor = haveFocus       ? '#fff' : '#ccc';
            fillColor = haveBackground  ? background_color : fillColor;

        if (CDVS.some(([a, b]) => a === r && b === c)) {
          const ratio = Math.min(value / Max, 1); // 限制在 0~1
          const r = Math.round(255 * (1 - ratio) + 40 * ratio);   // 255→40
          const g = Math.round(255 * (1 - ratio) + 183 * ratio);  // 255→183
          const b = Math.round(255 * (1 - ratio) + 255 * ratio);  // 255→255
          fillColor = `rgb(${r}, ${g}, ${b})`;
        }

        window.draw_block(g, x, y, value, cellW, cellH, fillColor, `block-${groupID}-${r}-${c}`);
      }
    }

    // ========= 提示小元件 =========
    for (let r = startR; r < endR; r++) {
      for (let c = startC; c < Math.min(endC,matrix[r].length); c++) {
        const x = (c - startC + isIndexX) * cellW + outerframe_padding;
        const y = (r - startR + isIndexY) * cellH + outerframe_padding;

        const haveHighlight    =   highlight.findLast(m => Array.isArray(m.elements) && m.elements.some(([a, b]) => a === r && b === c));
        const havePoint        =       point.findLast(m => Array.isArray(m.elements) && m.elements.some(([a, b]) => a === r && b === c));
        const haveMark         =        mark.findLast(m => Array.isArray(m.elements) && m.elements.some(([a, b]) => a === r && b === c));
  
        const highlight_color  =  (highlight.findLast(m => Array.isArray(m.elements) && m.elements.some(([a, b]) => a === r && b === c)) ?.color?.trim() || "") || "red";
        const point_color      =      (point.findLast(m => Array.isArray(m.elements) && m.elements.some(([a, b]) => a === r && b === c)) ?.color?.trim() || "") || "red";
        const mark_color       =       (mark.findLast(m => Array.isArray(m.elements) && m.elements.some(([a, b]) => a === r && b === c)) ?.color?.trim() || "") || "limegreen";

        // 畫各式各樣的提示元件
        if (window.HintWidgets){
          // 高光框框（highlight）
          if (haveHighlight)  HintWidgets.drawHighlightBox(g, x, y, baseBoxSize, baseBoxSize, highlight_color);
  
          // 紅色箭頭（point）
          if (havePoint)      HintWidgets.drawArrow(g, x + baseBoxSize / 2, y, point_color);
  
          // 綠色勾勾（mark）
          if (haveMark)       HintWidgets.drawMark(g, x + baseBoxSize - 10, y + baseBoxSize - 10, mark_color);
        }
      }
    }
  }

  function get2DArrayPosition(groupID, row, col, anchor = "center") {
    const vp = window.getViewport && window.getViewport();
    if (!vp) return { x: 0, y: 0 };

    const g = vp.querySelector('#' + CSS.escape(groupID));
    if (!g) return { x: 0, y: 0 };

    // 1. 讀取排版資訊
    const indexMode = parseInt(g.getAttribute('data-index-mode') || '3', 10);
    const startR    = parseInt(g.getAttribute('data-start-r')    || '0', 10);
    const startC    = parseInt(g.getAttribute('data-start-c')    || '0', 10);
    const totalRows = parseInt(g.getAttribute('data-total-rows') || '1', 10);
    const totalCols = parseInt(g.getAttribute('data-total-cols') || '1', 10);

    // 計算是否顯示行列索引 (排版位移)
    const isIndexX = indexMode % 2;               // 左側索引佔位
    const isIndexY = (Math.floor(indexMode / 2)) % 2; // 上方索引佔位

    // 2. 取得全域基準座標
    const [baseX, baseY] = (g.getAttribute('data-base-offset') || '0,0').split(',').map(Number);
    const [dx, dy]       = (g.getAttribute('data-translate') || '0,0').split(',').map(Number);
    const globalX = baseX + dx;
    const globalY = baseY + dy;

    console.log("globalX, globalY:", globalX, globalY);

    // 3. 計算目標方塊的位置與大小 (Local Coordinates)
    let boxX = 0 + outerframe_padding, boxY = 0 + outerframe_padding, boxW = 0, boxH = 0;
    const cellW = baseBoxSize;
    const cellH = baseBoxSize;

    // 判斷是否指定了有效的 row 和 col
    // 注意：row/col 可以是 0，所以要用 typeof number 判斷
    if (typeof row === 'number' && typeof col === 'number' && row !== -1 && col !== -1) {
        // === 針對特定格子 ===
        // 如果該格子被裁切掉 (不再 range 內)，通常還是算它的邏輯位置，
        // 但為了視覺正確，我們通常假設使用者只會指到存在的格子。
        
        // 公式：(r - startR + isIndexY) * cellH
        // 需注意：如果 row < startR，它會跑到表格上方 (這在 partial render 時是合理的相對位置)
        boxX = (col - startC + isIndexX) * cellW + outerframe_padding;
        boxY = (row - startR + isIndexY) * cellH + outerframe_padding;
        boxW = cellW;
        boxH = cellH;
    } else {
        // === 針對整個表格 (Bounding Box) ===
        boxX = 0 + outerframe_padding;
        boxY = 0 + outerframe_padding;
        boxW = totalCols * cellW;
        boxH = totalRows * cellH;
    }

    // 4. 計算錨點 (Anchor)
    const a = (anchor || 'center').toLowerCase();
    
    // 計算相對於 g 原點的 local 座標
    let localX = boxX + boxW / 2;
    let localY = boxY + boxH / 2;

    if (a.includes('left'))   localX = boxX;
    if (a.includes('right'))  localX = boxX + boxW;
    if (a.includes('top'))    localY = boxY;
    if (a.includes('bottom')) localY = boxY + boxH;

    return {
        x: globalX + localX,
        y: globalY + localY
    };
  }

  // 註冊到一個全域 layout 表
  window.ArrayLayout = window.ArrayLayout || {};
  window.ArrayLayout.array2D = {
    getPosition: get2DArrayPosition
  };

  // 掛到全域
  window.draw2DArray   = draw2DArray;
  window.draw_2Darray  = draw2DArray;

})();
