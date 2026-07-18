// 交路幾何：站→里程、里程→經緯度（chainage 二分內插）
import type { Network, Route, Station } from './types.ts'

export class RouteGeo {
  readonly route: Route
  readonly lineId: string
  readonly lineColor: string
  readonly lineName: string
  private readonly km: Map<string, number>

  constructor(route: Route, lineId: string, lineColor: string, lineName: string) {
    this.route = route
    this.lineId = lineId
    this.lineColor = lineColor
    this.lineName = lineName
    this.km = new Map(route.stations.map((s, i) => [s, route.stationKm[i]]))
  }

  kmOf(sta: string): number {
    return this.km.get(sta) ?? 0
  }

  pointAt(m: number): [number, number] {
    const c = this.route.chainage
    const shape = this.route.shape
    const last = c.length - 1
    if (m <= c[0]) return shape[0]
    if (m >= c[last]) return shape[last]
    let lo = 0
    let hi = last
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (c[mid] <= m) lo = mid
      else hi = mid
    }
    const t = (m - c[lo]) / (c[hi] - c[lo] || 1)
    const a = shape[lo]
    const b = shape[hi]
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
  }
}

export function buildGeo(net: Network): Map<string, RouteGeo> {
  const out = new Map<string, RouteGeo>()
  for (const line of net.lines)
    for (const r of line.routes) out.set(r.id, new RouteGeo(r, line.id, line.color, line.name))
  return out
}

// 兩點距離（公尺，等距圓柱近似）——時速計用
export function distMeters(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180
  const x = (b[0] - a[0]) * rad * Math.cos(((a[1] + b[1]) / 2) * rad)
  const y = (b[1] - a[1]) * rad
  return Math.hypot(x, y) * 6371000
}

export function stationDict(net: Network): Map<string, Station> {
  const out = new Map<string, Station>()
  for (const line of net.lines) for (const s of line.stations) if (!out.has(s.id)) out.set(s.id, s)
  return out
}
