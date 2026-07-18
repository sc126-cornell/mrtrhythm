# Phase 計畫 — M0：環境建置與 API 去風險

| 項目 | 內容 |
|---|---|
| 狀態 | 🟠 檢查完成（待用戶 Gate 確認進 M1） |
| 預估 / 實際耗時 | 2.5 人日 / 約 0.5 人日（單晚完成，Spike 異常順利） |
| 對應任務 | TASKS.md T0.1–T0.4 |
| 開始 / 完成日期 | 2026-07-18 / 2026-07-18 |

## 1. 目標（Plan）

1. 專案骨架（`web/`、`api/`、`pipeline/`）推上 GitHub `sc126-cornell/Railisland`（2026-07-18 已由 `Railisland-` 改名修正），push 即自動產生 Vercel 預覽網址。
2. TDX 全部 9 個端點實測完成、樣本落盤，SDD §8 的資料 schema **凍結**（或依實測修訂並記錄差異）。
3. 專案兩大未知數——LiveBoard 的 EstimateTime 單位、StationTimeTable 實際結構（無車次號的具體樣態）——從「假設」變成「已知」。

**可展示物**：`SPIKE-NOTES.md`（9 端點實測筆記）＋一個打得開的 Vercel 預覽網址（暫為空白地圖頁）。

## 2. 工作項目（Do）

- [x] T0.1 👤 **用戶本人**：至 tdx.transportdata.tw 註冊會員、建立 API 金鑰（client id/secret），提供後我寫入本地 `.env`（不進 git）（2026-07-18 完成：金鑰生效延遲約 1.5 分鐘後 `auth-check` ✅，token 效期 24h）
- [x] T0.2 Repo 初始化：monorepo 結構、Vite＋TS、ESLint/Prettier、MIT LICENSE、`.gitignore`、接上 GitHub remote（2026-07-18 完成：initial commit 已推上 main；`npm run build` 129ms 通過；`auth-check` 缺金鑰時友善提示；Dropbox 已忽略 node_modules/dist）
- [x] T0.3 TDX API Spike：9 端點實測（SDD §3.2 清單）、樣本存 `pipeline/samples/`、發現寫入 `SPIKE-NOTES.md`（2026-07-18 完成：9/9 端點成功；四大未知數全數解答；發現 RouteID＝交路、LiveBoard 為事件式；SDD §3.3/§4.3/§6/§8 已修訂、schema 凍結；詳見 [pipeline/SPIKE-NOTES.md](../pipeline/SPIKE-NOTES.md)）
- [x] T0.4 Vercel 接線：建立 Vercel 專案、連 repo、`/api/health` 部署跑通（2026-07-18 完成：專案名 `mrtrhythm`（exw 團隊）；import 時 Vite 框架誤判導致兩次失敗，改 dashboard 四欄位 Override 後綠燈；公開網址 https://mrtrhythm.vercel.app 200、`/api/health` ok:true。⚠️ TDX 環境變數延後到 M4 設定——health 不需金鑰，見偏差紀錄）

## 3. Verify — 技術驗證（對照 SDD）

- [x] `pipeline/auth-check.ts` 成功換發 TDX token（✅ 實跑輸出：token 效期 24h；含金鑰生效延遲 1.5 分鐘的重試紀錄）
- [x] `pipeline/samples/` 內 9 端點各一份當日 JSON 樣本（✅ 9/9，另含 LiveBoard 兩時點樣本供語意判讀）
- [x] `SPIKE-NOTES.md` 明確記錄四件事（✅ EstimateTime 恆 0＝事件式；ServiceTag 四種；BR 確認缺席；Shape=MULTILINESTRING 6–13 段＋EncodedPolyline）
- [x] push → Vercel 自動部署，`/api/health` 回 200（✅ curl 實測 `{"ok":true,"service":"jiezou","phase":"M0"}`；BUILD M0b 上線）
- [x] 金鑰安全：`.env` 不在 git 歷史（✅ `git check-ignore` 驗證；Vercel env 延後 M4，見偏差）

## 4. Validate — 需求驗收（對照 PRD）

- [x] SDD §8 schema 凍結或修訂完成；PRD §9 風險表依實測重新評級（✅ SDD §3.3/§4.3/§6/§8 修訂；串班風險中→低；新增 LiveBoard 稀疏風險=低）
- [x] 用戶看過 SPIKE-NOTES.md 摘要（✅ 已於對話回報兩大發現與 schema 結論；正式同意隨本 phase Gate 一併確認）

## 5. Check 紀錄（2026-07-18 填寫）

### Code Review
- 範圍：pipeline/（lib.ts、auth-check.ts、spike.ts）、api/health.ts、web/ 骨架、組態檔。
- `npm run lint`（ESLint + typescript-eslint recommended）零發現；`npm run build`（tsc --noEmit + vite）綠燈。
- 發現與處置：
  1. spike.ts 屬一次性工具，429 重試上限後落入一般錯誤路徑——可接受，不投資重構。
  2. lib.ts 的 `loadEnv` 以 process.env 覆蓋 .env（dotenv 慣例）——保留，CI／Vercel 環境相容。
  3. vercel.json 與 dashboard Override 並存——保留作組態文件化；實際生效以 dashboard 為準，M4 動代理時再統一。
  4. 無單元測試框架——M0 無演算法可測（驗證靠腳本實跑），M1 引入 validate.ts 驗證器起建。

### Verify 結果
§3 五項全數通過（各項證據見上方核取註記）。

### Validate 結果
§4 兩項通過；SPIKE 摘要已回報，正式同意隨 Gate 確認。

### 偏差與學習
1. **Vercel env（TDX 金鑰）延後至 M4**：/api/health 不需金鑰；避免在 M0 多一道用戶手動設定。M4 的 T4.1 前置補上。
2. **Vercel import 的框架自動偵測是坑**：monorepo 下誤判 Vite 導致兩次部署失敗（找根目錄 dist）；解法＝dashboard 四欄位明確 Override。教訓：對非常規結構，明確組態勝過自動偵測。
3. **TDX 兩個營運事實**：新金鑰生效延遲約 1.5 分鐘；免費層突發限流 5 次/窗口——已回寫 SDD §3.1。
4. **Vercel 專案名 `mrtrhythm`**（用戶自取）；團隊生成網址有 SSO 保護屬正常，公開網址為 mrtrhythm.vercel.app。
5. 估時 2.5 人日 vs 實際 ~0.5 人日：Spike 未遇到需要反覆試錯的障礙（RouteID 發現反而簡化了後續設計）。

## 6. 用戶確認（Gate）

- [ ] 已向用戶回報 M0 結果並取得進入 M1 的確認（日期：＿＿＿）
