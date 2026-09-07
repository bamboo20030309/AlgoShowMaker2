# AlgoShowMaker 回歸驗收

在 algo-vis-backend 執行：

```sh
npm run regression
```

需要 Node.js、已安裝 npm dependencies、Git，以及 server.js 使用的 C++ 編譯器。
指令檢查專案 JavaScript 語法、git diff --check，啟動獨立連接埠的臨時伺服器，
執行所有 tests/*.test.js，結束後關閉自己啟動的伺服器。不會停止 localhost:3000、
改寫投影片或產生 server log 檔。此指令不包含瀏覽器目視驗收。
已有新版開發伺服器時也可執行 npm test（預設 localhost:3000）。

## 固定案例

- fixtures/bubble.cpp：後置 @frame、j++、比較、交換、@keep last。
- fixtures/insertion.cpp：key 取值、右移、j--、回填。
- 共用 fixtures/sorting.json：6 個元素，輸入 5 7 2 1 9 4；結果 1 2 4 5 7 9。
- assignment-indices：事件發生時的索引、不可重複執行索引函式。
- unresolved-markers：array/heap/stack 的未知指標、range、越界與取得有效值。
- heap-marker-assignment：`largest = l/r` 可直接用事件快照移動 largest，
  不要求 l/r 有自己的畫面物件；真正缺少目的指標時仍略過。
- studio-event-availability：事件表刷新、縮圖分批與取消。
- slide-animation-parity：舊 asm-view 不可覆蓋儲存設定、legacy 與 trace 互斥、儲存先完成 pending edits。
- playback-parity：真實 model/editor/player/Studio 鏡頭路徑，兩種速度、
  每幀前進、後退、重播及跳幀；SVG 邊界使用 spy，不宣稱像素驗證。
- provenance：修改/復原原始碼與輸入、CRLF、外觀設定、缺少與未來版本資料。

## 瀏覽器驗收（修改動畫、鏡頭、Studio 或投影片後）

使用隔離測試頁及本機草稿，不覆盖使用者工作內容。
1. 在 algorithm.html 實際 RUN 兩個固定案例。
2. Studio 核對畫布、目前幀、事件表與縮圖；以事件 order 而非事件類型判斷先後。
3. 上一步、下一步、1.2x 與 2.0x autoplay；前一動畫完成才進入下一幀。
4. Studio 手動拖曳仍即時；關閉 Studio 後核對一般播放器的物件、樣式與鏡頭。
5. 投影片編輯器貼入相同程式與輸入、RUN、修改事件開關/鏡頭後儲存，
   重新開啟與整頁重載後核對；runtime 只顯示畫布、控制列及必要版本提示。
6. 修改輸入/程式後出現尚未 RUN 提示，復原後消失；修改 Studio 外觀不應要求 RUN。
7. 舊投影片無 provenance 時顯示版本提示，保留原動畫，不自動編譯；
   新版成功 RUN 並儲存後提示消失。失敗 RUN 不能把舊資料標為新版。
8. 檢查 console；清楚區分新錯誤與未定位/既有錯誤。

## 版本維護

public/trace-provenance.js 同時被後端及瀏覽器使用。
ENGINE_VERSION 只在追蹤事件/狀態契約改變、需要重新 RUN 時增加；
FORMAT_VERSION 用於來源識別格式。schemaVersion 目前為 1.0。
不要因純 renderer/CSS 改善要求使用者重跑。
provenance 只由成功執行的後端產生，載入/儲存不得將舊資料升級成當前版本。
fingerprint 是變更偵測，不是安全驗證；忽略原始碼行尾格式及尾端 @asm-view 外觀區塊，
其餘程式（含 @frame 等追蹤註解）及輸入改動仍會要求 RUN。

## 2026-09-05 實測紀錄

- npm run regression：33 項測試通過，JS 語法及 diff 檢查通過。
- algorithm.html 實際 RUN 固定冒泡（17 幀）及插入排序（20 幀）。
- Studio 冒泡 1.2x、一般播放器插入排序 2x、投影片冒泡 2x 均播放至最後一幀；
  手動前後步進、事件表和縮圖已核對。
- 舊隔離草稿顯示版本提示；RUN、儲存、重開及整頁重載後提示消失，
  關閉的 j++ 事件仍保持關閉。
- 修改程式或輸入顯示 dirty 提示，復原輸入後回到 current。
- 一般編輯器 console 無 error/warn；嵌入頁關閉時仍觀察到先前已有的
  MutationObserver「parameter 1 is not of type Node」錯誤，未取得來源堆疊。
  未宣稱 console 完全通過，也未用猜測性修改隱藏此錯誤。
- 三介面畫布尺寸不同，驗收以事件/狀態/物件與鏡頭規則一致為準，
  不要求編輯工具、留白與螢幕像素完全相同。尚未涵蓋所有 draw type 的目視驗收。
