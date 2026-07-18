// 活躍班次索引：依發車時刻排序＋最長班次時窗的二分查詢；同一模擬秒內快取
// 另建每站發車索引（車站看板用）：站 → 排序後發車列表
import type { Trip } from './types.ts'

export interface Departure {
  d: number
  trip: Trip
}

export class Schedule {
  readonly trips: Trip[]
  private readonly starts: number[]
  private maxDur = 0
  private cacheKey = -1
  private cacheList: Trip[] = []
  private staIndex: Map<string, Departure[]> | null = null

  constructor(trips: Trip[]) {
    this.trips = [...trips].sort((a, b) => a.stops[0].d - b.stops[0].d)
    this.starts = this.trips.map((t) => t.stops[0].d)
    for (const t of this.trips) this.maxDur = Math.max(this.maxDur, t.stops[t.stops.length - 1].d - t.stops[0].d)
  }

  activeAt(t: number): Trip[] {
    const key = Math.floor(t)
    if (key === this.cacheKey) return this.cacheList
    let lo = 0
    let hi = this.starts.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (this.starts[mid] <= t) lo = mid + 1
      else hi = mid
    }
    const out: Trip[] = []
    for (let i = lo - 1; i >= 0 && this.starts[i] >= t - this.maxDur; i--) {
      const trip = this.trips[i]
      if (trip.stops[trip.stops.length - 1].d >= t) out.push(trip)
    }
    this.cacheKey = key
    this.cacheList = out
    return out
  }

  // 車站未來發車（末站僅到站不發車，不收錄）；首次呼叫時建索引（~5 萬筆，一次性）
  departuresFrom(sta: string, t: number, limit = 10): Departure[] {
    if (!this.staIndex) {
      const idx = new Map<string, Departure[]>()
      for (const trip of this.trips) {
        for (let i = 0; i < trip.stops.length - 1; i++) {
          const st = trip.stops[i]
          let arr = idx.get(st.s)
          if (!arr) idx.set(st.s, (arr = []))
          arr.push({ d: st.d, trip })
        }
      }
      for (const arr of idx.values()) arr.sort((a, b) => a.d - b.d)
      this.staIndex = idx
    }
    const arr = this.staIndex.get(sta)
    if (!arr) return []
    let lo = 0
    let hi = arr.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (arr[mid].d < t) lo = mid + 1
      else hi = mid
    }
    return arr.slice(lo, lo + limit)
  }
}
