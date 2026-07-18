// Leaflet 底圖＋路網／車站靜態圖層
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Network } from '../core/types.ts'

export function createMap(el: string, net: Network): L.Map {
  const dark = matchMedia('(prefers-color-scheme: dark)').matches
  const map = L.map(el, {
    center: [25.046, 121.517],
    zoom: 12,
    zoomControl: false,
  })
  L.control.zoom({ position: 'bottomright' }).addTo(map)
  L.tileLayer(`https://{s}.basemaps.cartocdn.com/${dark ? 'dark_all' : 'light_all'}/{z}/{x}/{y}{r}.png`, {
    attribution: '© OpenStreetMap © CARTO ｜ 資料來源：交通部 TDX、臺北捷運公司',
    maxZoom: 19,
  }).addTo(map)

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

  // 車站節點（不同線的共站各自有 StationID，重疊屬正常）
  for (const line of net.lines)
    for (const s of line.stations) {
      L.circleMarker([s.lonlat[1], s.lonlat[0]], {
        renderer: canvasR,
        radius: 3.5,
        color: dark ? '#cfcfcf' : '#333',
        weight: 1,
        fillColor: dark ? '#1b1e24' : '#fff',
        fillOpacity: 1,
      })
        .bindTooltip(`${s.zh} ${s.id}`, { direction: 'top' })
        .addTo(map)
    }

  return map
}
