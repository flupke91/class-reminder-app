# tools/legacy

教务系统（超星 `gmu.jw.chaoxing.com`）抓取与解析的**探索期一次性脚本**，全部为
逆向过程留档，不参与 App 运行时，也不被 `index.html` 或 `tools/gmu/` 引用。

保留原因：里面的接口探测、字段猜解、KB（keybundle）解密尝试记录了当时怎么把
课表接口摸出来的，将来教务系统改版时是现成的排查起点。

| 前缀 | 用途 |
|---|---|
| `fetch_grid*.js` | 三代课表接口取数尝试，最终方案在 `tools/gmu/` |
| `open-kb*.js` / `find-kb.js` / `watch-kb.js` / `read-home-kb.js` / `mine-js*.js` | 定位并尝试解开教务系统的 JS 打包 |
| `probe*.js` / `explore-menu.js` / `dump-raw.js` | 页面结构探测与原始响应落盘 |
| `analyze*.js` / `compare-parse.js` / `render-weeks.js` / `report-grid.js` / `show-today.js` | 解析结果比对与人工核对 |
| `relogin.js` / `qr-login.js` / `open-login.js` / `scan-history.js` / `check-*.js` | 登录态与历史数据排查 |
| `watch*.js` / `watcher.js` / `retry-grid.js` | 轮询与失败重试 |
| `check-学时.js` | 学时字段核对 |

**真正的抓取入口是 [`../gmu/`](../gmu/)**，解析单测在 [`../test-parsers.js`](../test-parsers.js)。
这里的脚本按当时的登录态和接口快照写的，直接运行大概率已经跑不通，当文档看即可。
