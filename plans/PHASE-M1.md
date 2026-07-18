# Phase 計畫 — M1：資料管線

| 項目 | 內容 |
|---|---|
| 狀態 | 🔵 進行中（2026-07-18 M0 Gate 通過後開工） |
| 預估 / 實際耗時 | 7 人日 / — |
| 對應任務 | TASKS.md T1.1–T1.6 |
| 開始 / 完成日期 | 2026-07-18 / — |

## 1. 目標（Plan）

1. TDX 原始資料 → `web/public/data/network.json`：11 條交路的幾何（Shape 縫合＋切片）、車站、站間秒數，幾何無斷裂、無鋸齒繞行。
2. StationTimeTable → `tt-{weekday|sat|sun}.json`：按（交路×方向）串班，認領率 ≥95%；文湖線以 Frequency 合成（標記 synthetic）。
3. `validate.ts` 驗證器（門檻不過 exit 1，供 CI 使用）＋ debug 疊圖頁（隨站部署，瀏覽器直接目檢）。

**可展示物**：https://mrtrhythm.vercel.app/debug.html 看到全路網幾何與車站；驗證報告全綠。

執行順序依垂直切片：每一步先讓淡水信義線（R-1/R-2/R-3）通過，再放大到全網。

## 2. 工作項目（Do）

- [ ] T1.1 `pipeline/fetch.ts`：7 個靜態端點抓取器＋當日快取（raw/ 已有今日資料則跳過）、15s 節流、429 退避
- [ ] T1.2 `pipeline/build-network.ts`：WKT 解析 → 分段縫合（端點 <30m）→ 車站投影 → 按交路切片組裝 → network.json；含 debug 疊圖頁
- [ ] T1.3 `pipeline/build-timetable.ts`：按（RouteID×Direction）串班（容差 90s），產出三種 serviceDay 的 trips
- [ ] T1.4 文湖線合成：FirstLast＋Frequency＋S2S 等間隔發車，`synthetic: true`
- [ ] T1.5 交路完整性：11 條交路全數產出（區間車、支線即獨立交路，Spike 已證實無需另行捕捉）
- [ ] T1.6 `pipeline/validate.ts`：驗證門檻自動化＋報告

## 3. Verify — 技術驗證（對照 SDD §4）

- [ ] fetch：快取命中則零 API 呼叫；強制重抓時節流生效（實跑證據）
- [ ] network.json：11 交路齊全；每站投影偏移 <150m（超標列警告清單）；各交路組裝長度與量級合理（R-1 約 26–32km、BR-1 約 25km 級）
- [ ] debug 頁人工目檢：無斷裂、無跨河直線、支線（小碧潭／新北投）與 O 雙尾正確分岔
- [ ] 串班：認領率 ≥95%；同一時刻零雙認領；trip 內時刻嚴格遞增；站間耗時落在 S2S ±60s
- [ ] BR 合成：全日班次數與官方班距量級一致（人工抽查尖峰／離峰各一段）
- [ ] `npm run lint`、`npm run build` 綠燈

## 4. Validate — 需求驗收（對照 PRD F1/F2 的資料前提）

- [ ] 用戶開 debug 頁目檢路網（特別看：淡水河跨橋段、北投—新北投、O 線雙尾、南港展覽館雙線交會）
- [ ] 平日／假日班次總量與北捷公開資訊量級相符（抽查）
- [ ] 用戶同意資料品質足以進 M2（列車動畫）

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

- [ ] 已向用戶回報 M1 結果並取得進入 M2 的確認（日期：＿＿＿）
