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

D1 schema 已套用到遠端資料庫，包含 `games`、`game_events` 及必要索引。`wrangler.toml` 已經寫入實際 D1 UUID、Durable Object migration 與 SPA fallback，因此直接開啟 `/admin` 或 `/team` 也會回傳同一個前端入口。

## 1. 連接 GitHub

在 Cloudflare Workers & Pages 中選擇建立或開啟 Worker，連接 `Johnson8187/preview` 的 `main` 分支。Root directory 使用 `/`，Build command 留空，Deploy command 使用 `npx wrangler@latest deploy`。這不是傳統前端框架，不需要 `npm install` 或 bundler build。

請啟用 production branch `main` 的部署；如要測試其他分支，可開啟 non-production branch builds 與 preview URLs。每次 push 到 `main` 都會觸發 Worker 部署。

## 2. 三個入口

假設 Worker 網址為 `https://preview.example.workers.dev`，三個入口如下：

| 網址 | 使用者 | 用途 |
|---|---|---|
| `https://preview.example.workers.dev/` | 隊員／觀眾 | 顯示唯一一場活動是否開放，進入唯讀觀戰 |
| `https://preview.example.workers.dev/team` | 隊輔 | 選擇隊伍並輸入主持人提供的隊伍 PIN |
| `https://preview.example.workers.dev/admin` | 主持人 | 建立、開始、暫停、恢復、結束活動與管理隊輔 |

主持人建立活動後，請從主控台複製隊輔入口與觀戰入口。系統同一時間只允許一場活動；活動結束後才可在 `/admin` 建立下一場。

## 3. 部署與驗證

正式部署命令：

```bash
npx wrangler@latest deploy
```

部署完成後，請開啟以下網址確認三個入口都能載入：

```text
/
/team
/admin
```

也可以確認 API：

```text
/api/lobby
```

它應回傳 JSON 格式的唯一開放活動清單；沒有活動時應回傳空陣列。WebSocket 端點由前端自動使用同一個 Worker 網址的 `/ws/{活動識別}`，不需要手動貼任何 Firebase 網址。

## 4. 實際使用流程

主持人先進入 `/admin`，輸入活動名稱與隊伍數量，按下「建立並開放活動」。建立後，主持人控制台會顯示各隊一次性 PIN，請透過私下方式交給對應隊輔。隊輔進入 `/team`，選擇自己的隊伍並輸入 PIN；隊員與觀眾進入 `/` 後選擇「進入觀戰」。

主持人可以重新抽籤、開始遊戲、暫停或恢復活動、切換階段、調整隊伍名稱與資源、公布股市、解封關卡、查看 D1 歷史紀錄、結束活動，以及在「隊輔連線」區塊踢除目前在線的隊輔。被踢的隊輔 WebSocket 會立即關閉，該隊回到未連線狀態；隊輔可以重新輸入正確 PIN 加入。觀眾為唯讀，隊輔只能操作自己的隊伍。

主持人的 token 與隊伍 PIN 只在建立活動時回傳給主持人，瀏覽器會保存在該主持人的本機 session，讓主持人重新整理 `/admin` 後可以回到自己的主控台。不要把 token 或 PIN 提交到 GitHub，也不要貼到公開群組。

## 5. Schema migration

目前遠端 D1 migration 已完成。日後修改 `migrations/` 時，先在具備 Cloudflare 授權的環境套用新的版本，再部署 Worker：

```bash
npx wrangler@latest d1 migrations apply preview-history --remote
npx wrangler@latest deploy
```

不要把 API token 寫入 repository。Workers Builds 若不允許在 build 階段執行遠端 migration，請把 migration 與 deployment 分成兩個步驟，完成 migration 後再 push 一個觸發 commit。

## 6. 權限、WebSocket 與成本注意事項

Durable Object 會驗證主持人、隊輔與觀眾的角色，再接受動作並廣播狀態；WebSocket 使用 Hibernation API，以降低閒置連線的執行成本。80–100 人同房、低頻遊戲操作時，預期負載不高，但 Workers、Durable Objects 與 D1 的請求、執行時間、WebSocket 活躍時間與 D1 讀寫量仍受方案額度與計費規則約束。

正式活動前請查看 Cloudflare Usage／Analytics 並設定用量通知。不要把「預估在免費額度內」當成費用保證；若 Cloudflare 方案已達額度，應依官方計費頁確認是否需要升級或調整活動設計。
