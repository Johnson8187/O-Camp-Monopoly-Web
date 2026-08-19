# preview

這是一個以 Cloudflare Workers Assets 部署的單頁 HTML 網站。網站首頁位於 `public/index.html`，部署設定位於 `wrangler.toml`。

## Cloudflare Workers Builds 設定

在 Cloudflare Dashboard 將此 repository 連接到 Worker 時，請使用以下設定：

- Production branch：`main`
- Root directory：`/`
- Build command：留空
- Deploy command：`npx wrangler@latest deploy`
- Non-production branch builds：若要使用 preview URL，請啟用
- Preview URLs：請啟用

此專案不需要 npm install 或 build step。每次推送至 `main` 會部署正式版本；其他 branch 的推送會產生對應的 branch preview（若已啟用 non-production branch builds）。

## 本機驗證

若本機已安裝 Wrangler，可在 repository 根目錄執行：

```bash
npx wrangler@latest deploy
```

Cloudflare 會依照 `wrangler.toml` 將 `public/` 目錄作為靜態資產部署。
