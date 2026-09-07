class CanvasInteractionManager {
    /**
     * @param {SVGSVGElement} svg      - 主 SVG 容器 (#arraySvg)
     */
    constructor(svg) {
      this.svg = svg;
      this.selected = null;     // 當前選中的 .draggable-object
      this.mode     = null;     // 'drag' 或 null
      this.last     = { x: 0, y: 0 };
  
      // 1) 點擊切換選取／取消
      svg.addEventListener('click', e => this.onClick(e), false);
      svg.addEventListener('pointerdown', e => this.onTraceSelectionPointerDown(e), true);
  
      // 2) Pointer 事件處理拖曳
      svg.addEventListener('pointerdown',  e => this.onPointerDown(e),  false);
      svg.addEventListener('pointermove',  e => this.onPointerMove(e),  false);
      svg.addEventListener('pointerup',    e => this.onPointerUp(e),    false);
      svg.addEventListener('pointercancel', e => this.onPointerUp(e),    false);
      window.addEventListener('pointerup',    e => this.onPointerUp(e),  false);
      window.addEventListener('pointercancel', e => this.onPointerUp(e),  false);
  
      // 3) 原生雙擊監聽器，確保左鍵兩下 100% 穩定選取與編輯
      svg.addEventListener('dblclick', e => this.onDblClick(e), false);
  
      // 4) 插入選中樣式 (箭頭不再使用簡單虛線外框，改由 SVG 控制點繪製，這樣更容易對齊且精緻)
      const style = document.createElement('style');
      style.textContent = `
        .draggable-object.selected:not(.asm-trace-selectable) > rect {
          stroke: #3d85c6;
          stroke-width: 2px;
        }
      `;
      document.head.appendChild(style);

      // 5) 監聽 viewport transform 屬性變化，自動更新選取框
      const setupViewportObserver = () => {
        const sharedViewport = window.getViewport ? window.getViewport() : null;
        const vp = sharedViewport?.nodeType
          ? sharedViewport
          : svg.querySelector('#viewport');
        if (vp) {
          const observer = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
              if (mutation.attributeName === 'transform') {
                this.updateSelectionOverlay();
              }
            });
          });
          observer.observe(vp, { attributes: true, attributeFilter: ['transform'] });
        } else {
          // 如果 viewport 還沒建立，等一下再試
          setTimeout(setupViewportObserver, 50);
        }
      };
      setupViewportObserver();

      window.addEventListener('asm:trace-rendered', () => {
        if (this.selected) requestAnimationFrame(() => this.refreshSelection());
      });
    }
  
    // 點擊事件：點空白處取消選取（選中邏輯在 onPointerDown 處理）
    onClick(evt) {
      if (this._isTraceStudio()) {
        const capturedKey = this._capturedTraceSelectionKey;
        if (capturedKey && this.selected?.dataset.traceObjectKey === capturedKey) return;
        const hitTarget = document.elementFromPoint(evt.clientX, evt.clientY) || evt.target;
        const traceObject = hitTarget.closest?.('.asm-trace-selectable[data-trace-object-key]');
        if (traceObject && this.svg.contains(traceObject)) return;
      }
      // 藉由相同的滑鼠位置判斷是否有點到物件，若無則取消選取
      const pt = this.svg.createSVGPoint();
      pt.x = evt.clientX; pt.y = evt.clientY;
      let cursor = pt;
      const vp = window.getViewport ? window.getViewport() : this.svg;
      try {
        cursor = pt.matrixTransform(vp.getScreenCTM().inverse());
      } catch(e) {}

      // 檢查附近是否有箭頭
      const lines = Array.from(this.svg.querySelectorAll('line.draggable-object'));
      let bestLine = null;
      let minDist = Infinity;
      for (const line of lines) {
        const x1 = parseFloat(line.getAttribute('x1') || 0);
        const y1 = parseFloat(line.getAttribute('y1') || 0);
        const x2 = parseFloat(line.getAttribute('x2') || 0);
        const y2 = parseFloat(line.getAttribute('y2') || 0);
        const dist = this.getDistanceToSegment(cursor.x, cursor.y, x1, y1, x2, y2);
        if (dist < minDist) {
          minDist = dist;
          bestLine = line;
        }
      }

      const s = window.getScale ? window.getScale() : 1;
      const threshold = 15 / s;
      let clickedObj = null;
      if (minDist < threshold && bestLine) {
        clickedObj = bestLine;
      } else {
        clickedObj = this._candidateFromTarget(evt.target);
      }

      if (!clickedObj || !this.svg.contains(clickedObj)) {
        // 點到空白處 → 取消選取並關閉面板
        this.clearSelection();
        if (window.GuiEditor) {
          window.GuiEditor.hidePropPanel();
          window.GuiEditor.hideCtxMenu();
        }
      }
    }
  
    clearSelection() {
      if (this.selected) {
        this.selected.classList.remove('selected');
        this.selected = null;
      }
      this.updateSelectionOverlay();
      if (this._isTraceStudio()) {
        window.dispatchEvent(new CustomEvent('asm:trace-object-selected', { detail: { key: '' } }));
      }
    }

    onTraceSelectionPointerDown(evt) {
      this._capturedTraceSelectionKey = '';
      if (evt.button !== 0 || !this._isTraceStudio()) return;
      let bindingHandle = evt.target.closest?.('[data-trace-binding-handle], [data-trace-source-anchor]');
      if (!bindingHandle) {
        const visibleHandle = this.svg.querySelector('[data-trace-binding-handle]');
        const rect = visibleHandle?.getBoundingClientRect();
        if (rect && evt.clientX >= rect.left - 3 && evt.clientX <= rect.right + 3
          && evt.clientY >= rect.top - 3 && evt.clientY <= rect.bottom + 3) {
          bindingHandle = visibleHandle;
        }
      }
      if (bindingHandle) {
        const started = this._startTraceBinding(
          evt,
          bindingHandle.dataset.traceSourceKey,
          bindingHandle.dataset.traceSourceAnchor || 'top'
        );
        if (started) evt.stopImmediatePropagation();
        return;
      }
      const object = evt.target.closest?.('.asm-trace-selectable[data-trace-object-key]');
      if (!object || !this.svg.contains(object)) return;
      if (this.selected && this.selected !== object) this.selected.classList.remove('selected');
      this.selected = object;
      object.classList.add('selected');
      this._capturedTraceSelectionKey = object.dataset.traceObjectKey || '';
      this.updateSelectionOverlay();
      window.dispatchEvent(new CustomEvent('asm:trace-object-selected', {
        detail: { key: object.dataset.traceObjectKey || '' }
      }));
    }

    // 重繪後 DOM 元素會被替換，Trace 物件優先用穩定 key 重新綁定選取。
    refreshSelection() {
      if (!this.selected) return;
      const traceKey = this.selected.dataset.traceObjectKey;
      const id = this.selected.getAttribute('id');
      let newEl = null;
      if (traceKey && this._isTraceStudio()) {
        newEl = this.svg.querySelector(
          `.asm-trace-selectable[data-trace-object-key="${CSS.escape(traceKey)}"]`
        );
      } else if (id) {
        newEl = this.svg.querySelector('#' + CSS.escape(id) + '.draggable-object');
      }
      if (newEl) {
        this.selected = newEl;
        newEl.classList.add('selected');
      } else {
        this.selected = null;
      }
      this.updateSelectionOverlay();
    }
  
    // 原生雙擊事件處理，100% 穩定
    onDblClick(evt) {
      const obj = this._candidateFromTarget(evt.target);
      if (obj && this.svg.contains(obj)) {
        // 雙擊發生時，立刻將可能已經觸發的拖曳狀態徹底中斷
        this._pendingDrag = false;
        this.mode = null;
        if (window.onObjectDoubleClick) {
          window.onObjectDoubleClick(obj);
        }
      }
    }

    // 計算點到線段的最短距離
    getDistanceToSegment(px, py, x1, y1, x2, y2) {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const l2 = dx * dx + dy * dy;
      if (l2 === 0) return Math.hypot(px - x1, py - y1);
      let t = ((px - x1) * dx + (py - y1) * dy) / l2;
      t = Math.max(0, Math.min(1, t));
      return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    }

    // 動態更新選取輔助框/控制點 (對齊更方便，視覺效果類似 Draw.io)
    updateSelectionOverlay() {
      this._restoreTraceBindingLayer();
      let overlay = this.svg.querySelector('#selection-overlay');
      if (overlay) overlay.remove();
      this.svg.querySelector('#trace-binding-preview-underlay')?.remove();

      if (!this.selected) return;

      const grp = this.selected;
      if (this._isTraceStudio() && grp.dataset.traceObjectKey) {
        this._drawTraceSelectionOverlay(grp);
        return;
      }
      if (grp.tagName.toLowerCase() === 'line') {
        const vp = window.getViewport ? window.getViewport() : this.svg;
        overlay = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        overlay.setAttribute('id', 'selection-overlay');
        overlay.setAttribute('style', 'pointer-events: none;'); // 不影響滑鼠穿透

        const x1 = parseFloat(grp.getAttribute('x1') || 0);
        const y1 = parseFloat(grp.getAttribute('y1') || 0);
        const x2 = parseFloat(grp.getAttribute('x2') || 0);
        const y2 = parseFloat(grp.getAttribute('y2') || 0);

        const hasHeadStart = grp.hasAttribute('marker-start');
        const hasHeadEnd = grp.hasAttribute('marker-end');
        const strokeW_line = parseFloat(grp.getAttribute('stroke-width') || 4);
        const shrinkStart = hasHeadStart ? (12 + (strokeW_line - 4) * 3) : 0;
        const shrinkEnd = hasHeadEnd ? (12 + (strokeW_line - 4) * 3) : 0;

        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.hypot(dx, dy);
        let ux = 0, uy = 0;
        if (len > 0) {
          ux = dx / len;
          uy = dy / len;
        }

        const tipX1 = x1 - ux * shrinkStart;
        const tipY1 = y1 - uy * shrinkStart;
        const tipX2 = x2 + ux * shrinkEnd;
        const tipY2 = y2 + uy * shrinkEnd;

        const s = window.getScale ? window.getScale() : 1;
        const boxSize = 8 / s;
        const boxHalf = 4 / s;
        const strokeW = 1.5 / s;
        const strokeW2 = 2 / s;

        // 畫一條藍色虛線重疊在箭頭上作為選取標記（從起點尖端畫到終點尖端）
        const helperLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        helperLine.setAttribute('x1', tipX1);
        helperLine.setAttribute('y1', tipY1);
        helperLine.setAttribute('x2', tipX2);
        helperLine.setAttribute('y2', tipY2);
        helperLine.setAttribute('stroke', '#3d85c6');
        helperLine.setAttribute('stroke-width', strokeW);
        helperLine.setAttribute('stroke-dasharray', `${3/s},${3/s}`);
        overlay.appendChild(helperLine);

        // 畫起點控制方格
        const h1 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        h1.setAttribute('x', tipX1 - boxHalf);
        h1.setAttribute('y', tipY1 - boxHalf);
        h1.setAttribute('width', boxSize);
        h1.setAttribute('height', boxSize);
        h1.setAttribute('fill', '#ffffff');
        h1.setAttribute('stroke', '#3d85c6');
        h1.setAttribute('stroke-width', strokeW2);
        overlay.appendChild(h1);

        // 畫終點控制方格
        const h2 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        h2.setAttribute('x', tipX2 - boxHalf);
        h2.setAttribute('y', tipY2 - boxHalf);
        h2.setAttribute('width', boxSize);
        h2.setAttribute('height', boxSize);
        h2.setAttribute('fill', '#ffffff');
        h2.setAttribute('stroke', '#3d85c6');
        h2.setAttribute('stroke-width', strokeW2);
        overlay.appendChild(h2);

        vp.appendChild(overlay);
      }
    }
  
    // pointerdown：記錄起始位置，等 pointermove 確認有移動才真正啟動拖曳
    onPointerDown(evt) {
      if (evt.button !== 0) return; // 僅處理左鍵

      const bindingHandle = evt.target.closest?.('[data-trace-binding-handle], [data-trace-source-anchor]');
      if (bindingHandle && this._isTraceStudio()) {
        const sourceKey = bindingHandle.dataset.traceSourceKey;
        if (this._startTraceBinding(evt, sourceKey, bindingHandle.dataset.traceSourceAnchor || 'top')) return;
      }
      
      // 如果目前正在進行文字內聯編輯，不允許拖曳 any 物件以防止干擾選取
      if (window.isInlineEditing && !this._isTraceStudio()) {
        this._pendingDrag = false;
        this.mode = null;
        return;
      }

      // 取得在 SVG 空間的滑鼠點
      let pt = this.svg.createSVGPoint();
      pt.x = evt.clientX; pt.y = evt.clientY;
      let cursor = pt;
      const vp = window.getViewport ? window.getViewport() : this.svg;
      try {
        cursor = pt.matrixTransform(vp.getScreenCTM().inverse());
      } catch(e) {}

      const s = window.getScale ? window.getScale() : 1;
      const threshold = 15 / s;

      let obj = null;
      this._dragType = null;

      // 1. 超優先判定：如果當前已經選中了某個箭頭 (line)，優先判斷滑鼠是否點擊在該選中箭頭的起終點控制點上。
      // 這能防止當箭頭端點與其他物件（如格子）重疊時，點擊控制點卻一直選中底下物件的問題。
      if (this.selected && this.selected.tagName.toLowerCase() === 'line') {
        const lineObj = this.selected;
        const x1 = parseFloat(lineObj.getAttribute('x1') || 0);
        const y1 = parseFloat(lineObj.getAttribute('y1') || 0);
        const x2 = parseFloat(lineObj.getAttribute('x2') || 0);
        const y2 = parseFloat(lineObj.getAttribute('y2') || 0);

        const hasHeadStart = lineObj.hasAttribute('marker-start');
        const hasHeadEnd = lineObj.hasAttribute('marker-end');
        const strokeW_line = parseFloat(lineObj.getAttribute('stroke-width') || 4);
        const shrinkStart = hasHeadStart ? (12 + (strokeW_line - 4) * 3) : 0;
        const shrinkEnd = hasHeadEnd ? (12 + (strokeW_line - 4) * 3) : 0;

        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.hypot(dx, dy);
        let ux = 0, uy = 0;
        if (len > 0) {
          ux = dx / len;
          uy = dy / len;
        }

        const tipX1 = x1 - ux * shrinkStart;
        const tipY1 = y1 - uy * shrinkStart;
        const tipX2 = x2 + ux * shrinkEnd;
        const tipY2 = y2 + uy * shrinkEnd;

        const distStart = Math.hypot(cursor.x - tipX1, cursor.y - tipY1);
        const distEnd = Math.hypot(cursor.x - tipX2, cursor.y - tipY2);

        if (distStart < threshold) {
          obj = lineObj;
          this._dragType = 'start';
        } else if (distEnd < threshold) {
          obj = lineObj;
          this._dragType = 'end';
        }
      }

      // 2. 如果沒有點擊在選中箭頭的控制點上，則進行常規物件檢測
      if (!obj) {
        // 優先檢查滑鼠點擊是否在 any 箭頭線段附近
        const lines = Array.from(this.svg.querySelectorAll('line.draggable-object'));
        let bestLine = null;
        let minDist = Infinity;

        for (const line of lines) {
          const x1 = parseFloat(line.getAttribute('x1') || 0);
          const y1 = parseFloat(line.getAttribute('y1') || 0);
          const x2 = parseFloat(line.getAttribute('x2') || 0);
          const y2 = parseFloat(line.getAttribute('y2') || 0);
          const dist = this.getDistanceToSegment(cursor.x, cursor.y, x1, y1, x2, y2);
          if (dist < minDist) {
            minDist = dist;
            bestLine = line;
          }
        }

        if (minDist < threshold && bestLine) {
          obj = bestLine;
        } else {
          obj = this._candidateFromTarget(evt.target);
        }
      }

      if (obj && this.svg.contains(obj)) {
        // 先選中物件（不管之前有沒有選中）
        if (this.selected && this.selected !== obj) {
          this.selected.classList.remove('selected');
        }
        this.selected = obj;
        obj.classList.add('selected');
        this.updateSelectionOverlay();

        if (this._isTraceStudio() && obj.dataset.traceObjectKey
            && obj.dataset.traceMovable !== '1') {
          this._pendingDrag = false;
          this.mode = null;
          return;
        }

        // 區分拖曳行為：如果是箭頭 (line)，點擊兩頭是拉單邊，點中間是整體拖曳
        if (obj.tagName.toLowerCase() === 'line') {
          const x1 = parseFloat(obj.getAttribute('x1') || 0);
          const y1 = parseFloat(obj.getAttribute('y1') || 0);
          const x2 = parseFloat(obj.getAttribute('x2') || 0);
          const y2 = parseFloat(obj.getAttribute('y2') || 0);
          
          this._origX1 = x1;
          this._origY1 = y1;
          this._origX2 = x2;
          this._origY2 = y2;

          // 如果在前面超優先判定中沒有確定 _dragType，這時再計算一次（針對點擊新箭頭或點擊中間）
          if (!this._dragType) {
            const hasHeadStart = obj.hasAttribute('marker-start');
            const hasHeadEnd = obj.hasAttribute('marker-end');
            const strokeW_line = parseFloat(obj.getAttribute('stroke-width') || 4);
            const shrinkStart = hasHeadStart ? (12 + (strokeW_line - 4) * 3) : 0;
            const shrinkEnd = hasHeadEnd ? (12 + (strokeW_line - 4) * 3) : 0;

            const dx = x2 - x1;
            const dy = y2 - y1;
            const len = Math.hypot(dx, dy);
            let ux = 0, uy = 0;
            if (len > 0) {
              ux = dx / len;
              uy = dy / len;
            }

            const tipX1 = x1 - ux * shrinkStart;
            const tipY1 = y1 - uy * shrinkStart;
            const tipX2 = x2 + ux * shrinkEnd;
            const tipY2 = y2 + uy * shrinkEnd;
            
            const distStart = Math.hypot(cursor.x - tipX1, cursor.y - tipY1);
            const distEnd = Math.hypot(cursor.x - tipX2, cursor.y - tipY2);
            
            if (distStart < threshold) {
              this._dragType = 'start';
            } else if (distEnd < threshold) {
              this._dragType = 'end';
            } else {
              this._dragType = 'all';
            }
          }

          this._snappedSpec = null;
          this._finalSpec = null;
          if (this._dragType === 'start' || this._dragType === 'end') {
            this._collectAnchors();
            this._showAnchors();
          }
        }

        // 進入「準備拖曳」模式，等 pointermove 確認
        this._pendingDrag = true;
        this._dragPointerId = evt.pointerId;
        this.mode = null;
        this.last = { x: evt.clientX, y: evt.clientY };
        this._downPos = { x: evt.clientX, y: evt.clientY };
        this._dragStart = { x: evt.clientX, y: evt.clientY };
        this._dragTotal = { x: 0, y: 0 };
        this._traceBaseTransform = obj.getAttribute('transform') || '';
        if (this._isTraceStudio() && obj.dataset.traceObjectKey && obj.tagName.toLowerCase() !== 'line') {
          this._prepareTraceAlignment(obj);
        }
        evt.stopPropagation();
        evt.preventDefault();
      } else {
        this._pendingDrag = false;
        this.mode = null;
      }
    }
  
    // pointermove：先偵測是否要升級為拖曳，再處理物件位移
    onPointerMove(evt) {
      if (this.mode === 'binding') {
        this._moveTraceBinding(evt);
        return;
      }
      // 從 pendingDrag 升級為真正的 drag
      if (this._pendingDrag && !this.mode) {
        const dx = evt.clientX - this._downPos.x;
        const dy = evt.clientY - this._downPos.y;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          // 超過閾值，正式進入拖曳
          this.mode = 'drag';
          this._pendingDrag = false;
          try { this.svg.setPointerCapture(this._dragPointerId); } catch {}
        } else {
          return; // 還沒超過閾值，等待
        }
      }
 
      if (this.mode !== 'drag' || !this.selected) return;
      evt.stopPropagation();
      // 計算螢幕位移
      const dx = evt.clientX - this.last.x;
      const dy = evt.clientY - this.last.y;
      this.last = { x: evt.clientX, y: evt.clientY };
   
      // 補償當前 scale
      const s = window.getScale ? window.getScale() : 1;
      const wx = dx / s;
      const wy = dy / s;
   
      // 更新群組的 data-translate 與 transform
      const grp = this.selected;
      const [tx, ty] = (grp.getAttribute('data-translate') || '0,0')
                        .split(',').map(Number);
      let ntx = tx + wx, nty = ty + wy;
      const traceDrag = this._isTraceStudio() && this.selected?.dataset.traceObjectKey
        && this.selected.tagName.toLowerCase() !== 'line';
      if (traceDrag) {
        ntx = (evt.clientX - this._dragStart.x) / s;
        nty = (evt.clientY - this._dragStart.y) / s;
        if (evt.shiftKey) {
          if (Math.abs(ntx) >= Math.abs(nty)) nty = 0;
          else ntx = 0;
        }
        if (!evt.ctrlKey) {
          const snapped = this._snapTraceDrag(ntx, nty);
          ntx = snapped.x;
          nty = snapped.y;
        } else {
          this._showAlignmentGuides(null, null);
        }
      }
      if (this._isTraceStudio() && this.selected?.tagName.toLowerCase() === 'line'
          && this._dragType === 'all' && evt.shiftKey) {
        if (Math.abs(ntx) >= Math.abs(nty)) nty = 0;
        else ntx = 0;
      }
      
      grp.setAttribute('data-translate', `${ntx},${nty}`);

      if (grp.tagName.toLowerCase() === 'line') {
        if (this._dragType === 'start' || this._dragType === 'end') {
          // 取得目前滑鼠在 SVG 世界座標系下的位置
          let pt = this.svg.createSVGPoint();
          pt.x = evt.clientX; pt.y = evt.clientY;
          let cursor = pt;
          const vp = window.getViewport ? window.getViewport() : this.svg;
          try {
            cursor = pt.matrixTransform(vp.getScreenCTM().inverse());
          } catch(e) {}

          let targetX = cursor.x;
          let targetY = cursor.y;
          let snapped = null;

          const snapDist = 15 / s; // 15 像素以內吸附

          let minDist = Infinity;
          if (this._anchors && !evt.ctrlKey) {
            for (const anchor of this._anchors) {
              const d = Math.hypot(cursor.x - anchor.x, cursor.y - anchor.y);
              if (d < snapDist && d < minDist) {
                minDist = d;
                snapped = anchor;
              }
            }
          }

          if (snapped) {
            targetX = snapped.x;
            targetY = snapped.y;
            this._snappedSpec = snapped.spec;
            this._highlightAnchor(snapped);
          } else {
            this._snappedSpec = null;
            this._highlightAnchor(null);
          }

          if (!this._snappedSpec) {
            this._finalSpec = { type: 'abs', x: targetX, y: targetY };
          } else {
            this._finalSpec = this._snappedSpec;
          }

          const hasHeadStart = grp.hasAttribute('marker-start');
          const hasHeadEnd = grp.hasAttribute('marker-end');
          const strokeW_line = parseFloat(grp.getAttribute('stroke-width') || 4);
          const shrinkStart = hasHeadStart ? (12 + (strokeW_line - 4) * 3) : 0;
          const shrinkEnd = hasHeadEnd ? (12 + (strokeW_line - 4) * 3) : 0;

          if (this._dragType === 'start') {
            const x2 = parseFloat(grp.getAttribute('x2') || 0);
            const y2 = parseFloat(grp.getAttribute('y2') || 0);
            const dx = x2 - targetX;
            const dy = y2 - targetY;
            const len = Math.hypot(dx, dy);
            let ux = 0, uy = 0;
            if (len > 0) {
              ux = dx / len;
              uy = dy / len;
            }
            grp.setAttribute('x1', targetX + ux * shrinkStart);
            grp.setAttribute('y1', targetY + uy * shrinkStart);
          } else {
            const x1 = parseFloat(grp.getAttribute('x1') || 0);
            const y1 = parseFloat(grp.getAttribute('y1') || 0);
            const dx = targetX - x1;
            const dy = targetY - y1;
            const len = Math.hypot(dx, dy);
            let ux = 0, uy = 0;
            if (len > 0) {
              ux = dx / len;
              uy = dy / len;
            }
            grp.setAttribute('x2', targetX - ux * shrinkEnd);
            grp.setAttribute('y2', targetY - uy * shrinkEnd);
          }
        } else {
          // 'all'
          grp.setAttribute('x1', this._origX1 + ntx);
          grp.setAttribute('y1', this._origY1 + nty);
          grp.setAttribute('x2', this._origX2 + ntx);
          grp.setAttribute('y2', this._origY2 + nty);
        }
        if (this._isTraceStudio() && grp.dataset.traceObjectKey && this._dragType === 'all') {
          window.ASMTraceStudio?.moveBoundObjects?.(grp.dataset.traceObjectKey, ntx, nty);
        }
        this.updateSelectionOverlay();
      } else {
        // 讀 base-offset
        if (traceDrag) {
          grp.setAttribute('transform', `${this._traceBaseTransform} translate(${ntx},${nty})`.trim());
          window.ASMTraceStudio?.moveBoundObjects?.(grp.dataset.traceObjectKey, ntx, nty);
          this.updateSelectionOverlay();
          return;
        }
        const [bx, by] = (grp.getAttribute('data-base-offset') || '0,0')
                          .split(',').map(Number);
        // 合併後設定 transform
        grp.setAttribute(
          'transform',
          `translate(${bx + ntx},${by + nty})`
        );      
        // 若有綁定箭頭，就更新它們的座標
        if (window.updateArrows) {
          window.updateArrows();
        }
      }
    }
  
    // pointerup / pointercancel：結束拖曳並釋放 capture
    onPointerUp(evt) {
      this._pendingDrag = false; // 清除待拖曳狀態
      this._hideAnchors();
      this._showAlignmentGuides(null, null);

      if (this.mode === 'binding') {
        try { this.svg.releasePointerCapture(evt.pointerId); } catch {}
        this.mode = null;
        evt.stopPropagation();
        if (this._bindingSnapped) {
          window.ASMTraceStudio?.bindPosition?.(
            this._bindingSourceKey,
            this._bindingSourceAnchor,
            this._bindingSnapped.key,
            this._bindingSnapped.anchor
          );
        } else if (this._bindingMoved) {
          window.ASMTraceStudio?.unbindPosition?.(this._bindingSourceKey);
        }
        this._bindingSnapped = null;
        this._bindingHoverKey = null;
        this._bindingSourceKey = null;
        this._bindingSourceAnchor = null;
        return;
      }

      if (this.mode === 'drag') {
        const grp = this.selected;
        try { this.svg.releasePointerCapture(evt.pointerId); } catch {}
        this.mode = null;
        evt.stopPropagation();
 
        // 拖曳結束後，通知 GUI 編輯器更新 C++
        if (window.onObjectDragEnd && grp) {
          const id = grp.getAttribute('id');
          if (this._dragType === 'start' || this._dragType === 'end') {
            window.onObjectDragEnd(id, 0, 0, this._dragType, this._finalSpec);
          } else {
            const [ntx, nty] = (grp.getAttribute('data-translate') || '0,0')
                                .split(',').map(Number);
            // 沒有實際移動就不觸發回寫
            if (Math.abs(ntx) > 0.01 || Math.abs(nty) > 0.01) {
              window.onObjectDragEnd(id, ntx, nty, this._dragType);
            }
          }
          grp.setAttribute('data-translate', '0,0');
        }
        window.ASMTraceStudio?.endBoundObjectDrag?.();
      }
    }

    _isTraceStudio() {
      return document.body.classList.contains('asm-trace-studio-open');
    }

    _startTraceBinding(evt, sourceKey, sourceAnchor = 'top') {
      if (!sourceKey || this.selected?.dataset.traceObjectKey !== sourceKey) return false;
      this.mode = 'binding';
      this._pendingDrag = false;
      this._dragPointerId = evt.pointerId;
      this._bindingSourceKey = sourceKey;
      this._bindingSourceAnchor = sourceAnchor;
      this._bindingMoved = false;
      this._bindingDown = { x: evt.clientX, y: evt.clientY };
      this._bindingHoverKey = null;
      this._collectTraceAnchors(sourceKey);
      try { this.svg.setPointerCapture(evt.pointerId); } catch {}
      evt.preventDefault();
      evt.stopPropagation();
      return true;
    }

    _candidateFromTarget(target) {
      if (!target?.closest) return null;
      if (this._isTraceStudio()) {
        const part = target.closest('.asm-trace-selectable[data-trace-object-key]');
        if (part && this.svg.contains(part)) return part;
      }
      return target.closest('.draggable-object');
    }

    _elementBoundsInViewport(element) {
      const vp = window.getViewport ? window.getViewport() : this.svg;
      try {
        const box = element.getBBox();
        const matrix = vp.getScreenCTM().inverse().multiply(element.getScreenCTM());
        const corners = [
          [box.x, box.y], [box.x + box.width, box.y],
          [box.x, box.y + box.height], [box.x + box.width, box.y + box.height]
        ].map(([x, y]) => {
          const point = this.svg.createSVGPoint();
          point.x = x;
          point.y = y;
          return point.matrixTransform(matrix);
        });
        const left = Math.min(...corners.map(point => point.x));
        const top = Math.min(...corners.map(point => point.y));
        const right = Math.max(...corners.map(point => point.x));
        const bottom = Math.max(...corners.map(point => point.y));
        return { left, top, right, bottom, width: right - left, height: bottom - top };
      } catch (error) {
        return null;
      }
    }

    _restoreTraceBindingLayer() {
      const state = this._traceBindingLayerState;
      this._traceBindingLayerState = null;
      if (!state?.element?.isConnected || !state?.parent?.isConnected) return;
      if (state.element.parentNode !== state.parent) return;
      const before = state.nextSibling?.parentNode === state.parent ? state.nextSibling : null;
      state.parent.insertBefore(state.element, before);
    }

    _placeTraceBindingLine(connector, element, viewport) {
      const sceneRoot = element.closest?.('.asm-trace-root, #asm-trace-root') || viewport;
      let selectedLayer = element;
      while (selectedLayer.parentNode && selectedLayer.parentNode !== sceneRoot) {
        selectedLayer = selectedLayer.parentNode;
      }
      const parent = selectedLayer.parentNode === sceneRoot ? sceneRoot : viewport;
      const underlay = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      underlay.id = 'trace-binding-preview-underlay';
      underlay.setAttribute('pointer-events', 'none');
      if (parent !== viewport) {
        try {
          const matrix = parent.getScreenCTM().inverse().multiply(viewport.getScreenCTM());
          const convert = (x, y) => {
            const point = this.svg.createSVGPoint();
            point.x = Number(x) || 0;
            point.y = Number(y) || 0;
            return point.matrixTransform(matrix);
          };
          const start = convert(connector.getAttribute('x1'), connector.getAttribute('y1'));
          const end = convert(connector.getAttribute('x2'), connector.getAttribute('y2'));
          connector.setAttribute('x1', start.x);
          connector.setAttribute('y1', start.y);
          connector.setAttribute('x2', end.x);
          connector.setAttribute('y2', end.y);
        } catch (error) {
          // Keep viewport coordinates if the browser cannot provide an SVG transform matrix.
        }
      }
      underlay.appendChild(connector);
      if (selectedLayer.parentNode === parent) {
        this._traceBindingLayerState = {
          element: selectedLayer,
          parent,
          nextSibling: selectedLayer.nextSibling
        };
        parent.appendChild(underlay);
        parent.appendChild(selectedLayer);
      } else {
        parent.appendChild(underlay);
      }
    }

    _anchorFromBounds(bounds, anchor = 'center') {
      const name = String(anchor || 'center').toLowerCase();
      let x = (bounds.left + bounds.right) / 2;
      let y = (bounds.top + bounds.bottom) / 2;
      if (name.includes('left')) x = bounds.left;
      if (name.includes('right')) x = bounds.right;
      if (name.includes('top')) y = bounds.top;
      if (name.includes('bottom')) y = bounds.bottom;
      return { x, y };
    }

    _drawTraceSelectionOverlay(element) {
      const bounds = this._elementBoundsInViewport(element);
      if (!bounds) return;
      const vp = window.getViewport ? window.getViewport() : this.svg;
      const s = window.getScale ? window.getScale() : 1;
      const key = element.dataset.traceObjectKey;
      const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      overlay.id = 'selection-overlay';
      overlay.setAttribute('class', 'trace-selection-overlay');
      overlay.setAttribute('style', 'pointer-events:visiblePainted');

      const box = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      box.setAttribute('x', bounds.left);
      box.setAttribute('y', bounds.top);
      box.setAttribute('width', Math.max(1, bounds.width));
      box.setAttribute('height', Math.max(1, bounds.height));
      box.setAttribute('fill', 'none');
      box.setAttribute('stroke', '#3d85c6');
      box.setAttribute('stroke-width', 2 / s);
      box.setAttribute('pointer-events', 'none');
      overlay.appendChild(box);

      const binding = window.ASMTraceStudio?.getBinding?.(key);
      if (element.dataset.traceMovable !== '1' && !binding?.semanticText) {
        vp.appendChild(overlay);
        return;
      }

      const top = this._anchorFromBounds(bounds, 'top');
      const handleY = bounds.top - 28 / s;
      const boundTarget = binding?.targetKey
        ? window.ASMTraceRenderers?.currentAnchorForKey?.(
          binding.targetKey,
          binding.targetAnchor || 'center',
          true
        )
        : null;
      const sourceAnchor = binding?.semanticText ? 'center' : (binding?.sourceAnchor || 'top');
      const sourcePoint = binding
        ? this._anchorFromBounds(bounds, sourceAnchor)
        : top;
      const handlePoint = boundTarget || { x: top.x, y: handleY };
      const connector = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      connector.id = 'trace-binding-preview-line';
      connector.setAttribute('x1', sourcePoint.x);
      connector.setAttribute('y1', sourcePoint.y);
      connector.setAttribute('x2', handlePoint.x);
      connector.setAttribute('y2', handlePoint.y);
      connector.setAttribute('stroke', boundTarget ? '#1d8f83' : '#3d85c6');
      connector.setAttribute('stroke-width', 2.4 / s);
      connector.setAttribute('stroke-linecap', 'round');
      connector.setAttribute('pointer-events', 'none');
      this._placeTraceBindingLine(connector, element, vp);

      const handle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      handle.setAttribute('cx', handlePoint.x);
      handle.setAttribute('cy', handlePoint.y);
      handle.setAttribute('r', 6.5 / s);
      handle.setAttribute('fill', boundTarget ? '#1d8f83' : '#3d85c6');
      handle.setAttribute('stroke', '#ffffff');
      handle.setAttribute('stroke-width', 1.8 / s);
      handle.setAttribute('style', 'pointer-events:all;cursor:crosshair');
      handle.dataset.traceBindingHandle = '1';
      handle.dataset.traceSourceAnchor = binding?.semanticText ? 'center' : 'top';
      handle.dataset.traceSourceKey = key;
      handle.addEventListener('pointerdown', event => {
        this._startTraceBinding(event, key, binding?.semanticText ? 'center' : 'top');
      });
      overlay.appendChild(handle);

      vp.appendChild(overlay);
    }

    _collectTraceAnchors(sourceKey) {
      this._anchors = [];
      const sourceElement = this.selected;
      const anchorNames = ['center', 'top', 'bottom', 'left', 'right', 'top left', 'top right', 'bottom left', 'bottom right'];
      const traceElements = new Map(Array.from(this.svg.querySelectorAll('[data-trace-object-key]'))
        .map(element => [element.dataset.traceObjectKey, element]));
      (window.ASMTraceRenderers?.currentObjectKeys?.() || []).forEach(key => {
        if (key === sourceKey || key.endsWith(':label') || key.endsWith(':index')) return;
        const targetElement = traceElements.get(key);
        if (sourceElement && targetElement && sourceElement.contains(targetElement)) return;
        const actualBounds = targetElement ? this._elementBoundsInViewport(targetElement) : null;
        const placement = actualBounds ? null : window.ASMTraceRenderers?.currentPlacement?.(key, true);
        if (!actualBounds && !placement) return;
        const bounds = actualBounds || {
          left: placement.x, top: placement.y,
          right: placement.x + placement.width,
          bottom: placement.y + placement.height
        };
        anchorNames.forEach(anchor => {
          const point = this._anchorFromBounds(bounds, anchor);
          this._anchors.push({ ...point, key, anchor, spec: { key, anchor } });
        });
      });
    }

    _moveTraceBinding(evt) {
      evt.preventDefault();
      evt.stopPropagation();
      const vp = window.getViewport ? window.getViewport() : this.svg;
      const point = this.svg.createSVGPoint();
      point.x = evt.clientX;
      point.y = evt.clientY;
      let cursor = point;
      try { cursor = point.matrixTransform(vp.getScreenCTM().inverse()); } catch {}
      this._bindingMoved = this._bindingMoved
        || Math.hypot(evt.clientX - this._bindingDown.x, evt.clientY - this._bindingDown.y) > 3;
      const s = window.getScale ? window.getScale() : 1;
      let best = null;
      let distance = 15 / s;
      if (!evt.ctrlKey) {
        const candidate = document.elementsFromPoint(evt.clientX, evt.clientY)
          .map(hit => hit?.closest?.('.asm-trace-selectable[data-trace-object-key]'))
          .find(element => {
            const key = element?.dataset?.traceObjectKey || '';
            return element
              && this.svg.contains(element)
              && key !== this._bindingSourceKey
              && !key.endsWith(':label')
              && !key.endsWith(':index')
              && !element.closest('#selection-overlay');
          }) || null;
        const hoveredKey = candidate?.dataset.traceObjectKey || null;
        if (hoveredKey !== this._bindingHoverKey) {
          this._bindingHoverKey = hoveredKey;
          if (hoveredKey) this._showAnchors(hoveredKey);
          else this._hideAnchors();
        }
        if (hoveredKey) distance = Infinity;
        (this._anchors || []).filter(anchor => anchor.key === hoveredKey).forEach(anchor => {
          const next = Math.hypot(cursor.x - anchor.x, cursor.y - anchor.y);
          if (next < distance) {
            distance = next;
            best = anchor;
          }
        });
      } else {
        this._bindingHoverKey = null;
        this._hideAnchors();
      }
      this._bindingSnapped = best;
      this._highlightAnchor(best);
      const line = this.svg.querySelector('#trace-binding-preview-line');
      const handle = this.svg.querySelector('[data-trace-binding-handle]');
      const endpoint = best || cursor;
      if (line) {
        let lineEndpoint = endpoint;
        const lineSpace = line.parentNode;
        if (lineSpace && lineSpace !== vp) {
          try {
            const matrix = lineSpace.getScreenCTM().inverse().multiply(vp.getScreenCTM());
            const converted = this.svg.createSVGPoint();
            converted.x = endpoint.x;
            converted.y = endpoint.y;
            lineEndpoint = converted.matrixTransform(matrix);
          } catch (error) {
            // Both points remain in viewport coordinates when SVG matrices are unavailable.
          }
        }
        line.setAttribute('x2', lineEndpoint.x);
        line.setAttribute('y2', lineEndpoint.y);
        line.setAttribute('stroke', best ? '#1d8f83' : '#3d85c6');
      }
      if (handle) {
        handle.setAttribute('cx', endpoint.x);
        handle.setAttribute('cy', endpoint.y);
        handle.setAttribute('fill', best ? '#1d8f83' : '#3d85c6');
      }
    }

    _prepareTraceAlignment(element) {
      this._traceInitialBounds = this._elementBoundsInViewport(element);
      this._traceAlignmentTargets = Array.from(this.svg.querySelectorAll('.asm-trace-selectable[data-trace-object-key]'))
        .filter(target => target !== element && !element.contains(target) && !target.contains(element))
        .map(target => this._elementBoundsInViewport(target))
        .filter(Boolean);
    }

    _snapTraceDrag(dx, dy) {
      const initial = this._traceInitialBounds;
      if (!initial) return { x: dx, y: dy };
      const s = window.getScale ? window.getScale() : 1;
      const threshold = 7 / s;
      const movingX = [initial.left + dx, (initial.left + initial.right) / 2 + dx, initial.right + dx];
      const movingY = [initial.top + dy, (initial.top + initial.bottom) / 2 + dy, initial.bottom + dy];
      let bestX = null;
      let bestY = null;
      (this._traceAlignmentTargets || []).forEach(target => {
        const xs = [target.left, (target.left + target.right) / 2, target.right];
        const ys = [target.top, (target.top + target.bottom) / 2, target.bottom];
        movingX.forEach(value => xs.forEach(candidate => {
          const distance = Math.abs(candidate - value);
          if (distance <= threshold && (!bestX || distance < bestX.distance)) {
            bestX = { distance, correction: candidate - value, guide: candidate };
          }
        }));
        movingY.forEach(value => ys.forEach(candidate => {
          const distance = Math.abs(candidate - value);
          if (distance <= threshold && (!bestY || distance < bestY.distance)) {
            bestY = { distance, correction: candidate - value, guide: candidate };
          }
        }));
      });
      this._showAlignmentGuides(bestX?.guide, bestY?.guide);
      return { x: dx + (bestX?.correction || 0), y: dy + (bestY?.correction || 0) };
    }

    _showAlignmentGuides(x, y) {
      this.svg.querySelector('#trace-alignment-guides')?.remove();
      if (x == null && y == null) return;
      const vp = window.getViewport ? window.getViewport() : this.svg;
      const bounds = window.ASMTraceRenderers?.currentBounds?.() || { left: -1000, top: -1000, right: 3000, bottom: 2000 };
      const s = window.getScale ? window.getScale() : 1;
      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.id = 'trace-alignment-guides';
      group.setAttribute('pointer-events', 'none');
      if (x != null) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x); line.setAttribute('x2', x);
        line.setAttribute('y1', bounds.top - 80); line.setAttribute('y2', bounds.bottom + 80);
        line.setAttribute('stroke', '#e34f7a'); line.setAttribute('stroke-width', 1 / s);
        group.appendChild(line);
      }
      if (y != null) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('y1', y); line.setAttribute('y2', y);
        line.setAttribute('x1', bounds.left - 80); line.setAttribute('x2', bounds.right + 80);
        line.setAttribute('stroke', '#e34f7a'); line.setAttribute('stroke-width', 1 / s);
        group.appendChild(line);
      }
      vp.appendChild(group);
    }

    _collectAnchors() {
      this._anchors = [];
      if (!this.selected) return;

      const currentId = this.selected.getAttribute('id');
      const currentArrowKey = this.selected.getAttribute('data-arrow-key');

      // 找出畫面上所有符合條件的物件，排除當前選取的箭頭以及其他線段
      const objects = Array.from(this.svg.querySelectorAll('.draggable-object')).filter(el => {
        const id = el.getAttribute('id');
        const arrowKey = el.getAttribute('data-arrow-key');
        if (el === this.selected) return false;
        if (id && id === currentId) return false;
        if (arrowKey && arrowKey === currentArrowKey) return false;
        if (el.tagName.toLowerCase() === 'line') return false;
        return true;
      });

      const anchorsToTest = ['center', 'top', 'bottom', 'left', 'right', 'top left', 'top right', 'bottom left', 'bottom right'];

      for (const el of objects) {
        const refId = el.getAttribute('id');
        if (!refId) continue;

        // A. 收集物件本身的 5 個錨點
        for (const anchor of anchorsToTest) {
          try {
            const pos = window.resolvePos({ type: 'rel', ref: refId, anchor });
            if (pos && !isNaN(pos.x) && !isNaN(pos.y)) {
              this._anchors.push({
                x: pos.x,
                y: pos.y,
                spec: { type: 'rel', ref: refId, anchor }
              });
            }
          } catch (e) {}
        }

        // B. 收集物件底下的子格子的錨點
        const cells = Array.from(el.querySelectorAll('g[id^="cell-"]'));
        for (const cell of cells) {
          const cellId = cell.getAttribute('id');
          if (!cellId) continue;

          const prefix = "cell-" + refId + "-";
          if (!cellId.startsWith(prefix)) continue;
          if (cellId.endsWith('-index')) continue;

          const remaining = cellId.substring(prefix.length);
          let spec = null;
          if (remaining.includes('-')) {
            const parts = remaining.split('-');
            const row = parseInt(parts[0], 10);
            const col = parseInt(parts[1], 10);
            if (!isNaN(row) && !isNaN(col)) {
              spec = { type: 'rel', ref: refId, row, col };
            }
          } else {
            const index = parseInt(remaining, 10);
            if (!isNaN(index)) {
              spec = { type: 'rel', ref: refId, index };
            }
          }

          if (spec) {
            for (const anchor of anchorsToTest) {
              try {
                const cellSpec = { ...spec, anchor };
                const pos = window.resolvePos(cellSpec);
                if (pos && !isNaN(pos.x) && !isNaN(pos.y)) {
                  this._anchors.push({
                    x: pos.x,
                    y: pos.y,
                    spec: cellSpec
                  });
                }
              } catch (e) {}
            }
          }
        }
      }
    }

    _showAnchors(targetKey = null) {
      let overlay = this.svg.querySelector('#anchor-overlay');
      if (overlay) overlay.remove();

      const vp = window.getViewport ? window.getViewport() : this.svg;
      overlay = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      overlay.setAttribute('id', 'anchor-overlay');
      overlay.setAttribute('style', 'pointer-events: none;');

      const s = window.getScale ? window.getScale() : 1;
      const dotRadius = 4.25 / s;
      const strokeW = 1.25 / s;

      this._anchors.forEach((anchor, idx) => {
        if (targetKey && anchor.key !== targetKey) return;
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', anchor.x);
        circle.setAttribute('cy', anchor.y);
        circle.setAttribute('r', dotRadius);
        circle.setAttribute('fill', '#ffffff');
        circle.setAttribute('stroke', '#3d85c6');
        circle.setAttribute('stroke-width', strokeW);
        circle.setAttribute('id', `anchor-dot-${idx}`);
        overlay.appendChild(circle);
      });

      vp.appendChild(overlay);
    }

    _highlightAnchor(snappedAnchor) {
      this._anchors.forEach((anchor, idx) => {
        const circle = this.svg.querySelector(`#anchor-dot-${idx}`);
        if (!circle) return;

        const s = window.getScale ? window.getScale() : 1;
        if (snappedAnchor && anchor === snappedAnchor) {
          circle.setAttribute('r', 7 / s);
          circle.setAttribute('fill', '#ff5722');
          circle.setAttribute('stroke', '#ffffff');
          circle.setAttribute('stroke-width', 1.5 / s);
        } else {
          circle.setAttribute('r', 4.25 / s);
          circle.setAttribute('fill', '#ffffff');
          circle.setAttribute('stroke', '#3d85c6');
          circle.setAttribute('stroke-width', 1.25 / s);
        }
      });
    }

    _hideAnchors() {
      let overlay = this.svg.querySelector('#anchor-overlay');
      if (overlay) overlay.remove();
    }
}

window.CanvasInteractionManager = CanvasInteractionManager;
const interactionSvg = document.getElementById('arraySvg');
if (interactionSvg) {
  window._canvasInteraction ||= new CanvasInteractionManager(interactionSvg);
}
