# 捷奏 JieZou — 北捷即時地圖

依 TDX 當日時刻表推演台北捷運全網列車、並以官方到站看板即時校正的互動地圖。
列車位置為時刻表推演＋看板校正，非官方車載定位；請以現場資訊為準。

## 文件

- [PRD.md](PRD.md) 產品需求 ・ [SDD.md](SDD.md) 系統設計 ・ [TASKS.md](TASKS.md) 任務拆解
- 開發流程採 phase 制（PDCA），各 phase 計畫在 [plans/](plans/)

## 結構

```
web/       前端（Vite + TypeScript + Leaflet）
api/       Vercel Serverless Functions（TDX 代理）
pipeline/  資料管線（抓取 TDX、建置路網與時刻 JSON）
```

## 開發

```bash
npm install
npm run dev          # 前端 dev server
npm run auth-check   # 驗證 .env 的 TDX 金鑰（先複製 .env.example 為 .env）
npm run build        # 產出 web/dist
```

## 資料來源與授權

- 資料來源：交通部 TDX 運輸資料流通服務平臺、臺北大眾捷運股份有限公司（政府資料開放授權條款）
- 底圖：© OpenStreetMap contributors, © CARTO
- 程式碼授權：[MIT](LICENSE)
