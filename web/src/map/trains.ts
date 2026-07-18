// Canvas 列車圖層：每幀單 pass 重繪＋螢幕座標命中測試
import type * as L from 'leaflet'
import type { TrainState } from '../core/position.ts'

export interface DrawItem {
  st: TrainState
  color: string
  selected: boolean
}

export interface StationLabel {
  lonlat: [number, number]
  zh: string
}

export class TrainsLayer {
  private readonly map: L.Map
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private hits: Array<{ x: number; y: number; st: TrainState }> = []

  constructor(map: L.Map) {
    this.map = map
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'trains-canvas'
    map.getContainer().appendChild(this.canvas)
    this.ctx = this.canvas.getContext('2d')!
    this.resize()
    map.on('resize', () => this.resize())
  }

  private resize() {
    const size = this.map.getSize()
    const dpr = devicePixelRatio || 1
    this.canvas.width = size.x * dpr
    this.canvas.height = size.y * dpr
    this.canvas.style.width = `${size.x}px`
    this.canvas.style.height = `${size.y}px`
  }

  draw(items: DrawItem[], labels: StationLabel[] = [], dark = false) {
    const dpr = devicePixelRatio || 1
    const ctx = this.ctx
    const size = this.map.getSize()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.x, size.y)
    const zoom = this.map.getZoom()
    this.hits = []

    // 站名標籤（列車底下先畫）：z≥14 顯示，自繪確保任何 DPI 都銳利、字級舒適
    if (zoom >= 14 && labels.length) {
      const fs = zoom >= 16 ? 13 : 12
      ctx.font = `${fs}px 'Noto Sans TC', system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.lineWidth = 3
      ctx.lineJoin = 'round'
      ctx.strokeStyle = dark ? 'rgba(12, 14, 18, 0.9)' : 'rgba(255, 255, 255, 0.9)'
      ctx.fillStyle = dark ? '#e6e6e2' : '#26282c'
      for (const lb of labels) {
        const p = this.map.latLngToContainerPoint([lb.lonlat[1], lb.lonlat[0]])
        if (p.x < -60 || p.y < -30 || p.x > size.x + 60 || p.y > size.y + 30) continue
        ctx.strokeText(lb.zh, p.x, p.y + 8)
        ctx.fillText(lb.zh, p.x, p.y + 8)
      }
    }

    for (const it of items) {
      const p = this.map.latLngToContainerPoint([it.st.lonlat[1], it.st.lonlat[0]])
      if (p.x < -40 || p.y < -40 || p.x > size.x + 40 || p.y > size.y + 40) continue
      this.hits.push({ x: p.x, y: p.y, st: it.st })

      if (zoom < 13) {
        ctx.beginPath()
        ctx.arc(p.x, p.y, it.selected ? 5.5 : 4, 0, Math.PI * 2)
        ctx.fillStyle = it.color
        ctx.fill()
        if (it.selected) {
          ctx.lineWidth = 2
          ctx.strokeStyle = '#fff'
          ctx.stroke()
        }
      } else {
        const q = this.map.latLngToContainerPoint([it.st.aheadLonlat[1], it.st.aheadLonlat[0]])
        const ang = Math.atan2(q.y - p.y, q.x - p.x)
        const w = zoom >= 15 ? 20 : 14
        const h = zoom >= 15 ? 9 : 6.5
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(ang)
        ctx.beginPath()
        const r = h / 2
        ctx.moveTo(-w / 2 + r, -h / 2)
        ctx.arcTo(w / 2, -h / 2, w / 2, h / 2, r)
        ctx.arcTo(w / 2, h / 2, -w / 2, h / 2, r)
        ctx.arcTo(-w / 2, h / 2, -w / 2, -h / 2, r)
        ctx.arcTo(-w / 2, -h / 2, w / 2, -h / 2, r)
        ctx.closePath()
        ctx.fillStyle = it.color
        ctx.fill()
        ctx.lineWidth = it.selected ? 2 : 1
        ctx.strokeStyle = '#fff'
        ctx.stroke()
        // 行進方向白點
        ctx.beginPath()
        ctx.arc(w / 2 - r, 0, 1.6, 0, Math.PI * 2)
        ctx.fillStyle = '#fff'
        ctx.fill()
        ctx.restore()
      }
    }
  }

  hitTest(x: number, y: number): TrainState | null {
    let best: TrainState | null = null
    let bestD = 16
    for (const h of this.hits) {
      const d = Math.hypot(h.x - x, h.y - y)
      if (d < bestD) {
        bestD = d
        best = h.st
      }
    }
    return best
  }
}
