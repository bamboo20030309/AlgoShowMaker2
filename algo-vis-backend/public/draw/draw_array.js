// draw_array.js
;(function() {
  const NS = 'http://www.w3.org/2000/svg';
  const baseBoxSize = 40;      // Normal 模式下正方形邊長
  const indexBoxH   = 12;
  let initedDefs   = false;

  function ensureDefs() {
    const svg = window.getViewport().ownerSVGElement;
    if (!svg) return;
    if (!svg.querySelector('#highlight-defs')) {
      const defs = document.createElementNS(NS, 'defs');
      defs.setAttribute('id', 'highlight-defs');
      const style = document.createElementNS(NS, 'style');
      
      // 補上 arrow-bounce 的動畫定義
      style.textContent = `
        @keyframes blink-stroke {
          0%,100% { stroke-opacity:1; }
          50% { stroke-opacity:0; }
        }
        .highlight-blink { animation: blink-stroke 1s infinite; }

        @keyframes arrow-bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
        .arrow-bounce { 
          animation: arrow-bounce 1s infinite ease-in-out; 
          transform-box: fill-box; /* 重要：讓 transform 相對自身 */
          transform-origin: center; 
        }
      `;
      defs.appendChild(style);
      svg.insertBefore(defs, svg.firstChild);
    }
  }

  /**
   * @param {string}           groupID
   * @param {number}           offsetX
   * @param {number}           offsetY
   * @param {Array}            array
   * @param {Array<StyleItem>} style                - 要繪製的輔助元素
   * @param {Array|number}     range      // [] 全部、n: [n,∞)、[n,m]: [n,m]
   * @param {string}           draw_type  // "normal" , "heap" , "segment_tree" , "BIT"
   * @param {number}           itemsPerRow
   * @param {number}           index                - 0 = element, 1 = element + index, 2 = index, 3 = element + index_bin, 4 = element + index_bin_padZero
   * @param {Array}            segment_lazy         - 線段樹的lazy部分
   * @param {Array}            segment_sets         - 線段樹的sets部分
   * @param {Array}            segment_index        - 要畫區段的格子(為一段格子上色)
   * @param {Array}            segment_left         - 要畫區段格子的左點(絕對位置)
   * @param {Array}            segment_right        - 要畫區段格子的右點(絕對位置)
   * @param {Array}            segmemt_font_colors  - 要畫的格子的區段的字串顏色
   * @param {Array}            segmemt_bg_colors    - 要畫的格子的區段的字串背景顏色
   */
  function drawArray(
    groupID,
    offsetX = 0, 
    offsetY = 0,
    array,
    style = [],
    range,
    draw_type = "normal",
    itemsPerRow = Infinity,
    index = 0,
    segment_lazy = [],
    segment_sets = [],
    segment_index = [],
    segment_left  = [],
    segment_right = [],
    segmemt_font_colors = [],
    segmemt_bg_colors = []
  ) {

    // 正規化 Array|number => Array [0, array.length)
    function normalizeIndex(input) {
      if (!Array.isArray(input)) input = [input];
      return input.filter(i => Number.isInteger(i) && i >= 0 && i < array.length);
    }

    // style 正規化（處理每一組 type）
    if (Array.isArray(style)) {
      style = style.map(s => {
        if (Array.isArray(s)) {
          // 陣列格式 ["highlight", "#FFD54F", 0, 1, 2]
          const [type, color, ...elements] = s;
          return [type, color, ...normalizeIndex(elements)];
        } else if (typeof s === 'object' && s !== null) {
          // 物件格式 { type:"highlight", color:"#FFD54F", elements:[0,1,2] }
          const { type, color, elements = [] } = s;
          return {
            ...s,
            elements: normalizeIndex(elements)
          };
        }
        // 無效項目保持原樣
        return s;
      });
    }


    // 正規化 range → index_range: [min, max]
    let index_range;
    if (draw_type === "heap" || draw_type === "segment_tree" || draw_type === "BIT") {
      index_range = [1, array.length-1];
    } else if (range === undefined) {
      index_range = [0, array.length-1];
    } else if (Array.isArray(range)) {
      index_range = range.length >= 2
        ? [ range[0], range[1] ]
        : [ range[0], array.length-1 ];
    } else {
      index_range = [ range, array.length-1 ];
    }

    const vp = window.getViewport();
    if (!vp) return;
    if (!initedDefs) { ensureDefs(); initedDefs = true; }

    if (itemsPerRow <= 0) {
      itemsPerRow = array.length;
    }

    // index超過範圍防呆
    if (index > 4) index = 0;


    // 建或取 g
    let g = vp.querySelector('#' + groupID);
    if (!g) {
      g = document.createElementNS(NS, 'g');
      g.setAttribute('id', groupID);
      g.classList.add('draggable-object');
      g.setAttribute('data-translate', '0,0');
      g.setAttribute('data-base-transform', '');
      vp.appendChild(g);
    }
    while (g.firstChild) g.removeChild(g.firstChild);

    switch(draw_type) {

      case 'normal':
        window.draw_array_normal(
          g, groupID, array, style, index_range, itemsPerRow, index
        );
        break;

      case 'heap':
        window.draw_array_heap(
          g, groupID, array, style, index_range, index
        );
        break;

      case 'segment_tree':
        window.draw_array_segment_tree(
          g, groupID, array, style, index_range, index, segment_lazy, segment_sets, segment_index, segment_left, segment_right, segmemt_font_colors, segmemt_bg_colors
        );
        break;

      case 'BIT':
        window.draw_array_BIT(
          g, groupID, array, style, index_range, index
        );
        break;

      default:
        // 萬一沒傳或傳錯，就當成 normal
        window.draw_array_normal(
          g, groupID, array, style, index_range, itemsPerRow, index
        );
    }

    // 1) 讀出拖曳偏移
    const [dx, dy] = (g.getAttribute('data-translate') || '0,0')
                      .split(',').map(Number);
 
    // 2) 把 CodeScript 本幀的位移存在 data-base-offset
    g.setAttribute('data-base-offset', `${offsetX},${offsetY}`);
 
    // 3) 合併 base + 拖曳偏移，更新 transform
    g.setAttribute(
      'transform',
      `translate(${offsetX + dx},${offsetY + dy})`
    );
  }

  window.drawArray = drawArray;
})();
