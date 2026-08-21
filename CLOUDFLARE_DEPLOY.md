# Cloudflare 部署設定

## 目前資源

本專案使用下列 Cloudflare 資源：

| 資源 | 設定 |
|---|---|
| Worker | `preview` |
| D1 database | `preview-history` |
| D1 UUID | `8bff07c3-bffd-433a-adc9-1ea0a2b7c350` |
| D1 primary region | `APAC` |
| Durable Object | `GameRoom`，binding 名稱 `GAME_ROOMS` |
| GitHub | `Johnson8187/preview`，`main` 分支 |

D1 schema 已套用到遠端資料庫，包含 `games`、`game_events`、`system_settings` 及必要索引。`wrangler.toml` 已經寫入實際 D1 UUID、Durable Object migration、SPA fallback 與密碼雜湊變數，因此直接開啟 `/team`、`/admin` 或 `/dev` 也會回傳同一個前端入口並進入對應密碼閘門。

## 1. 連接 GitHub

在 Cloudflare Workers & Pages 中選擇建立或開啟 Worker，連接 `Johnson8187/preview` 的 `main` 分支。Root directory 使用 `/`，Build command 留空，Deploy command 使用 `npx wrangler@latest deploy`。這不是傳統前端框架，不需要 `npm install` 或 bundler build。

請啟用 production branch `main` 的部署；如要測試其他分支，可開啟 non-production branch builds 與 preview URLs。每次 push 到 `main` 都會觸發 Worker 部署。

## 2. 入口與角色驗證

假設 Worker 網址為 `https://preview.example.workers.dev`，首頁 `/` 預設只作觀戰入口。畫面底部導覽列提供三個公開角色入口：觀戰、隊輔與控制台。另有專屬**隱藏開發者後台** `/dev`。

| 導覽入口 | 使用者 | 用途 | 密碼與設定 |
|---|---|---|---|
| `/` 或觀戰 | 隊員／觀眾 | 顯示唯一一場活動並進入唯讀觀戰 | 不需密碼 |
| `/team` 或隊輔導覽 | 隊輔 | 快速選擇隊伍加入 | `iii` |
| `/admin` 或控制台導覽 | 主持人 | 建立、開始、暫停、恢復、結束活動與管理隊輔 | `aaa` |
| `/dev`（隱藏網址，不顯示於導覽列） | 開發者／管理員 | 查看 D1 歷史詳細紀錄、事件審計、SQL 查詢、DO 伺服器開關控制 | `8187`（或透過 Worker Secret `DEV_PASSWORD` 設定） |

`/team` 與 `/admin` 是保留的深層連結，而 `/dev` 為完全隱藏的開發者後台，不論在首頁或手機版底部導覽列皆不會露出。前端登入只是使用者體驗的一部分；`/api/auth`、`/api/dev/*`、建立活動、WebSocket `hello` 與關閉活動 API 都會在 Worker 端再次驗證。密碼的 SHA-256 雜湊或 Worker Secret 保證不會在程式碼中暴露明文密碼。

### 開發者密碼 Secret 設定：
可隨時透過 Wrangler CLI 或 Cloudflare Dashboard 設定密碼，不需在 GitHub 公開 repo 存放明文密碼：
```bash
npx wrangler secret put DEV_PASSWORD
# 輸入密碼（例如 8187）
```

## 3. 部署與驗證

正式部署命令如下：

```bash
npx wrangler@latest deploy
```

部署完成後，請以一般瀏覽器分別確認首頁、隊輔深層連結、主持人深層連結與開發者後台都能載入：

```text
/
/team
/admin
/dev
```

也可以確認公開大廳 API：

```text
/api/lobby
```

它應回傳 JSON 格式的唯一開放活動清單；沒有活動時應回傳空陣列。角色登入 API 可用下列形式測試：

```bash
curl -X POST https://preview.example.workers.dev/api/dev/auth \
  -H 'content-type: application/json' \
  -d '{"password":"8187"}'

curl -X POST https://preview.example.workers.dev/api/auth \
  -H 'content-type: application/json' \
  -d '{"role":"host","password":"aaa"}'

curl -X POST https://preview.example.workers.dev/api/auth \
  -H 'content-type: application/json' \
  -d '{"role":"team","password":"iii"}'
```

WebSocket 端點由前端自動使用同一個 Worker 網址的 `/ws/{活動識別}`，不需要手動貼任何 Firebase 網址。

## 4. 實際使用流程

主持人先開啟首頁底部的「控制台」，輸入密碼 `aaa`，再輸入活動名稱與隊伍數量並建立活動。隊輔開啟底部的「隊輔」入口，輸入密碼 `iii`，直接點擊選擇自己的隊伍；隊員與觀眾直接進入首頁後選擇「進入觀戰」。

主持人可以重新抽籤、開始遊戲、暫停或恢復活動、切換階段、調整隊伍名稱與資源、公布房市、解封關卡、查看 D1 歷史紀錄，以及在「隊輔連線」區塊踢除目前在線的隊輔。被踢的隊輔 WebSocket 會立即關閉，該隊回到未連線狀態；隊輔可以重新輸入正確密碼加入。

主持人按下「關閉活動」時，前端會呼叫 `/api/games/{id}/close`。這個 API 不依賴主持人 WebSocket 仍然存在，因此即使主持人原本的控制台分頁意外關閉，重新登入控制台後仍可關閉目前活動。活動結束後，公開大廳會恢復為沒有開放活動的狀態，才可建立下一場。

開發者可隨時手動開啟 `/dev` 輸入密碼 `8187` 進入開發者後台：
- **DO 伺服器開關**：一鍵開啟或關閉 Durable Object 伺服器。關閉時後端將全域阻擋建立新活動與即時連線。
- **D1 活動記錄與事件審計**：檢視所有活動狀態與歷史事件日誌、依事件類型/角色篩選、匯出完整 JSON。
- **SQL 控制台**：直接在瀏覽器執行 D1 SQL 查詢與除錯。
- **系統維護**：批次清理過期活動紀錄與資料表健康檢查。

活動建立時，Worker 會為對應的 `GameRoom` Durable Object 設定 alarm。建立活動、有效遊戲動作、主持人控制與隊伍連線狀態變更都會刷新 `games.updated_at`；若連續 `IDLE_TIMEOUT_MS` 沒有活動，alarm 會重新讀取 D1 確認時間，提交 `idleTimeout` 系統事件、標記活動為 ended、廣播結束狀態並關閉 WebSocket。正式設定為 `10800000` 毫秒，也就是 3 小時；這個機制不依賴瀏覽器分頁或前端計時器。

## 5. PWA 與快取更新

部署內容包含 `public/manifest.webmanifest`、`public/icon.svg`、192／512 像素圖示、`public/sw.js` 與 `public/version.json`。iOS 使用 Safari 開啟正式網址，從分享選單選擇「加入主畫面」；Android 使用 Chrome 開啟正式網址，依瀏覽器顯示的「安裝應用程式」或「加到主畫面」提示操作。

每次前端版本更新時，請同步提高 `BUILD_VERSION`，並更新 `public/version.json` 與 Service Worker 的 `CACHE_NAME`。目前版本為 `2026.08.22.36`。底部導覽使用棋盤墨黑、金色格線、紅色玩家標記與內嵌像素 SVG 圖示，不依賴外部圖片資產。Service Worker 對同源靜態檔採用 network-first；每次啟用新版本會刪除舊 cache，前端則在偵測到新版本時顯示更新提示。`/api/`、`/ws/` 與 `sw.js` 不會被 Service Worker 快取，因而避免遊戲狀態或認證流程被舊資料卡住。

若使用者仍看到舊畫面，先重新整理一次；若是已安裝的 PWA，關閉後重新開啟並選擇畫面上的更新提示即可。一般情況不需要使用無痕模式。

## 6. Schema migration

日後修改 `migrations/` 時，先在具備 Cloudflare 授權的環境套用新的版本，再部署 Worker：

```bash
npx wrangler@latest d1 migrations apply preview-history --remote
npx wrangler@latest deploy
```

不要把 API token 寫入 repository。Workers Builds 若不允許在 build 階段執行遠端 migration，請把 migration 與 deployment 分成兩個步驟，完成 migration 後再 push 一個觸發 commit。

## 7. 本地測試

執行所有自動化測試：

```bash
npm test
```

遊戲規則 smoke test 則執行：

```bash
node test-game-core.mjs
```

部署前可檢查 Worker 封裝內容：

```bash
npx wrangler@latest deploy --dry-run
```

## 8. 權限、WebSocket 與成本注意事項

Durable Object 會驗證主持人、隊輔與觀眾的角色，再接受動作並廣播狀態；WebSocket 使用 Hibernation API，以降低閒置連線的執行成本。80–100 人同房、低頻遊戲操作時，預期負載不高，但 Workers、Durable Objects 與 D1 的請求、執行時間、WebSocket 活躍時間與 D1 讀寫量仍受方案額度與計費規則約束。

正式活動前請查看 Cloudflare Usage／Analytics 並設定用量通知。不要把「預估在免費額度內」當成費用保證；若 Cloudflare 方案已達額度，應依官方計費頁確認是否需要升級或調整活動設計。

## 參考資料

[1]: https://developers.cloudflare.com/workers/ "Cloudflare Workers 文件"
[2]: https://developers.cloudflare.com/durable-objects/ "Cloudflare Durable Objects 文件"
[3]: https://developers.cloudflare.com/d1/ "Cloudflare D1 文件"
[4]: https://web.dev/learn/pwa/installation/ "web.dev：PWA 安裝指南"
