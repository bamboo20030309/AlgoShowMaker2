// draw_text.js
// 在畫布上畫出一個可拖曳的對話框文字元件
/**
 * 將原始文字拆成：
 *  - display：畫在畫布上的文字
 *  - tts    ：給 TTS 念的文字
 *
 * 規則：
 * 1. ( ... )  小括號整段不念，但仍顯示
 * 2. {A:B}    大括號中有冒號：
 *    - display 顯示 A
 *    - tts     念 B
 * 3. {xxx} 或 {沒有冒號}：畫面顯示 xxx，但 TTS 不朗讀
 */
function transformTextForDisplayAndTTS(raw) {
  const s = String(raw ?? "");
  let display = "";
  let tts = "";

  let i = 0;
  const n = s.length;

  while (i < n) {
    const ch = s[i];

    // 規則 1 & 2 & 3：處理 (...) 與 {...}
    if (ch === '(' || ch === '{') {
      const open = ch;
      const close = (ch === '(' ? ')' : '}');
      let j = i + 1;
      let inQuote = false;
      let escaped = false;

      // 往後搜尋結束符號，同時跳過雙引號內容與處理轉義字元
      while (j < n) {
        const c = s[j];
        if (escaped) {
          escaped = false;
        } else if (c === '\\') {
          escaped = true;
        } else if (c === '"') {
          inQuote = !inQuote;
        } else if (!inQuote && c === close) {
          break;
        }
        j++;
      }

      if (j < n) {
        if (open === '(') {
          // 規則 1：小括號 (...) → display 有，tts 不要
          display += s.slice(i, j + 1);
        } else {
          // 處理 {...}
          const inner = s.slice(i + 1, j);
          let colonPos = -1;
          let subInQuote = false;
          let subEscaped = false;

          // 在大括號內容中尋找冒號，同樣需考慮引號
          for (let k = 0; k < inner.length; k++) {
            const c = inner[k];
            if (subEscaped) {
              subEscaped = false;
            } else if (c === '\\') {
              subEscaped = true;
            } else if (c === '"') {
              subInQuote = !subInQuote;
            } else if (!subInQuote && c === ':') {
              colonPos = k;
              break;
            }
          }

          if (colonPos !== -1) {
            // 規則 2：有冒號 → display=左邊、tts=右邊
            display += inner.slice(0, colonPos);
            tts += inner.slice(colonPos + 1);
          } else {
            // 規則 3：沒有冒號 → display 有，但 tts 不念
            display += inner;
          }
        }
        i = j + 1;
        continue;
      }
    }

    // 一般字元
    display += ch;
    tts += ch;
    i++;
  }

  tts = tts.replace(/\s+/g, ' ').trim();
  return { display, tts };
}


// 取得一段文字在某個字型下的「顯示寬度」
// [修正] 預設字型字串應與渲染時一致，避免寬度估算誤差
function getTextWidth(text, fontSize = 14, fontFace = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif') {
  const canvas = getTextWidth._canvas || (getTextWidth._canvas = document.createElement('canvas'));
  const ctx = canvas.getContext('2d');
  ctx.font = `${fontSize}px ${fontFace}`;
  const metrics = ctx.measureText(text);
  return metrics.width;
}

// 判斷全形字（中文、日文、韓文）
function isFullWidth(char) {
  const code = char.codePointAt(0);
  return (
    (code >= 0x1100 && code <= 0x115F) || // 韓文 Jamo
    (code >= 0x2E80 && code <= 0xA4CF) || // CJK、日文、中文
    (code >= 0xAC00 && code <= 0xD7A3) || // 韓文音節
    (code >= 0xF900 && code <= 0xFAFF) || // CJK 相容表意文字
    (code >= 0xFE10 && code <= 0xFE19) || // 直書標點
    (code >= 0xFE30 && code <= 0xFE6F) || // 全形符號
    (code >= 0xFF00 && code <= 0xFF60) || // 全形 ASCII、全形標點
    (code >= 0xFFE0 && code <= 0xFFE6)    // 全形貨幣符號
  );
}


; (function () {
  const NS = 'http://www.w3.org/2000/svg';
  let msgCounter = 0; // 全域計數器，確保 ID 唯一

  function getNextMessageID() {
    msgCounter++;
    return `msg-${msgCounter}`;
  }

  window.resetMessageCounter = function() {
    msgCounter = 0;
  };
  /**
   * 在畫布上畫一個文字框
   * @param {string} content   - 要顯示的文字，可以用 \n 換行
   * @param {object} pos       - 位置規格，支援絕對位置和相對位置（參考 resolvePos）
   */
  function drawText(
    content,
    pos,
    codeLine = -1
  ) {
    const vp = window.getViewport && window.getViewport();
    if (!vp) return;

    pos = window.resolvePos(pos);
    const posAnchor = pos.anchor || '';
    let offsetX = pos.x;
    let offsetY = pos.y;

    // 採用狀態機進行全域解析，支援跨行的語法結構
    let state = "NORMAL";
    let inQuote = false;
    let escaped = false;
    const ttsLines = [[]];
    let displayContent = "";

    const raw = String(content ?? "");
    for (let i = 0; i < raw.length; i++) {
      const char = raw[i];
      let triggerChange = false;

      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inQuote = !inQuote;
      }

      if (!inQuote && !escaped) {
        if (state === "NORMAL") {
          if (char === '(') { state = "IN_PARENS"; triggerChange = true; }
          else if (char === '{') { state = "IN_BRACES_DISP"; triggerChange = true; }
        } else if (state === "IN_PARENS") {
          if (char === ')') { state = "NORMAL"; triggerChange = true; }
        } else if (state === "IN_BRACES_DISP") {
          if (char === ':') { state = "IN_BRACES_TTS"; triggerChange = true; }
          else if (char === '}') { state = "NORMAL"; triggerChange = true; }
        } else if (state === "IN_BRACES_TTS") {
          if (char === '}') { state = "NORMAL"; triggerChange = true; }
        }
      }

      let addToDisplay = false;
      let addToTTS = false;

      if (triggerChange) {
        if (char === '(' || char === ')') addToDisplay = true;
      } else {
        if (state === "NORMAL" || state === "IN_PARENS" || state === "IN_BRACES_DISP") addToDisplay = true;
        if (state === "NORMAL" || state === "IN_BRACES_TTS") addToTTS = true;
      }

      if (char === '\n') {
        displayContent += '\n';
        ttsLines.push([]);
      } else {
        if (addToDisplay) displayContent += char;
        if (addToTTS) ttsLines[ttsLines.length - 1].push(char);
      }
    }

    const ttsLinesArr = ttsLines.map(line => line.join('').trim());
    const ttsContent = ttsLinesArr.filter(t => t.length > 0).join('。');

    // [修正] 不再手動清除，由 clearCanvas 統一處理，以支援同一幀顯示多個 text
    // const oldBubbles = vp.querySelectorAll('g[id^="msg-"]');
    // oldBubbles.forEach(node => node.remove());

    // 產生唯一 ID（這一幀如果你將來想畫多個，也還是保證不重複）
    const groupID = getNextMessageID();

    // 建立 <g>
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('id', groupID);
    g.classList.add('draggable-object');
    g.setAttribute('data-translate', '0,0');
    g.setAttribute('data-tts-text', ttsContent);
    g.setAttribute('data-tts-lines', JSON.stringify(ttsLinesArr));
    vp.appendChild(g);

    if (content == null) content = '';
    content = String(content);

    // 以換行符號切成多行
    const lines = displayContent.split(/\r?\n/);

    const fontSize = 14;
    const lineHeight = fontSize * 1.3;
    const padX = 12;
    const padY = 8;

    // 估算文字寬度
    let textWidth = 0;
    for (const line of lines) {
      // 這裡要與下方 render 時的空格處理邏輯完全一致
      const displayLine = line.replace(/ /g, '\u00A0\u00A0');
      const nowTextWidth = getTextWidth(displayLine, fontSize);
      textWidth = Math.max(textWidth, nowTextWidth);
    }
    textWidth = Math.max(40, textWidth);

    const boxWidth = textWidth + padX * 2;
    const boxHeight = padY * 2 + lineHeight * lines.length;

    // 建立陰影 filter（只建一次）
    const svg = vp.ownerSVGElement;
    if (svg && !svg.querySelector('#text-bubble-shadow')) {
      const defs =
        svg.querySelector('defs') ||
        svg.insertBefore(document.createElementNS(NS, 'defs'), svg.firstChild);

      const filter = document.createElementNS(NS, 'filter');
      filter.setAttribute('id', 'text-bubble-shadow');
      filter.setAttribute('x', '-20%');
      filter.setAttribute('y', '-20%');
      filter.setAttribute('width', '140%');
      filter.setAttribute('height', '140%');

      const feDrop = document.createElementNS(NS, 'feDropShadow');
      feDrop.setAttribute('dx', '0');
      feDrop.setAttribute('dy', '2');
      feDrop.setAttribute('stdDeviation', '2');
      feDrop.setAttribute('flood-color', '#000000');
      feDrop.setAttribute('flood-opacity', '0.25');
      filter.appendChild(feDrop);
      defs.appendChild(filter);
    }

    // 對話框本體
    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', 0);
    rect.setAttribute('y', 0);
    rect.setAttribute('width', boxWidth);
    rect.setAttribute('height', boxHeight);
    rect.setAttribute('rx', 8);
    rect.setAttribute('ry', 8);
    rect.setAttribute('fill', '#ffffff');
    rect.setAttribute('stroke', '#4b5563');
    rect.setAttribute('stroke-width', '1.2');
    rect.setAttribute('filter', 'url(#text-bubble-shadow)');
    g.appendChild(rect);

    // 小三角形（對話框尾巴）
    const pointer = document.createElementNS(NS, 'path');
    const pw = 12;
    const ph = 8;
    const px = boxWidth / 2;
    const py = boxHeight;
    pointer.setAttribute(
      'd',
      `M ${px - pw / 2} ${py} L ${px} ${py + ph} L ${px + pw / 2} ${py} Z`
    );
    pointer.setAttribute('fill', '#ffffff');
    pointer.setAttribute('stroke', '#4b5563');
    pointer.setAttribute('stroke-width', '1.2');
    g.appendChild(pointer);

    // 文字
    const text = document.createElementNS(NS, 'text');
    text.setAttribute('x', padX);
    text.setAttribute('y', padY + fontSize);
    text.setAttribute('fill', '#111827');
    text.setAttribute('font-size', fontSize);
    text.setAttribute(
      'font-family',
      'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    );
    text.setAttribute('xml:space', 'preserve');  // ★ 這行讓 SVG 保留所有空白

    lines.forEach((line, idx) => {
      const tspan = document.createElementNS(NS, 'tspan');
      tspan.setAttribute('data-line-index', idx);
      // 把一般空白換成不斷行空白，避免被 SVG 壓縮
      const displayLine = line.replace(/ /g, '\u00A0\u00A0');
      tspan.setAttribute('x', padX);
      tspan.setAttribute('dy', idx === 0 ? 0 : lineHeight);
      // 如果是空行，放一個不換行空白，確保該行有高度且能套用 dy
      tspan.textContent = displayLine || '\u00A0';
      text.appendChild(tspan);
    });
    g.appendChild(text);

    // 根據 anchor 做自偏移（物件預設往右下延伸）
    // drawText 原本就會把 x 置中（offsetX - boxWidth/2），這裡改用 anchor 系統
    const totalH = boxHeight + 8; // +8 是小三角形的高度
    let apos;
    if (posAnchor) {
      apos = window.applySelfAnchorOffset(offsetX, offsetY, boxWidth, totalH, posAnchor);
    } else {
      // 預設行為：x 置中，y 不補
      apos = { x: offsetX - boxWidth / 2, y: offsetY };
    }
    const finalX = apos.x;
    const finalY = apos.y;
    g.setAttribute('data-base-offset', `${finalX},${finalY}`);
    g.setAttribute('transform', `translate(${finalX},${finalY})`);
  }

  // 暴露到全域，給 CodeScript / 你自己的 JS 用
  window.drawText = drawText;






















  /**
   * drawColoredText
   * segments = [
   *   { text: "123", bg_color: "purple", font_color: "black", font_size: 20 },
   *   { text: "456" } ← 其他欄位可省略
   * ]
   */
  const _AV_COLOR_MAP = {
    'AV_green': 'rgba(165, 214, 167, 0.6)',
    'AV_blue': 'rgba(144, 202, 249, 0.6)',
    'AV_red': 'rgba(239, 154, 154, 0.6)',
    'AV_yellow': 'rgba(252, 255, 64, 0.46)',
    'AV_orange': 'orange',
    'AV_node_green': '#e8f5e9',
    'AV_node_red': '#ef9a9a',
    'AV_grey': '#cccccc',
    'AV_node_grey': '#cccccc',
    'AV_black': 'black',
    'AV_white': 'white'
  };
  function _resolveAVColor(c) { return (c && _AV_COLOR_MAP[c]) ? _AV_COLOR_MAP[c] : c; }

  function drawColoredText(
    segments,
    pos,
    codeLine = -1
  ) {
    const vp = window.getViewport && window.getViewport();
    if (!vp) return;

    pos = window.resolvePos(pos);
    const posAnchor = pos.anchor || '';
    let offsetX = pos.x;
    let offsetY = pos.y;

    // === 採用跨段落/跨行的狀態機解析器 ===
    let state = "NORMAL"; 
    let inQuote = false;
    let escaped = false;

    const processedSegments = [];
    const ttsLines = [[]];

    (segments || []).forEach(seg => {
      const rawText = String(seg?.text ?? "");
      let displayInSeg = "";

      for (let i = 0; i < rawText.length; i++) {
        const char = rawText[i];
        let triggerChange = false;

        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inQuote = !inQuote;
        }

        if (!inQuote && !escaped) {
          if (state === "NORMAL") {
            if (char === '(') { state = "IN_PARENS"; triggerChange = true; }
            else if (char === '{') { state = "IN_BRACES_DISP"; triggerChange = true; }
          } else if (state === "IN_PARENS") {
            if (char === ')') { state = "NORMAL"; triggerChange = true; }
          } else if (state === "IN_BRACES_DISP") {
            if (char === ':') { state = "IN_BRACES_TTS"; triggerChange = true; }
            else if (char === '}') { state = "NORMAL"; triggerChange = true; }
          } else if (state === "IN_BRACES_TTS") {
            if (char === '}') { state = "NORMAL"; triggerChange = true; }
          }
        }

        let addToDisplay = false;
        let addToTTS = false;

        if (triggerChange) {
          if (char === '(' || char === ')') addToDisplay = true;
        } else {
          if (state === "NORMAL" || state === "IN_PARENS" || state === "IN_BRACES_DISP") addToDisplay = true;
          if (state === "NORMAL" || state === "IN_BRACES_TTS") addToTTS = true;
        }

        if (char === '\n') {
          displayInSeg += '\n';
          ttsLines.push([]);
        } else {
          if (addToDisplay) displayInSeg += char;
          if (addToTTS) ttsLines[ttsLines.length - 1].push(char);
        }
      }
      processedSegments.push({ ...seg, text: displayInSeg });
    });

    const ttsLinesArr = ttsLines.map(line => line.join('').trim());
    const ttsContent = ttsLinesArr.filter(t => t.length > 0).join('。');

    // 之後畫字全部改用 processedSegments
    segments = processedSegments;

    // [修正] 不再手動清除，由 clearCanvas 統一處理，以支援同一幀顯示多個 text
    // const oldBubbles = vp.querySelectorAll('g[id^="msg-"]');
    // oldBubbles.forEach(node => node.remove());

    if (!Array.isArray(segments)) segments = [];

    // === 0. 先把含有 \n 的 segment 拆成多行 ===
    // lines: [ [seg, seg, ...], [seg, ...], ... ]
    const lines = [[]];

    segments.forEach(seg => {
      if (!seg) return;
      const base = { ...seg };
      const rawText = String(seg.text ?? "");
      const parts = rawText.split('\n');

      parts.forEach((part, idx) => {
        const cloned = { ...base, text: part };
        lines[lines.length - 1].push(cloned);
        // 不是最後一段 → 開啟新的一行
        if (idx < parts.length - 1) {
          lines.push([]);
        }
      });
    });

    // 直接使用 lines，不透過 filter 過濾掉空行，以支援 \n\n
    const normalizedLines = lines;

    const padX = 12;
    const padY = 8;
    const lineGap = 4;

    let globalMaxFs = 14;
    const lineMetrics = []; // 每一行: { lineWidth, lineMaxFs, segWidths[] }

    normalizedLines.forEach(line => {
      let lineWidth = 0;
      let lineMaxFs = 14;
      const segWidths = [];

      line.forEach(seg => {
        const text = String(seg.text ?? "");
        const fs = Number(seg.font_size) || 14;
        lineMaxFs = Math.max(lineMaxFs, fs);
        globalMaxFs = Math.max(globalMaxFs, fs);

        // 這裡要與下方 render 時的空格處理邏輯一致
        const displayLine = text.replace(/ /g, '\u00A0');
        const nowTextWidth = getTextWidth(displayLine, fs);
        
        segWidths.push(nowTextWidth);
        lineWidth += nowTextWidth;
      });

      lineMetrics.push({ lineWidth, lineMaxFs, segWidths });
    });

    // === 2. 算整個對話框寬高 ===
    let boxWidth = 40;
    let boxHeight = padY * 2 + globalMaxFs;

    if (normalizedLines.length > 0) {
      const maxLineWidth = Math.max(
        40,
        ...lineMetrics.map(m => m.lineWidth + padX * 2)
      );
      boxWidth = maxLineWidth;

      let totalTextHeight = 0;
      lineMetrics.forEach((m, idx) => {
        totalTextHeight += m.lineMaxFs * 1.3;
        if (idx < lineMetrics.length - 1) totalTextHeight += lineGap;
      });

      boxHeight = padY * 2 + totalTextHeight;
    }

    // === 3. 準備 group / 陰影 / 對話框本體 ===
    const svg = vp.ownerSVGElement;
    if (svg && !svg.querySelector('#text-bubble-shadow')) {
      const defs =
        svg.querySelector('defs') ||
        svg.insertBefore(document.createElementNS(NS, 'defs'), svg.firstChild);

      const filter = document.createElementNS(NS, 'filter');
      filter.setAttribute('id', 'text-bubble-shadow');
      filter.setAttribute('x', '-20%');
      filter.setAttribute('y', '-20%');
      filter.setAttribute('width', '140%');
      filter.setAttribute('height', '140%');

      const feDrop = document.createElementNS(NS, 'feDropShadow');
      feDrop.setAttribute('dx', '0');
      feDrop.setAttribute('dy', '2');
      feDrop.setAttribute('stdDeviation', '2');
      feDrop.setAttribute('flood-color', '#000000');
      feDrop.setAttribute('flood-opacity', '0.25');
      filter.appendChild(feDrop);
      defs.appendChild(filter);
    }

    // 產生唯一 ID（假設你已經有 getNextMessageID）
    const groupID = typeof getNextMessageID === 'function'
      ? getNextMessageID()
      : `msg-${Date.now()}`;

    const g = document.createElementNS(NS, 'g');
    g.setAttribute('id', groupID);
    g.classList.add('draggable-object');
    g.setAttribute('data-translate', '0,0');
    g.setAttribute('data-tts-text', ttsContent);
    g.setAttribute('data-tts-lines', JSON.stringify(ttsLinesArr));
    vp.appendChild(g);

    // 對話框底
    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', 0);
    rect.setAttribute('y', 0);
    rect.setAttribute('width', boxWidth);
    rect.setAttribute('height', boxHeight);
    rect.setAttribute('rx', 8);
    rect.setAttribute('ry', 8);
    rect.setAttribute('fill', '#ffffff');
    rect.setAttribute('stroke', '#4b5563');
    rect.setAttribute('stroke-width', '1.2');
    rect.setAttribute('filter', 'url(#text-bubble-shadow)');
    g.appendChild(rect);

    // 小三角形
    const pointer = document.createElementNS(NS, 'path');
    const pw = 12;
    const ph = 8;
    const px = boxWidth / 2;
    const py = boxHeight;
    pointer.setAttribute(
      'd',
      `M ${px - pw / 2} ${py} L ${px} ${py + ph} L ${px + pw / 2} ${py} Z`
    );
    pointer.setAttribute('fill', '#ffffff');
    pointer.setAttribute('stroke', '#4b5563');
    pointer.setAttribute('stroke-width', '1.2');
    g.appendChild(pointer);

    // === 4. 每一行逐行畫：背景 + 文字 ===
    const paddingBgX = 2;
    const paddingBgY = 2;

    let lineTop = padY; // 每行的 top（非 baseline）

    normalizedLines.forEach((line, lineIndex) => {
      const { lineMaxFs, segWidths } = lineMetrics[lineIndex];

      const baselineY = lineTop + lineMaxFs; // 文字 baseline

      // 一行一個 <text> 比較好控制
      const textNode = document.createElementNS(NS, 'text');
      textNode.setAttribute('data-line-index', lineIndex);
      textNode.setAttribute('x', padX);
      textNode.setAttribute('y', baselineY);
      textNode.setAttribute('xml:space', 'preserve');
      textNode.setAttribute(
        'font-family',
        'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
      );
      g.appendChild(textNode);

      let cursorX = padX;

      line.forEach((seg, segIndex) => {
        const rawText = String(seg.text ?? "");
        const fs = Number(seg.font_size) || 14;
        const fg = _resolveAVColor(seg.font_color) || '#111827';
        const bg = _resolveAVColor(seg.bg_color) || null;
        const segWidth = segWidths[segIndex];

        // 背景色：稍微比文字寬 / 高一點，並極強制排除任何可能的外框（邊框）
        if (bg) {
          const bgRect = document.createElementNS(NS, 'rect');
          bgRect.setAttribute('x', cursorX - paddingBgX);
          bgRect.setAttribute(
            'y',
            baselineY - fs * 0.85 - paddingBgY
          );
          bgRect.setAttribute('width', segWidth + paddingBgX * 2);
          bgRect.setAttribute('height', fs * 1.0 + paddingBgY * 2);
          bgRect.setAttribute('fill', bg);
          bgRect.setAttribute('stroke', 'none');
          bgRect.setAttribute('stroke-width', '0');
          // 雙重防禦：使用 !important 行內樣式強制覆蓋任何可能的全域 CSS 邊框設定！
          bgRect.style.cssText = 'stroke: none !important; stroke-width: 0px !important; outline: none !important; box-shadow: none !important;';
          bgRect.setAttribute('rx', 2);
          bgRect.setAttribute('ry', 2);
          g.insertBefore(bgRect, textNode); // 背景在文字下面
        }

        // 文字 tspan（半形空白 → NBSP，避免被壓縮）
        const tspan = document.createElementNS(NS, 'tspan');
        tspan.setAttribute('x', cursorX);
        tspan.setAttribute('dy', 0);
        tspan.setAttribute('fill', fg);
        tspan.setAttribute('font-size', fs);

        tspan.textContent = rawText.replace(/ /g, '\u00A0');
        textNode.appendChild(tspan);

        cursorX += segWidth;
      });

      // 下一行 top：這行高度 + 行距
      lineTop += lineMaxFs * 1.3 + lineGap;
    });

    // 根據 anchor 做自偏移
    const totalH = boxHeight + 8; // +8 是小三角形高度
    let apos;
    if (posAnchor) {
      apos = window.applySelfAnchorOffset(offsetX, offsetY, boxWidth, totalH, posAnchor);
    } else {
      apos = { x: offsetX - boxWidth / 2, y: offsetY };
    }
    const finalX = apos.x;
    const finalY = apos.y;
    g.setAttribute('data-base-offset', `${finalX},${finalY}`);
    g.setAttribute('transform', `translate(${finalX},${finalY})`);
  }


  // 全域導出
  window.drawColoredText = drawColoredText;

})();
