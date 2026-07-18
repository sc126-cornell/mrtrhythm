// 班次 × 時間 → 位置：停靠區間查找＋進出站 ease＋站停駐留
import type { Trip } from './types.ts'
import type { RouteGeo } from './geo.ts'

// 渲染用停站駐留近似（北捷典型 20–35s；tt 只有發車時刻，到站＝下一發車−駐留）
const DWELL = 25
const MIN_RUN = 20

export interface TrainState {
  trip: Trip
  lonlat: [number, number]
  aheadLonlat: [number, number] // 前方 20m 點，投影後計算方位角
  moving: boolean
  nextStopIdx: number
}

// 出站加速、進站減速（easeInOutQuad）
const ease = (p: number) => (p < 0.5 ? 2 * p * p : 1 - ((2 - 2 * p) * (2 - 2 * p)) / 2)

export function positionOf(trip: Trip, t: number, geo: RouteGeo): TrainState | null {
  const st = trip.stops
  if (t < st[0].d || t > st[st.length - 1].d) return null

  let lo = 0
  let hi = st.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (st[mid].d <= t) lo = mid
    else hi = mid
  }

  if (lo >= st.length - 1) {
    // 終點站
    const km = geo.kmOf(st[st.length - 1].s)
    const prevKm = geo.kmOf(st[st.length - 2].s)
    const sign = Math.sign(km - prevKm) || 1
    return {
      trip,
      lonlat: geo.pointAt(km),
      aheadLonlat: geo.pointAt(km + sign * 20),
      moving: false,
      nextStopIdx: st.length - 1,
    }
  }

  const dep = st[lo].d
  const nextDep = st[lo + 1].d
  const kmA = geo.kmOf(st[lo].s)
  const kmB = geo.kmOf(st[lo + 1].s)
  const arr = Math.max(dep + MIN_RUN, nextDep - DWELL)

  let km: number
  let moving: boolean
  if (t >= arr) {
    km = kmB
    moving = false
  } else {
    const p = ease((t - dep) / (arr - dep))
    km = kmA + (kmB - kmA) * p
    moving = true
  }
  const sign = Math.sign(kmB - kmA) || 1
  return {
    trip,
    lonlat: geo.pointAt(km),
    aheadLonlat: geo.pointAt(km + sign * 20),
    moving,
    nextStopIdx: lo + 1,
  }
}
