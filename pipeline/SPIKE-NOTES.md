# SPIKE-NOTES — TDX Metro API 實測筆記（T0.3）

執行日期：2026-07-18 21:30–21:45（週五，營運時段）
測試範圍：SDD §3.2 全部 9 個端點（operator=TRTC）
樣本：節錄樣本在 `pipeline/samples/*.sample.json`（進版控）；完整回應在 `pipeline/raw/`（gitignored）

## 結論一句話

**9 個端點全部可用，資料品質比預期好；兩個設計修正——串班改以「RouteID 交路」為單位、即時校正改為「進站事件比對」。**

## 1. 四大未知數的答案

### ① LiveBoard 是「事件式看板」，不是倒數看板 ⚠️ 設計修正

- `EstimateTime` **恆為 0**（兩個時間點取樣：29 筆、33 筆，全部為 0）。
- 兩次取樣（間隔 70s）**站點零重疊** → 每筆代表「此刻有列車進站中」的瞬間事件，存活時間約等於停站秒數（25–35s）。
- `SrcUpdateTime` 與 TDX `UpdateTime` 相差約 30s → 事件時間戳要用 `SrcUpdateTime`。
- **文湖線 BR 有出現在 LiveBoard**（單次取樣 13 筆）→ 班距合成線也能靠事件校正拉回精度 ✅
- 意外發現：出現 `Y`（環狀線）紀錄 → TRTC LiveBoard 涵蓋 Y 線，P2 擴充時可用。
- ServiceStatus 目前皆 0（正常）。
- **SDD §6 修正**：校正演算法從「倒數中位數比對」改為「進站事件 vs 模擬預測到站時刻」的誤差比對（架構不變，比對邏輯改變）。

### ② ServiceDay 有四種 ServiceTag

`平日 / 假日 / 週六 / 週日` 並存（StationTimeTable 751 筆中皆有）。**同一線可能同時有「假日」與「週六／週日」版本**：管線選表規則＝特定（週六/週日）優先於通用（假日），並以 Monday–Sunday + NationalHolidays 布林欄位為準做防呆。

### ③ 文湖線 BR 確認缺席 StationTimeTable

- StationTimeTable 出現的 LineID：`BL, G, O, R`（無 BR）✅ 與 Railisland 註記一致。
- BR 合成素材齊全：Frequency 有 BR 平日/假日 2 筆（Headways 分時段 Min/MaxHeadwayMins）＋ FirstLast 46 筆 ＋ S2S BR-1 23 區間。

### ④ Shape 為 MULTILINESTRING，且附贈 EncodedPolyline

每線 1 筆，6–13 段不等（BL 7、BR 6、G 11、O 13、R 11），需縫合（SDD §4.2 設計正確）。另有 `EncodedPolyline` 欄位可作備用解析路徑。

## 2. 重大架構發現：RouteID＝營運交路（本次最有價值的發現）

S2STravelTime 的 11 筆記錄，每筆 = 一條交路的完整站鏈（含站間秒數）：

| RouteID | 起迄 | 區間數 | 性質 |
|---|---|---|---|
| BL-1 | 南港展覽館–頂埔 | 22 | 全程車 |
| BL-2 | 南港展覽館–亞東醫院 | 18 | 區間車 |
| BR-1 | 南港展覽館–動物園 | 23 | 文湖全程 |
| G-1 | 松山–新店 | 18 | 全程車 |
| G-2 | 松山–台電大樓 | 11 | 區間車 |
| G-3 | 七張–小碧潭 | 1 | 支線接駁 |
| O-1 | 迴龍–南勢角 | 20 | 雙尾之一 |
| O-2 | 蘆洲–南勢角 | 16 | 雙尾之二 |
| R-1 | 淡水–象山 | 26 | 全程車 |
| R-2 | 北投–大安 | 17 | 區間車 |
| R-3 | 北投–新北投 | 1 | 支線接駁 |

StationTimeTable 也帶 RouteID + Direction(0/1) → **串班演算法直接以（RouteID × Direction）為單位執行**，站鏈取自 S2S。原設計「per 線串班＋另外捕捉區間車」可以簡化並更可靠：區間車、支線本來就是獨立交路。
**SDD §4.3 修正、風險降級**：串班誤串風險 中 → 低。

## 3. 其他結構事實

- **Station**：121 站，四語站名（Zh/En/Ja/Ko），含經緯度、GeoHash、行政區。
- **StationOfLine**：5 線；⚠️ 支線站折疊在主線序列**尾端**（G 序列最後是 G03A、R 序列最後是 R22A；O 序列 O21 後跳號至 O50–O54）→ 不可直接當路徑用，站鏈一律以 S2S 交路為準。
- **StationTimeTable**：751 筆（站×方向×交路×ServiceTag）；`DepartureTime` 為 **HH:MM 分鐘精度**（無秒）→ 串班容差 ±90s 合理；TrainType 抽樣皆 0（北捷無跳蛙車種）。平日全網發車時刻總數約 42,000 筆（BL 11,856 / G 7,912 / O 9,942 / R 12,344）。
- **S2STravelTime**：RunTime 例 112s；StopTime 分佈 0, 23–34s…（0 為端點站）。
- **FirstLastTimetable**：243 筆，無 ServiceTag，用 Monday–Sunday 布林＋NationalHolidays。
- **Frequency**：22 筆，含 RouteID、OperationTime（06:00–24:00）、Headways[]（分時段 PeakFlag + Min/MaxHeadwayMins）。
- **Alert**：物件 `{UpdateTime, UpdateInterval:60, Alerts:[]}`；正常時 Alerts 內是一筆「正常營運」（AlertID=0, Status=1）→ 前端要過濾掉「正常營運」才顯示橫幅。

## 4. 限流實測 ⚠️ 影響管線與代理設計

- 連續快發：**第 6 個請求起 429**（前 5 個成功）→ 免費層突發額度極小。
- 429 後等 65s 恢復；以 **15s 間隔**連續呼叫 4 次無異常。
- 新建金鑰有**生效延遲**（本次實測約 1.5 分鐘內三次 401/invalid_client 後成功）。
- 設計落實：管線端點間隔 ≥15s（每日全抓 9 端點約 2.5 分鐘，可接受）；代理 `/api/live` 輪詢週期 ≥15s（CDN 共享快取本來就是 15s，安全）；所有抓取器一律帶 429 退避重試。

## 5. Schema 凍結結論（SDD §8 修訂）

`network.json` 以**交路（route）**為一等公民：

```jsonc
{
  "version": "2026-07-18",
  "lines": [{ "id": "R", "name": "淡水信義線", "color": "#E3002C",
    "routes": [{
      "id": "R-1", "kind": "full",            // full | short | branch
      "stations": ["R28", "R27", ...],         // 依 S2S 站鏈（方向 0 順序）
      "runTimes": [148, ...], "stopTimes": [30, ...],
      "shape": [[lon, lat], ...], "chainage": [0, ...]
    }],
    "stations": [{ "id": "R28", "zh": "淡水", "en": "Tamsui", "lonlat": [...], "km": {} }]
  }]
}
// tt-{weekday|sat|sun}.json：trips 掛 route
// { "route": "R-1", "dir": 0, "synthetic": false, "stops": [{ "s": "R28", "d": 21600 }, ...] }
// 到站時刻 = 發車時刻（分鐘精度）；a 省略，渲染時以 S2S StopTime 推回進站時刻
```

## 6. 對計畫的影響彙整

| 項目 | 變更 |
|---|---|
| SDD §3.3 | 以本筆記事實改寫 |
| SDD §4.3 | 串班單位改（RouteID × Direction）；風險 中→低 |
| SDD §6 | 校正改「進站事件比對」；事件時間戳用 SrcUpdateTime |
| SDD §8 | schema 以 route 為一等公民（上節） |
| PRD §9 | 「串班誤串」風險降級；新增「LiveBoard 為事件式、樣本稀疏」風險（等級低，靠連續累積校正） |
| M1 | T1.5（支線與區間車）工作量下修——交路維度天然涵蓋 |
