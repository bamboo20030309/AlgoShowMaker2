// draw_array_segment_tree.js
;(function() {
  const NS = 'http://www.w3.org/2000/svg';
  const baseBoxSize = 40;   // 每個節點方塊的基本寬度（也當作高度）
  const indexBoxH   = 12;   // 索引區高度
  const outerframe_padding = 8; // 外框與內容的間距

  /**
   * 在 SVG 群組 g 上，繪製 heap 模式的陣列視覺化。
   * @param {SVGGElement}      g                    - 容器 SVG 群組
   * @param {String}           groupID              - 陣列名稱   
   * @param {Array}            array                - 要繪製的資料陣列
   * @param {Array<StyleItem>} style                - 要繪製的輔助元素
   * @param {Array[2]}         index_range          - 實際顯示的索引起點（通常等於 range[0]）固定兩格 左邊界及右邊界
   * @param {number}           index                - 是否顯示數值下方的索引區
   * @param {Array}            segment_index        - 要畫區段的格子(為一段格子上色)
   * @param {Array}            segment_left         - 要畫區段格子的左點(絕對位置)
   * @param {Array}            segment_right        - 要畫區段格子的右點(絕對位置)
   */
  function draw_array_segment_tree(
    g,
    groupID,
    array,
    style,
    index_range,
    index,
    segment_lazy = [],
    segment_sets = [],
    segment_index,
    segment_left,
    segment_right,
    segmemt_font_colors,
    segmemt_font_bg_colors
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

      return styleList.map(item => {
        if (typeof item !== "object" || item === null) return item;

        const newItem = { ...item }; // 複製物件
        if (Array.isArray(item.elements)) {
          newItem.elements = item.elements
             .map(i => i - index_range[0])
             .filter(i => Number.isInteger(i) && i >= 0 && i <= index_range[1]-index_range[0]);
        }
        return newItem;
      });
    }

    // 過濾掉 cell 或 seg 超出範圍的 segment 顏色項目
    function normalizeSegmentColorRange(input, segMax) {
      if (!Array.isArray(input)) return [];

      return input.filter(entry => {
        if (!Array.isArray(entry) || !Array.isArray(entry[0])) return false;

        const cell = Number(entry[0][0]);
        const seg  = Number(entry[0][1]);

        // cell 或 seg 非整數或越界則刪除
        if (!Number.isInteger(cell) || !Number.isInteger(seg)) return false;
        if (cell < 0 || cell > array.length-1) return false;
        if (seg  < 0 || seg  > segMax-1)  return false;

        return true;
      });
    }

    segmemt_font_colors      = normalizeSegmentColorRange(segmemt_font_colors, 5);
    segmemt_font_bg_colors   = normalizeSegmentColorRange(segmemt_font_bg_colors  , 5);

    // 根據 style.type 分組
    let highlight      = style.filter(s => s.type === "highlight");
    let focus          = style.find(s => s.type === "focus")      ?.elements ?? [];
    let point          = style.filter(s => s.type === "point");
    let mark           = style.filter(s => s.type === "mark");
    let background     = style.filter(s => s.type === "background");
    let CDVS           = style.find(s => s.type === "CDVS")       ?.elements ?? [];

    highlight  = normalize(highlight);
    focus      = normalizeIndex(focus);
    point      = normalize(point);
    mark       = normalize(mark);
    background = normalize(background);
    CDVS       = normalizeIndex(CDVS);

    const levels    = Math.ceil(Math.log2(ranged_array.length + 1));
    const rowH      = baseBoxSize + (index == 1 || index == 3 || index == 4? indexBoxH : 0); 
    const hPerLevel = rowH;
    const width     = (1 << (levels - 1));       // 最底層葉子數（可能比實際節點多，用滿二的次冪）
    const totalW    = baseBoxSize * width;
    const rows      = (levels == 0 ? 1 : levels);
    const cols      = (width  >  0 ? width : 1 );

    // 把 heap 排版資訊記在 g 上，給 getPosition 用
    g.setAttribute('data-layout', 'heap');
    g.setAttribute('data-heap-levels', String(levels));
    g.setAttribute('data-heap-rowH', String(rowH));
    g.setAttribute('data-heap-totalW', String(totalW));
    g.setAttribute('data-box-size', String(baseBoxSize));

    // 你原本的外框呼叫（保留不動）
    window.draw_array_outerframe(g, groupID, rows * rowH, cols * baseBoxSize);  //畫外框

    const Max = Math.max(...ranged_array);
    let index_cnt = 1;
    // 1. 繪製所有節點
    ranged_array.forEach((v, i) => {
      const lvl = Math.floor(Math.log2(i + 1));
      const cnt = 1 << lvl;
      const w   = totalW / cnt;
      const pos = i - (cnt - 1);
      const x   = pos * w + w / 2 + outerframe_padding;
      const y   = lvl * hPerLevel + outerframe_padding;

      
      const haveFocus        =       focus.length  > 0 ?  focus.includes(i) : true;
      const haveBackground   =  background.findLast(m => Array.isArray(m.elements) && m.elements.includes(i));
      const background_color = (background.findLast(m => Array.isArray(m.elements) && m.elements.includes(i)) ?.color?.trim() || "") || "rgb(231, 144, 255)";

      let fillColor = haveFocus       ? '#fff' : '#ccc';
          fillColor = haveBackground  ? background_color : fillColor;

      if (CDVS.includes(i)) {
        const ratio = Math.min(v / Max, 1); // 限制在 0~1
        const r = Math.round(255 * (1 - ratio) + 40 * ratio);   // 255→40
        const g = Math.round(255 * (1 - ratio) + 183 * ratio);  // 255→183
        const b = Math.round(255 * (1 - ratio) + 255 * ratio);  // 255→255
        fillColor = `rgb(${r}, ${g}, ${b})`;
      }

      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', x - w / 2);
      rect.setAttribute('y', y);
      rect.setAttribute('width',  w);
      rect.setAttribute('height', baseBoxSize);
      rect.setAttribute('fill',   fillColor);
      rect.setAttribute('stroke', '#333');
      rect.setAttribute('stroke-width', '1');
      g.appendChild(rect);

      const lazyVal = (segment_lazy[index_cnt] !== undefined) ? segment_lazy[index_cnt] : 0;
      const setsVal = (segment_sets[index_cnt] !== undefined) ? segment_sets[index_cnt] : 2147483647;
      const sign    = ',';

      // 假設 segmemt_font_colors 是 [[ [cell, seg], color ], ...]
      const now_font_colors = segmemt_font_colors.filter(
        e => Array.isArray(e) && Array.isArray(e[0]) && e[0][0] === index_cnt
      );
      const now_bg_colors   = segmemt_font_bg_colors.filter(
        e => Array.isArray(e) && Array.isArray(e[0]) && e[0][0] === index_cnt
      );

      function getColorFromNowColors(now_font_colors, seg, defaultColor = "#ffffff00") {
        if (!Array.isArray(now_font_colors)) return defaultColor;

        const match = now_font_colors.find(
          e => Array.isArray(e) && Array.isArray(e[0]) && e[0][1] === seg
        );

        if(!match)return defaultColor;

        const color = match[1];
        // color 不存在、不是字串、是空字串 → 給特定替代色
        if (typeof color !== "string" || color.trim() === "") return "#fbff00ff";

        return match[1];
      }
      
      let txt;
      if(CDVS.length>0){
        txt = drawRichText(g, {
          x: x,
          y: y + baseBoxSize / 2,
          fontSize: fitSvgText(g,v,w,baseBoxSize), //自動縮放字體
          parts: [
            { text: `${v}`}
          ]
        });
      } else if(setsVal != 2147483647) {
        txt = drawRichText(g, {
          x: x,
          y: y + baseBoxSize / 2,
          fontSize: fitSvgText(g,`${v},${lazyVal},${setsVal}`,w,baseBoxSize), //自動縮放字體
          parts: [
            { text: `${v}`,       color: getColorFromNowColors(now_font_colors, 0, "#000"), bg: getColorFromNowColors(now_bg_colors, 0, "#ffffff00")},
            { text: `${sign}`,    color: getColorFromNowColors(now_font_colors, 1, "#000"), bg: getColorFromNowColors(now_bg_colors, 1, "#ffffff00")},
            { text: `${lazyVal}`, color: getColorFromNowColors(now_font_colors, 2, "#000"), bg: getColorFromNowColors(now_bg_colors, 2, "#ffffff00")},
            { text: `${sign}`,    color: getColorFromNowColors(now_font_colors, 3, "#000"), bg: getColorFromNowColors(now_bg_colors, 3, "#ffffff00")},
            { text: `${setsVal}`, color: getColorFromNowColors(now_font_colors, 4, "#000"), bg: getColorFromNowColors(now_bg_colors, 4, "#ffffff00")}
          ]
        });
      } else if(lazyVal != 0) {
        txt = drawRichText(g, {
          x: x,
          y: y + baseBoxSize / 2,
          fontSize: fitSvgText(g,`${v},${lazyVal}`,w,baseBoxSize), //自動縮放字體
          parts: [
            { text: `${v}`,       color: getColorFromNowColors(now_font_colors, 0, "#000"), bg: getColorFromNowColors(now_bg_colors, 0, "#ffffff00")},
            { text: `${sign}`,    color: getColorFromNowColors(now_font_colors, 1, "#000"), bg: getColorFromNowColors(now_bg_colors, 1, "#ffffff00")},
            { text: `${lazyVal}`, color: getColorFromNowColors(now_font_colors, 2, "#000"), bg: getColorFromNowColors(now_bg_colors, 2, "#ffffff00")}
          ]
        });
      }  else {
          txt = drawRichText(g, {
          x: x,
          y: y + baseBoxSize / 2,
          fontSize: fitSvgText(g,`${v}`,w,baseBoxSize), //自動縮放字體
          parts: [
            { text: `${v}`,       color: getColorFromNowColors(now_font_colors, 0, "#000"), bg: getColorFromNowColors(now_bg_colors, 0, "#ffffff00")}
          ]
        });
      }
      g.appendChild(txt);

      // 畫 index
      if (index==1 || index>=3) {
        const lbl = index>=3 ? (index_range[0] + i).toString(2).padStart(
              index>=4 ? (index_range[0] + ranged_array.length - 1).toString(2).length : 0,
              '0'
            ) : (index_range[0] + i).toString();
        
        draw_block(g, x - w/2, y + baseBoxSize, lbl, w, indexBoxH, fillColor);
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

      // 畫各式各樣的提示元件
      if (window.HintWidgets){
        const indexH = (index==1 || index>=3 ? indexBoxH : 0);
        // 高光框框（highlight）
        if (haveHighlight)  HintWidgets.drawHighlightBox(g, x - w/2, y, w, baseBoxSize + indexH, highlight_color);

        // 紅色箭頭（point）
        if (havePoint)      HintWidgets.drawArrow(g, x, y, point_color);

        // 綠色勾勾（mark）
        if (haveMark)       HintWidgets.drawMark(g, x + w/2 - 10, y + baseBoxSize - 10, mark_color);
      }
    });

    // 3. 區段上色
    (function drawSegments(){
      if (!Array.isArray(segment_index) || !Array.isArray(segment_left) || !Array.isArray(segment_right)) return;
      const sIndex = normalizeIndex(segment_index);
      const leafCount = (width > 0 ? width : 1);  // 最底層葉子總數（絕對座標系 0..leafCount）
      const seg_bg_color = style.find(s => s.type === "seg_bg")?.color || "rgba(231, 246, 31, 0.45)";

      // 工具：回傳某節點的幾何與其覆蓋的葉子區間（以絕對座標表示）
      function getNodeGeom(i){
        const lvl = Math.floor(Math.log2(i + 1));   // 第幾層 (0-based，自上而下)
        const cnt = 1 << lvl;                       // 此層節點數
        const w   = totalW / cnt;                   // 此節點寬度（像素）
        const pos = i - (cnt - 1);                  // 此節點在該層的索引(0-based)
        const x   = pos * w + w / 2 + outerframe_padding;                // 節點中心 x
        const y   = lvl * hPerLevel + outerframe_padding;                // 節點頂部 y
        const x0  = x - w / 2;                      // 節點左邊 x

        // 此節點覆蓋多少底層葉子（絕對座標系）
        const leafSpan = leafCount / cnt;           // 此節點覆蓋的葉子數
        const leafStart= pos * leafSpan;            // 覆蓋的葉子起點（絕對）
        const leafEnd  = leafStart + leafSpan;      // 覆蓋的葉子終點（絕對）

        return { lvl, cnt, w, pos, x, y, x0, leafSpan, leafStart, leafEnd };
      }

      // 繪製單一節點內的區段（以「絕對葉子座標」指定左右端點）
      function paintSegmentInNode(i, absL, absR){
        if (!Number.isFinite(absL) || !Number.isFinite(absR)) return;
        // 容錯：若 left > right 交換
        let L = absL, R = absR;
        if (L > R) [L, R] = [R, L];

        const geom = getNodeGeom(i);
        // 與節點覆蓋區無交集就跳過
        if (R <= geom.leafStart || L >= geom.leafEnd) return;

        // 轉為節點內的區間比例 [0,1]
        const nodeLRatio = (L - geom.leafStart) / geom.leafSpan;
        const nodeRRatio = (R - geom.leafStart) / geom.leafSpan;

        // 截斷到 [0,1]
        const l = Math.max(0, Math.min(1, nodeLRatio));
        const r = Math.max(0, Math.min(1, nodeRRatio));
        if (r <= l) return;

        // 轉成像素
        const sx = geom.x0 + l * geom.w;
        const ex = geom.x0 + r * geom.w;

        // 畫半透明區段
        const seg = document.createElementNS(NS, 'rect');
        seg.setAttribute('x', sx);
        seg.setAttribute('y', geom.y);
        seg.setAttribute('width',  ex - sx);
        seg.setAttribute('height', baseBoxSize);
        seg.setAttribute('fill',   seg_bg_color); // 黃橘半透明
        seg.setAttribute('stroke', 'rgba(0, 0, 0, 0.9)');
        seg.setAttribute('stroke-width', '1');
        g.appendChild(seg);

        // 兩側端點輔助線（可視需要註解掉）
        const lLine = document.createElementNS(NS, 'line');
        lLine.setAttribute('x1', sx);
        lLine.setAttribute('y1', geom.y);
        lLine.setAttribute('x2', sx);
        lLine.setAttribute('y2', geom.y + baseBoxSize);
        lLine.setAttribute('stroke', 'rgba(0, 0, 0, 0.9)');
        lLine.setAttribute('stroke-width', '1');
        g.appendChild(lLine);

        const rLine = document.createElementNS(NS, 'line');
        rLine.setAttribute('x1', ex);
        rLine.setAttribute('y1', geom.y);
        rLine.setAttribute('x2', ex);
        rLine.setAttribute('y2', geom.y + baseBoxSize);
        rLine.setAttribute('stroke', 'rgba(0, 0, 0, 0.9)');
        rLine.setAttribute('stroke-width', '1');
        g.appendChild(rLine);
      }

      // 逐一繪製：segment_index[k] 對應 segment_left[k], segment_right[k]
      for (let k = 0; k < sIndex.length; k++) {
        const i = sIndex[k];
        const L = segment_left?.[k];
        const R = segment_right?.[k];
        paintSegmentInNode(i, L, R);
      }
    })();
  }

  // === segment_tree 專用：由 groupID + index 算出節點中心座標 ===
  function getSegmentTreePosition(groupID, index, anchor = "center") {
    const vp = window.getViewport && window.getViewport();
    if (!vp) return { x: 0, y: 0 };

    const g = vp.querySelector('#' + CSS.escape(groupID));
    if (!g) return { x: 0, y: 0 };

    // 從 g 讀回當初畫 heap 時存的排版資料
    const levels = parseInt(g.getAttribute('data-heap-levels') || '1', 10);
    const rowH   = parseFloat(g.getAttribute('data-heap-rowH') || String(baseBoxSize));
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
  window.ArrayLayout.segment_tree = {
    getPosition: getSegmentTreePosition
  };

  window.draw_array_segment_tree = draw_array_segment_tree;
})();
