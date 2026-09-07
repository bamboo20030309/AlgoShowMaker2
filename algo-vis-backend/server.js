// server.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { performance } = require('perf_hooks');
//引入 crypto uuid
const { randomUUID: uuidv4 } = require('crypto');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');            //資料庫溝通套件
const bcrypt = require('bcryptjs');            //密碼加密套件
const jwt = require('jsonwebtoken');        //webtoken套件
const nodemailer = require('nodemailer');          //重置密碼email套件
const { analyzeSource, buildSyntaxTree, findFrameDirectives, instrumentSource } = require('./trace-instrumenter');
const TraceViewSource = require('./public/trace-view-source');
const TraceProvenance = require('./public/trace-provenance');

// 優先讀取環境變數，如果沒讀到才用後面的預設值
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';

// 設定連線字串
// Docker 會自動幫你把 'mongo' 解析成該容器的 IP 位址。
const MONGO_URI = process.env.MONGO_URI || 'mongodb://mongo:27017/algo_vis_db';

// 開始連線
mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB 連線成功！'))
  .catch(err => console.error('MongoDB 連線失敗:', err));

// User Schema
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true }, // 帳號 (唯一)
  password: { type: String, required: true },               // 密碼 (加密後)
  // 密碼重置用的 Token 與 過期時間
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date },
  preferences: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  created_at: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);

const SlideDeckSchema = new mongoose.Schema({
  user_uid: { type: String, required: true, index: true },
  deck_uid: { type: String, required: true, unique: true },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 120,
    default: '未命名投影片'
  },
  deck: { type: mongoose.Schema.Types.Mixed, required: true },
  cover_thumbnail: { type: String, default: '' },
  slide_count: { type: Number, default: 0 },
  share_mode: {
    type: String,
    enum: ['private', 'view', 'edit'],
    default: 'private'
  },
  share_view_token: {
    type: String,
    unique: true,
    sparse: true,
    select: false
  },
  share_edit_token: {
    type: String,
    unique: true,
    sparse: true,
    select: false
  },
  format: { type: String, default: 'AlgoShowMaker.slides' },
  version: { type: String, default: 'AV_V4.3' },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

SlideDeckSchema.index({ user_uid: 1, updated_at: -1 });

const SlideDeck = mongoose.model('SlideDeck', SlideDeckSchema);

// 設定 Email 寄送器 (Transporter)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER || 'your-email@gmail.com',
    pass: process.env.SMTP_PASS || 'your-app-password'
  }
});

const BLACKLIST_KEYWORDS = [
  // 1. 執行與程序控制
  'system', 'popen', 'exec', 'fork', 'clone', 'wait', 'kill', 'raise',

  // 2. 檔案讀寫 (Stream & C-style)
  'fstream', 'ifstream', 'ofstream', 'fstream',
  'fopen', 'freopen', 'fdopen', 'fflush',

  // 3. 檔案操作 (刪除、移動、權限)
  'remove', 'rename', 'unlink', 'mkdir', 'rmdir', 'chmod', 'chown', 'stat',

  // 4. 系統與網路
  'getenv', 'setenv', 'putenv', 'ptrace', 'socket',

  // 5. 危險標頭檔 (include)
  '<unistd.h>', '<fcntl.h>', '<sys/', '<windows.h>', '<signal.h>'
];


// 1. 先初始化 app (非常重要，必須在 app.use 之前！)
const app = express();
const PORT = process.env.PORT || 3000;

// 2. 設定限制器
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 分鐘內
  max: 20, // 每個 IP 最多只能送 20 次請求
  message: { error: '請求過於頻繁，請稍後再試' },
  skip: () => process.env.ASM_REGRESSION === '1'
});

// 3. 套用限制器到 /compile
app.use('/compile', limiter);

// 設定目錄路徑
const SAMPLE_DIR = path.join(__dirname, 'tmp', 'algorithm_sample');
// 確保暫存目錄存在
const TEMP_DIR = path.join(__dirname, 'tmp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR);
}

let debugMessages = [];

// === 限制設定 ===
const LIMITS = {
  TIME_MS: 5000,
  MEMORY_MB: 256,
  OUTPUT_SIZE: 64 * 1024,
};

// 記錄 debug 訊息
function logDebug(msg, extra = {}) {
  debugMessages.push({
    time: new Date().toISOString(),
    msg,
    ...extra,
  });
}

// 設定中間件
app.use('/vendor/reveal', express.static(path.join(__dirname, 'node_modules', 'reveal.js', 'dist')));
app.use('/vendor/fabric', express.static(path.join(__dirname, 'node_modules', 'fabric', 'dist')));
app.use('/vendor/iro', express.static(path.join(__dirname, 'node_modules', '@jaames', 'iro', 'dist')));
app.use('/vendor/ace', express.static(path.join(__dirname, 'node_modules', 'ace-builds', 'src-min-noconflict')));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '5mb' }));

app.post('/trace/analyze', limiter, (req, res) => {
  const code = req.body?.code;
  if (typeof code !== 'string') return res.status(400).json({ error: '程式碼必須是字串' });
  if (code.length > 64 * 1024) return res.status(400).json({ error: '程式碼不可超過 64KB' });
  try {
    const analysis = analyzeSource(code);
    const frameDirectives = findFrameDirectives(code, analysis);
    res.json({
      success: true,
      frameDirectives: frameDirectives.map(directive => ({
        line: directive.line,
        name: directive.name || '',
        objectId: directive.objectId || '',
        names: directive.names,
        variableIds: directive.variables.map(variable => variable.id),
        captureOnlyVariableIds: directive.captureOnlyVariableIds || [],
        bindings: directive.bindings || [],
        objectBinding: directive.objectBinding || null,
        renderer: directive.renderer || '',
        rendererOptions: directive.rendererOptions || {},
        when: directive.when || null,
        texts: directive.texts || [],
        styles: directive.styles || [],
        segments: directive.segments || []
      })),
      variables: analysis.variables.map(variable => ({
        id: variable.id,
        name: variable.name,
        cppType: variable.type,
        kind: variable.kind,
        line: variable.line,
        functionName: variable.functionName,
        supported: variable.supported
      }))
    });
  } catch (err) {
    console.error('Failed to analyze trace source:', err);
    res.status(400).json({ error: `無法分析 C++ 程式碼：${err.message}` });
  }
});

app.post('/syntax-tree', limiter, (req, res) => {
  const code = req.body?.code;
  if (typeof code !== 'string') return res.status(400).json({ error: '程式碼必須是字串' });
  if (code.length > 64 * 1024) return res.status(400).json({ error: '程式碼不可超過 64KB' });
  try {
    res.json({ success: true, ...buildSyntaxTree(code) });
  } catch (error) {
    res.status(400).json({ error: error.message || '無法建立語法樹' });
  }
});

// ==========================================
// 會員系統 API
// ==========================================

// 1. 註冊 (Register)
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;

  // 簡單驗證
  if (!username || !password) {
    return res.status(400).json({ error: '請輸入帳號和密碼' });
  }

  // 檢查長度 (例如：帳號至少 5 碼，密碼至少 8 碼)
  if (username.length < 5) {
    return res.status(400).json({ error: '帳號長度過短 (至少需 5 個字元)' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: '密碼長度過短 (至少需 8 個字元)' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(username)) {
    return res.status(400).json({ error: '帳號格式錯誤，請使用有效的 Email (例如: user@gmail.com)' });
  }

  try {
    // 檢查帳號是否已存在
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ error: '此帳號已被註冊' });
    }

    // 密碼加密！ (Salt Rounds = 10)
    const hashedPassword = await bcrypt.hash(password, 10);

    // 建立新用戶
    const newUser = await User.create({
      username,
      password: hashedPassword
    });

    res.json({ success: true, message: '註冊成功！', user_uid: newUser._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// 2. 登入 (Login)
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    // 找用戶
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ error: '帳號或密碼錯誤' });
    }

    // 比對密碼 (將輸入的密碼加密後跟資料庫的比對)
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: '帳號或密碼錯誤' });
    }

    // 發放 JWT 通行證
    // 裡面藏了 user_id，有效期限 1 天
    const token = jwt.sign(
      { id: user._id, username: user.username },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.json({ success: true, token, username: user.username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// 忘記密碼 (寄送重置信)
app.post('/api/auth/forgot-password', async (req, res) => {
  const { username } = req.body;

  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ error: '找不到此帳號 (Email)' });
    }

    // 1. 產生 Token (有效期限 1 小時)
    const token = uuidv4();
    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    // 2. 建立重置連結 (假設前端跑在 localhost:3000)
    // 使用者點這個連結會帶上 ?reset_token=xxxxx
    // 優先讀取環境變數，如果沒設定就預設用 localhost
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const resetLink = `${baseUrl}/?reset_token=${token}`;

    // 3. 寄信
    const mailOptions = {
      from: 'AlgoShowMaker <no-reply@algoshowmaker.com>',
      to: user.username, // 假設 username 就是 email
      subject: 'AlgoShowMaker 密碼重置請求',
      text: `您好，請點擊以下連結重置您的密碼：\n\n${resetLink}\n\n(連結 1 小時內有效，若非本人操作請忽略)`
    };

    await transporter.sendMail(mailOptions);

    res.json({ success: true, message: '重置信已寄出，請檢查您的信箱！' });

  } catch (err) {
    console.error('寄信失敗:', err);
    res.status(500).json({ error: '寄信失敗，請稍後再試' });
  }
});

// 重置密碼 (設定新密碼)
app.post('/api/auth/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;

  try {
    // 1. 驗證 Token 是否存在且沒過期 ($gt = greater than)
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ error: '連結無效或已過期，請重新申請' });
    }

    // 2. 更新密碼
    if (newPassword.length < 8) {
      return res.status(400).json({ error: '新密碼長度過短 (需 8 碼以上)' });
    }

    user.password = await bcrypt.hash(newPassword, 10);

    // 3. 清除 Token，避免重複使用
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    await user.save();

    res.json({ success: true, message: '密碼重置成功！請使用新密碼登入' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// 3. 驗證身分的中間件 (Middleware)
// 用來保護需要登入才能使用的路由
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  // 格式通常是: "Bearer <token>"
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: '請先登入' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: '憑證無效或過期' });

    // 驗證成功，把用戶資料掛在 req 上，後面的路由就可以用了
    req.user = user;
    next();
  });
};

// 範例：取得目前登入使用者的資訊 (受保護路由)
app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({
    message: '驗證成功',
    user: req.user
  });
});

const EVENT_SETTING_TYPES = [
  'declare', 'read', 'write', 'assign', 'compare', 'condition', 'swap',
  'call', 'function-enter', 'function-exit'
];
const DEFAULT_EVENT_GAP_MS = 500;

function cleanEventSettings(value = {}) {
  const cleanFlags = source => Object.fromEntries(EVENT_SETTING_TYPES.flatMap(type => (
    typeof source?.[type] === 'boolean' ? [[type, source[type]]] : []
  )));
  return {
    gapMs: Number.isFinite(Number(value.gapMs))
      ? Math.max(0, Math.min(2000, Number(value.gapMs)))
      : DEFAULT_EVENT_GAP_MS,
    autoFixedEnabled: typeof value.autoFixedEnabled === 'boolean'
      ? value.autoFixedEnabled
      : (typeof value.defaultEnabled?.fixed === 'boolean' ? value.defaultEnabled.fixed : true),
    defaultEnabled: cleanFlags(value.defaultEnabled),
    timelineTypes: cleanFlags(value.timelineTypes)
  };
}

app.get('/api/user/preferences/event-settings', authenticateToken, async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.user.id }).select('preferences').lean();
    if (!user) return res.status(404).json({ error: '找不到使用者' });
    res.json({ success: true, eventSettings: cleanEventSettings(user.preferences?.eventSettings || { gapMs: DEFAULT_EVENT_GAP_MS }) });
  } catch (err) {
    console.error('Failed to load event settings:', err);
    res.status(500).json({ error: '無法讀取事件設定' });
  }
});

app.put('/api/user/preferences/event-settings', authenticateToken, async (req, res) => {
  const eventSettings = cleanEventSettings(req.body?.eventSettings || {});
  try {
    const user = await User.findOneAndUpdate(
      { _id: req.user.id },
      { $set: { 'preferences.eventSettings': eventSettings } },
      { new: true }
    ).select('_id');
    if (!user) return res.status(404).json({ error: '找不到使用者' });
    res.json({ success: true, eventSettings });
  } catch (err) {
    console.error('Failed to save event settings:', err);
    res.status(500).json({ error: '無法儲存事件設定' });
  }
});

function countDeckSlides(deck) {
  if (!deck || !Array.isArray(deck.groups)) return 0;
  return deck.groups.reduce((total, group) => {
    return total + (Array.isArray(group?.slides) ? group.slides.length : 0);
  }, 0);
}

function cleanDeckTitle(title) {
  const value = String(title || '').trim();
  return value.slice(0, 120) || '未命名投影片';
}

function cleanCoverThumbnail(value) {
  if (typeof value !== 'string') return '';
  const thumbnail = value.trim();
  if (!/^data:image\/(?:jpeg|png|webp);base64,/i.test(thumbnail)) return '';
  return thumbnail.length <= 500000 ? thumbnail : '';
}

// List metadata only. The large Fabric canvas payload is fetched when a deck is opened.
app.get('/api/slides', authenticateToken, async (req, res) => {
  try {
    const slides = await SlideDeck.find({ user_uid: req.user.id })
      .select('deck_uid title cover_thumbnail slide_count format version created_at updated_at')
      .sort({ updated_at: -1 })
      .lean();
    res.json({ success: true, slides });
  } catch (err) {
    console.error('Failed to list slide decks:', err);
    res.status(500).json({ error: '無法讀取投影片，請稍後再試' });
  }
});

app.post('/api/slides', authenticateToken, async (req, res) => {
  const body = req.body || {};
  const deck = body.deck && typeof body.deck === 'object'
    ? body.deck
    : { groups: [] };

  try {
    const slideDeck = await SlideDeck.create({
      user_uid: req.user.id,
      deck_uid: uuidv4(),
      title: cleanDeckTitle(body.title),
      deck,
      cover_thumbnail: cleanCoverThumbnail(body.cover_thumbnail),
      slide_count: countDeckSlides(deck)
    });

    res.status(201).json({
      success: true,
      slide: {
        deck_uid: slideDeck.deck_uid,
        title: slideDeck.title,
        slide_count: slideDeck.slide_count,
        created_at: slideDeck.created_at,
        updated_at: slideDeck.updated_at
      }
    });
  } catch (err) {
    console.error('Failed to create slide deck:', err);
    res.status(500).json({ error: '無法建立投影片，請稍後再試' });
  }
});

function shareResponse(slide) {
  return {
    mode: slide.share_mode || 'private',
    view_token: slide.share_view_token || null,
    edit_token: slide.share_edit_token || null
  };
}

app.get('/api/slides/:deck_uid/share', authenticateToken, async (req, res) => {
  try {
    const slide = await SlideDeck.findOne({
      deck_uid: req.params.deck_uid,
      user_uid: req.user.id
    }).select('share_mode +share_view_token +share_edit_token');

    if (!slide) {
      return res.status(404).json({ error: '找不到這份投影片' });
    }

    res.json({ success: true, share: shareResponse(slide) });
  } catch (err) {
    console.error('Failed to get slide sharing settings:', err);
    res.status(500).json({ error: '無法讀取分享設定，請稍後再試' });
  }
});

app.put('/api/slides/:deck_uid/share', authenticateToken, async (req, res) => {
  const mode = String(req.body?.mode || '');
  if (!['private', 'view', 'edit'].includes(mode)) {
    return res.status(400).json({ error: '分享權限設定無效' });
  }

  try {
    const slide = await SlideDeck.findOne({
      deck_uid: req.params.deck_uid,
      user_uid: req.user.id
    }).select('share_mode +share_view_token +share_edit_token');

    if (!slide) {
      return res.status(404).json({ error: '找不到這份投影片' });
    }

    slide.share_mode = mode;
    if (mode === 'private') {
      slide.share_view_token = undefined;
      slide.share_edit_token = undefined;
    } else if (mode === 'view') {
      slide.share_view_token = slide.share_view_token || uuidv4();
      slide.share_edit_token = undefined;
    } else {
      slide.share_view_token = slide.share_view_token || uuidv4();
      slide.share_edit_token = slide.share_edit_token || uuidv4();
    }
    await slide.save();

    res.json({ success: true, share: shareResponse(slide) });
  } catch (err) {
    console.error('Failed to update slide sharing settings:', err);
    res.status(500).json({ error: '無法更新分享設定，請稍後再試' });
  }
});

app.get('/api/slides/:deck_uid', authenticateToken, async (req, res) => {
  try {
    const slide = await SlideDeck.findOne({
      deck_uid: req.params.deck_uid,
      user_uid: req.user.id
    }).lean();

    if (!slide) {
      return res.status(404).json({ error: '找不到這份投影片' });
    }

    res.json({ success: true, slide });
  } catch (err) {
    console.error('Failed to get slide deck:', err);
    res.status(500).json({ error: '無法讀取投影片，請稍後再試' });
  }
});

app.put('/api/slides/:deck_uid', authenticateToken, async (req, res) => {
  const body = req.body || {};
  const updates = {};
  let contentChanged = false;

  if (Object.prototype.hasOwnProperty.call(body, 'title')) {
    updates.title = cleanDeckTitle(body.title);
    contentChanged = true;
  }
  if (body.deck && typeof body.deck === 'object') {
    updates.deck = body.deck;
    updates.slide_count = countDeckSlides(body.deck);
    contentChanged = true;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'cover_thumbnail')) {
    updates.cover_thumbnail = cleanCoverThumbnail(body.cover_thumbnail);
  }
  if (contentChanged) updates.updated_at = new Date();

  try {
    const slide = await SlideDeck.findOneAndUpdate(
      { deck_uid: req.params.deck_uid, user_uid: req.user.id },
      { $set: updates },
      { new: true, runValidators: true }
    ).select('deck_uid title cover_thumbnail slide_count format version created_at updated_at');

    if (!slide) {
      return res.status(404).json({ error: '找不到這份投影片' });
    }

    res.json({ success: true, slide });
  } catch (err) {
    console.error('Failed to update slide deck:', err);
    res.status(500).json({ error: '無法儲存投影片，請稍後再試' });
  }
});

app.get('/api/shared-slides/:share_token', async (req, res) => {
  try {
    const token = req.params.share_token;
    const slide = await SlideDeck.findOne({
      $or: [
        { share_view_token: token },
        { share_edit_token: token }
      ]
    }).select('title deck cover_thumbnail slide_count updated_at share_mode +share_view_token +share_edit_token');

    const canView = slide
      && slide.share_view_token === token
      && ['view', 'edit'].includes(slide.share_mode);
    const canEdit = slide
      && slide.share_edit_token === token
      && slide.share_mode === 'edit';

    if (!canView && !canEdit) {
      return res.status(404).json({ error: '分享連結無效或已停止分享' });
    }

    res.json({
      success: true,
      slide: {
        title: slide.title,
        deck: slide.deck,
        cover_thumbnail: slide.cover_thumbnail,
        slide_count: slide.slide_count,
        updated_at: slide.updated_at
      },
      access: canEdit ? 'edit' : 'view'
    });
  } catch (err) {
    console.error('Failed to get shared slide deck:', err);
    res.status(500).json({ error: '無法讀取分享的投影片，請稍後再試' });
  }
});

app.put('/api/shared-slides/:share_token', async (req, res) => {
  const body = req.body || {};
  const updates = {};

  if (Object.prototype.hasOwnProperty.call(body, 'title')) {
    updates.title = cleanDeckTitle(body.title);
  }
  if (body.deck && typeof body.deck === 'object') {
    updates.deck = body.deck;
    updates.slide_count = countDeckSlides(body.deck);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'cover_thumbnail')) {
    updates.cover_thumbnail = cleanCoverThumbnail(body.cover_thumbnail);
  }
  if (!Object.keys(updates).length) {
    return res.status(400).json({ error: '沒有可儲存的內容' });
  }
  updates.updated_at = new Date();

  try {
    const slide = await SlideDeck.findOneAndUpdate(
      {
        share_edit_token: req.params.share_token,
        share_mode: 'edit'
      },
      { $set: updates },
      { new: true, runValidators: true }
    ).select('title slide_count updated_at');

    if (!slide) {
      return res.status(403).json({ error: '這個分享連結沒有編輯權限' });
    }

    res.json({ success: true, slide });
  } catch (err) {
    console.error('Failed to update shared slide deck:', err);
    res.status(500).json({ error: '無法儲存分享的投影片，請稍後再試' });
  }
});

app.delete('/api/slides/:deck_uid', authenticateToken, async (req, res) => {
  try {
    const slide = await SlideDeck.findOneAndDelete({
      deck_uid: req.params.deck_uid,
      user_uid: req.user.id
    });

    if (!slide) {
      return res.status(404).json({ error: '找不到這份投影片' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete slide deck:', err);
    res.status(500).json({ error: '無法刪除投影片，請稍後再試' });
  }
});

/**
 * 讀取 Linux /proc/<pid>/status
 */
function readProcStatus(pid) {
  try {
    const statusPath = `/proc/${pid}/status`;
    const text = fs.readFileSync(statusPath, 'utf8');

    const getKB = (key) => {
      const m = text.match(new RegExp(`^${key}:\\s+(\\d+)\\s+kB$`, 'm'));
      return m ? Number(m[1]) : null;
    };

    return {
      rssKB: getKB('VmRSS'),
      hwmKB: getKB('VmHWM'),
      vmsKB: getKB('VmSize'),
    };
  } catch (e) {
    return null;
  }
}

/**
 * 記憶體輪詢取樣
 */
function startMemorySampler(childPid, intervalMs = 80) {
  let peakRssKB = 0;
  let peakHwmKB = 0;
  let peakVmsKB = 0;

  const first = readProcStatus(childPid);
  if (first) {
    if (typeof first.rssKB === 'number') peakRssKB = Math.max(peakRssKB, first.rssKB);
    if (typeof first.hwmKB === 'number') peakHwmKB = Math.max(peakHwmKB, first.hwmKB);
    if (typeof first.vmsKB === 'number') peakVmsKB = Math.max(peakVmsKB, first.vmsKB);
  } else {
    logDebug('MEM: /proc 讀取失敗或非 Linux，無法取用 child 記憶體資訊', { pid: childPid });
  }

  const timer = setInterval(() => {
    const info = readProcStatus(childPid);
    if (!info) return;

    if (typeof info.rssKB === 'number') peakRssKB = Math.max(peakRssKB, info.rssKB);
    if (typeof info.hwmKB === 'number') peakHwmKB = Math.max(peakHwmKB, info.hwmKB);
    if (typeof info.vmsKB === 'number') peakVmsKB = Math.max(peakVmsKB, info.vmsKB);
  }, intervalMs);

  return {
    stop: () => clearInterval(timer),
    getPeak: () => ({ peakRssKB, peakHwmKB, peakVmsKB }),
  };
}

function defaultTraceRenderer(kind) {
  if (kind === 'matrix') return 'original-matrix';
  if (kind === 'stack') return 'original-stack';
  if (kind === 'queue') return 'original-queue';
  if (['sequence', 'set', 'map'].includes(kind)) return 'original-array';
  if (kind === 'scalar' || kind === 'string') return 'original-cell';
  if (kind === 'node-graph') return 'graph';
  if (kind === 'coordinate-system') return 'coordinate-system';
  return 'object';
}

function autoSliceTraceFrames(frames) {
  if (frames.length <= 2) return frames;
  return frames.filter((frame, index) => {
    if (index === 0 || index === frames.length - 1) return true;
    const hasWatchedEvent = (frame.events || []).some(event =>
      (event.targets || []).some(target => !!target.variableId));
    if (hasWatchedEvent) return true;
    return JSON.stringify(frames[index - 1]?.state || {}) !== JSON.stringify(frame.state || {});
  });
}

function materializeKeepSnapshots(frames) {
  const snapshots = [];
  const activeSnapshotIds = [];
  const counts = new Map();
  const usedObjectIds = new Set(frames.flatMap(frame => [
    ...Object.keys(frame.state || {}),
    String(frame.source?.objectId || '').trim()
  ]).filter(Boolean));
  function allocateObjectId(requested) {
    const base = String(requested || 'Snapshot').trim() || 'Snapshot';
    let id = base;
    let suffix = 1;
    while (usedObjectIds.has(id)) {
      id = `${base}_${suffix}`;
      suffix += 1;
    }
    usedObjectIds.add(id);
    return id;
  }
  function variableRenderState(frame, variableId, identity = '') {
    if (!frame) return null;
    let sourceVariableId = frame.state?.[variableId] ? variableId : '';
    if (!sourceVariableId && identity) {
      sourceVariableId = Object.entries(frame.state || {})
        .find(([, entry]) => String(entry?.identity || '') === String(identity))?.[0] || '';
    }
    if (!sourceVariableId) return null;
    const binding = (frame.objectBindings || []).find(item => (
      item?.sourceVariableId === sourceVariableId
    ));
    return {
      frameId: frame.id,
      sourceVariableId,
      renderer: String(frame.renderers?.[sourceVariableId] || ''),
      rendererOptions: JSON.parse(JSON.stringify(frame.rendererOptions?.[sourceVariableId] || {})),
      binding: binding ? JSON.parse(JSON.stringify(binding)) : null,
      styles: (frame.styles || [])
        .filter(style => style.targetVariableId === sourceVariableId)
        .map(style => JSON.parse(JSON.stringify(style)))
    };
  }
  const materializedFrames = frames.map((frame, frameIndex) => {
    let keepLastFocus = false;
    (frame.events || []).filter(event => event.type === 'keep').forEach(event => {
      if (event.mode === 'last') {
        const previousFrame = frames[frameIndex - 1];
        if (!previousFrame) return;
        const preserveStyle = event.preserveStyle !== false;
        const count = (counts.get('$frame') || 0) + 1;
        counts.set('$frame', count);
        const id = `snapshot:frame:${count}`;
        const objectId = allocateObjectId(event.label || 'Frame');
        snapshots.push({
          id,
          objectId,
          kind: 'frame',
          createdFrameId: frame.id,
          sourceFrameId: previousFrame.id,
          label: objectId,
          binding: event.binding ? JSON.parse(JSON.stringify(event.binding)) : null,
          frame: {
            ...JSON.parse(JSON.stringify(previousFrame)),
            renderers: JSON.parse(JSON.stringify(previousFrame.renderers || {})),
            rendererOptions: JSON.parse(JSON.stringify(previousFrame.rendererOptions || {})),
            events: (previousFrame.events || []).filter(item => item.type !== 'keep'),
            texts: [],
            styles: preserveStyle ? JSON.parse(JSON.stringify(previousFrame.styles || [])) : [],
            snapshotIds: []
          }
        });
        activeSnapshotIds.push(id);
        keepLastFocus = true;
        return;
      }
      const target = (event.targets || []).find(item => item.variableId);
      const variableId = target?.variableId;
      const entry = variableId ? frame.state?.[variableId] : null;
      const capturedData = event.payload?.data;
      if (!variableId || (!entry && capturedData == null)) return;
      const identity = String(entry?.identity || '');
      const renderState = variableRenderState(frames[frameIndex - 1], variableId, identity)
        || variableRenderState(frame, variableId, identity)
        || { frameId: '', sourceVariableId: variableId, renderer: '', rendererOptions: {}, binding: null, styles: [] };
      const preserveStyle = event.preserveStyle !== false;
      const count = (counts.get(variableId) || 0) + 1;
      counts.set(variableId, count);
      const id = `snapshot:${variableId}:${count}`;
      const labelBase = String(event.label || event.name || entry.name || 'Snapshot').trim() || 'Snapshot';
      const objectId = allocateObjectId(labelBase);
      snapshots.push({
        id,
        objectId,
        sourceVariableId: variableId,
        sourceFrameId: renderState.frameId,
        createdFrameId: frame.id,
        label: objectId,
        binding: event.binding
          ? JSON.parse(JSON.stringify(event.binding))
          : renderState.binding,
        data: JSON.parse(JSON.stringify(capturedData ?? entry.data)),
        renderer: renderState.renderer,
        rendererOptions: renderState.rendererOptions,
        styles: preserveStyle ? renderState.styles : []
      });
      activeSnapshotIds.push(id);
    });
    return {
      ...frame,
      events: (frame.events || []).filter(event => event.type !== 'keep'),
      snapshotIds: [...activeSnapshotIds],
      keepLastFocus
    };
  });
  return { frames: materializedFrames, snapshots };
}

const FIXED_EVENT_KINDS = new Set(['sequence', 'stack', 'queue', 'set']);
const FIXED_ACCESS_EVENTS = new Set(['read', 'write', 'assign', 'swap']);

function traceScalarValue(data) {
  if (!data || typeof data !== 'object') return data;
  return Object.prototype.hasOwnProperty.call(data, 'value') ? data.value : data;
}

function resolveTraceIndexExpression(frame, expression) {
  const source = String(expression ?? '').trim();
  if (!source) return null;
  const tokens = [];
  let cursor = 0;
  while (cursor < source.length) {
    if (/\s/.test(source[cursor])) {
      cursor += 1;
      continue;
    }
    const number = source.slice(cursor).match(/^\d+(?:\.\d+)?/);
    if (number) {
      tokens.push({ type: 'number', value: number[0] });
      cursor += number[0].length;
      continue;
    }
    const identifier = source.slice(cursor).match(/^[A-Za-z_]\w*/);
    if (identifier) {
      tokens.push({ type: 'identifier', value: identifier[0] });
      cursor += identifier[0].length;
      continue;
    }
    if ('+-*/%()'.includes(source[cursor])) {
      tokens.push({ type: 'operator', value: source[cursor] });
      cursor += 1;
      continue;
    }
    return null;
  }

  let position = 0;
  const invalid = Symbol('invalid-trace-index');
  const peek = value => tokens[position]?.value === value;
  const consume = value => {
    if (value && !peek(value)) return null;
    return tokens[position++] || null;
  };

  function parsePrimary() {
    if (peek('(')) {
      consume('(');
      const value = parseAdditive();
      if (value === invalid || !consume(')')) return invalid;
      return value;
    }
    const token = tokens[position];
    if (!token) return invalid;
    if (token.type === 'number') {
      position += 1;
      return Number(token.value);
    }
    if (token.type !== 'identifier') return invalid;
    position += 1;
    const match = Object.entries(frame.state || {}).find(([, entry]) => entry?.name === token.value);
    if (!match) return invalid;
    return traceScalarValue(match[1]?.data);
  }

  function parseUnary() {
    if (peek('+')) {
      consume('+');
      return Number(parseUnary());
    }
    if (peek('-')) {
      consume('-');
      return -Number(parseUnary());
    }
    return parsePrimary();
  }

  function parseMultiplicative() {
    let value = parseUnary();
    while (peek('*') || peek('/') || peek('%')) {
      const operator = consume().value;
      const right = parseUnary();
      if (value === invalid || right === invalid) return invalid;
      if (operator === '*') value = Number(value) * Number(right);
      else if (operator === '/') value = Number(value) / Number(right);
      else value = Number(value) % Number(right);
    }
    return value;
  }

  function parseAdditive() {
    let value = parseMultiplicative();
    while (peek('+') || peek('-')) {
      const operator = consume().value;
      const right = parseMultiplicative();
      if (value === invalid || right === invalid) return invalid;
      value = operator === '+' ? Number(value) + Number(right) : Number(value) - Number(right);
    }
    return value;
  }

  const value = parseAdditive();
  if (value === invalid || position !== tokens.length || !Number.isInteger(Number(value))) return null;
  return Number(value);
}

function resolveFrameRendererOptions(frame, directive) {
  const source = directive?.rendererOptions;
  if (!source || typeof source !== 'object') return {};
  const options = {};

  if (source.range) {
    const start = resolveTraceIndexExpression(frame, source.range.startExpression);
    const end = resolveTraceIndexExpression(frame, source.range.endExpression);
    if (start != null && end != null) options.range = [start, end + 1];
  }
  if (source.columns) {
    const columns = resolveTraceIndexExpression(frame, source.columns.expression);
    if (columns != null && columns > 0) options.columns = columns;
  }
  if (source.labels) {
    const format = source.labels.indexFormat || 'none';
    if (source.labels.showValue === false && format === 'decimal') options.indexMode = 2;
    else if (format === 'decimal') options.indexMode = 1;
    else if (format === 'binary') options.indexMode = 3;
    else if (format === 'binary-padded') options.indexMode = 4;
    else options.indexMode = 0;
  }
  return options;
}

function appendFixedEvents(frames, variables = []) {
  if (!Array.isArray(frames) || !frames.length) return frames;
  const variableKinds = new Map(variables.map(variable => [variable.id, variable.kind]));
  const accesses = new Map();

  frames.forEach(frame => {
    frame.events = (frame.events || []).filter(event => event.type !== 'fixed');
  });

  frames.forEach((frame, frameIndex) => {
    (frame.events || []).filter(event => FIXED_ACCESS_EVENTS.has(event.type)).forEach(event => {
      (event.targets || []).forEach(target => {
        const variableId = target.variableId;
        const entry = frame.state?.[variableId];
        const data = entry?.data;
        const kind = variableKinds.get(variableId) || data?.kind;
        if (!variableId || !FIXED_EVENT_KINDS.has(kind) || !Array.isArray(data?.items)) return;
        const index = target.resolvedIndex != null
          && target.resolvedIndex !== ''
          && Number.isInteger(Number(target.resolvedIndex))
          ? Number(target.resolvedIndex)
          : resolveTraceIndexExpression(frame, target.indexExpression);
        if (index == null || index < 0 || index >= data.items.length) return;
        // References in main, heap_sort and recursive heapify calls have
        // different source IDs but the same runtime identity. Fixed means the
        // last use of the actual object, not the last use of one alias.
        const runtimeIdentity = String(entry?.identity || '');
        const objectIdentity = runtimeIdentity || `variable:${variableId}`;
        const key = `${objectIdentity}#${index}`;
        const access = accesses.get(key) || {
          variableId,
          variableName: entry.name || variableId,
          runtimeIdentity,
          objectIdentity,
          index,
          lastAccessFrameIndex: frameIndex,
          lastEventId: event.id || '',
          lastEventOrder: Number(event.order) || 0
        };
        access.variableId = variableId;
        access.variableName = entry.name || variableId;
        access.lastAccessFrameIndex = frameIndex;
        access.lastEventId = event.id || access.lastEventId;
        access.lastEventOrder = Number.isFinite(Number(event.order))
          ? Number(event.order)
          : access.lastEventOrder;
        accesses.set(key, access);
      });
    });
  });

  const groups = new Map();
  accesses.forEach(access => {
    const key = `${access.lastAccessFrameIndex}#${access.objectIdentity}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(access);
  });

  groups.forEach(group => {
    group.sort((left, right) => left.index - right.index);
    const fixedFrameIndex = group[0].lastAccessFrameIndex;
    const frame = frames[fixedFrameIndex];
    const lastAccess = group.reduce((latest, access) => (
      access.lastEventOrder >= latest.lastEventOrder ? access : latest
    ), group[0]);
    const stableVariableId = String(lastAccess.variableId || '').replace(/@\d+$/, '');
    const signature = `fixed:auto:${stableVariableId}:${group.map(access => access.index).join(',')}`;
    frame.events ||= [];
    frame.events.push({
      id: signature,
      type: 'fixed',
      signature,
      autoFixed: true,
      stateChange: true,
      persistent: true,
      runtimeIdentity: group[0].runtimeIdentity,
      line: Number(frame.source?.line) || 0,
      order: lastAccess.lastEventOrder + 0.001,
      phase: 'after',
      afterEventId: lastAccess.lastEventId,
      targets: group.map(access => ({
        role: 'target',
        variableId: access.variableId,
        runtimeIdentity: access.runtimeIdentity,
        expression: `${access.variableName}[${access.index}]`,
        indexExpression: String(access.index),
        resolvedIndex: access.index
      }))
    });
  });

  frames.forEach(frame => {
    frame.events.sort((left, right) => (
      (Number(left?.order) || 0) - (Number(right?.order) || 0)
      || String(left?.signature || left?.id || '').localeCompare(String(right?.signature || right?.id || ''))
    ));
  });

  return frames;
}

function readTraceDocument(tracePath, variables, traceRequest = {}) {
  if (!fs.existsSync(tracePath)) return null;
  const stat = fs.statSync(tracePath);
  if (stat.size > 20 * 1024 * 1024) throw new Error('追蹤資料超過 20MB 上限');
  const records = fs.readFileSync(tracePath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => JSON.parse(line));
  const keepDirectives = Array.isArray(traceRequest.keepDirectives)
    ? traceRequest.keepDirectives
    : [];
  const keepDirectiveByStatementId = new Map(keepDirectives.map((directive, index) => {
    const functionName = directive.functionName || 'global';
    const statementId = `manual-keep:${functionName}:${directive.line}:${directive.index ?? index}`;
    return [statementId, directive];
  }));
  const eventSources = traceRequest.eventSources && typeof traceRequest.eventSources === 'object'
    ? traceRequest.eventSources
    : {};
  const allFrames = records.filter(record => record.record === 'frame').map(frame => ({
    ...frame,
    events: (frame.events || []).map(event => {
      const source = eventSources[event.signature];
      const enriched = source ? { ...event, source: JSON.parse(JSON.stringify(source)) } : event;
      if (event.type !== 'keep') return enriched;
      const directive = keepDirectiveByStatementId.get(enriched.signature);
      return directive?.binding
        ? { ...enriched, binding: JSON.parse(JSON.stringify(directive.binding)) }
        : enriched;
    })
  }));
  const frameDirectives = Array.isArray(traceRequest.frameDirectives)
    ? traceRequest.frameDirectives
    : [];
  const directiveByStatementId = new Map(frameDirectives.map((directive, index) => {
    const functionName = directive.functionName || 'global';
    const statementId = `manual-frame:${functionName}:${directive.line}:${directive.index ?? index}`;
    return [statementId, directive];
  }));
  const tracedFrames = allFrames.map(frame => {
    const directive = directiveByStatementId.get(frame.source?.statementId);
    const primaryVariableId = directive?.variableIds?.[0] || '';
    const resolvedRendererOptions = resolveFrameRendererOptions(frame, directive);
    return {
      ...frame,
      source: {
        ...(frame.source || {}),
        directiveName: directive?.name || '',
        directiveKey: directive?.sourceKey || '',
        logicalDirectiveKey: directive?.logicalSourceKey || '',
        directiveKeyAliases: directive?.sourceKeyAliases || [],
        objectId: directive?.objectId || '',
        primaryVariableId: directive?.variableIds?.[0] || '',
        when: directive?.when || null
      },
      bindings: Array.isArray(directive?.bindings) ? directive.bindings : [],
      objectBindings: directive?.objectBinding ? [directive.objectBinding] : [],
      renderers: directive?.renderer && directive?.variableIds?.[0]
        ? { [directive.variableIds[0]]: directive.renderer }
        : {},
      rendererOptions: primaryVariableId && Object.keys(resolvedRendererOptions).length
        ? { [primaryVariableId]: resolvedRendererOptions }
        : {},
      captureOnlyVariableIds: Array.isArray(directive?.captureOnlyVariableIds)
        ? directive.captureOnlyVariableIds
        : [],
      texts: Array.isArray(directive?.texts) ? directive.texts : [],
      styles: Array.isArray(directive?.styles) ? directive.styles : [],
      segments: Array.isArray(directive?.segments) ? directive.segments : []
    };
  });
  const sliceMode = traceRequest.sliceMode === 'manual'
    ? 'manual'
    : traceRequest.sliceMode === 'full' ? 'full' : 'auto';
  const slicedFrames = sliceMode === 'auto' ? autoSliceTraceFrames(tracedFrames) : tracedFrames;
  // A frame snapshot must be created after derived events are complete. This
  // keeps fixed marks and every event-driven visual state in @keep last.
  const framesWithFixedEvents = appendFixedEvents(slicedFrames, variables);
  const keepSnapshots = materializeKeepSnapshots(framesWithFixedEvents);
  const asmView = traceRequest.asmView && typeof traceRequest.asmView === 'object' ? traceRequest.asmView : {};
  const requestedSkins = {
    ...(traceRequest.skins && typeof traceRequest.skins === 'object' ? traceRequest.skins : {}),
    ...(asmView.skins && typeof asmView.skins === 'object' ? asmView.skins : {})
  };
  const variableMap = {};
  const skins = {};
  for (const variable of variables) {
    variableMap[variable.id] = {
      id: variable.id,
      name: variable.name,
      cppType: variable.type,
      kind: variable.kind,
      line: variable.line,
      functionName: variable.functionName
    };
    skins[variable.id] = {
      renderer: requestedSkins[variable.id]?.renderer || defaultTraceRenderer(variable.kind),
      options: requestedSkins[variable.id]?.options || {}
    };
  }
  return {
    schemaVersion: '1.0',
    generatedAt: new Date().toISOString(),
    sourceCode: typeof traceRequest.sourceCode === 'string' ? traceRequest.sourceCode : '',
    sliceMode,
    variables: variableMap,
    frames: keepSnapshots.frames,
    snapshots: keepSnapshots.snapshots,
    skins,
    rules: Array.isArray(asmView.rules)
      ? asmView.rules
      : Array.isArray(traceRequest.rules) ? traceRequest.rules : [],
    studio: asmView.studio && typeof asmView.studio === 'object' ? asmView.studio : {},
    asmView,
    frameDirectives
  };
}

// === 編譯＋執行 C++ 程式 ===
app.post('/compile', (req, res) => {
  debugMessages = []; // 每次請求重置

  const { code, input, trace } = req.body || {};
  let traceEnabled = trace?.enabled === true;

  if (typeof code !== 'string') {
    return res.status(400).json({
      output: '',
      error: 'code 必須是字串',
      compileTime: null,
      runTime: null,
      memoryKB: null,
      debug_log: debugMessages,
    });
  }

  // 限制程式碼長度 (例如限制 64KB)
  if (code.length > 64 * 1024) {
    return res.status(400).json({
      output: '',
      error: '程式碼過長 (超過 64KB 限制)，請精簡後再試。',
      compileTime: null,
      runTime: null,
      memoryKB: null,
      debug_log: debugMessages,
    });
  }

  let sourceCode = code;
  let traceVariables = [];
  let traceFrameDirectives = [];
  let traceKeepDirectives = [];
  let traceEventSources = {};
  let traceSliceMode = trace?.sliceMode;
  let traceWarning = '';
  let asmView = null;
  try {
    asmView = TraceViewSource.parse(code);
  } catch (error) {
    traceWarning = error.message;
  }
  if (traceEnabled) {
    try {
      const instrumented = instrumentSource(code, Array.isArray(trace.watches) ? trace.watches : []);
      sourceCode = instrumented.code;
      traceVariables = instrumented.variables;
      traceFrameDirectives = instrumented.frameDirectives.map((directive, index) => ({
        line: directive.line,
        name: directive.name || '',
        objectId: directive.objectId || '',
        sourceKey: directive.sourceKey || '',
        logicalSourceKey: directive.logicalSourceKey || '',
        sourceKeyAliases: directive.sourceKeyAliases || [],
        names: directive.names,
        variableIds: directive.variables.map(variable => variable.id),
        captureOnlyVariableIds: directive.captureOnlyVariableIds || [],
        functionName: directive.functionName || directive.variables[0]?.functionName || 'global',
        index: directive.index ?? index,
        bindings: directive.bindings || [],
        objectBinding: directive.objectBinding || null,
        renderer: directive.renderer || '',
        rendererOptions: directive.rendererOptions || {},
        when: directive.when || null,
        texts: directive.texts || [],
        styles: directive.styles || [],
        segments: directive.segments || []
      }));
      traceKeepDirectives = instrumented.keepDirectives.map((directive, index) => ({
        line: directive.line,
        mode: directive.mode,
        label: directive.label || '',
        binding: directive.binding || null,
        functionName: directive.functionName || directive.variable?.functionName || 'global',
        index: directive.index ?? index
      }));
      traceEventSources = instrumented.eventSources || {};
      if (instrumented.frameDirectives.length) traceSliceMode = 'manual';
      logDebug(`Trace instrumentation enabled for ${traceVariables.length} variables`);
    } catch (err) {
      // Trace analysis must not prevent the original program from running.
      // Fall back to the normal compiler path when the parser cannot rewrite
      // an otherwise valid C++ source file.
      traceEnabled = false;
      sourceCode = code;
      traceVariables = [];
      traceFrameDirectives = [];
      traceKeepDirectives = [];
      traceEventSources = {};
      traceWarning = `追蹤分析未完成，已使用一般執行：${err.message}`;
      logDebug(traceWarning);
    }
  }

  /*
  // 關鍵字過濾
  for (const keyword of BLACKLIST_KEYWORDS) {
      const regex = new RegExp(keyword, 'i');
      if (regex.test(code)) {
          const msg = `不允許 "${keyword}" ，操作已被阻擋。`;
          logDebug(msg);
          return res.status(400).json({
              output: '',
              error: msg,
              compileTime: null,
              runTime: null,
              memoryKB: null,
              debug_log: debugMessages,
          });
      }
  }
  */

  // 使用 uuid 產生唯一 ID
  const uniqueId = uuidv4();
  const isWindows = process.platform === 'win32';
  const sourcePath = path.join(TEMP_DIR, `main_${uniqueId}.cpp`);
  const exePath = path.join(TEMP_DIR, `main_exec_${uniqueId}${isWindows ? '.exe' : ''}`);
  const scriptPath = path.join(TEMP_DIR, `script_${uniqueId}.js`);
  const tracePath = path.join(TEMP_DIR, `trace_${uniqueId}.jsonl`);

  // 定義清理函式
  const cleanup = (attempt = 0) => {
    let retryNeeded = false;
    [sourcePath, exePath, scriptPath, tracePath].forEach(filePath => {
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (e) {
        retryNeeded = true;
        if (attempt >= 3) logDebug('清理暫存檔失敗: ' + e.message);
      }
    });
    if (retryNeeded && attempt < 3) {
      setTimeout(() => cleanup(attempt + 1), 200);
    }
  };

  // 1. 寫入 source
  try {
    fs.writeFileSync(sourcePath, sourceCode, 'utf8');
  } catch (err) {
    cleanup();
    return res.status(500).json({
      output: '',
      error: '無法寫入暫存檔：' + err.message,
      debug_log: debugMessages,
    });
  }
  logDebug(`原始碼寫入完成: ${path.basename(sourcePath)}`);

  // 2. 編譯
  const compileArgs = [
    isWindows ? '-std=c++1z' : '-std=c++17',
    traceEnabled ? '-O0' : '-O2',
    sourcePath,
    '-I', TEMP_DIR,
    '-I', path.join(__dirname, 'lib'), // 去 lib 資料夾找 AV.hpp
    '-o', exePath,
  ];
  if (!isWindows) compileArgs.splice(7, 0, '-I', '/tmp');

  const compileStart = performance.now();
  const gpp = spawn('g++', compileArgs, { cwd: __dirname });

  let compileErr = '';
  gpp.stderr.on('data', (data) => { compileErr += data.toString(); });

  gpp.on('close', (codeExit) => {
    const compileTime = +((performance.now() - compileStart).toFixed(1));

    if (codeExit !== 0) {
      logDebug('編譯失敗，退出碼：' + codeExit);
      cleanup();
      return res.status(400).json({
        output: '',
        error: compileErr || ('編譯失敗，退出碼：' + codeExit),
        compileTime,
        runTime: null,
        memoryKB: null,
        debug_log: debugMessages,
      });
    }

    logDebug('編譯成功，耗時 ' + compileTime + ' ms');

    if (!isWindows) {
      // 確保 sandboxuser (UID 1000) 有權限執行這個 root 產生的檔案
      try {
        fs.chmodSync(exePath, 0o755); // 755 = rwxr-xr-x (所有人可讀可執行)
      } catch (err) {
        logDebug('權限設定失敗: ' + err.message);
        cleanup();
        return res.status(500).json({ output: '', error: 'Server Error: Unable to set permissions.' });
      }
    }

    // 3. 執行程式
    const ulimitCmd = `ulimit -v ${LIMITS.MEMORY_MB * 1024} && exec "${exePath}"`;
    const runStart = performance.now();
    const runOptions = {
      cwd: isWindows ? TEMP_DIR : '/sandbox',
      // 幫stdin stdout stderr開通道
      stdio: ['pipe', 'pipe', 'pipe'],

      // 導入環境變數
      env: {
        ...process.env,
        AV_OUTPUT_FILE: scriptPath,
        ASM_TRACE_FILE: tracePath,
        ASM_TRACE_MAX_FRAMES: '5000'
      }
    };
    if (!isWindows) {
      // Linux 正式環境使用唯讀 sandbox 並降級身分。
      runOptions.uid = 1000;
      runOptions.gid = 1000;
    }
    const child = isWindows
      ? spawn(exePath, [], runOptions)
      : spawn('sh', ['-c', ulimitCmd], runOptions);

    let runOut = '';
    let runErr = '';
    let isTLE = false;
    let isOLE = false;

    let memSampler = null;
    let peakMem = { peakRssKB: 0, peakHwmKB: 0, peakVmsKB: 0 };

    if (child.pid && !isWindows) {
      memSampler = startMemorySampler(child.pid, 1);
    } else if (!child.pid) {
      logDebug('MEM: child.pid 不存在，無法取樣記憶體');
    }

    const collectOutput = (data, isStderr) => {
      if (isTLE || isOLE) return;

      const chunk = data.toString();
      const currentLen = runOut.length + runErr.length;

      if (currentLen + chunk.length > LIMITS.OUTPUT_SIZE) {
        isOLE = true;
        const remaining = LIMITS.OUTPUT_SIZE - currentLen;
        if (remaining > 0) {
          if (isStderr) runErr += chunk.substring(0, remaining);
          else runOut += chunk.substring(0, remaining);
        }
        const msg = '\n... [Output Limit Exceeded]';
        if (isStderr) runErr += msg;
        else runOut += msg;

        logDebug('OLE: 輸出超過限制，強制終止');
        try { child.kill('SIGKILL'); } catch (e) { }
      } else {
        if (isStderr) runErr += chunk;
        else runOut += chunk;
      }
    };

    child.stdout.on('data', (d) => collectOutput(d, false));
    child.stderr.on('data', (d) => collectOutput(d, true));

    let hasResponded = false; // 防呆：確保不重複回傳

    const sendResponse = (codeRun, signal, forced = false) => {
      if (hasResponded) return;
      hasResponded = true;

      if (memSampler) {
        memSampler.stop();
        peakMem = memSampler.getPeak();
      }

      const runTime = +((performance.now() - runStart).toFixed(1));
      logDebug(`程式結束，退出碼：${codeRun}，signal：${signal}`, { codeRun, signal, peakRssKB: peakMem.peakRssKB });

      // 解析 stderr 中的 [debug] 訊息與腳本超限提示，加入 debug_log
      if (runErr) {
        runErr.split('\n').forEach(line => {
          const trimmed = line.trim();
          if (trimmed.startsWith('[debug]')) {
            logDebug(trimmed);
          } else if (trimmed.startsWith('Script Size Exceeded')) {
            logDebug(trimmed);
          }
        });
      }

      let scriptContent = '';
      let traceDocument = null;
      try {
        if (fs.existsSync(scriptPath)) scriptContent = fs.readFileSync(scriptPath, 'utf8');
      } catch (err) { logDebug('讀取動畫腳本失敗: ' + err.message); }

      if (traceEnabled) {
        try {
          traceDocument = readTraceDocument(tracePath, traceVariables, {
            ...trace,
            sourceCode: code,
            sliceMode: traceSliceMode,
            frameDirectives: traceFrameDirectives,
            keepDirectives: traceKeepDirectives,
            eventSources: traceEventSources,
            asmView
          });
        } catch (err) {
          logDebug('Failed to read trace output: ' + err.message);
          runErr += `\nTrace Error: ${err.message}`;
        }
      }

      cleanup();

      const memoryKB = (peakMem.peakRssKB > 0) ? peakMem.peakRssKB : (peakMem.peakHwmKB > 0 ? peakMem.peakHwmKB : null);

      let finalError = '';
      if (isTLE) finalError = `Time Limit Exceeded (> ${LIMITS.TIME_MS}ms)`;
      else if (isOLE) finalError = `Output Limit Exceeded (> ${LIMITS.OUTPUT_SIZE / 1024}KB)`;
      else if (runErr && runErr.includes('Script Size Exceeded')) finalError = runErr.split('\n').find(l => l.includes('Script Size Exceeded')) || 'Script Size Exceeded';
      else if (codeRun !== 0 || signal) finalError = (runErr && runErr.trim() !== '') ? runErr : `Runtime Error`;

      if (forced) logDebug('強制回收：進程未能及時關閉，已先行回傳結果。');

      if (traceDocument && !finalError) traceDocument.provenance = TraceProvenance.create(code, input);

      res.json({
        output: runOut,
        error: finalError,
        traceWarning,
        compileTime,
        runTime,
        memoryKB,
        debug_log: debugMessages,
        scriptContent: scriptContent,
        traceDocument
      });
    };

    const tleTimer = setTimeout(() => {
      isTLE = true;
      logDebug(`TLE: 超過 ${LIMITS.TIME_MS}ms，強制終止`, { pid: child.pid });
      try {
        child.kill('SIGKILL');
        // 在 Windows 下 sh 可能不會殺掉 exec 出後的進程，故增加這層保險
        if (process.platform === 'win32' && child.pid) {
          spawn('taskkill', ['/F', '/T', '/PID', child.pid]);
        }
      } catch (e) { }

      // [核心修正]：超時 1 秒後若 process.on('close') 仍然沒反應，強迫回傳 
      setTimeout(() => { if (!hasResponded) sendResponse(null, 'SIGKILL', true); }, 1000);
    }, LIMITS.TIME_MS);

    if (typeof input === 'string' && input.length > 0) {
      child.stdin.write(input);
    }
    child.stdin.end();

    child.on('error', (e) => {
      logDebug('執行程式 spawn 失敗：' + e.message);
      if (!hasResponded) sendResponse(null, null);
    });

    // 改監聽 exit 比較即時，且透過 sendResponse 內的防呆防止與 close 重複
    child.on('exit', (codeRun, signal) => {
      clearTimeout(tleTimer);
      sendResponse(codeRun, signal);
    });

    child.on('close', (codeRun, signal) => {
      clearTimeout(tleTimer);
      sendResponse(codeRun, signal);
    });
  });
});

// 每小時執行一次：清理殘留檔案
setInterval(() => {
  fs.readdir(TEMP_DIR, (err, files) => {
    if (err) return;
    const now = Date.now();
    const ONE_HOUR = 60 * 60 * 1000;

    files.forEach(file => {
      if (file.startsWith('main_') || file.startsWith('script_')) {
        const filePath = path.join(TEMP_DIR, file);
        fs.stat(filePath, (err, stats) => {
          if (err) return;
          if (now - stats.birthtimeMs > ONE_HOUR) {
            fs.unlink(filePath, () => { });
            console.log(`[Auto-Clean] 刪除過期殘留檔: ${file}`);
          }
        });
      }
    });
  });
}, 60 * 60 * 1000);



const SAMPLES_DIR = path.join(__dirname, '/algorithm_sample');

// 遞迴讀取目錄結構
function getDirectoryTree(dirPath, rootPath = SAMPLES_DIR) {
  const stats = fs.statSync(dirPath);
  if (!stats.isDirectory()) return [];

  const items = fs.readdirSync(dirPath);
  const visibleItems = items.filter(item => !item.startsWith('.'));

  const tree = visibleItems.map(item => {
    const fullPath = path.join(dirPath, item);
    const itemStats = fs.statSync(fullPath);

    // 計算相對於 SAMPLES_DIR 的路徑 (例如: "Graph/DFS.cpp")
    // 並將 Windows 的反斜線 '\\' 轉為 Web 通用的正斜線 '/'
    const relativePath = path.relative(rootPath, fullPath).split(path.sep).join('/');

    if (itemStats.isDirectory()) {
      return {
        name: item,
        type: 'folder',
        path: relativePath, // 加入路徑
        children: getDirectoryTree(fullPath, rootPath) // 遞迴
      };
    } else {
      return {
        name: item,
        type: 'file',
        path: relativePath  // 加入路徑
      };
    }
  });

  // 排序：資料夾在先
  tree.sort((a, b) => {
    if (a.type === b.type) return a.name.localeCompare(b.name);
    return a.type === 'folder' ? -1 : 1;
  });

  return tree;
}

// 3. 定義資料結構 (Schema) - 依照你想要的欄位
const CodeSchema = new mongoose.Schema({
  user_uid: { type: String, required: true },  // User UID
  code_uid: { type: String, unique: true },    // Code UID (唯一)
  title: { type: String, required: true },  // 標題
  desc: { type: String },                  // 簡述
  language: { type: String, default: 'cpp' },  // 程式語言
  inputs: { type: [String], default: [] },   // 儲存一個或多個輸入內容
  content: { type: String, required: true },  // 程式碼內容
  created_at: { type: Date, default: Date.now } // 建檔時間
});

// 4. 建立模型 (Model)
// 以後你就用這個 'CodeModel' 來對資料庫做增刪改查
const CodeModel = mongoose.model('Code', CodeSchema);

// === 程式碼儲存與讀取 API ===

// 1. 儲存程式碼 (需登入)
app.post('/api/codes', authenticateToken, async (req, res) => {
  const { title, desc, language, content, inputs } = req.body;
  const user_uid = req.user.id; // 從 JWT 解析出來的 user id

  if (!title || !content) {
    return res.status(400).json({ error: '標題與程式碼內容為必填' });
  }

  try {
    const code_uid = uuidv4();
    const newCode = await CodeModel.create({
      user_uid,
      code_uid,
      title,
      desc,
      language: language || 'cpp',
      inputs: inputs || [],
      content
    });
    res.json({ success: true, message: '程式碼儲存成功！', code_uid: newCode.code_uid });
  } catch (err) {
    console.error('儲存程式碼失敗:', err);
    res.status(500).json({ error: '伺服器錯誤，儲存失敗' });
  }
});

// 2. 讀取該帳號的所有程式碼 (需登入)
app.get('/api/codes', authenticateToken, async (req, res) => {
  const user_uid = req.user.id;

  try {
    // 找出所有屬於該使用者的程式碼，並依照時間降序排列
    const codes = await CodeModel.find({ user_uid }).sort({ created_at: -1 });
    res.json({ success: true, codes });
  } catch (err) {
    console.error('讀取程式碼列表失敗:', err);
    res.status(500).json({ error: '伺服器錯誤，讀取失敗' });
  }
});

// 3. 讀取特定程式碼內容 (需登入)
app.get('/api/codes/:code_uid', authenticateToken, async (req, res) => {
  const { code_uid } = req.params;
  const user_uid = req.user.id;

  try {
    const code = await CodeModel.findOne({ code_uid, user_uid });
    if (!code) {
      return res.status(404).json({ error: '找不到該程式碼或權限不足' });
    }
    res.json({ success: true, code });
  } catch (err) {
    console.error('讀取特定程式碼失敗:', err);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// 4. 刪除程式碼 (需登入)
app.delete('/api/codes/:code_uid', authenticateToken, async (req, res) => {
  const { code_uid } = req.params;
  const user_uid = req.user.id;

  try {
    // 刪除條件：code_uid 符合 且 user_uid 是本人
    const result = await CodeModel.findOneAndDelete({ code_uid, user_uid });

    if (!result) {
      return res.status(404).json({ error: '找不到該程式碼或無權刪除' });
    }

    res.json({ success: true, message: '刪除成功' });
  } catch (err) {
    console.error('刪除失敗:', err);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// === /api/samples 路由 ===
app.get('/api/samples', (req, res) => {
  const requestedFilename = req.query.filename;
  // === 情況 A: 讀取檔案內容 (有傳 ?filename=Graph/DFS.cpp) ===
  if (requestedFilename) {
    // [安全防護] 防止 Directory Traversal 攻擊 (例如傳 ../../etc/passwd)
    // 1. 組合完整路徑
    const safePath = path.join(SAMPLES_DIR, requestedFilename);

    // 2. 確保解析後的路徑，真的還在 SAMPLES_DIR 裡面
    if (!safePath.startsWith(SAMPLES_DIR)) {
      return res.status(403).send("Access Denied: Invalid file path.");
    }

    // 3. 檢查檔案是否存在
    if (!fs.existsSync(safePath)) {
      return res.status(404).send("File not found.");
    }

    // 4. 讀取並回傳文字內容
    fs.readFile(safePath, 'utf8', (err, data) => {
      if (err) {
        console.error(err);
        return res.status(500).send("Error reading file.");
      }
      res.send(data);
    });
  }

  // === 情況 B: 獲取目錄結構 (沒傳參數) ===
  else {
    try {
      // 確認根目錄存在
      if (!fs.existsSync(SAMPLES_DIR)) {
        // 如果資料夾不存在，先建立它以免報錯，或是回傳空陣列
        console.warn(`Samples directory not found at: ${SAMPLES_DIR}`);
        return res.json([]);
      }

      const tree = getDirectoryTree(SAMPLES_DIR);
      res.json(tree);
    } catch (err) {
      console.error("Error scanning directory:", err);
      res.status(500).send("Server error scanning samples.");
    }
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
