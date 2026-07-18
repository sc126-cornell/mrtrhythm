// 活躍班次索引：依發車時刻排序＋最長班次時窗的二分查詢；同一模擬秒內快取
import type { Trip } from './types.ts'

export class Schedule {
  readonly trips: Trip[]
  private readonly starts: number[]
  private maxDur = 0
  private cacheKey = -1
  private cacheList: Trip[] = []

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
}
