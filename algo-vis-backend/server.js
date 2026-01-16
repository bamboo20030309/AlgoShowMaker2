// server.js
require('dotenv').config();
const express                = require('express');
const path                   = require('path');
const fs                     = require('fs');
const { spawn }              = require('child_process');
const { performance }        = require('perf_hooks');
//引入 crypto uuid
const { randomUUID: uuidv4 } = require('crypto');
const rateLimit              = require('express-rate-limit');
const mongoose               = require('mongoose');            //資料庫溝通套件
const bcrypt                 = require('bcryptjs');            //密碼加密套件
const jwt                    = require('jsonwebtoken');        //webtoken套件
const nodemailer             = require('nodemailer');          //重置密碼email套件

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
    created_at: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);

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
    message: { error: '請求過於頻繁，請稍後再試' }
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
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '5mb' }));

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

// === 編譯＋執行 C++ 程式 ===
app.post('/compile', (req, res) => {
  debugMessages = []; // 每次請求重置

  const { code, input } = req.body || {};

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
  const sourcePath = path.join(TEMP_DIR, `main_${uniqueId}.cpp`);
  const exePath    = path.join(TEMP_DIR, `main_exec_${uniqueId}`);
  const scriptPath = path.join(TEMP_DIR, `script_${uniqueId}.js`);

  // 定義清理函式
  const cleanup = () => {
    try {
        if (fs.existsSync(sourcePath)) fs.unlinkSync(sourcePath);
        if (fs.existsSync(exePath)) fs.unlinkSync(exePath);
        if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath);
    } catch (e) {
        logDebug('清理暫存檔失敗: ' + e.message);
    }
  };

  // 1. 寫入 source
  try {
    fs.writeFileSync(sourcePath, code, 'utf8');
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
    '-std=c++17',
    '-O2',
    sourcePath,      
    '-I', TEMP_DIR,  
    '-I', path.join(__dirname, 'lib'), // 去 lib 資料夾找 AV.hpp
    '-I', '/tmp',
    '-o', exePath,   
  ];

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

    // 確保 sandboxuser (UID 1000) 有權限執行這個 root 產生的檔案
    try {
        fs.chmodSync(exePath, 0o755); // 755 = rwxr-xr-x (所有人可讀可執行)
    } catch (err) {
        logDebug('權限設定失敗: ' + err.message);
        cleanup();
        return res.status(500).json({ output: '', error: 'Server Error: Unable to set permissions.' });
    }

    // 3. 執行程式
    const ulimitCmd = `ulimit -v ${LIMITS.MEMORY_MB * 1024} && exec "${exePath}"`;
    const runStart = performance.now();

    const child = spawn('sh', ['-c', ulimitCmd], {
      // 強迫程式以為自己在 /sandbox 裡
      // 因為 /sandbox 是唯讀的，所以 system("touch file") 會失敗
      cwd: '/sandbox',

      // 降級身分 (User ID / Group ID)
      uid: 1000, 
      gid: 1000,

      // 幫stdin stdout stderr開通道
      stdio: ['pipe', 'pipe', 'pipe'],

      // 導入環境變數
      env: {
          ...process.env,
          AV_OUTPUT_FILE: scriptPath 
      }
    });

    let runOut = '';
    let runErr = '';
    let isTLE = false;
    let isOLE = false;

    let memSampler = null;
    let peakMem = { peakRssKB: 0, peakHwmKB: 0, peakVmsKB: 0 };

    if (child.pid) {
      memSampler = startMemorySampler(child.pid, 1);
    } else {
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
          else          runOut += chunk.substring(0, remaining);
        }
        const msg = '\n... [Output Limit Exceeded]';
        if (isStderr) runErr += msg;
        else          runOut += msg;

        logDebug('OLE: 輸出超過限制，強制終止');
        try { child.kill('SIGKILL'); } catch (e) {}
      } else {
        if (isStderr) runErr += chunk;
        else          runOut += chunk;
      }
    };

    child.stdout.on('data', (d) => collectOutput(d, false));
    child.stderr.on('data', (d) => collectOutput(d, true));

    const tleTimer = setTimeout(() => {
      isTLE = true;
      logDebug(`TLE: 超過 ${LIMITS.TIME_MS}ms，強制終止`, { pid: child.pid });
      try { child.kill('SIGKILL'); } catch (e) {}
    }, LIMITS.TIME_MS);

    if (typeof input === 'string' && input.length > 0) {
      child.stdin.write(input);
    }
    child.stdin.end();

    child.on('error', (e) => {
      logDebug('執行程式 spawn 失敗：' + e.message);
      cleanup();
    });

    child.on('close', (codeRun, signal) => {
      clearTimeout(tleTimer);

      if (memSampler) {
        memSampler.stop();
        peakMem = memSampler.getPeak();
      }

      const runTime = +((performance.now() - runStart).toFixed(1));

      logDebug(`程式結束，退出碼：${codeRun}，signal：${signal}`, {
        codeRun,
        signal,
        peakRssKB: peakMem.peakRssKB,
      });

      // 讀取產生的 JS 檔案內容
      let scriptContent = '';
      try {
          if (fs.existsSync(scriptPath)) {
              scriptContent = fs.readFileSync(scriptPath, 'utf8');
          }
      } catch (err) {
          logDebug('讀取動畫腳本失敗: ' + err.message);
      }

      // [修改 5] 執行結束，無論成功失敗都清理暫存檔
      cleanup();

      const memoryKB =
        (peakMem.peakRssKB && peakMem.peakRssKB > 0) ? peakMem.peakRssKB :
        (peakMem.peakHwmKB && peakMem.peakHwmKB > 0) ? peakMem.peakHwmKB :
        null;

      let finalError = '';

      if (isTLE) {
        finalError = `Time Limit Exceeded (> ${LIMITS.TIME_MS}ms)`;
      }
      else if (isOLE) {
        finalError = `Output Limit Exceeded (> ${LIMITS.OUTPUT_SIZE / 1024}KB)`;
      }
      else if (!finalError) {
        if (codeRun === 0 && !signal) {
          finalError = '';
        } else {
          finalError = (runErr && runErr.trim() !== '')
            ? runErr
            : `Runtime Error`;
        }
      }

      res.json({
        output: runOut,
        error: finalError,
        compileTime,
        runTime,
        memoryKB,
        debug_log: debugMessages,
        scriptContent: scriptContent
      });
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
                        fs.unlink(filePath, () => {}); 
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
  title:    { type: String, required: true },  // 標題
  desc:     { type: String },                  // 簡述
  language: { type: String, default: 'cpp' },  // 程式語言
  inputs:   { type: [String], default: [] },   // 儲存一個或多個輸入內容
  content:  { type: String, required: true },  // 程式碼內容
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