// server.js
const express         = require('express');
const path            = require('path');
const fs              = require('fs');
const { spawn }       = require('child_process');
const { performance } = require('perf_hooks');

const SAMPLE_DIR = path.join(__dirname, 'tmp', 'algorithm_sample');
const app = express();
let debugMessages = [];

// === 限制設定 ===
const LIMITS = {
  TIME_MS: 5000,           // TLE: 5 秒
  MEMORY_MB: 256,          // MLE: 256 MB (透過 ulimit -v)
  OUTPUT_SIZE: 64 * 1024, // OLE: 128 KB (截斷輸出)
};

// 記錄 debug 訊息（支援附帶欄位，例如 memory）
function logDebug(msg, extra = {}) {
  debugMessages.push({
    time: new Date().toISOString(),
    msg,
    ...extra,
  });
}

//app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '5mb' }));

/**
 * 讀取 Linux /proc/<pid>/status 取得記憶體資訊
 * - VmRSS: 目前實際常駐記憶體 (KB)
 * - VmHWM: RSS 峰值 (KB)
 * - VmSize: 虛擬記憶體 (KB)
 *
 * 若非 Linux 或 /proc 不存在，會回傳 null
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
 * 以固定頻率輪詢 child PID 的 /proc 記憶體資訊
 * 回傳 { stop, getPeak }
 */
function startMemorySampler(childPid, intervalMs = 80) {
  let peakRssKB = 0;
  let peakHwmKB = 0;
  let peakVmsKB = 0;

  // 第一次先抓一下，避免很快結束時完全沒有資料
  const first = readProcStatus(childPid);
  if (first) {
    if (typeof first.rssKB === 'number') peakRssKB = Math.max(peakRssKB, first.rssKB);
    if (typeof first.hwmKB === 'number') peakHwmKB = Math.max(peakHwmKB, first.hwmKB);
    if (typeof first.vmsKB === 'number') peakVmsKB = Math.max(peakVmsKB, first.vmsKB);
  //  logDebug('MEM: sample', { pid: childPid, rssKB: first.rssKB, hwmKB: first.hwmKB, vmsKB: first.vmsKB });
  } else {
    logDebug('MEM: /proc 讀取失敗或非 Linux，無法取用 child 記憶體資訊', { pid: childPid });
  }

  const timer = setInterval(() => {
    const info = readProcStatus(childPid);
    if (!info) return;

    if (typeof info.rssKB === 'number') peakRssKB = Math.max(peakRssKB, info.rssKB);
    if (typeof info.hwmKB === 'number') peakHwmKB = Math.max(peakHwmKB, info.hwmKB);
    if (typeof info.vmsKB === 'number') peakVmsKB = Math.max(peakVmsKB, info.vmsKB);

    // debug_log 裡會看到「當下」記憶體（你也可以改成每 N 次再 log）
  //  logDebug('MEM: sample', { pid: childPid, rssKB: info.rssKB, hwmKB: info.hwmKB, vmsKB: info.vmsKB });
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

  const sourcePath = path.join(__dirname, 'main.cpp');
  const exePath    = path.join(__dirname, 'main_exec');

  // 1. 寫入 main.cpp
  try {
    fs.writeFileSync(sourcePath, code, 'utf8');
  } catch (err) {
    return res.status(500).json({
      output: '',
      error: '無法寫入 main.cpp：' + err.message,
      debug_log: debugMessages,
    });
  }
  logDebug('main.cpp 寫入完成');

  // 2. 編譯
  const compileArgs = [
    '-std=c++17',
    '-O2',
    sourcePath,
    '-I', path.join(__dirname, 'tmp'),
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

    // MLE 關鍵：使用 sh -c 配合 ulimit 啟動程式
    // ulimit -v 單位是 KB，所以 256MB = 256 * 1024 KB
    //
    // 注意：這裡用 exec "${exePath}"，sh 會被替換成 exe，本 PID 會變成 exe PID
    const ulimitCmd = `ulimit -v ${LIMITS.MEMORY_MB * 1024} && exec "${exePath}"`;

    const runStart = performance.now();

    const child = spawn('sh', ['-c', ulimitCmd], {
      cwd: __dirname,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

  //  logDebug('執行程序已啟動', { pid: child.pid });

    let runOut = '';
    let runErr = '';
    let isTLE = false;
    let isOLE = false;

    // 記憶體監控（peak RSS / HWM）
    let memSampler = null;
    let peakMem = { peakRssKB: 0, peakHwmKB: 0, peakVmsKB: 0 };

    // 啟動取樣（child.pid 有可能是 null，保險）
    if (child.pid) {
      memSampler = startMemorySampler(child.pid, 1);
    } else {
      logDebug('MEM: child.pid 不存在，無法取樣記憶體');
    }

    // OLE 檢查與資料收集函式
    const collectOutput = (data, isStderr) => {
      // 如果已經判斷出錯 (TLE/OLE)，就不再收資料，避免記憶體浪費
      if (isTLE || isOLE) return;

      const chunk = data.toString();
      const currentLen = runOut.length + runErr.length;

      // 檢查是否加上這塊會超限
      if (currentLen + chunk.length > LIMITS.OUTPUT_SIZE) {
        isOLE = true;

        // 截斷並保留最後一點點空間給提示訊息
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
        peakHwmKB: peakMem.peakHwmKB,
        peakVmsKB: peakMem.peakVmsKB,
      });

      // 這裡的 memoryKB：以 peak RSS 為主；若抓不到 RSS，退而求其次用 HWM
      const memoryKB =
        (peakMem.peakRssKB && peakMem.peakRssKB > 0) ? peakMem.peakRssKB :
        (peakMem.peakHwmKB && peakMem.peakHwmKB > 0) ? peakMem.peakHwmKB :
        null;

      let finalError = '';

      // ========== 1) 優先判斷 TLE ==========
      if (isTLE) {
        finalError = `Time Limit Exceeded (> ${LIMITS.TIME_MS}ms)`;
      }

      // ========== 2) 判斷 OLE ==========
      else if (isOLE) {
        finalError = `Output Limit Exceeded (> ${LIMITS.OUTPUT_SIZE / 1024}KB)`;
      }

      // ========== 3) 判斷 Runtime Error ==========
      if (!finalError) {
        // 正常結束：不應該有 error
        if (codeRun === 0 && !signal) {
          finalError = '';
        } else {
          // 非正常：有 signal 或 exit code 非 0
          // 若有 stderr，就把 stderr 當錯誤訊息（更好 debug）
          finalError = (runErr && runErr.trim() !== '')
            ? runErr
            : `Runtime Error`;
        }
      }

      // 回傳結果
      res.json({
        output: runOut, // TLE/OLE 時這裡也會有被截斷前的輸出
        error: finalError,
        compileTime,
        runTime,
        memoryKB, // 這裡回傳 peak RSS (KB)
        debug_log: debugMessages, // 你會在這裡看到 MEM sample 與 peak
      });
    });
  });
});

// === 你原本的 /api/samples 路由 (完全保留) ===
app.get('/api/samples', (req, res) => {
    // === 除錯點 1：確認請求進入路由 ===

    if (req.query.filename) {
        // --- 邏輯 A：如果有 filename，就讀取檔案內容 ---
      //  console.log('[API] 進入讀取檔案模式');

        const filePath = path.join(SAMPLE_DIR, req.query.filename);

        // 安全檢查
        if (!filePath.startsWith(SAMPLE_DIR)) {
          //   console.log('[API] 路徑非法攔截:', filePath);
             return res.status(403).send("Forbidden");
        }

        fs.readFile(filePath, 'utf8', (err, data) => {
            if (err) {
                console.log('[API]  讀取失敗:', err.message);
                return res.status(404).send("File not found");
            }
          //  console.log('[API]  檔案讀取成功');
            res.send(data);
        });

    } else {
        // --- 邏輯 B：沒有 filename，就列出檔案列表 ---
      //  console.log('[API] 進入列表模式');

        fs.readdir(SAMPLE_DIR, (err, files) => {
            if (err) {
              //  console.log('[API] 無法讀取資料夾:', err.message);
                return res.json([]);
            }

            // 過濾 .cpp 或 .c
            const cppFiles = files.filter(f => f.endsWith('.cpp') || f.endsWith('.c'));

          //  console.log('[API] 列表回傳:', cppFiles);
            res.json(cppFiles);
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
