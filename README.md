# 人生大富翁 — 營隊即時互動大地遊戲平台

> **© 2026 不「管」別人「工」蝦毀 都來「電」惦賭「醫」把 版權所有**

本專案專為營隊大型大地遊戲設計，結合 **3D 像素立體棋盤**、**多人即時 WebSocket 連線**、**全域動畫排隊佇列** 與 **邊緣無伺服器架構**（Cloudflare Workers + Durable Objects + D1 Database）。全場採用單一全域遊戲房，免去繁瑣房號與手動設定，提供流暢的營隊互動體驗。

---

## 🌟 核心特色

### 1. 🎮 3D 沉浸式棋盤與視效系統
- **立體動態運鏡（3D Dynamic Camera）**：擲骰、移動與升級時視角平滑聚焦至目標格子，帶來強烈的遊戲沉浸感。
- **微縮隊伍圖標（Compact Board Pins）**：採用 2×2 緊湊排列與微型徽章，同一格多隊駐留時絕不遮擋周圍棋盤。
- **3D 升級光框**：基地升級時觸發 3D 金色光柱與慶祝光環。
- **蟲洞瞬間躍遷**：踏入蟲洞格觸發吸入旋渦，0ms 瞬間傳送至對應蟲洞並綻放躍出光環。
- **8-bit Web Audio 即時音效**：內建投骰、移動踏步、金幣收支、警報爆炸等合成音效，支援一鍵靜音切換。

### 2. ⚡ 多人並行與全域特效排隊佇列（FIFO Animation Queue）
- **多隊同時操作防衝突**：多位隊輔同時擲骰、升級或發動特殊攻擊時，系統自動排隊並依序播放動畫，保證所有效果清晰完整、不搶鏡、不漏拍。
- **主持人防呆機制**：主控台即時顯示「排隊播放中」狀態，若有動畫正在播映會提示等待完成，防止切換階段造成前後端不同步。

### 3. ⚔️ 特殊操作與全螢幕戰術打擊
- **隨機地震**：7×7 範圍波及，震央承受 1.5 倍修繕費。
- **戰術飛彈**：全螢幕雷達瞄準鎖定排行榜相鄰競爭隊伍，精準打擊。
- **超級颱風**：7×7 暴風圈旋轉肆虐，外圈支付修繕費，颱風眼反而獲得獎金。
- **野火焚城**：烈焰隨機橫向延燒 1–2 排所有基地。
- 後端嚴格驗證每隊每回合每招限發動一次，未成功發動不扣點數。

### 4. 🏰 基地經營與即時經濟系統
- **操作面板動態標註**：
  - 🟢 **升級基地**：即時顯示所需點數（例如 `升級基地（消耗 6 點）`）。
  - 🟡 **賣出基地**：依當前回合股市倍率即時計算收益（例如 `賣出基地（+$500）`）。
  - 🔵 **買回基地**：清楚顯示買回成本（例如 `買回基地（$500）`），當回合賣出自動鎖定下回合開放。
- **監獄狀態防護**：入獄組別於擲骰階段自動鎖定並顯示服刑中提示，不觸發多餘移動動畫。

### 5. 📱 跨平台 PWA 與響應式體驗
- **電腦端純粹體驗**：桌面瀏覽器自動隱藏安裝按鈕，介面簡潔乾淨。
- **行動端 PWA 安裝指引**：Android Chrome 提供一鍵原生安裝提示；iOS Safari 提供清楚的 3 步「加入主畫面」教學。
- **多裝置無痛換手**：隊伍卡片即時顯示在線狀態，支援同隊多裝置登入與熱接手。

---

## 🚪 使用者入口與權限

| 導覽入口 | 用途 | 驗證方式 | 存取路徑 |
|---|---|---|---|
| **觀戰** | 隊員與觀眾查看即時大棋盤、排行榜與遊戲快報 | 免密碼直接進入 | `/` |
| **隊輔** | 輸入共用密碼後直接點選所屬隊伍進行各項操作 | 隊輔密碼（預設 `iii`） | `/team` |
| **控制台** | 建立活動、抽籤、推進階段、調整數值、管理隊伍 | 主持人密碼（預設 `aaa`） | `/admin` |

---

## 🏗️ 專案目錄結構

```text
├── public/                  # 前端靜態資源
│   ├── app.js               # 前端核心邏輯、UI 渲染與 WebSocket 通訊
│   ├── game-core.js         # 遊戲核心規則（前後端共用）
│   ├── game-fx.js           # 動畫隊列、3D 運鏡、音效與粒子特效
│   ├── styles.css           # 像素風格樣式、3D 棋盤與 RWD 佈局
│   ├── index.html           # 應用程式入口
│   ├── sw.js                # Service Worker 快取管理（Network-First）
│   └── manifest.webmanifest # PWA 安裝設定
├── src/                     # 後端 Cloudflare Workers 架構
│   ├── worker.js            # Worker 路由、REST API 與 Durable Object (GameRoom)
│   └── game-core.js         # 供 Worker 使用之核心規則模組
├── migrations/              # D1 資料庫結構遷移檔
├── test-game-core.mjs       # 核心規則單元測試
├── test-game-fx.mjs         # 動畫與音效模組測試
├── test-reliability.mjs     # 階段防呆與可靠性測試
├── wrangler.toml            # Cloudflare Worker 部署設定
└── CLOUDFLARE_DEPLOY.md     # Cloudflare 完整部署手冊
```

---

## 🧪 自動化測試與驗證

專案內建完整的自動化測試套件，涵蓋核心遊戲規則、動畫隊列邏輯、可靠性防護與語法檢核：

```bash
# 執行所有測試套件與前端模組語法檢查
node test-game-core.mjs
node test-game-fx.mjs
node test-reliability.mjs
node --check ./public/app.js
node --check ./public/sw.js
node --check ./public/game-fx.js
node --check ./src/worker.js
```

---

## ☁️ Cloudflare 部署與維運

| 資源 | 設定 | 說明 |
|---|---|---|
| **Worker** | `preview` | 提供 API、靜態資源路由與 WebSocket 握手 |
| **Durable Object** | `GameRoom` (binding: `GAME_ROOMS`) | 單一全域遊戲房間，維護即時狀態與 WebSocket Hibernation |
| **D1 Database** | `preview-history` (`8bff07c3-bffd-433a-adc9-1ea0a2b7c350`) | 保存活動紀錄與完整歷史事件日誌 |
| **GitHub Repo** | `Johnson8187/O-Camp-Monopoly-Web` | `main` 分支自動觸發 Cloudflare 部署 |

### 快速部署指令

```bash
# 套用 D1 遠端資料庫遷移
npx wrangler@latest d1 migrations apply preview-history --remote

# 部署至 Cloudflare Workers
npx wrangler@latest deploy
```

> 完整部署與環境配置細節請參閱 [`CLOUDFLARE_DEPLOY.md`](./CLOUDFLARE_DEPLOY.md)。

---

## 📄 版權宣告

**© 2026 不「管」別人「工」蝦毀 都來「電」惦賭「醫」把 版權所有**
