(function () {
  const STORAGE_KEY = 'asm_reveal_fabric_deck_v5';
  const OLD_STORAGE_KEY = 'asm_reveal_fabric_deck_v4';
  const TOKEN_KEY = 'algo_jwt_token';
  const urlParams = new URLSearchParams(window.location.search);
  const deckUid = urlParams.get('deck');
  const shareToken = urlParams.get('share');
  const SLIDE_W = 1280;
  const SLIDE_H = 720;
  const FABRIC_BLEED = 180;
  const SNAP_THRESHOLD = 8;
  const EDIT_SLIDE_BASE_SCALE = 0.88;
  const SLIDE_ZOOM_MIN = 0.5;
  const SLIDE_ZOOM_MAX = 2;
  const SLIDE_ZOOM_STEP = 0.1;
  const DEFAULT_FONT_FAMILY = 'Arial';
  const DEFAULT_STRUCTURE_FRAME_BACKGROUND = 'rgba(209, 230, 172, 0.5)';
  const fabricCanvases = new Map();
  const slidePositions = new Map();
  const MAX_HISTORY = 80;
  const CODE_SCROLLBAR_HIT_GUTTER = 5;
  const FABRIC_LAYER_INDEX = 1000;
  const WIDGET_LAYER_BELOW_BASE = 100;
  const WIDGET_LAYER_ABOVE_BASE = 2000;
  const STACK_LAYER_BASE = 100;
  const STACK_LAYER_STEP = 10;
  const FABRIC_CUSTOM_PROPS = [
    'transitionId', 'fragmentEnabled', 'fragmentStyle', 'fragmentIndex', 'fragmentProxyId', 'cornerRadius', 'layerIndex',
    'styles', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'underline', 'linethrough', 'fill', 'textBackgroundColor',
    'asmShapeType', 'arrowHeadSize', 'arrowHeadStyle',
    'ttsObjectId', 'ttsScript', 'ttsScriptMode', 'ttsCarrier', 'ttsMuted', 'ttsMutedOrderIndex'
  ];
  const FRAGMENT_STYLE_CLASSES = ['fade-out', 'fade-up', 'fade-down', 'fade-left', 'fade-right', 'grow', 'shrink', 'zoom-in', 'current-visible'];
  const STRUCTURE_MODES = ['normal', 'matrix', 'binary_tree', 'heap', 'segment_tree', 'BIT', 'disk', 'stack', 'queue'];

  function randomId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  const defaultDeck = {
    ttsSettings: {
      rate: 1.2,
      volume: 0.3
    },
    groups: [
      {
        id: randomId(),
        slides: [
          {
            id: randomId(),
            canvas: {
              objects: [
                {
                  type: 'i-text',
                  left: 116,
                  top: 112,
                  width: 720,
                  text: 'AlgoShowMaker Slides',
                  fill: '#1f282d',
                  fontSize: 48,
                  fontFamily: DEFAULT_FONT_FAMILY,
                  fontWeight: 'bold',
                  styles: {}
                },
                {
                  type: 'i-text',
                  left: 126,
                  top: 260,
                  width: 700,
                  text: 'Edit directly on the Reveal.js slide. Fabric.js handles object selection, resize, rotate, text, shapes, and pasted images.',
                  fill: '#49545a',
                  fontSize: 28,
                  fontFamily: DEFAULT_FONT_FAMILY,
                  styles: {}
                },
                {
                  type: 'rect',
                  left: 864,
                  top: 156,
                  width: 230,
                  height: 230,
                  fill: '#dff4ef',
                  stroke: '#1d8f83',
                  strokeWidth: 1,
                  rx: 0,
                  ry: 0,
                  angle: 8
                }
              ]
            }
          }
        ]
      },
      {
        id: randomId(),
        slides: [
          {
            id: randomId(),
            canvas: {
              objects: [
                {
                  type: 'i-text',
                  left: 130,
                  top: 112,
                  width: 680,
                  text: 'Use the left tools to add text, circles, and triangles',
                  fill: '#1f282d',
                  fontSize: 44,
                  fontFamily: DEFAULT_FONT_FAMILY,
                  fontWeight: 'bold',
                  styles: {}
                },
                {
                  type: 'circle',
                  left: 166,
                  top: 282,
                  radius: 82,
                  fill: '#eee7fb',
                  stroke: '#875bc7',
                  strokeWidth: 1
                },
                {
                  type: 'triangle',
                  left: 444,
                  top: 276,
                  width: 190,
                  height: 170,
                  fill: '#fff2d8',
                  stroke: '#b87927',
                  strokeWidth: 1,
                  angle: -8
                }
              ]
            }
          }
        ]
      }
    ]
  };

  let deck = loadDeck();
  let reveal = null;
  let revealReady = false;
  let currentH = 0;
  let currentV = 0;
  let pendingTool = null;
  let slideViewportZoom = 1;
  let suppressCanvasSave = false;
  let suppressHistory = false;
  let activeColorTarget = 'text';
  let iroPicker = null;
  let suppressIroChange = false;
  let pendingColorHistory = false;
  let pendingHistoryTimer = null;
  let textSelection = null;
  let selectedWidgetId = null;
  let overviewSelectedSlideId = null;
  let overviewSelectedSlideIds = new Set();
  let overviewSelectionAnchorId = null;
  let draggedSlideId = null;
  let pointerDrag = null;
  let dropPreview = null;
  let overviewDropLine = null;
  let overviewDropPlaceholder = null;
  let suppressOverviewClick = false;
  let overviewPanX = 0;
  let overviewPanY = 0;
  let suppressOverviewScrollbar = false;
  let customOverviewOpen = false;
  let customOverviewDrag = null;
  let suppressCustomOverviewClick = false;
  let customOverviewRightMouseDown = false;
  let slideClipboard = [];
  let slideMutationInFlight = false;
  const slidePageEnteringIds = new Set();
  const overviewPageEnteringIds = new Set();
  let objectClipboard = { fabric: [], widgets: [], cut: false };
  let history = [];
  let historyIndex = -1;
  let editingAlgorithmSlideId = null;
  let modeLayoutAnimationTimer = null;
  let activeFabricAutoAnimation = null;
  let activeCodeAutoAnimation = null;
  let activeStructureAutoAnimation = null;
  let fabricBuildPromise = Promise.resolve();
  let fabricBuildGeneration = 0;
  let cloudDeckReady = false;
  let cloudSaveTimer = null;
  let cloudSaveInFlight = false;
  let cloudSaveQueued = false;
  let cloudDeckTitle = '未命名投影片';
  let sharedAccess = null;
  let currentShareSettings = { mode: 'private', view_token: null, edit_token: null };
  let activeStructureContext = null;
  let selectedStructureCell = null;
  let activeStructureInlineEditor = null;
  let structureCellClickTimer = null;
  let expandedTtsObjectKey = null;
  let ttsPointerSort = null;
  let suppressTtsOrderClick = false;
  let ttsEditorSyncFrame = null;
  let ttsVoiceLoading = false;
  const ttsPlayback = {
    active: false,
    paused: false,
    session: 0,
    slideId: null,
    segments: [],
    segmentIndex: 0,
    utterance: null,
    sleepTimer: null,
    sleepEndsAt: 0,
    sleepRemaining: 0,
    sourceText: '',
    highlightStart: -1,
    highlightEnd: -1,
    fabricHighlights: [],
    widgetHighlights: [],
    currentObjectKey: null
  };

  const slidesRoot = document.getElementById('slidesRoot');
  const overviewHScrollbar = document.getElementById('overviewHScrollbar');
  const overviewVScrollbar = document.getElementById('overviewVScrollbar');
  const overviewHScrollContent = document.getElementById('overviewHScrollContent');
  const overviewVScrollContent = document.getElementById('overviewVScrollContent');
  const overviewEventShield = document.getElementById('overviewEventShield');
  const customOverview = document.getElementById('customOverview');
  const customOverviewViewport = document.getElementById('customOverviewViewport');
  const customOverviewBoard = document.getElementById('customOverviewBoard');
  const exportDeckBtn = document.getElementById('exportDeckBtn');
  const importDeckBtn = document.getElementById('importDeckBtn');
  const importDeckInput = document.getElementById('importDeckInput');
  const shareDeckBtn = document.getElementById('shareDeckBtn');
  const sharedAccessBadge = document.getElementById('sharedAccessBadge');
  const shareDialog = document.getElementById('shareDialog');
  const shareForm = document.getElementById('shareForm');
  const closeShareDialogBtn = document.getElementById('closeShareDialogBtn');
  const cancelShareDialogBtn = document.getElementById('cancelShareDialogBtn');
  const saveShareSettingsBtn = document.getElementById('saveShareSettingsBtn');
  const shareLinks = document.getElementById('shareLinks');
  const editShareLinkGroup = document.getElementById('editShareLinkGroup');
  const viewShareUrl = document.getElementById('viewShareUrl');
  const editShareUrl = document.getElementById('editShareUrl');
  const copyViewShareUrlBtn = document.getElementById('copyViewShareUrlBtn');
  const copyEditShareUrlBtn = document.getElementById('copyEditShareUrlBtn');
  const shareDialogStatus = document.getElementById('shareDialogStatus');
  const cloudSaveStatus = document.getElementById('cloudSaveStatus');
  const slideZoomOutBtn = document.getElementById('slideZoomOutBtn');
  const slideZoomInBtn = document.getElementById('slideZoomInBtn');
  const slideZoomResetBtn = document.getElementById('slideZoomResetBtn');
  const slideZoomValue = document.getElementById('slideZoomValue');
  const objectToolbar = document.getElementById('objectToolbar');
  const alignmentToolbar = document.getElementById('alignmentToolbar');
  const snapGuideLayer = document.getElementById('snapGuideLayer');
  const structureContextMenu = document.getElementById('structureContextMenu');
  const ttsScriptPlaybackText = document.getElementById('ttsScriptPlaybackText');
  const ttsScriptSource = document.getElementById('ttsScriptSource');
  const ttsObjectOrderList = document.getElementById('ttsObjectOrderList');
  const ttsAddCarrierBtn = document.getElementById('ttsAddCarrierBtn');
  const ttsTransport = document.getElementById('ttsTransport');
  const ttsPanelToggleBtn = document.getElementById('ttsPanelToggleBtn');
  const ttsPanelCloseBtn = document.getElementById('ttsPanelCloseBtn');
  const ttsObjectBtn = document.getElementById('ttsObjectBtn');
  const ttsObjectEditorPopover = document.getElementById('ttsObjectEditorPopover');
  const ttsObjectEditorTitle = document.getElementById('ttsObjectEditorTitle');
  const ttsObjectEditorMode = document.getElementById('ttsObjectEditorMode');
  const ttsObjectScriptInput = document.getElementById('ttsObjectScriptInput');
  const ttsObjectMuteBtn = document.getElementById('ttsObjectMuteBtn');
  const ttsObjectResetBtn = document.getElementById('ttsObjectResetBtn');
  const ttsObjectEditorCloseBtn = document.getElementById('ttsObjectEditorCloseBtn');
  const ttsPlayPauseBtn = document.getElementById('ttsPlayPauseBtn');
  const ttsStopBtn = document.getElementById('ttsStopBtn');
  const ttsPlaybackStatus = document.getElementById('ttsPlaybackStatus');
  const ttsRateInput = document.getElementById('ttsRateInput');
  const ttsRateValue = document.getElementById('ttsRateValue');
  const ttsVolumeInput = document.getElementById('ttsVolumeInput');
  const ttsVolumeValue = document.getElementById('ttsVolumeValue');
  const fontFamilySelect = document.getElementById('fontFamilySelect');
  const fontSizeInput = document.getElementById('fontSizeInput');
  const boldBtn = document.getElementById('boldBtn');
  const italicBtn = document.getElementById('italicBtn');
  const underlineBtn = document.getElementById('underlineBtn');
  const strikeBtn = document.getElementById('strikeBtn');
  const alignCycleBtn = document.getElementById('alignCycleBtn');
  const listStyleBtn = document.getElementById('listStyleBtn');
  const textColorBtn = document.getElementById('textColorBtn');
  const bgColorBtn = document.getElementById('bgColorBtn');
  const shapeStrokeBtn = document.getElementById('shapeStrokeBtn');
  const shapeColorBtn = document.getElementById('shapeColorBtn');
  const iroPopup = document.getElementById('iroPopup');
  const shapeStyleControls = document.getElementById('shapeStyleControls');
  const shapeStrokeWidthInput = document.getElementById('shapeStrokeWidthInput');
  const shapeStrokeWidthValue = document.getElementById('shapeStrokeWidthValue');
  const shapeCornerRadiusControls = document.getElementById('shapeCornerRadiusControls');
  const shapeCornerRadiusInput = document.getElementById('shapeCornerRadiusInput');
  const shapeCornerRadiusValue = document.getElementById('shapeCornerRadiusValue');
  const shapeArrowControls = document.getElementById('shapeArrowControls');
  const shapeArrowSizeInput = document.getElementById('shapeArrowSizeInput');
  const shapeArrowSizeValue = document.getElementById('shapeArrowSizeValue');
  const shapeArrowStyleSelect = document.getElementById('shapeArrowStyleSelect');
  if (iroPopup && iroPopup.parentElement !== document.body) document.body.appendChild(iroPopup);
  const shapeMenu = document.getElementById('shapeMenu');
  const shapeMenuBtn = document.getElementById('shapeMenuBtn');
  const structureMenu = document.getElementById('structureMenu');
  const structureMenuBtn = document.getElementById('structureMenuBtn');
  const editorChrome = document.getElementById('editorChrome');
  const overviewChrome = document.getElementById('overviewChrome');
  const defaultToolPanel = document.getElementById('defaultToolPanel');
  const overviewSidebarPanel = document.getElementById('overviewSidebarPanel');
  const latexEditorPanel = document.getElementById('latexEditorPanel');
  const codeEditorPanel = document.getElementById('codeEditorPanel');
  const structureEditorPanel = document.getElementById('structureEditorPanel');
  const latexEditorInput = document.getElementById('latexEditorInput');
  const openCodeEditorBtn = document.getElementById('openCodeEditorBtn');
  const codeEditorModal = document.getElementById('codeEditorModal');
  const codeAceEditorEl = document.getElementById('codeAceEditor');
  const codeEditorModalStatus = document.getElementById('codeEditorModalStatus');
  const closeCodeEditorModalBtn = document.getElementById('closeCodeEditorModalBtn');
  const saveCodeEditorModalBtn = document.getElementById('saveCodeEditorModalBtn');
  const codeLanguageSelect = document.getElementById('codeLanguageSelect');
  const latexFontSizeInput = document.getElementById('latexFontSizeInput');
  const codeFontSizeInput = document.getElementById('codeFontSizeInput');
  const codeFocusLinesInput = document.getElementById('codeFocusLinesInput');
  const codeShowLineNumbersInput = document.getElementById('codeShowLineNumbersInput');
  const exitStructureEditorBtn = document.getElementById('exitStructureEditorBtn');
  const structureModeSelect = document.getElementById('structureModeSelect');
  const structureTreeControls = document.getElementById('structureTreeControls');
  const structureTreeLayoutSelect = document.getElementById('structureTreeLayoutSelect');
  const structureTreeDirectionSelect = document.getElementById('structureTreeDirectionSelect');
  const structureTreeArrowColorInput = document.getElementById('structureTreeArrowColorInput');
  const structureIndexModeSelect = document.getElementById('structureIndexModeSelect');
  const structureIndexBaseSelect = document.getElementById('structureIndexBaseSelect');
  const structureItemsPerRowInput = document.getElementById('structureItemsPerRowInput');
  const structureGapInput = document.getElementById('structureGapInput');
  const structureCellSizeInput = document.getElementById('structureCellSizeInput');
  const structureFontSizeInput = document.getElementById('structureFontSizeInput');
  const structureBaseFillInput = document.getElementById('structureBaseFillInput');
  const structureBorderColorInput = document.getElementById('structureBorderColorInput');
  const structureTextColorInput = document.getElementById('structureTextColorInput');
  const structureLineColorInput = document.getElementById('structureLineColorInput');
  const structureHighlightColorInput = document.getElementById('structureHighlightColorInput');
  const structureHighlightIndicesInput = document.getElementById('structureHighlightIndicesInput');
  const structureFocusColorInput = document.getElementById('structureFocusColorInput');
  const structureFocusIndicesInput = document.getElementById('structureFocusIndicesInput');
  const structurePointColorInput = document.getElementById('structurePointColorInput');
  const structurePointIndicesInput = document.getElementById('structurePointIndicesInput');
  const structureMarkColorInput = document.getElementById('structureMarkColorInput');
  const structureMarkIndicesInput = document.getElementById('structureMarkIndicesInput');
  const structureBackgroundColorInput = document.getElementById('structureBackgroundColorInput');
  const structureBackgroundIndicesInput = document.getElementById('structureBackgroundIndicesInput');
  const structureFrameBackgroundControls = document.getElementById('structureFrameBackgroundControls');
  const structureFrameBackgroundEnabledInput = document.getElementById('structureFrameBackgroundEnabledInput');
  const structureFrameBackgroundColorInput = document.getElementById('structureFrameBackgroundColorInput');
  const structureColorBindings = [
    { target: 'structure-tree-arrow', button: structureTreeArrowColorInput, field: 'treeArrowColor' },
    { target: 'structure-frame-background', button: structureFrameBackgroundColorInput, field: 'frameBackgroundColor' },
    { target: 'structure-highlight', button: structureHighlightColorInput, field: 'highlightColor', style: 'highlight' },
    { target: 'structure-focus', button: structureFocusColorInput, field: 'focusColor', style: 'focus' },
    { target: 'structure-point', button: structurePointColorInput, field: 'pointColor', style: 'point' },
    { target: 'structure-mark', button: structureMarkColorInput, field: 'markColor', style: 'mark' },
    { target: 'structure-background', button: structureBackgroundColorInput, field: 'backgroundColor', style: 'background' }
  ];
  const animationEditorPanel = document.getElementById('animationEditorPanel');
  const layerToTopBtn = document.getElementById('layerToTopBtn');
  const layerUpBtn = document.getElementById('layerUpBtn');
  const layerDownBtn = document.getElementById('layerDownBtn');
  const layerToBottomBtn = document.getElementById('layerToBottomBtn');
  const shapeEditorControls = document.getElementById('shapeEditorControls');
  const shapeChoiceButtons = Array.from(document.querySelectorAll('[data-shape-choice]'));
  const transitionIdInput = document.getElementById('transitionIdInput');
  const fragmentEnabledInput = document.getElementById('fragmentEnabledInput');
  const fragmentStyleSelect = document.getElementById('fragmentStyleSelect');
  const fragmentIndexInput = document.getElementById('fragmentIndexInput');
  const algorithmEditSlideBtn = document.getElementById('algorithmEditSlideBtn');
  const algorithmEditorModal = document.getElementById('algorithmEditorModal');
  const algorithmEditorFrame = document.getElementById('algorithmEditorFrame');
  const algorithmEditorStatus = document.getElementById('algorithmEditorStatus');
  let aceCodeEditor = null;
  let editingCodeWidgetId = null;

  function f() {
    return window.fabric;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function createBlankSlide(title = 'New slide') {
    return {
      id: randomId(),
      ttsScript: '',
      ttsOrder: [],
      canvas: {
        objects: [
          {
            type: 'i-text',
            left: 120,
            top: 112,
            width: 600,
            text: title,
            fill: '#1f282d',
            fontSize: 44,
            fontFamily: DEFAULT_FONT_FAMILY,
            fontWeight: 'bold',
            styles: {}
          }
        ]
      }
    };
  }

  function createAlgorithmAnimationSlide() {
    return {
      id: randomId(),
      kind: 'algorithm-animation',
      ttsScript: '',
      ttsOrder: [],
      canvas: { objects: [] },
      widgets: [],
      animation: normalizeAlgorithmAnimation()
    };
  }

  function cloneSlideForPaste(slide) {
    const cloned = clone(slide);
    const canvas = normalizeCanvasJson(cloned.canvas);
    const ttsIdMap = new Map();
    canvas.objects = (canvas.objects || []).map(object => {
      const oldKey = `fabric:${object.ttsObjectId}`;
      const ttsObjectId = randomId();
      ttsIdMap.set(oldKey, `fabric:${ttsObjectId}`);
      return {
        ...object,
        fragmentProxyId: randomId(),
        ttsObjectId
      };
    });
    const widgets = normalizeWidgets(slide.widgets).map(widget => {
      const oldKey = `widget:${widget.id}`;
      const id = randomId();
      ttsIdMap.set(oldKey, `widget:${id}`);
      return {
        ...clone(widget),
        id
      };
    });
    return {
      ...cloned,
      id: randomId(),
      canvas,
      widgets,
      ttsOrder: (Array.isArray(slide.ttsOrder) ? slide.ttsOrder : [])
        .map(key => ttsIdMap.get(key))
        .filter(Boolean)
    };
  }

  function normalizeTtsObjectFields(source = {}) {
    const hasManualScript = source.ttsScriptMode === 'manual'
      || (typeof source.ttsScript === 'string' && source.ttsScript.length > 0);
    return {
      ttsScript: typeof source.ttsScript === 'string' ? source.ttsScript : '',
      ttsScriptMode: hasManualScript ? 'manual' : 'auto',
      ttsCarrier: source.ttsCarrier === true,
      ttsMuted: source.ttsMuted === true,
      ttsMutedOrderIndex: source.ttsMutedOrderIndex !== null
        && source.ttsMutedOrderIndex !== ''
        && Number.isInteger(Number(source.ttsMutedOrderIndex))
        ? Math.max(0, Number(source.ttsMutedOrderIndex))
        : null
    };
  }

  function normalizeTtsSettings(settings = {}) {
    const rate = Number(settings.rate);
    const volume = Number(settings.volume);
    return {
      rate: Math.min(2, Math.max(0.5, Number.isFinite(rate) ? rate : 1.2)),
      volume: Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 0.3))
    };
  }

  function normalizeDeck(raw) {
    if (raw && Array.isArray(raw.groups)) {
      raw.ttsSettings = normalizeTtsSettings(raw.ttsSettings);
      raw.groups = raw.groups
        .filter(group => group && Array.isArray(group.slides) && group.slides.length)
        .map(group => ({
          id: group.id || randomId(),
          slides: group.slides.map(normalizeSlide)
        }));
      return raw.groups.length ? raw : clone(defaultDeck);
    }

    if (raw && Array.isArray(raw.slides)) {
      return {
        ttsSettings: normalizeTtsSettings(raw.ttsSettings),
        groups: raw.slides.map(slide => ({
          id: randomId(),
          slides: [normalizeSlide(slide)]
        }))
      };
    }

    return clone(defaultDeck);
  }

  function loadDeck() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(OLD_STORAGE_KEY);
      if (saved) return normalizeDeck(JSON.parse(saved));
    } catch (err) {
      console.warn('Failed to load deck', err);
    }
    return normalizeDeck(clone(defaultDeck));
  }

  function saveDeck({ history: pushHistory = true, cloud = true } = {}) {
    const serializedDeck = JSON.stringify(deck);
    localStorage.setItem(STORAGE_KEY, serializedDeck);
    updateDiagnostics();
    if (pushHistory && !suppressHistory) pushHistorySnapshot(serializedDeck);
    if (cloud) scheduleCloudSave();
    if (ttsTransport?.dataset.expanded === 'true' && !ttsEditorSyncFrame) {
      ttsEditorSyncFrame = requestAnimationFrame(() => {
        ttsEditorSyncFrame = null;
        syncTtsEditor();
      });
    }
  }

  function authToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function setCloudStatus(state, text) {
    if (!cloudSaveStatus) return;
    cloudSaveStatus.dataset.state = state;
    const label = cloudSaveStatus.querySelector('.cloud-status-text');
    if (label) label.textContent = text;
  }

  function redirectToLogin() {
    const next = `${window.location.pathname}${window.location.search}`;
    window.location.replace(`/?next=${encodeURIComponent(next)}`);
  }

  function canSaveRemoteDeck() {
    return Boolean(deckUid || (shareToken && sharedAccess === 'edit'));
  }

  function remoteDeckEndpoint() {
    return shareToken
      ? `/api/shared-slides/${encodeURIComponent(shareToken)}`
      : `/api/slides/${encodeURIComponent(deckUid)}`;
  }

  function applySharedAccessUi() {
    if (!shareToken || !sharedAccess) return;
    const canEdit = sharedAccess === 'edit';
    document.body.classList.toggle('shared-view-only', !canEdit);
    document.body.classList.toggle('shared-edit-access', canEdit);
    if (!canEdit) document.body.classList.remove('asm-edit-mode');
    if (sharedAccessBadge) {
      sharedAccessBadge.hidden = false;
      sharedAccessBadge.textContent = canEdit ? '共享編輯模式' : '觀賞模式';
    }
  }

  async function loadCloudDeck() {
    if (!deckUid && !shareToken) {
      setCloudStatus('local', '本機草稿');
      return;
    }
    if (deckUid && !authToken()) {
      redirectToLogin();
      throw new Error('Authentication required');
    }

    setCloudStatus('loading', '正在載入...');
    const headers = deckUid ? { Authorization: `Bearer ${authToken()}` } : {};
    const response = await fetch(remoteDeckEndpoint(), { headers });
    const data = await response.json().catch(() => ({}));

    if (deckUid && (response.status === 401 || response.status === 403)) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem('algo_username');
      redirectToLogin();
      throw new Error('Authentication expired');
    }
    if (!response.ok) {
      setCloudStatus('error', data.error || '載入失敗');
      throw new Error(data.error || 'Failed to load deck');
    }

    deck = normalizeDeck(data.slide.deck);
    cloudDeckTitle = data.slide.title || '未命名投影片';
    sharedAccess = shareToken ? data.access : null;
    cloudDeckReady = true;
    document.title = `${cloudDeckTitle} - AlgoShowMaker`;
    if (shareDeckBtn && deckUid) shareDeckBtn.hidden = false;
    applySharedAccessUi();
    setCloudStatus('saved', sharedAccess === 'view' ? '僅供觀賞' : '已儲存');
  }

  function scheduleCloudSave() {
    if (!canSaveRemoteDeck() || !cloudDeckReady) return;
    setCloudStatus('pending', '尚未儲存');
    clearTimeout(cloudSaveTimer);
    cloudSaveTimer = setTimeout(syncDeckToCloud, 900);
  }

  async function syncDeckToCloud() {
    if (!canSaveRemoteDeck() || !cloudDeckReady) return;
    if (cloudSaveInFlight) {
      cloudSaveQueued = true;
      return;
    }

    cloudSaveInFlight = true;
    cloudSaveQueued = false;
    setCloudStatus('saving', '儲存中...');
    try {
      const coverThumbnail = window.AlgoDeckThumbnail
        ? await window.AlgoDeckThumbnail.create(deck)
        : '';
      const headers = { 'Content-Type': 'application/json' };
      if (deckUid) headers.Authorization = `Bearer ${authToken()}`;
      const response = await fetch(remoteDeckEndpoint(), {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          title: cloudDeckTitle,
          deck,
          cover_thumbnail: coverThumbnail
        })
      });
      const data = await response.json().catch(() => ({}));
      if (deckUid && (response.status === 401 || response.status === 403)) {
        cloudDeckReady = false;
        setCloudStatus('error', '登入已過期');
        return;
      }
      if (shareToken && response.status === 403) {
        cloudDeckReady = false;
        setCloudStatus('error', '編輯權限已關閉');
        return;
      }
      if (!response.ok) throw new Error(data.error || 'Failed to save deck');
      setCloudStatus('saved', '已儲存');
    } catch (err) {
      console.error('Failed to save cloud deck', err);
      setCloudStatus('error', '儲存失敗');
    } finally {
      cloudSaveInFlight = false;
      if (cloudSaveQueued) {
        cloudSaveQueued = false;
        syncDeckToCloud();
      }
    }
  }

  function setShareDialogStatus(text = '', isError = false) {
    if (!shareDialogStatus) return;
    shareDialogStatus.textContent = text;
    shareDialogStatus.classList.toggle('is-error', isError);
  }

  function sharedDeckUrl(token) {
    if (!token) return '';
    const url = new URL('/slides.html', window.location.origin);
    url.searchParams.set('share', token);
    return url.toString();
  }

  function renderShareSettings(settings) {
    currentShareSettings = {
      mode: settings?.mode || 'private',
      view_token: settings?.view_token || null,
      edit_token: settings?.edit_token || null
    };
    const selected = shareForm?.querySelector(`input[name="shareMode"][value="${currentShareSettings.mode}"]`);
    if (selected) selected.checked = true;

    const viewUrl = sharedDeckUrl(currentShareSettings.view_token);
    const editUrl = sharedDeckUrl(currentShareSettings.edit_token);
    if (viewShareUrl) viewShareUrl.value = viewUrl;
    if (editShareUrl) editShareUrl.value = editUrl;
    if (shareLinks) shareLinks.hidden = !viewUrl;
    if (editShareLinkGroup) editShareLinkGroup.hidden = !editUrl;
  }

  async function ownerShareRequest(method, body) {
    const response = await fetch(`/api/slides/${encodeURIComponent(deckUid)}/share`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken()}`
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem('algo_username');
      redirectToLogin();
      throw new Error('登入已過期');
    }
    if (!response.ok) throw new Error(data.error || '分享設定操作失敗');
    return data.share;
  }

  async function openShareDialog() {
    if (!deckUid || !shareDialog) return;
    shareDialog.showModal();
    setShareDialogStatus('正在讀取分享設定...');
    if (saveShareSettingsBtn) saveShareSettingsBtn.disabled = true;
    try {
      renderShareSettings(await ownerShareRequest('GET'));
      setShareDialogStatus();
    } catch (err) {
      setShareDialogStatus(err.message, true);
    } finally {
      if (saveShareSettingsBtn) saveShareSettingsBtn.disabled = false;
    }
  }

  function closeShareDialog() {
    if (shareDialog?.open) shareDialog.close();
  }

  function previewSelectedShareMode() {
    const mode = shareForm?.querySelector('input[name="shareMode"]:checked')?.value || 'private';
    if (mode === currentShareSettings.mode) {
      renderShareSettings(currentShareSettings);
      setShareDialogStatus();
      return;
    }
    if (shareLinks) shareLinks.hidden = true;
    setShareDialogStatus(mode === 'private'
      ? '套用後，現有分享連結會立即失效。'
      : '套用設定後會產生新的分享連結。');
  }

  async function copyShareUrl(input, button) {
    const value = input?.value;
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch (err) {
      input.focus();
      input.select();
      document.execCommand('copy');
    }
    const original = button.textContent;
    button.textContent = '已複製';
    setTimeout(() => {
      button.textContent = original;
    }, 1200);
  }

  async function saveShareSettings(event) {
    event.preventDefault();
    const mode = shareForm?.querySelector('input[name="shareMode"]:checked')?.value || 'private';
    if (saveShareSettingsBtn) saveShareSettingsBtn.disabled = true;
    setShareDialogStatus('正在套用設定...');
    try {
      renderShareSettings(await ownerShareRequest('PUT', { mode }));
      setShareDialogStatus(mode === 'private' ? '分享已關閉。' : '分享設定已更新。');
    } catch (err) {
      setShareDialogStatus(err.message, true);
    } finally {
      if (saveShareSettingsBtn) saveShareSettingsBtn.disabled = false;
    }
  }

  function exportDeckJson() {
    const payload = {
      format: 'AlgoShowMaker.slides',
      version: 'AV_V4.3',
      exportedAt: new Date().toISOString(),
      deck
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    anchor.href = url;
    anchor.download = `algoshowmaker-slides-${stamp}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function importDeckJsonText(text) {
    const parsed = JSON.parse(text);
    const importedDeck = parsed && parsed.deck ? parsed.deck : parsed;
    const nextDeck = normalizeDeck(importedDeck);
    const previousDeck = deck;
    deck = nextDeck;
    currentH = 0;
    currentV = 0;
    saveDeck();
    if (canRestoreDeckInPlace(previousDeck, deck)) restoreDeckInPlace(previousDeck);
    else renderDeck();
  }

  function importDeckJsonFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        importDeckJsonText(String(reader.result || ''));
        flashHint('Done');
      } catch (err) {
        console.error('Failed to import deck JSON', err);
        flashHint('Done');
      } finally {
        if (importDeckInput) importDeckInput.value = '';
      }
    };
    reader.readAsText(file);
  }

  function pushHistorySnapshot(snapshot = JSON.stringify(deck)) {
    clearTimeout(pendingHistoryTimer);
    pendingHistoryTimer = null;
    pendingColorHistory = false;
    if (history[historyIndex] === snapshot) return;
    history = history.slice(0, historyIndex + 1);
    history.push(snapshot);
    if (history.length > MAX_HISTORY) history.shift();
    historyIndex = history.length - 1;
    updateDiagnostics();
  }

  function deckSlideStructure(deckState) {
    return deckState.groups.map(group => ({
      id: group.id,
      slides: group.slides.map(slide => ({
        id: slide.id,
        kind: slide.kind || ''
      }))
    }));
  }

  function canRestoreDeckInPlace(previousDeck, nextDeck) {
    return JSON.stringify(deckSlideStructure(previousDeck)) === JSON.stringify(deckSlideStructure(nextDeck));
  }

  function restoreHistory(index) {
    if (index < 0 || index >= history.length) return;
    suppressHistory = true;
    const previousDeck = deck;
    historyIndex = index;
    deck = normalizeDeck(JSON.parse(history[historyIndex]));
    clampPosition();
    saveDeck({ history: false });
    if (canRestoreDeckInPlace(previousDeck, deck)) restoreDeckInPlace(previousDeck);
    else renderDeck();
    suppressHistory = false;
  }

  function undo() {
    commitPendingColorHistory();
    restoreHistory(historyIndex - 1);
  }

  function redo() {
    commitPendingColorHistory();
    restoreHistory(historyIndex + 1);
  }

  function getGroup(h = currentH) {
    return deck.groups[h];
  }

  function getSlide(h = currentH, v = currentV) {
    const group = getGroup(h);
    return group && group.slides[Math.min(v, group.slides.length - 1)];
  }

  function currentFabricCanvas() {
    const slide = getSlide();
    return slide && fabricCanvases.get(slide.id);
  }

  function applyTtsPronunciations(text) {
    const parsed = window.parseTTSMarkup?.(text);
    return String(parsed ? parsed.speech : text || '')
      .replace(/\[([^\[\]:]+):([^\[\]]+)\]/g, (match, written, spoken) => spoken.trim());
  }

  function splitTtsSpeech(text, sourceOffset = 0) {
    const source = String(text || '');
    const sentencePattern = /[^。！？.!?]+[。！？.!?]?/g;
    const matches = Array.from(source.matchAll(sentencePattern));
    const chunks = [];
    (matches.length ? matches : [{ 0: source, index: 0 }]).forEach(match => {
      const raw = String(match[0] || '');
      const leadingWhitespace = raw.search(/\S/);
      if (leadingWhitespace < 0) return;
      const trailingWhitespace = raw.length - raw.trimEnd().length;
      const sourceStart = sourceOffset + Number(match.index || 0) + leadingWhitespace;
      const sourceEnd = sourceOffset + Number(match.index || 0) + raw.length - trailingWhitespace;
      const spoken = applyTtsPronunciations(raw.trim()).replace(/\s+/g, ' ').trim();
      if (!spoken) return;
      for (let index = 0; index < spoken.length; index += 220) {
        chunks.push({
          text: spoken.slice(index, index + 220),
          sourceStart,
          sourceEnd
        });
      }
    });
    return chunks;
  }

  function parseTtsScript(script) {
    const source = String(script || '');
    const segments = [];
    const sleepPattern = /(?:\{\s*|\[\s*)?sleep\s*:\s*(\d+(?:\.\d+)?)\s*(ms|s)?\s*(?:\}|\])?/gi;
    let cursor = 0;
    let match;
    const appendSpeech = (value, sourceOffset) => {
      splitTtsSpeech(value, sourceOffset).forEach(chunk => segments.push({ type: 'speech', ...chunk }));
    };
    while ((match = sleepPattern.exec(source))) {
      appendSpeech(source.slice(cursor, match.index), cursor);
      const amount = Math.max(0, Number(match[1]) || 0);
      const milliseconds = match[2]?.toLowerCase() === 'ms' ? amount : amount * 1000;
      segments.push({
        type: 'sleep',
        ms: Math.min(300000, milliseconds),
        sourceStart: match.index,
        sourceEnd: match.index + match[0].length
      });
      cursor = match.index + match[0].length;
    }
    appendSpeech(source.slice(cursor), cursor);
    return segments.filter(segment => segment.type !== 'speech' || segment.text);
  }

  function slideTextEntries(slide) {
    if (!slide) return [];
    const canvas = fabricCanvases.get(slide.id);
    const roots = canvas ? canvas.getObjects() : (slide.canvas?.objects || []);
    const entries = [];
    const visit = (object, parentLeft = 0, parentTop = 0) => {
      if (!object || object.visible === false) return;
      const left = parentLeft + (Number(object.left) || 0);
      const top = parentTop + (Number(object.top) || 0);
      const type = String(object.type || '').toLowerCase();
      if (typeof object.text === 'string' && type.includes('text') && object.text.trim()) {
        entries.push({ text: object.text.trim(), object, left, top });
      }
      const children = Array.isArray(object._objects) ? object._objects : object.objects;
      if (Array.isArray(children)) children.forEach(child => visit(child, left, top));
    };
    roots.forEach(object => visit(object));
    return entries.sort((a, b) => a.top - b.top || a.left - b.left);
  }

  function automaticTtsScript(slide) {
    return ttsNarrationEntries(slide)
      .map(entry => entry.autoText)
      .filter(text => String(text || '').trim())
      .join('\n');
  }

  function fabricObjectTtsText(object) {
    if (!object) return '';
    if (typeof object.text === 'string') return object.text;
    const children = Array.isArray(object._objects) ? object._objects : object.objects;
    return Array.isArray(children)
      ? children.map(fabricObjectTtsText).filter(Boolean).join('\n')
      : '';
  }

  function ttsEntryScript(entry) {
    return entry?.source?.ttsScriptMode === 'manual'
      ? String(entry.source.ttsScript || '')
      : String(entry?.autoText || '');
  }

  function ttsNarrationEntries(slide, { includeMuted = false } = {}) {
    if (!slide) return [];
    const entries = [];
    const canvas = fabricCanvases.get(slide.id);
    const fabricObjects = canvas ? canvas.getObjects() : (slide.canvas?.objects || []);
    fabricObjects.forEach(object => {
      const type = String(object?.type || '').toLowerCase();
      if (!object || !type.includes('text')) return;
      const id = object.ttsObjectId || randomId();
      if (object.set) object.set('ttsObjectId', id);
      else object.ttsObjectId = id;
      entries.push({
        key: `fabric:${id}`,
        kind: 'fabric',
        source: object,
        autoText: fabricObjectTtsText(object),
        left: Number(object.left) || 0,
        top: Number(object.top) || 0,
        label: object.ttsCarrier
          ? '空白口述'
          : `文字 ${entries.length + 1}`
      });
    });

    if (includeMuted) return entries.sort((a, b) => a.top - b.top || a.left - b.left);

    const audibleEntries = entries.filter(entry => entry.source.ttsMuted !== true);
    const byKey = new Map(audibleEntries.map(entry => [entry.key, entry]));
    const defaultOrder = [...audibleEntries]
      .sort((a, b) => a.top - b.top || a.left - b.left)
      .map(entry => entry.key);
    const requestedOrder = Array.isArray(slide.ttsOrder) ? slide.ttsOrder : [];
    const order = requestedOrder.filter((key, index) => byKey.has(key) && requestedOrder.indexOf(key) === index);
    defaultOrder.forEach(key => {
      if (!order.includes(key)) order.push(key);
    });
    slide.ttsOrder = order;
    return order.map(key => byKey.get(key)).filter(Boolean);
  }

  function buildTtsNarrationPlan(slide) {
    const sourceParts = [];
    const segments = [];
    let sourceCursor = 0;
    ttsNarrationEntries(slide).forEach(entry => {
      const script = ttsEntryScript(entry);
      if (!script.trim()) return;
      script.split(/\r?\n/).forEach((line, lineIndex) => {
        const lineStart = sourceCursor;
        sourceParts.push(line);
        sourceCursor += line.length;
        const lineEnd = sourceCursor;
        parseTtsScript(line).forEach(segment => {
          segments.push({
            ...segment,
            sourceStart: lineStart,
            sourceEnd: lineEnd,
            objectKey: entry.key,
            objectKind: entry.kind,
            lineIndex
          });
        });
        sourceParts.push('\n');
        sourceCursor += 1;
      });
    });
    if (sourceParts[sourceParts.length - 1] === '\n') sourceParts.pop();
    return { sourceText: sourceParts.join(''), segments };
  }

  function narrationForSlide(slide) {
    return buildTtsNarrationPlan(slide).sourceText;
  }

  function updateTtsDiagnostics(slide) {
    const segments = buildTtsNarrationPlan(slide).segments;
    document.body.dataset.ttsSource = ttsNarrationEntries(slide)
      .some(entry => entry.source.ttsScriptMode === 'manual') ? 'object-manual' : 'object-auto';
    document.body.dataset.ttsSegmentTypes = segments.map(segment => segment.type).join(',');
    document.body.dataset.ttsSpeechPreview = segments
      .filter(segment => segment.type === 'speech')
      .map(segment => segment.text)
      .join(' | ')
      .slice(0, 240);
    document.body.dataset.ttsSleepMs = segments
      .filter(segment => segment.type === 'sleep')
      .map(segment => String(segment.ms))
      .join(',');
  }

  function syncTtsSettingsControls() {
    deck.ttsSettings = normalizeTtsSettings(deck.ttsSettings);
    const { rate, volume } = deck.ttsSettings;
    if (ttsRateInput && ttsRateInput.value !== String(rate)) ttsRateInput.value = String(rate);
    if (ttsVolumeInput && ttsVolumeInput.value !== String(volume)) ttsVolumeInput.value = String(volume);
    if (ttsRateValue) ttsRateValue.textContent = `${rate.toFixed(1)}x`;
    if (ttsVolumeValue) ttsVolumeValue.textContent = `${Math.round(volume * 100)}%`;
  }

  function updateTtsSettingsFromControls({ history = false } = {}) {
    deck.ttsSettings = normalizeTtsSettings({
      rate: ttsRateInput?.value,
      volume: ttsVolumeInput?.value
    });
    syncTtsSettingsControls();
    saveDeck({ history });
  }

  function syncTtsEditor() {
    const slide = getSlide();
    if (!slide) return;
    renderTtsObjectOrder(slide);
    if (ttsScriptSource) {
      ttsScriptSource.textContent = `${ttsNarrationEntries(slide).length} 個文字物件`;
    }
    updateTtsDiagnostics(slide);
    syncTtsSettingsControls();
    syncTtsPlaybackTextMode();
    syncTtsObjectEditor();
  }

  function ttsThumbnailText(entry) {
    const script = ttsEntryScript(entry);
    const visibleText = String(entry.autoText || '').trim();
    return (visibleText || script.trim() || '空白口述').slice(0, 90);
  }

  function renderTtsObjectOrder(slide = getSlide()) {
    if (!ttsObjectOrderList || !slide) return;
    const fragment = document.createDocumentFragment();
    ttsNarrationEntries(slide).forEach(entry => {
      const item = document.createElement('div');
      item.className = 'tts-object-item';
      item.dataset.ttsObjectKey = entry.key;
      item.dataset.ttsObjectKind = entry.kind;
      item.setAttribute('role', 'listitem');
      item.draggable = false;
      item.classList.toggle('is-expanded', expandedTtsObjectKey === entry.key);
      item.classList.toggle('is-reading', ttsPlayback.currentObjectKey === entry.key);

      item.title = '拖曳調整朗讀順序';

      const thumbnail = document.createElement('div');
      thumbnail.className = 'tts-object-thumbnail';
      thumbnail.classList.toggle('is-empty', !String(entry.autoText || '').trim());
      thumbnail.textContent = ttsThumbnailText(entry);

      item.append(thumbnail);
      fragment.appendChild(item);
    });
    ttsObjectOrderList.replaceChildren(fragment);
  }

  function setTtsEntryScript(objectKey, script, mode = 'manual') {
    const slide = getSlide();
    const entry = ttsNarrationEntries(slide, { includeMuted: true }).find(item => item.key === objectKey);
    if (!slide || !entry || sharedAccess === 'view') return;
    const values = {
      ttsScript: String(script || ''),
      ttsScriptMode: mode === 'auto' ? 'auto' : 'manual'
    };
    if (entry.source.set) entry.source.set(values);
    else Object.assign(entry.source, values);
    if (entry.kind === 'fabric') {
      const canvas = fabricCanvases.get(slide.id);
      if (canvas) slide.canvas = serializeFabricCanvas(canvas);
    }
    saveDeck({ history: false });
    scheduleHistorySnapshot();
    updateTtsDiagnostics(slide);
  }

  function setTtsEntryMuted(objectKey, muted) {
    const slide = getSlide();
    const entry = ttsNarrationEntries(slide, { includeMuted: true }).find(item => item.key === objectKey);
    if (!slide || !entry || sharedAccess === 'view') return;
    const currentOrder = Array.isArray(slide.ttsOrder) ? [...slide.ttsOrder] : [];
    const muting = Boolean(muted);
    const values = {
      ttsMuted: muting,
      ttsMutedOrderIndex: muting
        ? Math.max(0, currentOrder.indexOf(objectKey))
        : null
    };
    if (muting) {
      slide.ttsOrder = currentOrder.filter(key => key !== objectKey);
    } else {
      const restoredOrder = currentOrder.filter(key => key !== objectKey);
      const restoreIndex = Math.min(
        restoredOrder.length,
        Math.max(0, Number(entry.source.ttsMutedOrderIndex) || 0)
      );
      restoredOrder.splice(restoreIndex, 0, objectKey);
      slide.ttsOrder = restoredOrder;
    }
    if (entry.source.set) entry.source.set(values);
    else Object.assign(entry.source, values);
    const canvas = fabricCanvases.get(slide.id);
    if (canvas) slide.canvas = serializeFabricCanvas(canvas);
    saveDeck();
    syncTtsEditor();
  }

  function selectTtsEntry(objectKey) {
    const slide = getSlide();
    const entry = ttsNarrationEntries(slide).find(item => item.key === objectKey);
    if (!entry || !document.body.classList.contains('asm-edit-mode')) return;
    const canvas = fabricCanvases.get(slide.id);
    if (!canvas || !canvas.getObjects().includes(entry.source)) return;
    selectedWidgetId = null;
    canvas.setActiveObject(entry.source);
    canvas.requestRenderAll();
    updateObjectToolbar(entry.source, canvas);
  }

  function reorderTtsObject(sourceKey, targetKey, after) {
    const slide = getSlide();
    if (!slide || !sourceKey || !targetKey || sourceKey === targetKey || sharedAccess === 'view') return;
    const order = ttsNarrationEntries(slide).map(entry => entry.key).filter(key => key !== sourceKey);
    const targetIndex = order.indexOf(targetKey);
    if (targetIndex < 0) return;
    order.splice(targetIndex + (after ? 1 : 0), 0, sourceKey);
    slide.ttsOrder = order;
    saveDeck();
    renderTtsObjectOrder(slide);
  }

  function clearTtsSortIndicators() {
    ttsObjectOrderList?.querySelectorAll('.is-dragging, .is-drop-before, .is-drop-after').forEach(item => {
      item.classList.remove('is-dragging', 'is-drop-before', 'is-drop-after');
    });
  }

  function addTtsCarrier() {
    const slide = getSlide();
    const canvas = currentFabricCanvas();
    const Fabric = f();
    const TextClass = Fabric?.Textbox || Fabric?.IText || Fabric?.Text;
    if (!slide || !canvas || !TextClass || sharedAccess === 'view') return;
    const object = new TextClass('', {
      left: SLIDE_W / 2 - 160,
      top: SLIDE_H / 2 - 24,
      width: 320,
      fontSize: 28,
      fontFamily: DEFAULT_FONT_FAMILY,
      fill: '#1f282d',
      styles: {},
      ttsCarrier: true,
      ttsScriptMode: 'manual',
      ttsScript: ''
    });
    configureObject(object);
    canvas.add(object);
    canvas.setActiveObject(object);
    canvas.requestRenderAll();
    syncCurrentSlideCanvas();
    openSelectedTextTts();
  }

  function ttsPanelIsExpanded() {
    return ttsTransport?.dataset.expanded === 'true';
  }

  function showOnlyTtsSidebar() {
    defaultToolPanel.hidden = true;
    if (overviewSidebarPanel) overviewSidebarPanel.hidden = true;
    latexEditorPanel.hidden = true;
    codeEditorPanel.hidden = true;
    if (structureEditorPanel) structureEditorPanel.hidden = true;
    setStructureEditorActive(false);
    hideAnimationEditor();
    if (ttsTransport) ttsTransport.hidden = false;
  }

  function restoreSelectedObjectSidebar() {
    const canvas = currentFabricCanvas();
    const active = canvas?.getActiveObject();
    if (selectedWidgetId) showWidgetEditor(selectedWidgetId);
    else if (active && active.type !== 'activeSelection') showFabricObjectEditor(active);
    else showDefaultPanel();
  }

  function closeTtsObjectEditor() {
    if (!expandedTtsObjectKey && (!ttsObjectEditorPopover || ttsObjectEditorPopover.hidden)) return;
    expandedTtsObjectKey = null;
    if (ttsObjectEditorPopover) ttsObjectEditorPopover.hidden = true;
    if (objectToolbar?.dataset.baseTop) objectToolbar.style.top = `${Number(objectToolbar.dataset.baseTop)}px`;
    renderTtsObjectOrder();
  }

  function positionTtsObjectEditor() {
    if (!ttsObjectEditorPopover || ttsObjectEditorPopover.hidden || !objectToolbar || objectToolbar.hidden) return;
    const toolbarRect = objectToolbar.getBoundingClientRect();
    const editorWidth = toolbarRect.width;
    ttsObjectEditorPopover.style.width = `${editorWidth}px`;
    const editorHeight = ttsObjectEditorPopover.offsetHeight || 150;
    const left = Math.min(window.innerWidth - editorWidth - 8, Math.max(8, toolbarRect.left));
    const baseToolbarTop = Number(objectToolbar.dataset.baseTop || toolbarRect.top);
    let top = baseToolbarTop - editorHeight - 6;
    let toolbarTop = baseToolbarTop;
    if (top < 8) {
      top = 8;
      toolbarTop = top + editorHeight + 6;
    }
    objectToolbar.style.top = `${toolbarTop}px`;
    ttsObjectEditorPopover.style.left = `${left}px`;
    ttsObjectEditorPopover.style.top = `${top}px`;
  }

  function syncTtsObjectEditor() {
    if (!ttsObjectEditorPopover || ttsObjectEditorPopover.hidden || !expandedTtsObjectKey) return;
    const entry = ttsNarrationEntries(getSlide(), { includeMuted: true }).find(item => item.key === expandedTtsObjectKey);
    if (!entry || entry.kind !== 'fabric' || !isTextObject(entry.source)) {
      closeTtsObjectEditor();
      return;
    }
    const script = ttsEntryScript(entry);
    if (ttsObjectEditorTitle) ttsObjectEditorTitle.textContent = entry.source.ttsCarrier ? '空白口述 TTS' : `${entry.label} TTS`;
    if (ttsObjectEditorMode) {
      ttsObjectEditorMode.textContent = entry.source.ttsScriptMode === 'manual' ? '自訂台詞' : '跟隨物件文字';
    }
    if (ttsObjectScriptInput && document.activeElement !== ttsObjectScriptInput) ttsObjectScriptInput.value = script;
    if (ttsObjectScriptInput) ttsObjectScriptInput.readOnly = sharedAccess === 'view';
    if (ttsObjectMuteBtn) {
      const muted = entry.source.ttsMuted === true;
      ttsObjectMuteBtn.classList.toggle('is-active', muted);
      ttsObjectMuteBtn.setAttribute('aria-pressed', String(muted));
      ttsObjectMuteBtn.setAttribute('aria-label', muted ? '恢復朗讀這個 TTS' : '不念這個 TTS');
      ttsObjectMuteBtn.title = muted ? '恢復朗讀這個 TTS' : '不念這個 TTS';
      ttsObjectMuteBtn.disabled = sharedAccess === 'view';
    }
    if (ttsObjectResetBtn) ttsObjectResetBtn.disabled = sharedAccess === 'view' || entry.source.ttsScriptMode !== 'manual';
    positionTtsObjectEditor();
  }

  function openSelectedTextTts() {
    const canvas = currentFabricCanvas();
    const object = canvas?.getActiveObject();
    if (!object || object.type === 'activeSelection' || !isTextObject(object)) return;
    if (!object.ttsObjectId) object.set('ttsObjectId', randomId());
    expandedTtsObjectKey = `fabric:${object.ttsObjectId}`;
    if (ttsObjectEditorPopover) ttsObjectEditorPopover.hidden = false;
    renderTtsObjectOrder();
    syncTtsObjectEditor();
    requestAnimationFrame(() => {
      positionTtsObjectEditor();
      ttsObjectScriptInput?.focus();
    });
  }

  function setTtsPanelExpanded(expanded) {
    const isExpanded = Boolean(expanded);
    if (ttsTransport) ttsTransport.dataset.expanded = String(isExpanded);
    if (ttsPanelToggleBtn) {
      ttsPanelToggleBtn.classList.toggle('is-active', isExpanded);
      ttsPanelToggleBtn.setAttribute('aria-pressed', String(isExpanded));
    }
    if (!isExpanded) {
      if (ttsTransport) ttsTransport.hidden = true;
      stopTtsPlayback();
      restoreSelectedObjectSidebar();
      return;
    }
    showOnlyTtsSidebar();
    if (isExpanded) {
      syncTtsSettingsControls();
      syncTtsEditor();
      syncTtsPlaybackTextMode();
    }
  }

  function clearTtsFabricHighlights() {
    const canvases = new Set();
    ttsPlayback.fabricHighlights.forEach(highlight => {
      const { object, characters, canvas } = highlight;
      if (!object) return;
      object.styles = object.styles || {};
      characters.forEach(character => {
        const lineStyles = object.styles[character.lineIndex] || (object.styles[character.lineIndex] = {});
        const style = lineStyles[character.charIndex] || (lineStyles[character.charIndex] = {});
        if (character.hadBackground) style.textBackgroundColor = character.background;
        else delete style.textBackgroundColor;
        if (!character.hadStyle && !Object.keys(style).length) delete lineStyles[character.charIndex];
        if (!Object.keys(lineStyles).length) delete object.styles[character.lineIndex];
      });
      object.dirty = true;
      if (canvas) canvases.add(canvas);
    });
    ttsPlayback.fabricHighlights = [];
    ttsPlayback.widgetHighlights.forEach(element => {
      element?.classList?.remove('tts-reading-object');
      element?.style?.removeProperty('--tts-line-top');
      element?.style?.removeProperty('--tts-line-height');
    });
    ttsPlayback.widgetHighlights = [];
    document.body.dataset.ttsCanvasHighlight = 'none';
    canvases.forEach(canvas => canvas.requestRenderAll());
  }

  function highlightFabricTextRange(object, start, end, canvas) {
    if (!object?.setSelectionStyles || !object?.get2DCursorLocation) return false;
    const from = Math.max(0, Math.min(object.text.length, Math.floor(start)));
    const to = Math.max(from, Math.min(object.text.length, Math.ceil(end)));
    if (to <= from) return false;
    const characters = [];
    for (let index = from; index < to; index += 1) {
      const location = object.get2DCursorLocation(index, true);
      const lineIndex = Number(location?.lineIndex) || 0;
      const charIndex = Number(location?.charIndex) || 0;
      const style = object.styles?.[lineIndex]?.[charIndex];
      characters.push({
        lineIndex,
        charIndex,
        hadStyle: Boolean(style),
        hadBackground: Boolean(style && Object.prototype.hasOwnProperty.call(style, 'textBackgroundColor')),
        background: style?.textBackgroundColor
      });
    }
    object.setSelectionStyles({ textBackgroundColor: '#d8dcdd' }, from, to);
    object.dirty = true;
    ttsPlayback.fabricHighlights.push({ object, characters, canvas });
    canvas?.requestRenderAll();
    return true;
  }

  function ttsTextLineRange(text, requestedLine) {
    const source = String(text || '');
    const lines = source.split('\n');
    if (!source || !lines.length) return null;
    const lineIndex = Math.max(0, Math.min(lines.length - 1, Number(requestedLine) || 0));
    let start = 0;
    for (let index = 0; index < lineIndex; index += 1) start += lines[index].length + 1;
    return { start, end: start + lines[lineIndex].length, lineIndex };
  }

  function highlightTtsOnSlide(segment) {
    clearTtsFabricHighlights();
    if (segment?.type !== 'speech') return;
    const slide = getSlide();
    const canvas = slide && fabricCanvases.get(slide.id);
    if (!slide) return;
    const entry = ttsNarrationEntries(slide).find(item => item.key === segment.objectKey);
    if (!entry) return;
    let highlighted = false;
    if (entry.kind === 'fabric' && canvas && typeof entry.source.text === 'string') {
      const range = ttsTextLineRange(entry.source.text, segment.lineIndex);
      if (range && range.end > range.start) {
        highlighted = highlightFabricTextRange(entry.source, range.start, range.end, canvas);
      }
    } else if (entry.kind === 'widget') {
      const element = document.querySelector(`.slide-widget[data-widget-id="${CSS.escape(entry.source.id)}"]`);
      if (element) {
        const lineHeight = Math.max(18, (Number(entry.source.fontSize) || 18) * 1.42);
        element.style.setProperty('--tts-line-top', `${Math.max(0, Number(segment.lineIndex) || 0) * lineHeight}px`);
        element.style.setProperty('--tts-line-height', `${lineHeight}px`);
        element.classList.add('tts-reading-object');
        ttsPlayback.widgetHighlights.push(element);
        highlighted = true;
      }
    }
    document.body.dataset.ttsCanvasHighlight = highlighted ? 'active' : 'none';
  }

  function renderTtsPlaybackText() {
    if (!ttsScriptPlaybackText) return;
    const source = String(ttsPlayback.sourceText || '');
    const start = Math.max(0, Math.min(source.length, ttsPlayback.highlightStart));
    const end = Math.max(start, Math.min(source.length, ttsPlayback.highlightEnd));
    if (!source || end <= start) {
      ttsScriptPlaybackText.textContent = source || '沒有台詞';
      return;
    }
    const mark = document.createElement('mark');
    mark.textContent = source.slice(start, end);
    ttsScriptPlaybackText.replaceChildren(
      document.createTextNode(source.slice(0, start)),
      mark,
      document.createTextNode(source.slice(end))
    );
    requestAnimationFrame(() => {
      ttsScriptPlaybackText.scrollTop = Math.max(0, mark.offsetTop - 7);
      ttsScriptPlaybackText.scrollLeft = Math.max(0, mark.offsetLeft - 9);
    });
  }

  function syncTtsPlaybackTextMode() {
    if (!ttsScriptPlaybackText) return;
    const showingPlayback = ttsPlayback.active && ttsPlayback.slideId === getSlide()?.id;
    ttsScriptPlaybackText.hidden = !showingPlayback;
    if (showingPlayback) renderTtsPlaybackText();
  }

  function highlightTtsSegment(segment) {
    ttsPlayback.highlightStart = Number.isFinite(segment?.sourceStart) ? segment.sourceStart : -1;
    ttsPlayback.highlightEnd = Number.isFinite(segment?.sourceEnd) ? segment.sourceEnd : -1;
    ttsPlayback.currentObjectKey = segment?.objectKey || null;
    ttsObjectOrderList?.querySelectorAll('.tts-object-item').forEach(item => {
      item.classList.toggle('is-reading', item.dataset.ttsObjectKey === ttsPlayback.currentObjectKey);
    });
    renderTtsPlaybackText();
    highlightTtsOnSlide(segment);
  }

  function setTtsStatus(text, state = 'idle') {
    if (ttsPlaybackStatus) ttsPlaybackStatus.textContent = text;
    if (ttsTransport) ttsTransport.dataset.state = state;
    document.body.dataset.ttsPlaybackState = state;
    if (ttsPlayPauseBtn) {
      const label = !ttsPlayback.active
        ? '播放台詞'
        : (ttsPlayback.paused ? '繼續播放' : '暫停播放');
      ttsPlayPauseBtn.title = label;
      ttsPlayPauseBtn.setAttribute('aria-label', label);
    }
    if (ttsStopBtn) ttsStopBtn.disabled = !ttsPlayback.active;
  }

  function clearTtsSleepTimer() {
    if (ttsPlayback.sleepTimer) clearTimeout(ttsPlayback.sleepTimer);
    ttsPlayback.sleepTimer = null;
    ttsPlayback.sleepEndsAt = 0;
  }

  function cancelTtsEngine() {
    ttsPlayback.session += 1;
    clearTtsFabricHighlights();
    clearTtsSleepTimer();
    ttsPlayback.sleepRemaining = 0;
    ttsPlayback.utterance = null;
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();
    }
  }

  function stopTtsPlayback(status = '待機') {
    cancelTtsEngine();
    ttsPlayback.active = false;
    ttsPlayback.paused = false;
    ttsPlayback.slideId = null;
    ttsPlayback.segments = [];
    ttsPlayback.segmentIndex = 0;
    ttsPlayback.sourceText = '';
    ttsPlayback.highlightStart = -1;
    ttsPlayback.highlightEnd = -1;
    ttsPlayback.currentObjectKey = null;
    ttsObjectOrderList?.querySelectorAll('.tts-object-item.is-reading').forEach(item => item.classList.remove('is-reading'));
    setTtsStatus(status, status === '播放完成' ? 'complete' : 'idle');
    syncTtsPlaybackTextMode();
  }

  function preferredTtsVoice() {
    const profile = window.getAlgoShowMakerTTSProfile?.();
    if (profile?.voice) return profile.voice;
    if (typeof window.pickBestTTSVoice === 'function') {
      return window.pickBestTTSVoice({
        lang: 'zh-TW',
        preferredVoiceRegex: /(Microsoft).*(Natural|Neural).*(Chinese|Taiwan|zh[-_]?TW)/i
      });
    }
    const voices = (window.speechSynthesis?.getVoices?.() || []).filter(voice => (
      String(voice.name || '').trim().toLowerCase()
        !== 'microsoft hanhan - chinese (traditional, taiwan)'
    ));
    const naturalVoice = /(Microsoft).*(Natural|Neural).*(Chinese|Taiwan|zh[-_]?TW)/i;
    return voices.find(voice => /^zh[-_]TW$/i.test(voice.lang || '')
        && naturalVoice.test(voice.name || '')
        && voice.localService === false)
      || voices.find(voice => naturalVoice.test(voice.name || '') && voice.localService === false)
      || voices.find(voice => /^zh/i.test(voice.lang || '') && voice.localService === false)
      || voices.find(voice => /^zh[-_]TW$/i.test(voice.lang || ''))
      || voices.find(voice => /^zh/i.test(voice.lang || ''))
      || voices.find(voice => voice.default)
      || voices[0]
      || null;
  }

  function nextTtsSlidePosition() {
    const group = getGroup(currentH);
    if (group && currentV + 1 < group.slides.length) return { h: currentH, v: currentV + 1 };
    if (currentH + 1 < deck.groups.length) return { h: currentH + 1, v: 0 };
    return null;
  }

  function advanceTtsSlide(session) {
    if (!ttsPlayback.active || ttsPlayback.paused || session !== ttsPlayback.session) return;
    const next = nextTtsSlidePosition();
    if (!next) {
      stopTtsPlayback('播放完成');
      return;
    }
    setTtsStatus('下一頁', 'playing');
    if (reveal) reveal.slide(next.h, next.v);
  }

  function startTtsSleep(session) {
    if (!ttsPlayback.active || ttsPlayback.paused || session !== ttsPlayback.session) return;
    const duration = Math.max(0, ttsPlayback.sleepRemaining);
    highlightTtsSegment(ttsPlayback.segments[ttsPlayback.segmentIndex]);
    ttsPlayback.sleepEndsAt = Date.now() + duration;
    setTtsStatus(`等待 ${Math.round(duration / 100) / 10} 秒`, 'waiting');
    ttsPlayback.sleepTimer = setTimeout(() => {
      if (!ttsPlayback.active || ttsPlayback.paused || session !== ttsPlayback.session) return;
      clearTtsSleepTimer();
      ttsPlayback.sleepRemaining = 0;
      ttsPlayback.segmentIndex += 1;
      runTtsSegment(session);
    }, duration);
  }

  function runTtsSegment(session) {
    if (!ttsPlayback.active || ttsPlayback.paused || session !== ttsPlayback.session) return;
    const segment = ttsPlayback.segments[ttsPlayback.segmentIndex];
    if (!segment) {
      advanceTtsSlide(session);
      return;
    }
    if (segment.type === 'sleep') {
      ttsPlayback.sleepRemaining = segment.ms;
      startTtsSleep(session);
      return;
    }

    highlightTtsSegment(segment);
    const settings = normalizeTtsSettings(deck.ttsSettings);
    const finishSegment = () => {
      if (!ttsPlayback.active || session !== ttsPlayback.session) return;
      ttsPlayback.utterance = null;
      ttsPlayback.segmentIndex += 1;
      runTtsSegment(session);
    };
    const failSegment = event => {
      if (!ttsPlayback.active || session !== ttsPlayback.session) return;
      if (event.error === 'canceled' || event.error === 'interrupted') return;
      finishSegment();
    };
    setTtsStatus('朗讀中', 'playing');
    if (typeof window.speakText === 'function') {
      ttsPlayback.utterance = { pending: true };
      Promise.resolve(window.speakText(segment.text, {
        lang: 'zh-TW',
        rate: settings.rate,
        pitch: 1,
        volume: settings.volume,
        interrupt: false,
        requireUserGesture: false,
        onend: finishSegment,
        onerror: failSegment
      })).then(utterance => {
        if (!ttsPlayback.active || session !== ttsPlayback.session) return;
        if (!utterance) {
          finishSegment();
          return;
        }
        ttsPlayback.utterance = utterance;
        if (ttsPlayback.paused) window.speechSynthesis.pause();
      }).catch(failSegment);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(segment.text);
    const voice = preferredTtsVoice();
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang || 'zh-TW';
    utterance.rate = settings.rate;
    utterance.pitch = 1;
    utterance.volume = settings.volume;
    utterance.onend = finishSegment;
    utterance.onerror = failSegment;
    ttsPlayback.utterance = utterance;
    window.speechSynthesis.speak(utterance);
  }

  function loadCurrentSlideTts({ autoplay = true } = {}) {
    if (!window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== 'function') {
      stopTtsPlayback('無法使用');
      return;
    }
    cancelTtsEngine();
    const slide = getSlide();
    const plan = buildTtsNarrationPlan(slide);
    ttsPlayback.active = true;
    ttsPlayback.paused = !autoplay;
    ttsPlayback.slideId = slide?.id || null;
    ttsPlayback.sourceText = plan.sourceText;
    ttsPlayback.segments = plan.segments;
    ttsPlayback.segmentIndex = 0;
    ttsPlayback.highlightStart = -1;
    ttsPlayback.highlightEnd = -1;
    ttsPlayback.currentObjectKey = null;
    syncTtsPlaybackTextMode();
    const session = ttsPlayback.session;
    if (!autoplay) {
      setTtsStatus('已暫停', 'paused');
      return;
    }
    if (!ttsPlayback.segments.length) {
      setTtsStatus('沒有台詞', 'playing');
      setTimeout(() => advanceTtsSlide(session), 80);
      return;
    }
    runTtsSegment(session);
  }

  async function startTtsPlayback() {
    if (ttsVoiceLoading) return;
    ttsVoiceLoading = true;
    setTtsStatus('載入語音', 'idle');
    try {
      if (typeof window.waitForTTSVoices === 'function') await window.waitForTTSVoices();
    } finally {
      ttsVoiceLoading = false;
    }
    loadCurrentSlideTts({ autoplay: true });
  }

  function handleTtsPlayPause() {
    if (ttsPlayback.active) toggleTtsPause();
    else startTtsPlayback();
  }

  function toggleTtsPause() {
    if (!ttsPlayback.active) return;
    if (!ttsPlayback.paused) {
      ttsPlayback.paused = true;
      if (ttsPlayback.sleepTimer) {
        ttsPlayback.sleepRemaining = Math.max(1, ttsPlayback.sleepEndsAt - Date.now());
        clearTtsSleepTimer();
      } else if (ttsPlayback.utterance) {
        window.speechSynthesis.pause();
      }
      setTtsStatus('已暫停', 'paused');
      return;
    }

    ttsPlayback.paused = false;
    const session = ttsPlayback.session;
    if (ttsPlayback.sleepRemaining > 0) startTtsSleep(session);
    else if (ttsPlayback.utterance) {
      window.speechSynthesis.resume();
      setTtsStatus('朗讀中', 'playing');
    } else {
      runTtsSegment(session);
    }
  }

  function handleTtsSlideChanged() {
    syncTtsEditor();
    if (!ttsPlayback.active) return;
    loadCurrentSlideTts({ autoplay: !ttsPlayback.paused });
  }

  function isOverviewEditing() {
    return customOverviewOpen || !!(reveal && reveal.isOverview && reveal.isOverview());
  }

  function isRevealEditOverviewActive() {
    return !!(
      reveal
      && reveal.isOverview
      && reveal.isOverview()
      && document.body.classList.contains('asm-edit-mode')
      && !customOverviewOpen
    );
  }

  function normalizeCanvasJson(canvasJson) {
    return {
      version: canvasJson && canvasJson.version,
      objects: ((canvasJson && canvasJson.objects) || []).map(obj => {
        if (!obj || typeof obj.type !== 'string') return obj;
        const normalizedObject = obj.asmShapeType === 'arrow' && obj.type.toLowerCase() === 'path'
          ? migrateLegacyArrowJson(obj)
          : obj;
        const type = normalizedObject.type.toLowerCase();
        const ttsFields = {
          ttsObjectId: normalizedObject.ttsObjectId || randomId(),
          ...normalizeTtsObjectFields(normalizedObject)
        };
        if (type.includes('text') && type !== 'textbox' && f()?.Textbox) {
          return sanitizeFabricTextBaseline({
            ...normalizedObject,
            ...ttsFields,
            type: 'textbox',
            textBaseline: normalizeTextBaselineValue(normalizedObject.textBaseline),
            width: Number.isFinite(normalizedObject.width) ? Math.max(40, normalizedObject.width) : 360
          });
        }
        return sanitizeFabricTextBaseline({
          ...normalizedObject,
          ...ttsFields,
          textBaseline: normalizeTextBaselineValue(normalizedObject.textBaseline)
        });
      })
    };
  }

  function migrateLegacyArrowJson(obj) {
    const width = Math.max(24, (Number(obj.width) || 192) * Math.abs(Number(obj.scaleX) || 1));
    const height = Math.max(0, (Number(obj.height) || 40) * Math.abs(Number(obj.scaleY) || 1));
    const originX = obj.originX || 'left';
    const originY = obj.originY || 'top';
    const originFactorX = originX === 'center' ? 0.5 : (originX === 'right' ? 1 : 0);
    const originFactorY = originY === 'center' ? 0.5 : (originY === 'bottom' ? 1 : 0);
    const angle = Number(obj.angle) || 0;
    const radians = angle * Math.PI / 180;
    const centerOffsetX = (0.5 - originFactorX) * width;
    const centerOffsetY = (0.5 - originFactorY) * height;
    const centerX = (Number(obj.left) || 0) + centerOffsetX * Math.cos(radians) - centerOffsetY * Math.sin(radians);
    const centerY = (Number(obj.top) || 0) + centerOffsetX * Math.sin(radians) + centerOffsetY * Math.cos(radians);
    const rest = { ...obj };
    delete rest.path;
    delete rest.pathOffset;
    return {
      ...rest,
      type: 'line',
      left: centerX,
      top: centerY,
      width,
      height: 0,
      x1: -width / 2,
      y1: 0,
      x2: width / 2,
      y2: 0,
      originX: 'center',
      originY: 'center',
      scaleX: 1,
      scaleY: 1,
      fill: null,
      arrowHeadSize: Number.isFinite(Number(obj.arrowHeadSize)) ? Number(obj.arrowHeadSize) : 24,
      arrowHeadStyle: obj.arrowHeadStyle || 'open'
    };
  }

  function normalizeTextBaselineValue(value) {
    return value === 'alphabetical' ? 'alphabetic' : value;
  }

  function normalizeFabricTextStyles(styles) {
    if (!styles || typeof styles !== 'object') return {};
    const entries = Array.isArray(styles) ? styles.entries() : Object.entries(styles);
    const normalized = {};
    for (const [lineIndex, lineStyles] of entries) {
      if (!lineStyles || typeof lineStyles !== 'object') continue;
      const styleEntries = Array.isArray(lineStyles) ? lineStyles.entries() : Object.entries(lineStyles);
      const normalizedLine = {};
      for (const [characterIndex, style] of styleEntries) {
        if (!style || typeof style !== 'object' || !/^\d+$/.test(String(characterIndex))) continue;
        normalizedLine[characterIndex] = {
          ...style,
          textBaseline: normalizeTextBaselineValue(style.textBaseline)
        };
        if (!normalizedLine[characterIndex].textBaseline) delete normalizedLine[characterIndex].textBaseline;
      }
      if (Object.keys(normalizedLine).length) normalized[lineIndex] = normalizedLine;
    }
    return normalized;
  }

  function sanitizeFabricTextBaseline(target) {
    if (!target) return target;
    if (target.textBaseline === 'alphabetical') {
      if (target.set) target.set('textBaseline', 'alphabetic');
      else target.textBaseline = 'alphabetic';
    }
    const textLike = typeof target.text === 'string' || String(target.type || '').toLowerCase().includes('text');
    const styles = textLike ? normalizeFabricTextStyles(target.styles) : null;
    if (textLike && target.set) target.set('styles', styles);
    else if (textLike) target.styles = styles;
    if (styles && typeof styles === 'object') {
      Object.values(styles).forEach(lineStyles => {
        if (!lineStyles || typeof lineStyles !== 'object') return;
        Object.values(lineStyles).forEach(style => {
          if (style && style.textBaseline === 'alphabetical') style.textBaseline = 'alphabetic';
        });
      });
    }
    return target;
  }

  function normalizeAnimationSettings(source = {}) {
    return {
      transitionId: typeof source.transitionId === 'string' ? source.transitionId : '',
      fragmentEnabled: source.fragmentEnabled === true,
      fragmentStyle: FRAGMENT_STYLE_CLASSES.includes(source.fragmentStyle) ? source.fragmentStyle : '',
      fragmentIndex: Number.isFinite(Number(source.fragmentIndex)) && source.fragmentIndex !== ''
        ? Math.max(0, Math.round(Number(source.fragmentIndex)))
        : null
    };
  }

  function serializeFabricCanvas(canvas) {
    return withAbsoluteFabricSelection(canvas, () => {
      const highlightedOnCanvas = ttsPlayback.fabricHighlights.some(highlight => highlight.canvas === canvas);
      const activeSegment = highlightedOnCanvas ? ttsPlayback.segments[ttsPlayback.segmentIndex] : null;
      if (highlightedOnCanvas) clearTtsFabricHighlights();
      try {
        const sourceObjects = canvas.getObjects();
        sourceObjects.forEach(sanitizeFabricTextBaseline);
        const serialized = canvas.toJSON(FABRIC_CUSTOM_PROPS);
        serialized.objects = (serialized.objects || []).map((obj, index) => {
          const source = sourceObjects[index];
          const textLike = typeof source?.text === 'string' || String(source?.type || obj?.type || '').toLowerCase().includes('text');
          const normalized = {
            ...sanitizeFabricTextBaseline(obj),
            visible: true
          };
          if (textLike) normalized.styles = normalizeFabricTextStyles(source?.styles || obj?.styles);
          return normalized;
        });
        return serialized;
      } finally {
        if (highlightedOnCanvas && ttsPlayback.active && activeSegment) highlightTtsOnSlide(activeSegment);
      }
    });
  }

  function withAbsoluteFabricSelection(canvas, operation) {
    const active = canvas?.getActiveObject?.();
    const objects = active?.type === 'activeSelection' ? canvas.getActiveObjects().slice() : [];
    if (!canvas || objects.length < 2) return operation();

    canvas.__asmSerializingSelection = true;
    canvas.discardActiveObject();
    try {
      return operation();
    } finally {
      const Fabric = f();
      if (Fabric.ActiveSelection && objects.every(obj => canvas.getObjects().includes(obj))) {
        const selection = new Fabric.ActiveSelection(objects, { canvas });
        configureSelectionControls(selection);
        canvas.setActiveObject(selection);
      }
      canvas.__asmSerializingSelection = false;
      canvas.requestRenderAll();
    }
  }

  function normalizeAlgorithmAnimation(animation = {}) {
    return window.ASMAlgorithmAnimation.normalize(animation);
  }

  function normalizeSlide(slide = {}) {
    const id = slide.id || randomId();
    const canvas = normalizeCanvasJson(slide.canvas);
    const legacyScript = typeof slide.ttsScript === 'string' ? slide.ttsScript : '';
    let legacyCarrierKey = null;
    if (legacyScript.trim() && !(canvas.objects || []).some(object => object.ttsCarrier && object.ttsScriptMode === 'manual')) {
      const ttsObjectId = randomId();
      canvas.objects.push({
        type: 'textbox',
        left: 120,
        top: 620,
        width: 360,
        text: '',
        fill: '#1f282d',
        fontSize: 28,
        fontFamily: DEFAULT_FONT_FAMILY,
        styles: {},
        ttsObjectId,
        ttsScript: legacyScript,
        ttsScriptMode: 'manual',
        ttsCarrier: true
      });
      legacyCarrierKey = `fabric:${ttsObjectId}`;
    }
    const existingOrder = Array.isArray(slide.ttsOrder) ? slide.ttsOrder.filter(key => typeof key === 'string') : [];
    const normalized = {
      ...slide,
      id,
      ttsScript: '',
      ttsOrder: legacyCarrierKey ? [legacyCarrierKey, ...existingOrder] : existingOrder,
      canvas,
      widgets: normalizeWidgets(slide.widgets)
    };
    if (slide.kind === 'algorithm-animation') {
      normalized.kind = 'algorithm-animation';
      normalized.animation = normalizeAlgorithmAnimation(slide.animation);
    }
    return normalized;
  }

  function constrainedStructureSize(widget) {
    const measured = window.AlgoStructureRenderer?.getNaturalSize(widget) || {
      width: Number(widget.w) || 320,
      height: Number(widget.h) || 160
    };
    const width = Math.max(40, Number(measured.width) || 40);
    const height = Math.max(40, Number(measured.height) || 40);
    const scale = Math.min(1, 760 / width, 460 / height);
    return {
      width: Math.max(40, Math.round(width * scale)),
      height: Math.max(40, Math.round(height * scale))
    };
  }

  function legacyTreeData(content) {
    const values = String(content || '')
      .split(/[\s,]+/)
      .map(value => value.trim())
      .filter(Boolean);
    const present = values.map(value => !/^(null|nil|#|_)$/i.test(value));
    const nodes = values.flatMap((value, index) => present[index]
      ? [{ id: `node-${index}`, value: String(value) }]
      : []);
    if (!nodes.length) nodes.push({ id: 'node-0', value: 'Root' });
    const nodeIds = new Set(nodes.map(node => node.id));
    const rootId = nodes[0].id;
    const edges = [];
    nodes.forEach(node => {
      const index = Number(node.id.slice(5));
      if (!Number.isInteger(index) || index === 0) return;
      const parentIndex = Math.floor((index - 1) / 2);
      const parentId = `node-${parentIndex}`;
      edges.push({
        from: nodeIds.has(parentId) ? parentId : rootId,
        to: node.id,
        slot: index % 2 ? 'left' : 'right',
        order: index
      });
    });
    return { rootId, nodes, edges };
  }

  function normalizeTreeData(treeData, content) {
    if (!treeData || !Array.isArray(treeData.nodes) || !treeData.nodes.length) return legacyTreeData(content);
    const seen = new Set();
    const nodes = treeData.nodes.flatMap((node, index) => {
      const id = String(node?.id || `node-${index}`);
      if (seen.has(id)) return [];
      seen.add(id);
      return [{ id, value: String(node?.value ?? '') }];
    });
    if (!nodes.length) return legacyTreeData(content);
    const ids = new Set(nodes.map(node => node.id));
    const rootId = ids.has(String(treeData.rootId)) ? String(treeData.rootId) : nodes[0].id;
    const edgeKeys = new Set();
    const parentedNodes = new Set();
    const edges = (Array.isArray(treeData.edges) ? treeData.edges : []).flatMap((edge, index) => {
      const from = String(edge?.from || '');
      const to = String(edge?.to || '');
      const key = `${from}>${to}`;
      if (!ids.has(from) || !ids.has(to) || from === to || edgeKeys.has(key) || parentedNodes.has(to) || to === rootId) return [];
      edgeKeys.add(key);
      parentedNodes.add(to);
      return [{
        from,
        to,
        slot: typeof edge.slot === 'string' ? edge.slot : 'child',
        order: Number.isFinite(Number(edge.order)) ? Number(edge.order) : index
      }];
    });
    return { rootId, nodes, edges };
  }

  function linearStructureValues(content) {
    return String(content || '')
      .split(/[\s,]+/)
      .map(value => value.trim())
      .filter(Boolean);
  }

  function matrixStructureRows(content) {
    const rows = String(content || '')
      .split(/\r?\n|;/)
      .map(row => row.split(',').map(value => value.trim()));
    return rows.some(row => row.some(value => value !== '')) ? rows : [['']];
  }

  function matrixStructureContent(rows) {
    return rows.map(row => row.join(', ')).join('\n');
  }

  function treeContentSummary(treeData) {
    return treeData.nodes.map(node => node.value).join(', ');
  }

  function normalizeWidgets(widgets) {
    return Array.isArray(widgets) ? widgets.map((widget, index) => {
      const type = widget.type === 'code'
        ? 'code'
        : (widget.type === 'structure' ? 'structure' : 'latex');
      const defaultWidth = type === 'code' ? 560 : (type === 'structure' ? 640 : 320);
      const defaultHeight = type === 'code' ? 220 : (type === 'structure' ? 300 : 96);
      const defaultFontSize = type === 'code' ? 21 : (type === 'structure' ? 18 : 34);
      const normalized = {
        id: widget.id || randomId(),
        type,
        x: Number.isFinite(widget.x) ? widget.x : 160,
        y: Number.isFinite(widget.y) ? widget.y : 160,
        w: Number.isFinite(widget.w) ? widget.w : defaultWidth,
        h: Number.isFinite(widget.h) ? widget.h : defaultHeight,
        language: typeof widget.language === 'string' ? widget.language : 'cpp',
        fontSize: Number.isFinite(widget.fontSize) ? widget.fontSize : defaultFontSize,
        focusLines: typeof widget.focusLines === 'string' ? widget.focusLines : '',
        showLineNumbers: widget.showLineNumbers === true,
        scale: Number.isFinite(widget.scale) ? widget.scale : 1,
        manualSize: widget.manualSize === true,
        layerIndex: Number.isFinite(Number(widget.layerIndex)) ? Number(widget.layerIndex) : WIDGET_LAYER_ABOVE_BASE + index,
        content: typeof widget.content === 'string' ? widget.content : '',
        ...normalizeTtsObjectFields(widget),
        ...normalizeAnimationSettings(widget)
      };
      if (type === 'latex') {
        normalized.cropX = Number.isFinite(widget.cropX) ? widget.cropX : 0;
        normalized.cropY = Number.isFinite(widget.cropY) ? widget.cropY : 0;
      }
      if (type === 'structure') {
        Object.assign(normalized, {
          structureMode: STRUCTURE_MODES.includes(widget.structureMode) ? widget.structureMode : 'normal',
          indexMode: Number.isFinite(Number(widget.indexMode)) ? Math.max(0, Math.min(4, Number(widget.indexMode))) : 0,
          indexBase: Number(widget.indexBase) === 1 ? 1 : 0,
          itemsPerRow: Number.isFinite(Number(widget.itemsPerRow)) ? Math.max(0, Number(widget.itemsPerRow)) : 0,
          gap: Number.isFinite(Number(widget.gap)) ? Math.max(0, Number(widget.gap)) : 0,
          cellSize: Number.isFinite(Number(widget.cellSize)) ? Math.max(18, Number(widget.cellSize)) : 58,
          baseFill: widget.baseFill || '#f8fbfa',
          borderColor: widget.borderColor || '#344247',
          textColor: widget.textColor || '#1f282d',
          lineColor: widget.lineColor || '#66767b',
          highlightColor: widget.highlightColor || '#ef4444',
          focusColor: widget.focusColor || '#3b82f6',
          pointColor: widget.pointColor || '#f59e0b',
          markColor: widget.markColor || '#8b5cf6',
          backgroundColor: widget.backgroundColor || '#10b981',
          frameBackgroundEnabled: widget.frameBackgroundEnabled !== false,
          frameBackgroundColor: !widget.frameBackgroundColor || widget.frameBackgroundColor === '#d1e6ac'
            ? DEFAULT_STRUCTURE_FRAME_BACKGROUND
            : widget.frameBackgroundColor,
          treeLayout: ({
            top_down: 'binary',
            left_right: 'binary',
            radial: 'compact'
          })[widget.treeLayout] || (
            ['compact', 'levelorder', 'binary', 'inorder', 'preorder', 'postorder'].includes(widget.treeLayout)
              ? widget.treeLayout
              : 'compact'
          ),
          treeHorizontal: widget.treeHorizontal === true || widget.treeLayout === 'left_right',
          treeArrowColor: (Number(widget.treeRendererVersion) || 0) < 3 && widget.treeArrowColor === '#ff3a3a'
            ? '#333333'
            : (widget.treeArrowColor || '#333333'),
          treeRendererVersion: 3,
          structureFrameVersion: Number(widget.structureFrameVersion) || 0,
          highlightIndices: typeof widget.highlightIndices === 'string' ? widget.highlightIndices : '',
          focusIndices: typeof widget.focusIndices === 'string' ? widget.focusIndices : '',
          pointIndices: typeof widget.pointIndices === 'string' ? widget.pointIndices : '',
          markIndices: typeof widget.markIndices === 'string' ? widget.markIndices : '',
          backgroundIndices: typeof widget.backgroundIndices === 'string' ? widget.backgroundIndices : ''
        });
        if (normalized.structureMode === 'binary_tree') {
          normalized.treeData = normalizeTreeData(widget.treeData, normalized.content);
        }
        if (normalized.structureFrameVersion < 4) {
          const size = constrainedStructureSize(normalized);
          const centerX = normalized.x + normalized.w / 2;
          const centerY = normalized.y + normalized.h / 2;
          normalized.w = size.width;
          normalized.h = size.height;
          normalized.x = Math.max(0, Math.min(centerX - size.width / 2, SLIDE_W - size.width));
          normalized.y = Math.max(0, Math.min(centerY - size.height / 2, SLIDE_H - size.height));
          normalized.structureFrameVersion = 4;
          normalized.manualSize = true;
        }
      }
      return normalized;
    }) : [];
  }

  function rebuildPositions() {
    slidePositions.clear();
    deck.groups.forEach((group, h) => {
      group.slides.forEach((slide, v) => {
        slidePositions.set(slide.id, { h, v });
      });
    });
  }

  function clampPosition() {
    currentH = Math.max(0, Math.min(currentH, deck.groups.length - 1));
    const group = getGroup(currentH);
    currentV = Math.max(0, Math.min(currentV, group ? group.slides.length - 1 : 0));
  }

  function renderDeck() {
    finishCodeAutoAnimation();
    finishFabricAutoAnimation();
    finishStructureAutoAnimation();
    disposeCanvases();
    rebuildPositions();
    slidesRoot.innerHTML = '';

    deck.groups.forEach((group, h) => {
      if (group.slides.length === 1) {
        slidesRoot.appendChild(createSlideSection(group.slides[0], h, 0));
        return;
      }

      const stack = document.createElement('section');
      stack.className = 'asm-stack';
      stack.dataset.groupId = group.id;
      group.slides.forEach((slide, v) => {
        stack.appendChild(createSlideSection(slide, h, v));
      });
      slidesRoot.appendChild(stack);
    });

    deck.groups.forEach(group => {
      group.slides.forEach(slide => {
        if (slide.kind !== 'algorithm-animation') syncUnifiedLayerStyles(slide, null);
      });
    });
    const buildGeneration = ++fabricBuildGeneration;
    fabricBuildPromise = buildFabricCanvases(buildGeneration);
    fabricBuildPromise.then(() => {
      if (buildGeneration !== fabricBuildGeneration || !customOverviewOpen) return;
      renderCustomOverview();
    });
    applyEditMode(document.body.classList.contains('asm-edit-mode'));
    syncTtsEditor();

    if (reveal) {
      reveal.sync();
      clampPosition();
      reveal.slide(currentH, currentV);
      setTimeout(() => {
        reveal.layout();
        refreshRevealWidgets();
        if (reveal.isOverview && reveal.isOverview()) {
          prepareOverview();
          refreshOverviewScrollbars();
        }
      }, 40);
    }
  }

  function refreshCustomOverviewAfterFabricBuild({ scroll = false } = {}) {
    if (!customOverviewOpen) return;
    const buildGeneration = fabricBuildGeneration;
    fabricBuildPromise.then(() => {
      if (buildGeneration !== fabricBuildGeneration || !customOverviewOpen) return;
      renderCustomOverview();
      if (scroll) requestAnimationFrame(() => scrollCustomOverviewSelectionIntoView());
    });
  }

  async function restoreDeckInPlace(previousDeck) {
    finishCodeAutoAnimation();
    finishFabricAutoAnimation();
    finishStructureAutoAnimation();
    rebuildPositions();
    const previousSlides = new Map();
    previousDeck.groups.forEach(group => {
      group.slides.forEach(slide => previousSlides.set(slide.id, slide));
    });

    for (const group of deck.groups) {
      for (const slide of group.slides) {
        const section = document.querySelector(`section.asm-slide[data-slide-id="${slide.id}"]`);
        applySlideAutoAnimateAttributes(section, slide);
        if (slide.kind === 'algorithm-animation') continue;
        reconcileSlideWidgets(section?.querySelector('.widget-layer'), slide, previousSlides.get(slide.id));
        const canvas = fabricCanvases.get(slide.id);
        if (!canvas) continue;
        await loadSlideCanvas(canvas, slide);
        syncFabricFragmentProxies(slide.id, canvas);
      }
    }

    if (selectedWidgetId && !getWidget(selectedWidgetId).widget) selectedWidgetId = null;
    applyEditMode(document.body.classList.contains('asm-edit-mode'));
    if (reveal) {
      syncRevealPreservingPosition();
      reveal.layout();
    }
    if (selectedWidgetId) showWidgetEditor(selectedWidgetId);
    else showDefaultPanel();
    updateAlgorithmEditButton();
    syncTtsEditor();
    updateDiagnostics();
  }

  function refreshRevealWidgets() {
    const highlightPlugin = reveal && reveal.getPlugin && reveal.getPlugin('highlight');
    document.body.dataset.highlightApi = highlightPlugin ? Object.keys(highlightPlugin).join(',') : 'missing';
    document.querySelectorAll('.code-widget').forEach(el => {
      const found = getWidget(el.dataset.widgetId);
      if (!found.widget) return;
      paintWidgetElement(el, found.widget);
      highlightCodeWidget(el);
    });
    document.querySelectorAll('.structure-widget').forEach(el => {
      const found = getWidget(el.dataset.widgetId);
      if (found.widget) paintStructureWidget(el, found.widget);
    });
    renderMathWidgets(slidesRoot);
    autoSizeLatexWidgets(slidesRoot);
    if (reveal) reveal.layout();
  }

  function refreshWidgetElement(el, widget) {
    if (!el || !widget) return;
    if (widget.type === 'code') {
      paintWidgetElement(el, widget);
      highlightCodeWidget(el);
    } else if (widget.type === 'structure') {
      paintStructureWidget(el, widget);
    } else {
      renderMathWidgets(el);
      autoSizeLatexWidgets(el);
    }
    if (reveal) reveal.layout();
  }

  function highlightCodeWidget(el) {
    const code = el && el.querySelector('code');
    if (!code) return;
    code.removeAttribute('data-highlighted');
    const highlightPlugin = reveal && reveal.getPlugin && reveal.getPlugin('highlight');
    if (highlightPlugin && highlightPlugin.highlightBlock) {
      highlightPlugin.highlightBlock(code);
    } else if (window.hljs) {
      window.hljs.highlightElement(code);
    }
    if (!el.dataset.codeAutoAnimating) {
      const widget = getWidget(el.dataset.widgetId).widget;
      scrollCodeWidgetToFocus(el, widget);
      requestAnimationFrame(() => scrollCodeWidgetToFocus(el, widget));
    }
  }

  function focusedCodeLineNumbers(focusLines, totalLines) {
    const selected = new Set();
    String(focusLines || '').split(',').forEach(part => {
      const match = part.trim().match(/^(\d+)(?:-(\d+))?$/);
      if (!match) return;
      const start = Math.max(1, Math.min(totalLines, Number(match[1])));
      const end = Math.max(1, Math.min(totalLines, Number(match[2] || match[1])));
      for (let line = Math.min(start, end); line <= Math.max(start, end); line += 1) selected.add(line);
    });
    return Array.from(selected).sort((a, b) => a - b);
  }

  function codeFocusScrollTop(el, widget) {
    const pre = el?.querySelector('pre');
    const code = pre?.querySelector('code');
    if (!pre || !code || !widget) return 0;
    const lines = focusedCodeLineNumbers(widget.focusLines, String(widget.content || '').split('\n').length);
    if (!lines.length) return 0;
    const rows = Array.from(code.querySelectorAll('.hljs-ln tr'));
    const firstRow = rows[lines[0] - 1];
    const lastRow = rows[lines[lines.length - 1] - 1];
    const lineHeight = parseFloat(getComputedStyle(code).lineHeight) || (Number(widget.fontSize) || 21) * 1.2;
    const preRect = pre.getBoundingClientRect();
    const scaleY = pre.clientHeight ? preRect.height / pre.clientHeight : 1;
    const top = firstRow
      ? ((firstRow.getBoundingClientRect().top - preRect.top) / (scaleY || 1)) + pre.scrollTop
      : (lines[0] - 1) * lineHeight;
    const bottom = lastRow
      ? ((lastRow.getBoundingClientRect().bottom - preRect.top) / (scaleY || 1)) + pre.scrollTop
      : lines[lines.length - 1] * lineHeight;
    const viewportHeight = Math.max(1, pre.clientHeight);
    const focusCenter = (top + bottom - 1) / 2;
    const targetScrollTop = Math.max(0, Math.min(pre.scrollHeight - viewportHeight, focusCenter - (viewportHeight / 2)));
    return targetScrollTop;
  }

  function scrollCodeWidgetToFocus(el, widget, behavior = 'auto') {
    const pre = el?.querySelector('pre');
    if (!pre || !widget) return;
    pre.scrollTo({ top: codeFocusScrollTop(el, widget), behavior });
  }

  function normalizeLatexSource(source = '') {
    return String(source || '')
      .replace(/(^|[^\\])\/([a-zA-Z]+)/g, '$1\\$2')
      .trim();
  }

  function stripLatexDelimiters(source = '') {
    const text = normalizeLatexSource(source);
    const displayMatch = text.match(/^\\\[([\s\S]*)\\\]$/) || text.match(/^\$\$([\s\S]*)\$\$$/);
    const inlineMatch = text.match(/^\\\(([\s\S]*)\\\)$/) || text.match(/^\$([\s\S]*)\$$/);
    return (displayMatch || inlineMatch)?.[1] || text;
  }

  function latexToPlainText(source = '') {
    return stripLatexDelimiters(source)
      .replace(/\\leq\b/g, '\u2264')
      .replace(/\\geq\b/g, '\u2265')
      .replace(/\\neq\b/g, '\u2260')
      .replace(/\\times\b/g, '\u00d7')
      .replace(/\\cdot\b/g, '\u00b7')
      .replace(/\\rightarrow\b/g, '\u2192')
      .replace(/\\leftarrow\b/g, '\u2190')
      .replace(/\\alpha\b/g, '\u03b1')
      .replace(/\\beta\b/g, '\u03b2')
      .replace(/\\gamma\b/g, '\u03b3')
      .replace(/\\theta\b/g, '\u03b8')
      .replace(/\\pi\b/g, '\u03c0')
      .replace(/\\sum\b/g, '\u03a3')
      .replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, '$1/$2')
      .replace(/[{}]/g, '')
      .replace(/\\/g, '');
  }

  function renderMathWidgets(root) {
    const elements = [
      ...(root?.matches?.('.latex-content') ? [root] : []),
      ...Array.from(root?.querySelectorAll?.('.latex-content') || [])
    ].filter(el => {
      const source = normalizeLatexSource(el.dataset.latexSource || el.textContent || '');
      el.dataset.latexSource = source;
      return el.dataset.latexRenderedSource !== source;
    });
    elements.forEach(el => {
      el.textContent = el.dataset.latexSource || '';
    });
    if (!elements.length) return;
    if (window.katex?.render) {
      elements.forEach(el => {
        try {
          window.katex.render(stripLatexDelimiters(el.dataset.latexSource), el, { throwOnError: false });
          el.dataset.latexRenderedSource = el.dataset.latexSource;
          el.dataset.latexRenderedEngine = 'katex';
        } catch (err) {
          console.warn('KaTeX render failed', err);
          el.textContent = latexToPlainText(el.dataset.latexSource);
          el.dataset.latexRenderedSource = el.dataset.latexSource;
          el.dataset.latexRenderedEngine = 'plain';
        }
      });
      return;
    }
    if (window.MathJax?.typesetPromise) {
      window.MathJax.typesetPromise(elements.length ? elements : [root]).then(() => {
        elements.forEach(el => {
          if ((el.textContent || '').trim() === (el.dataset.latexSource || '').trim()) {
            el.textContent = latexToPlainText(el.dataset.latexSource);
          }
          el.dataset.latexRenderedSource = el.dataset.latexSource;
          el.dataset.latexRenderedEngine = 'mathjax';
        });
      }).catch(err => {
        console.warn('MathJax render failed', err);
        elements.forEach(el => {
          el.textContent = latexToPlainText(el.dataset.latexSource);
          el.dataset.latexRenderedSource = el.dataset.latexSource;
          el.dataset.latexRenderedEngine = 'plain';
        });
      });
      return;
    }
    if (window.renderMathInElement) {
      window.renderMathInElement(root, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
          { left: '\\(', right: '\\)', display: false },
          { left: '\\[', right: '\\]', display: true }
        ]
      });
      elements.forEach(el => {
        if (!el.querySelector('.katex') && (el.textContent || '').trim() === (el.dataset.latexSource || '').trim()) {
          el.textContent = latexToPlainText(el.dataset.latexSource);
        }
        el.dataset.latexRenderedSource = el.dataset.latexSource;
        el.dataset.latexRenderedEngine = 'auto-render';
      });
      return;
    }
    elements.forEach(el => {
      el.textContent = latexToPlainText(el.dataset.latexSource);
      el.dataset.latexRenderedSource = el.dataset.latexSource;
      el.dataset.latexRenderedEngine = 'plain';
    });
  }

  function autoSizeLatexWidgets(root = document) {
    let changed = false;
    const widgets = [
      ...(root?.matches?.('.latex-widget') ? [root] : []),
      ...Array.from(root?.querySelectorAll?.('.latex-widget') || [])
    ];
    widgets.forEach(el => {
      if (!slidesRoot.contains(el)) return;
      const content = el.querySelector('.latex-content');
      const rendered = content && (content.querySelector('.katex') || content);
      if (!content || !rendered) return;
      const renderedRect = rendered.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();
      const layerRect = el.closest('.widget-layer').getBoundingClientRect();
      if (layerRect.width <= 1 || layerRect.height <= 1) return;
      const scaleX = layerRect.width / SLIDE_W;
      const scaleY = layerRect.height / SLIDE_H;
      const rawOffsetX = (renderedRect.left - contentRect.left) / scaleX;
      const rawOffsetY = (renderedRect.top - contentRect.top) / scaleY;
      const width = Math.max(20, renderedRect.width / scaleX);
      const height = Math.max(20, renderedRect.height / scaleY);
      const found = getWidget(el.dataset.widgetId);
      if (!found.widget) return;
      const changedWidget = Math.abs((found.widget.w || 0) - width) > 0.5
        || Math.abs((found.widget.h || 0) - height) > 0.5
        || Math.abs((found.widget.cropX || 0) - rawOffsetX) > 0.5
        || Math.abs((found.widget.cropY || 0) - rawOffsetY) > 0.5;
      if (changedWidget) changed = true;
      found.widget.w = width;
      found.widget.h = height;
      found.widget.cropX = rawOffsetX;
      found.widget.cropY = rawOffsetY;
      found.widget.manualSize = false;
      el.dataset.manualSize = 'false';
      el.style.left = `${found.widget.x}px`;
      el.style.top = `${found.widget.y}px`;
      el.style.width = `${width}px`;
      el.style.height = `${height}px`;
      positionWidgetContent(el, found.widget);
    });
    if (changed) saveDeck({ history: false });
  }

  function applyAnimationAttributes(el, source) {
    const animation = normalizeAnimationSettings(source);
    FRAGMENT_STYLE_CLASSES.forEach(className => el.classList.remove(className));
    el.classList.toggle('fragment', animation.fragmentEnabled);
    if (animation.fragmentEnabled && animation.fragmentStyle) el.classList.add(animation.fragmentStyle);
    if (source.type === 'code' && animation.transitionId) el.dataset.codeTransition = 'true';
    else delete el.dataset.codeTransition;
    if (source.type === 'structure' && animation.transitionId) el.dataset.structureTransition = 'true';
    else delete el.dataset.structureTransition;
    if (source.type !== 'code' && source.type !== 'structure' && animation.transitionId) el.dataset.id = animation.transitionId;
    else delete el.dataset.id;
    if (animation.fragmentEnabled && animation.fragmentIndex !== null) {
      el.dataset.fragmentIndex = String(animation.fragmentIndex);
    } else {
      delete el.dataset.fragmentIndex;
    }
  }

  function slideUsesAutoAnimate(slide) {
    const widgets = normalizeWidgets(slide.widgets);
    const objects = ((slide.canvas && slide.canvas.objects) || []);
    return [...widgets, ...objects].some(item => normalizeAnimationSettings(item).transitionId);
  }

  function applySlideAutoAnimateAttributes(section, slide) {
    if (!section) return;
    if (slideUsesAutoAnimate(slide)) {
      if (!section.hasAttribute('data-auto-animate')) section.setAttribute('data-auto-animate', '');
      section.setAttribute('data-auto-animate-unmatched', 'false');
    } else {
      section.removeAttribute('data-auto-animate');
      section.removeAttribute('data-auto-animate-unmatched');
    }
  }

  function syncSlideAutoAnimate(slide) {
    if (!slide) return;
    const section = document.querySelector(`section.asm-slide[data-slide-id="${slide.id}"]`);
    applySlideAutoAnimateAttributes(section, slide);
  }

  function createSlideSection(slide, h, v) {
    const section = document.createElement('section');
    section.className = 'asm-slide';
    section.dataset.slideId = slide.id;
    section.dataset.h = String(h);
    section.dataset.v = String(v);
    applySlidePageEnterState(section, slide.id);
    applySlideAutoAnimateAttributes(section, slide);
    if (slide.kind === 'algorithm-animation') {
      section.classList.add('algorithm-animation-slide');
      renderAlgorithmSlide(section, slide);
      appendSlideEdgeAddButtons(section, slide.id);
      return section;
    }
      section.innerHTML = `
        <div class="asm-slide-frame-content">
          <div class="fabric-host" data-slide-id="${slide.id}">
            <canvas id="fabric-${slide.id}" width="${SLIDE_W}" height="${SLIDE_H}"></canvas>
          </div>
          <div class="widget-layer" data-slide-id="${slide.id}"></div>
        </div>
      `;
    renderSlideWidgets(section.querySelector('.widget-layer'), slide);
    syncUnifiedLayerStyles(slide, null);
    appendSlideEdgeAddButtons(section, slide.id);
    return section;
  }

  function renderAlgorithmSlide(section, slide) {
    const animation = normalizeAlgorithmAnimation(slide.animation);
    const hasScript = !!animation.scriptContent || !!animation.traceDocument?.frames?.length;
    section.innerHTML = `
      <div class="asm-slide-frame-content">
        <iframe
          class="algorithm-slide-frame"
          data-slide-id="${slide.id}"
          title="Algorithm animation"
          src="${hasScript ? 'algorithm.html?asmEmbed=runtime&v=trace-runtime-32' : 'about:blank'}"
          ${hasScript ? '' : 'hidden'}
        ></iframe>
        <div class="algorithm-slide-placeholder" ${hasScript ? 'hidden' : ''}>
          <div>演算法動畫投影片<span>點選左側橘色按鈕輸入程式碼並編譯</span></div>
        </div>
      </div>
    `;
  }

  function appendSlideEdgeAddButtons(section, slideId) {
    section.insertAdjacentHTML('beforeend', `
      <button class="slide-edge-add slide-edge-add-right" type="button" data-add-slide-right="${slideId}" title="向右新增投影片" aria-label="向右新增投影片">+</button>
      <button class="slide-edge-add slide-edge-add-bottom" type="button" data-add-slide-bottom="${slideId}" title="向下新增投影片" aria-label="向下新增投影片">+</button>
    `);
  }

  function disposeCanvases() {
    fabricCanvases.forEach(canvas => canvas.dispose());
    fabricCanvases.clear();
  }

  function renderSlideWidgets(layer, slide) {
    if (!layer) return;
    layer.innerHTML = '';
    normalizeWidgets(slide.widgets).forEach(widget => {
      layer.appendChild(createWidgetElement(widget));
    });
  }

  function reconcileSlideWidgets(layer, slide, previousSlide) {
    if (!layer) return;
    const previousWidgets = new Map(normalizeWidgets(previousSlide?.widgets).map(widget => [widget.id, widget]));
    const widgets = normalizeWidgets(slide.widgets);
    const widgetIds = new Set(widgets.map(widget => widget.id));
    layer.querySelectorAll('.slide-widget').forEach(el => {
      if (!widgetIds.has(el.dataset.widgetId)) el.remove();
    });
    widgets.forEach(widget => {
      let el = layer.querySelector(`.slide-widget[data-widget-id="${widget.id}"]`);
      if (!el) {
        el = createWidgetElement(widget);
        layer.appendChild(el);
        refreshWidgetElement(el, widget);
        return;
      }
      syncWidgetElementInPlace(el, widget, previousWidgets.get(widget.id));
      layer.appendChild(el);
    });
  }

  function syncWidgetElementInPlace(el, widget, previousWidget) {
    el.dataset.widgetType = widget.type;
    el.dataset.manualSize = widget.manualSize ? 'true' : 'false';
    el.style.left = `${widget.x}px`;
    el.style.top = `${widget.y}px`;
    el.style.width = `${widget.w}px`;
    el.style.height = `${widget.h}px`;
    el.style.fontSize = `${widget.fontSize}px`;
    el.style.zIndex = String(Math.round(Number(widget.layerIndex) || WIDGET_LAYER_ABOVE_BASE));
    applyAnimationAttributes(el, widget);
    const contentChanged = !previousWidget || [
      'type', 'content', 'language', 'focusLines', 'showLineNumbers', 'fontSize', 'scale', 'cropX', 'cropY'
    ].some(key => previousWidget[key] !== widget[key]);
    const structureChanged = widget.type === 'structure' && (!previousWidget || [
      'structureMode', 'indexMode', 'indexBase', 'itemsPerRow', 'gap', 'cellSize',
      'baseFill', 'borderColor', 'textColor', 'lineColor',
      'highlightColor', 'focusColor', 'pointColor', 'markColor', 'backgroundColor',
      'highlightIndices', 'focusIndices', 'pointIndices', 'markIndices', 'backgroundIndices',
      'frameBackgroundEnabled', 'frameBackgroundColor', 'treeLayout', 'treeArrowColor',
      'treeData', 'structureFrameVersion',
      'w', 'h'
    ].some(key => previousWidget[key] !== widget[key]));
    if (contentChanged || structureChanged) refreshWidgetElement(el, widget);
    else positionWidgetContent(el, widget);
    el.classList.toggle('is-selected', el.dataset.widgetId === selectedWidgetId);
  }

  function createWidgetElement(widget) {
    const el = document.createElement('div');
    el.className = `slide-widget ${widget.type}-widget`;
    el.dataset.widgetId = widget.id;
    el.dataset.widgetType = widget.type;
    el.dataset.manualSize = widget.manualSize ? 'true' : 'false';
    el.draggable = false;
    el.style.left = `${widget.x}px`;
    el.style.top = `${widget.y}px`;
    el.style.width = `${widget.w}px`;
    el.style.height = `${widget.h}px`;
    el.style.fontSize = `${widget.fontSize}px`;
    el.style.zIndex = String(Math.round(Number(widget.layerIndex) || WIDGET_LAYER_ABOVE_BASE));
    applyAnimationAttributes(el, widget);
    paintWidgetElement(el, widget);
    return el;
  }

  function appendWidgetsToCurrentSlide(widgets) {
    const slide = getSlide();
    const layer = slide && document.querySelector(`.widget-layer[data-slide-id="${slide.id}"]`);
    if (!layer) return;
    document.querySelectorAll('.slide-widget.is-selected').forEach(el => el.classList.remove('is-selected'));
    widgets.forEach(widget => layer.appendChild(createWidgetElement(widget)));
  }

  function paintWidgetElement(el, widget) {
    el.innerHTML = '';
    if (widget.type === 'code') {
      el.innerHTML = `<div class="code-frame"><pre class="widget-content"><code class="language-${widget.language || 'cpp'}"></code></pre></div>`;
      const code = el.querySelector('code');
      code.textContent = widget.content || defaultCode();
      applyCodeFocusLines(code, widget.focusLines, widget.showLineNumbers);
    } else if (widget.type === 'structure') {
      const content = document.createElement('div');
      content.className = 'widget-content structure-content';
      el.appendChild(content);
      window.AlgoStructureRenderer?.render(content, widget);
    } else {
      const content = document.createElement('div');
      content.className = 'widget-content latex-content';
      const latexSource = normalizeLatexSource(widget.content || String.raw`\(\sum_{i=1}^{n} i = \frac{n(n+1)}{2}\)`);
      content.dataset.latexSource = latexSource;
      content.textContent = latexSource;
      el.appendChild(content);
    }
    positionWidgetContent(el, widget);
    const handles = widget.type === 'code' || widget.type === 'structure'
      ? ['top-left', 'top', 'top-right', 'right', 'bottom-right', 'bottom', 'bottom-left', 'left']
        .map(edge => ['widget-edge-handle', 'resizeEdge', edge])
      : [];
    handles.forEach(([className, dataKey, value]) => {
      const handle = document.createElement('span');
      handle.className = className;
      handle.dataset[dataKey] = value;
      el.appendChild(handle);
    });
  }

  function paintStructureWidget(el, widget) {
    if (!el || !widget || widget.type !== 'structure') return;
    let content = el.querySelector('.structure-content');
    if (!content) {
      paintWidgetElement(el, widget);
      return;
    }
    content.style.width = `${widget.w}px`;
    content.style.height = `${widget.h}px`;
    window.AlgoStructureRenderer?.render(content, widget);
    restoreStructureCellSelection(el);
  }

  function positionWidgetContent(el, widget) {
    const content = el.querySelector('.widget-content');
    if (!content) return;
    if (widget.type === 'code' || widget.type === 'structure') {
      const code = content.querySelector('code');
      const frame = el.querySelector('.code-frame');
      if (frame) {
        frame.style.width = `${widget.w}px`;
        frame.style.height = `${widget.h}px`;
      }
      content.style.left = '0px';
      content.style.top = '0px';
      content.style.width = `${widget.w}px`;
      content.style.height = `${widget.h}px`;
      content.style.transform = '';
      if (widget.type === 'structure') {
        window.AlgoStructureRenderer?.render(content, widget);
        restoreStructureCellSelection(el);
        return;
      }
      if (code) {
        code.style.left = '0px';
        code.style.width = '100%';
        code.style.transform = '';
      }
      return;
    }
    content.style.left = `${-(widget.cropX || 0)}px`;
    content.style.top = `${-(widget.cropY || 0)}px`;
    content.style.transformOrigin = '0 0';
    content.style.transform = widget.type === 'latex' ? `scale(${widget.scale || 1})` : '';
  }

  async function buildFabricCanvases(buildGeneration = fabricBuildGeneration) {
    if (buildGeneration !== fabricBuildGeneration) return;
    document.body.dataset.fabricBuild = 'starting';
    patchFabricTextCompositionUnderline();
    for (const group of deck.groups) {
      for (const slide of group.slides) {
        if (buildGeneration !== fabricBuildGeneration) return;
        const el = document.getElementById(`fabric-${slide.id}`);
        if (!el) continue;
        try {
          const Fabric = f();
          const canvas = new Fabric.Canvas(el, {
            width: SLIDE_W + FABRIC_BLEED * 2,
            height: SLIDE_H + FABRIC_BLEED * 2,
            backgroundColor: 'rgba(0,0,0,0)',
            preserveObjectStacking: true,
            selection: true,
            targetFindTolerance: 8,
            stopContextMenu: true,
            uniformScaling: false,
            uniScaleKey: 'shiftKey'
          });

          fabricCanvases.set(slide.id, canvas);
          blockRevealNavigationWhileEditing(canvas);
          wireCanvas(canvas, slide);
          await loadSlideCanvas(canvas, slide);
          if (buildGeneration !== fabricBuildGeneration) {
            if (fabricCanvases.get(slide.id) === canvas) fabricCanvases.delete(slide.id);
            canvas.dispose();
            return;
          }
          syncFabricFragmentProxies(slide.id, canvas);
          syncUnifiedLayerStyles(slide, canvas);
        } catch (err) {
          if (buildGeneration !== fabricBuildGeneration) return;
          document.body.dataset.fabricBuild = `failed: ${err.message}`;
          console.error('Fabric canvas initialization failed', err);
          return;
        }
      }
    }
    if (buildGeneration !== fabricBuildGeneration) return;
    document.body.dataset.fabricBuild = `ready:${fabricCanvases.size}`;
    updateDiagnostics();
  }

  function patchFabricTextCompositionUnderline() {
    const Fabric = f();
    const proto = Fabric?.IText?.prototype;
    if (!proto || proto.__asmCompositionUnderlinePatched || typeof proto.renderSelection !== 'function') return;
    const original = proto.renderSelection;
    proto.renderSelection = function (boundaries, ctx) {
      if (!this.inCompositionMode) return original.call(this, boundaries, ctx);
      try {
        const textareaStart = this.hiddenTextarea?.selectionStart ?? this.selectionStart ?? 0;
        const textareaEnd = this.hiddenTextarea?.selectionEnd ?? this.selectionEnd ?? textareaStart;
        const compositionStart = Number.isFinite(Number(this.compositionStart)) ? Number(this.compositionStart) : textareaStart;
        const compositionEnd = Number.isFinite(Number(this.compositionEnd)) ? Number(this.compositionEnd) : textareaEnd;
        const selectionStart = Math.min(compositionStart, compositionEnd, textareaStart, textareaEnd);
        let selectionEnd = Math.max(compositionStart, compositionEnd, textareaStart, textareaEnd);
        if (selectionEnd <= selectionStart) selectionEnd = Math.min((this.text || '').length, selectionStart + 1);
        const start = this.get2DCursorLocation(selectionStart);
        const end = this.get2DCursorLocation(selectionEnd);
        const startLine = start.lineIndex;
        const endLine = end.lineIndex;
        let topOffset = boundaries.topOffset;
        ctx.save();
        ctx.strokeStyle = this.compositionColor || '#1d8f83';
        ctx.lineWidth = Math.max(1, 1 / ((this.scaleX || 1) * (this.canvas?.getZoom?.() || 1)));
        ctx.setLineDash([1, 2]);
        for (let i = startLine; i <= endLine; i++) {
          const lineOffset = this._getLineLeftOffset(i) || 0;
          const lineHeight = this.getHeightOfLine(i);
          const startChar = i === startLine ? Math.max(0, start.charIndex) : 0;
          const endChar = i === endLine ? Math.max(0, end.charIndex) : (this.__charBounds[i]?.length || 0);
          const lineBounds = this.__charBounds[i] || [];
          const first = lineBounds[startChar] || lineBounds[0];
          const last = endChar > 0 ? lineBounds[endChar - 1] : first;
          if (first && last) {
            let x1 = boundaries.left + lineOffset + first.left;
            let x2 = boundaries.left + lineOffset + last.left + last.width;
            if (this.direction === 'rtl') {
              const width = x2 - x1;
              x1 = this.width - x1 - width;
              x2 = x1 + width;
            }
            const y = boundaries.top + topOffset + lineHeight;
            ctx.beginPath();
            ctx.moveTo(x1, y);
            ctx.lineTo(x2, y);
            ctx.stroke();
          }
          topOffset += lineHeight;
        }
        ctx.restore();
      } catch (err) {
        ctx.restore?.();
        return original.call(this, boundaries, ctx);
      }
    };
    Object.defineProperty(proto, '__asmCompositionUnderlinePatched', { value: true });
  }

  async function loadSlideCanvas(canvas, slide) {
    const json = normalizeCanvasJson(slide.canvas);
    suppressCanvasSave = true;
    try {
      await new Promise(resolve => {
        canvas.loadFromJSON(json, () => {
          canvas.setViewportTransform([1, 0, 0, 1, FABRIC_BLEED, FABRIC_BLEED]);
          canvas.getObjects().forEach(configureObject);
          canvas.renderAll();
          resolve();
        });
      });
    } finally {
      suppressCanvasSave = false;
    }
  }

  function wireCanvas(canvas, slide) {
    const sync = (event, { syncFragments = false } = {}) => {
      if (suppressCanvasSave) return;
      normalizeShapeGeometry(event && event.target, canvas);
      slide.canvas = serializeFabricCanvas(canvas);
      saveDeck();
      syncSlideAutoAnimate(slide);
      if (syncFragments) syncFabricFragmentProxies(slide.id, canvas);
      updateObjectToolbar(canvas.getActiveObject(), canvas);
    };
    canvas.on('object:added', event => sync(event, { syncFragments: true }));
    canvas.on('object:modified', sync);
    canvas.on('object:removed', event => sync(event, { syncFragments: true }));
    canvas.on('text:changed', sync);
    canvas.on('selection:created', e => {
      if (canvas.__asmSerializingSelection) return;
      exitWidgetEditorIfNeeded();
      configureSelectionControls(canvas.getActiveObject());
      updateObjectToolbar(e.selected && e.selected[0], canvas);
      updateAlignmentToolbar();
      canvas.requestRenderAll();
    });
    canvas.on('selection:updated', e => {
      if (canvas.__asmSerializingSelection) return;
      exitWidgetEditorIfNeeded();
      configureSelectionControls(canvas.getActiveObject());
      updateObjectToolbar(e.selected && e.selected[0], canvas);
      updateAlignmentToolbar();
      canvas.requestRenderAll();
    });
    canvas.on('selection:cleared', () => {
      if (canvas.__asmSerializingSelection) return;
      hideObjectToolbar();
      if (!selectedWidgetId) showDefaultPanel();
      updateAlignmentToolbar();
      clearSnapGuides();
    });
    canvas.on('mouse:down', e => {
      if (e.target) {
        e.target.__asmMoveOrigin = {
          left: e.target.left || 0,
          top: e.target.top || 0
        };
        e.target.__asmShiftLockAxis = null;
      }
    });
    canvas.on('object:moving', e => {
      finishFabricAutoAnimation();
      canvas.__asmInteractionDirty = true;
      constrainFabricMoveWithShift(e);
      applyFabricObjectSnap(e, canvas);
      updateObjectToolbar(e.target, canvas);
    });
    canvas.on('object:scaling', e => {
      canvas.__asmInteractionDirty = true;
      keepShapeStrokeUniform(e.target, canvas);
      normalizeTextBoxResize(e.target, canvas);
      applyFabricResizeSnap(e, canvas);
      updateObjectToolbar(e.target, canvas);
    });
    canvas.on('object:rotating', e => {
      canvas.__asmInteractionDirty = true;
      clearSnapGuides();
      updateObjectToolbar(e.target, canvas);
    });
    canvas.on('mouse:up', () => {
      if (canvas.__asmInteractionDirty) {
        canvas.__asmInteractionDirty = false;
        sync({ target: canvas.getActiveObject() });
      }
      clearSnapGuides();
      canvas.getObjects().forEach(obj => {
        obj.__asmMoveOrigin = null;
        obj.__asmShiftLockAxis = null;
      });
      updateObjectToolbar(canvas.getActiveObject(), canvas);
    });
    canvas.on('text:selection:changed', e => updateObjectToolbar(e.target, canvas));
    canvas.on('text:editing:entered', e => {
      if (e.target) {
        e.target.set?.({
          hasBorders: true,
          hasControls: true,
          cornerSize: 8,
          touchCornerSize: 14,
          padding: 0,
          cursorDelay: 500,
          cursorDuration: 1,
          compositionColor: '#1d8f83'
        });
        e.target.setCoords?.();
      }
      updateObjectToolbar(e.target, canvas);
      canvas.requestRenderAll();
    });
    canvas.on('text:editing:exited', () => {
      textSelection = null;
      hideObjectToolbar({ keepAnimation: true });
      showFabricObjectEditor(canvas.getActiveObject());
    });
    canvas.on('after:render', () => drawEditingTextControls(canvas));
  }

  function drawEditingTextControls(canvas) {
    const obj = canvas?.getActiveObject?.();
    if (!obj || !isTextObject(obj) || !obj.isEditing || typeof obj._renderControls !== 'function') return;
    const ctx = canvas.contextTop;
    if (!ctx) return;
    obj._renderControls(ctx, {
      hasBorders: true,
      hasControls: true,
      cornerColor: obj.cornerColor,
      cornerStrokeColor: obj.cornerStrokeColor,
      borderColor: obj.borderColor
    });
  }

  function configureSelectionControls(obj) {
    if (!obj?.set) return;
    obj.set({
      cornerColor: '#1d8f83',
      cornerStrokeColor: '#1d8f83',
      borderColor: '#1d8f83',
      cornerStyle: 'circle',
      transparentCorners: false,
      cornerSize: 8,
      touchCornerSize: 14,
      padding: 0,
      borderDashArray: null,
      cornerDashArray: null,
      borderScaleFactor: 1
    });
    if (isSegmentObject(obj)) configureSegmentControls(obj);
    obj.setCoords?.();
  }

  function isSegmentObject(obj) {
    return !!(obj && obj.type === 'line' && ['line', 'arrow'].includes(shapeType(obj)));
  }

  function segmentSceneEndpoints(obj) {
    const Fabric = f();
    const points = obj.calcLinePoints();
    const matrix = obj.calcTransformMatrix();
    return {
      start: Fabric.util.transformPoint(new Fabric.Point(points.x1, points.y1), matrix),
      end: Fabric.util.transformPoint(new Fabric.Point(points.x2, points.y2), matrix)
    };
  }

  function setSegmentSceneEndpoints(obj, start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.max(4, Math.hypot(dx, dy));
    const center = {
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2
    };
    obj.set({
      originX: 'center',
      originY: 'center',
      scaleX: 1,
      scaleY: 1,
      skewX: 0,
      skewY: 0,
      flipX: false,
      flipY: false
    });
    obj.set({ x1: -length / 2, y1: 0, x2: length / 2, y2: 0 });
    obj.set({
      left: center.x,
      top: center.y,
      angle: Math.atan2(dy, dx) * 180 / Math.PI
    });
    obj.dirty = true;
    obj.setCoords?.();
  }

  function segmentControlPosition(endpoint) {
    return function (_dimensions, finalMatrix, obj) {
      const Fabric = f();
      const points = obj.calcLinePoints();
      const point = endpoint === 'start'
        ? new Fabric.Point(points.x1, points.y1)
        : new Fabric.Point(points.x2, points.y2);
      return Fabric.util.transformPoint(point, finalMatrix);
    };
  }

  function segmentControlAction(endpoint) {
    return function (_eventData, transform, x, y) {
      const Fabric = f();
      const obj = transform.target;
      const endpoints = segmentSceneEndpoints(obj);
      const dragged = new Fabric.Point(x, y);
      setSegmentSceneEndpoints(
        obj,
        endpoint === 'start' ? dragged : endpoints.start,
        endpoint === 'end' ? dragged : endpoints.end
      );
      if (obj.canvas) {
        obj.canvas.__asmInteractionDirty = true;
        obj.canvas.requestRenderAll();
        updateObjectToolbar(obj, obj.canvas);
      }
      return true;
    };
  }

  function renderSegmentControl(ctx, left, top) {
    ctx.save();
    ctx.translate(left, top);
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#1d8f83';
    ctx.fill();
    ctx.restore();
  }

  function configureSegmentControls(obj) {
    const Fabric = f();
    if (!obj.__asmSegmentNormalized) {
      const endpoints = segmentSceneEndpoints(obj);
      setSegmentSceneEndpoints(obj, endpoints.start, endpoints.end);
      Object.defineProperty(obj, '__asmSegmentNormalized', { value: true, configurable: true });
    }
    obj.set({ hasBorders: false, padding: 0 });
    obj.controls = {
      start: new Fabric.Control({
        positionHandler: segmentControlPosition('start'),
        actionHandler: segmentControlAction('start'),
        actionName: 'modifySegment',
        cursorStyle: 'crosshair',
        render: renderSegmentControl,
        cornerSize: 8,
        touchSizeX: 18,
        touchSizeY: 18
      }),
      end: new Fabric.Control({
        positionHandler: segmentControlPosition('end'),
        actionHandler: segmentControlAction('end'),
        actionName: 'modifySegment',
        cursorStyle: 'crosshair',
        render: renderSegmentControl,
        cornerSize: 8,
        touchSizeX: 18,
        touchSizeY: 18
      })
    };
    if (shapeType(obj) === 'arrow') installArrowRenderer(obj);
  }

  function installArrowRenderer(obj) {
    if (obj.__asmArrowRendererInstalled) return;
    obj._render = function (ctx) {
      const Fabric = f();
      Fabric.Line.prototype._render.call(this, ctx);
      const points = this.calcLinePoints();
      const size = Math.max(6, Math.min(80, Number(this.arrowHeadSize) || 24));
      const style = ['open', 'triangle', 'diamond', 'circle'].includes(this.arrowHeadStyle)
        ? this.arrowHeadStyle
        : 'open';
      const angle = Math.atan2(points.y2 - points.y1, points.x2 - points.x1);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const point = (back, side = 0) => ({
        x: points.x2 - cos * back - sin * side,
        y: points.y2 - sin * back + cos * side
      });
      const tip = point(0, 0);
      const upper = point(size, size * 0.52);
      const lower = point(size, -size * 0.52);
      ctx.save();
      ctx.beginPath();
      ctx.lineWidth = Math.max(0.5, Number(this.strokeWidth) || 1);
      ctx.lineCap = this.strokeLineCap || 'round';
      ctx.lineJoin = this.strokeLineJoin || 'round';
      ctx.strokeStyle = this.stroke || '#344247';
      ctx.fillStyle = this.stroke || '#344247';
      if (style === 'open') {
        ctx.moveTo(upper.x, upper.y);
        ctx.lineTo(tip.x, tip.y);
        ctx.lineTo(lower.x, lower.y);
        ctx.stroke();
      } else if (style === 'triangle') {
        ctx.moveTo(tip.x, tip.y);
        ctx.lineTo(upper.x, upper.y);
        ctx.lineTo(lower.x, lower.y);
        ctx.closePath();
        ctx.fill();
      } else if (style === 'diamond') {
        const rear = point(size * 1.35, 0);
        ctx.moveTo(tip.x, tip.y);
        ctx.lineTo(upper.x, upper.y);
        ctx.lineTo(rear.x, rear.y);
        ctx.lineTo(lower.x, lower.y);
        ctx.closePath();
        ctx.fill();
      } else {
        const center = point(size * 0.34, 0);
        ctx.arc(center.x, center.y, size * 0.34, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };
    Object.defineProperty(obj, '__asmArrowRendererInstalled', { value: true, configurable: true });
  }

  function configureObject(obj) {
    sanitizeFabricTextBaseline(obj);
    const animation = normalizeAnimationSettings(obj);
    configureSelectionControls(obj);
    obj.set({
      lockScalingFlip: true,
      strokeUniform: true,
      cursorDelay: 500,
      cursorDuration: 1,
      compositionColor: '#1d8f83',
      objectCaching: isShapeObject(obj) ? false : !isTextObject(obj),
      noScaleCache: isShapeObject(obj) ? false : obj.noScaleCache,
      ...animation,
      ttsObjectId: obj.ttsObjectId || randomId(),
      ...normalizeTtsObjectFields(obj),
      fragmentProxyId: obj.fragmentProxyId || randomId(),
      layerIndex: Number.isFinite(Number(obj.layerIndex)) ? Number(obj.layerIndex) : FABRIC_LAYER_INDEX,
      cornerRadius: Number.isFinite(Number(obj.cornerRadius)) ? Math.max(0, Number(obj.cornerRadius)) : (Number(obj.rx) || 0)
    });
    if (shapeType(obj) === 'arrow') {
      obj.set({
        arrowHeadSize: Math.max(6, Math.min(80, Number(obj.arrowHeadSize) || 24)),
        arrowHeadStyle: ['open', 'triangle', 'diamond', 'circle'].includes(obj.arrowHeadStyle) ? obj.arrowHeadStyle : 'open'
      });
    }
  }

  function blockRevealNavigationWhileEditing(canvas) {
    if (!canvas || !canvas.upperCanvasEl) return;
    ['pointerdown', 'pointermove', 'pointerup', 'touchstart', 'touchmove', 'touchend'].forEach(type => {
      canvas.upperCanvasEl.addEventListener(type, event => {
        if (document.body.classList.contains('asm-edit-mode')) event.stopPropagation();
      });
    });
  }

  function keepShapeStrokeUniform(obj, canvas) {
    if (!isShapeObject(obj)) return;
    obj.set({ strokeUniform: true, objectCaching: false, noScaleCache: false });
    obj.dirty = true;
    if (canvas) canvas.requestRenderAll();
  }

  function constrainFabricMoveWithShift(event) {
    const obj = event?.target;
    if (!obj || !event?.e?.shiftKey) {
      if (obj) obj.__asmShiftLockAxis = null;
      return;
    }
    const origin = obj.__asmMoveOrigin || {
      left: obj.left || 0,
      top: obj.top || 0
    };
    const dx = (obj.left || 0) - origin.left;
    const dy = (obj.top || 0) - origin.top;
    if (!obj.__asmShiftLockAxis && Math.abs(dx) + Math.abs(dy) >= 2) {
      obj.__asmShiftLockAxis = Math.abs(dx) >= Math.abs(dy) ? 'horizontal' : 'vertical';
    }
    if (obj.__asmShiftLockAxis === 'horizontal') obj.set('top', origin.top);
    if (obj.__asmShiftLockAxis === 'vertical') obj.set('left', origin.left);
    obj.setCoords();
  }

  function normalizeShapeGeometry(obj, canvas) {
    if (!isShapeObject(obj)) return;
    if (obj.type === 'line' || obj.type === 'path') return;
    const scaleX = Number.isFinite(obj.scaleX) ? obj.scaleX : 1;
    const scaleY = Number.isFinite(obj.scaleY) ? obj.scaleY : 1;
    if (Math.abs(Math.abs(scaleX) - 1) < 0.001 && Math.abs(Math.abs(scaleY) - 1) < 0.001) return;
    if (obj.type === 'circle' && Math.abs(Math.abs(scaleX) - Math.abs(scaleY)) > 0.001) return;
    const center = obj.getCenterPoint();
    if (obj.type === 'circle') {
      obj.set({ radius: Math.max(2, (Number(obj.radius) || 2) * Math.abs(scaleX)) });
    } else {
      obj.set({
        width: Math.max(4, (Number(obj.width) || 4) * Math.abs(scaleX)),
        height: Math.max(4, (Number(obj.height) || 4) * Math.abs(scaleY))
      });
    }
    obj.set({ scaleX: Math.sign(scaleX) || 1, scaleY: Math.sign(scaleY) || 1 });
    obj.setPositionByOrigin(center, 'center', 'center');
    obj.setCoords();
    obj.dirty = true;
    if (canvas) canvas.requestRenderAll();
  }

  function syncRevealPreservingPosition() {
    if (!revealReady || !reveal) return;
    const indices = reveal.getIndices ? reveal.getIndices() : { h: currentH, v: currentV };
    reveal.sync();
    if (!indices || !Number.isFinite(indices.h)) return;
    const v = Number.isFinite(indices.v) ? indices.v : 0;
    if (Number.isFinite(indices.f)) reveal.slide(indices.h, v, indices.f);
    else reveal.slide(indices.h, v);
  }

  function fabricAnimationState(obj) {
    const properties = [
      'left', 'top', 'width', 'height', 'scaleX', 'scaleY', 'angle', 'opacity',
      'strokeWidth', 'rx', 'ry', 'radius', 'fontSize'
    ];
    const numeric = properties.reduce((state, property) => {
      if (Number.isFinite(Number(obj[property]))) state[property] = Number(obj[property]);
      return state;
    }, {});
    const colors = ['fill', 'stroke', 'backgroundColor', 'textBackgroundColor'].reduce((state, property) => {
      if (typeof obj[property] === 'string') state[property] = obj[property];
      return state;
    }, {});
    return { numeric, colors };
  }

  function interpolateFabricColor(from, to, progress) {
    const Fabric = f();
    if (!Fabric?.Color || typeof from !== 'string' || typeof to !== 'string') return to;
    const start = new Fabric.Color(from).getSource();
    const end = new Fabric.Color(to).getSource();
    return `rgba(${start.map((value, index) => {
      const next = value + ((end[index] - value) * progress);
      return index < 3 ? Math.round(next) : Math.round(next * 1000) / 1000;
    }).join(',')})`;
  }

  function applyFabricAnimationState(obj, from, to, progress) {
    const patch = {};
    Object.keys(to.numeric).forEach(property => {
      patch[property] = Number.isFinite(from.numeric[property])
        ? from.numeric[property] + ((to.numeric[property] - from.numeric[property]) * progress)
        : to.numeric[property];
    });
    Object.keys(to.colors).forEach(property => {
      patch[property] = from.colors[property]
        ? interpolateFabricColor(from.colors[property], to.colors[property], progress)
        : to.colors[property];
    });
    obj.set(patch);
    obj.setCoords();
    obj.dirty = true;
  }

  function finishFabricAutoAnimation() {
    if (!activeFabricAutoAnimation) return;
    cancelAnimationFrame(activeFabricAutoAnimation.frame);
    const canvases = new Set();
    activeFabricAutoAnimation.targets.forEach(({ canvas, object, final }) => {
      applyFabricAnimationState(object, final, final, 1);
      canvases.add(canvas);
    });
    canvases.forEach(canvas => canvas.requestRenderAll());
    activeFabricAutoAnimation = null;
  }

  function finishCodeAutoAnimation() {
    if (!activeCodeAutoAnimation) return;
    cancelAnimationFrame(activeCodeAutoAnimation.frame);
    activeCodeAutoAnimation.targets.forEach(({ el, widget, finalScroll }) => {
      setCodeAutoAnimationBox(el, widget);
      const pre = el.querySelector('pre');
      if (pre) {
        pre.scrollTop = Number.isFinite(finalScroll) ? finalScroll : codeFocusScrollTop(el, widget);
      }
      el.style.removeProperty('visibility');
      delete el.dataset.codeAutoAnimating;
    });
    activeCodeAutoAnimation = null;
  }

  function restoreStructureAutoAnimationBox(el, widget) {
    if (!el || !widget) return;
    ['left', 'top', 'width', 'height', 'transform', 'transition', 'visibility'].forEach(property => {
      el.style.removeProperty(property);
    });
    el.style.left = `${widget.x}px`;
    el.style.top = `${widget.y}px`;
    el.style.width = `${widget.w}px`;
    el.style.height = `${widget.h}px`;
    const content = el.querySelector('.structure-content');
    if (content) {
      content.style.width = `${widget.w}px`;
      content.style.height = `${widget.h}px`;
    }
    delete el.dataset.structureAutoAnimating;
  }

  function setStructureAutoAnimationPosition(el, x, y) {
    el.style.setProperty('left', `${x}px`, 'important');
    el.style.setProperty('top', `${y}px`, 'important');
  }

  function clearStructurePartStyles(parts = []) {
    parts.forEach(({ element }) => {
      ['opacity', 'clip-path', 'stroke-dasharray', 'stroke-dashoffset', 'transition', 'translate', 'transform-box', 'transform-origin']
        .forEach(property => element.style.removeProperty(property));
    });
  }

  function restoreStructureFrameTargets(frames = []) {
    frames.forEach(frame => frame.element.setAttribute(frame.attribute, String(frame.final)));
  }

  function cleanupStructureRemovedParts(parts = [], viewport = null) {
    parts.forEach(part => part.element.remove());
    if (viewport?.svg) viewport.svg.style.overflow = viewport.overflow;
  }

  function finishStructureAutoAnimation() {
    if (!activeStructureAutoAnimation) return;
    cancelAnimationFrame(activeStructureAutoAnimation.frame);
    activeStructureAutoAnimation.targets.forEach(({ el, widget, parts, removedParts, frames, viewport }) => {
      clearStructurePartStyles(parts);
      cleanupStructureRemovedParts(removedParts, viewport);
      restoreStructureFrameTargets(frames);
      restoreStructureAutoAnimationBox(el, widget);
    });
    activeStructureAutoAnimation = null;
  }

  function disableRevealStructureAnimation(el, widget) {
    if (!el || !widget) return;
    [el, ...el.querySelectorAll('[data-auto-animate-target]')].forEach(node => {
      node.removeAttribute('data-auto-animate-target');
      node.style.removeProperty('transform');
      node.style.removeProperty('transition');
    });
    el.style.setProperty('left', `${widget.x}px`, 'important');
    el.style.setProperty('top', `${widget.y}px`, 'important');
    el.style.setProperty('width', `${widget.w}px`, 'important');
    el.style.setProperty('height', `${widget.h}px`, 'important');
    el.style.setProperty('transform', 'none', 'important');
    el.style.setProperty('transition', 'none', 'important');
  }

  function structureSourceState(widget) {
    const mode = widget?.structureMode || 'normal';
    const values = linearStructureValues(widget?.content);
    const matrixRows = mode === 'matrix' ? matrixStructureRows(widget?.content) : [];
    const tree = mode === 'binary_tree' ? normalizeTreeData(widget?.treeData, widget?.content) : { nodes: [], edges: [] };
    return {
      mode,
      valueCount: Math.max(1, values.length),
      matrixRows: matrixRows.length,
      matrixColumns: matrixRows.length ? Math.max(1, ...matrixRows.map(row => row.length)) : 0,
      treeNodeIds: new Set(tree.nodes.map(node => String(node.id))),
      treeEdgeIds: new Set(tree.edges.map(edge => `${edge.from}>${edge.to}`))
    };
  }

  function structureAnimationParts(el, sourceEl, source, widget) {
    const svg = el?.querySelector('.structure-content svg');
    if (!svg) return [];
    const sourceState = structureSourceState(source);
    const sameMode = sourceState.mode === (widget.structureMode || 'normal');
    const candidates = Array.from(svg.querySelectorAll('.tree-node, [data-structure-item-index]'));
    const items = candidates.filter(candidate => !candidates.some(other => other !== candidate && other.contains(candidate)));
    const itemSet = new Set(items);
    const parts = items.reduce((result, element, index) => {
      const treeDepth = Number(element.dataset.treeDepth);
      const itemIndex = Number(element.dataset.structureItemIndex);
      const matrixRow = Number(element.dataset.matrixRow);
      const matrixColumn = Number(element.dataset.matrixColumn);
      const treeNodeId = String(element.dataset.treeNodeId || '');
      const existed = sameMode && (element.classList.contains('tree-node')
        ? sourceState.treeNodeIds.has(treeNodeId)
        : (sourceState.mode === 'matrix'
          ? matrixRow < sourceState.matrixRows && matrixColumn < sourceState.matrixColumns
          : itemIndex < sourceState.valueCount));
      if (existed) return result;
      result.push({
        element,
        kind: element.classList.contains('tree-node') ? 'tree-node' : 'item',
        order: Number.isFinite(treeDepth) ? treeDepth * 2 : (Number.isFinite(itemIndex) ? itemIndex : index)
      });
      return result;
    }, []);
    const edges = Array.from(svg.querySelectorAll('.tree-edge, line, path, polyline')).filter(element => {
      if (element.closest('defs')) return false;
      return !items.some(item => item === element || item.contains(element)) && !itemSet.has(element);
    });
    const sourceEdgeCount = sourceEl
      ? Array.from(sourceEl.querySelectorAll('.tree-edge, line, path, polyline')).filter(element => (
        !element.closest('defs') && !element.closest('.tree-node, [data-structure-item-index]')
      )).length
      : 0;
    edges.forEach((element, index) => {
      const edgeId = `${element.dataset.treeEdgeFrom || ''}>${element.dataset.treeEdgeTo || ''}`;
      const existed = sameMode && (element.classList.contains('tree-edge')
        ? sourceState.treeEdgeIds.has(edgeId)
        : index < sourceEdgeCount);
      if (existed) return;
      parts.push({ element, kind: 'edge', order: index + 0.5 });
    });
    if (!parts.length && !sameMode) {
      const root = svg.querySelector('[data-slide-structure]');
      if (root) parts.push({ element: root, kind: 'item', order: 0 });
    }
    return parts;
  }

  function appendStructureRemovedGhost(destinationRoot, sourceElement, kind, order) {
    if (!destinationRoot || !sourceElement) return null;
    const clone = sourceElement.cloneNode(true);
    clone.removeAttribute('id');
    clone.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
    clone.setAttribute('data-structure-removed-ghost', 'true');
    clone.style.pointerEvents = 'none';
    if (kind === 'edge') {
      const firstNode = destinationRoot.querySelector('.tree-node, [data-structure-item-index]');
      if (firstNode) destinationRoot.insertBefore(clone, firstNode);
      else destinationRoot.appendChild(clone);
    } else {
      destinationRoot.appendChild(clone);
    }
    return { element: clone, kind, order };
  }

  function structureRemovedParts(sourceEl, el, source, widget) {
    if (!sourceEl || !el || source.structureMode !== widget.structureMode) return [];
    const destinationRoot = el.querySelector('[data-slide-structure]');
    if (!destinationRoot) return [];
    const destinationState = structureSourceState(widget);
    const sourceCandidates = Array.from(sourceEl.querySelectorAll('.tree-node, [data-structure-item-index]'));
    const sourceItems = sourceCandidates.filter(candidate => (
      !sourceCandidates.some(other => other !== candidate && other.contains(candidate))
    ));
    const removed = [];
    sourceItems.forEach((element, index) => {
      const itemIndex = Number(element.dataset.structureItemIndex);
      const matrixRow = Number(element.dataset.matrixRow);
      const matrixColumn = Number(element.dataset.matrixColumn);
      const treeNodeId = String(element.dataset.treeNodeId || '');
      const stillExists = element.classList.contains('tree-node')
        ? destinationState.treeNodeIds.has(treeNodeId)
        : (destinationState.mode === 'matrix'
          ? matrixRow < destinationState.matrixRows && matrixColumn < destinationState.matrixColumns
          : itemIndex < destinationState.valueCount);
      if (stillExists) return;
      const order = Number.isFinite(Number(element.dataset.treeDepth))
        ? Number(element.dataset.treeDepth) * 2
        : (Number.isFinite(itemIndex) ? itemIndex : index);
      const ghost = appendStructureRemovedGhost(
        destinationRoot,
        element,
        element.classList.contains('tree-node') ? 'tree-node' : 'item',
        order
      );
      if (ghost) removed.push(ghost);
      if (!element.classList.contains('tree-node') && element.id) {
        const indexElement = sourceEl.querySelector(`#${CSS.escape(`${element.id}-index`)}`);
        const indexGhost = appendStructureRemovedGhost(destinationRoot, indexElement, 'item', order);
        if (indexGhost) removed.push(indexGhost);
      }
    });

    const sourceEdges = Array.from(sourceEl.querySelectorAll('.tree-edge, line, path, polyline')).filter(element => (
      !element.closest('defs') && !element.closest('.tree-node, [data-structure-item-index]')
    ));
    const destinationEdges = Array.from(el.querySelectorAll('.tree-edge, line, path, polyline')).filter(element => (
      !element.closest('defs') && !element.closest('.tree-node, [data-structure-item-index]')
    ));
    sourceEdges.forEach((element, index) => {
      const edgeId = `${element.dataset.treeEdgeFrom || ''}>${element.dataset.treeEdgeTo || ''}`;
      const stillExists = element.classList.contains('tree-edge')
        ? destinationState.treeEdgeIds.has(edgeId)
        : index < destinationEdges.length;
      if (stillExists) return;
      const ghost = appendStructureRemovedGhost(destinationRoot, element, 'edge', index + 0.5);
      if (ghost) removed.push(ghost);
    });
    return removed;
  }

  function prepareStructureAnimationViewport(el, removedParts) {
    if (!removedParts.length) return null;
    const svg = el.querySelector('.structure-content svg');
    if (!svg) return null;
    const viewport = { svg, overflow: svg.style.overflow };
    svg.style.overflow = 'visible';
    return viewport;
  }

  function structureFrameTargets(el, sourceEl, source, widget) {
    if (!el || !sourceEl || source.structureMode !== widget.structureMode) return [];
    const definitions = [
      ['.outerframe-bg', ['x', 'y', 'width', 'height']],
      ['.outerframe-nb', ['x', 'y', 'width', 'height']],
      ['.outerframe-label', ['x', 'y']]
    ];
    return definitions.flatMap(([selector, attributes]) => {
      const element = el.querySelector(selector);
      const sourceElement = sourceEl.querySelector(selector);
      if (!element || !sourceElement) return [];
      return attributes.flatMap(attribute => {
        const start = Number(sourceElement.getAttribute(attribute));
        const final = Number(element.getAttribute(attribute));
        if (!Number.isFinite(start) || !Number.isFinite(final) || Math.abs(start - final) < 0.01) return [];
        return [{ element, attribute, start, final }];
      });
    });
  }

  function setStructureFrameProgress(frames, progress) {
    const value = Math.max(0, Math.min(1, progress));
    const eased = 1 - Math.pow(1 - value, 3);
    frames.forEach(frame => {
      frame.element.setAttribute(frame.attribute, String(frame.start + ((frame.final - frame.start) * eased)));
    });
  }

  function setStructurePartProgress(part, progress) {
    const value = Math.max(0, Math.min(1, progress));
    const eased = 1 - Math.pow(1 - value, 3);
    part.element.style.opacity = String(Math.min(1, eased * 1.5));
    part.element.style.setProperty('transform-box', 'fill-box');
    part.element.style.setProperty('transform-origin', 'center');
    part.element.style.translate = `0 ${(1 - eased) * 12}px`;
  }

  function setStructureRemovedPartProgress(part, progress) {
    const value = Math.max(0, Math.min(1, progress));
    const eased = 1 - Math.pow(1 - value, 3);
    part.element.style.opacity = String(1 - eased);
    part.element.style.setProperty('transform-box', 'fill-box');
    part.element.style.setProperty('transform-origin', 'center');
    part.element.style.translate = `0 ${-12 * eased}px`;
    if (part.kind !== 'edge') return;
    if (!Number.isFinite(part.length)) {
      try {
        part.length = Math.max(1, part.element.getTotalLength());
      } catch (error) {
        part.length = 1;
      }
    }
    part.element.style.strokeDasharray = `${part.length} ${part.length}`;
    part.element.style.strokeDashoffset = String(part.length * eased);
  }

  function setCodeAutoAnimationBox(el, box) {
    const keys = { left: 'x', top: 'y', width: 'w', height: 'h' };
    ['left', 'top', 'width', 'height'].forEach(property => {
      el.style.setProperty(property, `${box[keys[property]]}px`, 'important');
    });
    el.style.setProperty('transform', 'none', 'important');
    syncCodeContentBox(el, box);
  }

  function syncCodeContentBox(el, box) {
    if (!el?.classList?.contains('code-widget')) return;
    const frame = el.querySelector('.code-frame');
    const pre = el.querySelector('pre.widget-content');
    if (frame) {
      frame.style.width = `${box.w}px`;
      frame.style.height = `${box.h}px`;
    }
    if (pre) {
      pre.style.width = `${box.w}px`;
      pre.style.height = `${box.h}px`;
    }
  }

  function disableRevealCodeAnimation(el) {
    [el, ...el.querySelectorAll('[data-auto-animate-target]')].forEach(node => {
      node.removeAttribute('data-auto-animate-target');
      node.style.removeProperty('transform');
      node.style.removeProperty('transition');
    });
    el.style.setProperty('transform', 'none', 'important');
    el.style.setProperty('transition', 'none', 'important');
  }

  function resetCodeWidgetRuntimeStyles(el, widget) {
    if (!el || !widget) return;
    disableRevealCodeAnimation(el);
    setCodeAutoAnimationBox(el, widget);
    positionWidgetContent(el, widget);
  }

  function animateCodeAutoTransition(event) {
    finishCodeAutoAnimation();
    const fromSlide = getSlideById(event?.fromSlide?.dataset.slideId);
    const toSlide = getSlideById(event?.toSlide?.dataset.slideId);
    if (!fromSlide || !toSlide) return;
    const fromWidgets = new Map(normalizeWidgets(fromSlide.widgets)
      .filter(widget => widget.type === 'code' && widget.transitionId.trim())
      .map(widget => [widget.transitionId.trim(), widget]));
    const targets = normalizeWidgets(toSlide.widgets).reduce((matches, widget) => {
      const source = widget.type === 'code' && fromWidgets.get(widget.transitionId.trim());
      const el = source && event.toSlide.querySelector(`.code-widget[data-widget-id="${widget.id}"]`);
      if (!source || !el) return matches;
      el.dataset.codeAutoAnimating = 'true';
      el.style.setProperty('visibility', 'hidden', 'important');
      disableRevealCodeAnimation(el);
      const sourceEl = event.fromSlide.querySelector(`.code-widget[data-widget-id="${source.id}"]`);
      resetCodeWidgetRuntimeStyles(sourceEl, source);
      const initialScroll = sourceEl?.querySelector('pre')?.scrollTop || 0;
      setCodeAutoAnimationBox(el, source);
      const pre = el.querySelector('pre');
      if (pre) pre.scrollTop = initialScroll;
      void el.offsetHeight;
      matches.push({ el, source, widget, initialScroll, finalScroll: null });
      return matches;
    }, []);
    document.body.dataset.codeAutoAnimateCount = String(targets.length);
    if (!targets.length) return;

    const duration = Math.max(0, Number(reveal?.getConfig?.().autoAnimateDuration) || 1) * 1000;
    const startedAt = performance.now();
    const animation = { frame: 0, targets };
    activeCodeAutoAnimation = animation;
    const tick = now => {
      if (activeCodeAutoAnimation !== animation) return;
      const elapsed = duration ? Math.min(1, (now - startedAt) / duration) : 1;
      const boxProgress = Math.min(1, elapsed / 0.5);
      const boxEased = 1 - Math.pow(1 - boxProgress, 3);
      const scrollProgress = Math.max(0, Math.min(1, (elapsed - 0.5) / 0.5));
      const scrollEased = Math.pow(scrollProgress, 4);
      targets.forEach(target => {
        const { el, source, widget, initialScroll } = target;
        setCodeAutoAnimationBox(el, {
          x: source.x + ((widget.x - source.x) * boxEased),
          y: source.y + ((widget.y - source.y) * boxEased),
          w: source.w + ((widget.w - source.w) * boxEased),
          h: source.h + ((widget.h - source.h) * boxEased)
        });
        const pre = el.querySelector('pre');
        if (pre) {
          if (scrollProgress > 0 && !Number.isFinite(target.finalScroll)) {
            target.finalScroll = codeFocusScrollTop(el, widget);
          }
          const finalScroll = Number.isFinite(target.finalScroll) ? target.finalScroll : initialScroll;
          pre.scrollTop = initialScroll + ((finalScroll - initialScroll) * scrollEased);
        }
      });
      if (elapsed < 1) animation.frame = requestAnimationFrame(tick);
      else {
        targets.forEach(({ el, widget, finalScroll }) => {
          setCodeAutoAnimationBox(el, widget);
          const pre = el.querySelector('pre');
          if (pre) {
            pre.scrollTop = Number.isFinite(finalScroll) ? finalScroll : codeFocusScrollTop(el, widget);
          }
          el.style.removeProperty('visibility');
          delete el.dataset.codeAutoAnimating;
        });
        activeCodeAutoAnimation = null;
      }
    };
    animation.frame = requestAnimationFrame(now => {
      targets.forEach(({ el }) => el.style.removeProperty('visibility'));
      tick(now);
    });
  }

  function animateStructureAutoTransition(event) {
    finishStructureAutoAnimation();
    const fromSlide = getSlideById(event?.fromSlide?.dataset.slideId);
    const toSlide = getSlideById(event?.toSlide?.dataset.slideId);
    if (!fromSlide || !toSlide) return;
    const fromWidgets = new Map(normalizeWidgets(fromSlide.widgets)
      .filter(widget => widget.type === 'structure' && widget.transitionId.trim())
      .map(widget => [widget.transitionId.trim(), widget]));
    const targets = normalizeWidgets(toSlide.widgets).reduce((matches, widget) => {
      if (widget.type !== 'structure') return matches;
      const transitionId = widget.transitionId.trim();
      const source = transitionId && fromWidgets.get(transitionId);
      const el = source && event.toSlide.querySelector(`.structure-widget[data-widget-id="${widget.id}"]`);
      if (!source || !el) return matches;
      const sourceEl = event.fromSlide.querySelector(`.structure-widget[data-widget-id="${source.id}"]`);
      disableRevealStructureAnimation(el, widget);
      el.dataset.structureAutoAnimating = 'true';
      el.style.setProperty('visibility', 'hidden', 'important');
      const parts = structureAnimationParts(el, sourceEl, source, widget);
      const removedParts = structureRemovedParts(sourceEl, el, source, widget);
      const frames = structureFrameTargets(el, sourceEl, source, widget);
      const positionChanged = Math.abs(source.x - widget.x) > 0.01 || Math.abs(source.y - widget.y) > 0.01;
      if (!parts.length && !removedParts.length && !frames.length && !positionChanged) {
        el.style.removeProperty('visibility');
        restoreStructureAutoAnimationBox(el, widget);
        return matches;
      }
      const viewport = prepareStructureAnimationViewport(el, removedParts);
      parts.forEach(part => setStructurePartProgress(part, 0));
      removedParts.forEach(part => setStructureRemovedPartProgress(part, 0));
      setStructureFrameProgress(frames, 0);
      setStructureAutoAnimationPosition(el, source.x, source.y);
      matches.push({ el, source, widget, parts, removedParts, frames, viewport });
      return matches;
    }, []);
    document.body.dataset.structureAutoAnimateCount = String(targets.length);
    document.body.dataset.structureAutoAnimatePartCount = String(targets.reduce((sum, target) => sum + target.parts.length, 0));
    document.body.dataset.structureAutoAnimateRemovedCount = String(targets.reduce((sum, target) => sum + target.removedParts.length, 0));
    document.body.dataset.structureAutoAnimateFrameCount = String(targets.reduce((sum, target) => sum + target.frames.length, 0));
    document.body.dataset.structureAutoAnimateStyle = 'extend-reveal-and-remove';
    if (!targets.length) return;

    const duration = Math.max(0, Number(reveal?.getConfig?.().autoAnimateDuration) || 1) * 1000;
    const startedAt = performance.now();
    const animation = { frame: 0, targets };
    activeStructureAutoAnimation = animation;
    const tick = now => {
      if (activeStructureAutoAnimation !== animation) return;
      const elapsed = duration ? Math.min(1, (now - startedAt) / duration) : 1;
      const positionProgress = 1 - Math.pow(1 - elapsed, 3);
      targets.forEach(({ el, source, widget, parts, removedParts, frames }) => {
        setStructureAutoAnimationPosition(
          el,
          source.x + ((widget.x - source.x) * positionProgress),
          source.y + ((widget.y - source.y) * positionProgress)
        );
        const frameDelay = removedParts.length ? 0.26 : 0;
        const frameProgress = Math.max(0, Math.min(1, (elapsed - frameDelay) / Math.max(0.01, 1 - frameDelay)));
        setStructureFrameProgress(frames, frameProgress);
        const maxOrder = Math.max(0, ...parts.map(part => part.order));
        parts.forEach(part => {
          const stagger = maxOrder > 0 ? (part.order / maxOrder) * 0.24 : 0;
          const delay = Math.min(0.62, 0.34 + stagger);
          const progress = Math.max(0, Math.min(1, (elapsed - delay) / Math.max(0.01, 1 - delay)));
          setStructurePartProgress(part, progress);
        });
        const maxRemovedOrder = Math.max(0, ...removedParts.map(part => part.order));
        removedParts.forEach(part => {
          const reverseOrder = maxRemovedOrder > 0 ? (maxRemovedOrder - part.order) / maxRemovedOrder : 0;
          const delay = Math.max(0, reverseOrder * 0.1);
          const progress = Math.max(0, Math.min(1, (elapsed - delay) / 0.46));
          setStructureRemovedPartProgress(part, progress);
        });
      });
      if (elapsed < 1) {
        animation.frame = requestAnimationFrame(tick);
        return;
      }
      targets.forEach(({ el, widget, parts, removedParts, frames, viewport }) => {
        clearStructurePartStyles(parts);
        cleanupStructureRemovedParts(removedParts, viewport);
        restoreStructureFrameTargets(frames);
        restoreStructureAutoAnimationBox(el, widget);
      });
      activeStructureAutoAnimation = null;
    };
    animation.frame = requestAnimationFrame(now => {
      targets.forEach(({ el }) => el.style.removeProperty('visibility'));
      tick(now);
    });
  }

  function animateSlideAutoTransition(event) {
    animateFabricAutoTransition(event);
    animateCodeAutoTransition(event);
    animateStructureAutoTransition(event);
  }

  function animateFabricAutoTransition(event) {
    finishFabricAutoAnimation();
    const fromSlideId = event?.fromSlide?.dataset.slideId;
    const toSlideId = event?.toSlide?.dataset.slideId;
    const fromCanvas = fabricCanvases.get(fromSlideId);
    const toCanvas = fabricCanvases.get(toSlideId);
    if (!fromCanvas || !toCanvas) return;

    const fromObjects = new Map();
    fromCanvas.getObjects().forEach(obj => {
      const id = normalizeAnimationSettings(obj).transitionId.trim();
      if (id && !fromObjects.has(id)) fromObjects.set(id, obj);
    });
    const targets = toCanvas.getObjects().reduce((matches, object) => {
      const id = normalizeAnimationSettings(object).transitionId.trim();
      const source = id && fromObjects.get(id);
      if (!source) return matches;
      const initial = fabricAnimationState(source);
      const final = fabricAnimationState(object);
      applyFabricAnimationState(object, initial, final, 0);
      matches.push({ canvas: toCanvas, object, initial, final });
      return matches;
    }, []);
    document.body.dataset.fabricAutoAnimateCount = String(targets.length);
    if (!targets.length) return;

    const duration = Math.max(0, Number(reveal?.getConfig?.().autoAnimateDuration) || 1) * 1000;
    const startedAt = performance.now();
    const animation = { frame: 0, targets };
    activeFabricAutoAnimation = animation;
    const tick = now => {
      if (activeFabricAutoAnimation !== animation) return;
      const elapsed = duration ? Math.min(1, (now - startedAt) / duration) : 1;
      const eased = 1 - Math.pow(1 - elapsed, 3);
      targets.forEach(({ canvas, object, initial, final }) => {
        applyFabricAnimationState(object, initial, final, eased);
        canvas.requestRenderAll();
      });
      if (elapsed < 1) animation.frame = requestAnimationFrame(tick);
      else activeFabricAutoAnimation = null;
    };
    animation.frame = requestAnimationFrame(tick);
  }

  function syncFabricFragmentProxies(slideId, canvas) {
    const layer = document.querySelector(`.widget-layer[data-slide-id="${slideId}"]`);
    if (!layer || !canvas) return;
    const existing = new Map(Array.from(layer.querySelectorAll('.fabric-fragment-proxy'))
      .map(proxy => [proxy.dataset.fabricProxyId, proxy]));
    let fragmentsChanged = false;
    canvas.getObjects().forEach(obj => {
      configureObject(obj);
      let proxy = existing.get(obj.fragmentProxyId);
      if (!obj.fragmentEnabled) {
        if (proxy) {
          proxy.remove();
          existing.delete(obj.fragmentProxyId);
          fragmentsChanged = true;
        }
        return;
      }
      if (!proxy) {
        proxy = document.createElement('span');
        proxy.className = 'fabric-fragment-proxy';
        layer.appendChild(proxy);
        fragmentsChanged = true;
      }
      const previousIndex = proxy.dataset.fragmentIndex || '';
      proxy.dataset.fabricProxyId = obj.fragmentProxyId;
      applyAnimationAttributes(proxy, obj);
      if (previousIndex !== (proxy.dataset.fragmentIndex || '')) fragmentsChanged = true;
      existing.delete(obj.fragmentProxyId);
    });
    existing.forEach(proxy => {
      proxy.remove();
      fragmentsChanged = true;
    });
    if (fragmentsChanged) syncRevealPreservingPosition();
    refreshFabricFragmentVisibility();
  }

  function refreshFabricFragmentVisibility() {
    const editing = document.body.classList.contains('asm-edit-mode');
    fabricCanvases.forEach((canvas, slideId) => {
      const layer = document.querySelector(`.widget-layer[data-slide-id="${slideId}"]`);
      const proxies = new Map(Array.from(layer?.querySelectorAll('.fabric-fragment-proxy') || [])
        .map(proxy => [proxy.dataset.fabricProxyId, proxy]));
      canvas.getObjects().forEach(obj => {
        const proxy = obj.fragmentEnabled && proxies.get(obj.fragmentProxyId);
        obj.visible = !obj.fragmentEnabled || editing || !!proxy?.classList.contains('visible');
      });
      canvas.requestRenderAll();
    });
  }

  function normalizeTextBoxResize(obj, canvas) {
    if (!isTextObject(obj)) return;
    const scaleX = Number.isFinite(obj.scaleX) ? obj.scaleX : 1;
    if (Math.abs(scaleX - 1) < 0.001 && Math.abs((obj.scaleY || 1) - 1) < 0.001) return;
    const nextWidth = Math.max(40, (obj.width || 40) * scaleX);
    obj.set({
      width: nextWidth,
      scaleX: 1,
      scaleY: 1
    });
    if (obj.initDimensions) obj.initDimensions();
    obj.dirty = true;
    obj.setCoords();
    if (canvas) {
      if (canvas.clearContext && canvas.contextTop) canvas.clearContext(canvas.contextTop);
      canvas.requestRenderAll();
    }
  }

  function addObject(kind, point) {
    if (kind === 'latex' || kind === 'code') {
      addWidget(kind, point);
      return;
    }
    if (kind === 'structure' || String(kind).startsWith('structure:')) {
      const mode = String(kind).includes(':') ? String(kind).split(':')[1] : 'normal';
      addWidget('structure', point, mode);
      return;
    }

    const canvas = currentFabricCanvas();
    document.body.dataset.lastTool = kind;
    if (!canvas) {
      document.body.dataset.lastToolStatus = 'missing-canvas';
      return;
    }
    const left = Math.max(24, Math.min(point.x - 100, SLIDE_W - 240));
    const top = Math.max(24, Math.min(point.y - 50, SLIDE_H - 160));
    let obj = null;

    try {
      if (kind === 'text') {
        const Fabric = f();
        const TextClass = Fabric.Textbox || Fabric.IText || Fabric.Text;
        obj = new TextClass('New text', {
          left,
          top,
          width: 360,
          fontSize: 34,
          fontFamily: DEFAULT_FONT_FAMILY,
          fontWeight: 'bold',
          fill: '#1f282d',
          styles: {}
        });
      } else {
        obj = createShape(kind, left, top);
      }
    } catch (err) {
      document.body.dataset.lastToolStatus = `failed:${err.message}`;
      console.error('Failed to add Fabric object', err);
      return;
    }

    if (!obj) {
      document.body.dataset.lastToolStatus = 'no-object';
      return;
    }

    try {
      configureObject(obj);
      canvas.add(obj);
      canvas.setActiveObject(obj);
      canvas.requestRenderAll();
      syncCurrentSlideCanvas();
      updateObjectToolbar(obj, canvas);
      pendingTool = null;
      updateArmedTool();
      document.body.dataset.lastToolStatus = `added:${kind}`;
    } catch (err) {
      document.body.dataset.lastToolStatus = `failed-add:${err.message}`;
      console.error('Failed to attach Fabric object', err);
    }
  }

  function defaultCode() {
    return [
      '#include <bits/stdc++.h>',
      'using namespace std;',
      '',
      'int main() {',
      '    cout << "AlgoShowMaker";',
      '    return 0;',
      '}'
    ].join('\n');
  }

  function addWidget(type, point, structureMode = 'normal') {
    const slide = getSlide();
    if (!slide) return;
    slide.widgets = normalizeWidgets(slide.widgets);
    const normalizedStructureMode = STRUCTURE_MODES.includes(structureMode) ? structureMode : 'normal';
    const isStructure = type === 'structure';
    const structureWidth = normalizedStructureMode === 'stack' ? 360 : 640;
    const structureHeight = normalizedStructureMode === 'normal' || normalizedStructureMode === 'queue' || normalizedStructureMode === 'disk'
      ? 240
      : 330;
    const widgetWidth = type === 'code' ? 560 : (isStructure ? structureWidth : 360);
    const widgetHeight = type === 'code' ? 230 : (isStructure ? structureHeight : 104);
    const widget = {
      id: randomId(),
      type,
      x: Math.max(24, Math.min(point.x - widgetWidth / 2, SLIDE_W - widgetWidth - 24)),
      y: Math.max(24, Math.min(point.y - widgetHeight / 2, SLIDE_H - widgetHeight - 24)),
      w: widgetWidth,
      h: widgetHeight,
      language: 'cpp',
      fontSize: type === 'code' ? 21 : (isStructure ? 18 : 34),
      focusLines: '',
      showLineNumbers: false,
      scale: 1,
      ...normalizeAnimationSettings(),
      content: type === 'code'
        ? defaultCode()
        : (isStructure
          ? (normalizedStructureMode === 'matrix' ? '1, 2, 3\n4, 5, 6' : '8, 3, 12, 1, 6, 10, 14')
          : String.raw`\(\sum_{i=1}^{n} i = \frac{n(n+1)}{2}\)`)
    };
    if (isStructure) {
      Object.assign(widget, {
        structureMode: normalizedStructureMode,
        indexMode: 0,
        indexBase: 0,
        itemsPerRow: 0,
        gap: 0,
        cellSize: 58,
        manualSize: true,
        baseFill: '#f8fbfa',
        borderColor: '#344247',
        textColor: '#1f282d',
        lineColor: '#66767b',
        highlightColor: '#ef4444',
        focusColor: '#3b82f6',
        pointColor: '#f59e0b',
        markColor: '#8b5cf6',
        backgroundColor: '#10b981',
        frameBackgroundEnabled: true,
        frameBackgroundColor: DEFAULT_STRUCTURE_FRAME_BACKGROUND,
        treeLayout: 'compact',
        treeHorizontal: false,
        treeArrowColor: '#333333',
        treeRendererVersion: 3,
        structureFrameVersion: 4,
        highlightIndices: '',
        focusIndices: '',
        pointIndices: '',
        markIndices: '',
        backgroundIndices: ''
      });
      if (normalizedStructureMode === 'binary_tree') widget.treeData = legacyTreeData(widget.content);
      const naturalSize = constrainedStructureSize(widget);
      widget.w = naturalSize.width;
      widget.h = naturalSize.height;
      widget.x = Math.max(24, Math.min(point.x - widget.w / 2, SLIDE_W - widget.w - 24));
      widget.y = Math.max(24, Math.min(point.y - widget.h / 2, SLIDE_H - widget.h - 24));
    }
    slide.widgets.push(widget);
    saveDeck();
    pendingTool = null;
    updateArmedTool();
    document.body.dataset.lastToolStatus = `added:${type}`;
    appendWidgetsToCurrentSlide([widget]);
    const el = document.querySelector(`.slide-widget[data-widget-id="${widget.id}"]`);
    if (el) refreshWidgetElement(el, widget);
    selectWidget(widget.id);
  }

  function createShape(shape, left, top) {
    const Fabric = f();
    if (shape === 'line') {
      return new Fabric.Line([-105, 0, 105, 0], {
        left: left + 105,
        top: top + 24,
        originX: 'center',
        originY: 'center',
        fill: null,
        stroke: '#344247',
        strokeWidth: 1,
        strokeLineCap: 'round',
        asmShapeType: 'line'
      });
    }
    if (shape === 'arrow') {
      return new Fabric.Line([-105, 0, 105, 0], {
        left: left + 105,
        top: top + 24,
        originX: 'center',
        originY: 'center',
        fill: null,
        stroke: '#344247',
        strokeWidth: 1,
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
        asmShapeType: 'arrow',
        arrowHeadSize: 24,
        arrowHeadStyle: 'open'
      });
    }
    const fill = shape === 'triangle' ? '#fff2d8' : (shape === 'rect' ? '#dff4ef' : '#eee7fb');
    const stroke = shape === 'triangle' ? '#b87927' : (shape === 'rect' ? '#1d8f83' : '#875bc7');
    if (shape === 'triangle') {
      return new Fabric.Triangle({
        left,
        top,
        width: 190,
        height: 170,
        fill,
        stroke,
        strokeWidth: 1
      });
    }
    if (shape === 'rect') {
      return new Fabric.Rect({
        left,
        top,
        width: 210,
        height: 150,
        fill,
        stroke,
        strokeWidth: 1,
        rx: 0,
        ry: 0,
        cornerRadius: 0
      });
    }
    return new Fabric.Circle({
      left,
      top,
      radius: 82,
      fill,
      stroke,
      strokeWidth: 1
    });
  }

  function insertImageFromDataUrl(src, left, top) {
    const canvas = currentFabricCanvas();
    const Fabric = f();
    const ImageClass = Fabric.FabricImage || Fabric.Image;
    if (!canvas || !ImageClass) return;

    const img = new Image();
    img.onload = () => {
      const obj = new ImageClass(img, { left, top });
      obj.scaleToWidth(320);
      configureObject(obj);
      canvas.add(obj);
      canvas.setActiveObject(obj);
      canvas.requestRenderAll();
      syncCurrentSlideCanvas();
      updateObjectToolbar(obj, canvas);
    };
    img.src = src;
  }

  function syncCurrentSlideCanvas({ history = true } = {}) {
    const canvas = currentFabricCanvas();
    const slide = getSlide();
    if (!canvas || !slide) return;
    slide.canvas = serializeFabricCanvas(canvas);
    saveDeck({ history });
    syncSlideAutoAnimate(slide);
    syncFabricFragmentProxies(slide.id, canvas);
    syncTtsEditor();
  }

  function isEditableDomTarget(event) {
    const target = event.target;
    return !!(target && target.closest && target.closest('input, textarea, select, [contenteditable="true"]'));
  }

  function activeFabricObjects() {
    const canvas = currentFabricCanvas();
    return canvas ? canvas.getActiveObjects() : [];
  }

  function snapBypassRequested(event) {
    return !!(event?.altKey || event?.ctrlKey || event?.metaKey);
  }

  function snapBounds(source) {
    const left = Number(source.left) || 0;
    const top = Number(source.top) || 0;
    const width = Math.max(0, Number(source.width) || 0);
    const height = Math.max(0, Number(source.height) || 0);
    return {
      ...source,
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      centerX: left + width / 2,
      centerY: top + height / 2
    };
  }

  function snapCandidateBounds(canvas, excludedFabric = new Set(), excludedWidgetIds = new Set()) {
    const candidates = [];
    canvas?.getObjects().forEach(object => {
      if (!object.visible || excludedFabric.has(object)) return;
      const bounds = object.getBoundingRect(true, true);
      candidates.push(snapBounds({
        kind: 'fabric',
        id: object.fragmentProxyId || object,
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height
      }));
    });
    const slide = getSlide();
    (slide?.widgets || []).forEach(widget => {
      if (excludedWidgetIds.has(widget.id)) return;
      candidates.push(snapBounds({
        kind: 'widget',
        id: widget.id,
        left: widget.x,
        top: widget.y,
        width: widget.w,
        height: widget.h
      }));
    });
    return candidates;
  }

  function clearSnapGuides() {
    if (!snapGuideLayer) return;
    snapGuideLayer.hidden = true;
    snapGuideLayer.replaceChildren();
  }

  function renderSnapGuides(guides, canvas = currentFabricCanvas()) {
    if (!snapGuideLayer || !guides.length || !document.body.classList.contains('asm-edit-mode')) {
      clearSnapGuides();
      return;
    }
    const rect = fabricSlideRect(canvas);
    if (!rect) {
      clearSnapGuides();
      return;
    }
    const scaleX = rect.width / SLIDE_W;
    const scaleY = rect.height / SLIDE_H;
    snapGuideLayer.style.left = `${rect.left}px`;
    snapGuideLayer.style.top = `${rect.top}px`;
    snapGuideLayer.style.width = `${rect.width}px`;
    snapGuideLayer.style.height = `${rect.height}px`;
    const nodes = guides.map(guide => {
      const line = document.createElement('div');
      const vertical = guide.orientation === 'vertical';
      line.className = `snap-guide-line ${vertical ? 'is-vertical' : 'is-horizontal'}${guide.type === 'spacing' ? ' is-spacing' : ''}`;
      if (vertical) {
        line.style.left = `${guide.position * scaleX}px`;
        line.style.top = `${guide.start * scaleY}px`;
        line.style.height = `${Math.max(1, (guide.end - guide.start) * scaleY)}px`;
      } else {
        line.style.left = `${guide.start * scaleX}px`;
        line.style.top = `${guide.position * scaleY}px`;
        line.style.width = `${Math.max(1, (guide.end - guide.start) * scaleX)}px`;
      }
      if (guide.type === 'spacing' && guide.label != null) {
        const label = document.createElement('span');
        label.className = 'snap-guide-label';
        label.textContent = String(Math.round(guide.label));
        line.appendChild(label);
      }
      return line;
    });
    snapGuideLayer.replaceChildren(...nodes);
    snapGuideLayer.hidden = false;
  }

  function calculateObjectSnap(rawMoving, candidates, { allowX = true, allowY = true } = {}) {
    const moving = snapBounds(rawMoving);
    let bestX = null;
    let bestY = null;
    const consider = (current, delta, guideFactory) => {
      const distance = Math.abs(delta);
      if (distance > SNAP_THRESHOLD || (current && distance >= current.distance)) return current;
      return { delta, distance, guideFactory };
    };

    candidates.forEach(candidate => {
      if (allowX) {
        const anchors = [
          [moving.left, candidate.left],
          [moving.centerX, candidate.centerX],
          [moving.right, candidate.right]
        ];
        anchors.forEach(([from, to]) => {
          bestX = consider(bestX, to - from, snapped => [{
            orientation: 'vertical',
            type: 'alignment',
            position: to,
            start: Math.min(snapped.top, candidate.top),
            end: Math.max(snapped.bottom, candidate.bottom)
          }]);
        });
      }
      if (allowY) {
        const anchors = [
          [moving.top, candidate.top],
          [moving.centerY, candidate.centerY],
          [moving.bottom, candidate.bottom]
        ];
        anchors.forEach(([from, to]) => {
          bestY = consider(bestY, to - from, snapped => [{
            orientation: 'horizontal',
            type: 'alignment',
            position: to,
            start: Math.min(snapped.left, candidate.left),
            end: Math.max(snapped.right, candidate.right)
          }]);
        });
      }
    });

    const byX = [...candidates].sort((a, b) => a.left - b.left);
    if (allowX) {
      for (let index = 0; index < byX.length - 1; index += 1) {
        const first = byX[index];
        const second = byX[index + 1];
        if (first.right > second.left) continue;
        const rowTolerance = Math.max(20, Math.min(first.height, second.height, moving.height) / 2);
        const rowCenter = (first.centerY + second.centerY) / 2;
        if (Math.abs(first.centerY - second.centerY) > rowTolerance || Math.abs(moving.centerY - rowCenter) > rowTolerance) continue;
        const existingGap = second.left - first.right;
        const guideY = Math.min(SLIDE_H - 12, Math.max(first.bottom, second.bottom, moving.bottom) + 18);
        const afterLeft = second.right + existingGap;
        bestX = consider(bestX, afterLeft - moving.left, snapped => [
          { orientation: 'horizontal', type: 'spacing', position: guideY, start: first.right, end: second.left, label: existingGap },
          { orientation: 'horizontal', type: 'spacing', position: guideY, start: second.right, end: snapped.left, label: existingGap }
        ]);
        const beforeLeft = first.left - existingGap - moving.width;
        bestX = consider(bestX, beforeLeft - moving.left, snapped => [
          { orientation: 'horizontal', type: 'spacing', position: guideY, start: snapped.right, end: first.left, label: existingGap },
          { orientation: 'horizontal', type: 'spacing', position: guideY, start: first.right, end: second.left, label: existingGap }
        ]);
        const available = second.left - first.right - moving.width;
        if (available >= 0) {
          const equalGap = available / 2;
          const betweenLeft = first.right + equalGap;
          bestX = consider(bestX, betweenLeft - moving.left, snapped => [
            { orientation: 'horizontal', type: 'spacing', position: guideY, start: first.right, end: snapped.left, label: equalGap },
            { orientation: 'horizontal', type: 'spacing', position: guideY, start: snapped.right, end: second.left, label: equalGap }
          ]);
        }
      }
    }

    const byY = [...candidates].sort((a, b) => a.top - b.top);
    if (allowY) {
      for (let index = 0; index < byY.length - 1; index += 1) {
        const first = byY[index];
        const second = byY[index + 1];
        if (first.bottom > second.top) continue;
        const columnTolerance = Math.max(20, Math.min(first.width, second.width, moving.width) / 2);
        const columnCenter = (first.centerX + second.centerX) / 2;
        if (Math.abs(first.centerX - second.centerX) > columnTolerance || Math.abs(moving.centerX - columnCenter) > columnTolerance) continue;
        const existingGap = second.top - first.bottom;
        const guideX = Math.min(SLIDE_W - 12, Math.max(first.right, second.right, moving.right) + 18);
        const afterTop = second.bottom + existingGap;
        bestY = consider(bestY, afterTop - moving.top, snapped => [
          { orientation: 'vertical', type: 'spacing', position: guideX, start: first.bottom, end: second.top, label: existingGap },
          { orientation: 'vertical', type: 'spacing', position: guideX, start: second.bottom, end: snapped.top, label: existingGap }
        ]);
        const beforeTop = first.top - existingGap - moving.height;
        bestY = consider(bestY, beforeTop - moving.top, snapped => [
          { orientation: 'vertical', type: 'spacing', position: guideX, start: snapped.bottom, end: first.top, label: existingGap },
          { orientation: 'vertical', type: 'spacing', position: guideX, start: first.bottom, end: second.top, label: existingGap }
        ]);
        const available = second.top - first.bottom - moving.height;
        if (available >= 0) {
          const equalGap = available / 2;
          const betweenTop = first.bottom + equalGap;
          bestY = consider(bestY, betweenTop - moving.top, snapped => [
            { orientation: 'vertical', type: 'spacing', position: guideX, start: first.bottom, end: snapped.top, label: equalGap },
            { orientation: 'vertical', type: 'spacing', position: guideX, start: snapped.bottom, end: second.top, label: equalGap }
          ]);
        }
      }
    }

    const dx = bestX?.delta || 0;
    const dy = bestY?.delta || 0;
    const snapped = snapBounds({ ...moving, left: moving.left + dx, top: moving.top + dy });
    return {
      dx,
      dy,
      guides: [
        ...(bestX?.guideFactory(snapped) || []),
        ...(bestY?.guideFactory(snapped) || [])
      ]
    };
  }

  function resizeEdgeFlags(edge) {
    const value = String(edge || '').toLowerCase();
    return {
      left: value.includes('left') || ['ml', 'tl', 'bl'].includes(value),
      right: value.includes('right') || ['mr', 'tr', 'br'].includes(value),
      top: value.includes('top') || ['mt', 'tl', 'tr'].includes(value),
      bottom: value.includes('bottom') || ['mb', 'bl', 'br'].includes(value)
    };
  }

  function calculateResizeSnap(rawMoving, candidates, edge) {
    const moving = snapBounds(rawMoving);
    const flags = resizeEdgeFlags(edge);
    const xEdge = flags.left ? 'left' : (flags.right ? 'right' : null);
    const yEdge = flags.top ? 'top' : (flags.bottom ? 'bottom' : null);
    let bestX = null;
    let bestY = null;
    const consider = (current, delta, candidate, position) => {
      const distance = Math.abs(delta);
      if (distance > SNAP_THRESHOLD || (current && distance >= current.distance)) return current;
      return { delta, distance, candidate, position };
    };

    candidates.forEach(candidate => {
      if (xEdge) {
        [candidate.left, candidate.centerX, candidate.right].forEach(position => {
          bestX = consider(bestX, position - moving[xEdge], candidate, position);
        });
      }
      if (yEdge) {
        [candidate.top, candidate.centerY, candidate.bottom].forEach(position => {
          bestY = consider(bestY, position - moving[yEdge], candidate, position);
        });
      }
    });

    const bounds = { ...moving };
    if (bestX) {
      if (xEdge === 'left') {
        bounds.left += bestX.delta;
        bounds.width -= bestX.delta;
      } else {
        bounds.width += bestX.delta;
      }
    }
    if (bestY) {
      if (yEdge === 'top') {
        bounds.top += bestY.delta;
        bounds.height -= bestY.delta;
      } else {
        bounds.height += bestY.delta;
      }
    }
    Object.assign(bounds, snapBounds(bounds));

    const xGuides = bestX ? [{
      orientation: 'vertical',
      type: 'alignment',
      position: bestX.position,
      start: Math.min(bounds.top, bestX.candidate.top),
      end: Math.max(bounds.bottom, bestX.candidate.bottom)
    }] : [];
    const yGuides = bestY ? [{
      orientation: 'horizontal',
      type: 'alignment',
      position: bestY.position,
      start: Math.min(bounds.left, bestY.candidate.left),
      end: Math.max(bounds.right, bestY.candidate.right)
    }] : [];
    return {
      bounds,
      distanceX: bestX?.distance ?? Infinity,
      distanceY: bestY?.distance ?? Infinity,
      xGuides,
      yGuides,
      guides: [...xGuides, ...yGuides]
    };
  }

  function applyFabricObjectSnap(event, canvas) {
    const target = event?.target;
    if (!target || snapBypassRequested(event?.e)) {
      clearSnapGuides();
      return;
    }
    const activeObjects = new Set(canvas.getActiveObjects());
    const bounds = target.getBoundingRect(true, true);
    const candidates = snapCandidateBounds(canvas, activeObjects, new Set());
    const axis = target.__asmShiftLockAxis;
    const result = calculateObjectSnap(bounds, candidates, {
      allowX: axis !== 'vertical',
      allowY: axis !== 'horizontal'
    });
    if (result.dx || result.dy) {
      target.set({
        left: (target.left || 0) + result.dx,
        top: (target.top || 0) + result.dy
      });
      target.setCoords();
    }
    renderSnapGuides(result.guides, canvas);
  }

  function applyFabricResizeSnap(event, canvas) {
    const target = event?.target;
    const corner = event?.transform?.corner;
    if (!target || !corner || snapBypassRequested(event?.e)) {
      clearSnapGuides();
      return;
    }
    const flags = resizeEdgeFlags(corner);
    const resizeEdge = isTextObject(target)
      ? (flags.left ? 'left' : (flags.right ? 'right' : ''))
      : corner;
    if (!resizeEdge) {
      clearSnapGuides();
      return;
    }
    const activeObjects = new Set(canvas.getActiveObjects());
    const current = snapBounds(target.getBoundingRect(true, true));
    const candidates = snapCandidateBounds(canvas, activeObjects, new Set());
    const result = calculateResizeSnap(current, candidates, resizeEdge);
    if (!Number.isFinite(result.distanceX) && !Number.isFinite(result.distanceY)) {
      clearSnapGuides();
      return;
    }

    const next = result.bounds;
    const nextFlags = resizeEdgeFlags(resizeEdge);
    const anchorX = nextFlags.left ? current.right : (nextFlags.right ? current.left : current.centerX);
    const anchorY = nextFlags.top ? current.bottom : (nextFlags.bottom ? current.top : current.centerY);
    if (Number.isFinite(result.distanceX) && current.width > 0) {
      const ratioX = Math.max(0.01, next.width / current.width);
      if (isTextObject(target)) target.set({ width: Math.max(40, (Number(target.width) || 40) * ratioX) });
      else target.set({ scaleX: (Number(target.scaleX) || 1) * ratioX });
    }
    if (Number.isFinite(result.distanceY) && current.height > 0 && !isTextObject(target)) {
      const ratioY = Math.max(0.01, next.height / current.height);
      target.set({ scaleY: (Number(target.scaleY) || 1) * ratioY });
    }
    target.setCoords();
    const updated = snapBounds(target.getBoundingRect(true, true));
    const updatedAnchorX = nextFlags.left ? updated.right : (nextFlags.right ? updated.left : updated.centerX);
    const updatedAnchorY = nextFlags.top ? updated.bottom : (nextFlags.bottom ? updated.top : updated.centerY);
    target.set({
      left: (Number(target.left) || 0) + anchorX - updatedAnchorX,
      top: (Number(target.top) || 0) + anchorY - updatedAnchorY
    });
    target.setCoords();
    target.dirty = true;
    canvas.requestRenderAll();
    renderSnapGuides(result.guides, canvas);
  }

  function applyWidgetResizeSnap(widget, drag) {
    const current = snapBounds({
      left: widget.x,
      top: widget.y,
      width: widget.w,
      height: widget.h
    });
    const candidates = snapCandidateBounds(currentFabricCanvas(), new Set(), new Set([widget.id]));
    const result = calculateResizeSnap(current, candidates, drag.edge);
    if (!Number.isFinite(result.distanceX) && !Number.isFinite(result.distanceY)) {
      clearSnapGuides();
      return;
    }

    if (widget.type !== 'structure') {
      if (Number.isFinite(result.distanceX)) {
        widget.x = result.bounds.left;
        widget.w = Math.max(40, result.bounds.width);
      }
      if (Number.isFinite(result.distanceY)) {
        widget.y = result.bounds.top;
        widget.h = Math.max(40, result.bounds.height);
      }
      renderSnapGuides(result.guides);
      return;
    }

    const flags = resizeEdgeFlags(drag.edge);
    const ratio = Math.max(0.1, drag.originalW / Math.max(1, drag.originalH));
    const useX = Number.isFinite(result.distanceX) && result.distanceX <= result.distanceY;
    const nextW = useX ? Math.max(40, result.bounds.width) : Math.max(40, result.bounds.height * ratio);
    const nextH = useX ? Math.max(40, nextW / ratio) : Math.max(40, result.bounds.height);
    widget.w = nextW;
    widget.h = nextH;
    widget.x = Math.max(0, Math.min(
      flags.left ? current.right - nextW : (flags.right ? current.left : current.centerX - nextW / 2),
      SLIDE_W - nextW
    ));
    widget.y = Math.max(0, Math.min(
      flags.top ? current.bottom - nextH : (flags.bottom ? current.top : current.centerY - nextH / 2),
      SLIDE_H - nextH
    ));
    renderSnapGuides(useX ? result.xGuides : result.yGuides);
  }

  function selectedAlignmentItems() {
    const items = [];
    const canvas = currentFabricCanvas();
    activeFabricObjects().forEach(object => {
      const bounds = object.getBoundingRect(true, true);
      items.push({
        kind: 'fabric',
        object,
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height
      });
    });
    const slide = getSlide();
    const widgetIds = selectedWidgetIdsInCurrentSlide();
    if (slide) slide.widgets = normalizeWidgets(slide.widgets);
    (slide?.widgets || []).forEach(widget => {
      if (!widgetIds.includes(widget.id)) return;
      items.push({
        kind: 'widget',
        widget,
        left: widget.x,
        top: widget.y,
        width: widget.w,
        height: widget.h
      });
    });
    return { canvas, items };
  }

  function updateAlignmentToolbar() {
    if (!alignmentToolbar) return;
    const count = selectedAlignmentItems().items.length;
    alignmentToolbar.hidden = count < 2 || !document.body.classList.contains('asm-edit-mode');
    alignmentToolbar.querySelectorAll('[data-align-action^="distribute"]').forEach(button => {
      button.disabled = count < 3;
    });
  }

  function moveAlignmentItem(item, dx, dy) {
    if (!dx && !dy) return;
    if (item.kind === 'fabric') {
      item.object.set({
        left: (item.object.left || 0) + dx,
        top: (item.object.top || 0) + dy
      });
      item.object.setCoords();
      return;
    }
    item.widget.x += dx;
    item.widget.y += dy;
    const el = document.querySelector(`.slide-widget[data-widget-id="${item.widget.id}"]`);
    if (el) {
      el.style.left = `${item.widget.x}px`;
      el.style.top = `${item.widget.y}px`;
    }
  }

  function alignSelectedObjects(action) {
    const { canvas, items } = selectedAlignmentItems();
    if (items.length < 2) return;
    if (action.startsWith('distribute') && items.length < 3) return;

    if (action === 'distribute-horizontal' || action === 'distribute-vertical') {
      const horizontal = action === 'distribute-horizontal';
      const sorted = [...items].sort((a, b) => (
        horizontal
          ? (a.left + a.width / 2) - (b.left + b.width / 2)
          : (a.top + a.height / 2) - (b.top + b.height / 2)
      ));
      const start = horizontal ? sorted[0].left : sorted[0].top;
      const end = horizontal
        ? sorted[sorted.length - 1].left + sorted[sorted.length - 1].width
        : sorted[sorted.length - 1].top + sorted[sorted.length - 1].height;
      const totalSize = sorted.reduce((sum, item) => sum + (horizontal ? item.width : item.height), 0);
      const gap = (end - start - totalSize) / (sorted.length - 1);
      let cursor = start;
      sorted.forEach(item => {
        const current = horizontal ? item.left : item.top;
        moveAlignmentItem(item, horizontal ? cursor - current : 0, horizontal ? 0 : cursor - current);
        cursor += (horizontal ? item.width : item.height) + gap;
      });
    } else {
      const left = Math.min(...items.map(item => item.left));
      const top = Math.min(...items.map(item => item.top));
      const right = Math.max(...items.map(item => item.left + item.width));
      const bottom = Math.max(...items.map(item => item.top + item.height));
      items.forEach(item => {
        let dx = 0;
        let dy = 0;
        if (action === 'left') dx = left - item.left;
        if (action === 'center') dx = (left + right) / 2 - (item.left + item.width / 2);
        if (action === 'right') dx = right - (item.left + item.width);
        if (action === 'top') dy = top - item.top;
        if (action === 'middle') dy = (top + bottom) / 2 - (item.top + item.height / 2);
        if (action === 'bottom') dy = bottom - (item.top + item.height);
        moveAlignmentItem(item, dx, dy);
      });
    }

    if (canvas && activeFabricObjects().length) {
      canvas.getActiveObject()?.setCoords?.();
      canvas.requestRenderAll();
      syncCurrentSlideCanvas({ history: false });
    }
    saveDeck();
    updateAlignmentToolbar();
  }

  function selectAllCurrentObjects() {
    const canvas = currentFabricCanvas();
    if (canvas && !isTypingInFabric(canvas)) {
      const objects = canvas.getObjects();
      if (objects.length) {
        const Fabric = f();
        if (objects.length === 1) {
          canvas.setActiveObject(objects[0]);
        } else if (Fabric.ActiveSelection) {
          const selection = new Fabric.ActiveSelection(objects, { canvas });
          configureSelectionControls(selection);
          canvas.setActiveObject(selection);
        }
        canvas.requestRenderAll();
        updateObjectToolbar(canvas.getActiveObject(), canvas);
      }
    }
    selectAllCurrentWidgets();
  }

  function serializeClipboardFabricObjects(canvas, objects) {
    const serialize = () => objects.map(obj => obj.toObject ? obj.toObject(FABRIC_CUSTOM_PROPS) : clone(obj));
    return withAbsoluteFabricSelection(canvas, serialize);
  }

  function copyCurrentObjects() {
    const slide = getSlide();
    const canvas = currentFabricCanvas();
    const fabricObjects = activeFabricObjects();
    const widgetIds = selectedWidgetIdsInCurrentSlide();
    objectClipboard = {
      fabric: serializeClipboardFabricObjects(canvas, fabricObjects),
      widgets: normalizeWidgets(slide?.widgets).filter(widget => widgetIds.includes(widget.id)).map(widget => clone(widget)),
      cut: false
    };
  }

  function cutCurrentObjects() {
    copyCurrentObjects();
    objectClipboard.cut = true;
    deleteCurrentObjectSelection();
  }

  async function pasteCurrentObjects() {
    const canvas = currentFabricCanvas();
    const slide = getSlide();
    if (!slide || (!objectClipboard.fabric.length && !objectClipboard.widgets.length)) return;
    let changed = false;
    if (canvas && objectClipboard.fabric.length) {
      const objects = await enlivenFabricObjects(objectClipboard.fabric);
      suppressCanvasSave = true;
      try {
        objects.forEach(obj => {
          obj.set?.({ fragmentProxyId: randomId(), ttsObjectId: randomId() });
          configureObject(obj);
          obj.setCoords?.();
          canvas.add(obj);
        });
        if (objects.length === 1) {
          canvas.setActiveObject(objects[0]);
        } else if (objects.length > 1 && f().ActiveSelection) {
          const selection = new (f().ActiveSelection)(objects, { canvas });
          configureSelectionControls(selection);
          canvas.setActiveObject(selection);
        }
      } finally {
        suppressCanvasSave = false;
      }
      canvas.requestRenderAll();
      syncCurrentSlideCanvas({ history: false });
      updateObjectToolbar(canvas.getActiveObject(), canvas);
      changed = objects.length > 0;
    }
    if (objectClipboard.widgets.length) {
      slide.widgets = normalizeWidgets(slide.widgets);
      const pastedWidgets = objectClipboard.widgets.map(widget => ({
        ...clone(widget),
        id: randomId()
      }));
      slide.widgets.push(...pastedWidgets);
      selectedWidgetId = pastedWidgets.length === 1 ? pastedWidgets[0].id : null;
      appendWidgetsToCurrentSlide(pastedWidgets);
      pastedWidgets.forEach(widget => {
        document.querySelector(`.slide-widget[data-widget-id="${widget.id}"]`)?.classList.add('is-selected');
      });
      if (selectedWidgetId) showWidgetEditor(selectedWidgetId);
      else showDefaultPanel();
      refreshRevealWidgets();
      changed = pastedWidgets.length > 0 || changed;
    }
    if (changed) saveDeck();
    objectClipboard.cut = false;
  }

  function deleteCurrentObjectSelection() {
    let changed = false;
    const canvas = currentFabricCanvas();
    if (canvas && !isTypingInFabric(canvas)) {
      const active = canvas.getActiveObjects();
      if (active.length) {
        suppressCanvasSave = true;
        try {
          canvas.discardActiveObject();
          active.forEach(obj => canvas.remove(obj));
        } finally {
          suppressCanvasSave = false;
        }
        canvas.requestRenderAll();
        syncCurrentSlideCanvas({ history: false });
        changed = true;
      }
    }
    if (deleteSelectedWidget({ history: false })) changed = true;
    if (changed) saveDeck();
    return changed;
  }

  function enlivenFabricObjects(jsonObjects) {
    const Fabric = f();
    return new Promise(resolve => {
      const done = objects => resolve(objects || []);
      const result = Fabric.util.enlivenObjects(jsonObjects.map(obj => clone(obj)), done);
      if (result && typeof result.then === 'function') result.then(done);
    });
  }

  function getWidget(widgetId) {
    for (const group of deck.groups) {
      for (const slide of group.slides) {
        slide.widgets = normalizeWidgets(slide.widgets);
        const widget = slide.widgets.find(item => item.id === widgetId);
        if (widget) return { slide, widget };
      }
    }
    return {};
  }

  function selectWidget(widgetId) {
    const canvas = currentFabricCanvas();
    if (canvas) {
      canvas.discardActiveObject();
      canvas.requestRenderAll();
    }
    hideObjectToolbar();
    selectedWidgetId = widgetId;
    document.querySelectorAll('.slide-widget.is-selected').forEach(el => el.classList.remove('is-selected'));
    const el = document.querySelector(`.slide-widget[data-widget-id="${widgetId}"]`);
    if (el) el.classList.add('is-selected');
    showWidgetEditor(widgetId);
    updateAlignmentToolbar();
  }

  function clearWidgetSelection() {
    selectedWidgetId = null;
    document.querySelectorAll('.slide-widget.is-selected').forEach(el => el.classList.remove('is-selected'));
    if (codeEditorModal && !codeEditorModal.hidden) closeCodeEditorModal();
    showDefaultPanel();
    updateAlignmentToolbar();
  }

  function toggleWidgetSelection(widgetId) {
    const el = document.querySelector(`.slide-widget[data-widget-id="${widgetId}"]`);
    if (!el) return;
    const selecting = !el.classList.contains('is-selected');
    el.classList.toggle('is-selected', selecting);
    const ids = selectedWidgetIdsInCurrentSlide();
    selectedWidgetId = ids.length === 1 ? ids[0] : null;
    if (ids.length === 1) showWidgetEditor(ids[0]);
    else showDefaultPanel();
    updateAlignmentToolbar();
  }

  function selectedWidgetIdsInCurrentSlide() {
    const slide = getSlide();
    if (!slide) return [];
    const selectedIds = Array.from(document.querySelectorAll(`.widget-layer[data-slide-id="${slide.id}"] .slide-widget.is-selected`))
      .map(el => el.dataset.widgetId)
      .filter(Boolean);
    if (selectedWidgetId && !selectedIds.includes(selectedWidgetId)) selectedIds.push(selectedWidgetId);
    const existingIds = new Set(normalizeWidgets(slide.widgets).map(widget => widget.id));
    return selectedIds.filter(id => existingIds.has(id));
  }

  function selectAllCurrentWidgets() {
    const slide = getSlide();
    if (!slide) return [];
    const ids = normalizeWidgets(slide.widgets).map(widget => widget.id);
    document.querySelectorAll(`.widget-layer[data-slide-id="${slide.id}"] .slide-widget`).forEach(el => {
      el.classList.add('is-selected');
    });
    selectedWidgetId = ids.length === 1 ? ids[0] : null;
    if (ids.length !== 1) showDefaultPanel();
    updateAlignmentToolbar();
    return ids;
  }

  function showDefaultPanel() {
    if (customOverviewOpen) {
      showOverviewSidebarPanel();
      return;
    }
    if (ttsPanelIsExpanded()) {
      showOnlyTtsSidebar();
      return;
    }
    defaultToolPanel.hidden = false;
    if (overviewSidebarPanel) overviewSidebarPanel.hidden = true;
    latexEditorPanel.hidden = true;
    codeEditorPanel.hidden = true;
    if (structureEditorPanel) structureEditorPanel.hidden = true;
    setStructureEditorActive(false);
    hideAnimationEditor();
    updateAlgorithmEditButton();
  }

  function applyCodeFocusLines(code, focusLines, showLineNumbers) {
    const value = typeof focusLines === 'string' ? focusLines.trim() : '';
    code.classList.toggle('asm-hide-line-numbers', !showLineNumbers);
    if (value || showLineNumbers) code.setAttribute('data-line-numbers', value);
    else code.removeAttribute('data-line-numbers');
  }

  function showOverviewSidebarPanel() {
    defaultToolPanel.hidden = true;
    if (overviewSidebarPanel) overviewSidebarPanel.hidden = false;
    latexEditorPanel.hidden = true;
    codeEditorPanel.hidden = true;
    if (structureEditorPanel) structureEditorPanel.hidden = true;
    setStructureEditorActive(false);
    hideAnimationEditor();
  }

  function setStructureEditorActive(active) {
    const changed = document.body.classList.contains('structure-editor-active') !== active;
    document.body.classList.toggle('structure-editor-active', active);
    if (changed && reveal) setTimeout(() => reveal.layout(), 20);
  }

  function syncStructureEditorVisibility(widget) {
    const mode = widget?.structureMode || 'normal';
    if (structureTreeControls) structureTreeControls.hidden = mode !== 'binary_tree';
    if (structureFrameBackgroundControls) structureFrameBackgroundControls.hidden = !['normal', 'matrix'].includes(mode);
    if (structureFrameBackgroundColorInput && structureFrameBackgroundEnabledInput) {
      structureFrameBackgroundColorInput.disabled = !structureFrameBackgroundEnabledInput.checked;
    }
  }

  function syncStructureStyleIcon(type, color) {
    const icon = structureEditorPanel?.querySelector(`[data-structure-style="${type}"] .structure-style-icon`);
    if (icon) icon.style.setProperty('--style-color', color);
  }

  function setStructureColorButton(button, color) {
    if (!button) return;
    const value = color || '#ffffff';
    button.dataset.color = value;
    button.style.setProperty('--structure-color', value);
  }

  function populateStructureEditor(widget) {
    structureModeSelect.value = widget.structureMode || 'normal';
    if (structureTreeLayoutSelect) structureTreeLayoutSelect.value = widget.treeLayout || 'compact';
    if (structureTreeDirectionSelect) structureTreeDirectionSelect.value = widget.treeHorizontal ? 'horizontal' : 'vertical';
    setStructureColorButton(structureTreeArrowColorInput, widget.treeArrowColor || '#333333');
    structureIndexModeSelect.value = String(widget.indexMode ?? 0);
    structureIndexBaseSelect.value = String(widget.indexBase ?? 0);
    structureItemsPerRowInput.value = String(widget.itemsPerRow ?? 0);
    structureGapInput.value = String(widget.gap ?? 0);
    structureCellSizeInput.value = String(widget.cellSize ?? 58);
    structureFontSizeInput.value = String(widget.fontSize ?? 18);
    structureBaseFillInput.value = widget.baseFill || '#f8fbfa';
    structureBorderColorInput.value = widget.borderColor || '#344247';
    structureTextColorInput.value = widget.textColor || '#1f282d';
    structureLineColorInput.value = widget.lineColor || '#66767b';
    setStructureColorButton(structureHighlightColorInput, widget.highlightColor || '#ef4444');
    structureHighlightIndicesInput.value = widget.highlightIndices || '';
    setStructureColorButton(structureFocusColorInput, widget.focusColor || '#3b82f6');
    structureFocusIndicesInput.value = widget.focusIndices || '';
    setStructureColorButton(structurePointColorInput, widget.pointColor || '#f59e0b');
    structurePointIndicesInput.value = widget.pointIndices || '';
    setStructureColorButton(structureMarkColorInput, widget.markColor || '#8b5cf6');
    structureMarkIndicesInput.value = widget.markIndices || '';
    setStructureColorButton(structureBackgroundColorInput, widget.backgroundColor || '#10b981');
    structureBackgroundIndicesInput.value = widget.backgroundIndices || '';
    if (structureFrameBackgroundEnabledInput) structureFrameBackgroundEnabledInput.checked = widget.frameBackgroundEnabled !== false;
    setStructureColorButton(structureFrameBackgroundColorInput, widget.frameBackgroundColor || DEFAULT_STRUCTURE_FRAME_BACKGROUND);
    syncStructureStyleIcon('highlight', widget.highlightColor || '#ef4444');
    syncStructureStyleIcon('focus', widget.focusColor || '#3b82f6');
    syncStructureStyleIcon('point', widget.pointColor || '#f59e0b');
    syncStructureStyleIcon('mark', widget.markColor || '#8b5cf6');
    syncStructureStyleIcon('background', widget.backgroundColor || '#10b981');
    syncStructureEditorVisibility(widget);
  }

  function updateSelectedStructure(patch, { history = true } = {}) {
    const found = getWidget(selectedWidgetId);
    if (!found.widget || found.widget.type !== 'structure') return;
    const preview = { ...found.widget, ...patch, structureFrameVersion: 4 };
    const size = constrainedStructureSize(preview);
    updateSelectedWidget({
      ...patch,
      structureFrameVersion: 4,
      w: size.width,
      h: size.height,
      x: Math.max(0, Math.min(found.widget.x, SLIDE_W - size.width)),
      y: Math.max(0, Math.min(found.widget.y, SLIDE_H - size.height)),
      manualSize: true
    }, { history });
  }

  function hideStructureContextMenu() {
    if (!structureContextMenu) return;
    structureContextMenu.hidden = true;
    structureContextMenu.replaceChildren();
    activeStructureContext = null;
  }

  function structureCellContext(widgetEl, cell) {
    if (!widgetEl || !cell) return null;
    const found = getWidget(widgetEl.dataset.widgetId);
    if (!found.widget || found.widget.type !== 'structure') return null;
    const mode = found.widget.structureMode || 'normal';
    const treeNode = cell.closest?.('[data-tree-node-id]');
    if (mode === 'binary_tree') {
      if (!treeNode) return null;
      const nodeId = treeNode.dataset.treeNodeId;
      const treeData = normalizeTreeData(found.widget.treeData, found.widget.content);
      return {
        widget: found.widget,
        cell,
        key: `tree:${nodeId}`,
        context: {
          widgetId: found.widget.id,
          mode,
          nodeId,
          value: treeData.nodes.find(node => node.id === nodeId)?.value || ''
        }
      };
    }
    if (mode === 'matrix') {
      const row = Math.max(0, Number(cell.dataset.matrixRow) || 0);
      const column = Math.max(0, Number(cell.dataset.matrixColumn) || 0);
      return {
        widget: found.widget,
        cell,
        key: `matrix:${row}:${column}`,
        context: {
          widgetId: found.widget.id,
          mode,
          row,
          column,
          value: matrixStructureRows(found.widget.content)[row]?.[column] || ''
        }
      };
    }
    const displayedIndex = Math.max(0, Number(cell.dataset.structureItemIndex) || 0);
    const itemIndex = ['heap', 'segment_tree', 'BIT'].includes(mode)
      ? Math.max(0, displayedIndex - 1)
      : displayedIndex;
    return {
      widget: found.widget,
      cell,
      key: `item:${displayedIndex}`,
      context: {
        widgetId: found.widget.id,
        mode,
        itemIndex,
        value: linearStructureValues(found.widget.content)[itemIndex] || ''
      }
    };
  }

  function structureCellForKey(widgetEl, key) {
    if (!widgetEl || !key) return null;
    const [kind, first, second] = key.split(':');
    if (kind === 'tree') {
      return widgetEl.querySelector(`[data-tree-node-id="${CSS.escape(first || '')}"] [data-structure-item-index]`);
    }
    if (kind === 'matrix') {
      return widgetEl.querySelector(`[data-matrix-row="${CSS.escape(first || '0')}"][data-matrix-column="${CSS.escape(second || '0')}"]`);
    }
    return widgetEl.querySelector(`[data-structure-item-index="${CSS.escape(first || '0')}"]`);
  }

  function restoreStructureCellSelection(widgetEl) {
    if (!selectedStructureCell || selectedStructureCell.widgetId !== widgetEl?.dataset.widgetId) return;
    structureCellForKey(widgetEl, selectedStructureCell.key)?.classList.add('is-structure-cell-selected');
  }

  function clearStructureCellSelection({ closeEditor = true } = {}) {
    if (structureCellClickTimer) clearTimeout(structureCellClickTimer);
    structureCellClickTimer = null;
    document.querySelectorAll('.is-structure-cell-selected').forEach(cell => {
      cell.classList.remove('is-structure-cell-selected');
    });
    selectedStructureCell = null;
    if (closeEditor) closeStructureInlineEditor(true);
  }

  function selectStructureCell(widgetEl, cell) {
    const details = structureCellContext(widgetEl, cell);
    if (!details) return null;
    document.querySelectorAll('.is-structure-cell-selected').forEach(item => {
      item.classList.remove('is-structure-cell-selected');
    });
    selectedStructureCell = { widgetId: details.widget.id, key: details.key };
    details.cell.classList.add('is-structure-cell-selected');
    return details;
  }

  function positionStructureInlineEditor(editor, widgetEl, cell, widget) {
    const cellRectElement = cell.querySelector(':scope > rect') || cell.querySelector('rect') || cell;
    const cellRect = cellRectElement.getBoundingClientRect();
    const hostRect = editor.parentElement.getBoundingClientRect();
    const scaleX = widget.w / Math.max(1, hostRect.width);
    const scaleY = widget.h / Math.max(1, hostRect.height);
    const left = (cellRect.left - hostRect.left) * scaleX;
    const top = (cellRect.top - hostRect.top) * scaleY;
    const width = Math.max(18, cellRect.width * scaleX);
    const height = Math.max(18, cellRect.height * scaleY);
    editor.style.left = `${left}px`;
    editor.style.top = `${top}px`;
    editor.style.width = `${width}px`;
    editor.style.height = `${height}px`;
    editor.style.fontSize = `${Math.max(8, Math.min(Number(widget.fontSize) || 18, height * 0.52))}px`;
  }

  function closeStructureInlineEditor(commit = true) {
    const editor = activeStructureInlineEditor;
    if (!editor || editor.closing) return;
    editor.closing = true;
    activeStructureInlineEditor = null;
    const value = editor.input.value;
    editor.input.remove();
    if (!commit) return;
    const found = getWidget(editor.context.widgetId);
    if (!found.widget) return;
    editor.context.value = value;
    if (editor.context.mode === 'binary_tree') applyTreeContextAction('tree-save', editor.context, found.widget);
    else if (editor.context.mode === 'matrix') applyMatrixContextAction('matrix-save', editor.context, found.widget);
    else applyItemContextAction('item-save', editor.context, found.widget);
  }

  function openStructureInlineEditor(widgetEl, cell) {
    if (!document.body.classList.contains('asm-edit-mode')) return false;
    const details = structureCellContext(widgetEl, cell);
    if (!details) return false;
    if (structureCellClickTimer) clearTimeout(structureCellClickTimer);
    structureCellClickTimer = null;
    closeStructureInlineEditor(true);
    selectWidget(details.widget.id);
    const selected = selectStructureCell(widgetEl, cell) || details;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'structure-inline-value-input';
    input.value = selected.context.value;
    input.setAttribute('aria-label', 'Edit structure value');
    (widgetEl.querySelector('.structure-content') || widgetEl).appendChild(input);
    positionStructureInlineEditor(input, widgetEl, selected.cell, selected.widget);
    const editor = { input, context: selected.context, key: selected.key, closing: false };
    activeStructureInlineEditor = editor;
    ['mousedown', 'pointerdown', 'click', 'dblclick'].forEach(type => {
      input.addEventListener(type, event => event.stopPropagation());
    });
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === 'Escape') {
        event.preventDefault();
        input.blur();
      }
    });
    input.addEventListener('blur', () => closeStructureInlineEditor(true));
    input.focus();
    input.select();
    return true;
  }

  function structureContextButton(label, action, disabled = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.structureAction = action;
    button.textContent = label;
    button.disabled = disabled;
    button.setAttribute('role', 'menuitem');
    return button;
  }

  function positionStructureContextMenu(clientX, clientY) {
    const margin = 8;
    structureContextMenu.hidden = false;
    structureContextMenu.style.left = `${clientX}px`;
    structureContextMenu.style.top = `${clientY}px`;
    const rect = structureContextMenu.getBoundingClientRect();
    const left = Math.max(margin, Math.min(clientX, window.innerWidth - rect.width - margin));
    const top = Math.max(margin, Math.min(clientY, window.innerHeight - rect.height - margin));
    structureContextMenu.style.left = `${left}px`;
    structureContextMenu.style.top = `${top}px`;
  }

  function openStructureContextMenu(event) {
    if (!document.body.classList.contains('asm-edit-mode') || !structureContextMenu) return;
    const widgetEl = event.target.closest?.('.structure-widget');
    if (!widgetEl) return;
    const found = getWidget(widgetEl.dataset.widgetId);
    if (!found.widget || found.widget.type !== 'structure') return;
    const mode = found.widget.structureMode || 'normal';
    const treeNode = event.target.closest?.('[data-tree-node-id]');
    const cell = event.target.closest?.('[data-structure-item-index]');
    if ((mode === 'binary_tree' && !treeNode) || (mode !== 'binary_tree' && !cell)) return;
    const editableCell = cell || treeNode?.querySelector('[data-structure-item-index]');
    const details = structureCellContext(widgetEl, editableCell);
    if (!details) return;

    event.preventDefault();
    event.stopPropagation();
    selectWidget(found.widget.id);
    selectStructureCell(widgetEl, editableCell);
    structureContextMenu.replaceChildren();
    if (mode === 'binary_tree') {
      const nodeId = details.context.nodeId;
      const treeData = normalizeTreeData(found.widget.treeData, found.widget.content);
      activeStructureContext = { ...details.context, cellKey: details.key };
      structureContextMenu.append(
        structureContextButton('Edit value', 'tree-edit'),
        structureContextButton('Add node', 'tree-add'),
        structureContextButton('Delete node', 'tree-delete', nodeId === treeData.rootId)
      );
    } else if (mode === 'matrix') {
      activeStructureContext = { ...details.context, cellKey: details.key };
      structureContextMenu.append(
        structureContextButton('Edit value', 'matrix-edit'),
        structureContextButton('Add row above', 'matrix-row-before'),
        structureContextButton('Add row below', 'matrix-row-after'),
        structureContextButton('Add column left', 'matrix-column-before'),
        structureContextButton('Add column right', 'matrix-column-after'),
        structureContextButton('Delete row', 'matrix-row-delete'),
        structureContextButton('Delete column', 'matrix-column-delete')
      );
    } else {
      activeStructureContext = { ...details.context, cellKey: details.key };
      structureContextMenu.append(
        structureContextButton('Edit value', 'item-edit'),
        structureContextButton('Add before', 'item-before'),
        structureContextButton('Add after', 'item-after'),
        structureContextButton('Delete item', 'item-delete')
      );
    }
    positionStructureContextMenu(event.clientX, event.clientY);
  }

  function commitTreeStructure(widget, treeData) {
    const normalized = normalizeTreeData(treeData, widget.content);
    const content = treeContentSummary(normalized);
    updateSelectedStructure({ treeData: normalized, content });
  }

  function applyTreeContextAction(action, context, widget) {
    const treeData = normalizeTreeData(widget.treeData, widget.content);
    const node = treeData.nodes.find(item => item.id === context.nodeId);
    if (!node) return;
    if (action === 'tree-save') {
      node.value = context.value;
    } else if (action === 'tree-add') {
      const childEdges = treeData.edges.filter(edge => edge.from === node.id);
      const id = randomId();
      treeData.nodes.push({ id, value: '1' });
      treeData.edges.push({
        from: node.id,
        to: id,
        slot: childEdges.length === 0 ? 'left' : (childEdges.length === 1 ? 'right' : 'child'),
        order: childEdges.length
      });
    } else if (action === 'tree-delete' && node.id !== treeData.rootId) {
      const removed = new Set();
      const collect = id => {
        if (removed.has(id)) return;
        removed.add(id);
        treeData.edges.filter(edge => edge.from === id).forEach(edge => collect(edge.to));
      };
      collect(node.id);
      treeData.nodes = treeData.nodes.filter(item => !removed.has(item.id));
      treeData.edges = treeData.edges.filter(edge => !removed.has(edge.from) && !removed.has(edge.to));
    } else {
      return;
    }
    commitTreeStructure(widget, treeData);
  }

  function applyMatrixContextAction(action, context, widget) {
    const rows = matrixStructureRows(widget.content);
    const columns = Math.max(1, ...rows.map(row => row.length));
    rows.forEach(row => { while (row.length < columns) row.push(''); });
    const row = Math.min(context.row, rows.length - 1);
    const column = Math.min(context.column, columns - 1);
    if (action === 'matrix-save') {
      rows[row][column] = context.value;
    } else if (action === 'matrix-row-before' || action === 'matrix-row-after') {
      rows.splice(row + (action === 'matrix-row-after' ? 1 : 0), 0, Array(columns).fill('1'));
    } else if (action === 'matrix-column-before' || action === 'matrix-column-after') {
      const insertAt = column + (action === 'matrix-column-after' ? 1 : 0);
      rows.forEach(item => item.splice(insertAt, 0, '1'));
    } else if (action === 'matrix-row-delete') {
      if (rows.length === 1) rows[0] = Array(columns).fill('');
      else rows.splice(row, 1);
    } else if (action === 'matrix-column-delete') {
      if (columns === 1) rows.forEach(item => { item[0] = ''; });
      else rows.forEach(item => item.splice(column, 1));
    } else {
      return;
    }
    const content = matrixStructureContent(rows);
    updateSelectedStructure({ content });
  }

  function applyItemContextAction(action, context, widget) {
    const values = linearStructureValues(widget.content);
    if (!values.length) values.push('');
    const index = Math.min(context.itemIndex, values.length - 1);
    if (action === 'item-save') {
      values[index] = context.value;
    } else if (action === 'item-before' || action === 'item-after') {
      values.splice(index + (action === 'item-after' ? 1 : 0), 0, '1');
    } else if (action === 'item-delete') {
      if (values.length === 1) values[0] = '';
      else values.splice(index, 1);
    } else {
      return;
    }
    const content = values.join(', ');
    updateSelectedStructure({ content });
  }

  function handleStructureContextAction(event) {
    const button = event.target.closest?.('[data-structure-action]');
    if (!button || button.disabled || !activeStructureContext) return;
    event.preventDefault();
    event.stopPropagation();
    const context = activeStructureContext;
    const action = button.dataset.structureAction;
    if (action === 'context-cancel') {
      hideStructureContextMenu();
      return;
    }
    if (action.endsWith('-edit')) {
      const widgetSelector = `.structure-widget[data-widget-id="${CSS.escape(context.widgetId)}"]`;
      const widgetEl = document.querySelector(`section.present ${widgetSelector}`) || document.querySelector(widgetSelector);
      const cell = structureCellForKey(widgetEl, context.cellKey);
      hideStructureContextMenu();
      if (widgetEl && cell) openStructureInlineEditor(widgetEl, cell);
      return;
    }
    if (action.endsWith('-save')) {
      context.value = structureContextMenu.querySelector('input')?.value || '';
    }
    const found = getWidget(context.widgetId);
    if (!found.widget) {
      hideStructureContextMenu();
      return;
    }
    if (context.mode === 'binary_tree') applyTreeContextAction(action, context, found.widget);
    else if (context.mode === 'matrix') applyMatrixContextAction(action, context, found.widget);
    else applyItemContextAction(action, context, found.widget);
    hideStructureContextMenu();
  }

  function updateAlgorithmEditButton() {
    if (!algorithmEditSlideBtn) return;
    algorithmEditSlideBtn.hidden = getSlide()?.kind !== 'algorithm-animation';
  }

  function showWidgetEditor(widgetId) {
    if (ttsPanelIsExpanded()) {
      showOnlyTtsSidebar();
      return;
    }
    const found = getWidget(widgetId);
    if (!found.widget) return;
    defaultToolPanel.hidden = true;
    if (overviewSidebarPanel) overviewSidebarPanel.hidden = true;
    latexEditorPanel.hidden = found.widget.type !== 'latex';
    codeEditorPanel.hidden = found.widget.type !== 'code';
    if (structureEditorPanel) structureEditorPanel.hidden = found.widget.type !== 'structure';
    setStructureEditorActive(found.widget.type === 'structure');
    if (found.widget.type === 'latex') {
      latexFontSizeInput.value = Math.round(found.widget.fontSize || 34);
      latexEditorInput.value = found.widget.content;
    } else if (found.widget.type === 'code') {
      codeLanguageSelect.value = found.widget.language || 'cpp';
      codeFontSizeInput.value = Math.round(found.widget.fontSize || 21);
      codeFocusLinesInput.value = found.widget.focusLines || '';
      codeShowLineNumbersInput.checked = found.widget.showLineNumbers === true;
      if (codeEditorModalStatus) codeEditorModalStatus.textContent = `Editing code widget ${found.widget.id}`;
    } else if (found.widget.type === 'structure') {
      populateStructureEditor(found.widget);
      if (editorChrome) editorChrome.scrollTop = 0;
    }
    showAnimationEditor(found.widget);
  }

  function showFabricObjectEditor(obj) {
    if (!obj || obj.type === 'activeSelection') return;
    if (ttsPanelIsExpanded()) {
      showOnlyTtsSidebar();
      return;
    }
    defaultToolPanel.hidden = true;
    if (overviewSidebarPanel) overviewSidebarPanel.hidden = true;
    latexEditorPanel.hidden = true;
    codeEditorPanel.hidden = true;
    if (structureEditorPanel) structureEditorPanel.hidden = true;
    setStructureEditorActive(false);
    showAnimationEditor(obj);
  }

  function showAnimationEditor(source) {
    if (!animationEditorPanel || !source) return;
    const animation = normalizeAnimationSettings(source);
    animationEditorPanel.hidden = false;
    if (shapeEditorControls) shapeEditorControls.hidden = !isShapeObject(source);
    shapeChoiceButtons.forEach(button => {
      button.classList.toggle('is-active', isShapeObject(source) && button.dataset.shapeChoice === shapeType(source));
    });
    transitionIdInput.value = animation.transitionId;
    fragmentEnabledInput.checked = animation.fragmentEnabled;
    fragmentStyleSelect.value = animation.fragmentStyle;
    fragmentIndexInput.value = animation.fragmentIndex === null ? '' : String(animation.fragmentIndex);
    fragmentStyleSelect.disabled = !animation.fragmentEnabled;
    fragmentIndexInput.disabled = !animation.fragmentEnabled;
    updateLayerControlsState();
  }

  function hideAnimationEditor() {
    if (animationEditorPanel) animationEditorPanel.hidden = true;
    layerButtonList().forEach(button => { button.disabled = true; });
  }

  function aceModeForLanguage(language) {
    return {
      c: 'c_cpp',
      cpp: 'c_cpp',
      java: 'java',
      javascript: 'javascript',
      python: 'python',
      plaintext: 'text'
    }[language] || 'text';
  }

  function ensureAceCodeEditor() {
    if (aceCodeEditor || !codeAceEditorEl || !window.ace?.edit) return aceCodeEditor;
    codeAceEditorEl.textContent = '';
    aceCodeEditor = window.ace.edit(codeAceEditorEl);
    aceCodeEditor.setTheme('ace/theme/monokai');
    aceCodeEditor.session.setUseWorker(false);
    aceCodeEditor.setOptions({
      fontSize: '15px',
      showPrintMargin: false,
      wrap: false,
      useSoftTabs: true,
      tabSize: 2
    });
    return aceCodeEditor;
  }

  function openCodeEditorModal() {
    const found = getWidget(selectedWidgetId);
    if (!found.widget || found.widget.type !== 'code' || !codeEditorModal) return;
    editingCodeWidgetId = selectedWidgetId;
    codeEditorModal.hidden = false;
    if (codeEditorModalStatus) codeEditorModalStatus.textContent = `Editing code widget ${found.widget.id}`;
    const editor = ensureAceCodeEditor();
    if (!editor) {
      if (codeAceEditorEl) codeAceEditorEl.textContent = 'ACE editor is not loaded. Try again.';
      return;
    }
    editor.session.setMode(`ace/mode/${aceModeForLanguage(found.widget.language)}`);
    editor.setValue(found.widget.content || '', -1);
    requestAnimationFrame(() => {
      editor.resize();
      editor.focus();
    });
  }

  function closeCodeEditorModal() {
    if (codeEditorModal) codeEditorModal.hidden = true;
    editingCodeWidgetId = null;
  }

  function saveCodeEditorModal() {
    if (!editingCodeWidgetId || !aceCodeEditor) {
      closeCodeEditorModal();
      return;
    }
    const found = getWidget(editingCodeWidgetId);
    if (!found.widget || found.widget.type !== 'code') {
      closeCodeEditorModal();
      return;
    }
    selectedWidgetId = editingCodeWidgetId;
    updateSelectedWidget({ content: aceCodeEditor.getValue() });
    showWidgetEditor(editingCodeWidgetId);
    closeCodeEditorModal();
  }

  function layerButtonList() {
    return [layerToTopBtn, layerUpBtn, layerDownBtn, layerToBottomBtn].filter(Boolean);
  }

  function syncWidgetLayerStyles(slide) {
    const layer = slide && document.querySelector(`.widget-layer[data-slide-id="${slide.id}"]`);
    if (!layer) return;
    normalizeWidgets(slide.widgets).forEach(widget => {
      const el = layer.querySelector(`.slide-widget[data-widget-id="${widget.id}"]`);
      if (el) {
        el.style.zIndex = String(Math.round(Number(widget.layerIndex) || WIDGET_LAYER_ABOVE_BASE));
        layer.appendChild(el);
      }
    });
  }

  function syncUnifiedLayerStyles(slide, canvas = currentFabricCanvas()) {
    if (!slide) return;
    const entries = unifiedLayerEntries(slide, canvas);
    const host = document.querySelector(`.fabric-host[data-slide-id="${slide.id}"]`);
    let fabricZ = null;
    entries.forEach((entry, index) => {
      const z = STACK_LAYER_BASE + index * STACK_LAYER_STEP;
      if (entry.kind === 'widget') {
        const el = document.querySelector(`.slide-widget[data-widget-id="${entry.id}"]`);
        if (el) el.style.zIndex = String(z);
      } else if (entry.kind === 'fabric') {
        fabricZ = Math.max(fabricZ ?? z, z);
      }
    });
    if (host) host.style.zIndex = String(fabricZ ?? 0);
  }

  function unifiedLayerEntries(slide, canvas = currentFabricCanvas()) {
    if (!slide) return [];
    const widgets = normalizeWidgets(slide.widgets);
    const entries = widgets.map((widget, index) => ({
      kind: 'widget',
      id: widget.id,
      widget,
      originalIndex: index,
      layerIndex: Number.isFinite(Number(widget.layerIndex)) ? Number(widget.layerIndex) : WIDGET_LAYER_ABOVE_BASE + index
    }));
    const fabricObjects = canvas?.getObjects?.() || normalizeCanvasJson(slide.canvas).objects || [];
    fabricObjects.forEach((object, index) => {
      if (!object.fragmentProxyId) {
        if (object.set) object.set({ fragmentProxyId: randomId() });
        else object.fragmentProxyId = randomId();
      }
      entries.push({
        kind: 'fabric',
        id: object.fragmentProxyId,
        object: object.set ? object : null,
        savedObject: object.set ? null : object,
        originalIndex: index,
        layerIndex: Number.isFinite(Number(object.layerIndex)) ? Number(object.layerIndex) : FABRIC_LAYER_INDEX + index
      });
    });
    return entries.sort((a, b) => (a.layerIndex - b.layerIndex) || (a.originalIndex || 0) - (b.originalIndex || 0));
  }

  function applyUnifiedLayerEntries(slide, canvas, entries) {
    const firstFabricIndex = entries.findIndex(entry => entry.kind === 'fabric');
    let belowWidgetCount = 0;
    let aboveWidgetCount = 0;
    let fabricCount = 0;
    entries.forEach((entry, index) => {
      if (entry.kind === 'widget') {
        entry.widget.layerIndex = STACK_LAYER_BASE + index * STACK_LAYER_STEP;
      } else if (entry.kind === 'fabric') {
        entry.object.set?.({ layerIndex: STACK_LAYER_BASE + index * STACK_LAYER_STEP });
      }
    });
    slide.widgets = entries.filter(entry => entry.kind === 'widget').map(entry => entry.widget);
    syncWidgetLayerStyles(slide);
    syncUnifiedLayerStyles(slide, canvas);
    if (canvas) {
      entries.filter(entry => entry.kind === 'fabric').forEach((entry, index) => {
        if (typeof canvas.moveTo === 'function') canvas.moveTo(entry.object, index);
        else {
          canvas.remove(entry.object);
          canvas.insertAt(entry.object, index, false);
        }
      });
      canvas.requestRenderAll();
    }
  }

  function selectedLayerPosition() {
    const canvas = currentFabricCanvas();
    if (selectedWidgetId) {
      const found = getWidget(selectedWidgetId);
      if (!found.slide || !found.widget) return null;
      const entries = unifiedLayerEntries(found.slide, canvas);
      const index = entries.findIndex(entry => entry.kind === 'widget' && entry.id === selectedWidgetId);
      return index >= 0 ? { index, count: entries.length } : null;
    }
    const slide = getSlide();
    const target = selectedFabricAnimationTarget();
    if (!slide || !target.canvas || !target.object) return null;
    const entries = unifiedLayerEntries(slide, target.canvas);
    const index = entries.findIndex(entry => entry.kind === 'fabric' && entry.object === target.object);
    return index >= 0 ? { index, count: entries.length } : null;
  }

  function updateLayerControlsState() {
    const position = selectedLayerPosition();
    const hasMovableSelection = !!position && position.count > 1;
    layerButtonList().forEach(button => { button.disabled = !hasMovableSelection; });
    if (!hasMovableSelection) return;
    const atBottom = position.index <= 0;
    const atTop = position.index >= position.count - 1;
    if (layerToTopBtn) layerToTopBtn.disabled = atTop;
    if (layerUpBtn) layerUpBtn.disabled = atTop;
    if (layerDownBtn) layerDownBtn.disabled = atBottom;
    if (layerToBottomBtn) layerToBottomBtn.disabled = atBottom;
  }

  function selectedFabricAnimationTarget() {
    const canvas = currentFabricCanvas();
    const object = canvas && canvas.getActiveObject();
    return object && object.type !== 'activeSelection' ? { canvas, object } : {};
  }

  function moveArrayItem(items, fromIndex, toIndex) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) return false;
    const [item] = items.splice(fromIndex, 1);
    items.splice(toIndex, 0, item);
    return true;
  }

  function targetLayerIndex(action, index, count) {
    if (action === 'top') return count - 1;
    if (action === 'up') return Math.min(count - 1, index + 1);
    if (action === 'down') return Math.max(0, index - 1);
    if (action === 'bottom') return 0;
    return index;
  }

  function reorderWidgetLayer(action) {
    if (!selectedWidgetId) return false;
    const found = getWidget(selectedWidgetId);
    if (!found.slide || !found.widget) return false;
    const canvas = currentFabricCanvas();
    const entries = unifiedLayerEntries(found.slide, canvas);
    const index = entries.findIndex(entry => entry.kind === 'widget' && entry.id === selectedWidgetId);
    const nextIndex = targetLayerIndex(action, index, entries.length);
    if (!moveArrayItem(entries, index, nextIndex)) return false;
    applyUnifiedLayerEntries(found.slide, canvas, entries);
    if (canvas) found.slide.canvas = serializeFabricCanvas(canvas);
    syncSlideAutoAnimate(found.slide);
    saveDeck();
    const layer = document.querySelector(`.widget-layer[data-slide-id="${found.slide.id}"]`);
    if (layer) {
      normalizeWidgets(found.slide.widgets).forEach(widget => {
        const el = layer.querySelector(`.slide-widget[data-widget-id="${widget.id}"]`);
        if (el) {
          el.style.zIndex = String(Math.round(Number(widget.layerIndex) || WIDGET_LAYER_ABOVE_BASE));
          layer.appendChild(el);
        }
      });
    }
    selectWidget(selectedWidgetId);
    updateLayerControlsState();
    return true;
  }

  function reorderFabricLayer(action) {
    const target = selectedFabricAnimationTarget();
    if (!target.canvas || !target.object) return false;
    const slide = getSlide();
    if (!slide) return false;
    const entries = unifiedLayerEntries(slide, target.canvas);
    const index = entries.findIndex(entry => entry.kind === 'fabric' && entry.object === target.object);
    const nextIndex = targetLayerIndex(action, index, entries.length);
    if (!moveArrayItem(entries, index, nextIndex)) return false;
    applyUnifiedLayerEntries(slide, target.canvas, entries);
    target.canvas.setActiveObject(target.object);
    target.canvas.requestRenderAll();
    syncCurrentSlideCanvas();
    updateObjectToolbar(target.object, target.canvas);
    updateLayerControlsState();
    return true;
  }

  function reorderSelectedLayer(action) {
    const moved = selectedWidgetId ? reorderWidgetLayer(action) : reorderFabricLayer(action);
    if (moved) syncRevealPreservingPosition();
  }

  function updateSelectedAnimation(patch) {
    if (selectedWidgetId) {
      updateSelectedWidget(patch);
      syncRevealPreservingPosition();
      showAnimationEditor(getWidget(selectedWidgetId).widget);
      return;
    }
    const target = selectedFabricAnimationTarget();
    if (!target.canvas || !target.object) return;
    target.object.set(patch);
    configureObject(target.object);
    target.canvas.requestRenderAll();
    syncCurrentSlideCanvas();
    showAnimationEditor(target.object);
  }

  function updateSelectedWidget(patch, { history = true } = {}) {
    if (!selectedWidgetId) return;
    const found = getWidget(selectedWidgetId);
    if (!found.widget) return;
    if (found.widget.type === 'latex' && ('content' in patch || 'fontSize' in patch)) {
      patch.manualSize = false;
    }
    Object.assign(found.widget, patch);
    saveDeck({ history });
    const el = document.querySelector(`.slide-widget[data-widget-id="${selectedWidgetId}"]`);
    if (el) {
      el.style.left = `${found.widget.x}px`;
      el.style.top = `${found.widget.y}px`;
      el.style.width = `${found.widget.w}px`;
      el.style.height = `${found.widget.h}px`;
      el.style.fontSize = `${found.widget.fontSize}px`;
      el.style.zIndex = String(Math.round(Number(found.widget.layerIndex) || WIDGET_LAYER_ABOVE_BASE));
      el.dataset.manualSize = found.widget.manualSize ? 'true' : 'false';
      applyAnimationAttributes(el, found.widget);
      if (found.widget.type !== 'code') {
        updateWidgetContentElement(el, found.widget);
      }
      el.classList.add('is-selected');
      syncSlideAutoAnimate(found.slide);
      refreshWidgetElement(el, found.widget);
    }
  }

  function updateWidgetContentElement(el, widget) {
    if (widget.type === 'code') {
      let code = el.querySelector('code');
      if (!code) {
        paintWidgetElement(el, widget);
        return;
      }
      code.removeAttribute('data-highlighted');
      code.className = `language-${widget.language || 'cpp'}`;
      code.textContent = widget.content || defaultCode();
      applyCodeFocusLines(code, widget.focusLines, widget.showLineNumbers);
    } else if (widget.type === 'structure') {
      let content = el.querySelector('.structure-content');
      if (!content) {
        paintWidgetElement(el, widget);
        return;
      }
      window.AlgoStructureRenderer?.render(content, widget);
    } else {
      let content = el.querySelector('.latex-content');
      if (!content) {
        paintWidgetElement(el, widget);
        return;
      }
      const latexSource = normalizeLatexSource(widget.content || String.raw`\(\sum_{i=1}^{n} i = \frac{n(n+1)}{2}\)`);
      content.dataset.latexSource = latexSource;
      content.textContent = latexSource;
    }
    positionWidgetContent(el, widget);
  }

  function deleteSelectedWidget({ history = true } = {}) {
    const widgetIds = selectedWidgetIdsInCurrentSlide();
    if (!widgetIds.length) return false;
    const slide = getSlide();
    if (!slide) return false;
    const idSet = new Set(widgetIds);
    slide.widgets = normalizeWidgets(slide.widgets).filter(widget => !idSet.has(widget.id));
    document.querySelectorAll(`.widget-layer[data-slide-id="${slide.id}"] .slide-widget`).forEach(el => {
      if (idSet.has(el.dataset.widgetId)) el.remove();
    });
    selectedWidgetId = null;
    showDefaultPanel();
    saveDeck({ history });
    updateAlignmentToolbar();
    return true;
  }

  function slidePointFromEvent(event) {
    const slide = getSlide();
    const host = slide && document.querySelector(`.fabric-host[data-slide-id="${slide.id}"]`);
    if (!host) return { x: SLIDE_W / 2, y: SLIDE_H / 2 };
    const rect = host.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * SLIDE_W,
      y: ((event.clientY - rect.top) / rect.height) * SLIDE_H
    };
  }

  function clampSlideViewportZoom(value) {
    return Math.max(SLIDE_ZOOM_MIN, Math.min(SLIDE_ZOOM_MAX, Number(value) || 1));
  }

  function setSlideViewportZoom(value) {
    slideViewportZoom = Math.round(clampSlideViewportZoom(value) * 100) / 100;
    document.documentElement.style.setProperty('--slide-user-zoom', String(slideViewportZoom));
    document.documentElement.style.setProperty('--edit-slide-zoom-scale', String(EDIT_SLIDE_BASE_SCALE * slideViewportZoom));
    document.body.dataset.slideZoom = String(slideViewportZoom);
    if (slideZoomValue) slideZoomValue.value = `${Math.round(slideViewportZoom * 100)}%`;
    if (slideZoomOutBtn) slideZoomOutBtn.disabled = slideViewportZoom <= SLIDE_ZOOM_MIN;
    if (slideZoomInBtn) slideZoomInBtn.disabled = slideViewportZoom >= SLIDE_ZOOM_MAX;
    if (slideZoomResetBtn) slideZoomResetBtn.disabled = Math.abs(slideViewportZoom - 1) < 0.001;
    clearSnapGuides();
    requestAnimationFrame(() => {
      const canvas = currentFabricCanvas();
      if (canvas?.getActiveObject()) updateObjectToolbar(canvas.getActiveObject(), canvas);
      updateAlignmentToolbar();
    });
  }

  function adjustSlideViewportZoom(delta) {
    setSlideViewportZoom(slideViewportZoom + delta);
  }

  function isSlideZoomTypingTarget(target) {
    return !!target?.closest?.('input, textarea, select, [contenteditable="true"], .ace_text-input');
  }

  function handleSlideZoomWheel(event) {
    if (!(event.ctrlKey || event.metaKey) || isOverviewEditing()) return;
    if (!event.target.closest?.('.reveal')) return;
    event.preventDefault();
    event.stopPropagation();
    const direction = event.deltaY < 0 ? 1 : -1;
    adjustSlideViewportZoom(direction * SLIDE_ZOOM_STEP);
  }

  function handleSlideZoomKeydown(event) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || isSlideZoomTypingTarget(event.target)) return;
    const key = event.key;
    if (key === '0') {
      event.preventDefault();
      setSlideViewportZoom(1);
    } else if (key === '+' || key === '=') {
      event.preventDefault();
      adjustSlideViewportZoom(SLIDE_ZOOM_STEP);
    } else if (key === '-' || key === '_') {
      event.preventDefault();
      adjustSlideViewportZoom(-SLIDE_ZOOM_STEP);
    }
  }

  function applyEditMode(enabled) {
    fabricCanvases.forEach(canvas => {
      canvas.selection = enabled;
      canvas.skipTargetFind = !enabled;
      canvas.getObjects().forEach(obj => {
        obj.selectable = enabled;
        obj.evented = enabled;
        obj.hasControls = enabled;
        obj.hasBorders = enabled && !isSegmentObject(obj);
      });
      if (!enabled) canvas.discardActiveObject();
      canvas.requestRenderAll();
    });
    if (!enabled) hideObjectToolbar();
    refreshFabricFragmentVisibility();
  }

  function setEditMode(enabled) {
    if (!enabled && customOverviewOpen) closeCustomOverview();
    if (enabled && reveal && reveal.isOverview && reveal.isOverview()) reveal.toggleOverview();
    document.body.classList.add('mode-layout-animating');
    if (modeLayoutAnimationTimer) clearTimeout(modeLayoutAnimationTimer);
    document.body.classList.toggle('asm-edit-mode', enabled);
    const modeToggleBtn = document.getElementById('modeToggleBtn');
    const nextMode = enabled ? 'Present' : 'Edit';
    if (modeToggleBtn) {
      modeToggleBtn.title = `切換到 ${nextMode} 模式`;
      modeToggleBtn.setAttribute('aria-label', `切換到 ${nextMode} 模式`);
    }
    applyEditMode(enabled);
    if (!enabled) clearSnapGuides();
    updateAlignmentToolbar();
    if (reveal) setTimeout(() => reveal.layout(), 20);
    modeLayoutAnimationTimer = setTimeout(() => {
      if (reveal) reveal.layout();
      document.body.classList.remove('mode-layout-animating');
      modeLayoutAnimationTimer = null;
    }, 380);
  }

  function clearSelectionWhenClickingOutsideSlide(event) {
    if (!document.body.classList.contains('asm-edit-mode') || isOverviewEditing() || event.button !== 0) return;
    const target = event.target;
    if (!target || !target.closest) return;
    if (target.closest('.asm-slide-frame-content, #controlChrome, #editorChrome, #objectToolbar, #ttsObjectEditorPopover, #alignmentToolbar, #iroPopup, #structureContextMenu, #ttsTransport, #overviewChrome, #customOverview, #algorithmEditorModal, #codeEditorModal, .slide-edge-add')) return;
    const canvas = currentFabricCanvas();
    const hadFabricSelection = !!(canvas && canvas.getActiveObject());
    if (canvas && hadFabricSelection) {
      canvas.discardActiveObject();
      canvas.requestRenderAll();
    }
    if (selectedWidgetIdsInCurrentSlide().length) {
      clearWidgetSelection();
    } else if (hadFabricSelection) {
      hideObjectToolbar();
      showDefaultPanel();
    }
  }

  function bindChrome() {
    document.getElementById('modeToggleBtn').addEventListener('click', () => {
      setEditMode(!document.body.classList.contains('asm-edit-mode'));
    });
    slideZoomOutBtn?.addEventListener('click', () => adjustSlideViewportZoom(-SLIDE_ZOOM_STEP));
    slideZoomInBtn?.addEventListener('click', () => adjustSlideViewportZoom(SLIDE_ZOOM_STEP));
    slideZoomResetBtn?.addEventListener('click', () => setSlideViewportZoom(1));
    document.addEventListener('wheel', handleSlideZoomWheel, { passive: false, capture: true });
    document.addEventListener('keydown', handleSlideZoomKeydown, true);
    setSlideViewportZoom(1);
    exportDeckBtn?.addEventListener('click', exportDeckJson);
    importDeckBtn?.addEventListener('click', () => importDeckInput?.click());
    importDeckInput?.addEventListener('change', () => importDeckJsonFile(importDeckInput.files && importDeckInput.files[0]));
    shareDeckBtn?.addEventListener('click', openShareDialog);
    closeShareDialogBtn?.addEventListener('click', closeShareDialog);
    cancelShareDialogBtn?.addEventListener('click', closeShareDialog);
    shareForm?.addEventListener('submit', saveShareSettings);
    shareForm?.querySelectorAll('input[name="shareMode"]').forEach(input => {
      input.addEventListener('change', previewSelectedShareMode);
    });
    alignmentToolbar?.addEventListener('mousedown', event => event.preventDefault());
    alignmentToolbar?.addEventListener('click', event => {
      const button = event.target.closest('[data-align-action]');
      if (button && !button.disabled) alignSelectedObjects(button.dataset.alignAction);
    });
    ttsPanelToggleBtn?.addEventListener('click', () => {
      setTtsPanelExpanded(ttsTransport?.dataset.expanded !== 'true');
    });
    ttsPanelCloseBtn?.addEventListener('click', () => setTtsPanelExpanded(false));
    ttsObjectBtn?.addEventListener('click', openSelectedTextTts);
    ttsObjectEditorCloseBtn?.addEventListener('click', closeTtsObjectEditor);
    ttsObjectMuteBtn?.addEventListener('click', () => {
      if (!expandedTtsObjectKey) return;
      const entry = ttsNarrationEntries(getSlide(), { includeMuted: true })
        .find(item => item.key === expandedTtsObjectKey);
      if (entry) setTtsEntryMuted(expandedTtsObjectKey, entry.source.ttsMuted !== true);
    });
    ttsObjectResetBtn?.addEventListener('click', () => {
      if (!expandedTtsObjectKey) return;
      setTtsEntryScript(expandedTtsObjectKey, '', 'auto');
      syncTtsObjectEditor();
      renderTtsObjectOrder();
    });
    ttsObjectScriptInput?.addEventListener('input', () => {
      if (!expandedTtsObjectKey) return;
      setTtsEntryScript(expandedTtsObjectKey, ttsObjectScriptInput.value, 'manual');
      if (ttsObjectEditorMode) ttsObjectEditorMode.textContent = '自訂台詞';
      if (ttsObjectResetBtn) ttsObjectResetBtn.disabled = false;
      renderTtsObjectOrder();
    });
    ttsPlayPauseBtn?.addEventListener('click', handleTtsPlayPause);
    ttsStopBtn?.addEventListener('click', () => stopTtsPlayback());
    ttsRateInput?.addEventListener('input', () => updateTtsSettingsFromControls());
    ttsRateInput?.addEventListener('change', () => updateTtsSettingsFromControls({ history: true }));
    ttsVolumeInput?.addEventListener('input', () => updateTtsSettingsFromControls());
    ttsVolumeInput?.addEventListener('change', () => updateTtsSettingsFromControls({ history: true }));
    ttsAddCarrierBtn?.addEventListener('click', addTtsCarrier);
    ttsObjectOrderList?.addEventListener('click', event => {
      if (suppressTtsOrderClick) {
        event.preventDefault();
        return;
      }
      const item = event.target.closest('.tts-object-item');
      if (!item) return;
      selectTtsEntry(item.dataset.ttsObjectKey);
    });
    ttsObjectOrderList?.addEventListener('pointerdown', event => {
      const item = event.target.closest('.tts-object-item');
      if (!item || sharedAccess === 'view' || event.button !== 0) return;
      event.preventDefault();
      const rect = item.getBoundingClientRect();
      item.setPointerCapture?.(event.pointerId);
      ttsPointerSort = {
        pointerId: event.pointerId,
        sourceKey: item.dataset.ttsObjectKey,
        source: item,
        targetKey: null,
        after: false,
        startX: event.clientX,
        startY: event.clientY,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        ghost: null,
        active: false
      };
    });
    ttsObjectOrderList?.addEventListener('pointermove', event => {
      if (!ttsPointerSort || event.pointerId !== ttsPointerSort.pointerId) return;
      if (!ttsPointerSort.active && Math.hypot(
        event.clientX - ttsPointerSort.startX,
        event.clientY - ttsPointerSort.startY
      ) < 4) return;
      event.preventDefault();
      if (!ttsPointerSort.active) {
        ttsPointerSort.active = true;
        const sourceRect = ttsPointerSort.source.getBoundingClientRect();
        const ghost = ttsPointerSort.source.cloneNode(true);
        ghost.classList.remove('is-expanded', 'is-reading', 'is-drop-before', 'is-drop-after');
        ghost.classList.add('tts-object-drag-ghost');
        ghost.style.width = `${sourceRect.width}px`;
        ghost.style.height = `${sourceRect.height}px`;
        document.body.appendChild(ghost);
        ttsPointerSort.ghost = ghost;
      }
      if (ttsPointerSort.ghost) {
        ttsPointerSort.ghost.style.left = `${event.clientX - ttsPointerSort.offsetX}px`;
        ttsPointerSort.ghost.style.top = `${event.clientY - ttsPointerSort.offsetY}px`;
      }
      clearTtsSortIndicators();
      ttsPointerSort.source?.classList.add('is-dragging');
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.tts-object-item');
      if (!target || !ttsObjectOrderList.contains(target) || target.dataset.ttsObjectKey === ttsPointerSort.sourceKey) {
        ttsPointerSort.targetKey = null;
        return;
      }
      const after = event.clientY > target.getBoundingClientRect().top + target.offsetHeight / 2;
      target.classList.add(after ? 'is-drop-after' : 'is-drop-before');
      ttsPointerSort.targetKey = target.dataset.ttsObjectKey;
      ttsPointerSort.after = after;
    });
    const finishTtsPointerSort = event => {
      if (!ttsPointerSort || event.pointerId !== ttsPointerSort.pointerId) return;
      const completed = ttsPointerSort;
      ttsPointerSort = null;
      completed.ghost?.remove();
      clearTtsSortIndicators();
      if (completed.active && completed.targetKey) {
        reorderTtsObject(completed.sourceKey, completed.targetKey, completed.after);
      }
      if (completed.active) {
        suppressTtsOrderClick = true;
        setTimeout(() => {
          suppressTtsOrderClick = false;
        }, 0);
      }
    };
    ttsObjectOrderList?.addEventListener('pointerup', finishTtsPointerSort);
    ttsObjectOrderList?.addEventListener('pointercancel', finishTtsPointerSort);
    copyViewShareUrlBtn?.addEventListener('click', () => copyShareUrl(viewShareUrl, copyViewShareUrlBtn));
    copyEditShareUrlBtn?.addEventListener('click', () => copyShareUrl(editShareUrl, copyEditShareUrlBtn));
    shareDialog?.addEventListener('click', event => {
      if (event.target === shareDialog) closeShareDialog();
    });
    document.getElementById('addSlideBtn').addEventListener('click', addSlideNearCurrent);
    document.getElementById('overviewAddSlideBtn')?.addEventListener('click', addSlideNearCurrent);
    document.getElementById('overviewAddAlgorithmSlideBtn')?.addEventListener('click', addAlgorithmSlideNearCurrent);
    algorithmEditSlideBtn?.addEventListener('click', () => {
      const slide = getSlide();
      if (slide?.kind === 'algorithm-animation') openAlgorithmEditor(slide.id);
    });
    document.getElementById('saveAlgorithmEditorBtn')?.addEventListener('click', saveAlgorithmEditor);
    window.addEventListener('message', handleAlgorithmEmbedMessage);
    document.addEventListener('mousedown', clearSelectionWhenClickingOutsideSlide, true);
    slidesRoot.addEventListener('contextmenu', openStructureContextMenu);
    structureContextMenu?.addEventListener('click', handleStructureContextAction);
    document.addEventListener('mousedown', event => {
      if (!event.target.closest?.('#structureContextMenu')) hideStructureContextMenu();
    });
    document.addEventListener('pointerdown', event => {
      if (!activeStructureInlineEditor || event.target.closest?.('.structure-inline-value-input')) return;
      const keepsCellSelection = event.target.closest?.('[data-structure-item-index], #structureContextMenu');
      closeStructureInlineEditor(true);
      if (!keepsCellSelection) clearStructureCellSelection({ closeEditor: false });
    }, true);
    document.addEventListener('mousedown', event => {
      if (iroPopup.hidden) return;
      const target = event.target;
      if (target.closest?.('#iroPopup, #textColorBtn, #bgColorBtn, #shapeStrokeBtn, #shapeColorBtn, .structure-color-button')) return;
      iroPopup.hidden = true;
      commitPendingColorHistory();
    });
    ['mousedown', 'pointerdown', 'click'].forEach(type => {
      iroPopup.addEventListener(type, event => event.stopPropagation());
    });
    slidesRoot.addEventListener('click', event => {
      if (handleSlideEdgeAddClick(event)) return;
    });

    shapeMenuBtn.addEventListener('click', event => {
      event.stopPropagation();
      shapeMenu.hidden = !shapeMenu.hidden;
      if (structureMenu) structureMenu.hidden = true;
    });
    structureMenuBtn?.addEventListener('click', event => {
      event.stopPropagation();
      if (structureMenu) structureMenu.hidden = !structureMenu.hidden;
      shapeMenu.hidden = true;
    });

    document.addEventListener('click', event => {
      if (!event.target.closest('.shape-tool')) shapeMenu.hidden = true;
      if (!event.target.closest('.structure-tool') && structureMenu) structureMenu.hidden = true;
    });

    document.querySelectorAll('[data-tool]').forEach(item => {
      item.addEventListener('dragstart', event => {
        const tool = toolValueForElement(item);
        event.dataTransfer.setData('application/x-asm-tool', tool);
        event.dataTransfer.effectAllowed = 'copy';
      });
      item.addEventListener('click', () => {
        exitWidgetEditorIfNeeded();
        const tool = toolValueForElement(item);
        pendingTool = null;
        updateArmedTool();
        shapeMenu.hidden = true;
        if (structureMenu) structureMenu.hidden = true;
        addObject(tool, { x: SLIDE_W / 2, y: SLIDE_H / 2 });
        flashHint('Done');
      });
    });


    document.getElementById('exitLatexEditorBtn').addEventListener('click', clearWidgetSelection);
    document.getElementById('exitCodeEditorBtn').addEventListener('click', clearWidgetSelection);
    exitStructureEditorBtn?.addEventListener('click', clearWidgetSelection);
    latexEditorInput.addEventListener('input', () => updateSelectedWidget({ content: latexEditorInput.value }));
    structureModeSelect?.addEventListener('change', () => {
      const found = getWidget(selectedWidgetId);
      const structureMode = structureModeSelect.value;
      const patch = { structureMode };
      if (structureMode === 'binary_tree') {
        patch.treeData = normalizeTreeData(found.widget?.treeData, found.widget?.content || '');
      }
      updateSelectedStructure(patch);
      syncStructureEditorVisibility({ structureMode });
    });
    structureTreeLayoutSelect?.addEventListener('change', () => updateSelectedStructure({ treeLayout: structureTreeLayoutSelect.value }));
    structureTreeDirectionSelect?.addEventListener('change', () => updateSelectedStructure({
      treeHorizontal: structureTreeDirectionSelect.value === 'horizontal'
    }));
    structureIndexModeSelect?.addEventListener('change', () => updateSelectedStructure({ indexMode: Number(structureIndexModeSelect.value) }));
    structureIndexBaseSelect?.addEventListener('change', () => updateSelectedStructure({ indexBase: Number(structureIndexBaseSelect.value) }));
    structureItemsPerRowInput?.addEventListener('input', () => updateSelectedStructure({ itemsPerRow: Math.max(0, Number(structureItemsPerRowInput.value) || 0) }));
    structureGapInput?.addEventListener('input', () => updateSelectedStructure({ gap: Math.max(0, Number(structureGapInput.value) || 0) }));
    structureCellSizeInput?.addEventListener('input', () => updateSelectedStructure({ cellSize: Math.max(18, Number(structureCellSizeInput.value) || 18) }));
    structureFontSizeInput?.addEventListener('input', () => updateSelectedStructure({ fontSize: Math.max(8, Number(structureFontSizeInput.value) || 8) }));
    structureBaseFillInput?.addEventListener('input', () => updateSelectedStructure({ baseFill: structureBaseFillInput.value }));
    structureBorderColorInput?.addEventListener('input', () => updateSelectedStructure({ borderColor: structureBorderColorInput.value }));
    structureTextColorInput?.addEventListener('input', () => updateSelectedStructure({ textColor: structureTextColorInput.value }));
    structureLineColorInput?.addEventListener('input', () => updateSelectedStructure({ lineColor: structureLineColorInput.value }));
    structureHighlightIndicesInput?.addEventListener('input', () => updateSelectedStructure({ highlightIndices: structureHighlightIndicesInput.value }));
    structureFocusIndicesInput?.addEventListener('input', () => updateSelectedStructure({ focusIndices: structureFocusIndicesInput.value }));
    structurePointIndicesInput?.addEventListener('input', () => updateSelectedStructure({ pointIndices: structurePointIndicesInput.value }));
    structureMarkIndicesInput?.addEventListener('input', () => updateSelectedStructure({ markIndices: structureMarkIndicesInput.value }));
    structureBackgroundIndicesInput?.addEventListener('input', () => updateSelectedStructure({ backgroundIndices: structureBackgroundIndicesInput.value }));
    structureFrameBackgroundEnabledInput?.addEventListener('change', () => {
      if (structureFrameBackgroundColorInput) structureFrameBackgroundColorInput.disabled = !structureFrameBackgroundEnabledInput.checked;
      updateSelectedStructure({ frameBackgroundEnabled: structureFrameBackgroundEnabledInput.checked });
    });
    structureColorBindings.forEach(binding => {
      binding.button?.addEventListener('click', () => openIro(binding.target));
    });
    openCodeEditorBtn?.addEventListener('click', openCodeEditorModal);
    closeCodeEditorModalBtn?.addEventListener('click', closeCodeEditorModal);
    saveCodeEditorModalBtn?.addEventListener('click', saveCodeEditorModal);
    codeEditorModal?.addEventListener('mousedown', event => {
      if (event.target === codeEditorModal) closeCodeEditorModal();
    });
    codeEditorModal?.querySelector('.code-editor-dialog')?.addEventListener('mousedown', event => {
      event.stopPropagation();
    });
    codeLanguageSelect.addEventListener('change', () => {
      updateSelectedWidget({ language: codeLanguageSelect.value });
      if (aceCodeEditor && codeEditorModal && !codeEditorModal.hidden && editingCodeWidgetId === selectedWidgetId) {
        aceCodeEditor.session.setMode(`ace/mode/${aceModeForLanguage(codeLanguageSelect.value)}`);
      }
    });
    latexFontSizeInput.addEventListener('input', () => updateSelectedWidget({ fontSize: Number(latexFontSizeInput.value) || 34 }));
    codeFontSizeInput.addEventListener('input', () => updateSelectedWidget({ fontSize: Number(codeFontSizeInput.value) || 21 }));
    codeFocusLinesInput.addEventListener('input', () => updateSelectedWidget({ focusLines: codeFocusLinesInput.value }));
    codeShowLineNumbersInput.addEventListener('change', () => updateSelectedWidget({ showLineNumbers: codeShowLineNumbersInput.checked }));
    layerToTopBtn?.addEventListener('click', () => reorderSelectedLayer('top'));
    layerUpBtn?.addEventListener('click', () => reorderSelectedLayer('up'));
    layerDownBtn?.addEventListener('click', () => reorderSelectedLayer('down'));
    layerToBottomBtn?.addEventListener('click', () => reorderSelectedLayer('bottom'));
    transitionIdInput.addEventListener('input', () => updateSelectedAnimation({ transitionId: transitionIdInput.value }));
    fragmentEnabledInput.addEventListener('change', () => updateSelectedAnimation({ fragmentEnabled: fragmentEnabledInput.checked }));
    fragmentStyleSelect.addEventListener('change', () => updateSelectedAnimation({ fragmentStyle: fragmentStyleSelect.value }));
    fragmentIndexInput.addEventListener('input', () => updateSelectedAnimation({
      fragmentIndex: fragmentIndexInput.value === '' ? null : Math.max(0, Math.round(Number(fragmentIndexInput.value) || 0))
    }));
    document.querySelectorAll('[data-insert]').forEach(button => {
      button.addEventListener('click', () => insertAtCursor(latexEditorInput, button.dataset.insert));
    });

    objectToolbar.addEventListener('mousedown', event => {
      if (event.target.tagName !== 'INPUT' && event.target.tagName !== 'SELECT') event.preventDefault();
    });

    fontFamilySelect.addEventListener('change', () => applyTextStyle({ fontFamily: fontFamilySelect.value }));
    fontSizeInput.addEventListener('input', () => applyTextStyle({ fontSize: Number(fontSizeInput.value) || 34 }));
    boldBtn.addEventListener('click', () => toggleTextStyle('fontWeight', 'bold', 'normal'));
    italicBtn.addEventListener('click', () => toggleTextStyle('fontStyle', 'italic', 'normal'));
    underlineBtn.addEventListener('click', () => toggleTextStyle('underline', true, false));
    strikeBtn.addEventListener('click', () => toggleTextStyle('linethrough', true, false));
    alignCycleBtn.addEventListener('click', cycleTextAlign);
    listStyleBtn.addEventListener('click', cycleTextList);
    textColorBtn.addEventListener('click', () => openIro('text'));
    bgColorBtn.addEventListener('click', () => openIro('background'));
    shapeStrokeBtn.addEventListener('click', () => openIro('shape-stroke'));
    shapeColorBtn.addEventListener('click', () => openIro('shape-fill'));
    shapeChoiceButtons.forEach(button => {
      button.addEventListener('click', () => replaceSelectedShape(button.dataset.shapeChoice));
    });
    shapeStrokeWidthInput.addEventListener('input', () => {
      applyShapeStyle({ strokeWidth: Number(shapeStrokeWidthInput.value) || 0 }, { history: false });
      scheduleHistorySnapshot();
    });
    shapeCornerRadiusInput.addEventListener('input', () => {
      applyShapeStyle({ cornerRadius: Number(shapeCornerRadiusInput.value) || 0 }, { history: false });
      scheduleHistorySnapshot();
    });
    shapeArrowSizeInput.addEventListener('input', () => {
      applyShapeStyle({ arrowHeadSize: Number(shapeArrowSizeInput.value) || 24 }, { history: false });
      scheduleHistorySnapshot();
    });
    shapeArrowStyleSelect.addEventListener('change', () => applyShapeStyle({ arrowHeadStyle: shapeArrowStyleSelect.value }));
    shapeStrokeWidthInput.addEventListener('change', commitPendingColorHistory);
    shapeCornerRadiusInput.addEventListener('change', commitPendingColorHistory);
    shapeArrowSizeInput.addEventListener('change', commitPendingColorHistory);
  }

  function insertAtCursor(input, text) {
    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    input.value = `${input.value.slice(0, start)}${text}${input.value.slice(end)}`;
    input.focus();
    input.selectionStart = input.selectionEnd = start + text.length;
    updateSelectedWidget({ content: input.value });
  }

  function updateArmedTool() {
    document.querySelectorAll('[data-tool]').forEach(item => {
      const tool = toolValueForElement(item);
      item.classList.toggle('is-armed', tool === pendingTool);
    });
    shapeMenuBtn.classList.toggle('is-armed', ['rect', 'circle', 'triangle', 'line', 'arrow'].includes(pendingTool));
    structureMenuBtn?.classList.toggle('is-armed', String(pendingTool || '').startsWith('structure:'));
  }

  function toolValueForElement(item) {
    if (item.dataset.tool === 'shape') return item.dataset.shape;
    if (item.dataset.tool === 'structure') return `structure:${item.dataset.structureMode || 'normal'}`;
    return item.dataset.tool;
  }

  function bindSlideDrop() {
    let widgetDrag = null;
    let suppressWidgetClick = false;

    const isCodeScrollbarInteraction = (event, widgetEl) => {
      if (!widgetEl?.classList.contains('code-widget')) return false;
      if (event.target.closest?.('.widget-edge-handle')) return false;
      const pre = event.target.closest?.('.code-widget pre') || widgetEl.querySelector('pre');
      if (!pre) return false;
      const rect = pre.getBoundingClientRect();
      const hitsVertical = pre.scrollHeight > pre.clientHeight && event.clientX >= rect.right - CODE_SCROLLBAR_HIT_GUTTER;
      return hitsVertical;
    };

    const beginWidgetDrag = event => {
      if (!document.body.classList.contains('asm-edit-mode')) return;
      let widgetEl = event.target.closest && event.target.closest('.slide-widget');
      if (!widgetEl && event.target.closest?.('.upper-canvas, .lower-canvas, .fabric-host')) {
        widgetEl = widgetClaimableThroughCanvas(event);
        if (!widgetEl && fabricObjectAtPoint(event)) return;
      }
      const insideEditorUi = event.target.closest && event.target.closest('#controlChrome, #editorChrome, #objectToolbar, #ttsObjectEditorPopover, #alignmentToolbar, #iroPopup, #structureContextMenu, #ttsTransport, #codeEditorModal, .mode-switch, #overviewChrome');
      if (selectedWidgetId && !widgetEl && !insideEditorUi && event.button === 0) {
        exitWidgetEditorIfNeeded();
      }
      if (!widgetEl || event.button !== 0 || isOverviewEditing() || widgetDrag) return;
      if (isCodeScrollbarInteraction(event, widgetEl)) return;
      if (widgetEl.classList.contains('structure-widget')) {
        if (event.target.closest?.('.structure-inline-value-input')) return;
        if (widgetEl.classList.contains('is-selected')
          && event.target.closest?.('[data-structure-item-index]')) return;
      }
      if (event.shiftKey) return;
      event.stopPropagation();
      event.preventDefault();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      if (event.pointerId != null && widgetEl.setPointerCapture) {
        try {
          widgetEl.setPointerCapture(event.pointerId);
        } catch (err) {
          // Pointer capture is best-effort; document-level listeners still track movement.
        }
      }
      const selectedIds = selectedWidgetIdsInCurrentSlide();
      const preserveGroup = widgetEl.classList.contains('is-selected') && selectedIds.length > 1;
      const modifierSelection = event.ctrlKey || event.metaKey;
      const pendingModifierSelection = modifierSelection && !widgetEl.classList.contains('is-selected');
      if (!preserveGroup && !modifierSelection) selectWidget(widgetEl.dataset.widgetId);
      const found = getWidget(widgetEl.dataset.widgetId);
      if (!found.widget) return;
      if (found.widget.type === 'code') {
        finishCodeAutoAnimation();
        resetCodeWidgetRuntimeStyles(widgetEl, found.widget);
      }
      const dragIds = preserveGroup ? selectedIds : [widgetEl.dataset.widgetId];
      const resizable = dragIds.length === 1 && (found.widget.type === 'code' || found.widget.type === 'structure');
      const edge = resizable ? (event.target.dataset.resizeEdge || inferResizeEdge(widgetEl, event)) : null;
      const layerRect = widgetEl.closest('.widget-layer').getBoundingClientRect();
      const scaleX = layerRect.width / SLIDE_W;
      const scaleY = layerRect.height / SLIDE_H;
      widgetDrag = {
        widgetId: widgetEl.dataset.widgetId,
        mode: edge ? 'resize' : 'move',
        edge,
        startX: event.clientX,
        startY: event.clientY,
        originalX: found.widget.x,
        originalY: found.widget.y,
        originalW: found.widget.w,
        originalH: found.widget.h,
        originalFontSize: found.widget.fontSize || (found.widget.type === 'code' ? 21 : (found.widget.type === 'structure' ? 18 : 34)),
        originalScale: found.widget.scale || 1,
        items: dragIds.map(id => {
          const item = getWidget(id).widget;
          return item ? { id, x: item.x, y: item.y, w: item.w, h: item.h } : null;
        }).filter(Boolean),
        shiftLockAxis: null,
        scaleX,
        scaleY,
        pendingModifierSelection,
        moved: false
      };
      widgetEl.classList.toggle('is-resizing', !!edge);
    };

    function inferResizeEdge(widgetEl, event) {
      if (!widgetEl.classList.contains('is-selected')) return null;
      const rect = widgetEl.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const pad = 10;
      const nearTop = Math.abs(y) <= pad;
      const nearBottom = Math.abs(y - rect.height) <= pad;
      const nearLeft = Math.abs(x) <= pad;
      const nearRight = Math.abs(x - rect.width) <= pad;
      if (nearTop && nearLeft) return 'top-left';
      if (nearTop && nearRight) return 'top-right';
      if (nearBottom && nearLeft) return 'bottom-left';
      if (nearBottom && nearRight) return 'bottom-right';
      if (nearTop && x > rect.width * 0.25 && x < rect.width * 0.75) return 'top';
      if (nearBottom && x > rect.width * 0.25 && x < rect.width * 0.75) return 'bottom';
      if (nearLeft && y > rect.height * 0.25 && y < rect.height * 0.75) return 'left';
      if (nearRight && y > rect.height * 0.25 && y < rect.height * 0.75) return 'right';
      return null;
    }

    const updateWidgetDrag = event => {
      if (!widgetDrag) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      const found = getWidget(widgetDrag.widgetId);
      if (!found.widget) return;
      const clientX = Number.isFinite(event.clientX) ? event.clientX : (Number.isFinite(event.pageX) ? event.pageX : widgetDrag.startX);
      const clientY = Number.isFinite(event.clientY) ? event.clientY : (Number.isFinite(event.pageY) ? event.pageY : widgetDrag.startY);
      const dx = (clientX - widgetDrag.startX) / widgetDrag.scaleX;
      const dy = (clientY - widgetDrag.startY) / widgetDrag.scaleY;
      const movedPixels = Math.abs(clientX - widgetDrag.startX) + Math.abs(clientY - widgetDrag.startY);
      if (!widgetDrag.moved && movedPixels < 5) return;
      widgetDrag.moved = true;
      if (widgetDrag.pendingModifierSelection) {
        selectWidget(widgetDrag.widgetId);
        widgetDrag.pendingModifierSelection = false;
      }
      if (widgetDrag.mode === 'resize') {
        resizeWidgetFromEdge(found.widget, widgetDrag, dx, dy);
        if (snapBypassRequested(event)) clearSnapGuides();
        else applyWidgetResizeSnap(found.widget, widgetDrag);
      } else {
        let moveX = dx;
        let moveY = dy;
        if (event.shiftKey) {
          if (!widgetDrag.shiftLockAxis && Math.abs(dx) + Math.abs(dy) >= 2) {
            widgetDrag.shiftLockAxis = Math.abs(dx) >= Math.abs(dy) ? 'horizontal' : 'vertical';
          }
          if (widgetDrag.shiftLockAxis === 'horizontal') moveY = 0;
          if (widgetDrag.shiftLockAxis === 'vertical') moveX = 0;
        } else {
          widgetDrag.shiftLockAxis = null;
        }
        if (snapBypassRequested(event)) {
          clearSnapGuides();
        } else {
          const originalBounds = snapBounds({
            left: Math.min(...widgetDrag.items.map(item => item.x)),
            top: Math.min(...widgetDrag.items.map(item => item.y)),
            width: Math.max(...widgetDrag.items.map(item => item.x + item.w)) - Math.min(...widgetDrag.items.map(item => item.x)),
            height: Math.max(...widgetDrag.items.map(item => item.y + item.h)) - Math.min(...widgetDrag.items.map(item => item.y))
          });
          const movingBounds = snapBounds({
            left: originalBounds.left + moveX,
            top: originalBounds.top + moveY,
            width: originalBounds.width,
            height: originalBounds.height
          });
          const excludedIds = new Set(widgetDrag.items.map(item => item.id));
          const candidates = snapCandidateBounds(currentFabricCanvas(), new Set(), excludedIds);
          const result = calculateObjectSnap(movingBounds, candidates, {
            allowX: widgetDrag.shiftLockAxis !== 'vertical',
            allowY: widgetDrag.shiftLockAxis !== 'horizontal'
          });
          moveX += result.dx;
          moveY += result.dy;
          renderSnapGuides(result.guides);
        }
        widgetDrag.items.forEach(item => {
          const target = getWidget(item.id).widget;
          if (!target) return;
          target.x = item.x + moveX;
          target.y = item.y + moveY;
        });
      }
      widgetDrag.items.forEach(item => {
        const target = getWidget(item.id).widget;
        const el = document.querySelector(`.slide-widget[data-widget-id="${item.id}"]`);
        if (!target || !el) return;
        el.style.left = `${target.x}px`;
        el.style.top = `${target.y}px`;
        el.style.width = `${target.w}px`;
        el.style.height = `${target.h}px`;
        el.style.fontSize = `${target.fontSize}px`;
        el.dataset.manualSize = target.manualSize ? 'true' : 'false';
        positionWidgetContent(el, target);
        if (widgetDrag.mode === 'resize') void el.offsetHeight;
      });
    };

    const endWidgetDrag = event => {
      if (!widgetDrag) return;
      if (event) {
        event.preventDefault();
        event.stopPropagation();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      }
      if (widgetDrag.moved) {
        saveDeck();
        suppressWidgetClick = true;
        setTimeout(() => {
          suppressWidgetClick = false;
        }, 250);
      }
      document.querySelector(`.slide-widget[data-widget-id="${widgetDrag.widgetId}"]`)?.classList.remove('is-resizing');
      clearSnapGuides();
      widgetDrag = null;
    };

    slidesRoot.addEventListener('mousedown', event => {
      beginWidgetDrag(event);
    }, true);
    document.addEventListener('mousedown', event => beginWidgetDrag(event), true);

    document.addEventListener('mousemove', event => {
      updateWidgetDrag(event);
    }, true);

    document.addEventListener('mouseup', () => {
      endWidgetDrag();
    }, true);

    slidesRoot.addEventListener('pointerdown', event => beginWidgetDrag(event), true);
    document.addEventListener('pointerdown', event => beginWidgetDrag(event), true);
    document.addEventListener('pointermove', event => updateWidgetDrag(event), true);
    document.addEventListener('pointerup', event => endWidgetDrag(event), true);

    slidesRoot.addEventListener('wheel', event => {
      const pre = event.target.closest?.('.code-widget pre');
      if (!pre) return;
      event.stopPropagation();
    }, { passive: true, capture: true });

    ['dragstart', 'selectstart'].forEach(type => {
      slidesRoot.addEventListener(type, event => {
        if (event.target.closest && event.target.closest('.slide-widget')) {
          event.preventDefault();
          event.stopPropagation();
        }
      }, true);
    });

    function resizeWidgetFromEdge(widget, drag, dx, dy) {
      const minW = 40;
      const minH = 40;
      if (widget.type === 'structure') {
        const ratio = Math.max(0.1, drag.originalW / Math.max(1, drag.originalH));
        const drivesHeight = !drag.edge.includes('left') && !drag.edge.includes('right')
          && (drag.edge.includes('top') || drag.edge.includes('bottom'));
        let nextW;
        let nextH;
        if (drivesHeight) {
          nextH = drag.edge.includes('top') ? drag.originalH - dy : drag.originalH + dy;
          nextH = Math.max(minH, nextH);
          nextW = Math.max(minW, nextH * ratio);
        } else {
          nextW = drag.edge.includes('left') ? drag.originalW - dx : drag.originalW + dx;
          nextW = Math.max(minW, nextW);
          nextH = Math.max(minH, nextW / ratio);
        }

        const maxW = drag.edge.includes('left')
          ? drag.originalX + drag.originalW
          : SLIDE_W - drag.originalX;
        const maxH = drag.edge.includes('top')
          ? drag.originalY + drag.originalH
          : SLIDE_H - drag.originalY;
        const scale = Math.min(1, maxW / nextW, maxH / nextH);
        nextW *= scale;
        nextH *= scale;

        const centerX = drag.originalX + drag.originalW / 2;
        const centerY = drag.originalY + drag.originalH / 2;
        widget.w = nextW;
        widget.h = nextH;
        widget.x = drag.edge.includes('left')
          ? drag.originalX + drag.originalW - nextW
          : (drag.edge.includes('right') ? drag.originalX : centerX - nextW / 2);
        widget.y = drag.edge.includes('top')
          ? drag.originalY + drag.originalH - nextH
          : (drag.edge.includes('bottom') ? drag.originalY : centerY - nextH / 2);
        return;
      }
      if (drag.edge.includes('right')) {
        widget.w = Math.max(minW, Math.min(drag.originalW + dx, SLIDE_W - widget.x));
      }
      if (drag.edge.includes('bottom')) {
        widget.h = Math.max(minH, Math.min(drag.originalH + dy, SLIDE_H - widget.y));
      }
      if (drag.edge.includes('left')) {
        const opposite = drag.originalX + drag.originalW;
        const nextX = Math.max(0, Math.min(drag.originalX + dx, opposite - minW));
        widget.x = nextX;
        widget.w = opposite - nextX;
      }
      if (drag.edge.includes('top')) {
        const opposite = drag.originalY + drag.originalH;
        const nextY = Math.max(0, Math.min(drag.originalY + dy, opposite - minH));
        widget.y = nextY;
        widget.h = opposite - nextY;
      }
    }

    slidesRoot.addEventListener('dblclick', event => {
      const widgetEl = event.target.closest('.slide-widget') || (
        event.target.closest?.('.upper-canvas, .lower-canvas, .fabric-host')
          ? widgetClaimableThroughCanvas(event)
          : null
      );
      if (!widgetEl || isOverviewEditing()) return;
      const structureCell = event.target.closest?.('[data-structure-item-index]');
      if (structureCell && widgetEl.classList.contains('structure-widget')
        && document.body.classList.contains('asm-edit-mode')) {
        event.preventDefault();
        event.stopPropagation();
        openStructureInlineEditor(widgetEl, structureCell);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      selectWidget(widgetEl.dataset.widgetId);
      const found = getWidget(widgetEl.dataset.widgetId);
      if (found.widget?.type === 'code') openCodeEditorModal();
    });

    slidesRoot.addEventListener('click', event => {
      const widgetEl = event.target.closest('.slide-widget') || (
        event.target.closest?.('.upper-canvas, .lower-canvas, .fabric-host')
          ? widgetClaimableThroughCanvas(event)
          : null
      );
      if (!widgetEl || isOverviewEditing() || !document.body.classList.contains('asm-edit-mode')) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      if (suppressWidgetClick) {
        suppressWidgetClick = false;
        return;
      }
      const structureCell = event.target.closest?.('[data-structure-item-index]');
      if (structureCell && widgetEl.classList.contains('structure-widget')) {
        closeStructureInlineEditor(true);
        selectStructureCell(widgetEl, structureCell);
        if (structureCellClickTimer) clearTimeout(structureCellClickTimer);
        const widgetId = widgetEl.dataset.widgetId;
        structureCellClickTimer = setTimeout(() => {
          structureCellClickTimer = null;
          if (activeStructureInlineEditor || selectedStructureCell?.widgetId !== widgetId) return;
          selectWidget(widgetId);
        }, 220);
        return;
      }
      clearStructureCellSelection();
      if (event.shiftKey || event.ctrlKey || event.metaKey) {
        toggleWidgetSelection(widgetEl.dataset.widgetId);
      } else {
        selectWidget(widgetEl.dataset.widgetId);
      }
    }, true);

    slidesRoot.addEventListener('dragover', event => {
      if (!document.body.classList.contains('asm-edit-mode')) return;
      if (!event.dataTransfer.types.includes('application/x-asm-tool')) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    });

    slidesRoot.addEventListener('drop', event => {
      if (!document.body.classList.contains('asm-edit-mode')) return;
      const tool = event.dataTransfer.getData('application/x-asm-tool');
      if (!tool) return;
      event.preventDefault();
      addObject(tool, slidePointFromEvent(event));
    });

    slidesRoot.addEventListener('click', event => {
      if (!document.body.classList.contains('asm-edit-mode')) return;
      if (!pendingTool) return;
      const targetCanvas = event.target.closest('.upper-canvas, .lower-canvas, .fabric-host');
      if (!targetCanvas) return;
      exitWidgetEditorIfNeeded();
      addObject(pendingTool, slidePointFromEvent(event));
    });

    document.addEventListener('paste', event => {
      if (!document.body.classList.contains('asm-edit-mode')) return;
      const items = Array.from(event.clipboardData && event.clipboardData.items || []);
      const imageItem = items.find(item => item.type && item.type.startsWith('image/'));
      if (!imageItem) return;
      event.preventDefault();
      const file = imageItem.getAsFile();
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => insertImageFromDataUrl(reader.result, SLIDE_W / 2 - 160, SLIDE_H / 2 - 100);
      reader.readAsDataURL(file);
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && structureContextMenu && !structureContextMenu.hidden) {
        event.preventDefault();
        event.stopPropagation();
        hideStructureContextMenu();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && codeEditorModal && !codeEditorModal.hidden) {
        event.preventDefault();
        saveCodeEditorModal();
        return;
      }
      if (event.key === 'Escape' && codeEditorModal && !codeEditorModal.hidden) {
        event.preventDefault();
        closeCodeEditorModal();
        return;
      }
      if (event.key === 'Escape' && algorithmEditorModal && !algorithmEditorModal.hidden) {
        event.preventDefault();
        saveAlgorithmEditor();
        return;
      }
      if (event.key === 'Escape' && document.body.classList.contains('asm-edit-mode')) {
        event.preventDefault();
        event.stopPropagation();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();
        if (customOverviewOpen) closeCustomOverview();
        else openCustomOverview();
        return;
      }

      if (customOverviewOpen && (event.ctrlKey || event.metaKey)) {
        const key = event.key.toLowerCase();
        if (['a', 'c', 'x', 'v'].includes(key)) {
          event.preventDefault();
          event.stopPropagation();
          if (event.stopImmediatePropagation) event.stopImmediatePropagation();
          if (key === 'a') selectAllCustomOverviewSlides();
          if (key === 'c') copyCustomOverviewSlides();
          if (key === 'x') cutCustomOverviewSlides();
          if (key === 'v') pasteCustomOverviewSlides();
          return;
        }
      }

      if (isEditableDomTarget(event)) return;

      if (document.body.classList.contains('asm-edit-mode') && !isOverviewEditing() && (event.ctrlKey || event.metaKey) && !isEditableDomTarget(event)) {
        const canvas = currentFabricCanvas();
        if (!canvas || !isTypingInFabric(canvas)) {
          const key = event.key.toLowerCase();
          const hasSelection = activeFabricObjects().length > 0 || selectedWidgetIdsInCurrentSlide().length > 0;
          const hasClipboard = objectClipboard.fabric.length > 0 || objectClipboard.widgets.length > 0;
          if (key === 'a') {
            event.preventDefault();
            selectAllCurrentObjects();
            return;
          }
          if (key === 'c' && hasSelection) {
            event.preventDefault();
            copyCurrentObjects();
            return;
          }
          if (key === 'x' && hasSelection) {
            event.preventDefault();
            cutCurrentObjects();
            return;
          }
          if (key === 'v' && hasClipboard) {
            event.preventDefault();
            pasteCurrentObjects();
            return;
          }
        }
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
        return;
      }

      if (!document.body.classList.contains('asm-edit-mode')) return;
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;

      if (isOverviewEditing()) {
        event.preventDefault();
        deleteOverviewSelectedSlide();
        return;
      }

      if (deleteCurrentObjectSelection()) event.preventDefault();
    });

    document.addEventListener('keyup', event => {
      if (event.target.closest && event.target.closest('#objectToolbar, #ttsObjectEditorPopover')) return;
      const canvas = currentFabricCanvas();
      if (canvas) updateObjectToolbar(canvas.getActiveObject(), canvas);
    });

    document.addEventListener('mouseup', event => {
      if (event.target.closest && event.target.closest('#objectToolbar, #ttsObjectEditorPopover')) return;
      const canvas = currentFabricCanvas();
      if (canvas) updateObjectToolbar(canvas.getActiveObject(), canvas);
    });
  }

  function isTypingInFabric(canvas) {
    const active = canvas.getActiveObject();
    return !!(active && active.isEditing);
  }

  function getTextTarget() {
    const canvas = currentFabricCanvas();
    const active = canvas && canvas.getActiveObject();
    if (active && isTextObject(active)) {
      const start = Number(active.selectionStart) || 0;
      const end = Number(active.selectionEnd) || start;
      if (start !== end) {
        textSelection = { object: active, start, end };
        return { canvas, object: active, start, end };
      }
      if (active.isEditing) {
        const line = lineRangeAtCursor(active, start);
        textSelection = { object: active, start: line.start, end: line.end, objectStyle: line.start === line.end };
        return { canvas, object: active, start: line.start, end: line.end, objectStyle: line.start === line.end };
      }
      textSelection = null;
      return {
        canvas,
        object: active,
        start: 0,
        end: typeof active.text === 'string' ? active.text.length : 0,
        objectStyle: true
      };
    }
    if (canvas && textSelection && textSelection.object && canvas.getObjects().includes(textSelection.object)) {
      return { canvas, object: textSelection.object, start: textSelection.start, end: textSelection.end };
    }
    return {};
  }

  function applyShapeStyle(style, { history = true } = {}) {
    const canvas = currentFabricCanvas();
    if (!canvas) return;
    const active = canvas.getActiveObject();
    if (!active || isTextObject(active) || isImageObject(active)) return;
    const patch = { ...style };
    if ('strokeWidth' in patch) {
      applyInwardShapeStrokeWidth(active, patch.strokeWidth);
      delete patch.strokeWidth;
    }
    if ('cornerRadius' in patch) {
      if (active.type !== 'rect') return;
      patch.cornerRadius = Math.max(0, Number(patch.cornerRadius) || 0);
      patch.rx = patch.cornerRadius;
      patch.ry = patch.cornerRadius;
    }
    if ('arrowHeadSize' in patch) {
      if (shapeType(active) !== 'arrow') return;
      patch.arrowHeadSize = Math.max(6, Math.min(80, Number(patch.arrowHeadSize) || 24));
    }
    if ('arrowHeadStyle' in patch) {
      if (shapeType(active) !== 'arrow') return;
      patch.arrowHeadStyle = ['open', 'triangle', 'diamond', 'circle'].includes(patch.arrowHeadStyle)
        ? patch.arrowHeadStyle
        : 'open';
    }
    active.set(patch);
    active.setCoords();
    canvas.requestRenderAll();
    syncCurrentSlideCanvas({ history });
    updateObjectToolbar(active, canvas);
  }

  function replaceSelectedShape(type) {
    const canvas = currentFabricCanvas();
    const active = canvas?.getActiveObject();
    if (!canvas || !isShapeObject(active) || !['rect', 'circle', 'triangle', 'line', 'arrow'].includes(type) || shapeType(active) === type) return;
    finishFabricAutoAnimation();
    const index = canvas.getObjects().indexOf(active);
    const center = active.getCenterPoint();
    const width = Math.max(4, (Number(active.width) || (Number(active.radius) || 2) * 2) * Math.abs(Number(active.scaleX) || 1));
    const height = Math.max(4, (Number(active.height) || (Number(active.radius) || 2) * 2) * Math.abs(Number(active.scaleY) || 1));
    const replacement = createShape(type, 0, 0);
    const animation = normalizeAnimationSettings(active);
    replacement.set({
      fill: active.fill,
      stroke: active.stroke,
      strokeWidth: Number(active.strokeWidth) || 0,
      strokeUniform: true,
      angle: Number(active.angle) || 0,
      opacity: Number.isFinite(Number(active.opacity)) ? Number(active.opacity) : 1,
      ...animation,
      fragmentProxyId: active.fragmentProxyId || randomId()
    });
    if (type === 'circle') {
      replacement.set({ radius: Math.max(2, Math.min(width, height) / 2), scaleX: 1, scaleY: 1 });
    } else if (type === 'rect' || type === 'triangle') {
      replacement.set({ width, height, scaleX: 1, scaleY: 1 });
    } else {
      replacement.set({ x1: -width / 2, y1: 0, x2: width / 2, y2: 0, scaleX: 1, scaleY: 1 });
    }
    if (type === 'rect') {
      const radius = Math.max(0, Number(active.cornerRadius) || Number(active.rx) || 0);
      replacement.set({ cornerRadius: radius, rx: radius, ry: radius });
    }
    if (type === 'arrow') {
      replacement.set({
        arrowHeadSize: Math.max(6, Math.min(80, Number(active.arrowHeadSize) || 24)),
        arrowHeadStyle: ['open', 'triangle', 'diamond', 'circle'].includes(active.arrowHeadStyle) ? active.arrowHeadStyle : 'open'
      });
    }
    configureObject(replacement);
    replacement.setPositionByOrigin(center, 'center', 'center');
    replacement.setCoords();
    suppressCanvasSave = true;
    try {
      canvas.remove(active);
      canvas.insertAt(replacement, index, false);
      canvas.setActiveObject(replacement);
    } finally {
      suppressCanvasSave = false;
    }
    canvas.requestRenderAll();
    syncCurrentSlideCanvas();
    updateObjectToolbar(replacement, canvas);
  }

  function applyInwardShapeStrokeWidth(obj, value) {
    const nextStrokeWidth = Math.max(0, Number(value) || 0);
    const previousStrokeWidth = Math.max(0, Number(obj.strokeWidth) || 0);
    const delta = nextStrokeWidth - previousStrokeWidth;
    if (Math.abs(delta) < 0.001) return;
    if (obj.type === 'line' || obj.type === 'path') {
      obj.set({ strokeWidth: nextStrokeWidth, strokeUniform: true });
      return;
    }
    const center = obj.getCenterPoint();
    const scaleX = Math.max(0.001, Math.abs(Number(obj.scaleX) || 1));
    const scaleY = Math.max(0.001, Math.abs(Number(obj.scaleY) || 1));
    if (obj.type === 'circle') {
      const diameter = Math.max(4, (Number(obj.radius) || 2) * 2);
      obj.set({
        scaleX: Math.max(0.01, (diameter * scaleX - delta) / diameter),
        scaleY: Math.max(0.01, (diameter * scaleY - delta) / diameter)
      });
    } else {
      obj.set({
        width: Math.max(4, (Number(obj.width) || 4) - delta / scaleX),
        height: Math.max(4, (Number(obj.height) || 4) - delta / scaleY)
      });
    }
    obj.set({ strokeWidth: nextStrokeWidth, strokeUniform: true });
    obj.setPositionByOrigin(center, 'center', 'center');
  }

  function updateObjectToolbar(obj, canvas) {
    if (!obj || !document.body.classList.contains('asm-edit-mode')) {
      hideObjectToolbar();
      return;
    }
    showFabricObjectEditor(obj);
    if (isImageObject(obj)) {
      hideObjectToolbar({ keepAnimation: true });
      return;
    }
    const activeTtsKey = isTextObject(obj) && obj.ttsObjectId ? `fabric:${obj.ttsObjectId}` : null;
    if (ttsObjectEditorPopover && !ttsObjectEditorPopover.hidden && activeTtsKey !== expandedTtsObjectKey) {
      closeTtsObjectEditor();
    }
    if (isTextObject(obj)) {
      if (obj.isEditing && obj.selectionStart !== obj.selectionEnd) {
        textSelection = { object: obj, start: obj.selectionStart, end: obj.selectionEnd };
      } else if (obj.isEditing) {
        const line = lineRangeAtCursor(obj, obj.selectionStart);
        textSelection = { object: obj, start: line.start, end: line.end, objectStyle: line.start === line.end };
      } else {
        textSelection = null;
      }
    }

    objectToolbar.classList.toggle('is-shape', !isTextObject(obj));
    if (ttsObjectBtn) {
      ttsObjectBtn.hidden = !isTextObject(obj) || canvas?.getActiveObject()?.type === 'activeSelection';
    }
    if (isTextObject(obj)) {
      const style = getTextSelectionStyle(obj);
      fontFamilySelect.value = style.fontFamily || obj.fontFamily || DEFAULT_FONT_FAMILY;
      fontSizeInput.value = Math.round(style.fontSize || obj.fontSize || 34);
      boldBtn.classList.toggle('is-active', (style.fontWeight || obj.fontWeight) === 'bold');
      italicBtn.classList.toggle('is-active', (style.fontStyle || obj.fontStyle) === 'italic');
      underlineBtn.classList.toggle('is-active', !!(style.underline ?? obj.underline));
      strikeBtn.classList.toggle('is-active', !!(style.linethrough ?? obj.linethrough));
      updateAlignButton(obj.textAlign || 'left');
      updateListButton(obj);
      updateTextColorButton(obj);
    } else {
      const strokeWidth = Number.isFinite(Number(obj.strokeWidth)) ? Number(obj.strokeWidth) : 0;
      const cornerRadius = Number.isFinite(Number(obj.cornerRadius)) ? Number(obj.cornerRadius) : (Number(obj.rx) || 0);
      const strokeColor = normalizeColor(obj.stroke || '#875bc7');
      const fillColor = normalizeColor(obj.fill || '#eee7fb');
      shapeStrokeBtn.style.setProperty('--shape-stroke-color', strokeColor);
      shapeStrokeBtn.style.setProperty('--shape-stroke-width', `${Math.max(1, Math.min(9, strokeWidth))}px`);
      shapeStrokeBtn.style.setProperty('--shape-corner-radius', `${Math.min(12, cornerRadius)}px`);
      shapeColorBtn.style.setProperty('--shape-fill-color', fillColor);
      shapeStrokeWidthInput.value = String(strokeWidth);
      shapeStrokeWidthValue.value = String(strokeWidth);
      shapeCornerRadiusControls.hidden = obj.type !== 'rect';
      shapeCornerRadiusInput.value = String(cornerRadius);
      shapeCornerRadiusValue.value = String(cornerRadius);
      const arrow = shapeType(obj) === 'arrow';
      const arrowHeadSize = Math.max(6, Math.min(80, Number(obj.arrowHeadSize) || 24));
      shapeArrowControls.hidden = !arrow;
      shapeArrowSizeInput.value = String(arrowHeadSize);
      shapeArrowSizeValue.value = String(arrowHeadSize);
      shapeArrowStyleSelect.value = ['open', 'triangle', 'diamond', 'circle'].includes(obj.arrowHeadStyle) ? obj.arrowHeadStyle : 'open';
    }
    const rect = fabricSlideRect(canvas);
    const bounds = obj.getBoundingRect(true, true);
    const scaleX = rect.width / SLIDE_W;
    const scaleY = rect.height / SLIDE_H;
    objectToolbar.hidden = false;
    const toolbarHeight = objectToolbar.offsetHeight || 44;
    const toolbarWidth = objectToolbar.offsetWidth || 44;
    const rotationControlClearance = 56 * scaleY;
    const desiredLeft = rect.left + (bounds.left + bounds.width / 2) * scaleX;
    const halfToolbarWidth = toolbarWidth / 2;
    objectToolbar.style.left = `${Math.min(
      window.innerWidth - halfToolbarWidth - 8,
      Math.max(halfToolbarWidth + 8, desiredLeft)
    )}px`;
    const toolbarTop = Math.max(8, rect.top + bounds.top * scaleY - toolbarHeight - rotationControlClearance);
    objectToolbar.dataset.baseTop = String(toolbarTop);
    objectToolbar.style.top = `${toolbarTop}px`;
    objectToolbar.style.transform = 'translateX(-50%)';
    positionTtsObjectEditor();
  }

  function commitPendingColorHistory() {
    if (!pendingColorHistory) return;
    clearTimeout(pendingHistoryTimer);
    pendingHistoryTimer = null;
    pendingColorHistory = false;
    pushHistorySnapshot();
  }

  function scheduleHistorySnapshot(delay = 360) {
    pendingColorHistory = true;
    clearTimeout(pendingHistoryTimer);
    pendingHistoryTimer = setTimeout(commitPendingColorHistory, delay);
  }

  function hideObjectToolbar({ keepAnimation = false } = {}) {
    commitPendingColorHistory();
    objectToolbar.hidden = true;
    closeTtsObjectEditor();
    iroPopup.hidden = true;
    if (!keepAnimation && !selectedWidgetId) hideAnimationEditor();
  }

  function exitWidgetEditorIfNeeded() {
    if (!selectedWidgetIdsInCurrentSlide().length) return;
    clearWidgetSelection();
  }

  function pointHitsFabricObject(event) {
    return !!fabricObjectAtPoint(event);
  }

  function fabricObjectAtPoint(event) {
    const canvas = currentFabricCanvas();
    if (!canvas || !canvas.upperCanvasEl) return null;
    if (typeof canvas.findTarget === 'function') {
      const target = canvas.findTarget(event, false);
      if (target && target.visible !== false) return target;
    }
    return fabricObjectBoundsAtPoint(event, canvas);
  }

  function fabricObjectBoundsAtPoint(event, canvas = currentFabricCanvas()) {
    if (!canvas) return null;
    const rect = fabricSlideRect(canvas);
    if (!rect) return null;
    const x = ((event.clientX - rect.left) / rect.width) * SLIDE_W;
    const y = ((event.clientY - rect.top) / rect.height) * SLIDE_H;
    return canvas.getObjects().slice().reverse().find(obj => {
      if (!obj.visible) return false;
      const bounds = obj.getBoundingRect(true, true);
      return x >= bounds.left && x <= bounds.left + bounds.width && y >= bounds.top && y <= bounds.top + bounds.height;
    }) || null;
  }

  function widgetZIndex(el) {
    return Number(getComputedStyle(el).zIndex) || 0;
  }

  function fabricSlideRect(canvas = currentFabricCanvas()) {
    const host = canvas?.upperCanvasEl?.closest?.('.fabric-host');
    return (host || canvas?.upperCanvasEl)?.getBoundingClientRect();
  }

  function fabricZIndex(obj) {
    return Number.isFinite(Number(obj?.layerIndex)) ? Number(obj.layerIndex) : FABRIC_LAYER_INDEX;
  }

  function widgetElementAtPoint(event) {
    const slide = getSlide();
    const layer = slide && document.querySelector(`.widget-layer[data-slide-id="${slide.id}"]`);
    if (!layer) return null;
    return Array.from(layer.querySelectorAll('.slide-widget'))
      .filter(el => {
        const rect = el.getBoundingClientRect();
        return event.clientX >= rect.left
          && event.clientX <= rect.right
          && event.clientY >= rect.top
          && event.clientY <= rect.bottom;
      })
      .sort((a, b) => widgetZIndex(b) - widgetZIndex(a))[0] || null;
  }

  function topWidgetAboveFabricAtPoint(event) {
    const widgetHit = widgetElementAtPoint(event);
    if (!widgetHit) return null;
    const fabricHit = fabricObjectAtPoint(event);
    return !fabricHit || widgetZIndex(widgetHit) > fabricZIndex(fabricHit) ? widgetHit : null;
  }

  function widgetClaimableThroughCanvas(event) {
    if (!document.body.classList.contains('asm-edit-mode') || isOverviewEditing()) return null;
    if (!event.target.closest?.('.upper-canvas, .lower-canvas, .fabric-host')) return null;
    const widgetHit = widgetElementAtPoint(event);
    if (!widgetHit) return null;
    const fabricHit = fabricObjectBoundsAtPoint(event);
    return !fabricHit || widgetZIndex(widgetHit) >= fabricZIndex(fabricHit) ? widgetHit : null;
  }

  function isTextObject(obj) {
    return !!(obj && obj.type && obj.type.toLowerCase().includes('text'));
  }

  function isImageObject(obj) {
    return !!(obj && obj.type && obj.type.toLowerCase().includes('image'));
  }

  function isShapeObject(obj) {
    return !!(obj && (['rect', 'circle', 'triangle', 'line'].includes(obj.type) || obj.asmShapeType === 'arrow'));
  }

  function shapeType(obj) {
    return obj?.asmShapeType || obj?.type || '';
  }

  function getTextSelectionStyle(obj) {
    const target = getTextTarget();
    if (target.object === obj) return getTextStyleForRange(obj, target.start, target.end);
    const start = Number(obj?.selectionStart) || 0;
    const end = Number(obj?.selectionEnd) || start;
    return getTextStyleForRange(obj, start, end);
  }

  function applyTextStyle(style, { history = true } = {}) {
    const target = getTextTarget();
    if (!target.canvas || !target.object) return;
    if (target.objectStyle || target.start === target.end) {
      target.object.set(style);
    } else if (target.object.setSelectionStyles) {
      target.object.setSelectionStyles(style, target.start, target.end);
    }
    target.object.dirty = true;
    target.object.setCoords();
    target.canvas.requestRenderAll();
    syncCurrentSlideCanvas({ history });
    updateObjectToolbar(target.object, target.canvas);
  }

  function toggleTextStyle(key, onValue, offValue) {
    const target = getTextTarget();
    if (!target.object) return;
    const style = getTextStyleForRange(target.object, target.start, target.end);
    const current = style[key] ?? target.object[key];
    applyTextStyle({ [key]: current === onValue ? offValue : onValue });
  }

  function activeTextObject() {
    const canvas = currentFabricCanvas();
    const active = canvas && canvas.getActiveObject();
    if (active && isTextObject(active)) return { canvas, object: active };
    if (canvas && textSelection && textSelection.object && canvas.getObjects().includes(textSelection.object)) {
      return { canvas, object: textSelection.object };
    }
    return {};
  }

  function applyTextObjectStyle(style, { history = true } = {}) {
    const target = activeTextObject();
    if (!target.canvas || !target.object) return;
    target.object.set(style);
    target.object.setCoords();
    target.canvas.requestRenderAll();
    syncCurrentSlideCanvas({ history });
    updateObjectToolbar(target.object, target.canvas);
  }

  function cycleTextAlign() {
    const target = activeTextObject();
    if (!target.object) return;
    const order = ['left', 'center', 'right'];
    const current = target.object.textAlign || 'left';
    const next = order[(order.indexOf(current) + 1) % order.length] || 'left';
    applyTextObjectStyle({ textAlign: next });
  }

  function updateAlignButton(align = 'left') {
    const icon = alignCycleBtn?.querySelector('.align-icon');
    if (!icon) return;
    icon.classList.remove('align-left-icon', 'align-center-icon', 'align-right-icon');
    icon.classList.add(`align-${align}-icon`);
    alignCycleBtn.dataset.align = align;
    alignCycleBtn.classList.toggle('is-active', align !== 'left');
  }

  function lineRanges(text) {
    let offset = 0;
    return text.split('\n').map(line => {
      const range = { text: line, start: offset, end: offset + line.length };
      offset += line.length + 1;
      return range;
    });
  }

  function lineRangeAtCursor(obj, cursor = 0) {
    const text = typeof obj?.text === 'string' ? obj.text : '';
    const position = Math.max(0, Math.min(text.length, Number(cursor) || 0));
    return lineRanges(text).find(line => position >= line.start && position <= line.end) || { text: '', start: position, end: position };
  }

  function getTextStyleForRange(obj, start = 0, end = start) {
    if (!obj || !obj.getSelectionStyles) return {};
    const textLength = typeof obj.text === 'string' ? obj.text.length : 0;
    if (end > start) return obj.getSelectionStyles(start, end)[0] || {};
    if (!textLength) return {};
    const probe = Math.max(0, Math.min(textLength - 1, start));
    return obj.getSelectionStyles(probe, probe + 1)[0] || {};
  }

  function selectedLineIndexes(obj, start = obj?.selectionStart, end = obj?.selectionEnd) {
    if (!obj || typeof obj.text !== 'string') return [];
    return lineRanges(obj.text)
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => line.end > start && line.start < end && line.text.trim().length)
      .map(({ index }) => index);
  }

  function listMarkerPattern(kind = 'any') {
    if (kind === 'bullet') return /^\u2022(?:\s|\u00a0)+/;
    if (kind === 'number') return /^\d+\.(?:\s|\u00a0)+/;
    return /^(?:\u2022|\d+\.)(?:\s|\u00a0)+/;
  }

  function textListState(obj) {
    if (!obj || typeof obj.text !== 'string') return 'none';
    const target = getTextTarget();
    const indexes = target.object === obj
      ? selectedLineIndexes(obj, target.start, target.end)
      : selectedLineIndexes(obj);
    if (!indexes.length) return 'none';
    const allLines = obj.text.split('\n');
    const lines = indexes.map(index => allLines[index]).filter(line => line.trim().length);
    if (!lines.length) return 'none';
    if (lines.every(line => listMarkerPattern('bullet').test(line))) return 'bullet';
    if (lines.every(line => listMarkerPattern('number').test(line))) return 'number';
    return 'none';
  }

  function updateListButton(obj) {
    const state = textListState(obj);
    listStyleBtn.dataset.listState = state;
    listStyleBtn.title = state === 'bullet'
      ? '\u76ee\u524d\u662f\u9805\u76ee\u7b26\u865f\uff0c\u9ede\u64ca\u5207\u63db\u6210\u7de8\u865f'
      : (state === 'number' ? '\u76ee\u524d\u662f\u7de8\u865f\uff0c\u9ede\u64ca\u53d6\u6d88\u6e05\u55ae' : '\u5207\u63db\u9805\u76ee\u7b26\u865f / \u7de8\u865f');
    listStyleBtn.classList.toggle('is-active', state !== 'none');
  }

  function updateTextColorButton(obj) {
    if (!textColorBtn || !obj) return;
    const colors = textFillColorsForTarget(obj);
    const icon = textColorBtn.querySelector('.text-color-icon');
    textColorBtn.classList.toggle('is-mixed-color', colors.length > 1);
    icon?.style.setProperty('--text-color-current', colors.length === 1 ? colors[0] : '#ef3829');
  }

  function textFillColorsForTarget(obj) {
    if (!obj || !obj.getSelectionStyles) return [normalizeColor(obj?.fill || '#1f282d')];
    const start = Number(obj.selectionStart) || 0;
    const end = Number(obj.selectionEnd) || start;
    if (start !== end) {
      const colors = new Set();
      const styles = obj.getSelectionStyles(start, end) || [];
      styles.forEach(style => colors.add(normalizeColor(style.fill || obj.fill || '#1f282d')));
      if (!colors.size) colors.add(normalizeColor(obj.fill || '#1f282d'));
      return Array.from(colors);
    }
    return [textFillColorAtCursor(obj, start)];
  }

  function textFillColorAtCursor(obj, cursor = 0) {
    const textLength = typeof obj.text === 'string' ? obj.text.length : 0;
    if (!textLength) return normalizeColor(obj.fill || '#1f282d');
    const probe = Math.max(0, Math.min(textLength - 1, cursor - 1));
    const style = obj.getSelectionStyles?.(probe, probe + 1)?.[0] || {};
    return normalizeColor(style.fill || obj.fill || '#1f282d');
  }

  function cycleTextList() {
    const target = getTextTarget();
    if (!target.canvas || !target.object || typeof target.object.text !== 'string' || target.start === target.end) return;
    const state = textListState(target.object);
    const kind = state === 'none' ? 'bullet' : (state === 'bullet' ? 'number' : 'none');
    const selectedIndexes = new Set(selectedLineIndexes(target.object, target.start, target.end));
    const lines = target.object.text.split('\n');
    const nextLines = lines.map((line, index) => {
      if (!selectedIndexes.has(index) || !line.trim()) return line;
      const clean = line.replace(listMarkerPattern(), '');
      if (kind === 'none') return clean;
      const selectedNumber = Array.from(selectedIndexes).filter(item => item <= index).length;
      return kind === 'number' ? `${selectedNumber}.\u00a0${clean}` : `\u2022\u00a0${clean}`;
    });
    target.object.text = nextLines.join('\n');
    if (target.object.initDimensions) target.object.initDimensions();
    target.object.dirty = true;
    target.object.selectionStart = target.start;
    target.object.selectionEnd = Math.min(target.object.text.length, target.end + (target.object.text.length - lines.join('\n').length));
    target.object.setCoords();
    target.canvas.requestRenderAll();
    syncCurrentSlideCanvas();
    updateObjectToolbar(target.object, target.canvas);
  }

  function openIro(target) {
    const structureBinding = structureColorBindings.find(binding => binding.target === target);
    const shouldClose = !iroPopup.hidden && activeColorTarget === target;
    activeColorTarget = target;
    iroPopup.hidden = shouldClose;
    if (iroPopup.hidden) {
      commitPendingColorHistory();
      return;
    }
    shapeStyleControls.hidden = activeColorTarget !== 'shape-stroke';
    if (!iroPicker) {
      iroPicker = new window.iro.ColorPicker('#iroPicker', {
        width: 150,
        color: 'rgba(31, 40, 45, 1)',
        borderWidth: 1,
        borderColor: '#e0e0e0',
        layout: [
          { component: window.iro.ui.Box },
          { component: window.iro.ui.Slider, options: { sliderType: 'hue', sliderHeight: 20, handleRadius: 8 } },
          { component: window.iro.ui.Slider, options: { sliderType: 'alpha', sliderHeight: 20, handleRadius: 8 } }
        ]
      });
      iroPicker.on('color:change', color => {
        if (suppressIroChange) return;
        const binding = structureColorBindings.find(item => item.target === activeColorTarget);
        const value = color.rgbaString;
        if (binding) {
          const structureColor = color.alpha < 1 ? value : color.hexString;
          setStructureColorButton(binding.button, structureColor);
          if (binding.style) syncStructureStyleIcon(binding.style, structureColor);
          updateSelectedStructure({ [binding.field]: structureColor }, { history: false });
          scheduleHistorySnapshot();
          return;
        }
        if (activeColorTarget === 'shape-fill') {
          applyShapeStyle({ fill: value }, { history: false });
        } else if (activeColorTarget === 'shape-stroke') {
          applyShapeStyle({ stroke: value }, { history: false });
        } else if (activeColorTarget === 'text') {
          applyTextStyle({ fill: value }, { history: false });
        } else {
          applyTextStyle({ textBackgroundColor: value }, { history: false });
        }
        scheduleHistorySnapshot();
      });
      iroPicker.on('input:end', () => {
        commitPendingColorHistory();
        requestAnimationFrame(() => {
          if (selectedWidgetId && structureColorBindings.some(item => item.target === activeColorTarget)) {
            iroPopup.hidden = false;
          }
        });
      });
    }
    const canvas = currentFabricCanvas();
    const active = canvas && canvas.getActiveObject();
    const style = active && isTextObject(active) ? getTextSelectionStyle(active) : {};
    const current = structureBinding
      ? (structureBinding.button?.dataset.color || '#333333')
      : activeColorTarget === 'shape-fill'
      ? (active?.fill || 'rgba(238, 231, 251, 1)')
      : activeColorTarget === 'shape-stroke'
        ? (active?.stroke || 'rgba(135, 91, 199, 1)')
      : activeColorTarget === 'text'
        ? (style.fill || active?.fill || 'rgba(31, 40, 45, 1)')
        : (style.textBackgroundColor || 'rgba(255, 255, 255, 1)');
    suppressIroChange = true;
    try {
      iroPicker.color.set(normalizeColor(current));
    } finally {
      suppressIroChange = false;
    }
    const anchor = structureBinding?.button
      || (activeColorTarget === 'shape-fill'
        ? shapeColorBtn
        : activeColorTarget === 'shape-stroke'
          ? shapeStrokeBtn
          : activeColorTarget === 'text'
            ? textColorBtn
            : bgColorBtn);
    if (anchor) {
      const rect = anchor.getBoundingClientRect();
      const popupWidth = 174;
      iroPopup.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - popupWidth - 8))}px`;
      iroPopup.style.top = `${Math.min(rect.bottom + 8, window.innerHeight - 300)}px`;
    }
  }

  function normalizeColor(value) {
    if (typeof value !== 'string') return '#1f282d';
    if (value.startsWith('rgba') || value.startsWith('rgb')) return value;
    if (!value.startsWith('#')) return '#1f282d';
    if (value.length === 4) {
      return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
    }
    return value.slice(0, 7);
  }

  function getSlideById(slideId) {
    const pos = slidePositions.get(slideId);
    return pos && deck.groups[pos.h]?.slides[pos.v];
  }

  function sendAlgorithmAnimationToFrame(frame, slide, preparedAnimation = null) {
    if (!frame?.contentWindow || !slide || slide.kind !== 'algorithm-animation') return;
    frame.contentWindow.postMessage({
      type: 'asm-load-animation',
      animation: preparedAnimation || normalizeAlgorithmAnimation(slide.animation)
    }, window.location.origin);
  }

  function refreshAlgorithmSlideInPlace(slide) {
    if (!slide || slide.kind !== 'algorithm-animation') return;
    const section = document.querySelector(`section.asm-slide[data-slide-id="${slide.id}"]`);
    const frame = section?.querySelector('.algorithm-slide-frame');
    const placeholder = section?.querySelector('.algorithm-slide-placeholder');
    if (!frame || !placeholder) return;

    const animation = slide.animation || normalizeAlgorithmAnimation();
    const hasAnimation = !!animation.scriptContent || !!animation.traceDocument?.frames?.length;
    frame.hidden = !hasAnimation;
    placeholder.hidden = hasAnimation;

    if (!hasAnimation) {
      if (frame.getAttribute('src') !== 'about:blank') frame.src = 'about:blank';
      return;
    }

    const runtimeUrl = 'algorithm.html?asmEmbed=runtime&v=trace-runtime-32';
    if (!frame.getAttribute('src')?.includes('asmEmbed=runtime')) {
      frame.src = runtimeUrl;
      return;
    }

    // Preserve the current iframe and canvas. Replacing only its payload avoids
    // rebuilding the whole deck and prevents old/new animation layers from
    // briefly being visible at the same time.
    sendAlgorithmAnimationToFrame(frame, slide, animation);
    if (reveal) reveal.layout();
  }

  function handleAlgorithmEmbedMessage(event) {
    if (event.origin !== window.location.origin || !event.data) return;
    if (event.data.type === 'asm-animation-applied') {
      if (event.source === algorithmEditorFrame?.contentWindow && event.data.mode === 'editor') {
        algorithmEditorModal?.classList.remove('is-loading');
        if (algorithmEditorStatus) algorithmEditorStatus.textContent = '動畫已載入。';
      }
      return;
    }
    if (event.data.type === 'asm-embed-ready') {
      if (event.source === algorithmEditorFrame?.contentWindow) {
        sendAlgorithmAnimationToFrame(algorithmEditorFrame, getSlideById(editingAlgorithmSlideId));
        return;
      }
      const runtimeFrame = Array.from(document.querySelectorAll('.algorithm-slide-frame'))
        .find(frame => frame.contentWindow === event.source);
      if (runtimeFrame) sendAlgorithmAnimationToFrame(runtimeFrame, getSlideById(runtimeFrame.dataset.slideId));
      return;
    }
    if (!['asm-animation-compiled', 'asm-save-animation'].includes(event.data.type)
      || event.source !== algorithmEditorFrame?.contentWindow) return;
    const slide = getSlideById(editingAlgorithmSlideId);
    if (!slide || slide.kind !== 'algorithm-animation') return;
    if (event.data.type === 'asm-animation-compiled') {
      if (algorithmEditorStatus) algorithmEditorStatus.textContent = 'Algorithm editor status updated.';
      return;
    }
    slide.animation = normalizeAlgorithmAnimation(event.data.animation);
    saveDeck();
    refreshAlgorithmSlideInPlace(slide);
    closeAlgorithmEditor();
    flashHint('Done');
  }

  function openAlgorithmEditor(slideId) {
    const slide = getSlideById(slideId);
    if (!algorithmEditorModal || !algorithmEditorFrame || !slide || slide.kind !== 'algorithm-animation') return;
    editingAlgorithmSlideId = slideId;
    if (algorithmEditorStatus) algorithmEditorStatus.textContent = '正在載入動畫…';
    algorithmEditorModal.classList.add('is-loading');
    algorithmEditorModal.hidden = false;
    algorithmEditorFrame.src = 'algorithm.html?asmEmbed=editor&v=trace-runtime-32';
  }

  function closeAlgorithmEditor() {
    if (!algorithmEditorModal || !algorithmEditorFrame) return;
    algorithmEditorModal.hidden = true;
    algorithmEditorModal.classList.remove('is-loading');
    algorithmEditorFrame.src = 'about:blank';
    editingAlgorithmSlideId = null;
  }

  function saveAlgorithmEditor() {
    if (!algorithmEditorFrame?.contentWindow || !editingAlgorithmSlideId) return;
    if (algorithmEditorStatus) algorithmEditorStatus.textContent = 'Algorithm editor status updated.';
    algorithmEditorFrame.contentWindow.postMessage({
      type: 'asm-request-save-animation'
    }, window.location.origin);
  }

  function insertSlideNearCurrent(slide) {
    const group = getGroup();
    if (!group) return;
    if (group.slides.length > 1 || currentV > 0) {
      group.slides.splice(currentV + 1, 0, slide);
      currentV += 1;
    } else {
      deck.groups.splice(currentH + 1, 0, {
        id: randomId(),
        slides: [slide]
      });
      currentH += 1;
      currentV = 0;
    }
    markSlidesEntering([slide.id]);
    saveDeck();
    renderDeck();
    if (customOverviewOpen) {
      overviewSelectedSlideId = slide.id;
      overviewSelectedSlideIds = new Set([slide.id]);
      overviewSelectionAnchorId = slide.id;
      refreshCustomOverviewAfterFabricBuild({ scroll: true });
    }
  }

  function addSlideNearCurrent() {
    insertSlideNearCurrent(createBlankSlide());
  }

  function insertSlideRightOf(slideId, slide) {
    const pos = slidePositions.get(slideId);
    if (!pos) return;
    deck.groups.splice(pos.h + 1, 0, {
      id: randomId(),
      slides: [slide]
    });
    currentH = pos.h + 1;
    currentV = 0;
    markSlidesEntering([slide.id]);
    saveDeck();
    renderDeck();
    refreshCustomOverviewAfterInsert(slide.id);
  }

  function insertSlideBelow(slideId, slide) {
    const pos = slidePositions.get(slideId);
    const group = pos && deck.groups[pos.h];
    if (!group) return;
    group.slides.splice(pos.v + 1, 0, slide);
    currentH = pos.h;
    currentV = pos.v + 1;
    markSlidesEntering([slide.id]);
    saveDeck();
    renderDeck();
    refreshCustomOverviewAfterInsert(slide.id);
  }

  function refreshCustomOverviewAfterInsert(slideId) {
    if (!customOverviewOpen) return;
    overviewSelectedSlideId = slideId;
    overviewSelectedSlideIds = new Set([slideId]);
    overviewSelectionAnchorId = slideId;
    refreshCustomOverviewAfterFabricBuild({ scroll: true });
  }

  function handleSlideEdgeAddClick(event) {
    const rightButton = event.target.closest && event.target.closest('[data-add-slide-right]');
    const bottomButton = event.target.closest && event.target.closest('[data-add-slide-bottom]');
    const button = rightButton || bottomButton;
    if (!button) return false;
    event.preventDefault();
    event.stopPropagation();
    if (event.stopImmediatePropagation) event.stopImmediatePropagation();
    const slideId = rightButton ? rightButton.dataset.addSlideRight : bottomButton.dataset.addSlideBottom;
    if (rightButton) insertSlideRightOf(slideId, createBlankSlide());
    else insertSlideBelow(slideId, createBlankSlide());
    return true;
  }

  function addAlgorithmSlideNearCurrent() {
    const slide = createAlgorithmAnimationSlide();
    insertSlideNearCurrent(slide);
    requestAnimationFrame(() => openAlgorithmEditor(slide.id));
  }

  function deleteOverviewSelectedSlide() {
    if (slideMutationInFlight) return;
    const ids = customOverviewOpen
      ? selectedOverviewSlideIds()
      : [getSlide()?.id].filter(Boolean);
    if (!ids.length || totalSlides() <= 1) return;
    const removableIds = ids.slice(0, Math.max(0, totalSlides() - 1));
    if (!removableIds.length) return;
    const beforeOrder = flatSlideIds();
    const firstDeletedIndex = beforeOrder.findIndex(id => removableIds.includes(id));
    runSlideDeleteTransition(removableIds, () => {
      removeSlidesByIds(removableIds);
      const afterOrder = flatSlideIds();
      const fallbackId = afterOrder[Math.min(Math.max(0, firstDeletedIndex), afterOrder.length - 1)] || afterOrder[0] || null;
      if (fallbackId) {
        overviewSelectedSlideId = fallbackId;
        overviewSelectedSlideIds = new Set([fallbackId]);
        overviewSelectionAnchorId = fallbackId;
        const pos = slidePositions.get(fallbackId);
        if (pos) {
          currentH = pos.h;
          currentV = pos.v;
        }
      }
      saveDeck();
      renderDeck();
    });
  }

  function markSlidesEntering(slideIds) {
    const ids = slideIds.filter(Boolean);
    ids.forEach(id => {
      slidePageEnteringIds.add(id);
      overviewPageEnteringIds.add(id);
    });
    setTimeout(() => ids.forEach(id => {
      slidePageEnteringIds.delete(id);
      overviewPageEnteringIds.delete(id);
    }), 5000);
  }

  function applySlidePageEnterState(element, slideId) {
    if (!element) return;
    const enteringIds = element.classList.contains('custom-overview-thumb')
      ? overviewPageEnteringIds
      : slidePageEnteringIds;
    if (!enteringIds.has(slideId)) return;
    enteringIds.delete(slideId);
    element.classList.add('is-page-entering');
    requestAnimationFrame(() => requestAnimationFrame(() => element.classList.remove('is-page-entering')));
  }

  function runSlideDeleteTransition(slideIds, commit) {
    const idSet = new Set(slideIds);
    const selector = customOverviewOpen ? '.custom-overview-thumb' : 'section.asm-slide';
    const targets = Array.from(document.querySelectorAll(selector)).filter(element => idSet.has(element.dataset.slideId));
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!targets.length || reducedMotion) {
      commit();
      return;
    }
    slideMutationInFlight = true;
    targets.forEach(element => element.classList.add('is-page-deleting'));
    setTimeout(() => {
      slideMutationInFlight = false;
      commit();
    }, 220);
  }

  function totalSlides() {
    return deck.groups.reduce((sum, group) => sum + group.slides.length, 0);
  }

  function removeSlideById(slideId) {
    const pos = slidePositions.get(slideId);
    if (!pos) return null;
    const [slide] = deck.groups[pos.h].slides.splice(pos.v, 1);
    if (!deck.groups[pos.h].slides.length) deck.groups.splice(pos.h, 1);
    rebuildPositions();
    return slide;
  }

  function removeSlidesByIds(slideIds) {
    const idSet = new Set(slideIds);
    const orderedIds = flatSlideIds().filter(id => idSet.has(id));
    const removed = new Map();
    const positions = orderedIds
      .map(id => ({ id, pos: slidePositions.get(id) }))
      .filter(item => item.pos)
      .sort((a, b) => b.pos.h - a.pos.h || b.pos.v - a.pos.v);
    positions.forEach(({ id, pos }) => {
      const [slide] = deck.groups[pos.h].slides.splice(pos.v, 1);
      if (slide) removed.set(id, slide);
    });
    deck.groups = deck.groups.filter(group => group.slides.length);
    rebuildPositions();
    return orderedIds.map(id => removed.get(id)).filter(Boolean);
  }

  function moveSlide(sourceId, targetId, side, { selectMoved = true } = {}) {
    if (!sourceId || !targetId || sourceId === targetId) return;
    const previousSelectedSlideId = overviewSelectedSlideId;
    const previousCurrentSlideId = getSlide()?.id;
    let targetPos = slidePositions.get(targetId);
    if (!targetPos) return;
    const moved = removeSlideById(sourceId);
    if (!moved) return;
    targetPos = slidePositions.get(targetId);
    if (!targetPos) return;

    if (side === 'left' || side === 'right') {
      const insertAt = targetPos.h + (side === 'right' ? 1 : 0);
      deck.groups.splice(insertAt, 0, { id: randomId(), slides: [moved] });
      currentH = insertAt;
      currentV = 0;
    } else {
      const group = deck.groups[targetPos.h];
      const insertAt = targetPos.v + (side === 'down' ? 1 : 0);
      group.slides.splice(insertAt, 0, moved);
      currentH = targetPos.h;
      currentV = insertAt;
    }

    rebuildPositions();
    if (selectMoved) {
      overviewSelectedSlideId = moved.id;
      overviewSelectedSlideIds = new Set([moved.id]);
      overviewSelectionAnchorId = moved.id;
      const movedPos = slidePositions.get(moved.id);
      if (movedPos) {
        currentH = movedPos.h;
        currentV = movedPos.v;
      }
    } else {
      overviewSelectedSlideId = previousSelectedSlideId;
      const currentPos = slidePositions.get(previousCurrentSlideId);
      if (currentPos) {
        currentH = currentPos.h;
        currentV = currentPos.v;
      }
    }
    saveDeck();
    renderDeck();
  }

  function moveSlidesAsHorizontalRow(sourceIds, targetId, side) {
    const orderedSourceIds = orderedOverviewIds(sourceIds);
    if (orderedSourceIds.length <= 1) {
      moveSlide(orderedSourceIds[0], targetId, side, { selectMoved: false });
      return;
    }
    if (!targetId || orderedSourceIds.includes(targetId)) return;
    const previousCurrentSlideId = getSlide()?.id;
    const normalizedSide = (side === 'right' || side === 'down') ? 'right' : 'left';
    const movedSlides = removeSlidesByIds(orderedSourceIds);
    if (!movedSlides.length) return;
    const targetPos = slidePositions.get(targetId);
    if (!targetPos) return;
    const insertAt = targetPos.h + (normalizedSide === 'right' ? 1 : 0);
    const groups = movedSlides.map(slide => ({ id: randomId(), slides: [slide] }));
    deck.groups.splice(insertAt, 0, ...groups);
    rebuildPositions();
    overviewSelectedSlideIds = new Set(movedSlides.map(slide => slide.id));
    overviewSelectedSlideId = movedSlides[0]?.id || null;
    overviewSelectionAnchorId = overviewSelectedSlideId;
    const movedPos = overviewSelectedSlideId && slidePositions.get(overviewSelectedSlideId);
    const previousPos = previousCurrentSlideId && slidePositions.get(previousCurrentSlideId);
    if (previousPos) {
      currentH = previousPos.h;
      currentV = previousPos.v;
    } else if (movedPos) {
      currentH = movedPos.h;
      currentV = movedPos.v;
    }
    saveDeck();
    renderDeck();
  }

  function selectAllCustomOverviewSlides() {
    applyCustomOverviewSelection(flatSlideIds(), overviewSelectedSlideId || getSlide()?.id || flatSlideIds()[0], overviewSelectionAnchorId || getSlide()?.id);
  }

  function copyCustomOverviewSlides() {
    const selectedIds = selectedOverviewSlideIds();
    slideClipboard = selectedIds
      .map(id => {
        const pos = slidePositions.get(id);
        return pos ? getSlide(pos.h, pos.v) : null;
      })
      .filter(Boolean)
      .map(slide => clone(slide));
  }

  function cutCustomOverviewSlides() {
    copyCustomOverviewSlides();
    if (!slideClipboard.length) return;
    deleteOverviewSelectedSlide();
  }

  function pasteCustomOverviewSlides() {
    if (!slideClipboard.length) return;
    const targetId = overviewSelectedSlideId || getSlide()?.id;
    const targetPos = targetId && slidePositions.get(targetId);
    if (!targetPos) return;
    const pastedSlides = slideClipboard.map(cloneSlideForPaste);
    const insertAt = targetPos.h + 1;
    deck.groups.splice(insertAt, 0, ...pastedSlides.map(slide => ({ id: randomId(), slides: [slide] })));
    rebuildPositions();
    overviewSelectedSlideIds = new Set(pastedSlides.map(slide => slide.id));
    overviewSelectedSlideId = pastedSlides[0]?.id || null;
    overviewSelectionAnchorId = overviewSelectedSlideId;
    const pos = overviewSelectedSlideId && slidePositions.get(overviewSelectedSlideId);
    if (pos) {
      currentH = pos.h;
      currentV = pos.v;
    }
    markSlidesEntering(pastedSlides.map(slide => slide.id));
    saveDeck();
    renderDeck();
    if (customOverviewOpen) {
      refreshCustomOverviewAfterFabricBuild({ scroll: true });
    }
  }

  function openCustomOverview() {
    if (!customOverview || customOverviewOpen || !document.body.classList.contains('asm-edit-mode')) return;
    if (reveal && reveal.isOverview && reveal.isOverview()) reveal.toggleOverview();
    customOverviewOpen = true;
    overviewSelectedSlideId = getSlide()?.id || overviewSelectedSlideId;
    overviewSelectedSlideIds = new Set([overviewSelectedSlideId].filter(Boolean));
    overviewSelectionAnchorId = overviewSelectedSlideId;
    customOverview.hidden = false;
    overviewChrome.hidden = true;
    document.body.classList.add('custom-overview-open');
    showOverviewSidebarPanel();
    hideObjectToolbar();
    exitWidgetEditorIfNeeded();
    fabricCanvases.forEach(canvas => {
      canvas.skipTargetFind = true;
      canvas.discardActiveObject();
    });
    renderCustomOverview();
    requestAnimationFrame(() => scrollCustomOverviewSelectionIntoView());
  }

  function closeCustomOverview() {
    if (!customOverviewOpen) return;
    const pos = overviewSelectedSlideId && slidePositions.get(overviewSelectedSlideId);
    if (pos) {
      currentH = pos.h;
      currentV = pos.v;
    }
    customOverviewOpen = false;
    customOverviewDrag = null;
    clearDropPreview();
    clearCustomOverviewDragGhost();
    if (customOverview) customOverview.hidden = true;
    overviewChrome.hidden = true;
    document.body.classList.remove('custom-overview-open');
    showDefaultPanel();
    fabricCanvases.forEach(canvas => {
      canvas.skipTargetFind = false;
    });
    if (reveal) {
      reveal.slide(currentH, currentV);
      reveal.layout();
    }
    applyEditMode(document.body.classList.contains('asm-edit-mode'));
  }

  function renderCustomOverview() {
    if (!customOverviewBoard || !customOverviewOpen) return;
    rebuildPositions();
    customOverviewBoard.innerHTML = '';
    deck.groups.forEach((group, h) => {
      const column = document.createElement('div');
      column.className = 'custom-overview-column';
      column.dataset.h = String(h);
      group.slides.forEach((slide, v) => column.appendChild(createCustomOverviewThumb(slide, h, v)));
      customOverviewBoard.appendChild(column);
    });
  }

  function flatSlideIds() {
    return deck.groups.flatMap(group => group.slides.map(slide => slide.id));
  }

  function orderedOverviewIds(ids) {
    const idSet = new Set(ids);
    return flatSlideIds().filter(id => idSet.has(id));
  }

  function selectedOverviewSlideIds() {
    const ordered = orderedOverviewIds(overviewSelectedSlideIds);
    if (ordered.length) return ordered;
    return [overviewSelectedSlideId || getSlide()?.id].filter(Boolean);
  }

  function createCustomOverviewThumb(slide, h, v) {
    const thumb = document.createElement('button');
    thumb.type = 'button';
    thumb.className = 'custom-overview-thumb';
    thumb.dataset.slideId = slide.id;
    thumb.dataset.h = String(h);
    thumb.dataset.v = String(v);
    applySlidePageEnterState(thumb, slide.id);
    thumb.classList.toggle('is-selected', overviewSelectedSlideIds.has(slide.id));
    thumb.setAttribute('aria-label', `Slide ${h + 1}${v ? `.${v + 1}` : ''}`);

    const mini = document.createElement('div');
    mini.className = 'custom-overview-mini';
    const pageNumber = document.createElement('span');
    pageNumber.className = 'custom-overview-page-number';
    pageNumber.textContent = String(flatSlideIds().indexOf(slide.id) + 1);

    if (slide.kind === 'algorithm-animation') {
      const preview = document.createElement('div');
      preview.className = 'algorithm-overview-preview';
      preview.innerHTML = '<div>{;}<span>Algorithm</span></div>';
      mini.appendChild(preview);
      thumb.append(mini, pageNumber);
      return thumb;
    }

    const image = document.createElement('img');
    image.alt = '';
    image.draggable = false;
    image.src = slideCanvasDataUrl(slide);
    mini.appendChild(image);

    const renderedLayer = document.querySelector(`.widget-layer[data-slide-id="${slide.id}"]`);
    if (renderedLayer) {
      mini.appendChild(renderedLayer.cloneNode(true));
    } else {
      const layer = document.createElement('div');
      layer.className = 'widget-layer';
      renderSlideWidgets(layer, slide);
      mini.appendChild(layer);
    }

    thumb.append(mini, pageNumber);
    return thumb;
  }

  function slideCanvasDataUrl(slide) {
    const canvas = fabricCanvases.get(slide.id);
    try {
      if (canvas && canvas.toDataURL) return canvas.toDataURL({ format: 'png' });
      const el = document.getElementById(`fabric-${slide.id}`);
      if (el && el.toDataURL) return el.toDataURL('image/png');
    } catch (err) {
      // A blank fallback keeps the overview usable even if a canvas cannot be exported.
    }
    return 'data:image/svg+xml;charset=utf-8,%3Csvg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"%3E%3Crect width="1280" height="720" fill="%23fbfcfa"/%3E%3C/svg%3E';
  }

  function scrollCustomOverviewSelectionIntoView() {
    const selected = customOverviewBoard && customOverviewBoard.querySelector('.custom-overview-thumb.is-selected');
    if (selected) selected.scrollIntoView({ block: 'center', inline: 'center' });
  }

  function selectCustomOverviewSlide(slideId) {
    if (!slideId) return;
    overviewSelectedSlideIds = new Set([slideId]);
    overviewSelectionAnchorId = slideId;
    overviewSelectedSlideId = slideId;
    const pos = slidePositions.get(slideId);
    if (pos) {
      currentH = pos.h;
      currentV = pos.v;
    }
    customOverviewBoard?.querySelectorAll('.custom-overview-thumb').forEach(thumb => {
      thumb.classList.toggle('is-selected', thumb.dataset.slideId === slideId);
    });
  }

  function applyCustomOverviewSelection(slideIds, focusId, anchorId = focusId) {
    const orderedIds = orderedOverviewIds(slideIds);
    overviewSelectedSlideIds = new Set(orderedIds);
    overviewSelectedSlideId = focusId || orderedIds[orderedIds.length - 1] || null;
    overviewSelectionAnchorId = anchorId || overviewSelectedSlideId;
    const pos = overviewSelectedSlideId && slidePositions.get(overviewSelectedSlideId);
    if (pos) {
      currentH = pos.h;
      currentV = pos.v;
    }
    customOverviewBoard?.querySelectorAll('.custom-overview-thumb').forEach(thumb => {
      thumb.classList.toggle('is-selected', overviewSelectedSlideIds.has(thumb.dataset.slideId));
    });
  }

  function selectCustomOverviewSlideFromEvent(slideId, event) {
    if (!slideId) return;
    const order = flatSlideIds();
    if (event.shiftKey && overviewSelectionAnchorId && order.includes(overviewSelectionAnchorId)) {
      const start = order.indexOf(overviewSelectionAnchorId);
      const end = order.indexOf(slideId);
      const [from, to] = start <= end ? [start, end] : [end, start];
      applyCustomOverviewSelection(order.slice(from, to + 1), slideId, overviewSelectionAnchorId);
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      const next = new Set(overviewSelectedSlideIds);
      if (next.has(slideId)) next.delete(slideId);
      else next.add(slideId);
      if (!next.size) next.add(slideId);
      const ordered = orderedOverviewIds(next);
      applyCustomOverviewSelection(next, next.has(slideId) ? slideId : ordered[ordered.length - 1], slideId);
      return;
    }
    selectCustomOverviewSlide(slideId);
  }

  function bindOverviewEvents() {
    reveal.on('overviewshown', () => {
      if (!document.body.classList.contains('asm-edit-mode')) return;
      overviewChrome.hidden = false;
      hideObjectToolbar();
      flashHint('Done');
      fabricCanvases.forEach(canvas => {
        canvas.skipTargetFind = true;
        canvas.discardActiveObject();
      });
      prepareOverview();
      applyOverviewPan();
      refreshOverviewScrollbars();
      setOverviewShieldVisible(true);
    });

    reveal.on('overviewhidden', () => {
      overviewChrome.hidden = true;
      clearDropPreview();
      overviewPanX = 0;
      overviewPanY = 0;
      applyOverviewPan();
      setOverviewScrollbarsVisible(false);
      setOverviewShieldVisible(false);
      applyEditMode(document.body.classList.contains('asm-edit-mode'));
    });
  }

  function prepareOverview() {
    document.querySelectorAll('section.asm-slide').forEach(section => {
      section.draggable = false;
      section.classList.remove('is-overview-selected');
    });
  }

  function bindCustomOverview() {
    customOverviewViewport?.addEventListener('wheel', event => {
      if (!customOverviewOpen) return;
      event.preventDefault();
      const dominantDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      const unit = event.deltaMode === 1 ? 28 : (event.deltaMode === 2 ? window.innerWidth : 1);
      if (customOverviewRightMouseDown || (event.buttons & 2)) customOverviewViewport.scrollTop += dominantDelta * unit;
      else customOverviewViewport.scrollLeft += dominantDelta * unit;
    }, { passive: false });

    customOverviewViewport?.addEventListener('contextmenu', event => {
      if (!customOverviewOpen) return;
      event.preventDefault();
    });

    customOverviewViewport?.addEventListener('pointerdown', event => {
      if (!customOverviewOpen || event.button !== 2) return;
      customOverviewRightMouseDown = true;
      event.preventDefault();
    }, true);

    document.addEventListener('pointerup', event => {
      if (event.button === 2 || event.buttons === 0) customOverviewRightMouseDown = false;
    }, true);

    document.addEventListener('pointercancel', () => {
      customOverviewRightMouseDown = false;
    }, true);

    window.addEventListener('blur', () => {
      customOverviewRightMouseDown = false;
    });

    customOverviewBoard?.addEventListener('click', event => {
      if (!customOverviewOpen) return;
      if (suppressCustomOverviewClick) {
        event.preventDefault();
        suppressCustomOverviewClick = false;
        return;
      }
      const thumb = event.target.closest('.custom-overview-thumb');
      if (!thumb) return;
      selectCustomOverviewSlideFromEvent(thumb.dataset.slideId, event);
    });

    const begin = event => {
      if (!customOverviewOpen || event.button !== 0) return;
      const thumb = event.target.closest && event.target.closest('.custom-overview-thumb');
      if (!thumb) return;
      event.preventDefault();
      event.stopPropagation();
      const slideId = thumb.dataset.slideId;
      if (!event.shiftKey && !event.ctrlKey && !event.metaKey && !overviewSelectedSlideIds.has(slideId)) {
        selectCustomOverviewSlide(slideId);
      }
      const sourceIds = overviewSelectedSlideIds.has(slideId) ? selectedOverviewSlideIds() : [slideId];
      customOverviewDrag = {
        sourceId: slideId,
        sourceIds,
        sourceEl: thumb,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        active: false,
        ghost: null
      };
      if (event.pointerId != null && customOverviewViewport.setPointerCapture) {
        try {
          customOverviewViewport.setPointerCapture(event.pointerId);
        } catch (err) {
          // Document listeners keep the drag alive if pointer capture is unavailable.
        }
      }
    };

    const move = event => {
      if (!customOverviewDrag || !customOverviewOpen) return;
      if (customOverviewDrag.pointerId != null && event.pointerId != null && event.pointerId !== customOverviewDrag.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      const moved = Math.abs(event.clientX - customOverviewDrag.startX) + Math.abs(event.clientY - customOverviewDrag.startY);
      if (moved < 8) return;
      if (!customOverviewDrag.active) {
        customOverviewDrag.active = true;
        customOverviewDrag.sourceEls = customOverviewDrag.sourceIds
          .map(id => customOverviewBoard.querySelector(`.custom-overview-thumb[data-slide-id="${id}"]`))
          .filter(Boolean);
        customOverviewDrag.sourceEls.forEach(el => el.classList.add('is-overview-drag-source'));
        customOverviewDrag.ghost = createCustomOverviewDragGhost(customOverviewDrag.sourceEls);
      }
      updateCustomOverviewDragGhost(customOverviewDrag, event);
      const candidate = customOverviewDropCandidate(event.clientX, event.clientY, customOverviewDrag.sourceIds);
      if (!candidate) {
        clearDropPreview();
        return;
      }
      showCustomOverviewDropPreview(candidate);
    };

    const end = event => {
      if (!customOverviewDrag) return;
      if (customOverviewDrag.pointerId != null && event.pointerId != null && event.pointerId !== customOverviewDrag.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      const drag = customOverviewDrag;
      customOverviewDrag = null;
      clearDropPreview();
      clearCustomOverviewDragGhost(drag);
      suppressCustomOverviewClick = true;
      setTimeout(() => {
        suppressCustomOverviewClick = false;
      }, 120);
      if (event.pointerId != null && customOverviewViewport.releasePointerCapture) {
        try {
          customOverviewViewport.releasePointerCapture(event.pointerId);
        } catch (err) {
          // The browser may have already released this pointer.
        }
      }
      if (!drag.active) {
        selectCustomOverviewSlideFromEvent(drag.sourceId, event);
        return;
      }
      const candidate = customOverviewDropCandidate(event.clientX, event.clientY, drag.sourceIds);
      if (!candidate || candidate.noOp) {
        renderCustomOverview();
        return;
      }
      if (drag.sourceIds.length > 1) {
        moveSlidesAsHorizontalRow(drag.sourceIds, candidate.section.dataset.slideId, candidate.side);
      } else {
        moveSlide(drag.sourceId, candidate.section.dataset.slideId, candidate.side, { selectMoved: false });
      }
    };

    customOverviewViewport?.addEventListener('pointerdown', begin, true);
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', end, true);
    document.addEventListener('pointercancel', end, true);
  }

  function customOverviewThumbFromPoint(x, y, excludedIds = new Set()) {
    return document.elementsFromPoint(x, y)
      .find(el => el.matches && el.matches('.custom-overview-thumb') && !excludedIds.has(el.dataset.slideId));
  }

  function nearestCustomOverviewThumbFromPoint(x, y, excludedIds = new Set()) {
    const direct = customOverviewThumbFromPoint(x, y, excludedIds);
    if (direct) return direct;
    let best = null;
    customOverviewBoard?.querySelectorAll('.custom-overview-thumb').forEach(thumb => {
      if (excludedIds.has(thumb.dataset.slideId)) return;
      const rect = thumb.getBoundingClientRect();
      const dx = x < rect.left ? rect.left - x : (x > rect.right ? x - rect.right : 0);
      const dy = y < rect.top ? rect.top - y : (y > rect.bottom ? y - rect.bottom : 0);
      const distance = dx * dx + dy * dy;
      if (!best || distance < best.distance) best = { thumb, distance };
    });
    if (!best) return null;
    const rect = best.thumb.getBoundingClientRect();
    const maxDistance = Math.max(70, Math.min(rect.width, rect.height) * 0.75);
    return best.distance <= maxDistance * maxDistance ? best.thumb : null;
  }

  function customOverviewDropCandidate(x, y, sourceIds) {
    const ids = Array.isArray(sourceIds) ? sourceIds.filter(Boolean) : [sourceIds].filter(Boolean);
    if (!ids.length) return null;
    const excludedIds = new Set(ids);
    const section = nearestCustomOverviewThumbFromPoint(x, y, excludedIds);
    if (!section) return null;
    const sideInfo = dropSideInfo({ clientX: x, clientY: y }, section);
    if (!sideInfo || sideInfo.distance > 0.5) return null;
    const side = ids.length > 1
      ? ((sideInfo.side === 'right' || sideInfo.side === 'down') ? 'right' : 'left')
      : sideInfo.side;
    const noOp = ids.length === 1 && isNoOpSlideMove(ids[0], section.dataset.slideId, side);
    if (ids.length === 1 && !noOp && !isValidSlideMove(ids[0], section.dataset.slideId, side)) return null;
    return { section, side, sourceId: ids[0], sourceIds: ids, noOp };
  }

  function showCustomOverviewDropPreview(candidate) {
    clearDropPreview();
    const line = ensureOverviewDropLine();
    const rect = customOverviewInsertionLineRect(candidate.section, candidate.side);
    const thickness = 6;
    if (candidate.side === 'up' || candidate.side === 'down') {
      line.style.left = `${rect.left}px`;
      line.style.top = `${rect.y - thickness / 2}px`;
      line.style.width = `${rect.width}px`;
      line.style.height = `${thickness}px`;
    } else {
      line.style.left = `${rect.x - thickness / 2}px`;
      line.style.top = `${rect.top}px`;
      line.style.width = `${thickness}px`;
      line.style.height = `${rect.height}px`;
    }
    line.style.display = 'block';
    dropPreview = { section: candidate.section, side: candidate.side };
  }

  function customOverviewInsertionLineRect(section, side) {
    const rect = section.getBoundingClientRect();
    const gapX = customOverviewGap('x');
    const gapY = customOverviewGap('y', Number(section.dataset.h || 0));
    const fake = { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
    if (side === 'left') {
      fake.left = rect.left - gapX - rect.width;
      fake.right = fake.left + rect.width;
    }
    if (side === 'right') {
      fake.left = rect.right + gapX;
      fake.right = fake.left + rect.width;
    }
    if (side === 'up') {
      fake.top = rect.top - gapY - rect.height;
      fake.bottom = fake.top + rect.height;
    }
    if (side === 'down') {
      fake.top = rect.bottom + gapY;
      fake.bottom = fake.top + rect.height;
    }
    const overhang = 8;
    if (side === 'up' || side === 'down') {
      const y = side === 'up' ? (fake.bottom + rect.top) / 2 : (rect.bottom + fake.top) / 2;
      return {
        left: Math.min(rect.left, fake.left) - overhang,
        y,
        width: Math.max(rect.right, fake.right) - Math.min(rect.left, fake.left) + overhang * 2
      };
    }
    const x = side === 'left' ? (fake.right + rect.left) / 2 : (rect.right + fake.left) / 2;
    return {
      x,
      top: Math.min(rect.top, fake.top) - overhang,
      height: Math.max(rect.bottom, fake.bottom) - Math.min(rect.top, fake.top) + overhang * 2
    };
  }

  function customOverviewGap(axis, h = null) {
    const selector = axis === 'x'
      ? '.custom-overview-column'
      : `.custom-overview-thumb[data-h="${h}"]`;
    const intervals = Array.from(customOverviewBoard?.querySelectorAll(selector) || [])
      .map(el => {
        const rect = el.getBoundingClientRect();
        return axis === 'x' ? { start: rect.left, end: rect.right } : { start: rect.top, end: rect.bottom };
      })
      .filter(interval => interval.end - interval.start > 1)
      .sort((a, b) => a.start - b.start);
    let gap = Infinity;
    for (let index = 1; index < intervals.length; index += 1) {
      const nextGap = intervals[index].start - intervals[index - 1].end;
      if (nextGap > 0.5 && nextGap < gap) gap = nextGap;
    }
    return Number.isFinite(gap) ? gap : (axis === 'x' ? 34 : 28);
  }

  function createCustomOverviewDragGhost(thumbs) {
    const sourceThumbs = Array.isArray(thumbs) ? thumbs : [thumbs].filter(Boolean);
    if (!sourceThumbs.length) return null;
    const rect = sourceThumbs[0].getBoundingClientRect();
    const ghost = document.createElement('div');
    ghost.className = 'overview-drag-ghost custom-overview-multi-ghost';
    sourceThumbs.forEach(thumb => {
      const clone = thumb.cloneNode(true);
      clone.classList.remove('is-selected', 'is-overview-drag-source');
      clone.setAttribute('aria-hidden', 'true');
      ghost.appendChild(clone);
    });
    if (sourceThumbs.length > 1) {
      const badge = document.createElement('span');
      badge.className = 'custom-overview-drag-count';
      badge.textContent = String(sourceThumbs.length);
      ghost.appendChild(badge);
    }
    ghost.setAttribute('aria-hidden', 'true');
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    document.body.appendChild(ghost);
    return ghost;
  }

  function updateCustomOverviewDragGhost(drag, event) {
    if (!drag || !drag.ghost) return;
    drag.ghost.style.transform = `translate(${event.clientX - drag.startX}px, ${event.clientY - drag.startY}px)`;
  }

  function clearCustomOverviewDragGhost(drag = customOverviewDrag) {
    if (!drag) return;
    if (drag.sourceEls) drag.sourceEls.forEach(el => el.classList.remove('is-overview-drag-source'));
    drag.sourceEl?.classList.remove('is-overview-drag-source');
    if (drag.ghost) drag.ghost.remove();
  }

  function bindOverviewDrag() {
    const haltOverviewEvent = event => {
      event.preventDefault();
      event.stopPropagation();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation();
    };

    const isOverviewPassthroughTarget = event => {
      const target = event.target;
      if (target && target.closest && target.closest([
        '.controls',
        '.navigate-left',
        '.navigate-right',
        '.navigate-up',
        '.navigate-down',
        '#overviewHScrollbar',
        '#overviewVScrollbar',
        '#overviewChrome',
        '#controlChrome',
        '#editorChrome',
        '.mode-switch',
        'button',
        'input',
        'select',
        'textarea',
        'a'
      ].join(','))) {
        return true;
      }
      const x = event.clientX;
      const y = event.clientY;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
      return [overviewHScrollbar, overviewVScrollbar].some(el => {
        if (!el || el.hidden) return false;
        const rect = el.getBoundingClientRect();
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
      });
    };

    const startOverviewDrag = event => {
      if (!isRevealEditOverviewActive()) return false;
      if (isOverviewPassthroughTarget(event)) return false;
      const section = (event.target.closest && event.target.closest('section.asm-slide')) || overviewSlideFromPoint(event.clientX, event.clientY);
      if (!section || event.button !== 0) return false;
      haltOverviewEvent(event);
      if (pointerDrag) return true;
      draggedSlideId = section.dataset.slideId;
      pointerDrag = {
        sourceId: section.dataset.slideId,
        sourceEl: section,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        active: false
      };
      overviewEventShield?.classList.add('is-dragging');
      if (event.pointerId != null && slidesRoot.setPointerCapture) {
        try {
          slidesRoot.setPointerCapture(event.pointerId);
        } catch (err) {
          // Capture is best-effort; document-level listeners keep the drag alive.
        }
      }
      return true;
    };

    const updateOverviewDrag = event => {
      if (!pointerDrag || !isRevealEditOverviewActive()) return false;
      if (pointerDrag.pointerId != null && event.pointerId != null && event.pointerId !== pointerDrag.pointerId) return false;
      haltOverviewEvent(event);
      const moved = Math.abs(event.clientX - pointerDrag.startX) + Math.abs(event.clientY - pointerDrag.startY);
      if (moved < 8) return true;
      if (!pointerDrag.active) {
        pointerDrag.active = true;
        pointerDrag.sourceEl?.classList.add('is-overview-drag-source');
        pointerDrag.ghost = createOverviewDragGhost(pointerDrag.sourceEl);
      }
      updateOverviewDragGhost(pointerDrag, event);
      const candidate = overviewDropCandidate(event.clientX, event.clientY, pointerDrag.sourceId);
      if (!candidate) {
        clearDropPreview();
        return true;
      }
      showDropPreview(candidate);
      return true;
    };

    const endOverviewDrag = event => {
      if (!pointerDrag) return false;
      if (pointerDrag.pointerId != null && event.pointerId != null && event.pointerId !== pointerDrag.pointerId) return false;
      haltOverviewEvent(event);
      const drag = pointerDrag;
      pointerDrag = null;
      draggedSlideId = null;
      clearDropPreview();
      clearOverviewDragVisuals(drag);
      overviewEventShield?.classList.remove('is-dragging');
      if (event.pointerId != null && slidesRoot.releasePointerCapture) {
        try {
          slidesRoot.releasePointerCapture(event.pointerId);
        } catch (err) {
          // The pointer may already have been released by the browser.
        }
      }
      if (!drag.active || !isRevealEditOverviewActive()) {
        suppressOverviewClick = true;
        setTimeout(() => {
          suppressOverviewClick = false;
        }, 120);
        return true;
      }
      suppressOverviewClick = true;
      setTimeout(() => {
        suppressOverviewClick = false;
      }, 120);
      const candidate = overviewDropCandidate(event.clientX, event.clientY, drag.sourceId);
      if (!candidate) {
        return true;
      }
      if (candidate.noOp) return true;
      moveSlide(drag.sourceId, candidate.section.dataset.slideId, candidate.side, { selectMoved: false });
      return true;
    };

    slidesRoot.addEventListener('click', event => {
      if (!isRevealEditOverviewActive()) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      suppressOverviewClick = false;
    }, true);

    slidesRoot.addEventListener('dragstart', event => {
      if (!isRevealEditOverviewActive()) return;
      haltOverviewEvent(event);
      draggedSlideId = null;
      clearDropPreview();
    });

    slidesRoot.addEventListener('dragover', event => {
      if (!isRevealEditOverviewActive()) return;
      haltOverviewEvent(event);
    });

    slidesRoot.addEventListener('dragleave', event => {
      if (!event.relatedTarget || !event.currentTarget.contains(event.relatedTarget)) clearDropPreview();
    });

    slidesRoot.addEventListener('drop', event => {
      if (!isRevealEditOverviewActive()) return;
      haltOverviewEvent(event);
      clearDropPreview();
      draggedSlideId = null;
    });

    slidesRoot.addEventListener('dragend', event => {
      if (isRevealEditOverviewActive()) haltOverviewEvent(event);
      draggedSlideId = null;
      clearDropPreview();
    });

    const handleOverviewWheel = event => {
      if (!isRevealEditOverviewActive()) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      const dominantDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      const unit = event.deltaMode === 1 ? 28 : (event.deltaMode === 2 ? window.innerWidth : 1);
      if (event.buttons & 2) {
        overviewPanY = clampOverviewPanY(overviewPanY - dominantDelta * unit);
      } else {
        overviewPanX = clampOverviewPanX(overviewPanX - dominantDelta * unit);
      }
      applyOverviewPan();
      syncOverviewScrollbarPositions();
      syncOverviewRevealToPan();
    };

    document.addEventListener('wheel', handleOverviewWheel, { passive: false, capture: true });

    document.addEventListener('contextmenu', event => {
      if (!isRevealEditOverviewActive()) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation();
    }, true);

    overviewHScrollbar?.addEventListener('scroll', () => {
      if (suppressOverviewScrollbar || !isRevealEditOverviewActive()) return;
      const range = overviewPanRangeX();
      overviewPanX = range.max - overviewHScrollbar.scrollLeft;
      overviewPanX = clampOverviewPanX(overviewPanX);
      applyOverviewPan();
      syncOverviewRevealToPan();
    });

    overviewVScrollbar?.addEventListener('scroll', () => {
      if (suppressOverviewScrollbar || !isRevealEditOverviewActive()) return;
      const range = overviewPanRangeY();
      overviewPanY = range.max - overviewVScrollbar.scrollTop;
      overviewPanY = clampOverviewPanY(overviewPanY);
      applyOverviewPan();
      syncOverviewRevealToPan();
    });

    slidesRoot.addEventListener('pointerdown', event => startOverviewDrag(event), true);
    overviewEventShield?.addEventListener('pointerdown', event => startOverviewDrag(event), true);
    window.addEventListener('pointerdown', event => startOverviewDrag(event), true);

    document.addEventListener('pointermove', event => updateOverviewDrag(event), true);
    window.addEventListener('pointermove', event => updateOverviewDrag(event), true);

    document.addEventListener('pointerup', event => endOverviewDrag(event), true);
    window.addEventListener('pointerup', event => endOverviewDrag(event), true);

    document.addEventListener('pointercancel', event => {
      if (!endOverviewDrag(event)) return;
      clearDropPreview();
    }, true);
    window.addEventListener('pointercancel', event => {
      if (!endOverviewDrag(event)) return;
      clearDropPreview();
    }, true);

    slidesRoot.addEventListener('mousedown', event => startOverviewDrag(event), true);
    overviewEventShield?.addEventListener('mousedown', event => startOverviewDrag(event), true);
    window.addEventListener('mousedown', event => startOverviewDrag(event), true);

    document.addEventListener('mousemove', event => updateOverviewDrag(event), true);
    window.addEventListener('mousemove', event => updateOverviewDrag(event), true);

    document.addEventListener('mouseup', event => endOverviewDrag(event), true);
    window.addEventListener('mouseup', event => endOverviewDrag(event), true);

    overviewEventShield?.addEventListener('click', event => {
      if (!isRevealEditOverviewActive()) return;
      haltOverviewEvent(event);
    }, true);

    window.addEventListener('click', event => {
      if (!suppressOverviewClick || !isRevealEditOverviewActive()) return;
      haltOverviewEvent(event);
      suppressOverviewClick = false;
    }, true);

    document.addEventListener('click', event => {
      if (!suppressOverviewClick || !isRevealEditOverviewActive()) return;
      haltOverviewEvent(event);
      suppressOverviewClick = false;
    }, true);
  }

  function overviewSlideFromPoint(x, y) {
    return document.elementsFromPoint(x, y).find(el => el.matches && el.matches('section.asm-slide'));
  }

  function nearestOverviewSlideFromPoint(x, y, sourceId) {
    const direct = overviewSlideFromPoint(x, y);
    if (direct) return direct;
    let best = null;
    document.querySelectorAll('section.asm-slide').forEach(section => {
      if (section.dataset.slideId === sourceId) return;
      const rect = section.getBoundingClientRect();
      const dx = x < rect.left ? rect.left - x : (x > rect.right ? x - rect.right : 0);
      const dy = y < rect.top ? rect.top - y : (y > rect.bottom ? y - rect.bottom : 0);
      const distance = dx * dx + dy * dy;
      if (!best || distance < best.distance) best = { section, distance };
    });
    if (!best) return null;
    const rect = best.section.getBoundingClientRect();
    const maxDistance = Math.max(80, Math.min(rect.width, rect.height) * 0.55);
    return best.distance <= maxDistance * maxDistance ? best.section : null;
  }

  function overviewDropCandidate(x, y, sourceId) {
    if (!sourceId) return null;
    const section = nearestOverviewSlideFromPoint(x, y, sourceId);
    if (!section) return null;
    const sideInfo = dropSideInfo({ clientX: x, clientY: y }, section);
    if (!sideInfo || sideInfo.distance > 0.5) return null;
    const side = sideInfo.side;
    const noOp = isNoOpSlideMove(sourceId, section.dataset.slideId, side);
    if (!noOp && !isValidSlideMove(sourceId, section.dataset.slideId, side)) return null;
    return { section, side, sourceId, noOp };
  }

  function isValidSlideMove(sourceId, targetId, side) {
    if (!sourceId || !targetId || sourceId === targetId) return false;
    const sourcePos = slidePositions.get(sourceId);
    const targetPos = slidePositions.get(targetId);
    if (!sourcePos || !targetPos) return false;
    if (isNoOpSlideMove(sourceId, targetId, side)) return false;
    return true;
  }

  function isNoOpSlideMove(sourceId, targetId, side) {
    if (!sourceId || !targetId) return false;
    if (sourceId === targetId) return true;
    const sourcePos = slidePositions.get(sourceId);
    const targetPos = slidePositions.get(targetId);
    if (!sourcePos || !targetPos) return false;
    if (side === 'up' || side === 'down') {
      if (sourcePos.h === targetPos.h) {
        if (side === 'up' && sourcePos.v === targetPos.v - 1) return true;
        if (side === 'down' && sourcePos.v === targetPos.v + 1) return true;
      }
      return false;
    }
    const sourceGroup = deck.groups[sourcePos.h];
    if (sourceGroup && sourceGroup.slides.length === 1) {
      if (side === 'left' && sourcePos.h === targetPos.h - 1) return true;
      if (side === 'right' && sourcePos.h === targetPos.h + 1) return true;
    }
    return false;
  }

  function dropSide(event, section) {
    return dropSideInfo(event, section).side;
  }

  function dropSideInfo(event, section) {
    const rect = section.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    if (!isTopOverviewSlide(section)) {
      const up = y;
      const down = 1 - y;
      return up <= down ? { side: 'up', distance: up } : { side: 'down', distance: down };
    }
    const left = x;
    const right = 1 - x;
    const up = y;
    const down = 1 - y;
    const min = Math.min(left, right, up, down);
    if (min === left) return { side: 'left', distance: left };
    if (min === right) return { side: 'right', distance: right };
    if (min === up) return { side: 'up', distance: up };
    return { side: 'down', distance: down };
  }

  function isTopOverviewSlide(section) {
    return Number(section.dataset.v || 0) === 0;
  }

  function showDropPreview(candidate) {
    clearDropPreview();
    const { section, side } = candidate;
    const line = ensureOverviewDropLine();
    const placeholderRect = placeOverviewDropPlaceholder(section, side);
    const rect = insertionLineRect(section, side, placeholderRect);
    const thickness = 6;
    if (side === 'up' || side === 'down') {
      line.style.left = `${rect.left}px`;
      line.style.top = `${rect.y - thickness / 2}px`;
      line.style.width = `${rect.width}px`;
      line.style.height = `${thickness}px`;
    } else {
      line.style.left = `${rect.x - thickness / 2}px`;
      line.style.top = `${rect.top}px`;
      line.style.width = `${thickness}px`;
      line.style.height = `${rect.height}px`;
    }
    line.style.display = 'block';
    dropPreview = { section, side };
  }

  function insertionLineRect(section, side, placeholderRect) {
    const rect = section.getBoundingClientRect();
    const overhang = 14;

    if (side === 'up' || side === 'down') {
      const y = side === 'up'
        ? (placeholderRect.bottom + rect.top) / 2
        : (rect.bottom + placeholderRect.top) / 2;
      const left = Math.min(rect.left, placeholderRect.left) - overhang;
      const right = Math.max(rect.right, placeholderRect.right) + overhang;
      return {
        left,
        y,
        width: right - left
      };
    }

    const x = side === 'left'
      ? (placeholderRect.right + rect.left) / 2
      : (rect.right + placeholderRect.left) / 2;
    const top = Math.min(rect.top, placeholderRect.top) - overhang;
    const bottom = Math.max(rect.bottom, placeholderRect.bottom) + overhang;
    return {
      x,
      top,
      height: Math.max(12, bottom - top)
    };
  }

  function placeOverviewDropPlaceholder(section, side) {
    const rect = section.getBoundingClientRect();
    const placeholder = ensureOverviewDropPlaceholder();
    const gapX = overviewSlideGap('x');
    const gapY = overviewSlideGap('y', Number(section.dataset.h || 0));
    let left = rect.left;
    let top = rect.top;
    if (side === 'left') left = rect.left - gapX - rect.width;
    if (side === 'right') left = rect.right + gapX;
    if (side === 'up') top = rect.top - gapY - rect.height;
    if (side === 'down') top = rect.bottom + gapY;
    placeholder.style.left = `${left}px`;
    placeholder.style.top = `${top}px`;
    placeholder.style.width = `${rect.width}px`;
    placeholder.style.height = `${rect.height}px`;
    return placeholder.getBoundingClientRect();
  }

  function ensureOverviewDropPlaceholder() {
    if (!overviewDropPlaceholder) {
      overviewDropPlaceholder = document.createElement('div');
      overviewDropPlaceholder.className = 'overview-drop-placeholder';
      overviewDropPlaceholder.setAttribute('aria-hidden', 'true');
      document.body.appendChild(overviewDropPlaceholder);
    }
    return overviewDropPlaceholder;
  }

  function groupBounds(h, excludedId = null) {
    const sections = Array.from(document.querySelectorAll(`section.asm-slide[data-h="${h}"]`))
      .filter(section => section.dataset.slideId !== excludedId)
      .filter(section => {
        const rect = section.getBoundingClientRect();
        return rect.width > 1 && rect.height > 1;
      });
    if (!sections.length) return null;
    const rects = sections.map(section => section.getBoundingClientRect());
    const left = Math.min(...rects.map(rect => rect.left));
    const right = Math.max(...rects.map(rect => rect.right));
    const top = Math.min(...rects.map(rect => rect.top));
    const bottom = Math.max(...rects.map(rect => rect.bottom));
    return { left, right, top, bottom, width: right - left, height: bottom - top };
  }

  function overviewSlideGap(axis, h = null, excludedId = null) {
    const intervals = axis === 'x'
      ? deck.groups.map((group, index) => groupBounds(index, excludedId)).filter(Boolean).map(bounds => ({ start: bounds.left, end: bounds.right }))
      : Array.from(document.querySelectorAll(`section.asm-slide[data-h="${h}"]`))
        .filter(section => section.dataset.slideId !== excludedId)
        .map(section => {
          const rect = section.getBoundingClientRect();
          return { start: rect.top, end: rect.bottom };
        })
        .filter(interval => interval.end - interval.start > 1);
    intervals.sort((a, b) => a.start - b.start);
    let gap = Infinity;
    for (let index = 1; index < intervals.length; index += 1) {
      const currentGap = intervals[index].start - intervals[index - 1].end;
      if (currentGap > 0.5 && currentGap < gap) gap = currentGap;
    }
    if (Number.isFinite(gap)) return gap;
    const fallbackSize = intervals[0] ? Math.max(6, (intervals[0].end - intervals[0].start) * 0.055) : 10;
    return fallbackSize;
  }

  function clampOverviewPanX(nextPanX) {
    const range = overviewPanRangeX();
    return Math.max(range.min, Math.min(range.max, nextPanX));
  }

  function clampOverviewPanY(nextPanY) {
    const range = overviewPanRangeY();
    return Math.max(range.min, Math.min(range.max, nextPanY));
  }

  function overviewPanRangeX() {
    const centers = overviewEdgeCenters();
    if (!centers) return { min: 0, max: 0 };
    const viewportCenter = window.innerWidth / 2;
    const min = overviewPanX + viewportCenter - centers.last;
    const max = overviewPanX + viewportCenter - centers.first;
    return min > max ? { min: max, max } : { min, max };
  }

  function overviewPanRangeY() {
    const centers = overviewVerticalEdgeCenters();
    if (!centers) return { min: 0, max: 0 };
    const viewportCenter = window.innerHeight / 2;
    const min = overviewPanY + viewportCenter - centers.last;
    const max = overviewPanY + viewportCenter - centers.first;
    return min > max ? { min: max, max } : { min, max };
  }

  function overviewEdgeCenters() {
    const groups = deck.groups
      .map((group, index) => ({ index, bounds: groupBounds(index) }))
      .filter(item => item.bounds);
    if (!groups.length) return null;
    groups.sort((a, b) => a.index - b.index);
    const first = groups[0].bounds;
    const last = groups[groups.length - 1].bounds;
    return {
      first: (first.left + first.right) / 2,
      last: (last.left + last.right) / 2
    };
  }

  function overviewVerticalEdgeCenters() {
    const sections = Array.from(document.querySelectorAll('section.asm-slide'))
      .map(section => ({ section, rect: section.getBoundingClientRect() }))
      .filter(item => item.rect.width > 1 && item.rect.height > 1)
      .sort((a, b) => a.rect.top - b.rect.top);
    if (!sections.length) return null;
    const first = sections[0].rect;
    const last = sections[sections.length - 1].rect;
    return {
      first: (first.top + first.bottom) / 2,
      last: (last.top + last.bottom) / 2
    };
  }

  function applyOverviewPan() {
    const active = reveal && reveal.isOverview && reveal.isOverview();
    slidesRoot.style.marginLeft = active && overviewPanX ? `${overviewPanX}px` : '';
    slidesRoot.style.marginTop = active && overviewPanY ? `${overviewPanY}px` : '';
  }

  function syncOverviewRevealToPan() {
    if (!reveal || !reveal.isOverview || !reveal.isOverview() || pointerDrag) return;
    const target = nearestOverviewSlideToCenter();
    if (!target || (target.h === currentH && target.v === currentV)) return;
    currentH = target.h;
    currentV = target.v;
    syncOverviewClasses();
    syncOverviewControls();
  }

  function nearestOverviewSlideToCenter() {
    const viewportX = window.innerWidth / 2;
    const viewportY = window.innerHeight / 2;
    let best = null;
    document.querySelectorAll('section.asm-slide').forEach(section => {
      const rect = section.getBoundingClientRect();
      if (rect.width <= 1 || rect.height <= 1) return;
      const centerX = (rect.left + rect.right) / 2;
      const centerY = (rect.top + rect.bottom) / 2;
      const distance = Math.abs(centerX - viewportX) + Math.abs(centerY - viewportY) * 0.45;
      if (!best || distance < best.distance) {
        best = {
          h: Number(section.dataset.h || 0),
          v: Number(section.dataset.v || 0),
          distance
        };
      }
    });
    return best;
  }

  function syncOverviewClasses() {
    document.querySelectorAll('section.asm-slide').forEach(section => {
      const h = Number(section.dataset.h || 0);
      const v = Number(section.dataset.v || 0);
      section.classList.toggle('present', h === currentH && v === currentV);
      section.classList.toggle('past', h < currentH || (h === currentH && v < currentV));
      section.classList.toggle('future', h > currentH || (h === currentH && v > currentV));
    });
  }

  function syncOverviewControls() {
    const left = document.querySelector('.navigate-left');
    const right = document.querySelector('.navigate-right');
    const up = document.querySelector('.navigate-up');
    const down = document.querySelector('.navigate-down');
    const hasLeft = currentH > 0;
    const hasRight = currentH < deck.groups.length - 1;
    const group = deck.groups[currentH];
    const hasUp = currentV > 0;
    const hasDown = !!group && currentV < group.slides.length - 1;
    setControlEnabled(left, hasLeft);
    setControlEnabled(right, hasRight);
    setControlEnabled(up, hasUp);
    setControlEnabled(down, hasDown);
  }

  function setControlEnabled(el, enabled) {
    if (!el) return;
    el.classList.toggle('enabled', enabled);
    if (!enabled) el.classList.remove('highlight');
    el.setAttribute('aria-disabled', enabled ? 'false' : 'true');
  }

  function setOverviewScrollbarsVisible(visible) {
    if (overviewHScrollbar) overviewHScrollbar.hidden = !visible;
    if (overviewVScrollbar) overviewVScrollbar.hidden = !visible;
  }

  function setOverviewShieldVisible(visible) {
    if (!overviewEventShield) return;
    overviewEventShield.hidden = !visible;
    if (!visible) overviewEventShield.classList.remove('is-dragging');
  }

  function refreshOverviewScrollbars() {
    if (!reveal || !reveal.isOverview || !reveal.isOverview()) {
      setOverviewScrollbarsVisible(false);
      return;
    }
    setOverviewScrollbarsVisible(true);
    const xRange = overviewPanRangeX();
    const yRange = overviewPanRangeY();
    const xScrollable = Math.max(1, xRange.max - xRange.min);
    const yScrollable = Math.max(1, yRange.max - yRange.min);
    if (overviewHScrollContent && overviewHScrollbar) {
      overviewHScrollContent.style.width = `${Math.ceil(overviewHScrollbar.clientWidth + xScrollable)}px`;
    }
    if (overviewVScrollContent && overviewVScrollbar) {
      overviewVScrollContent.style.height = `${Math.ceil(overviewVScrollbar.clientHeight + yScrollable)}px`;
    }
    syncOverviewScrollbarPositions();
  }

  function syncOverviewScrollbarPositions() {
    if (!overviewHScrollbar || !overviewVScrollbar) return;
    const xRange = overviewPanRangeX();
    const yRange = overviewPanRangeY();
    suppressOverviewScrollbar = true;
    overviewHScrollbar.scrollLeft = Math.max(0, xRange.max - overviewPanX);
    overviewVScrollbar.scrollTop = Math.max(0, yRange.max - overviewPanY);
    requestAnimationFrame(() => {
      suppressOverviewScrollbar = false;
    });
  }

  function clearDropPreview() {
    if (overviewDropLine) overviewDropLine.style.display = 'none';
    if (overviewDropPlaceholder) {
      overviewDropPlaceholder.remove();
      overviewDropPlaceholder = null;
    }
    dropPreview = null;
  }

  function ensureOverviewDropLine() {
    if (!overviewDropLine) {
      overviewDropLine = document.createElement('div');
      overviewDropLine.className = 'overview-drop-line';
      document.body.appendChild(overviewDropLine);
    }
    return overviewDropLine;
  }

  function createOverviewDragGhost(section) {
    if (!section) return null;
    const rect = section.getBoundingClientRect();
    const ghost = section.cloneNode(true);
    ghost.classList.add('overview-drag-ghost');
    ghost.classList.remove('asm-slide', 'present', 'past', 'future', 'is-overview-selected', 'is-overview-drag-source');
    ghost.removeAttribute('data-slide-id');
    ghost.removeAttribute('data-h');
    ghost.removeAttribute('data-v');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
    const originalCanvases = Array.from(section.querySelectorAll('canvas'));
    const ghostCanvases = Array.from(ghost.querySelectorAll('canvas'));
    ghostCanvases.forEach((canvas, index) => {
      const original = originalCanvases[index];
      if (!original || !original.toDataURL) return;
      const image = document.createElement('img');
      try {
        image.src = original.toDataURL('image/png');
      } catch (err) {
        return;
      }
      image.className = canvas.className;
      image.style.cssText = canvas.style.cssText;
      image.style.width = `${canvas.getBoundingClientRect().width || rect.width}px`;
      image.style.height = `${canvas.getBoundingClientRect().height || rect.height}px`;
      canvas.replaceWith(image);
    });
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    document.body.appendChild(ghost);
    return ghost;
  }

  function updateOverviewDragGhost(drag, event) {
    if (!drag || !drag.ghost) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    drag.ghost.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  function clearOverviewDragVisuals(drag) {
    if (!drag) return;
    drag.sourceEl?.classList.remove('is-overview-drag-source');
    if (drag.ghost) drag.ghost.remove();
  }

  function flashHint(text) {
    const hint = document.getElementById('editHint');
    hint.textContent = 'ESC closes overview; drag slides to reorder.';
    clearTimeout(flashHint.timer);
    flashHint.timer = setTimeout(() => {
      hint.textContent = 'ESC closes overview; drag slides to reorder.';
    }, 1800);
  }

  function debugNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
  }

  function debugPreview(value, limit = 120) {
    if (typeof value !== 'string') return '';
    const preview = value.replace(/\s+/g, ' ').trim();
    return preview.length > limit ? `${preview.slice(0, limit)}...` : preview;
  }

  function debugAnimation(source = {}) {
    const animation = normalizeAnimationSettings(source);
    return {
      transitionId: animation.transitionId,
      fragmentEnabled: animation.fragmentEnabled,
      fragmentStyle: animation.fragmentStyle,
      fragmentIndex: animation.fragmentIndex
    };
  }

  function debugFabricObject(savedObject, runtimeObject, index, isSelected) {
    const source = runtimeObject || savedObject || {};
    return {
      index,
      type: source.type || savedObject?.type || 'unknown',
      textPreview: debugPreview(source.text || savedObject?.text),
      position: {
        left: debugNumber(source.left),
        top: debugNumber(source.top),
        angle: debugNumber(source.angle)
      },
      size: {
        width: debugNumber(source.width),
        height: debugNumber(source.height),
        radius: debugNumber(source.radius),
        scaleX: debugNumber(source.scaleX),
        scaleY: debugNumber(source.scaleY),
        strokeWidth: debugNumber(source.strokeWidth)
      },
      colors: {
        fill: source.fill ?? null,
        stroke: source.stroke ?? null
      },
      selected: !!isSelected,
      savedVisible: savedObject ? savedObject.visible !== false : null,
      runtimeVisible: runtimeObject ? runtimeObject.visible !== false : null,
      fragmentProxyId: source.fragmentProxyId || savedObject?.fragmentProxyId || '',
      animation: debugAnimation(source)
    };
  }

  function debugWidget(widget, index, layer) {
    const el = layer?.querySelector(`.slide-widget[data-widget-id="${widget.id}"]`);
    const style = el && getComputedStyle(el);
    return {
      index,
      id: widget.id,
      type: widget.type,
      position: {
        x: debugNumber(widget.x),
        y: debugNumber(widget.y)
      },
      size: {
        width: debugNumber(widget.w),
        height: debugNumber(widget.h),
        fontSize: debugNumber(widget.fontSize)
      },
      contentPreview: debugPreview(widget.content),
      focusLines: widget.type === 'code' ? widget.focusLines : undefined,
      showLineNumbers: widget.type === 'code' ? widget.showLineNumbers : undefined,
      selected: widget.id === selectedWidgetId || !!el?.classList.contains('is-selected'),
      runtime: el ? {
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        fragmentVisible: el.classList.contains('visible')
      } : null,
      animation: debugAnimation(widget)
    };
  }

  function getSelectedObjectInfo() {
    const revealIndices = reveal && reveal.getIndices ? reveal.getIndices() : null;
    const slide = getSlide();
    const context = {
      generatedAt: new Date().toISOString(),
      chapter: currentH + 1,
      slideInChapter: currentV + 1,
      h: currentH,
      v: currentV,
      slideId: slide?.id || null,
      revealIndices
    };
    if (!slide) return { context, selected: null };

    if (selectedWidgetId) {
      const widgets = normalizeWidgets(slide.widgets);
      const index = widgets.findIndex(widget => widget.id === selectedWidgetId);
      const widget = widgets[index];
      const layer = document.querySelector(`.widget-layer[data-slide-id="${slide.id}"]`);
      return {
        context,
        selected: widget ? {
          kind: 'widget',
          ...debugWidget(widget, index, layer)
        } : null
      };
    }

    const canvas = currentFabricCanvas();
    const runtimeObject = canvas?.getActiveObject();
    if (!runtimeObject || runtimeObject.type === 'activeSelection') {
      return {
        context,
        selected: runtimeObject?.type === 'activeSelection'
          ? { kind: 'fabric-active-selection', count: canvas.getActiveObjects().length }
          : null
      };
    }
    const runtimeObjects = canvas.getObjects();
    const savedObjects = (slide.canvas && slide.canvas.objects) || [];
    const index = runtimeObjects.indexOf(runtimeObject);
    const savedObject = savedObjects.find(obj => obj.fragmentProxyId && obj.fragmentProxyId === runtimeObject.fragmentProxyId)
      || savedObjects[index];
    return {
      context,
      selected: {
        kind: 'fabric',
        ...debugFabricObject(savedObject, runtimeObject, index, true)
      }
    };
  }

  function logSelectedObjectInfo() {
    return getSelectedObjectInfo();
  }

  window.asmDebugSelected = logSelectedObjectInfo;
  window.asmDebugSelectedText = () => JSON.stringify(getSelectedObjectInfo(), null, 2);
  window.asmTtsDebug = {
    parseScript: parseTtsScript,
    automaticScript: () => automaticTtsScript(getSlide()),
    narration: () => narrationForSlide(getSlide())
  };

  function updateDiagnostics() {
    const totalObjects = deck.groups.reduce((sum, group) => {
      return sum + group.slides.reduce((slideSum, slide) => {
        return slideSum + (((slide.canvas || {}).objects || []).length);
      }, 0);
    }, 0);
    const totalWidgets = deck.groups.reduce((sum, group) => {
      return sum + group.slides.reduce((slideSum, slide) => slideSum + normalizeWidgets(slide.widgets).length, 0);
    }, 0);
    const totalAlgorithmSlides = deck.groups.reduce((sum, group) => {
      return sum + group.slides.filter(slide => slide.kind === 'algorithm-animation').length;
    }, 0);
    document.body.dataset.slideCount = String(totalSlides());
    document.body.dataset.groupCount = String(deck.groups.length);
    document.body.dataset.fabricObjectCount = String(totalObjects);
    document.body.dataset.widgetCount = String(totalWidgets);
    document.body.dataset.algorithmSlideCount = String(totalAlgorithmSlides);
    document.body.dataset.historyIndex = String(historyIndex);
    document.body.dataset.historyLength = String(history.length);
  }

  function initReveal() {
    reveal = window.Reveal;
    reveal.initialize({
      hash: false,
      controls: true,
      progress: true,
      overview: true,
      center: false,
      width: SLIDE_W,
      height: SLIDE_H,
      margin: 0.05,
      transition: 'slide',
      scrollActivationWidth: null,
      keyboard: {
        37: () => reveal.left(),
        38: () => reveal.up(),
        39: () => reveal.right(),
        40: () => reveal.down()
      },
      plugins: [
        window.RevealNotes,
        window.RevealSearch,
        window.RevealHighlight,
        window.RevealMath && window.RevealMath.KaTeX
      ].filter(Boolean)
    }).then(() => {
      revealReady = true;
      document.body.dataset.revealPlugins = Object.keys(reveal.getPlugins ? reveal.getPlugins() : {}).join(',');
      reveal.on('slidechanged', event => {
        if (pointerDrag) return;
        currentH = event.indexh;
        currentV = event.indexv || 0;
        updateAlgorithmEditButton();
        refreshFabricFragmentVisibility();
        handleTtsSlideChanged();
      });
      reveal.on('autoanimate', animateSlideAutoTransition);
      reveal.on('fragmentshown', refreshFabricFragmentVisibility);
      reveal.on('fragmenthidden', refreshFabricFragmentVisibility);
      bindOverviewEvents();
      setTimeout(refreshRevealWidgets, 1200);
    });
  }

  async function bootstrap() {
    bindChrome();
    bindSlideDrop();
    bindCustomOverview();
    bindOverviewDrag();
    window.addEventListener('beforeunload', () => stopTtsPlayback());

    try {
      await loadCloudDeck();
    } catch (err) {
      console.error('Cloud deck initialization failed', err);
      if (deckUid || shareToken) return;
    }

    renderDeck();
    updateAlgorithmEditButton();
    saveDeck({ history: false, cloud: false });
    pushHistorySnapshot();
    initReveal();
  }

  bootstrap();
})();
