# Phase 計畫 — M0：環境建置與 API 去風險

| 項目 | 內容 |
|---|---|
| 狀態 | 🟡 規劃中（待用戶確認開工） |
| 預估 / 實際耗時 | 2.5 人日 / — |
| 對應任務 | TASKS.md T0.1–T0.4 |
| 開始 / 完成日期 | — / — |

## 1. 目標（Plan）

1. 專案骨架（`web/`、`api/`、`pipeline/`）推上 GitHub `sc126-cornell/Railisland-`，push 即自動產生 Vercel 預覽網址。
2. TDX 全部 9 個端點實測完成、樣本落盤，SDD §8 的資料 schema **凍結**（或依實測修訂並記錄差異）。
3. 專案兩大未知數——LiveBoard 的 EstimateTime 單位、StationTimeTable 實際結構（無車次號的具體樣態）——從「假設」變成「已知」。

**可展示物**：`SPIKE-NOTES.md`（9 端點實測筆記）＋一個打得開的 Vercel 預覽網址（暫為空白地圖頁）。

## 2. 工作項目（Do）

- [ ] T0.1 👤 **用戶本人**：至 tdx.transportdata.tw 註冊會員、建立 API 金鑰（client id/secret），提供後我寫入本地 `.env`（不進 git）
- [ ] T0.2 Repo 初始化：monorepo 結構、Vite＋TS、ESLint/Prettier、MIT LICENSE、`.gitignore`、接上 GitHub remote
- [ ] T0.3 TDX API Spike：9 端點實測（SDD §3.2 清單）、樣本存 `pipeline/samples/`、發現寫入 `SPIKE-NOTES.md`
- [ ] T0.4 Vercel 接線：建立 Vercel 專案、連 repo、設 TDX 環境變數、`/api/health` 部署跑通

## 3. Verify — 技術驗證（對照 SDD）

- [ ] `pipeline/auth-check.ts` 成功換發 TDX token（證據：執行輸出）
- [ ] `pipeline/samples/` 內 9 端點各一份當日 JSON 樣本
- [ ] `SPIKE-NOTES.md` 明確記錄四件事：LiveBoard EstimateTime 單位；ServiceDay／平假日型式；文湖線 StationTimeTable 是否缺席；Shape WKT 格式與碎片程度
- [ ] push → Vercel 自動部署出預覽網址，`/api/health` 回 200
- [ ] 金鑰安全：`.env` 不在 git 歷史、Vercel env 設定完成

## 4. Validate — 需求驗收（對照 PRD）

- [ ] SDD §8 schema 凍結或修訂完成；PRD §9 風險表前兩項（串班可行性、LiveBoard 單位）依實測重新評級
- [ ] 用戶看過 SPIKE-NOTES.md 摘要，同意 schema 結論與 M1 開工前提成立

## 5. Check 紀錄（完成後填寫）

### Code Review
（待填）

### Verify 結果
（待填）

### Validate 結果
（待填）

### 偏差與學習
（待填）

## 6. 用戶確認（Gate）

- [ ] 已向用戶回報 M0 結果並取得進入 M1 的確認（日期：＿＿＿）
