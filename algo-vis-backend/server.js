// server.js
const express         = require('express');
const path            = require('path');
const fs              = require('fs');
const { spawn }       = require('child_process');
const { performance } = require('perf_hooks');
// [修改 1] 引入 uuid (改用 crypto)
const { randomUUID: uuidv4 } = require('crypto');
const rateLimit       = require('express-rate-limit');

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
// [修改 2] 確保暫存目錄存在
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

  // [修改 3] 使用 uuid 產生唯一 ID
  const uniqueId = uuidv4();
  const sourcePath = path.join(TEMP_DIR, `main_${uniqueId}.cpp`);
  const exePath    = path.join(TEMP_DIR, `main_exec_${uniqueId}`);
  const scriptPath = path.join(TEMP_DIR, `script_${uniqueId}.js`);

  // [修改 4] 定義清理函式
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

    // 3. 執行程式
    const ulimitCmd = `ulimit -v ${LIMITS.MEMORY_MB * 1024} && exec "${exePath}"`;
    const runStart = performance.now();

    const child = spawn('sh', ['-c', ulimitCmd], {
      cwd: __dirname,
      stdio: ['pipe', 'pipe', 'pipe'],
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

// === /api/samples 路由 ===
app.get('/api/samples', (req, res) => {
    if (req.query.filename) {
        const filePath = path.join(SAMPLE_DIR, req.query.filename);
        if (!filePath.startsWith(SAMPLE_DIR)) {
             return res.status(403).send("Forbidden");
        }
        fs.readFile(filePath, 'utf8', (err, data) => {
            if (err) {
                return res.status(404).send("File not found");
            }
            res.send(data);
        });

    } else {
        fs.readdir(SAMPLE_DIR, (err, files) => {
            if (err) {
                return res.json([]);
            }
            const cppFiles = files.filter(f => f.endsWith('.cpp') || f.endsWith('.c'));
            res.json(cppFiles);
        });
    }
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});