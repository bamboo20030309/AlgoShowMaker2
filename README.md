# 伺服器啟動指令
在algo-vis-backend目錄的cmd打指令

- 開啟伺服器
```
docker-compose up -d --build
```
- 關掉伺服器
```
docker-compose down
```
- 查看log
```
docker-compose logs -f backend
```

# draw 指令
首先一定要引入標頭檔 `#include "AV.hpp"` 並宣告 `AV av;` 這個演算法視覺化物件