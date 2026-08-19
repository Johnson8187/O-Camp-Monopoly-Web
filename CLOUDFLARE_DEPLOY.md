# Cloudflare Workers Builds 部署指南

## 專案內容

本專案是純靜態 HTML 網站。首頁檔案位於 `public/index.html`，Cloudflare 設定位於 `wrangler.toml`。本專案沒有 npm 依賴，也不需要建置工具；Wrangler 會直接把 `public/` 作為 Workers Assets 部署。

## GitHub repository

建議使用 repository 名稱 `preview`，預設分支使用 `main`。如果 GitHub 上的 repository 尚未建立，請先建立一個空的 repository，然後上傳本資料夾內的所有檔案，保留以下結構：

```text
.
├── .gitignore
├── CLOUDFLARE_DEPLOY.md
├── README.md
├── public/
│   └── index.html
└── wrangler.toml
```

## Cloudflare Dashboard 設定

在 Cloudflare Dashboard 選擇 **Workers & Pages**，建立新的 Worker 或選取現有 Worker，然後進入 **Settings → Builds → Connect**，連接 GitHub repository。Worker 名稱請設定為 `preview`，並將專案根目錄設為 repository 根目錄 `/`。

請使用以下 Build 設定：

| 欄位 | 值 |
|---|---|
| Production branch | `main` |
| Root directory | `/` |
| Build command | 留空 |
| Deploy command | `npx wrangler@latest deploy` |
| Non-production branch builds | 開啟 |
| Preview URLs | 開啟（若 Dashboard 顯示此選項） |

由於本專案是純靜態 HTML，**Build command 必須留空**。如果 Dashboard 強制要求填寫，可以使用 `echo "No build step required"`，但正常情況下不需要這一欄。

## 如何觸發 preview

將 `main` 以外的 branch 推送到 GitHub，例如：

```bash
git checkout -b preview-test
git add .
git commit -m "Test preview deployment"
git push -u origin preview-test
```

啟用 non-production branch builds 後，Cloudflare 會為該 branch 建立預覽部署。預覽網址通常會依照 branch 與 Worker 名稱產生，例如：

```text
https://preview-test-preview.<你的-account-subdomain>.workers.dev
```

每次對同一 branch 推送新 commit，該 branch preview URL 會指向最新版本。Pull request 的留言中也可能同時提供 commit preview URL 與 branch preview URL；實際網址以 Cloudflare Dashboard 或 Pull request 留言顯示為準。

## 本機驗證

在 repository 根目錄執行：

```bash
npx wrangler@latest deploy --dry-run
```

這只會驗證設定並列出要上傳的靜態資產，不會部署。正式部署命令是：

```bash
npx wrangler@latest deploy
```

## 注意事項

`wrangler.toml` 中的 `name = "preview"` 必須與 Cloudflare Worker 名稱一致。若你在 Dashboard 使用其他 Worker 名稱，請同步修改 `wrangler.toml` 的 `name`，再提交一次 Git commit。

Cloudflare 的 Workers preview URL 不是裸的 `preview.workers.dev`。它會包含你的帳號子網域，以及 branch 或 commit 前綴；如果你需要固定的自訂網址，則要另外設定自有網域與 custom domain 或 route。

## 官方參考資料

[1]: https://developers.cloudflare.com/workers/ci-cd/builds/ "Cloudflare Workers Builds"
[2]: https://developers.cloudflare.com/workers/ci-cd/builds/configuration/ "Cloudflare Workers Builds configuration"
[3]: https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/ "Cloudflare Workers build branches"
[4]: https://developers.cloudflare.com/changelog/post/2025-07-23-workers-preview-urls/ "Cloudflare Workers preview URLs"
