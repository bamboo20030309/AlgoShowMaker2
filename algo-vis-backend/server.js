// server.js
const express         = require('express');
const path            = require('path');
const fs              = require('fs');
const { spawn }       = require('child_process');
const { performance } = require('perf_hooks');
// [修改 1] 引入 uuid 用於產生唯一檔名
const { randomUUID: uuidv4 } = require('crypto');

const SAMPLE_DIR = path.join(__dirname, 'tmp', 'algorithm_sample');
// [修改 2] 確保暫存目錄存在 (用於存放動態生成的 cpp 和 exe)
const TEMP_DIR = path.join(__dirname, 'tmp');
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR);
}

const app = express();
let debugMessages = [];

// === 限制設定 (保留原本設定) ===
const LIMITS = {
  TIME_MS: 5000,           // TLE: 5 秒
  MEMORY_MB: 256,          // MLE: 256 MB (透過 ulimit -v)
  OUTPUT_SIZE: 64 * 1024, // OLE: 64 KB (截斷輸出)
};

// 記錄 debug 訊息
function logDebug(msg, extra = {}) {
  debugMessages.push({
    time: new Date().toISOString(),
    msg,
    ...extra,
  });
}

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '5mb' }));

/**
 * 讀取 Linux /proc/<pid>/status (保留原本邏輯)
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
 * 記憶體輪詢取樣 (保留原本邏輯)
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

// 編譯＋執行 C++ 程式
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

  // [修改 3] 使用 uuid 產生唯一 ID，並將檔案放在 tmp 目錄下
  const uniqueId = uuidv4();
  const sourcePath = path.join(TEMP_DIR, `main_${uniqueId}.cpp`);
  const exePath    = path.join(TEMP_DIR, `main_exec_${uniqueId}`);

  // [修改 4] 定義清理函式 (用於刪除暫存檔)
  const cleanup = () => {
    try {
        if (fs.existsSync(sourcePath)) fs.unlinkSync(sourcePath);
        if (fs.existsSync(exePath)) fs.unlinkSync(exePath);
        // logDebug('暫存檔清理完成');
    } catch (e) {
        logDebug('清理暫存檔失敗: ' + e.message);
    }
  };

  // 1. 寫入 main_{uuid}.cpp
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
    sourcePath,      // 輸入檔：tmp/main_{uuid}.cpp
    '-I', TEMP_DIR,  // Include Path：確保能找到 AV.hpp (它在 tmp 下)
    '-I', '/tmp',
    '-o', exePath,   // 輸出檔：tmp/main_exec_{uuid}
  ];

  const compileStart = performance.now();
  // 注意：cwd 維持在 __dirname 或 TEMP_DIR 其實沒差，因為上面路徑都是絕對路徑
  const gpp = spawn('g++', compileArgs, { cwd: __dirname });

  let compileErr = '';
  gpp.stderr.on('data', (data) => { compileErr += data.toString(); });

  gpp.on('close', (codeExit) => {
    const compileTime = +((performance.now() - compileStart).toFixed(1));

    if (codeExit !== 0) {
      logDebug('編譯失敗，退出碼：' + codeExit);
      cleanup(); // [修改] 編譯失敗也要清理
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

    // 3. 執行程式 (加上 TLE, OLE, MLE 保護)
    
    // [修改] 使用新的 exePath
    // ulimit -v 單位是 KB
    const ulimitCmd = `ulimit -v ${LIMITS.MEMORY_MB * 1024} && exec "${exePath}"`;

    const runStart = performance.now();

    const child = spawn('sh', ['-c', ulimitCmd], {
      cwd: __dirname, // 保持原本的工作目錄
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let runOut = '';
    let runErr = '';
    let isTLE = false;
    let isOLE = false;

    // 記憶體監控（保留原本邏輯）
    let memSampler = null;
    let peakMem = { peakRssKB: 0, peakHwmKB: 0, peakVmsKB: 0 };

    if (child.pid) {
      memSampler = startMemorySampler(child.pid, 1);
    } else {
      logDebug('MEM: child.pid 不存在，無法取樣記憶體');
    }

    // OLE 檢查與資料收集函式 (保留原本邏輯)
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

    // TLE 計時器
    const tleTimer = setTimeout(() => {
      isTLE = true;
      logDebug(`TLE: 超過 ${LIMITS.TIME_MS}ms，強制終止`, { pid: child.pid });
      try { child.kill('SIGKILL'); } catch (e) {}
    }, LIMITS.TIME_MS);

    // 寫入 stdin
    if (typeof input === 'string' && input.length > 0) {
      child.stdin.write(input);
    }
    child.stdin.end();

    child.on('error', (e) => {
      logDebug('執行程式 spawn 失敗：' + e.message);
      cleanup(); // [修改] 發生錯誤要清理
    });

    child.on('close', (codeRun, signal) => {
      clearTimeout(tleTimer);

      // 停止記憶體監控
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

      // [修改 5] 執行結束，無論成功失敗都清理暫存檔
      cleanup();

      // 記憶體計算 (保留原本邏輯)
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
      });
    });
  });
});

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});