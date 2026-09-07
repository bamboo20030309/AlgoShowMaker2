/* gui_editor.js — 畫布 GUI 編輯器 Phase 1: 攔截 + 右鍵選單 + 屬性面板 */
; (function () {
  'use strict';

  // ============================================================
  //  1. Draw Call 攔截與記錄
  // ============================================================
  const _frameRegistry = {};   // frameNum -> [ {type, args, codeLine, groupID} ]
  let _recFrame = -1;
  let _recLine = -1;
  let _recording = false;

  let _msgCount = 0;
  let _arrowAutoCount = 0;
  function startRecording(frame) {
    _recFrame = frame;
    _recLine = -1;
    _recording = true;
    _msgCount = 0;
    _arrowAutoCount = 0;
    if (!_frameRegistry[frame]) _frameRegistry[frame] = [];
    else _frameRegistry[frame].length = 0;
  }
  function stopRecording() { _recording = false; }

  // Wrap addEditorHighlight
  const _origHL = window.addEditorHighlight;
  window.addEditorHighlight = function (line) {
    if (_recording) _recLine = line;
    if (_origHL) return _origHL.apply(this, arguments);
  };

  // Wrap drawArray
  const _origDA = window.drawArray;
  window.drawArray = function (groupID, pos, array, style, range, draw_type, itemsPerRow, index, gap) {
    let line = _recLine;
    const lastArg = arguments[arguments.length - 1];
    if (typeof lastArg === 'number' && lastArg > 0) line = lastArg;
    if (_recording) {
      _frameRegistry[_recFrame].push({
        type: 'drawArray', groupID,
        args: Array.from(arguments),
        codeLine: line
      });
    }
    if (_origDA) return _origDA.apply(this, arguments);
  };

  // Wrap draw2DArray
  const _origD2A = window.draw2DArray;
  window.draw2DArray = function (groupID, pos, matrix, style, range, draw_type, index) {
    let line = _recLine;
    const lastArg = arguments[arguments.length - 1];
    if (typeof lastArg === 'number' && lastArg > 0) line = lastArg;
    if (_recording) {
      _frameRegistry[_recFrame].push({
        type: 'draw2DArray', groupID,
        args: Array.from(arguments),
        codeLine: line
      });
    }
    if (_origD2A) return _origD2A.apply(this, arguments);
  };

  // Wrap drawArrow
  const _origAR = window.drawArrow;
  window.drawArrow = function (startSpec, endSpec, opt) {
    let line = _recLine;
    const lastArg = arguments[arguments.length - 1];
    if (typeof lastArg === 'number' && lastArg > 0) line = lastArg;
    
    const autoKey = 'auto-' + (_arrowAutoCount++);
    const gid = (opt && (opt.key || opt.groupID)) ? (opt.key || opt.groupID) : autoKey;
    if (_recording) {
      _frameRegistry[_recFrame].push({
        type: 'drawArrow', groupID: gid,
        args: Array.from(arguments),
        codeLine: line
      });
    }
    
    // 確保 opt 有 key 傳給 draw_arrow.js 內部使用
    let newOpt = opt ? { ...opt } : {};
    if (newOpt.key == null) newOpt.key = gid;
    
    return _origAR(startSpec, endSpec, newOpt, line);
  };

  // Wrap drawText
  const _origDT = window.drawText;
  window.drawText = function (content, pos) {
    let line = _recLine;
    const lastArg = arguments[arguments.length - 1];
    if (typeof lastArg === 'number' && lastArg > 0) line = lastArg;
    let gid = null;
    if (_recording) {
      _msgCount++;
      gid = `msg-${_msgCount}`;
      _frameRegistry[_recFrame].push({
        type: 'drawText', groupID: gid,
        args: Array.from(arguments),
        codeLine: line
      });
    }
    return _origDT.apply(this, arguments);
  };

  // Wrap drawColoredText
  const _origCT = window.drawColoredText;
  window.drawColoredText = function (segments, pos) {
    let line = _recLine;
    const lastArg = arguments[arguments.length - 1];
    if (typeof lastArg === 'number' && lastArg > 0) line = lastArg;
    let gid = null;
    if (_recording) {
      _msgCount++;
      gid = `msg-${_msgCount}`;
      _frameRegistry[_recFrame].push({
        type: 'drawColoredText', groupID: gid,
        args: Array.from(arguments),
        codeLine: line
      });
    }
    return _origCT.apply(this, arguments);
  };

  // Wrap drawCircle
  const _origDC = window.drawCircle;
  window.drawCircle = function (id, pos, value, style) {
    let line = _recLine;
    const lastArg = arguments[arguments.length - 1];
    if (typeof lastArg === 'number' && lastArg > 0) line = lastArg;
    if (_recording) {
      _frameRegistry[_recFrame].push({
        type: 'drawCircle', groupID: id,
        args: Array.from(arguments),
        codeLine: line
      });
    }
    return _origDC.apply(this, arguments);
  };

  // Wrap drawWord
  const _origDW = window.drawWord;
  window.drawWord = function (content, pos) {
    let line = _recLine;
    const lastArg = arguments[arguments.length - 1];
    if (typeof lastArg === 'number' && lastArg > 0) line = lastArg;
    if (_recording) {
      _frameRegistry[_recFrame].push({
        type: 'drawWord', groupID: null,
        args: Array.from(arguments),
        codeLine: line
      });
    }
    if (_origDW) return _origDW.apply(this, arguments);
  };

  // Wrap drawTriangle
  const _origDTR = window.drawTriangle;
  window.drawTriangle = function (id, pos, h, w, style) {
    let line = _recLine;
    const lastArg = arguments[arguments.length - 1];
    if (typeof lastArg === 'number' && lastArg > 0) line = lastArg;
    if (_recording) {
      _frameRegistry[_recFrame].push({
        type: 'drawTriangle', groupID: id,
        args: Array.from(arguments),
        codeLine: line
      });
    }
    if (_origDTR) return _origDTR.apply(this, arguments);
  };

  // Hook into CodeScript rendering
  const _origClearCanvas = window.clearCanvas;
  window.clearCanvas = function (full) {
    // 在清畫布前開始記錄新的一幀
    if (window.CodeScript) {
      const f = window.CodeScript.get_current_frame_index();
      startRecording(f);
    }
    // 切換幀時自動關閉屬性面板與右鍵選單
    hidePropPanel();
    hideCtxMenu();
    return _origClearCanvas.apply(this, arguments);
  };

  // Hook sweepCanvas to stop recording
  const _origSweep = window.sweepCanvas;
  window.sweepCanvas = function () {
    stopRecording();
    if (_origSweep) return _origSweep.apply(this, arguments);
  };

  // ============================================================
  //  2. 工具函式
  // ============================================================
  // 檢查是否為 Pos 位置物件
  function isPosObject(arg) {
    if (!arg || typeof arg !== 'object' || Array.isArray(arg)) return false;
    if (arg.type === 'abs' || arg.type === 'rel') return true;
    if (arg.ref !== undefined) return true;
    if (arg.x !== undefined && arg.y !== undefined) return true;
    if (arg.dx !== undefined || arg.dy !== undefined) return true;
    return false;
  }

  function getCurrentFrameDrawCalls() {
    if (!window.CodeScript) return [];
    const f = window.CodeScript.get_current_frame_index();
    return _frameRegistry[f] || [];
  }

  function findDrawCallByGroupID(groupID) {
    const calls = getCurrentFrameDrawCalls();
    return calls.find(c => c.groupID === groupID) || null;
  }

  // 重新渲染當前幀（即時預覽）
  function replayCurrentFrame() {
    if (!window.CodeScript) return;
    const f = window.CodeScript.get_current_frame_index();
    const calls = _frameRegistry[f];
    if (!calls || calls.length === 0) return;

    // 暫停錄製以避免遞迴
    _recording = false;
    // 重設文字 ID 計數器，確保重繪出來的 SVG 元素 ID 與 _frameRegistry 保持一致
    if (window.resetMessageCounter) {
      window.resetMessageCounter();
    }
    // 完整清空畫布（包含箭頭）
    const vp = window.getViewport();
    if (vp) {
      Array.from(vp.children).forEach(node => {
        const id = node.getAttribute('id');
        const fill = node.getAttribute('fill');
        if (fill && fill.includes('grid')) return;       // 保留背景格線
        if (id === 'drawingLayer') return;               // 保留塗鴉層
        vp.removeChild(node);                            // 刪掉包含 arrow-layer
      });
    }
    // 重置箭頭狀態
    if (window.resetArrows) window.resetArrows();
    _recording = false;

    // 嘗試找回目標物件 (因為 DOM node 被替換了)
    const oldTargetId = _propTarget ? _propTarget.getAttribute('id') : null;
    const oldArrowKey = _propTarget ? (_propTarget.getAttribute('data-arrow-key') || _propTarget.getAttribute('data-arrow-id')) : null;

    calls.forEach(c => {
      switch (c.type) {
        case 'drawArray': if (_origDA) _origDA.apply(null, c.args); break;
        case 'draw2DArray': if (_origD2A) _origD2A.apply(null, c.args); break;
        case 'drawArrow': if (_origAR) _origAR.apply(null, c.args); break;
        case 'drawText': if (_origDT) _origDT.apply(null, c.args); break;
        case 'drawColoredText': if (_origCT) _origCT.apply(null, c.args); break;
        case 'drawCircle': if (_origDC) _origDC.apply(null, c.args); break;
        case 'drawWord': if (_origDW) _origDW.apply(null, c.args); break;
        case 'drawTriangle': if (_origDTR) _origDTR.apply(null, c.args); break;
      }
    });

    if (window.sweepCanvas) window.sweepCanvas();

    // 樣式補正：針對 drawText 即時預覽自定義的文字大小、顏色與背景色
    calls.forEach(c => {
      if (c.type === 'drawText' && c._textSegments && c._textSegments[0]) {
        const seg = c._textSegments[0];
        const gNode = document.getElementById(c.groupID);
        if (gNode) {
          const rect = gNode.querySelector('rect');
          const pointer = gNode.querySelector('path');
          const text = gNode.querySelector('text');

          if (rect && seg.bg_color) rect.setAttribute('fill', getRgbaOrHex(seg.bg_color));
          if (pointer && seg.bg_color) pointer.setAttribute('fill', getRgbaOrHex(seg.bg_color));
          if (text && seg.font_color) text.setAttribute('fill', getRgbaOrHex(seg.font_color));
          if (text && seg.font_size) {
            text.setAttribute('font-size', seg.font_size);
            text.querySelectorAll('tspan').forEach(tspan => tspan.setAttribute('font-size', seg.font_size));
          }
        }
      }
    });

    // 恢復目標物件引用
    if (oldTargetId) {
      _propTarget = document.getElementById(oldTargetId);
    } else if (oldArrowKey) {
      _propTarget = document.querySelector(`line[data-arrow-key="${oldArrowKey}"], line[id="${oldArrowKey}"], path[data-arrow-key="${oldArrowKey}"]`);
    }

    // 重繪後 DOM 元素被替換，刷新選取狀態
    if (window._canvasInteraction && window._canvasInteraction.refreshSelection) {
      window._canvasInteraction.refreshSelection();
    }
  }

  /**
   * 拖曳結束的回呼 (由 interaction.js 觸發)
   */
  window.onObjectDragEnd = function (id, dx, dy, dragType, newPosSpec) {
    let dc = findDrawCallByGroupID(id);
    if (!dc) {
      // 嘗試處理箭頭 (其 id 形如 'arrow-X')
      const node = document.getElementById(id);
      if (node && node.getAttribute('data-arrow-key')) {
        dc = findDrawCallByGroupID(node.getAttribute('data-arrow-key'));
      }
    }
    if (!dc) return;

    // 更新符合 Pos 結構的參數
    const updatedIndices = [];
    for (let i = 0; i < dc.args.length; i++) {
      let posArg = dc.args[i];
      if (isPosObject(posArg)) {
        // 如果是箭頭，且有指定拖曳方向 (start 或 end)，只更新對應的 Pos 參數
        if (dc.type === 'drawArrow' && dragType) {
          if (dragType === 'start' && i !== 0) continue;
          if (dragType === 'end' && i !== 1) continue;
        }

        if (newPosSpec) {
          dc.args[i] = newPosSpec;
        } else {
          if (posArg.type === 'rel' || posArg.ref) {
            posArg.dx = (posArg.dx || 0) + dx;
            posArg.dy = (posArg.dy || 0) + dy;
            // 同步 x, y 以相容部分邏輯
            posArg.x = posArg.dx;
            posArg.y = posArg.dy;
          } else {
            posArg.x = (posArg.x || 0) + dx;
            posArg.y = (posArg.y || 0) + dy;
          }
        }
        updatedIndices.push(i);
      }
    }

    if (updatedIndices.length === 0) return;

    // 更新介面 (如果面板開著)
    if (_propPanel && _propPanel.style.display !== 'none' && _propDrawCall === dc) {
      showPropPanel(_currentPropSection);
    }

    replayCurrentFrame();
    updatedIndices.forEach(idx => syncPosToCpp(dc, idx));
  };

  let _currentPropSection = 'all';

  // ============================================================
  //  3. 右鍵選單
  // ============================================================
  let _ctxMenu = null;
  let _ctxTarget = null;   // 右鍵點到的 .draggable-object
  let _ctxDrawCall = null;  // 對應的 draw call 記錄

  function createCtxMenu() {
    if (_ctxMenu) return _ctxMenu;
    _ctxMenu = document.createElement('div');
    _ctxMenu.className = 'gui-ctx-menu';
    _ctxMenu.style.display = 'none';
    document.body.appendChild(_ctxMenu);
    return _ctxMenu;
  }

  function hideCtxMenu() {
    if (_ctxMenu) _ctxMenu.style.display = 'none';
    _ctxTarget = null;
    _ctxDrawCall = null;
  }

  function showCtxMenu(e, obj, drawCall) {
    const menu = createCtxMenu();
    _ctxTarget = obj;
    _ctxDrawCall = drawCall;

    const id = obj.getAttribute('id') || '(無ID)';
    const type = drawCall ? drawCall.type : '未知';
    const line = drawCall ? drawCall.codeLine : -1;

    let html = `<div class="ctx-label">${type} — ${id}</div>`;

    // 自動化顯示邏輯：只要繪圖參數含有 Pos 物件，右鍵選單就自動賦予「編輯位置」區塊
    let hasPos = false;
    if (drawCall && drawCall.args) {
      hasPos = drawCall.args.some(arg => isPosObject(arg));
    }

    if (hasPos) {
      html += `<div class="ctx-item" data-action="edit-pos"><span class="ctx-icon">📍</span>編輯位置</div>`;
    }

    if (drawCall && (drawCall.type === 'drawArray' || drawCall.type === 'draw2DArray')) {
      html += `<div class="ctx-item" data-action="edit-style"><span class="ctx-icon">🎨</span>編輯格子樣式</div>`;
      html += `<div class="ctx-item" data-action="edit-layout"><span class="ctx-icon">📐</span>編輯繪製參數</div>`;
    } else if (drawCall && drawCall.type === 'drawCircle') {
      html += `<div class="ctx-item" data-action="edit-circle-style"><span class="ctx-icon">🎨</span>編輯樣式</div>`;
    } else if (drawCall && drawCall.type === 'drawArrow') {
      html += `<div class="ctx-item" data-action="edit-style"><span class="ctx-icon">🎨</span>編輯樣式</div>`;
    } else if (drawCall && (drawCall.type === 'drawText' || drawCall.type === 'drawColoredText')) {
      html += `<div class="ctx-item" data-action="edit-text-style"><span class="ctx-icon">📝</span>編輯文字與樣式</div>`;
    }

    if (line >= 0) {
      html += `<div class="ctx-sep"></div>`;
      html += `<div class="ctx-item" data-action="goto-code"><span class="ctx-icon">📝</span>跳到程式碼 (行 ${line + 1})</div>`;
    }

    html += `<div class="ctx-sep"></div>`;
    html += `<div class="ctx-item" data-action="show-info"><span class="ctx-icon">ℹ️</span>顯示完整屬性</div>`;

    menu.innerHTML = html;
    menu.style.display = 'block';
    menu.style.left = Math.min(e.clientX, window.innerWidth - 200) + 'px';
    menu.style.top = Math.min(e.clientY, window.innerHeight - 300) + 'px';

    // 綁定事件
    menu.querySelectorAll('.ctx-item').forEach(item => {
      item.onclick = () => {
        const action = item.dataset.action;
        // 先保存引用，再隱藏選單
        const savedTarget = _ctxTarget;
        const savedDrawCall = _ctxDrawCall;
        hideCtxMenu();
        // 恢復引用供 handleCtxAction 使用
        _ctxTarget = savedTarget;
        _ctxDrawCall = savedDrawCall;
        handleCtxAction(action);
      };
    });
  }

  function handleCtxAction(action) {
    if (!_ctxDrawCall && action !== 'show-info') return;
    switch (action) {
      case 'edit-pos': _currentPropSection = 'pos'; showPropPanel('pos'); break;
      case 'edit-style': _currentPropSection = 'style'; showPropPanel('style'); break;
      case 'edit-layout': _currentPropSection = 'layout'; showPropPanel('layout'); break;
      case 'edit-circle-style': _currentPropSection = 'circle-style'; showPropPanel('circle-style'); break;
      case 'edit-text-style': _currentPropSection = 'text-style'; showPropPanel('text-style'); break;
      case 'show-info': _currentPropSection = 'all'; showPropPanel('all'); break;
      case 'goto-code':
        if (_ctxDrawCall && _ctxDrawCall.codeLine >= 0) {
          const editor = getEditor();
          if (!editor) break;
          const line = _ctxDrawCall.codeLine; // 1-based
          // 先清除舊高亮，再加新的螢光色高亮
          if (typeof clearAllEditorHighlights === 'function') clearAllEditorHighlights();
          if (typeof addEditorHighlight === 'function') addEditorHighlight(line, true);
          editor.gotoLine(line, 0, true);
          editor.scrollToLine(line - 1, true, true, function () { });
          editor.focus();
        }
        break;
    }
  }

  // ============================================================
  //  4. 屬性面板
  // ============================================================
  let _propPanel = null;
  let _propDrawCall = null;
  let _propTarget = null;

  function createPropPanel() {
    if (_propPanel) return _propPanel;
    _propPanel = document.createElement('div');
    _propPanel.className = 'gui-prop-panel';
    _propPanel.style.display = 'none';
    document.body.appendChild(_propPanel);
    return _propPanel;
  }

  function hidePropPanel() {
    if (_propPanel) _propPanel.style.display = 'none';
  }

  function showPropPanel(section) {
    const panel = createPropPanel();
    // 只有在明確從右鍵選單觸發時才更新 _propDrawCall
    if (_ctxDrawCall) {
      _propDrawCall = _ctxDrawCall;
      _propTarget = _ctxTarget;
    }

    if (!_propDrawCall) {
      const id = _propTarget ? _propTarget.getAttribute('id') : '?';
      panel.innerHTML = buildHeader('物件資訊 — ' + id) +
        `<div class="prop-section"><p style="color:#9ca3af;font-size:12px;">此物件無對應的繪圖呼叫記錄。<br>請先執行程式碼再嘗試編輯。</p></div>`;
      positionPanel(panel);
      // 綁定關閉
      const closeBtn = panel.querySelector('#prop-close-btn');
      if (closeBtn) closeBtn.onclick = hidePropPanel;
      return;
    }

    let content = '';
    const dc = _propDrawCall;
    const id = dc.groupID || _propTarget?.getAttribute('id') || '?';
    content += buildHeader(dc.type + ' — ' + id);

    if (section === 'all' || section === 'pos') {
      content += buildPosSection(dc);
    }
    if ((dc.type === 'drawArray' || dc.type === 'draw2DArray') && (section === 'all' || section === 'style')) {
      content += buildArrayStyleSection(dc);
    }
    if ((dc.type === 'drawArray' || dc.type === 'draw2DArray') && (section === 'all' || section === 'layout')) {
      content += buildArrayLayoutSection(dc);
    }
    if (dc.type === 'drawArrow' && (section === 'all' || section === 'style')) {
      content += buildArrowStyleSection(dc);
    }
    if (dc.type === 'drawCircle' && (section === 'all' || section === 'circle-style')) {
      content += buildCircleStyleSection(dc);
    }
    if ((dc.type === 'drawText' || dc.type === 'drawColoredText') && (section === 'all' || section === 'text-style')) {
      // 記錄原始文字以供回寫時進行精確的特徵對比，杜絕寫錯行！
      if (dc && !dc._originalText) {
        if (dc.type === 'drawText') {
          dc._originalText = String(dc.args[0]);
        } else if (dc.type === 'drawColoredText') {
          const segs = Array.isArray(dc.args[0]) ? dc.args[0] : (dc._textSegments || []);
          dc._originalText = segs.map(s => s.text).join('|');
        }
      }
      content += buildTextEditSection(dc);
    }
    if (dc.codeLine >= 0) {
      content += `<div class="prop-section"><div class="prop-code-link" id="prop-goto-code">📝 跳到程式碼 (行 ${dc.codeLine + 1})</div></div>`;
    }

    panel.innerHTML = content;
    positionPanel(panel);

    // 綁定關閉
    const closeBtn = panel.querySelector('#prop-close-btn');
    if (closeBtn) closeBtn.onclick = hidePropPanel;

    bindPropEvents(panel, dc);
  }

  function positionPanel(panel) {
    panel.style.display = 'block';
    // 放在畫面右側
    panel.style.right = '20px';
    panel.style.left = 'auto';
    panel.style.top = '80px';
  }

  function buildHeader(title) {
    return `<div class="prop-header"><span>${title}</span><span class="prop-close" id="prop-close-btn">✕</span></div>`;
  }

  // --- 位置區塊 (全自動分析位置調節區塊) ---
  function buildPosSection(dc) {
    let html = '';
    const actual = getActualParams(dc) || [];

    let posCount = 0;
    for (let i = 0; i < dc.args.length; i++) {
      const arg = dc.args[i];
      if (isPosObject(arg)) {
        posCount++;
        let paramName = `位置調整`;
        if (dc.type === 'drawArrow') {
          paramName = i === 0 ? '起點位置 (startSpec)' : '終點位置 (endSpec)';
        } else if (actual[i]) {
          const cleanArg = actual[i].trim();
          paramName = `位置參數 ${i + 1} (${cleanArg.split('(')[0]})`;
        } else {
          paramName = `位置參數 ${i + 1}`;
        }

        html += `<div class="prop-section">
          <div class="prop-section-title">${paramName}</div>
          ${buildSinglePosUI(arg, `pos-${i}`)}
        </div>`;
      }
    }

    return html;
  }

  function buildSinglePosUI(pos, prefix = 'pos') {
    if (!pos || typeof pos !== 'object') return propRow('原始值', `<span style="font-family:monospace;font-size:11px;">${pos}</span>`, true);

    let rows = '';
    const isRel = (pos.type === 'rel' || pos.ref);

    rows += `
      <div class="pos-mode-tabs">
        <div class="pos-mode-tab ${!isRel ? 'active' : ''}" data-action="set-abs" data-prefix="${prefix}">絕對位置</div>
        <div class="pos-mode-tab ${isRel ? 'active' : ''}" data-action="set-rel" data-prefix="${prefix}">相對位置</div>
      </div>
    `;

    if (isRel) {
      rows += propRow('參考點 ID', inputField(`${prefix}-ref`, pos.ref || ''));

      const isRaw = (pos.anchor || '').includes('raw');
      const cleanAnchor = (pos.anchor || '').replace('raw', '').trim() || 'center';

      rows += propRow('自動偏移', `
        <label class="gui-switch">
          <input type="checkbox" id="${prefix}-raw-toggle" ${isRaw ? 'checked' : ''}>
          <span class="gui-slider"></span>
        </label>
        <span style="font-size:10px;color:#9ca3af;margin-left:5px"> (raw 語法)</span>
      `, true);

      rows += propRow('對齊點', buildAnchorGrid(cleanAnchor, prefix), true);

      const refDC = findDrawCallByGroupID(pos.ref);
      if (refDC && refDC.type === 'draw2DArray') {
        rows += propRow('索引 X (Col)', inputField(`${prefix}-col`, (pos.col === undefined || pos.col === -1) ? '' : pos.col, 'text'));
        rows += propRow('索引 Y (Row)', inputField(`${prefix}-row`, (pos.row === undefined || pos.row === -1) ? '' : pos.row, 'text'));
      } else if (refDC && refDC.type === 'drawArray') {
        rows += propRow('格子索引', inputField(`${prefix}-index`, (pos.index === undefined || pos.index === -1) ? '' : pos.index, 'text'));
      } else if (pos.index !== undefined && pos.index !== -1) {
        rows += propRow('格子索引', inputField(`${prefix}-index`, pos.index, 'text'));
      }

      rows += propRow('橫向偏移 (dx)', inputField(`${prefix}-dx`, pos.dx || pos.x || 0, 'number'));
      rows += propRow('縱向偏移 (dy)', inputField(`${prefix}-dy`, pos.dy || pos.y || 0, 'number'));
    } else {
      rows += propRow('座標 X', inputField(`${prefix}-x`, pos.x || 0, 'number'));
      rows += propRow('座標 Y', inputField(`${prefix}-y`, pos.y || 0, 'number'));
    }
    return rows;
  }

  function buildAnchorGrid(activeAnchor, prefix = 'pos') {
    const anchors = [
      { key: 'top left', label: '左上' }, { key: 'top', label: '上' }, { key: 'top right', label: '右上' },
      { key: 'left', label: '左' }, { key: 'center', label: '中' }, { key: 'right', label: '右' },
      { key: 'bottom left', label: '左下' }, { key: 'bottom', label: '下' }, { key: 'bottom right', label: '右下' }
    ];
    let html = '<div class="anchor-grid">';
    anchors.forEach(a => {
      html += `<div class="anchor-btn ${activeAnchor === a.key ? 'active' : ''}" data-anchor="${a.key}" data-prefix="${prefix}" title="${a.label}"><div class="dot"></div></div>`;
    });
    html += '</div>';
    return html;
  }

  // --- 陣列樣式區塊 ---
  const AV_COLORS = [
    { name: 'AV_green', hex: 'rgba(165, 214, 167, 0.6)' },
    { name: 'AV_blue', hex: 'rgba(144, 202, 249, 0.6)' },
    { name: 'AV_red', hex: 'rgba(239, 154, 154, 0.6)' },
    { name: 'AV_yellow', hex: 'rgba(252, 255, 64, 0.46)' },
    { name: 'AV_orange', hex: 'orange' },
    { name: 'AV_node_green', hex: '#e8f5e9' },
    { name: 'AV_node_red', hex: '#ef9a9a' },
    { name: 'AV_grey', hex: '#cccccc' },
    { name: 'AV_node_grey', hex: '#cccccc' },
    { name: 'AV_black', hex: 'black' },
    { name: 'AV_white', hex: 'white' }
  ];

  function buildArrayStyleSection(dc) {
    const runtimeStyles = dc.args[3] || [];
    const actual = getActualParams(dc);
    const styleParamStr = (actual && actual[3] ? actual[3] : '').trim();
    const cppStyles = parseCppStyleLiteral(styleParamStr);

    const allArrayTypes = ['highlight', 'point', 'focus', 'mark', 'background'];
    const mergedStyles = [];
    allArrayTypes.forEach(t => {
      const existing = cppStyles.find(s => s.type === t) || runtimeStyles.find(s => (s.type || (Array.isArray(s) ? s[0] : '')) === t);
      if (existing) {
        mergedStyles.push({
          type: existing.type || (Array.isArray(existing) ? existing[0] : t),
          color: existing.color || '',
          elements: existing.elements || (Array.isArray(existing) ? existing.slice(2) : [])
        });
      } else {
        mergedStyles.push({ type: t, color: '', elements: [] });
      }
    });
    cppStyles.forEach(s => {
      if (!allArrayTypes.includes(s.type)) mergedStyles.push(s);
    });

    const typeBadgeColors = {
      highlight: '#ef4444', point: '#f59e0b', focus: '#3b82f6',
      mark: '#8b5cf6', background: '#10b981'
    };

    let items = '';
    mergedStyles.forEach((s, i) => {
      const sType = s.type;
      const sElements = s.elements;
      const badgeColor = typeBadgeColors[sType] || '#6b7280';

      let currentHex = '#d1d5db';
      const colorVal = s.color || '';
      const matchColor = AV_COLORS.find(c => colorVal.includes(c.name));
      if (matchColor) currentHex = matchColor.hex;
      else if (colorVal.startsWith('rgba') || colorVal.startsWith('#') || ['orange', 'black', 'white', 'red'].includes(colorVal)) currentHex = colorVal;

      const valText = sElements.join(', ');

      items += `<div class="cell-style-item array-style-item" style="display:flex; align-items:center; padding:6px 8px; border-bottom:1px solid #f3f4f6;" data-index="${i}" data-type="${sType}" data-color="${colorVal}">
        <div class="style-item-header" style="display:flex; align-items:center; gap:8px; width:85px; flex-shrink:0;">
          <span class="style-icon ${sType}"></span>
          <span style="color:${badgeColor}; font-weight:700; font-size:11px;">${sType}</span>
        </div>
        <div style="display:flex; align-items:center; gap:6px; flex:1;">
          <input class="prop-input" style="flex:1; font-family:monospace; font-size:11px; background:#fff; height:24px; text-align:left;" 
                 data-style-idx="${i}" data-field="cpp-elements"
                 value="${valText}" title="元素列表 (C++ 索引)">
          <div class="color-picker-btn" style="width:20px; height:20px; border-radius:50%; cursor:pointer; background:${currentHex}; border:1px solid #d1d5db; flex-shrink:0;" title="選取樣式顏色" data-idx="${i}"></div>
        </div>
      </div>`;
    });

    return `<div class="prop-section">
      <div class="prop-section-title">格子樣式參數</div>
      <div class="cell-style-list">${items || '<div style="color:#9ca3af;padding:8px">無樣式變數</div>'}</div>
    </div>`;
  }

  function parseArrowStyleLiteral(str) {
    if (!str || !str.startsWith('{')) return [];
    let content = str.trim();
    if (content.startsWith('{') && content.endsWith('}')) {
      content = content.substring(1, content.length - 1).trim();
    }
    const units = splitTopLevelArgs(content);
    return units.map(u => {
      u = u.trim();
      if (!u.startsWith('{')) return null;
      const inner = u.substring(1, u.length - 1).trim();
      const parts = splitTopLevelArgs(inner);
      if (parts.length < 2) return null;
      return {
        key: parts[0].replace(/"/g, '').trim(),
        value: parts[1].replace(/"/g, '').trim()
      };
    }).filter(x => x);
  }

  function buildArrowStyleSection(dc) {
    const ARROW_PROP_LABELS = {
      color: '顏色',
      width: '寬度',
      dash: '虛線比例',
      text: '標籤文字',
      text_color: '文字顏色',
      text_size: '文字大小',
      text_weight: '文字粗細',
      headStart: '起點樣式',
      headEnd: '終點樣式',
      marginStart: '起點間距',
      marginEnd: '終點間距',
      key: '參考 ID'
    };
    const actual = getActualParams(dc);
    const styleParamStr = (actual && actual.length > 2 ? actual[2] : '').trim();
    const cppStyles = parseArrowStyleLiteral(styleParamStr);

    // 指定排序：color -> width -> text -> 文字相關屬性 -> 其他
    const priorityKeys = ['color', 'width', 'text', 'text_color', 'text_size', 'text_weight'];
    const otherKeys = ['dash', 'headStart', 'headEnd', 'marginStart', 'marginEnd', 'key'];
    const allArrowKeys = [...priorityKeys, ...otherKeys];

    const mergedStyles = [];
    allArrowKeys.forEach(k => {
      const existing = cppStyles.find(s => s.key === k);
      if (existing) mergedStyles.push(existing);
      else mergedStyles.push({ key: k, value: '' });
    });
    cppStyles.forEach(s => {
      if (!allArrowKeys.includes(s.key)) mergedStyles.push(s);
    });

    const textValue = mergedStyles.find(s => s.key === 'text')?.value || '';
    const hasText = textValue.trim().length > 0;
    const textRelatedKeys = ['text_color', 'text_size', 'text_weight'];

    let items = '';
    mergedStyles.forEach((s, i) => {
      let currentHex = '#d1d5db';
      if (s.key === 'color') {
        const matchColor = AV_COLORS.find(c => s.value.includes(c.name));
        if (matchColor) currentHex = matchColor.hex;
        else if (s.value.startsWith('rgba') || s.value.startsWith('#') || ['orange', 'black', 'white', 'red'].includes(s.value)) currentHex = s.value;
      }

      const isTextRelated = textRelatedKeys.includes(s.key);

      let displayStyle = 'display:flex;';
      let extraClass = '';

      if (isTextRelated) {
        extraClass = 'text-related-item';
        if (!hasText) displayStyle = 'display:none;';
      }

      let inputUI = '';
      if (s.key === 'dash') {
        const parts = (s.value || '').split(',').map(p => p.trim());
        const dashSolid = parts[0] || '';
        const dashGap = parts[1] || '';
        inputUI = `
          <div style="display:flex; align-items:center; justify-content:center; gap:8px; flex:1;">
            <input class="prop-input dash-part dash-solid" style="width:40px; flex:none; font-family:monospace; font-size:11px; background:#fff; height:24px; text-align:center;" 
                   value="${dashSolid}" placeholder="實" title="實線長度">
            <span style="font-size:10px; color:#9ca3af;">:</span>
            <input class="prop-input dash-part dash-gap" style="width:40px; flex:none; font-family:monospace; font-size:11px; background:#fff; height:24px; text-align:center;" 
                   value="${dashGap}" placeholder="虛" title="間隔長度">
          </div>
        `;
      } else if (s.key === 'headStart' || s.key === 'headEnd') {
        const options = [
          { val: 'none', lab: '無' },
          { val: 'arrow', lab: '箭頭' },
          { val: 'dot', lab: '圓點' }
        ];
        inputUI = `<select class="prop-input" style="flex:1; font-size:11px; height:24px;" data-arrow-style-idx="${i}" data-field="cpp-arrow-val">
          ${options.map(opt => `<option value="${opt.val}" ${s.value === opt.val ? 'selected' : ''}>${opt.lab}</option>`).join('')}
        </select>`;
      } else if (s.key === 'color') {
        inputUI = `<input class="prop-input" style="width:120px; flex:none; font-family:monospace; font-size:11px; background:#fff; height:24px; text-align:left;" 
                   data-arrow-style-idx="${i}" data-field="cpp-arrow-val"
                   value="${s.value}" title="值">`;
      } else {
        inputUI = `<input class="prop-input" style="flex:1; font-family:monospace; font-size:11px; background:#fff; height:24px; text-align:left;" 
                   data-arrow-style-idx="${i}" data-field="cpp-arrow-val"
                   value="${s.value}" title="值">`;
      }

      items += `<div class="cell-style-item arrow-style-item ${extraClass}" style="${displayStyle} align-items:center; padding:6px 8px; border-bottom:1px solid #f3f4f6;" data-index="${i}" data-key="${s.key}">
        <div class="style-item-header" style="display:flex; align-items:center; gap:8px; width:85px; flex-shrink:0;">
          <span style="color:#4b5563; font-weight:700; font-size:11px;">${ARROW_PROP_LABELS[s.key] || s.key}</span>
        </div>
        <div style="display:flex; align-items:center; gap:6px; flex:1; padding-right:16px;">
          ${inputUI}
          ${(s.key === 'color') ? `<div class="color-picker-btn arrow-color-picker-btn" style="width:20px; height:20px; border-radius:50%; cursor:pointer; background:${currentHex}; border:1px solid #d1d5db; flex-shrink:0; margin-right:8px;" title="選取顏色" data-idx="${i}"></div>` : ''}
        </div>
      </div>`;
    });

    return `<div class="prop-section">
      <div class="prop-section-title">箭頭樣式參數</div>
      <div class="cell-style-list">${items || '<div style="color:#9ca3af;padding:8px">無樣式變數</div>'}</div>
    </div>`;
  }

  /**
   * 解析 C++ 樣式字面量: {{{"type"}, {v1, v2}}, {{"type2"}, {v3}}}
   * 回傳 [{type: "type", elements: ["v1", "v2"]}, ...]
   */
  function parseCppStyleLiteral(str) {
    if (!str || !str.startsWith('{')) return [];
    // 移除最外層大括號
    let content = str.trim();
    if (content.startsWith('{') && content.endsWith('}')) {
      content = content.substring(1, content.length - 1).trim();
    }

    // 拆分內部的 array_style 單元: {{"type", "color"}, {v1, v2}}
    const units = splitTopLevelArgs(content);
    return units.map(u => {
      u = u.trim();
      if (!u.startsWith('{')) return null;
      const inner = u.substring(1, u.length - 1).trim();
      const parts = splitTopLevelArgs(inner); // [ {"type","color"}, {v1,v2} ]
      if (parts.length < 2) return null;

      // 解析類型清單: {"highlight", "AV_red"}
      const typeListStr = parts[0].trim();
      let typeParts = [];
      if (typeListStr.startsWith('{')) {
        const tContent = typeListStr.substring(1, typeListStr.length - 1).trim();
        typeParts = splitTopLevelArgs(tContent).map(p => p.replace(/"/g, '').trim());
      } else {
        typeParts = [typeListStr.replace(/"/g, '').trim()];
      }

      const sType = typeParts[0];
      const sColor = typeParts[1] || '';

      const elementsStr = parts[1].trim();
      let elements = [];
      if (elementsStr.startsWith('{')) {
        const eContent = elementsStr.substring(1, elementsStr.length - 1).trim();
        elements = splitTopLevelArgs(eContent).map(e => e.trim());
      } else {
        elements = [elementsStr];
      }

      // 自動遷移邏輯：如果 elements 裡面藏了顏色常量，把它移到 color 欄位
      let foundColorInElements = '';
      elements = elements.filter(e => {
        if (e.includes('AV_')) {
          foundColorInElements = e;
          return false;
        }
        return true;
      });
      if (foundColorInElements && !sColor) {
        sColor = foundColorInElements;
      }

      return { type: sType, color: sColor, elements: elements };
    }).filter(x => x);
  }

  // --- 陣列繪製參數區塊 ---
  // --- 陣列佈局/參數區塊 ---
  function buildArrayLayoutSection(dc) {
    const drawType = dc.args[5] || 'normal';
    let itemsPerRow = 0, indexMode = 0, gap = 0;

    if (dc.type === 'draw2DArray') {
      indexMode = dc.args[6] || 0;
    } else {
      itemsPerRow = dc.args[6] || 0;
      indexMode = dc.args[7] || 0;
      gap = dc.args[8] || 0;
    }

    // 從 C++ 獲取實際參數字串 (包含變數名)
    const actual = getActualParams(dc);
    const dataVar = (actual && actual.length > 2 ? actual[2] : '').trim() || '(無法抓取)';
    const rangeStr = (actual && actual.length > 4 ? actual[4] : '').trim() || '{0}';

    let rangeHtml = '';

    if (dc.type === 'draw2DArray') {
      const matrix = dc.args[2] || [];
      const rowsCount = matrix.length;
      const colsCount = matrix.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0);
      const maxRow = rowsCount > 0 ? rowsCount - 1 : 0;
      const maxCol = colsCount > 0 ? colsCount - 1 : 0;

      let L_row = 0, L_col = 0, R_row = maxRow, R_col = maxCol;

      const match2 = rangeStr.match(/\{\s*\{\s*(\d+)\s*,\s*(\d+)\s*\}\s*,\s*\{\s*(\d+)\s*,\s*(\d+)\s*\}\s*\}/);
      if (match2) {
        L_col = isNaN(parseInt(match2[1])) ? 0 : parseInt(match2[1]);
        L_row = isNaN(parseInt(match2[2])) ? 0 : parseInt(match2[2]);
        R_col = isNaN(parseInt(match2[3])) ? maxCol : parseInt(match2[3]);
        R_row = isNaN(parseInt(match2[4])) ? maxRow : parseInt(match2[4]);
      } else {
        const match1 = rangeStr.match(/\{\s*\{\s*(\d+)\s*,\s*(\d+)\s*\}\s*\}/);
        if (match1) {
          L_col = isNaN(parseInt(match1[1])) ? 0 : parseInt(match1[1]);
          L_row = isNaN(parseInt(match1[2])) ? 0 : parseInt(match1[2]);
        }
      }

      rangeHtml = `
        <div class="dual-slider-container">
          <div style="font-size:10px; color:#6b7280; width:15px; flex-shrink:0;">X</div>
          <input type="text" class="prop-input dual-slider-input" id="range-L-x" value="${L_col}">
          <div class="slider-wrapper">
            <div class="slider-track"></div>
            <div class="slider-range-fill" id="range-fill-x"></div>
            <input type="range" class="dual-slider-range" id="slider-L-x" min="0" max="${maxCol}" value="${L_col}">
            <input type="range" class="dual-slider-range" id="slider-R-x" min="0" max="${maxCol}" value="${R_col}">
          </div>
          <input type="text" class="prop-input dual-slider-input" id="range-R-x" value="${R_col === maxCol ? '' : R_col}" placeholder="End">
        </div>
        <div class="dual-slider-container" style="margin-top:6px;">
          <div style="font-size:10px; color:#6b7280; width:15px; flex-shrink:0;">Y</div>
          <input type="text" class="prop-input dual-slider-input" id="range-L-y" value="${L_row}">
          <div class="slider-wrapper">
            <div class="slider-track"></div>
            <div class="slider-range-fill" id="range-fill-y"></div>
            <input type="range" class="dual-slider-range" id="slider-L-y" min="0" max="${maxRow}" value="${L_row}">
            <input type="range" class="dual-slider-range" id="slider-R-y" min="0" max="${maxRow}" value="${R_row}">
          </div>
          <input type="text" class="prop-input dual-slider-input" id="range-R-y" value="${R_row === maxRow ? '' : R_row}" placeholder="End">
        </div>
      `;
    } else {
      let L = 0, R = (dc.args[2] ? dc.args[2].length - 1 : 0);
      const maxIdx = R;

      const listMatch = rangeStr.match(/\{([^}]+)\}/);
      if (listMatch) {
        const parts = listMatch[1].split(',').map(s => s.trim());
        L = isNaN(parseInt(parts[0])) ? 0 : parseInt(parts[0]);
        if (parts.length > 1) {
          R = isNaN(parseInt(parts[1])) ? maxIdx : parseInt(parts[1]);
        } else {
          R = maxIdx;
        }
      }

      rangeHtml = `
        <div class="dual-slider-container">
          <input type="text" class="prop-input dual-slider-input" id="range-L" value="${L}">
          <div class="slider-wrapper">
            <div class="slider-track"></div>
            <div class="slider-range-fill" id="range-fill"></div>
            <input type="range" class="dual-slider-range" id="slider-L" min="0" max="${maxIdx}" value="${L}">
            <input type="range" class="dual-slider-range" id="slider-R" min="0" max="${maxIdx}" value="${R}">
          </div>
          <input type="text" class="prop-input dual-slider-input" id="range-R" value="${R === maxIdx ? '' : R}" placeholder="End">
        </div>
      `;
    }

    let drawTypeOptions = '';
    if (dc.type === 'draw2DArray') {
      drawTypeOptions = ['normal', 'clear', 'binary']
        .map(t => `<option value="${t}" ${t === drawType ? 'selected' : ''}>${t}</option>`).join('');
    } else {
      drawTypeOptions = ['normal', 'heap', 'segment_tree', 'BIT', 'disk', 'stack', 'queue']
        .map(t => `<option value="${t}" ${t === drawType ? 'selected' : ''}>${t}</option>`).join('');
    }

    let indexOptions = '';
    if (dc.type === 'draw2DArray') {
      indexOptions = [
        { v: 0, t: '0 (無索引)' },
        { v: 1, t: '1 (左方索引)' },
        { v: 2, t: '2 (上方索引)' },
        { v: 3, t: '3 (左上方索引)' }
      ].map(o => `<option value="${o.v}" ${Number(indexMode) === o.v ? 'selected' : ''}>${o.t}</option>`).join('');
    } else {
      indexOptions = [
        { v: 0, t: '0 (不顯示索引)' },
        { v: 1, t: '1 (顯示索引)' },
        { v: 2, t: '2 (只顯示索引)' },
        { v: 3, t: '3 (顯示二進位索引)' },
        { v: 4, t: '4 (顯示前導零二進位索引)' }
      ].map(o => `<option value="${o.v}" ${Number(indexMode) === o.v ? 'selected' : ''}>${o.t}</option>`).join('');
    }

    let rows = '';
    rows += propRow('資料變數', inputField('prop-data-var', dataVar, 'text', true));

    if (dc.type === 'draw2DArray') {
      const parts = rangeHtml.split('<div class="dual-slider-container" style="margin-top:6px;">');
      if (parts.length > 1) {
        rows += propRow('顯示範圍 (X)', parts[0], true);
        rows += propRow('顯示範圍 (Y)', '<div class="dual-slider-container">' + parts[1], true);
      } else {
        rows += propRow('顯示範圍', rangeHtml, true);
      }
    } else {
      rows += propRow('顯示範圍', rangeHtml, true);
    }
    rows += propRow('繪圖模式', `<select class="prop-input" id="prop-drawtype">${drawTypeOptions}</select>`, true);

    if (dc.type !== 'draw2DArray') {
      rows += propRow('每行格子數量', inputField('prop-ipr', itemsPerRow, 'number'));
    }

    rows += propRow('顯示索引', `<select class="prop-input" id="prop-index">${indexOptions}</select>`, true);

    if (dc.type !== 'draw2DArray') {
      rows += propRow('格子間距', inputField('prop-gap', gap, 'number'));
    }

    return `<div class="prop-section"><div class="prop-section-title">陣列參數</div>${rows}</div>`;
  }

  function getActualParams(dc) {
    const editor = getEditor();
    if (!editor || dc.codeLine < 0) return null;
    const session = editor.getSession();

    let groupID = dc.groupID || '';
    if (!groupID && dc.args && typeof dc.args[0] === 'string' && dc.type !== 'drawArrow') {
      groupID = dc.args[0];
    }

    const searchCenter = dc.codeLine - 1;
    let lineText = '';
    let lineIdx = -1;

    const fnRegex = /((?:key_)?(?:frame_draw|draw_2Darray|arrow|draw_array|draw_circle|draw_triangle))\s*\(/;

    // 優先搜尋：含有關鍵字且含有 ID
    for (let offset of [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5]) {
      const idx = searchCenter + offset;
      if (idx < 0) continue;
      const t = session.getLine(idx);
      if (t && fnRegex.test(t)) {
        if (groupID === '' || t.includes('"' + groupID + '"') || t.includes(groupID)) {
          lineText = t;
          lineIdx = idx;
          break;
        }
      }
    }

    // 次優先：只要有關鍵字即可 (可能是 ID 被變數化了，或箭頭無 ID)
    if (!lineText) {
      for (let offset of [0, -1, 1, -2, 2]) {
        const idx = searchCenter + offset;
        if (idx < 0) continue;
        const t = session.getLine(idx);
        if (t && fnRegex.test(t)) {
          lineText = t;
          lineIdx = idx;
          break;
        }
      }
    }

    if (!lineText) return null;

    const drawMatch = lineText.match(fnRegex);
    if (!drawMatch) return null;

    const fnName = drawMatch[1];
    const fnStart = lineText.indexOf(fnName + '(');
    if (fnStart === -1) return null;

    const argsStr = extractFnArgs(lineText, fnStart + fnName.length);
    if (!argsStr) return null;

    return splitTopLevelArgs(argsStr);
  }

  // --- 圓形樣式區塊 ---
  function buildCircleStyleSection(dc) {
    const style = dc.args[3] || [];
    let bg = '#ffffff', fc = '#000', fs = 14, r = 25;
    style.forEach(s => {
      if (s.type === 'background') bg = s.color || bg;
      if (s.type === 'font_color') fc = s.color || fc;
      if (s.type === 'font_size') fs = parseFloat(s.color) || fs;
      if (s.type === 'radius') r = parseFloat(s.color) || r;
    });

    // 從 C++ 獲取實際參數字串 (包含變數名)
    const actual = getActualParams(dc);
    const styleVar = (actual && actual[3] ? actual[3] : '').trim() || '(無法抓取)';

    let rows = '';
    rows += propRow('樣式變數', inputField('prop-circle-style-var', styleVar));
    rows += propRow('背景色', colorField('circle-bg', bg));
    rows += propRow('字體色', colorField('circle-fc', fc));
    rows += propRow('字體大小', inputField('circle-fs', fs, 'number'));
    rows += propRow('半徑', inputField('circle-r', r, 'number'));
    return `<div class="prop-section"><div class="prop-section-title">🎨 圓形樣式</div>${rows}</div>`;
  }

  // --- 文字編輯區塊 ---
  function buildTextEditSection(dc) {
    let segments = [];

    if (dc.type === 'drawText') {
      if (!dc._textSegments) {
        dc._textSegments = [{
          text: dc.args[0] || '',
          font_size: dc.args[2] || 14,
          font_color: dc.args[3] || '#111827',
          bg_color: dc.args[4] || '#ffffff'
        }];
      }
      segments = dc._textSegments;
    } else {
      segments = dc.args[0] || [];
    }

    let html = `
      <div class="prop-section">
        <div class="prop-section-title" style="display:flex; justify-content:space-between; align-items:center; width:100%">
          <span>📝 文字段落編輯</span>
          ${dc.type === 'drawColoredText' ? `<button class="add-segment-btn" id="prop-add-seg" style="font-size:10px; padding:2px 8px; border-radius:4px; background:#10b981; color:#fff; border:none; cursor:pointer;">+ 新增段落</button>` : ''}
        </div>
        <div class="text-segments-list" style="display:flex; flex-direction:column; gap:12px; margin-top:8px;">
    `;

    segments.forEach((seg, i) => {
      let currentFontColorHex = seg.font_color || '#111827';
      let currentBgColorHex = seg.bg_color || '#ffffff';

      const matchFc = AV_COLORS.find(c => currentFontColorHex.includes(c.name));
      if (matchFc) currentFontColorHex = matchFc.hex;
      const matchBg = AV_COLORS.find(c => currentBgColorHex.includes(c.name));
      if (matchBg) currentBgColorHex = matchBg.hex;

      html += `
        <div class="segment-card" data-idx="${i}" style="border:1px solid #e5e7eb; border-radius:8px; padding:10px; background:#f9fafb; position:relative;">
          ${dc.type === 'drawColoredText' && segments.length > 1 ? `<span class="delete-segment-btn" data-idx="${i}" style="position:absolute; right:8px; top:4px; font-size:12px; color:#ef4444; cursor:pointer;" title="刪除此段">✕</span>` : ''}
          
          <div class="prop-row" style="margin-bottom:6px;">
            <span class="prop-label" style="width:50px;">段落 ${i + 1}</span>
            <textarea class="prop-input seg-text-input" data-idx="${i}" style="flex:1; height:45px; resize:vertical; font-family:inherit; font-size:12px; padding:4px;" placeholder="請輸入文字">${seg.text || ''}</textarea>
          </div>
          
          <div style="display:flex; gap:10px; align-items:center; margin-top:6px;">
            <div style="display:flex; flex-direction:column; flex:1;">
              <span style="font-size:10px; color:#6b7280; margin-bottom:2px;">大小</span>
              <input type="number" class="prop-input seg-size-input" data-idx="${i}" value="${seg.font_size || 14}" style="width:100%; height:24px; font-size:11px;">
            </div>
            
            <div style="display:flex; flex-direction:column; align-items:center; width:45px;">
              <span style="font-size:10px; color:#6b7280; margin-bottom:2px;">文字色</span>
              <div class="color-picker-btn seg-color-btn" data-idx="${i}" data-type="fc" style="width:20px; height:20px; border-radius:50%; cursor:pointer; background:${currentFontColorHex}; border:1px solid #d1d5db;" title="${seg.font_color || '點擊選取字體顏色'}"></div>
            </div>
            
            <div style="display:flex; flex-direction:column; align-items:center; width:45px;">
              <span style="font-size:10px; color:#6b7280; margin-bottom:2px;">背景色</span>
              <div class="color-picker-btn seg-color-btn" data-idx="${i}" data-type="bg" style="width:20px; height:20px; border-radius:50%; cursor:pointer; background:${currentBgColorHex}; border:1px solid #d1d5db;" title="${seg.bg_color || '點擊選取背景顏色'}"></div>
            </div>
          </div>
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;

    return html;
  }

  function getRgbaOrHex(colorVal) {
    if (!colorVal) return '';
    return resolveColorHex(colorVal) || colorVal;
  }

  // 從原始 C++ 行中解析出每個 segment 的各欄位原始表達式
  // 判斷一個字串是否是 C++ 中的變數名稱（如 _draw_up_color 或 AV_blue，而非寫死的字串或空值）
  function isCppVar(expr) {
    if (!expr) return false;
    const trimmed = expr.trim();
    if (trimmed === '""' || trimmed === "''" || trimmed === "") return false;
    // 如果不是以單/雙引號開頭，也不是數字，那就極可能是變數
    return !trimmed.startsWith('"') && !trimmed.startsWith("'") && isNaN(trimmed);
  }

  // 從原始 C++ 行中解析出每個 segment 的各欄位原始表達式
  // 例如 {{"上層",_draw_up_color},{" 比 "}} → [{text:'"上層"', bg:'_draw_up_color', fc:'', fs:'', fieldCount: 2}, ...]
  function parseOriginalCppSegments(cppArg0) {
    if (!cppArg0) return [];
    const trimmed = cppArg0.trim();
    // 最外層是 { ... }，裡面是逐個 { ... } 的 segment
    if (!trimmed.startsWith('{')) return [];
    // 去掉最外層的 { }
    const inner = trimmed.slice(1, -1).trim();
    // 用 splitTopLevelArgs 拆出每個 segment（每個 segment 自身也是 {...}）
    const segStrs = splitTopLevelArgs(inner);
    const result = [];
    for (const segStr of segStrs) {
      const s = segStr.trim();
      if (!s.startsWith('{') || !s.endsWith('}')) continue;
      // 去掉這個 segment 的 { }
      const segInner = s.slice(1, -1);
      const fields = splitTopLevelArgs(segInner);
      // fields[0]=text, fields[1]=bg_color, fields[2]=font_color, fields[3]=font_size
      result.push({
        text: (fields[0] || '').trim(),
        bg:   (fields[1] || '').trim(),
        fc:   (fields[2] || '').trim(),
        fs:   (fields[3] || '').trim(),
        fieldCount: fields.length
      });
    }
    return result;
  }

  // 智慧合併：只替換每個 segment 的文字欄位，並百分之百保留 C++ 中的顏色/字體變數，絕不將變數覆蓋
  function mergeTextVarPreservingVars(newTextVar, originalArg0) {
    if (!originalArg0) return newTextVar;
    const origTrimmed = originalArg0.trim();
    if (!origTrimmed.startsWith('{')) return newTextVar;

    const origSegs = parseOriginalCppSegments(origTrimmed);
    if (origSegs.length === 0) return newTextVar;

    const newTrimmed = newTextVar.trim();
    if (!newTrimmed.startsWith('{')) return newTextVar;
    const newSegs = parseOriginalCppSegments(newTrimmed);
    if (newSegs.length === 0) return newTextVar;

    // 逐個 segment 合併，即使長度有些微不同也能安全按順序對應
    const mergedArr = newSegs.map((newSeg, idx) => {
      const orig = origSegs[idx];
      const textExpr = newSeg.text;

      if (orig) {
        // 如果原始段落存在：優先保留原始中的變數，沒有變數才用新的
        const bgExpr = isCppVar(orig.bg) ? orig.bg : (orig.bg || newSeg.bg);
        const fcExpr = isCppVar(orig.fc) ? orig.fc : (orig.fc || newSeg.fc);
        const fsExpr = isCppVar(orig.fs) ? orig.fs : (orig.fs || newSeg.fs);

        // 重點：精確保留原始 C++ 段落的欄位個數，絕不平白增加多餘的空欄位！
        const fieldCount = orig.fieldCount || 4;
        const parts = [textExpr];
        if (fieldCount >= 2) parts.push(bgExpr || '""');
        if (fieldCount >= 3) parts.push(fcExpr || '""');
        if (fieldCount >= 4) parts.push(fsExpr || '""');

        return `{${parts.join(', ')}}`;
      } else {
        // 新增的段落：使用全部 4 個欄位
        return `{${textExpr}, ${newSeg.bg || '""'}, ${newSeg.fc || '""'}, ${newSeg.fs || '""' }}`;
      }
    });

    return `{${mergedArr.join(', ')}}`;
  }

  // 負責寫回 C++ 的函式
  function syncTextToCpp(dc) {
    if (dc.type === 'drawText' || dc.type === 'drawColoredText') {
      let convert = false;
      let textVar = '';

      // 智能融合 Segments 讀取來源
      let segs = [];
      if (dc.type === 'drawColoredText') {
        segs = Array.isArray(dc.args[0]) ? dc.args[0] : (dc._textSegments || []);
      } else {
        segs = dc._textSegments || [];
        if (segs.length === 0 && dc.args[0] !== undefined) {
          segs = [{
            text: String(dc.args[0]),
            font_size: dc.args[2] || 14,
            font_color: dc.args[3] || '#111827',
            bg_color: dc.args[4] || '#ffffff'
          }];
        }
      }

      if (segs.length > 0) {
        // 檢查是否只需純文字 (單一段落、無顏色、預設大小，且原始 dc.type 是 drawText 才能使用單一字串！)
        if (dc.type === 'drawText' &&
            segs.length === 1 && 
            (!segs[0].font_color || segs[0].font_color === '#111827' || segs[0].font_color === 'black') && 
            (!segs[0].bg_color || segs[0].bg_color === '#ffffff' || segs[0].bg_color === 'white') && 
            (!segs[0].font_size || segs[0].font_size === 14)) {
          let txt = segs[0].text;
          txt = txt.replace(/\n/g, '\\n').replace(/"/g, '\\"');
          textVar = `"${txt}"`;
        } else {
          convert = true;
          const arr = segs.map(s => {
            let bg = s.bg_color || '';
            let fg = s.font_color || '';
            if (bg === '#ffffff' || bg === 'white' || bg === 'transparent') bg = '';
            if (fg === '#111827' || fg === 'black') fg = '';
            
            let fs = s.font_size || 14;
            let txt = s.text.replace(/\n/g, '\\n').replace(/"/g, '\\"');
            
            return `{"${txt}", ${formatCppColor(bg)}, ${formatCppColor(fg)}, "${fs}"}`;
          });
          textVar = `{${arr.join(', ')}}`;
        }
      } else {
        const rawTxt = (typeof dc.args[0] === 'string' ? dc.args[0] : '').replace(/\n/g, '\\n').replace(/"/g, '\\"');
        textVar = `"${rawTxt}"`;
      }
      
      // 注意：變數保留邏輯已移至 syncLayoutToCpp 中的 mergeTextVarPreservingVars
      syncLayoutToCpp(dc, { textVar: textVar, convertToColored: convert });
    }
  }

  // --- 小工具 ---
  function propRow(label, valueHtml, isRaw) {
    return `<div class="prop-row"><span class="prop-label">${label}</span>${isRaw ? valueHtml : valueHtml}</div>`;
  }
  function inputField(id, value, type, isRequired) {
    type = type || 'text';
    const reqClass = (isRequired && (!value || value === '(無法抓取)')) ? 'required-empty' : '';
    return `<input class="prop-input ${reqClass}" id="${id}" type="${type}" value="${value}" 
            ${type === 'number' ? 'step="1"' : ''} ${isRequired ? 'placeholder="必填"' : ''}>`;
  }
  function colorField(id, value) {
    return `<span class="prop-color-swatch" style="background:${value}"></span>` +
      `<input class="prop-input" id="${id}" type="text" value="${value}" style="flex:1">`;
  }

  // --- 綁定事件 ---
  function bindPropEvents(panel, dc) {
    const section = _currentPropSection;
    function bindSinglePosEvents(prefix, posArg, argIdx) {
      if (!posArg || typeof posArg !== 'object') return;

      const triggerSync = () => {
        replayCurrentFrame();
        // 統一使用高度自動化的 syncPosToCpp
        syncPosToCpp(dc, argIdx);
      };

      // 模式切換 (Tabs)
      panel.querySelectorAll(`.pos-mode-tab[data-prefix="${prefix}"]`).forEach(tab => {
        tab.onclick = (e) => {
          e.stopPropagation();
          const action = tab.dataset.action;
          if (action === 'set-abs') {
            posArg.type = 'abs';
            delete posArg.ref;
            delete posArg.anchor;
            delete posArg.dx;
            delete posArg.dy;
            posArg.x = posArg.x || 0;
            posArg.y = posArg.y || 0;
          } else {
            posArg.type = 'rel';
            posArg.ref = posArg.ref || '';
            posArg.anchor = posArg.anchor || 'center';
            posArg.dx = 0;
            posArg.dy = 0;
          }
          showPropPanel(section);
          triggerSync();
        };
      });

      const inpX = panel.querySelector(`#${prefix}-x`);
      const inpY = panel.querySelector(`#${prefix}-y`);
      if (inpX) inpX.onchange = () => { posArg.x = parseFloat(inpX.value) || 0; triggerSync(); validateRequiredFields(panel); };
      if (inpY) inpY.onchange = () => { posArg.y = parseFloat(inpY.value) || 0; triggerSync(); validateRequiredFields(panel); };

      const inpRef = panel.querySelector(`#${prefix}-ref`);
      if (inpRef) inpRef.onchange = () => {
        posArg.ref = inpRef.value;
        triggerSync();
        validateRequiredFields(panel);
        showPropPanel(section);
      };

      const inpIdx = panel.querySelector(`#${prefix}-index`);
      if (inpIdx) inpIdx.onchange = () => {
        const v = inpIdx.value.trim();
        posArg.index = v === '' ? -1 : (parseInt(v) || 0);
        triggerSync();
        validateRequiredFields(panel);
      };

      const inpRow = panel.querySelector(`#${prefix}-row`);
      const inpCol = panel.querySelector(`#${prefix}-col`);
      if (inpRow) inpRow.onchange = () => {
        const v = inpRow.value.trim();
        posArg.row = v === '' ? -1 : (parseInt(v) || 0);
        triggerSync();
        validateRequiredFields(panel);
      };
      if (inpCol) inpCol.onchange = () => {
        const v = inpCol.value.trim();
        posArg.col = v === '' ? -1 : (parseInt(v) || 0);
        triggerSync();
        validateRequiredFields(panel);
      };

      const inpDX = panel.querySelector(`#${prefix}-dx`);
      const inpDY = panel.querySelector(`#${prefix}-dy`);
      if (inpDX) inpDX.onchange = () => { posArg.dx = parseFloat(inpDX.value) || 0; triggerSync(); validateRequiredFields(panel); };
      if (inpDY) inpDY.onchange = () => { posArg.dy = parseFloat(inpDY.value) || 0; triggerSync(); validateRequiredFields(panel); };

      const rawToggle = panel.querySelector(`#${prefix}-raw-toggle`);
      if (rawToggle) rawToggle.onchange = () => {
        let clean = (posArg.anchor || '').replace('raw', '').trim();
        posArg.anchor = rawToggle.checked ? (clean + ' raw') : clean;
        triggerSync();
      };

      panel.querySelectorAll(`.anchor-btn[data-prefix="${prefix}"]`).forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const isRaw = (posArg.anchor || '').includes('raw');
          posArg.anchor = btn.dataset.anchor + (isRaw ? ' raw' : '');
          showPropPanel(section);
          triggerSync();
        };
      });
    }

    // 自動化事件綁定：只要偵測到是 Pos 物件的參數，就動態綁定事件
    for (let i = 0; i < dc.args.length; i++) {
      const arg = dc.args[i];
      if (isPosObject(arg)) {
        bindSinglePosEvents(`pos-${i}`, arg, i);
      }
    }

    // 繪製參數修改
    ['prop-drawtype', 'prop-ipr', 'prop-index', 'prop-gap', 'prop-data-var', 'prop-style-var', 'prop-circle-style-var'].forEach(id => {
      const el = panel.querySelector('#' + id);
      if (!el) return;
      el.addEventListener('change', () => {
        if (id === 'prop-circle-style-var') applyCircleStyleChange(dc, panel);
        else applyLayoutChange(dc, panel);
        validateRequiredFields(panel);
      });
    });

    // 綁定文字編輯與樣式事件
    if (dc.type === 'drawText' || dc.type === 'drawColoredText') {
      panel.querySelectorAll('.seg-text-input').forEach(textarea => {
        textarea.addEventListener('change', () => {
          const idx = parseInt(textarea.dataset.idx);
          const segments = dc.type === 'drawText' ? dc._textSegments : dc.args[0];
          if (segments && segments[idx]) {
            segments[idx].text = textarea.value;
            if (dc.type === 'drawText') {
              dc.args[0] = textarea.value;
            }
            replayCurrentFrame();
            syncTextToCpp(dc);
          }
        });
      });

      panel.querySelectorAll('.seg-size-input').forEach(input => {
        input.addEventListener('change', () => {
          const idx = parseInt(input.dataset.idx);
          const segments = dc.type === 'drawText' ? dc._textSegments : dc.args[0];
          if (segments && segments[idx]) {
            segments[idx].font_size = parseInt(input.value) || 14;
            replayCurrentFrame();
            syncTextToCpp(dc);
          }
        });
      });

      panel.querySelectorAll('.seg-color-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const idx = parseInt(btn.dataset.idx);
          const type = btn.dataset.type;
          const segments = dc.type === 'drawText' ? dc._textSegments : dc.args[0];

          openColorPalette(e, btn, (colorName, hex, isFinal) => {
            btn.style.background = hex;
            if (segments && segments[idx]) {
              if (type === 'fc') segments[idx].font_color = colorName;
              else segments[idx].bg_color = colorName;
            }
            replayCurrentFrame();
            if (isFinal) {
              syncTextToCpp(dc);
              showToast(`文字樣式顏色已更新`, 'success');
            }
          });
        });
      });

      const addBtn = panel.querySelector('#prop-add-seg');
      if (addBtn) {
        addBtn.onclick = () => {
          const segments = dc.args[0] || [];
          segments.push({
            text: '新段落',
            font_size: 14,
            font_color: '#111827',
            bg_color: '#ffffff'
          });
          dc.args[0] = segments;
          showPropPanel(section);
          replayCurrentFrame();
          syncTextToCpp(dc);
        };
      }

      panel.querySelectorAll('.delete-segment-btn').forEach(delBtn => {
        delBtn.onclick = () => {
          const idx = parseInt(delBtn.dataset.idx);
          const segments = dc.args[0] || [];
          if (segments.length > 1) {
            segments.splice(idx, 1);
            dc.args[0] = segments;
            showPropPanel(section);
            replayCurrentFrame();
            syncTextToCpp(dc);
          }
        };
      });
    }

    // 範圍滑條事件
    function bindDualSlider(axis) {
      const postfix = axis ? `-${axis}` : '';
      const sL = panel.querySelector(`#slider-L${postfix}`);
      const sR = panel.querySelector(`#slider-R${postfix}`);
      const iL = panel.querySelector(`#range-L${postfix}`);
      const iR = panel.querySelector(`#range-R${postfix}`);
      const fill = panel.querySelector(`#range-fill${postfix}`);

      if (!sL || !sR) return;

      const updateUI = () => {
        const valL = parseInt(sL.value);
        const valR = parseInt(sR.value);
        const max = parseInt(sR.max);

        iL.value = valL;
        iR.value = (valR === max) ? '' : valR;

        const pL = max === 0 ? 0 : (valL / max) * 100;
        const pR = max === 0 ? 100 : (valR / max) * 100;
        if (fill) {
          fill.style.left = pL + '%';
          fill.style.width = (pR - pL) + '%';
        }
      };

      sL.addEventListener('input', () => {
        if (parseInt(sL.value) >= parseInt(sR.value)) {
          sL.value = sR.value;
          sL.style.zIndex = "4"; // 重疊時優先抓取被操作的
          sR.style.zIndex = "3";
        }
        updateUI();
      });
      sR.addEventListener('input', () => {
        if (parseInt(sR.value) <= parseInt(sL.value)) {
          sR.value = sL.value;
          sR.style.zIndex = "4";
          sL.style.zIndex = "3";
        }
        updateUI();
      });

      // Z-index 切換邏輯：確保使用者點擊時能抓到正確的滑塊
      sL.addEventListener('mousedown', () => {
        sL.style.zIndex = "5";
        sR.style.zIndex = "4";
      });
      sR.addEventListener('mousedown', () => {
        sR.style.zIndex = "5";
        sL.style.zIndex = "4";
      });

      // 放開滑鼠：才同步 C++
      sL.addEventListener('change', () => applyLayoutChange(dc, panel));
      sR.addEventListener('change', () => applyLayoutChange(dc, panel));

      // 文字輸入框：依然保持原本的 change 同步
      [iL, iR].forEach(input => input.addEventListener('change', () => {
        sL.value = parseInt(iL.value) || 0;
        sR.value = iR.value.trim() === '' ? sR.max : (parseInt(iR.value) || 0);
        updateUI();
        applyLayoutChange(dc, panel);
      }));

      // 初始化
      updateUI();
    }

    if (dc.type === 'draw2DArray') {
      bindDualSlider('x');
      bindDualSlider('y');
    } else {
      bindDualSlider('');
    }

    // 初始驗證
    validateRequiredFields(panel);

    // DOM 寫回 C++ 邏輯：陣列樣式
    function rebuildArrayStyleFromDOM() {
      const items = Array.from(panel.querySelectorAll('.array-style-item'));
      const activeStyles = items.map(item => {
        const type = item.dataset.type;
        const color = item.dataset.color || '';
        const inp = item.querySelector('input[data-field="cpp-elements"]');
        const elements = splitTopLevelArgs(inp.value).map(s => s.trim()).filter(s => s !== '');
        return { type, color, elements };
      }).filter(s => s.elements.length > 0);

      if (activeStyles.length === 0) return '{}';

      return '{ ' + activeStyles.map(s => {
        const colorPart = s.color ? `, ${s.color.includes('AV_') ? s.color : '"' + s.color + '"'}` : '';
        return `{{ "${s.type}"${colorPart} }, { ${s.elements.join(', ')} }}`;
      }).join(', ') + ' }';
    }

    // DOM 寫回 C++ 邏輯：箭頭樣式
    function rebuildArrowStyleFromDOM() {
      const items = Array.from(panel.querySelectorAll('.arrow-style-item'));
      const activeStyles = items.map(item => {
        const key = item.dataset.key;
        let value = '';
        if (key === 'dash') {
          const solid = item.querySelector('.dash-solid').value.trim();
          const gap = item.querySelector('.dash-gap').value.trim();
          value = (solid || gap) ? `${solid || '0'},${gap || '0'}` : '';
        } else {
          const inp = item.querySelector('input[data-field="cpp-arrow-val"]');
          value = inp ? inp.value.trim() : '';
        }
        return { key, value };
      }).filter(s => s.value !== '');

      if (activeStyles.length === 0) return '{}';

      return '{ ' + activeStyles.map(s => {
        const valPart = s.value.includes('AV_') ? s.value : `"${s.value}"`;
        return `{"${s.key}", ${valPart}}`;
      }).join(', ') + ' }';
    }

    // 樣式字面量修改 (回寫 C++ 變數)
    panel.querySelectorAll('input[data-field="cpp-elements"]').forEach(inp => {
      inp.addEventListener('change', () => {
        const newStyleLiteral = rebuildArrayStyleFromDOM();

        // 更新 JS 運行時狀態以立即反映在畫布
        const items = Array.from(panel.querySelectorAll('.array-style-item'));
        dc.args[3] = items.map(item => {
          const type = item.dataset.type;
          const color = item.dataset.color || '';
          const elements = splitTopLevelArgs(item.querySelector('input[data-field="cpp-elements"]').value).map(s => s.trim()).filter(s => s !== '');
          if (elements.length > 0) return { type, color, elements };
          return null;
        }).filter(x => x);

        replayCurrentFrame();
        syncLayoutToCpp(dc, { styleVar: newStyleLiteral });
        showToast(`樣式變數已更新`, 'success');
      });
    });

    // 顏色按鈕點擊事件
    panel.querySelectorAll('.color-picker-btn:not(.arrow-color-picker-btn)').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const item = btn.closest('.array-style-item');
        openColorPalette(e, btn, (colorName, hex, isFinal) => {
          btn.style.background = hex;
          item.dataset.color = colorName;

          const sType = item.dataset.type;
          const styles = dc.args[3];
          if (styles) {
            const existing = styles.find(s => (s.type || (Array.isArray(s) ? s[0] : '')) === sType);
            if (existing) {
              existing.color = colorName;
              if (Array.isArray(existing)) existing[1] = colorName;
            }
          }
          replayCurrentFrame();

          if (isFinal) {
            const newStyleLiteral = rebuildArrayStyleFromDOM();
            syncLayoutToCpp(dc, { styleVar: newStyleLiteral });
            showToast(`樣式顏色已更新`, 'success');
          }
        });
      });
    });

    // 箭頭樣式輸入框
    panel.querySelectorAll('input[data-field="cpp-arrow-val"], input.dash-part, select[data-field="cpp-arrow-val"]').forEach(inp => {
      const item = inp.closest('.arrow-style-item');
      if (!item) return;
      const key = item.dataset.key;

      // 監聽 input 事件做即時顯隱切換 (針對 text 欄位)
      if (key === 'text') {
        inp.addEventListener('input', () => {
          const hasVal = inp.value.trim().length > 0;
          panel.querySelectorAll('.text-related-item').forEach(rel => {
            rel.style.display = hasVal ? 'flex' : 'none';
          });
        });
      }

      const eventType = (inp.tagName === 'SELECT') ? 'change' : 'change'; // Both change
      inp.addEventListener('change', () => {
        const newStyleLiteral = rebuildArrowStyleFromDOM();

        // 更新 JS 運行時狀態以立即反映在畫布
        let finalVal = inp.value.trim();
        if (key === 'dash') {
          const solid = item.querySelector('.dash-solid').value.trim();
          const gap = item.querySelector('.dash-gap').value.trim();
          finalVal = (solid || gap) ? `${solid || '0'},${gap || '0'}` : '';
        }

        if (dc.args[2] && typeof dc.args[2] === 'object') {
          dc.args[2][key] = finalVal;
        } else if (!dc.args[2] || Array.isArray(dc.args[2])) {
          const newOpt = {};
          if (Array.isArray(dc.args[2])) {
            dc.args[2].forEach(p => { if (p.key) newOpt[p.key] = p.value; });
          }
          newOpt[key] = finalVal;
          dc.args[2] = newOpt;
        }

        replayCurrentFrame();
        syncLayoutToCpp(dc, { styleVar: newStyleLiteral });
        showToast(`箭頭樣式變數已更新`, 'success');
      });
    });

    // 箭頭顏色選取器
    panel.querySelectorAll('.arrow-color-picker-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const item = btn.closest('.arrow-style-item');
        openColorPalette(e, btn, (colorName, hex, isFinal) => {
          btn.style.background = hex;
          const inp = item.querySelector('input[data-field="cpp-arrow-val"]');
          if (inp) inp.value = colorName; // 更新 UI

          if (dc.args[2] && typeof dc.args[2] === 'object') {
            dc.args[2][item.dataset.key] = colorName;
          }
          replayCurrentFrame();

          if (isFinal) {
            const newStyleLiteral = rebuildArrowStyleFromDOM();
            syncLayoutToCpp(dc, { styleVar: newStyleLiteral });
            showToast(`箭頭樣式顏色已更新`, 'success');
          }
        });
      });
    });

    // 原始格子樣式修改（僅影響即時預覽）
    panel.querySelectorAll('.cell-style-list input[data-field="elements"]').forEach(inp => {
      inp.addEventListener('change', () => {
        const idx = parseInt(inp.dataset.styleIdx);
        const newEls = inp.value.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
        const styles = dc.args[3];
        if (styles && styles[idx]) {
          if (styles[idx].elements) styles[idx].elements = newEls;
        }
        replayCurrentFrame();
        syncStyleToCpp(dc, idx);
      });
    });
  }

  function validateRequiredFields(panel) {
    const fields = [
      { id: 'prop-data-var', required: true },
      { id: 'prop-range-var', required: true },
      { id: 'pos-ref', required: true }
    ];
    fields.forEach(f => {
      const el = panel.querySelector('#' + f.id);
      if (!el) return;
      const val = el.value.trim();
      if (!val || val === '(無法抓取)') {
        el.classList.add('required-empty');
      } else {
        el.classList.remove('required-empty');
      }
    });

    // 額外驗證：2D 索引必須成對出現 (Row/Col)
    ['pos', 'pos-start', 'pos-end'].forEach(prefix => {
      const r = panel.querySelector(`#${prefix}-row`);
      const c = panel.querySelector(`#${prefix}-col`);
      if (r && c) {
        const rv = r.value.trim();
        const cv = c.value.trim();
        if ((rv !== '' && cv === '') || (rv === '' && cv !== '')) {
          if (rv === '') r.classList.add('required-empty');
          if (cv === '') c.classList.add('required-empty');
        } else {
          r.classList.remove('required-empty');
          c.classList.remove('required-empty');
        }
      }
    });
  }

  function applyLayoutChange(dc, panel) {
    const dt = panel.querySelector('#prop-drawtype');
    const ipr = panel.querySelector('#prop-ipr');
    const idx = panel.querySelector('#prop-index');
    const gap = panel.querySelector('#prop-gap');
    const dv = panel.querySelector('#prop-data-var');
    const iL = panel.querySelector('#range-L');
    const iR = panel.querySelector('#range-R');
    const sR = panel.querySelector('#slider-R');

    if (dt) dc.args[5] = dt.value;
    if (dc.type === 'draw2DArray') {
      if (idx) dc.args[6] = parseInt(idx.value) || 0;
    } else {
      if (ipr) dc.args[6] = parseInt(ipr.value) || 0;
      if (idx) dc.args[7] = parseInt(idx.value) || 0;
      if (gap) dc.args[8] = parseInt(gap.value) || 0;
    }

    // 回寫保護
    let dataVarValue = dv ? dv.value.trim() : null;
    if (dataVarValue === '(無法抓取)' || dataVarValue === 'undefined') dataVarValue = undefined;

    // 處理範圍語法 {L, R} 或 {{Ly, Lx}, {Ry, Rx}}
    let rangeVarValue = undefined;
    if (dc.type === 'draw2DArray') {
      const iL_y = panel.querySelector('#range-L-y');
      const iR_y = panel.querySelector('#range-R-y');
      const sR_y = panel.querySelector('#slider-R-y');
      const iL_x = panel.querySelector('#range-L-x');
      const iR_x = panel.querySelector('#range-R-x');
      const sR_x = panel.querySelector('#slider-R-x');

      if (iL_y && iR_y && iL_x && iR_x) {
        const Ly = parseInt(iL_y.value) || 0;
        const maxY = sR_y ? parseInt(sR_y.max) : 0;
        const Ry = iR_y.value.trim() === '' ? maxY : parseInt(iR_y.value);

        const Lx = parseInt(iL_x.value) || 0;
        const maxX = sR_x ? parseInt(sR_x.max) : 0;
        const Rx = iR_x.value.trim() === '' ? maxX : parseInt(iR_x.value);

        if (Ry >= maxY && Rx >= maxX && Ly === 0 && Lx === 0) {
          rangeVarValue = `{}`; // 全部預設
        } else if (Ry >= maxY && Rx >= maxX) {
          rangeVarValue = `{{${Lx}, ${Ly}}}`;
        } else {
          rangeVarValue = `{{${Lx}, ${Ly}}, {${Rx}, ${Ry}}}`;
        }
        dc.args[4] = (Ry >= maxY && Rx >= maxX) ? [[Lx, Ly]] : [[Lx, Ly], [Rx, Ry]];
      }
    } else {
      const iL = panel.querySelector('#range-L');
      const iR = panel.querySelector('#range-R');
      const sR = panel.querySelector('#slider-R');
      if (iL && iR) {
        const LVal = parseInt(iL.value) || 0;
        const max = sR ? parseInt(sR.max) : 0;
        const RVal = iR.value.trim() === '' ? max : parseInt(iR.value);

        if (RVal >= max) {
          rangeVarValue = `{${LVal}}`;
        } else {
          rangeVarValue = `{${LVal}, ${RVal}}`;
        }
        dc.args[4] = RVal >= max ? [LVal] : [LVal, RVal];
      }
    }

    const overrides = {
      dataVar: dataVarValue,
      rangeVar: rangeVarValue,
      styleVar: undefined
    };

    replayCurrentFrame();
    syncLayoutToCpp(dc, overrides);
  }

  function applyCircleStyleChange(dc, panel) {
    const sv = panel.querySelector('#prop-circle-style-var');
    const overrides = {
      dataVar: null,
      styleVar: sv ? sv.value : null
    };
    // 圓形的樣式通常在 args[3]
    syncLayoutToCpp(dc, overrides);
  }

  // ============================================================
  //  5. C++ 程式碼回寫
  // ============================================================

  /**
   * 將 JS Pos JSON 轉回 C++ Pos(...) 字串
   * 支援四種建構子:
   *   Pos(x, y)                              — 絕對
   *   Pos("ref", "anchor", dx, dy)            — 相對物件
   *   Pos("ref", index, "anchor", dx, dy)     — 相對格子
   *   Pos("ref", row, col, "anchor", dx, dy)  — 相對 2D 格子
   */
  function posJsonToCpp(pos) {
    if (!pos) return null;
    if (pos.type === 'rel' || pos.ref) {
      const ref = pos.ref || '';
      const anchor = pos.anchor || 'center';
      const dx = pos.dx != null ? pos.dx : (pos.x || 0);
      const dy = pos.dy != null ? pos.dy : (pos.y || 0);
      const hasRow = (pos.row != null && pos.row !== -1);
      const hasIdx = (pos.index != null && pos.index !== -1);

      if (hasRow) {
        const col = pos.col != null ? pos.col : 0;
        // Pos("ref", row, col, "anchor", dx, dy)
        let s = `Pos("${ref}", ${pos.row}, ${col}, "${anchor}"`;
        if (dx !== 0 || dy !== 0) s += `, ${fmtNum(dx)}, ${fmtNum(dy)}`;
        return s + ')';
      } else if (hasIdx) {
        // Pos("ref", index, "anchor", dx, dy)
        let s = `Pos("${ref}", ${pos.index}, "${anchor}"`;
        if (dx !== 0 || dy !== 0) s += `, ${fmtNum(dx)}, ${fmtNum(dy)}`;
        return s + ')';
      } else {
        // Pos("ref", "anchor", dx, dy)
        let s = `Pos("${ref}", "${anchor}"`;
        if (dx !== 0 || dy !== 0) s += `, ${fmtNum(dx)}, ${fmtNum(dy)}`;
        return s + ')';
      }
    } else {
      // 絕對位置 Pos(x, y)
      return `Pos(${fmtNum(pos.x || 0)}, ${fmtNum(pos.y || 0)})`;
    }
  }

  function fmtNum(n) {
    if (Number.isInteger(n)) return String(n);
    // 最多 4 位小數，去除尾部多餘的 0
    return parseFloat(n.toFixed(4)).toString();
  }

  /**
   * 取得 Ace Editor 實例
   */
  function getEditor() {
    // aceEditor 在 front.js 是用 const 宣告的，不在 window 上
    // 必須透過 ace.edit 重新取得同一個實例
    if (window.aceEditor) return window.aceEditor;
    try {
      // ace.edit('editor') 如果已存在同 ID 的 editor，會回傳同一個實例
      const el = document.getElementById('editor');
      if (el && el.env && el.env.editor) return el.env.editor;
    } catch (e) { }
    return null;
  }

  /**
   * 同步位置修改到 C++ 程式碼 (高自動化升級版)
   * 藉由將 C++ 行進行通用參數解析拆分，精確替換指定索引 (argIdx) 上的 Pos 參數，
   * 完美解決了多個 Pos 參數、自定義繪圖函式，以及巢狀表示式的回寫問題。
   */
  function syncPosToCpp(dc, argIdx = 1) {
    const editor = getEditor();
    if (!editor || dc.codeLine < 0) return;

    const pos = dc.args[argIdx];
    const newPosCpp = posJsonToCpp(pos);
    if (!newPosCpp) return;

    const session = editor.getSession();
    const groupID = dc.groupID || '';
    const searchCenter = dc.codeLine - 1; // 1-based → 0-based

    let lineIdx = -1;
    let lineText = '';

    // 根據 dc.type 限制搜尋的 C++ 函式名稱，防止互相誤認改錯行！
    const typeToFuncs = {
      'drawArray': ['frame_draw', 'draw_array', 'accu_store'],
      'draw2DArray': ['draw_2Darray', 'frame_draw_2Darray', 'accu_store_2D'],
      'drawArrow': ['arrow', 'accu_store_arrow'],
      'drawCircle': ['draw_circle', 'accu_store_circle'],
      'drawText': ['text', 'draw_word', 'accu_store_word'],
      'drawColoredText': ['draw_colored_text', 'colored_text', 'accu_store_colored']
    };
    const expectedFuncs = typeToFuncs[dc.type] || ['[a-zA-Z0-9_]+'];
    const fnRegex = new RegExp(`((?:key_)?(?:${expectedFuncs.join('|')}))\\s*\\(`);

    const isAutoGroupID = groupID.startsWith('auto-');

    // 第一階段：如果是有意義的 groupID (非 auto-)，優先嚴格比對包含該 ID 的行
    if (groupID && !isAutoGroupID) {
      for (let offset of [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5]) {
        const idx = searchCenter + offset;
        if (idx < 0) continue;
        const t = session.getLine(idx);
        if (!t) continue;

        if ((t.includes('"' + groupID + '"') || t.includes(groupID)) && t.includes('Pos(')) {
          lineIdx = idx;
          lineText = t;
          break;
        }
      }
    }

    // 第二階段：比對預期的函式名稱，且包含 Pos( (針對 arrow 這種 auto- ID 或嚴格比對失敗時)
    if (lineIdx === -1) {
      for (let offset of [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5]) {
        const idx = searchCenter + offset;
        if (idx < 0) continue;
        const t = session.getLine(idx);
        if (t && t.includes('Pos(') && fnRegex.test(t)) {
          lineIdx = idx;
          lineText = t;
          break;
        }
      }
    }

    // 第三階段：支援跨行 (Pos( 在下一行)
    if (lineIdx === -1) {
      for (let offset of [0, -1, 1, -2, 2]) {
        const idx = searchCenter + offset;
        if (idx < 0) continue;
        const t = session.getLine(idx);
        if (t && fnRegex.test(t)) {
          // 找它的下面幾行有沒有 Pos(
          for (let down = 0; down <= 3; down++) {
             const tDown = session.getLine(idx + down);
             if (tDown && tDown.includes('Pos(')) {
               lineIdx = idx + down;
               lineText = tDown;
               break;
             }
          }
          if (lineIdx !== -1) break;
        }
      }
    }

    // 第四階段：最寬鬆的退回，只要有 Pos( 就好
    if (lineIdx === -1) {
      for (let offset of [0, -1, 1, -2, 2]) {
        const idx = searchCenter + offset;
        if (idx < 0) continue;
        const t = session.getLine(idx);
        if (t && t.includes('Pos(')) {
          lineIdx = idx;
          lineText = t;
          break;
        }
      }
    }

    if (lineIdx === -1) {
      showToast(`行 ${dc.codeLine} 附近找不到對應的 Pos(...)，無法回寫`, 'error');
      return;
    }

    // 解析出函式呼叫的完整括號範圍，並替換特定參數
    const drawMatch = lineText.match(fnRegex);
    if (!drawMatch) return;

    const fnName = drawMatch[1];
    const fnStart = lineText.indexOf(fnName + '(');
    if (fnStart === -1) return;

    const argsStr = extractFnArgs(lineText, fnStart + fnName.length);
    if (!argsStr) return;

    const args = splitTopLevelArgs(argsStr);
    if (args.length <= argIdx) {
      while (args.length <= argIdx) {
        args.push(' ');
      }
    }

    const origArg = args[argIdx];
    const leadingSpaces = origArg ? (origArg.match(/^\s*/)[0] || ' ') : ' ';
    args[argIdx] = leadingSpaces + newPosCpp;

    const newArgsStr = args.join(',');
    const newLine = lineText.substring(0, fnStart) + fnName + '(' + newArgsStr + ')' +
      lineText.substring(fnStart + fnName.length + 1 + argsStr.length + 1);

    if (newLine && newLine !== lineText) {
      const Range = ace.require('ace/range').Range;
      session.replace(new Range(lineIdx, 0, lineIdx, lineText.length), newLine);
      showToast(`已回寫位置到行 ${lineIdx + 1}`, 'success');
    } else if (newLine === lineText) {
      showToast(`位置未變更`, 'info');
    }
  }

  /**
   * 同步陣列參數 (包含變數名稱) 到 C++
   * @param {Object} dc 
   * @param {Object} overrides 覆寫的變數名稱內容 { dataVar, styleVar }
   */
  function syncLayoutToCpp(dc, overrides = {}) {
    const editor = getEditor();
    if (!editor || dc.codeLine < 0) return;
    if (!['drawArray', 'draw2DArray', 'drawArrow', 'drawCircle', 'drawText', 'drawColoredText'].includes(dc.type)) return;

    const session = editor.getSession();
    // 強制文字型態的 groupID 為空，因為 C++ 的呼叫沒有這個 ID 參數！
    const groupID = (dc.type === 'drawText' || dc.type === 'drawColoredText') ? '' : (dc.groupID || '');
    const searchCenter = dc.codeLine - 1;

    let lineIdx = -1;
    let lineText = '';

    // 根據 dc.type 限制搜尋的 C++ 函式名稱 (分清 text 和 colored_text，防止互相誤認改錯行！)
    const typeToFuncs = {
      'drawArray': ['frame_draw', 'draw_array'],
      'draw2DArray': ['draw_2Darray', 'frame_draw_2Darray'],
      'drawArrow': ['arrow'],
      'drawCircle': ['draw_circle'],
      'drawText': ['text'],
      'drawColoredText': ['draw_colored_text', 'colored_text']
    };
    const expectedFuncs = typeToFuncs[dc.type] || ['draw', 'arrow'];
    const funcRegex = new RegExp(`((?:key_)?(?:${expectedFuncs.join('|')}))\\s*\\(`);

    // 提取原始文字的特徵字串（取前 4 個字元，排除 C++ 轉義與特殊符號），杜絕寫錯行！
    function getOriginalTextFeature(obj) {
      if (!obj || !obj._originalText) return null;
      const pure = obj._originalText.replace(/\\n/g, '').replace(/[\{\}\"\'\[\]\(\)\s]/g, '').trim();
      if (pure.length > 0) {
        return pure.substring(0, 4);
      }
      return null;
    }

    const offsets = Array.from({ length: 51 }, (_, i) => i === 0 ? [0] : [-i, i]).flat();
    const feature = getOriginalTextFeature(dc);
    const isAutoGroupID = groupID.startsWith('auto-');

    // 第一階段：嚴格搜尋（同時匹配函式、groupID 且包含原始文字特徵）
    if (feature) {
      for (let offset of offsets) {
        const idx = searchCenter + offset;
        if (idx < 0 || idx >= session.getLength()) continue;
        const t = session.getLine(idx);
        if (!t) continue;

        const hasGroupID = (groupID === '' || isAutoGroupID || t.includes('"' + groupID + '"') || t.includes(groupID));
        const hasFunc = t.match(funcRegex);

        if (hasFunc && hasGroupID && t.includes(feature)) {
          lineIdx = idx;
          lineText = t;
          break;
        }
      }
    }

    // 第二階段：寬鬆搜尋（如果嚴格搜尋沒找到，或者原本就沒有文字特徵）
    if (lineIdx === -1) {
      for (let offset of offsets) {
        const idx = searchCenter + offset;
        if (idx < 0 || idx >= session.getLength()) continue;
        const t = session.getLine(idx);
        if (!t) continue;

        const hasGroupID = (groupID === '' || isAutoGroupID || t.includes('"' + groupID + '"') || t.includes(groupID));
        const hasFunc = t.match(funcRegex);

        if (hasFunc && hasGroupID) {
          lineIdx = idx;
          lineText = t;
          break;
        }
      }
    }

    const drawMatch = lineText ? lineText.match(funcRegex) : null;
    if (!drawMatch) {
      showToast(`行 ${dc.codeLine} 附近找不到對應的繪圖函式，無法回寫`, 'error');
      return;
    }

    const fnName = drawMatch[1];
    
    // 找到函式呼叫的完整括號範圍，解析參數（支援跨多行繪圖函式！）
    let argsStr = null;
    let fullText = lineText;
    let linesParsedCount = 1;
    let fnStartInFull = -1;

    for (let offset = 0; offset < 20; offset++) {
      const nextIdx = lineIdx + offset;
      if (nextIdx >= session.getLength()) break;
      if (offset > 0) {
        fullText += '\n' + session.getLine(nextIdx);
      }
      
      const fnRegexWithName = new RegExp(fnName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\(');
      const fnMatch = fullText.match(fnRegexWithName);
      if (fnMatch) {
        const potentialStart = fullText.indexOf(fnMatch[0]) + fnMatch[0].indexOf('(');
        const potentialArgs = extractFnArgs(fullText, potentialStart);
        if (potentialArgs !== null) {
          argsStr = potentialArgs;
          linesParsedCount = offset + 1;
          fnStartInFull = potentialStart;
          break;
        }
      }
    }

    if (argsStr === null) {
      showToast(`行 ${dc.codeLine} 的參數解析失敗，無法回寫`, 'error');
      return;
    }

    // frame_draw 參數順序: (id, pos, data, style, range, draw_type, itemsPerRow, index, gap)
    // 索引:                  0    1    2      3     4        5           6        7     8
    const args = splitTopLevelArgs(argsStr);

    let finalFnName = fnName;

    if (dc.type === 'drawText' || dc.type === 'drawColoredText') {
      if (args.length < 2) {
        while (args.length < 2) args.push(' ');
      }
      if (overrides.textVar !== undefined) {
        // 保留原始 C++ 中的變數名稱：將新的 textVar 與原始 args[0] 做智慧合併
        console.log('[mergeDebug] originalArg0:', args[0]);
        console.log('[mergeDebug] newTextVar:', overrides.textVar);
        const merged = mergeTextVarPreservingVars(overrides.textVar, args[0]);
        console.log('[mergeDebug] merged:', merged);
        args[0] = ' ' + merged;
      }

      if (dc.type === 'drawText' && overrides.convertToColored) {
        if (finalFnName.includes('text') && !finalFnName.includes('colored')) {
          finalFnName = finalFnName.replace('text', 'colored_text');
        } else if (!finalFnName.includes('colored_text')) {
          finalFnName = 'colored_text';
        }
        dc.type = 'drawColoredText';
        dc.args[0] = dc._textSegments;
      }
    } else if (dc.type === 'drawArrow') {
      if (args.length < 2) return;
      if (overrides.startSpecVar !== undefined) args[0] = ' ' + overrides.startSpecVar;
      if (overrides.endSpecVar !== undefined) args[1] = ' ' + overrides.endSpecVar;
      if (overrides.styleVar !== undefined) args[2] = ' ' + overrides.styleVar;
    } else if (dc.type === 'draw2DArray') {
      const newDT = `"${dc.args[5] || 'normal'}"`;
      const newIdx = String(dc.args[6] || 0);

      while (args.length < 7) {
        if (args.length === 3) args.push(' {}');
        else if (args.length === 4) args.push(' {}');
        else if (args.length === 5) args.push(' "normal"');
        else if (args.length === 6) args.push(' 0');
      }

      if (overrides.dataVar !== undefined) args[2] = ' ' + overrides.dataVar;
      if (overrides.styleVar !== undefined) args[3] = ' ' + overrides.styleVar;
      if (overrides.rangeVar !== undefined) args[4] = ' ' + overrides.rangeVar;

      args[5] = ' ' + newDT;
      args[6] = ' ' + newIdx;
    } else {
      if (dc.type !== 'drawCircle') {
        while (args.length < 9) {
          if (args.length === 3) args.push(' {}');
          else if (args.length === 4) args.push(' {0}');
          else if (args.length === 5) args.push(' "normal"');
          else if (args.length === 6) args.push(' 0');
          else if (args.length === 7) args.push(' 0');
          else if (args.length === 8) args.push(' 0');
        }
      }

      // 更新參數
      const newDT = `"${dc.args[5] || 'normal'}"`;
      const newIPR = String(dc.args[6] || 0);
      const newIdx = String(dc.args[7] || 0);
      const newGap = String(dc.args[8] || 0);

      if (overrides.dataVar !== undefined) args[2] = ' ' + overrides.dataVar;
      if (overrides.styleVar !== undefined) args[3] = ' ' + overrides.styleVar;
      if (overrides.rangeVar !== undefined) args[4] = ' ' + overrides.rangeVar;

      if (dc.type !== 'drawCircle') {
        args[5] = ' ' + newDT;
        args[6] = ' ' + newIPR;
        args[7] = ' ' + newIdx;
        args[8] = ' ' + newGap;
      }
    }

    const newArgsStr = args.join(',');
    
    // 定位 fnStartInFull 之前的內容 (包含 av. 或是 key_ 等)，加上新函數名和參數，以及右括號之後的內容
    const beforeCall = fullText.substring(0, fnStartInFull - fnName.length);
    const afterCall = fullText.substring(fnStartInFull + 1 + argsStr.length + 1);
    
    const newLine = beforeCall + finalFnName + '(' + newArgsStr + ')' + afterCall;

    if (newLine !== fullText) {
      const Range = ace.require('ace/range').Range;
      const endLineIdx = lineIdx + linesParsedCount - 1;
      session.replace(
        new Range(lineIdx, 0, endLineIdx, session.getLine(endLineIdx).length),
        newLine
      );
    }
  }

  /**
   * 同步格子樣式修改到 C++ (通知用戶，因為樣式通常在變數中)
   */
  function syncStyleToCpp(dc, styleIdx) {
    // 格子樣式通常是透過變數定義的（如 pre_st.push_back(...)），
    // 直接替換比較困難，用 Toast 提示使用者手動確認。
    if (dc.codeLine >= 0) {
      showToast(`樣式已套用預覽，請手動確認行 ${dc.codeLine} 的 C++`, 'info');
    }
  }

  /**
   * 提取函式呼叫的完整參數字串 (括號內容)
   * startIdx 應指向 '(' 的位置
   */
  function extractFnArgs(line, startIdx) {
    if (line[startIdx] !== '(') return null;
    let depth = 0;
    let inStr = false;
    let strChar = '';
    for (let i = startIdx; i < line.length; i++) {
      const c = line[i];
      if (inStr) {
        if (c === '\\') { i++; continue; }
        if (c === strChar) inStr = false;
        continue;
      }
      if (c === '"' || c === "'") { inStr = true; strChar = c; continue; }
      if (c === '(') depth++;
      if (c === ')') {
        depth--;
        if (depth === 0) return line.substring(startIdx + 1, i);
      }
    }
    return null;
  }

  /**
   * 將最外層以逗號分隔的參數拆開 (不深入括號、字串內的逗號)
   */
  function splitTopLevelArgs(argsStr) {
    const result = [];
    let current = '';
    let depth = 0;
    let inStr = false;
    let strChar = '';
    for (let i = 0; i < argsStr.length; i++) {
      const c = argsStr[i];
      if (inStr) {
        current += c;
        if (c === '\\') { current += argsStr[++i] || ''; continue; }
        if (c === strChar) inStr = false;
        continue;
      }
      if (c === '"' || c === "'") { inStr = true; strChar = c; current += c; continue; }
      if (c === '(' || c === '{' || c === '[') { depth++; current += c; continue; }
      if (c === ')' || c === '}' || c === ']') { depth--; current += c; continue; }
      if (c === ',' && depth === 0) {
        result.push(current);
        current = '';
        continue;
      }
      current += c;
    }
    result.push(current);
    return result;
  }

  // ============================================================
  //  6. 全域事件綁定
  // ============================================================
  document.addEventListener('DOMContentLoaded', () => {
    const svg = document.getElementById('arraySvg');
    if (!svg) return;

    // 右鍵選單
    svg.addEventListener('contextmenu', (e) => {
      let obj = e.target.closest('.draggable-object');
      let dc = null;

      if (!obj) {
        // 檢查是否點擊到箭頭
        const line = e.target.closest('line[data-arrow-key], path[data-arrow-key], text[data-arrow-id]');
        if (line) {
          obj = line;
          const arrowKey = line.getAttribute('data-arrow-key') || line.getAttribute('data-arrow-id');
          // 透過 DOM 順序找到對應的 drawCall
          const layer = svg.querySelector('#arrow-layer');
          if (layer) {
            // text 跟 line 的對應處理：統一找 line
            const realLine = layer.querySelector(`line[data-arrow-key="${arrowKey}"], line[id="${arrowKey}"]`);
            if (realLine) {
              const arrowsInDOM = Array.from(layer.querySelectorAll('line[data-arrow-key]'));
              const arrowIdx = arrowsInDOM.indexOf(realLine);
              const arrowCalls = getCurrentFrameDrawCalls().filter(c => c.type === 'drawArrow');
              dc = arrowCalls[arrowIdx] || null;
            }
          }
        } else {
          hideCtxMenu();
          return;
        }
      } else {
        const id = obj.getAttribute('id');
        dc = id ? findDrawCallByGroupID(id) : null;
      }

      e.preventDefault();
      e.stopPropagation();

      // 即使沒找到 drawCall，也可以顯示基本選單
      showCtxMenu(e, obj, dc);
    });

    // 點其他地方關閉選單
    document.addEventListener('mousedown', (e) => {
      if (_ctxMenu && !_ctxMenu.contains(e.target)) hideCtxMenu();
    });

    // ESC 關閉
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { hideCtxMenu(); hidePropPanel(); }
    });
  });

  // 暴露 API 供外部使用
  window.GuiEditor = {
    getFrameRegistry: () => _frameRegistry,
    getCurrentDrawCalls: getCurrentFrameDrawCalls,
    replayFrame: replayCurrentFrame,
    hidePropPanel,
    hideCtxMenu,
  };

  // ============================================================
  //  7. Toast 通知元件
  // ============================================================
  let _toastContainer = null;

  function ensureToastContainer() {
    if (_toastContainer) return _toastContainer;
    _toastContainer = document.createElement('div');
    _toastContainer.style.cssText =
      'position:fixed; bottom:20px; right:20px; z-index:10000;' +
      'display:flex; flex-direction:column-reverse; gap:8px; pointer-events:none;';
    document.body.appendChild(_toastContainer);
    return _toastContainer;
  }

  /**
   * 顯示一個短暫通知
   * @param {string} msg  - 訊息內容
   * @param {'success'|'error'|'info'} type
   * @param {number} duration - 毫秒
   */
  function showToast(msg, type = 'info', duration = 2500) {
    const container = ensureToastContainer();
    const toast = document.createElement('div');
    const colors = {
      success: { bg: '#065f46', border: '#10b981', icon: '✅' },
      error: { bg: '#7f1d1d', border: '#ef4444', icon: '❌' },
      info: { bg: '#1e3a5f', border: '#3b82f6', icon: 'ℹ️' }
    };
    const c = colors[type] || colors.info;
    toast.style.cssText =
      `padding:8px 16px; border-radius:8px; font-size:13px; color:#fff;` +
      `background:${c.bg}; border:1px solid ${c.border};` +
      `box-shadow:0 4px 12px rgba(0,0,0,.3); pointer-events:auto;` +
      `opacity:0; transform:translateY(10px); transition:all .25s ease;` +
      `font-family:system-ui,-apple-system,sans-serif;`;
    toast.textContent = `${c.icon} ${msg}`;
    container.appendChild(toast);
    // 動畫進入
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });
    const durationTime = 2000;
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(20px)';
      setTimeout(() => toast.remove(), 300);
    }, durationTime);
  }

  /**
   * 開啟顏色選擇彈窗 (iro.js)
   * @param {Event} evt 點擊事件
   * @param {HTMLElement} anchorBtn 觸發按鈕
   * @param {Function} onSelect 回呼函數 (colorName, hex, isFinal)
   */
  function openColorPalette(evt, anchorBtn, onSelect) {
    // 移除已存在的
    const existing = document.getElementById('gui-color-palette');
    if (existing) existing.remove();

    const palette = document.createElement('div');
    palette.id = 'gui-color-palette';
    palette.className = 'gui-color-palette';
    palette.style.cssText = `
      position: absolute; background: #fff; border: 1px solid #e5e7eb;
      border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.2);
      padding: 12px; width: 200px; z-index: 10000;
      display: flex; flex-direction: column; gap: 10px;
    `;

    // 1. AV 常用常量區
    const constLabel = document.createElement('div');
    constLabel.innerText = '常用 AV 顏色';
    constLabel.style.cssText = 'font-size: 11px; color: #6b7280; font-weight: 600;';
    palette.appendChild(constLabel);

    const constGrid = document.createElement('div');
    constGrid.style.cssText = 'display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px;';
    AV_COLORS.forEach(c => {
      const swatch = document.createElement('div');
      swatch.style.cssText = `
        width: 24px; height: 24px; border-radius: 4px; cursor: pointer;
        border: 1px solid rgba(0,0,0,0.1); background: ${c.hex};
      `;
      swatch.title = c.name;
      swatch.addEventListener('mousedown', (e) => {
        e.preventDefault(); // 防止失去焦點
        onSelect(c.name, c.hex, true); // 快選按鈕：直接觸發 Final
        palette.remove();
      });
      constGrid.appendChild(swatch);
    });
    palette.appendChild(constGrid);

    // 2. 分隔線
    const divider = document.createElement('div');
    divider.style.cssText = 'height: 1px; background: #f3f4f6; margin: 4px 0;';
    palette.appendChild(divider);

    // 3. iro.js 選色輪區
    const pickerLabel = document.createElement('div');
    pickerLabel.innerText = '自定義顏色';
    pickerLabel.style.cssText = 'font-size: 11px; color: #6b7280; font-weight: 600;';
    palette.appendChild(pickerLabel);

    const pickerMount = document.createElement('div');
    pickerMount.id = 'gui-iro-picker';
    pickerMount.style.display = 'flex';
    pickerMount.style.justifyContent = 'center';
    // 防止點擊色輪時失去焦點
    pickerMount.addEventListener('mousedown', (e) => e.preventDefault());
    palette.appendChild(pickerMount);

    document.body.appendChild(palette);

    // 計算位置
    const rect = anchorBtn.getBoundingClientRect();
    palette.style.top = (rect.bottom + window.scrollY + 5) + 'px';
    palette.style.left = Math.min(rect.left + window.scrollX - 80, window.innerWidth - 220) + 'px';

    // 初始化 iro.js (如果庫存在)
    if (window.iro) {
      const item = anchorBtn.closest('.cell-style-item');
      const inp = item ? item.querySelector('input[data-field="cpp-elements"]') : null;
      let initialColor = (inp && inp.value && !inp.value.includes('AV_')) ? inp.value : '#ff0000';
      if (anchorBtn.dataset.initialColor && anchorBtn.dataset.initialColor !== 'transparent') {
        initialColor = anchorBtn.dataset.initialColor;
      }

      const picker = new iro.ColorPicker(pickerMount, {
        width: 150,
        color: initialColor,
        borderWidth: 1,
        borderColor: "#e5e7eb",
        layout: [
          { component: iro.ui.Box },
          { component: iro.ui.Slider, options: { sliderType: 'hue' } },
          { component: iro.ui.Slider, options: { sliderType: 'alpha' } }
        ]
      });

      picker.on('color:change', (color) => {
        // 即時預覽：isFinal = false
        onSelect(color.hexString, color.hexString, false);
      });

      picker.on('input:end', (color) => {
        // 放開滑鼠：isFinal = true
        onSelect(color.hexString, color.hexString, true);
      });
    } else {
      pickerMount.innerHTML = '<div style="font-size:10px;color:#999;text-align:center">無法載入選色器庫</div>';
    }

    const closeHandler = (ev) => {
      // 點擊彈窗外部才關閉
      if (!palette.contains(ev.target) && ev.target !== anchorBtn) {
        palette.remove();
        document.removeEventListener('mousedown', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', closeHandler), 10);
  }

  // --- 左鍵雙擊文字物件：原生 Inline Edit ---

  const AV_MAP = {
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
    'AV_white': 'white',
    'green': 'rgba(165, 214, 167, 0.6)',
    'blue': 'rgba(144, 202, 249, 0.6)',
    'red': 'rgba(239, 154, 154, 0.6)',
    'yellow': 'rgba(252, 255, 64, 0.46)',
    'orange': 'orange',
    'black': 'black',
    'white': 'white'
  };

  function resolveColorHex(cName) {
    if (!cName) return null;
    if (AV_MAP[cName]) return AV_MAP[cName];
    const match = AV_COLORS.find(c => cName.includes(c.name));
    return match ? match.hex : cName;
  }

  function colorToHex(colorVal) {
    if (!colorVal) return '';
    if (colorVal.startsWith('#')) return colorVal;
    if (colorVal.startsWith('rgb')) {
      const parts = colorVal.match(/\d+/g);
      if (parts && parts.length >= 3) {
        const r = parseInt(parts[0]).toString(16).padStart(2, '0');
        const g = parseInt(parts[1]).toString(16).padStart(2, '0');
        const b = parseInt(parts[2]).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`;
      }
    }
    return colorVal;
  }

  function resolveColorName(hex) {
    if (!hex) return null;
    const stdHex = colorToHex(hex).toLowerCase();
    
    // 優先反向比對 AV_MAP 裡的色彩值
    for (let key in AV_MAP) {
      if (key.startsWith('AV_')) {
        const val = AV_MAP[key];
        if (colorToHex(val).toLowerCase() === stdHex) {
          return key;
        }
      }
    }
    
    const match = AV_COLORS.find(c => c.hex.toLowerCase() === stdHex);
    return match ? match.name : stdHex;
  }

  let _currentInlineWrapper = null;
  let _currentInlineTargetObj = null;
  let _currentInlineDC = null;
  let _savedRange = null; // 儲存選取範圍

  // 將 node 及其子節點解析成 text segments
  function extractSegmentsFromNode(node, inheritedColor, inheritedBg, inheritedSize) {
    let segs = [];
    for (let n of node.childNodes) {
      if (n.nodeType === Node.TEXT_NODE) {
        if (n.textContent) {
          segs.push({
            text: n.textContent,
            font_color: inheritedColor,
            bg_color: inheritedBg,
            font_size: inheritedSize
          });
        }
      } else if (n.nodeType === Node.ELEMENT_NODE) {
        let c = inheritedColor;
        let bg = inheritedBg;
        let fs = inheritedSize;

        if (n.tagName === 'SPAN' || n.tagName === 'FONT') {
          if (n.style.color) c = resolveColorName(n.style.color) || n.style.color;
          else if (n.color) c = resolveColorName(n.color) || n.color;

          if (n.style.backgroundColor) bg = resolveColorName(n.style.backgroundColor) || n.style.backgroundColor;
          if (n.style.fontSize) fs = parseInt(n.style.fontSize) || fs;
        }

        if (n.tagName === 'BR') {
          segs.push({ text: '\n', font_color: c, bg_color: bg, font_size: fs });
        } else if (n.tagName === 'DIV' && segs.length > 0) {
          segs.push({ text: '\n', font_color: c, bg_color: bg, font_size: fs });
        }

        segs = segs.concat(extractSegmentsFromNode(n, c, bg, fs));
      }
    }
    return segs;
  }

  function formatCppColor(colorVal) {
    if (!colorVal) return `""`;
    return `"${colorVal}"`;
  }



  function closeNativeInlineEditor() {
    window.isInlineEditing = false;
    if (!_currentInlineWrapper || !_currentInlineDC) return;

    const wrapper = _currentInlineWrapper;
    const dc = _currentInlineDC;
    const obj = _currentInlineTargetObj;
    const editorNode = wrapper.querySelector('.gui-inline-editor');

    // 解析 HTML 為 Segment
    let rawSegments = extractSegmentsFromNode(editorNode, '#111827', 'transparent', 14);

    // 合併相鄰且樣式相同的段落
    const newSegments = [];
    rawSegments.forEach(seg => {
      if (newSegments.length > 0) {
        let last = newSegments[newSegments.length - 1];
        if (last.font_color === seg.font_color && last.bg_color === seg.bg_color && last.font_size === seg.font_size) {
          last.text += seg.text;
          return;
        }
      }
      newSegments.push(seg);
    });

    if (newSegments.length === 0) {
      newSegments.push({ text: ' ', font_size: 14, font_color: '#111827', bg_color: 'transparent' });
    }

    // 寫回 dc
    dc._textSegments = newSegments;
    if (dc.type === 'drawText') {
      dc.args[0] = newSegments.map(s => s.text).join('');
    } else if (dc.type === 'drawColoredText') {
      dc.args[0] = newSegments;
    }

    // 恢復 SVG 顯示
    if (obj) {
      const textNodes = obj.querySelectorAll('text');
      textNodes.forEach(n => n.style.opacity = '1');
    }

    // 移除 Toolbar 與 DOM
    hideInlineToolbar();
    if (wrapper._wheelHandler) {
      document.removeEventListener('wheel', wrapper._wheelHandler);
    }
    wrapper.remove();
    _currentInlineWrapper = null;
    _currentInlineTargetObj = null;
    _currentInlineDC = null;
    _savedRange = null;

    // 重繪與同步
    replayCurrentFrame();
    syncTextToCpp(dc);
  }

  // --- 手刻 Bubble Toolbar ---
  let _inlineToolbar = null;
  let _inlineSizeSpan = null;

  function showInlineToolbar(rect) {
    const sel = window.getSelection();
    let currentFC = '#ffffff';
    let currentBG = 'transparent';
    if (sel.rangeCount > 0 && !sel.isCollapsed) {
      const range = sel.getRangeAt(0);
      const parent = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE 
        ? range.commonAncestorContainer 
        : range.commonAncestorContainer.parentNode;
      if (parent) {
        const computed = window.getComputedStyle(parent);
        currentFC = computed.color || '#ffffff';
        currentBG = computed.backgroundColor || 'transparent';
        if (currentBG === 'rgba(0, 0, 0, 0)') currentBG = 'transparent';
      }
    }

    if (!_inlineToolbar) {
      _inlineToolbar = document.createElement('div');
      _inlineToolbar.className = 'gui-inline-toolbar';
      _inlineToolbar.style.cssText = `
        position: absolute; z-index: 10001; background: #222; color: #fff;
        padding: 6px 12px; border-radius: 8px; display: flex; align-items: center; gap: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3); font-family: sans-serif; font-size: 13px;
      `;
      // Arrow
      const arrow = document.createElement('div');
      arrow.style.cssText = `
        position: absolute; bottom: -5px; left: 50%; transform: translateX(-50%);
        border-width: 5px 5px 0 5px; border-style: solid; border-color: #222 transparent transparent transparent;
      `;
      _inlineToolbar.appendChild(arrow);

      const btnStyle = `background:none; border:none; color:#fff; cursor:pointer; font-size:14px; font-weight:bold; padding:2px 4px; border-radius:4px;`;

      // 字體大小下拉選單
      const sizeSelect = document.createElement('div');
      sizeSelect.id = 'inline-size-select';
      sizeSelect.dataset.value = '14';
      sizeSelect.textContent = '14 px';
      sizeSelect.title = 'Drag left or right to change font size';
      sizeSelect.style.cssText = `min-width:42px; height:22px; display:flex; align-items:center; justify-content:center; background:#333; color:#fff; border:1px solid #555; border-radius:4px; padding:0 5px; font-size:11px; cursor:ew-resize; user-select:none; outline:none;`;
      sizeSelect.onpointerdown = (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startValue = parseInt(sizeSelect.dataset.value, 10) || 14;
        let latest = startValue;
        let moved = false;
        const move = event => {
          const delta = Math.round((event.clientX - startX) / 3);
          const next = Math.max(8, Math.min(144, startValue + delta));
          if (next === latest) return;
          latest = next;
          moved = true;
          sizeSelect.dataset.value = String(next);
          sizeSelect.textContent = `${next} px`;
          changeInlineStyle('size', next, false);
        };
        const up = () => {
          document.removeEventListener('pointermove', move, true);
          document.removeEventListener('pointerup', up, true);
          document.removeEventListener('pointercancel', up, true);
          if (moved) changeInlineStyle('size', latest, true);
        };
        document.addEventListener('pointermove', move, true);
        document.addEventListener('pointerup', up, true);
        document.addEventListener('pointercancel', up, true);
      };

      const fcBtn = document.createElement('div');
      fcBtn.id = 'inline-fc-btn';
      fcBtn.style.cssText = `width:16px; height:16px; border-radius:50%; background:#fff; cursor:pointer; border:1px solid #666; margin:0 4px;`;
      fcBtn.title = "文字顏色";
      fcBtn.onmousedown = (e) => { 
        e.preventDefault(); 
        e.stopPropagation(); 
        openColorPalette(e, fcBtn, (cName, hex, isFinal) => { 
          fcBtn.style.background = hex; 
          fcBtn.dataset.initialColor = hex;
          changeInlineStyle('foreColor', hex, isFinal); 
        }); 
      };

      const bgBtn = document.createElement('div');
      bgBtn.id = 'inline-bg-btn';
      bgBtn.style.cssText = `width:16px; height:16px; border-radius:50%; background:transparent; cursor:pointer; border:1px dashed #aaa; margin:0 4px;`;
      bgBtn.title = "背景顏色";
      bgBtn.onmousedown = (e) => { 
        e.preventDefault(); 
        e.stopPropagation(); 
        openColorPalette(e, bgBtn, (cName, hex, isFinal) => { 
          bgBtn.style.background = hex; 
          bgBtn.style.border = '1px solid #666'; 
          bgBtn.dataset.initialColor = hex;
          changeInlineStyle('bgColor', hex, isFinal); 
        }); 
      };

      _inlineToolbar.appendChild(sizeSelect);
      _inlineToolbar.appendChild(fcBtn);
      _inlineToolbar.appendChild(bgBtn);
      document.body.appendChild(_inlineToolbar);
    }

    // 每次顯示時動態載入選區的真實色彩樣式
    const fcBtn = _inlineToolbar.querySelector('#inline-fc-btn');
    const bgBtn = _inlineToolbar.querySelector('#inline-bg-btn');
    const sizeSelElem = _inlineToolbar.querySelector('#inline-size-select');
    if (fcBtn) {
      fcBtn.style.background = currentFC;
      fcBtn.dataset.initialColor = currentFC;
    }
    if (bgBtn) {
      bgBtn.style.background = currentBG === 'transparent' ? '#ffffff' : currentBG;
      bgBtn.style.border = currentBG === 'transparent' ? '1px dashed #aaa' : '1px solid #666';
      bgBtn.dataset.initialColor = currentBG;
    }
    // 偵測當前選取文字的字體大小
    if (sizeSelElem) {
      const sel2 = window.getSelection();
      if (sel2.rangeCount > 0 && !sel2.isCollapsed) {
        const parent2 = sel2.getRangeAt(0).commonAncestorContainer;
        const elem = parent2.nodeType === Node.ELEMENT_NODE ? parent2 : parent2.parentNode;
        if (elem) {
          const fs = parseInt(window.getComputedStyle(elem).fontSize) || 14;
          sizeSelElem.dataset.value = String(fs);
          sizeSelElem.textContent = `${fs} px`;
        }
      }
    }

    _inlineToolbar.style.display = 'flex';
    _inlineToolbar.style.top = (rect.top + window.scrollY - 45) + 'px';
    const tbWidth = 180;
    _inlineToolbar.style.left = (rect.left + window.scrollX + (rect.width / 2) - (tbWidth / 2)) + 'px';
  }

  function hideInlineToolbar() {
    if (_inlineToolbar) _inlineToolbar.style.display = 'none';
  }

  function changeInlineStyle(cmd, val, isFinal = true) {
    if (!_currentInlineWrapper) return;
    const sel = window.getSelection();

    // 如果失去焦點，嘗試從 _savedRange 恢復選取！
    if ((!sel.rangeCount || sel.isCollapsed) && _savedRange) {
      sel.removeAllRanges();
      sel.addRange(_savedRange);
    }

    if (!sel.rangeCount) return;

    document.execCommand('styleWithCSS', false, true);

    if (cmd === 'foreColor') {
      document.execCommand('foreColor', false, val);
    } else if (cmd === 'bgColor') {
      // 用 CSS backgroundColor 避免 hiliteColor 產生的框框
      const range = sel.getRangeAt(0);
      try {
        const span = document.createElement('span');
        span.style.backgroundColor = val;
        range.surroundContents(span);
      } catch (e) {
        // 跨段落時改用 hiliteColor 作為後備
        document.execCommand('hiliteColor', false, val);
      }
    } else if (cmd === 'size') {
      if (_inlineSizeSpan) {
        _inlineSizeSpan.style.fontSize = val + 'px';
        if (isFinal) _inlineSizeSpan = null;
      } else {
        const range = sel.getRangeAt(0);
        try {
          const span = document.createElement('span');
          span.style.fontSize = val + 'px';
          range.surroundContents(span);
          if (!isFinal) _inlineSizeSpan = span;
        } catch (e) {
          showToast('無法跨段落改變字體大小，請分次選取', 'info');
        }
      }
    }

    // 操作完畢後，只在 isFinal=true 時重新觸發 checkSelection 更新狀態，防止拖動色輪時彈窗閃退！
    if (isFinal) {
      checkSelection();
    }
  }

  function checkSelection() {
    if (!_currentInlineWrapper) return;
    const sel = window.getSelection();

    // 如果有選取範圍，且在 editor 內，則儲存並顯示 Toolbar
    if (sel.rangeCount > 0 && !sel.isCollapsed) {
      const range = sel.getRangeAt(0);
      const editorNode = _currentInlineWrapper.querySelector('.gui-inline-editor');
      if (editorNode && editorNode.contains(range.commonAncestorContainer)) {
        _savedRange = range.cloneRange(); // 儲存起來供按鈕使用
        const rect = range.getBoundingClientRect();
        if (rect.width > 0) {
          showInlineToolbar(rect);
          return;
        }
      }
    } else {
      // 若選取折疊（如使用者點擊了編輯器內其他字，或取消選取），清空儲存的舊選取範圍
      _savedRange = null;
      hideInlineToolbar();
    }
  }

  function openNativeInlineEditor(obj, dc) {
    window.isInlineEditing = true;
    if (_currentInlineWrapper) {
      if (_currentInlineTargetObj === obj) return;
      closeNativeInlineEditor();
    }

    _currentInlineTargetObj = obj;
    _currentInlineDC = dc;
    _savedRange = null;

    // 記錄原始文字以供回寫時進行精確的特徵對比，杜絕寫錯行！
    if (dc && !dc._originalText) {
      if (dc.type === 'drawText') {
        dc._originalText = String(dc.args[0]);
      } else if (dc.type === 'drawColoredText') {
        const segs = Array.isArray(dc.args[0]) ? dc.args[0] : (dc._textSegments || []);
        dc._originalText = segs.map(s => s.text).join('|');
      }
    }

    const textNodes = obj.querySelectorAll('text');

    // 動態獲取原本 SVG 文字的真實樣式，防止進入編輯器時字體大小或字型突變
    let originFontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    let originFontSize = '14px';
    let originFontWeight = 'normal';
    let originLineHeight = '1.3';
    let originColor = '#111827';

    if (textNodes.length > 0) {
      // 由於 SVG text 本身可能在 opacity:0 之前，我們先抓取其 computedStyle
      const computed = window.getComputedStyle(textNodes[0]);
      if (computed.fontFamily && computed.fontFamily !== 'inherit') originFontFamily = computed.fontFamily;
      if (computed.fontSize && computed.fontSize !== 'inherit') originFontSize = computed.fontSize;
      if (computed.fontWeight && computed.fontWeight !== 'inherit') originFontWeight = computed.fontWeight;
      if (computed.lineHeight && computed.lineHeight !== 'normal' && computed.lineHeight !== 'inherit') originLineHeight = computed.lineHeight;
      if (computed.color && computed.color !== 'inherit') originColor = computed.color;
    }

    textNodes.forEach(n => n.style.opacity = '0');

    const tRect = textNodes.length > 0 ? textNodes[0].getBoundingClientRect() : obj.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

    // 獲取當前畫布的縮放比例，將縮放效果完美同步給內聯編輯器，消除「看起來比較小」的視覺差
    const s = (window.getScale ? window.getScale() : 1) || 1;

    const wrapper = document.createElement('div');
    wrapper.style.position = 'absolute';
    wrapper.style.left = (tRect.left + scrollLeft) + 'px';
    wrapper.style.top = (tRect.top + scrollTop) + 'px';
    wrapper.style.minWidth = '50px';
    wrapper.style.zIndex = 10000;
    wrapper.style.transform = `scale(${s})`;
    wrapper.style.transformOrigin = 'top left';

    const editorNode = document.createElement('div');
    editorNode.className = 'gui-inline-editor';
    editorNode.contentEditable = 'true';
    editorNode.style.cssText = `
      outline: none; white-space: pre-wrap; word-break: break-all;
      font-family: ${originFontFamily};
      font-size: ${originFontSize};
      font-weight: ${originFontWeight};
      line-height: ${originLineHeight};
      color: ${originColor};
      min-width: 10px; cursor: text;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    `;

    let segments = [];
    if (dc.type === 'drawColoredText') {
      // 如果本來就是 colored_text，dc.args[0] 本身就是 segments 陣列
      segments = Array.isArray(dc.args[0]) ? dc.args[0] : (dc._textSegments || []);
    } else {
      segments = dc._textSegments || [];
      if (segments.length === 0 && dc.args[0]) {
        segments = [{ text: dc.args[0], font_size: 14, font_color: '#111827', bg_color: '#ffffff' }];
      }
    }

    let html = '';
    segments.forEach(seg => {
      const fc = resolveColorHex(seg.font_color) || '';
      const bg = resolveColorHex(seg.bg_color) || '';
      const fs = seg.font_size || 14;

      let style = '';
      if (fc && fc !== '#111827') style += `color:${fc};`;
      if (bg && bg !== '#ffffff') style += `background-color:${bg};`;
      if (fs) style += `font-size:${fs}px;`;

      const txt = seg.text.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
      if (style) {
        html += `<span style="${style}">${txt}</span>`;
      } else {
        html += txt;
      }
    });

    editorNode.innerHTML = html || ' ';
    wrapper.appendChild(editorNode);
    document.body.appendChild(wrapper);

    _currentInlineWrapper = wrapper;
    _currentInlineTargetObj = obj;

    // 監聽滾輪事件：縮放時即時更新編輯器位置與大小
    function _onWheelUpdateInlinePos() {
      if (!_currentInlineWrapper || !_currentInlineTargetObj) return;
      const targetTextNodes = _currentInlineTargetObj.querySelectorAll('text');
      const newRect = targetTextNodes.length > 0 ? targetTextNodes[0].getBoundingClientRect() : _currentInlineTargetObj.getBoundingClientRect();
      const sTop = window.pageYOffset || document.documentElement.scrollTop;
      const sLeft = window.pageXOffset || document.documentElement.scrollLeft;
      const newScale = (window.getScale ? window.getScale() : 1) || 1;

      _currentInlineWrapper.style.left = (newRect.left + sLeft) + 'px';
      _currentInlineWrapper.style.top = (newRect.top + sTop) + 'px';
      _currentInlineWrapper.style.transform = `scale(${newScale})`;
    }
    wrapper._wheelHandler = (e) => {
      // 延遲一幀，等畫布縮放完成再更新位置
      requestAnimationFrame(_onWheelUpdateInlinePos);
    };
    document.addEventListener('wheel', wrapper._wheelHandler, { passive: true });

    document.addEventListener('selectionchange', checkSelection);

    setTimeout(() => {
      editorNode.focus();
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(editorNode);
      // 不折疊游標，保持全選狀態，這樣雙擊時能直接反白所有文字並跳出工具列
      sel.removeAllRanges();
      sel.addRange(range);
    }, 10);
  }

  // 自訂雙擊監聽 (由 interaction.js 觸發)
  window.onObjectDoubleClick = (obj) => {
    if (!obj) return;
    const id = obj.getAttribute('id');
    if (!id) return;

    const dc = findDrawCallByGroupID(id);
    if (dc && (dc.type === 'drawText' || dc.type === 'drawColoredText')) {
      openNativeInlineEditor(obj, dc);
      window.getSelection().removeAllRanges();
    }
  };

  // 全域點擊監聽 (點擊空白處關閉編輯器)
  document.addEventListener('mousedown', (e) => {
    if (!_currentInlineWrapper) return;

    const isInsideEditor = _currentInlineWrapper.contains(e.target);
    const isInsideToolbar = _inlineToolbar && _inlineToolbar.contains(e.target);
    const isColorPicker = e.target.closest('.gui-color-palette');

    // 如果點擊了空白處 (非編輯器、非Toolbar、非選色器)
    if (!isInsideEditor && !isInsideToolbar && !isColorPicker) {
      document.removeEventListener('selectionchange', checkSelection);
      closeNativeInlineEditor();
    } else if (!isInsideEditor) {
      // 如果點擊的是 Toolbar 或選色器，不要隱藏 toolbar！
      // 讓事件繼續，防止 blur
    } else {
      // 點擊了編輯器，如果沒有選取範圍，就隱藏 toolbar
      setTimeout(() => {
        const sel = window.getSelection();
        if (sel.isCollapsed) hideInlineToolbar();
      }, 50);
    }
  });

  // 暴露 showToast 供內部使用
  window._guiToast = showToast;

  // ==========================================
  // 程式碼編輯器 (Ace Editor) 右鍵選單功能
  // ==========================================
  const codeEditorContainer = document.getElementById('editor');
  if (codeEditorContainer) {
    const codeContextMenu = document.createElement('div');
    codeContextMenu.style.cssText = `
      position: absolute;
      background: #1e1e1e;
      border: 1px solid #454545;
      box-shadow: 0 4px 6px rgba(0,0,0,0.3);
      border-radius: 4px;
      padding: 4px 0;
      min-width: 150px;
      z-index: 10000;
      display: none;
      color: #d4d4d4;
      font-family: sans-serif;
      font-size: 13px;
    `;

    const createMenuItem = (text, onClick) => {
      const item = document.createElement('div');
      item.textContent = text;
      item.style.cssText = `
        padding: 8px 16px;
        cursor: pointer;
        transition: background 0.1s;
      `;
      item.onmouseenter = () => item.style.background = '#094771';
      item.onmouseleave = () => item.style.background = 'transparent';
      item.onclick = (e) => {
        e.stopPropagation();
        codeContextMenu.style.display = 'none';
        onClick();
      };
      return item;
    };

    // 插入程式碼片段的共用函式
    const insertCodeSnippet = (snippet) => {
      const editor = ace.edit('editor');
      if (!editor) return;
      const session = editor.getSession();
      const pos = editor.getCursorPosition();
      
      // 確保插入時前面有適當的縮排
      const lineStr = session.getLine(pos.row);
      const match = lineStr.match(/^\s*/);
      const indent = match ? match[0] : '';
      
      // 若游標不在行尾，或者該行有文字，先換行
      let prefix = '';
      if (lineStr.trim() !== '' && pos.column > 0) {
        prefix = '\n' + indent;
      }
      
      // 處理 snippet 內部的縮排
      const formattedSnippet = snippet.split('\n').map((line, i) => i === 0 ? line : indent + line).join('\n');
      
      editor.insert(prefix + formattedSnippet + '\n' + indent);
      editor.focus();
    };

    const addFrameBtn = createMenuItem('新增一幀', () => {
      const snippet = 
`av.start_frame_draw();
// 繪畫函式寫在這裡

av.auto_camera();
av.end_frame_draw();`;
      insertCodeSnippet(snippet);
    });

    const addObjectBtn = createMenuItem('新增物件', () => {
      const snippet = 
`// 繪製物件（支援一維/二維陣列、queue、stack等變數）
av.frame_draw("物件名稱", Pos(0, 0), 變數名稱);`;
      insertCodeSnippet(snippet);
    });

    const addArrowBtn = createMenuItem('新增箭頭', () => {
      const snippet = 
`// 繪製箭頭
av.arrow(Pos("起點名稱", "bottom"), Pos("終點名稱", "top"));`;
      insertCodeSnippet(snippet);
    });

    codeContextMenu.appendChild(addFrameBtn);
    codeContextMenu.appendChild(addObjectBtn);
    codeContextMenu.appendChild(addArrowBtn);
    document.body.appendChild(codeContextMenu);

    codeEditorContainer.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      codeContextMenu.style.left = e.pageX + 'px';
      codeContextMenu.style.top = e.pageY + 'px';
      codeContextMenu.style.display = 'block';
    });

    document.addEventListener('click', (e) => {
      if (codeContextMenu.style.display === 'block' && !codeContextMenu.contains(e.target)) {
        codeContextMenu.style.display = 'none';
      }
    });
  }

})();
