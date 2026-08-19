# 人生大富翁：Cloudflare 即時連線版

本專案已從單檔 HTML 與 Firebase REST 輪詢改為可維護的前後端結構：前端位於 `public/`，Cloudflare Worker 與 Durable Object 位於 `src/`，D1 schema migration 位於 `migrations/`。

## 功能架構

主持人建立活動後，公開大廳會列出目前開放中的活動。隊輔選擇活動、選擇自己的隊伍並輸入隊伍 PIN 後，以 WebSocket 連線並操作該隊；觀眾不需要密碼，選擇活動即可唯讀觀戰。每個活動對應一個 Durable Object，所有動作由後端驗證角色後更新遊戲狀態並廣播給房內連線。

歷史事件與最新狀態保存於 D1。前端已拆分為 `index.html`、`styles.css`、`app.js` 與 `game-core.js`；後端為 `src/worker.js`。遊戲規則模組 `game-core.js` 同時供瀏覽器與 Worker 使用，避免前後端規則分叉。

## Cloudflare 資源

| 資源 | 設定 |
|---|---|
| Worker | `preview` |
| D1 | `preview-history` |
| D1 UUID | `8bff07c3-bffd-433a-adc9-1ea0a2b7c350` |
| Durable Object | `GameRoom`，binding `GAME_ROOMS` |
| GitHub | `Johnson8187/preview`，`main` |

D1 的 `games`、`game_events` 與索引已套用；`wrangler.toml` 已經包含實際 `database_id`。

## Cloudflare Dashboard 設定

連接 GitHub `Johnson8187/preview` 後，Root directory 使用 `/`，Build command 留空，Deploy command 使用 `npx wrangler@latest deploy`。啟用 production branch `main`；如要測試其他分支，可開啟 non-production branch builds 與 preview URLs。

日後修改 `migrations/` 時，先在具備 Cloudflare 授權的環境執行：

```bash
npx wrangler@latest d1 migrations apply preview-history --remote
npx wrangler@latest deploy
```

若 Workers Builds 不允許在 build 階段執行遠端 migration，請分開執行 migration 與部署，再 push 一個觸發 commit。

## 使用方式

主持人從首頁建立活動並設定隊伍數。建立完成後，主持人控制台會顯示各隊 PIN，請私下交給對應隊輔。隊輔在公開活動清單選擇活動、選擇隊伍並輸入 PIN；觀眾直接選擇「進入觀戰」。主持人可以控制遊戲階段、隊伍名稱、資源、股市與關卡，並查看 D1 歷史紀錄。

## 成本與限制

Durable Object 使用 WebSocket Hibernation API，以降低閒置連線的執行成本。80–100 人同房、低頻遊戲操作時，預期負載不高，但 Workers、Durable Objects 與 D1 的請求、執行時間、WebSocket 活躍時間與 D1 讀寫量仍受 Cloudflare 方案額度與計費規則約束。正式活動前請查看 Cloudflare Usage／Analytics 並設定用量通知；不要把「預估在免費額度內」當成費用保證。

完整操作請參考 [`CLOUDFLARE_DEPLOY.md`](./CLOUDFLARE_DEPLOY.md)。
