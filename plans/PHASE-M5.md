# Phase 計畫 — M5：打磨與上線

| 項目 | 內容 |
|---|---|
| 狀態 | 🔵 進行中（2026-07-18 M4 Gate 通過後開工） |
| 預估 / 實際耗時 | 5.5 人日 / — |
| 對應任務 | TASKS.md T5.1–T5.6 |
| 開始 / 完成日期 | 2026-07-18 / — |

## 1. 目標（Plan）

1. **每日資料 CI**：GitHub Actions 每日 04:10（台北）自動抓 TDX → 建置 → 驗證 → 有變更才 commit（觸發 Vercel 部署）；驗證不過即失敗、保留昨日資料。
2. **外觀完稿**：深色模式手動切換（自動／亮／暗三段）、iOS 安全區、OG 分享卡、favicon、關於面板（資料來源＋免責＋MIT）。
3. **效能完稿**：尖峰 151 班實測 fps 達標。
4. **對外發佈**：repo 轉 Public（MIT 已備）、Beta 驗收清單走查。

**可展示物**：一個可以丟到社群的完成品連結＋自動保鮮的資料管線。

## 2. 工作項目（Do）

- [ ] T5.4 每日資料 CI：`.github/workflows/daily-data.yml`（04:10 台北）＋repo secrets（TDX 金鑰）＋變更偵測 commit
- [ ] T5.3 外觀三段切換（自動／亮／暗）：UI 鈕＋localStorage＋底圖磚切換
- [ ] T5.2 行動打磨：iOS 安全區（safe-area-inset）、時間列手機寬度
- [ ] T5.5 發佈配件：OG meta＋favicon＋關於面板（資料來源／免責／GitHub 連結）
- [ ] T5.1 尖峰效能：時間旅行至平日 08:30（151 班）實測 fps
- [ ] T5.6 Beta 走查：PRD §7 成功指標逐項核對；repo 轉 Public（經用戶最後確認）

## 3. Verify — 技術驗證

- [ ] CI 手動觸發一次全綠（fetch→build→validate→commit 判斷）；secrets 不出現在 log
- [ ] 外觀三段：切換即生效、重載記憶；暗色底圖磚正確
- [ ] 尖峰 08:30 模擬：桌機 ≥55fps、手機（用戶回報）順暢
- [ ] OG 卡在通訊軟體預覽正常；favicon 顯示
- [ ] `lint`／`build`／`validate` 綠燈；部署後實測

## 4. Validate — 需求驗收（對照 PRD §6/§7）

- [ ] 用戶走查 Beta 清單（PRD §7）：對板 ≤45s（白天抽查）、手機體驗、關於面板內容正確
- [ ] 用戶確認 repo 轉 Public 時機
- [ ] 用戶同意 M5 結案＝專案 v1.0 出貨 🎉

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

- [ ] 已向用戶回報 M5 結果並取得 v1.0 出貨確認（日期：＿＿＿）
