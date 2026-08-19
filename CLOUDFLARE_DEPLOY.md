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

D1 schema 已套用到遠端資料庫，包含 `games`、`game_events` 及必要索引。`wrangler.toml` 已經寫入實際 D1 UUID，Cloudflare Builds 不需要再替換 placeholder。

## 1. 連接 GitHub

在 Cloudflare Workers & Pages 中選擇建立或開啟 Worker，連接 `Johnson8187/preview` 的 `main` 分支。Root directory 使用 `/`，Build command 留空，Deploy command 使用 `npx wrangler@latest deploy`。這不是傳統前端框架，不需要 `npm install` 或 bundler build。

請啟用 production branch `main` 的部署；如要測試其他分支，可開啟 non-production branch builds 與 preview URLs。每次 push 到 `main` 都會觸發正式 Worker 部署。

## 2. 部署與驗證

正式部署命令：

```bash
npx wrangler@latest deploy
```

部署完成後，請先開啟 Worker 首頁，再確認：

```text
/api/lobby
```

它應回傳 JSON 格式的開放活動清單。首頁會定期更新活動清單；WebSocket 端點由前端自動使用同一個 Worker 網址的 `/ws/{活動識別}`。

## 3. 使用流程

主持人從首頁建立活動並設定隊伍數。建立完成後，主持人控制台會顯示各隊一次性 PIN，請私下交給對應隊輔。隊輔在公開活動清單選擇活動、選擇隊伍並輸入 PIN；觀眾直接選擇「進入觀戰」。

主持人的活動控制台可以重新抽籤、開始遊戲、切換階段、調整隊伍名稱與資源、公布股市、解封關卡、查看 D1 歷史紀錄及結束活動。觀眾為唯讀，隊輔只能操作自己的隊伍。

## 4. Schema migration

目前遠端 D1 migration 已完成。日後修改 `migrations/` 時，先在具備 Cloudflare 授權的環境套用新的版本，再部署 Worker：

```bash
npx wrangler@latest d1 migrations apply preview-history --remote
npx wrangler@latest deploy
```

不要把 API token 寫入 repository。Workers Builds 若不允許在 build 階段執行遠端 migration，請把 migration 與 deployment 分成兩個步驟，完成 migration 後再 push 一個觸發 commit。

## 5. 權限、WebSocket 與成本注意事項

主持人 token 與隊伍 PIN 只在建立活動時回傳給主持人，D1 只保存 SHA-256 hash。Durable Object 會驗證主持人、隊輔與觀眾的角色，再接受動作並廣播狀態；WebSocket 使用 Hibernation API，以降低閒置連線的執行成本。

80–100 人同房、低頻遊戲操作時，通常不會因單純的靜態檔案傳輸產生額外頻寬費，但 Workers、Durable Objects 與 D1 的請求、執行時間、WebSocket 活躍時間、D1 讀寫量仍受方案額度與計費規則約束。正式活動前請查看 Cloudflare Usage／Analytics，並設定用量通知；不要把「預估在免費額度內」當成費用保證。
