# 人生大富翁：Cloudflare 即時連線版

本專案已從單檔 HTML 與 Firebase REST 輪詢改為可維護的前後端結構：前端位於 `public/`，Cloudflare Worker 與 Durable Object 位於 `src/`，D1 schema migration 位於 `migrations/`。活動採用單一全域遊戲，不需要房號，也不需要使用者貼 Firebase 網址。

## 使用者入口

網站首頁 `/` 預設就是隊員與觀眾入口，只顯示目前是否有唯一一場開放活動，並提供唯讀觀戰。首頁不再顯示「參加方式」或其他公開操作說明；使用者可以透過畫面底部導覽列切換到隊輔入口或主持人控制台。

| 導覽入口 | 用途 | 驗證方式 |
|---|---|---|
| 觀戰 | 隊員與觀眾查看即時遊戲狀態 | 不需密碼 |
| 隊輔 | 選擇隊伍、輸入隊伍 PIN 並操作自己的隊伍 | 先輸入隊輔密碼 `iii` |
| 控制台 | 建立、開始、暫停、恢復、結束活動，管理隊輔 | 先輸入主持人密碼 `aaa` |

`/team` 與 `/admin` 仍保留為可分享或重新整理後使用的深層連結，但現在兩個入口都會先顯示對應的密碼閘門。密碼只會在瀏覽器 session 中使用，後端也會再次驗證，不能只依賴前端畫面限制。

## 活動與即時連線

主持人從控制台建立唯一活動並設定隊伍數。建立完成後，控制台會顯示各隊一次性 PIN，請私下交給對應隊輔。隊輔選擇自己的隊伍並輸入 PIN，以 WebSocket 連線後操作該隊；觀眾從首頁進入同一場活動並唯讀觀戰。若已有活動，系統會阻止再次建立，必須由主持人結束活動後才可建立下一場。

所有隊伍動作先送到同一個 Durable Object，由後端驗證角色、活動 token 與隊伍權限，再更新狀態並廣播給房內連線。主持人可以開始、暫停、恢復與結束活動，重新抽籤分配基地、進入下一階段、調整隊伍資源、更新隊名、控制股市與關卡，並查看目前隊輔是否在線或踢除隊輔。即使主持人的控制台分頁已經關閉，仍可由控制台的關閉活動 API 結束目前活動。活動結束與遊戲事件會保存到 D1 歷史紀錄。

前端已拆分為 `index.html`、`styles.css`、`app.js` 與 `game-core.js`；後端為 `src/worker.js`。遊戲規則模組 `game-core.js` 同時供瀏覽器與 Worker 使用，避免前後端規則分叉。

底部導覽採用與棋盤一致的像素遊戲語言，改為較輕巧的浮動 HUD：米白底、金色選取狀態、硬陰影與內嵌 crisp SVG 圖示。三個入口分別代表觀戰、隊輔與控制台；進入實際遊戲畫面後會自動收起導覽，將螢幕空間完整留給棋盤與操作區。

活動使用 Durable Object alarm 管理生命週期。每次建立活動、有效遊戲動作、主持人控制或隊伍連線狀態變更都會更新最後活動時間；若活動連續閒置 3 小時，即使所有分頁都已關閉，`GameRoom` 仍會由 alarm 提交 `idleTimeout` 系統事件、廣播結束狀態並寫入 D1。正式期限由 `IDLE_TIMEOUT_MS = 10800000` 控制；本地測試可覆寫成較短毫秒數。

## PWA 與快取更新

網站包含 `manifest.webmanifest`、192／512 像素圖示與 Service Worker，可加入 iOS 或 Android 主畫面。iOS 請使用 Safari 開啟網站，按分享後選擇「加入主畫面」；Android 請使用 Chrome 開啟網站，依瀏覽器顯示的「安裝應用程式」或「加到主畫面」提示操作。

每次版本更新都會同步修改 `public/version.json` 與 `public/sw.js` 的 `BUILD_VERSION`／cache name。Service Worker 使用 network-first 策略取得 HTML、JavaScript、CSS 與 manifest；新版本安裝後會清除舊版本快取，前端偵測到更新時會顯示更新提示。API 與 WebSocket 不會被 Service Worker 快取，因此不需要再以無痕模式進入網站。目前前端版本為 `2026.08.19.6`。

## Cloudflare 資源

| 資源 | 設定 |
|---|---|
| Worker | `preview` |
| D1 | `preview-history` |
| D1 UUID | `8bff07c3-bffd-433a-adc9-1ea0a2b7c350` |
| Durable Object | `GameRoom`，binding `GAME_ROOMS` |
| GitHub | `Johnson8187/preview`，`main` |

D1 的 `games`、`game_events` 與索引已套用；`wrangler.toml` 已經包含實際 `database_id`、SPA fallback、Durable Object migration，以及以 SHA-256 儲存的主持人／隊輔密碼雜湊變數。正式活動前若要更換密碼，請重新計算雜湊並更新 `[vars]`，不要把明文密碼寫入程式碼。

## Cloudflare Dashboard 設定

連接 GitHub `Johnson8187/preview` 後，Root directory 使用 `/`，Build command 留空，Deploy command 使用 `npx wrangler@latest deploy`。啟用 production branch `main`；如要測試其他分支，可開啟 non-production branch builds 與 preview URLs。

日後修改 `migrations/` 時，先在具備 Cloudflare 授權的環境執行：

```bash
npx wrangler@latest d1 migrations apply preview-history --remote
npx wrangler@latest deploy
```

若 Workers Builds 不允許在 build 階段執行遠端 migration，請分開執行 migration 與部署，再 push 一個觸發 commit。

## 成本與限制

Durable Object 使用 WebSocket Hibernation API，以降低閒置連線的執行成本。80–100 人同房、低頻遊戲操作時，預期負載不高，但 Workers、Durable Objects 與 D1 的請求、執行時間、WebSocket 活躍時間與 D1 讀寫量仍受 Cloudflare 方案額度與計費規則約束。正式活動前請查看 Cloudflare Usage／Analytics 並設定用量通知；不要把「預估在免費額度內」當成費用保證。

完整部署與活動操作請參考 [`CLOUDFLARE_DEPLOY.md`](./CLOUDFLARE_DEPLOY.md)。

## 參考資料

[1]: https://developers.cloudflare.com/workers/ "Cloudflare Workers 文件"
[2]: https://developers.cloudflare.com/durable-objects/ "Cloudflare Durable Objects 文件"
[3]: https://developers.cloudflare.com/d1/ "Cloudflare D1 文件"
[4]: https://web.dev/learn/pwa/installation/ "web.dev：PWA 安裝指南"
