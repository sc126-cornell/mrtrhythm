// Leaflet 底圖＋路網／車站靜態圖層
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Network, Station } from '../core/types.ts'

export interface BaseMap {
  map: L.Map
  // 站點與地圖 click 來自同一 DOM 事件——用時間戳旗標讓 main 避免「點站誤選到底下的列車」
  wasStationClick: () => boolean
  setTheme: (dark: boolean) => void
}

// 臺灣通用電子地圖（國土測繪中心）——全繁體中文標籤
// 正式環境走 /api/tile（Vercel 全球邊緣快取：NLSC 無海外節點，海外用戶跨洋抓磚極慢）
// 本地 dev 無 Functions → 直連 NLSC（注意其 WMTS 路徑為 {z}/{y}/{x}）
// 深色模式：對磚圖 pane 套 CSS 反轉濾鏡（中文標籤得以保留；上層路網／列車不受影響）
const TILE_URL = import.meta.env.DEV
  ? 'https://wmts.nlsc.gov.tw/wmts/EMAP/default/GoogleMapsCompatible/{z}/{y}/{x}'
  : '/api/tile?z={z}&x={x}&y={y}'

export function createMap(el: string, net: Network, onStationClick: (s: Station) => void): BaseMap {
  const dark = matchMedia('(prefers-color-scheme: dark)').matches
  const map = L.map(el, {
    center: [25.046, 121.517],
    zoom: 12,
    zoomControl: false,
  })
  L.control.zoom({ position: 'bottomright' }).addTo(map)
  const tiles = L.tileLayer(TILE_URL, {
    attribution: '© 內政部國土測繪中心 ｜ 資料來源：交通部 TDX、臺北捷運公司',
    maxZoom: 19,
    detectRetina: true, // 高 DPI 裝置抓高一級縮放磚：NLSC 無 @2x 磚，此為文字銳利化正解
    updateWhenIdle: true, // 慢網路友善：平移結束才抓磚，減少浪費請求
    keepBuffer: 4, // 多保留畫面外磚，回拉不重抓
  }).addTo(map)
  tiles.getContainer()?.classList.toggle('tiles-dark', dark)

  const canvasR = L.canvas({ padding: 0.3 })

  // 路網：full＋branch 已完整覆蓋（short 與 full 幾何重疊，不重畫）
  for (const line of net.lines)
    for (const r of line.routes) {
      if (r.kind === 'short') continue
      L.polyline(
        r.shape.map(([lon, lat]) => [lat, lon] as [number, number]),
        { renderer: canvasR, color: line.color, weight: r.kind === 'full' ? 3.5 : 2.5, opacity: 0.85, interactive: false },
      ).addTo(map)
    }

  let lastStaClick = 0
  const staMarkers: L.CircleMarker[] = []
  for (const line of net.lines)
    for (const s of line.stations) {
      const m = L.circleMarker([s.lonlat[1], s.lonlat[0]], {
        renderer: canvasR,
        radius: 3.5,
        color: dark ? '#cfcfcf' : '#333',
        weight: 1,
        fillColor: dark ? '#1b1e24' : '#fff',
        fillOpacity: 1,
      })
        .bindTooltip(`${s.zh} ${s.id}`, { direction: 'top' })
        .on('click', () => {
          lastStaClick = Date.now()
          onStationClick(s)
        })
        .addTo(map)
      staMarkers.push(m)
    }

  return {
    map,
    wasStationClick: () => Date.now() - lastStaClick < 150,
    setTheme(d: boolean) {
      tiles.getContainer()?.classList.toggle('tiles-dark', d)
      for (const m of staMarkers) m.setStyle({ color: d ? '#cfcfcf' : '#333', fillColor: d ? '#1b1e24' : '#fff' })
    },
  }
}
