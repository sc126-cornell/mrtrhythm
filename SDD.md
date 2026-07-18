# SDD — 捷奏・北捷即時地圖 系統設計文件

| 項目 | 內容 |
|---|---|
| 版本 | v1.0（2026-07-18 定稿） |
| 日期 | 2026-07-18 |
| 狀態 | 🟢 定稿 |
| 相關文件 | [PRD.md](PRD.md)、[TASKS.md](TASKS.md) |

---

## 1. 架構總覽

核心思想：**「重的事情離線做，輕的事情前端做，即時的事情薄薄一層代理」**。

```
┌─────────────────────┐        ┌──────────────────────┐
│  資料管線 (離線)      │        │  TDX 開放資料平台      │
│  Node/TS scripts     │◄──────►│  靜態: 路網/時刻/班距   │
│  每日 GitHub Actions │        │  即時: LiveBoard/Alert │
└─────────┬───────────┘        └──────────┬───────────┘
          │ 產出 data/*.json（commit 進 repo）│
          ▼                                │
┌─────────────────────────────────────────┼───────────┐
│  Vercel（用戶既有帳號）                    │            │
│  ┌───────────────┐   ┌─────────────────▼─────────┐ │
│  │ 靜態網站 (CDN) │   │ /api/* Serverless Functions │ │
│  │ index + data  │   │ token管理・LiveBoard快取15s  │ │
│  └───────┬───────┘   └─────────────────┬─────────┘ │
└──────────┼─────────────────────────────┼───────────┘
           ▼                             │ 每20s輪詢
┌─────────────────────────────────────────▼───────────┐
│  瀏覽器前端（無框架 TypeScript）                        │
│  班表載入 → 活躍班次索引 → 位置插值 → Canvas 渲染        │
│                     ▲                               │
│              即時校正（相位平移）                       │
└─────────────────────────────────────────────────────┘
```

三個部件、三種生命週期：

1. **資料管線**（`pipeline/`，每日跑一次）：抓 TDX → 清洗縫合路網 → 串班次 → 產出靜態 JSON，commit 進 repo 觸發 Vercel 自動部署。
2. **API 代理**（`api/`，Vercel Functions）：只做三件事——藏 TDX 金鑰、共享快取（讓 API 呼叫數與使用者數脫鉤）、瘦身回應。
3. **前端**（`web/`，純靜態）：所有模擬計算都在瀏覽器，零後端依賴也能跑（退化為純時刻表模式）。

## 2. 技術選型與決策記錄（ADR）

| # | 決策 | 選擇 | 理由 | 狀態 |
|---|---|---|---|---|
| ADR-1 | 整體形態 | 靜態 SPA＋離線資料管線＋薄代理 | Railisland 驗證過的形態；資料一天只變一次，不需要動態後端 | ✅ 定案 |
| ADR-2 | 地圖渲染 | **Leaflet 1.9 ＋ 自繪 Canvas 列車圖層**；備案 MapLibre GL | 北捷同時在線列車約 60–120 列，Canvas 綽綽有餘；Leaflet 簡單、Railisland 同款驗證過。MapLibre 有向量瓦片與平滑旋轉但複雜度高，列為 P2 重評 | ✅ 定案 |
| ADR-3 | 前端框架 | 不用框架：Vite ＋ TypeScript ＋ 模組化 vanilla | UI 面板數量有限；避免框架綁定；效能關鍵路徑（每幀插值）本來就在框架外 | ✅ 定案 |
| ADR-4 | 部署 | **Vercel（用戶既有帳號）**：靜態＋Serverless Functions | 用戶已有帳號與工作流；CDN `s-maxage` 可實現共享快取；本 session 有整合可直接部署 | ✅ 定案 |
| ADR-5 | 底圖 | CARTO raster basemap（light/dark 兩套） | 免費、乾淨、Railisland 同款；需標示版權 | ✅ 定案 |
| ADR-6 | 資料更新 | GitHub Actions 每日 04:10 跑管線 → commit → Vercel 自動部署 | 資料進 repo 有版本可回溯；管線失敗不影響線上（沿用昨日資料） | ✅ 定案 |
| ADR-7 | 程式碼授權 | MIT ＋ 明確標示資料來源 | 記取 Railisland 無 LICENSE 的教訓 | ✅ 定案 |

## 3. 資料來源（TDX）

### 3.1 認證

- OAuth2 client credentials：`POST https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token`
- `grant_type=client_credentials`，token 有效期約 1 天；金鑰存於 Vercel 環境變數與本地 `.env`（不進 repo）。
- 免費方案限流（2026-07-18 實測：連續快發第 6 個請求起 429、等 65s 恢復；15s 間隔穩定）→ 一切即時呼叫走代理集中快取；抓取器一律帶 429 退避。新建金鑰需約 1–3 分鐘生效。

### 3.2 端點清單（operator = `TRTC`，base = `https://tdx.transportdata.tw/api/basic`）

| 端點 | 用途 | 使用時機 |
|---|---|---|
| `/v2/Rail/Metro/Station/TRTC` | 車站清單（含經緯度、雙語站名） | 管線・每日 |
| `/v2/Rail/Metro/StationOfLine/TRTC` | 各路線站序 | 管線・每日 |
| `/v2/Rail/Metro/Shape/TRTC` | 路線幾何（WKT LINESTRING） | 管線・每日 |
| `/v2/Rail/Metro/S2STravelTime/TRTC` | 站間行駛秒數＋停靠秒數 | 管線・每日 |
| `/v2/Rail/Metro/Frequency/TRTC` | 尖離峰班距 | 管線・每日（文湖線合成用） |
| `/v2/Rail/Metro/FirstLastTimetable/TRTC` | 首末班車 | 管線・每日 |
| `/v2/Rail/Metro/StationTimeTable/TRTC` | 各站逐班時刻表（文湖線不提供） | 管線・每日（核心） |
| `/v2/Rail/Metro/LiveBoard/TRTC` | 即時到站看板 | 代理・營運時段輪詢 |
| `/v2/Rail/Metro/Alert/TRTC` | 營運告警 | 代理・低頻輪詢 |

> ⚠️ M0 的 T0.3 API Spike 會實測每個端點並保存樣本（`pipeline/samples/`），確認欄位、單位（LiveBoard 的 EstimateTime 以秒或分計）、`ServiceDay` 型式後，才凍結本文件第 8 節的 schema。

### 3.3 已知資料特性（2026-07-18 Spike 實測確認，詳見 [pipeline/SPIKE-NOTES.md](pipeline/SPIKE-NOTES.md)）

- **RouteID＝營運交路**（全網 11 條，全程／區間／支線各自獨立，例：BL-2 南港展覽館–亞東醫院、R-3 北投–新北投）；S2STravelTime 每筆即一條交路的完整站鏈——串班以（RouteID × Direction）為單位（見 4.3）。
- **StationTimeTable 無車次號、DepartureTime 為 HH:MM 分鐘精度**；ServiceTag 四種（平日／假日／週六／週日）並存，選表規則＝特定（週六/週日）優先於通用（假日）。
- **文湖線 BR 無 StationTimeTable** → 用 FirstLast＋Frequency＋S2S 合成並標記 `synthetic`；BR 有出現在 LiveBoard，可靠事件校正。
- **LiveBoard 為事件式看板**：EstimateTime 恆 0，每筆＝「列車進站中」瞬間事件（存活約等於停站秒數）；源時間戳用 SrcUpdateTime（落後即時約 30s）。
- **StationOfLine 站序不可當路徑**（支線站折疊在序列尾端：G03A、R22A、O50–O54）；站鏈一律以 S2S 交路為準。
- Shape 為 MULTILINESTRING（每線 6–13 段，需縫合），另有 EncodedPolyline 欄位備用。
- 環狀線屬新北捷運（NTMC），不在 TRTC 靜態資料內（LiveBoard 意外含 Y 線事件）——P2 擴充時另接。

## 4. 資料管線設計（`pipeline/`）

### 4.1 流程

```
fetch_tdx.ts ──► raw/（原始 JSON，本地快取）
build_network.ts ──► data/network.json     路網幾何＋車站
build_timetable.ts ──► data/tt-{weekday|sat|sun}.json   逐班時刻
validate.ts ──► 驗證報告（不過門檻則 CI 失敗，保留昨日資料）
```

### 4.2 build_network — 路網建置

1. Shape WKT → 座標序列；多段碎片**縫合**（端點距離 < 30m 視為相連），去除重疊段與機廠側線毛刺。
2. 沿線計算**累積里程**（chainage，公尺）。
3. 車站以最近點**投影吸附**到線上，記錄每站里程 `km`；支線（新北投、小碧潭）獨立成線處理，於分歧站共站。
4. 產出 debug 疊圖頁（本地 HTML）供人工檢查幾何。

### 4.3 build_timetable — 串班演算法（Spike 後風險降級：中→低）

輸入：StationTimeTable（站×方向×**交路**的發車時刻序列，HH:MM 分鐘精度、無車次號）＋ S2S 交路站鏈與站間秒數。

```
for 每條交路 RouteID × 每方向 Direction:      // 全網 11 條交路，站鏈取自 S2S
  以交路起站的時刻序列為錨（每個時刻 = 一個候選班次）
  for 每個發車時刻 t0:
    trip = [(s0, t0)]; t_expect = t0
    沿交路站鏈推進:
      t_expect += RunTime + StopTime
      在下一站（同交路同方向）序列中找 |t - t_expect| ≤ 容差(預設90s) 且未被認領的最近時刻
      找到 → 認領並加入 trip，t_expect 校正為實際值
      找不到 → 以 t_expect 合成該停靠（標記 estimated），繼續
```

區間車與支線本身即獨立交路（BL-2、G-2、G-3、R-2、R-3），無需另行捕捉。

**實作後修訂（2026-07-18，認領率實測 99.7–100%）**：
1. 同一（RouteID×Direction）可含多個**終點群組**，且群組可超出該交路的 S2S 站鏈（BL-2 dir0 兼有往南港展覽館／往昆陽；R-2 實際營運為北投↔象山）——按 DestinationStaionID 分組，每組在同線所有交路鏈（含反向）中找「涵蓋全站＋終點在下游」的最短裁切段串班。
2. **中途起點班次**（平日大安發車往北投等出庫車）以殘餘時刻逐站重新錨定（cascade）捕捉，平日約 190 班；只認領到起點一筆者視為雜訊（全網個位數）。
3. **G-2 僅平日行駛**——validate.ts 的交路涵蓋檢查按日別允許缺席清單。

驗收門檻（validate.ts 強制）：
- 各站時刻**認領率 ≥ 95%**；同一時刻不得被兩班認領。
- Trip 內時刻嚴格遞增；站間耗時落在 S2S ±60s 內。
- 全日班次數與官方公告量級一致（人工抽查）。

### 4.4 文湖線合成

FirstLast 定營運窗 → Frequency 依時段給班距 → 等間隔發車，S2S 推進到底站；全部標記 `synthetic: true`（UI 顯示「班距推算」徽章）。

## 5. 前端架構（`web/src/`）

```
core/clock.ts        模擬時鐘：simTime = wallTime + offset，倍速、暫停
core/schedule.ts     班表載入、依 (start,end) 排序的活躍班次索引（二分查找）
core/position.ts     班次 × 時間 → 線上里程 → 經緯度（插值＋加減速）
core/calibrate.ts    即時校正（相位平移，見 §6）
map/basemap.ts       Leaflet 初始化、底圖、路線與車站圖層
map/trains.ts        Canvas 列車圖層：繪製、命中測試（點擊半徑 12px）
ui/panel-station.ts  車站看板
ui/follow.ts         跟車模式（鏡頭、資訊卡、速度曲線）
ui/timebar.ts        時間軸與倍速控制
state.ts             輕量 pub/sub（無框架）
```

### 5.1 位置計算（每幀）

1. `schedule.active(simTime)` 以二分找出進行中班次（北捷尖峰約 100±，全日班次估 3–4 千）。
2. 對每班：二分找目前停靠區間 `(dep_i, arr_i+1)` → 進度 `p = (t - dep_i)/(arr_i+1 - dep_i)`。
3. **加減速模型**：梯形速度曲線（出站加速段、巡航、進站減速段），把線性 p 重映射為里程比例——站區動態更貼真。
4. 里程 → 在 chainage 陣列二分 → 線段內插得經緯度與方位角。
5. Canvas 一次重繪全部列車（單 draw pass）；省電模式降至 30fps。

估算：120 班 × 每幀兩次二分＋插值 ≈ 微秒級，效能瓶頸在繪製而非計算，Canvas 足夠。

### 5.2 渲染細節

- 縮放 < 13：列車畫成 4px 圓點；≥ 13：圓角膠囊＋方向；≥ 15：顯示終點站縮寫。
- 車站點擊優先於列車；命中測試用螢幕座標網格索引。
- 跟隨中每幀 `map.panTo`（無動畫），拖曳即解除鎖定、顯示「回到列車」。

## 6. 即時校正設計

- 前端營運時段每 **20s** 呼叫 `/api/live`。LiveBoard 為**事件式**（每筆＝「列車進站中」、EstimateTime 恆 0），回應為近期進站事件（站、終點、SrcUpdateTime）。
- 對每筆事件：在同交路同方向的模擬列車中，找「預測到站時刻最接近事件時刻」者，誤差＝模擬預測−實際事件；對每（交路, 方向）取**誤差中位數**（剔除 |誤差| > 5min 離群值；事件時間戳用 SrcUpdateTime）。
- 得到 offset 後**平滑收斂**（每幀移動 10%，上限 ±180s）——避免列車瞬移。
- 文湖線（synthetic）同樣校正，是拉回精度的主要手段。
- 看板無資料（收班／異常）→ 停止校正、看板面板顯示對應狀態；`/api/alerts` 顯示告警橫幅。
- **回放／快轉模式（非現在時刻）不校正**，回到「現在」才重新啟用。

## 7. API 代理設計（`api/`，Vercel Functions）

| 路由 | 上游 | 快取策略 | 回應 |
|---|---|---|---|
| `GET /api/live` | Metro LiveBoard/TRTC | `Cache-Control: s-maxage=15, stale-while-revalidate=30`（CDN 層共享） | 瘦身後事件陣列：`[{sta, dest, srcTime}]` |
| `GET /api/alerts` | Metro Alert/TRTC | `s-maxage=60` | `[{title, level, time}]` |

- **金鑰不出後端**：TDX client id/secret 存 Vercel env；token 於函式記憶體快取並於過期前刷新（冷啟動時重新換發，可接受）。
- CDN 共享快取意義：不論多少使用者，TDX 實際被打的頻率 ≈ 每 15s 一次/區域節點，與流量脫鉤。
- CORS 限定自家網域；上游逾時 3s，失敗回 `503 + Retry-After`，前端靜默退化。

## 8. 資料格式（2026-07-18 Spike 後凍結）

```jsonc
// data/network.json —— 交路（route）為一等公民
{
  "version": "2026-07-18",
  "lines": [{
    "id": "R", "name": "淡水信義線", "color": "#E3002C",   // 官方 CIS 色以管線內建表為準
    "stations": [{ "id": "R28", "zh": "淡水", "en": "Tamsui", "lonlat": [121.4455, 25.1683] }],
    "routes": [{
      "id": "R-1", "kind": "full",                // full | short | branch
      "stations": ["R28", "R27", ...],             // S2S 站鏈（Direction 0 順序）
      "runTimes": [148, ...],                      // 站間秒數（長度 = 站數-1）
      "stopTimes": [30, ...],                      // 各站停靠秒數
      "shape": [[lon, lat], ...],                  // 縫合後幾何
      "chainage": [0, 412, ...],                   // shape 每點累積公尺
      "stationKm": [0, 912, ...]                   // 各站投影在 shape 上的里程（公尺）
    }]
  }]
}

// data/tt-{weekday|sat|sun}.json
{
  "serviceDay": "weekday",
  "trips": [{
    "route": "R-1", "dir": 0, "synthetic": false,
    "stops": [{ "s": "R28", "d": 21600 }, ...]     // d = 發車秒（午夜起，跨日 > 86400）；分鐘精度
  }]                                                // 進站時刻由 d − StopTime 反推
}
```

尺寸估算：平日全網發車時刻實測約 42,000 筆（BL 11,856／G 7,912／O 9,942／R 12,344，另加 BR 合成）→ gzip 後約 300–600KB；超標則按線拆檔延遲載入。

## 9. 專案結構與部署

```
/                     repo 根
├─ web/               前端（Vite + TS）→ Vercel 靜態輸出
│  └─ public/data/    管線產出的 JSON
├─ api/               Vercel Serverless Functions（live / alerts）
├─ pipeline/          資料管線（Node + TS，本地與 CI 執行）
├─ PRD.md / SDD.md / TASKS.md
└─ .github/workflows/daily-data.yml   每日 04:10 抓資料 → commit → 觸發 Vercel 部署
```

- 部署：GitHub repo（`sc126-cornell/Railisland-`）連結 Vercel 專案，push 即部署；本 session 具 Vercel 整合，可直接代操部署與環境變數設定。
- 監測：Vercel Analytics（Web Vitals）＋函式錯誤日誌；前端全域 error handler 上報簡易 endpoint（P1）。

## 10. 安全與合規

- 金鑰僅存於 Vercel env／本地 `.env`（gitignore）；repo 公開亦無洩漏面。
- 無帳號、無 cookie、無個資；分享深連結只含視角參數。
- 頁尾標示：「資料來源：交通部 TDX 運輸資料流通服務平臺、臺北大眾捷運股份有限公司」＋底圖（© OpenStreetMap © CARTO）＋免責聲明。

## 11. 已知限制（對用戶誠實聲明）

1. 列車位置為**時刻表推演＋看板校正**，非官方車載定位；異常事件（故障、清客）時與現場會有落差。
2. 文湖線為班距合成，精度低於其他路線（有標示）。
3. 國定假日班表對照行事曆處理，臨時加開／取消不在資料內，僅能靠看板校正吸收。

## 12. 附錄：規模備忘

- 北捷路線：BR 文湖、R 淡水信義（含新北投支線）、G 松山新店（含小碧潭支線）、O 中和新蘆（蘆洲／迴龍雙尾）、BL 板南。
- 車站數約 117（不含環狀線）；營運時間約 06:00–24:00。
- 尖峰同時在線列車估 100–130；高運量尖峰班距 2–4 分、文湖線約 2 分內。
- 營運交路 11 條（全程／區間／支線），起迄與區間數詳見 [pipeline/SPIKE-NOTES.md](pipeline/SPIKE-NOTES.md) §2。
