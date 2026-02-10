// draw_array_outerframe.js
;(function() {
  const NS = 'http://www.w3.org/2000/svg';
  const baseBoxSize = 40;
  const indexBoxH   = 12;
  const outerframe_padding = 8;

  /**
   * 繪製陣列或堆疊樹的外框。
   * @param {SVGGElement} g            - 容器 SVG 群組
   * @param {string}      groupID      - 群組識別符號，用於顯示標題
   * @param {number}      height       - 高(單位長度)
   * @param {number}      width        - 寬(單位長度)
   */
  function draw_array_outerframe(
    g,
    groupID,
    height,
    width
  ) {
    const pad = 8;
    const nameH = 24;

    const totalH = height;  
    const totalW = width; 
    const frameX = -pad; 
    const frameW = totalW + pad * 2;

    // 背景大框
    const bg = document.createElementNS(NS, 'rect');
    bg.setAttribute('x', frameX + outerframe_padding);
    bg.setAttribute('y', -pad + outerframe_padding);
    bg.setAttribute('width', frameW);
    bg.setAttribute('height', height + pad * 2 + nameH);
    bg.setAttribute('fill', 'rgba(209,230,172,0.5)');
    bg.setAttribute('stroke', '#333');
    bg.setAttribute('stroke-width', '2');
    g.appendChild(bg);

    // 底部名稱區
    const nb = document.createElementNS(NS, 'rect');
    nb.setAttribute('x', frameX + outerframe_padding);
    nb.setAttribute('y', height + pad + outerframe_padding);
    nb.setAttribute('width', frameW);
    nb.setAttribute('height', nameH);
    nb.setAttribute('fill', 'none');
    g.appendChild(nb);

    // 群組名稱文字
    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', frameX + frameW / 2 + outerframe_padding);
    label.setAttribute('y', height + pad + nameH / 2 + outerframe_padding);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('dominant-baseline', 'middle');
    label.setAttribute('font-size', '14');
    label.setAttribute('fill', '#333');
    label.textContent = groupID;
    g.appendChild(label);

    const left = frameX;
    const top = -pad;
    const right = frameX + frameW;
    const bottom = -pad + (totalH + pad * 2 + nameH);
    writeOuterframeBBox(g, left, top, right, bottom);
    return;
  }

  function writeOuterframeBBox(g, left, top, right, bottom) {
    g.setAttribute('data-outerframe-left',   String(left));
    g.setAttribute('data-outerframe-top',    String(top));
    g.setAttribute('data-outerframe-right',  String(right));
    g.setAttribute('data-outerframe-bottom', String(bottom));
  }


  function getOuterframePosition(groupID, direction = "center") {
    const vp = window.getViewport && window.getViewport();
    if (!vp) return { x: 0, y: 0 };

    const g = vp.querySelector('#' + CSS.escape(groupID));
    if (!g) return { x: 0, y: 0 };

    const [baseX, baseY] = (g.getAttribute('data-base-offset') || '0,0')
      .split(',').map(Number);
    const [dx, dy] = (g.getAttribute('data-translate') || '0,0')
      .split(',').map(Number);

    const left   = parseFloat(g.getAttribute('data-outerframe-left')   || '0');
    const top    = parseFloat(g.getAttribute('data-outerframe-top')    || '0');
    const right  = parseFloat(g.getAttribute('data-outerframe-right')  || '0');
    const bottom = parseFloat(g.getAttribute('data-outerframe-bottom') || '0');

    const cxLocal = (left + right) / 2;
    const cyLocal = (top + bottom) / 2;

    const dir = String(direction || "center").toLowerCase();

    let xLocal = cxLocal;
    let yLocal = cyLocal;

    if (dir === "up" || dir === "top") {
      xLocal = cxLocal; yLocal = top;
    } else if (dir === "down" || dir === "bottom") {
      xLocal = cxLocal; yLocal = bottom;
    } else if (dir === "left") {
      xLocal = left;    yLocal = cyLocal;
    } else if (dir === "right") {
      xLocal = right;   yLocal = cyLocal;
    } else {
      // center / middle
      xLocal = cxLocal; yLocal = cyLocal;
    }

    return { x: baseX + dx + xLocal, y: baseY + dy + yLocal };
  }

  window.draw_array_outerframe = draw_array_outerframe;
  window.getOuterframePosition = getOuterframePosition;
})();
