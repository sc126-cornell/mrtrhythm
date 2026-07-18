// 相位校正（SDD §6，Spike 修訂版）：LiveBoard 為事件式看板——
// 每筆事件＝「列車此刻進站」，與模擬預測到站時刻比對，
// 對每（交路×方向）取誤差中位數，平滑收斂為 offset。
// 顯示端以 positionOf(trip, t − offset) 套用：實車誤點 → offset 為正 → 畫面列車後移。
import type { Trip } from './types.ts'
import type { Schedule } from './schedule.ts'

export interface LiveEvent {
  sta: string
  dest: string
  t: string // SrcUpdateTime ISO（+08:00）
}

const DWELL = 25 // 與 position.ts 一致：到站 ≈ 下一發車 − 駐留
const MATCH_WINDOW = 300 // 事件與預測差超過 ±5min 視為不可配對
const MAX_OFFSET = 180 // offset 上限 ±3min
const SMOOTH = 0.1 // 每幀向目標收斂 10%

const keyOf = (trip: Trip) => `${trip.route}.${trip.dir}`

// ISO 時間 → 營運日秒（凌晨 3 點前 +86400，與 tt 一致）
function isoToSec(iso: string): number {
  const m = iso.match(/T(\d{2}):(\d{2}):(\d{2})/)
  if (!m) return NaN
  const h = Number(m[1])
  return h * 3600 + Number(m[2]) * 60 + Number(m[3]) + (h < 3 ? 86400 : 0)
}

interface LogRow {
  at: number
  key: string
  n: number
  median: number
}

export class Calibrator {
  private offsets = new Map<string, number>() // 當前生效值（平滑後）
  private targets = new Map<string, number>() // 本輪目標（中位數）
  private log: LogRow[] = []
  lastIngestAt = 0 // performance.now()；徽章判斷「即時」新鮮度用
  matchedLast = 0

  offsetFor(trip: Trip): number {
    return this.offsets.get(keyOf(trip)) ?? 0
  }

  get active(): boolean {
    return performance.now() - this.lastIngestAt < 60_000
  }

  // 每輪輪詢：事件 → 配對 → 分組中位數 → 設定目標
  ingest(events: LiveEvent[], simNow: number, sched: Schedule): void {
    const errsByKey = new Map<string, number[]>()
    // 候選 = 事件時刻附近活躍的班次（前後各looked 5 分鐘涵蓋誤點窗）
    const candidates = sched.activeAt(simNow)
    let matched = 0

    for (const ev of events) {
      const evSec = isoToSec(ev.t)
      if (!Number.isFinite(evSec)) continue
      let best: { trip: Trip; err: number } | null = null
      for (const trip of candidates) {
        const stops = trip.stops
        if (stops[stops.length - 1].s !== ev.dest) continue
        // 含起站（i=0）：端點站的進站事件＝折返列車到達，預測≈發車−駐留
        for (let i = 0; i < stops.length; i++) {
          if (stops[i].s !== ev.sta) continue
          const predictedArr = stops[i].d - (i < stops.length - 1 ? DWELL : 0)
          const err = evSec - predictedArr // 正 = 實車比表定晚
          if (Math.abs(err) <= MATCH_WINDOW && (!best || Math.abs(err) < Math.abs(best.err))) {
            best = { trip, err }
          }
          break
        }
      }
      if (best) {
        matched++
        const k = keyOf(best.trip)
        let arr = errsByKey.get(k)
        if (!arr) errsByKey.set(k, (arr = []))
        arr.push(best.err)
      }
    }

    const at = Math.round(simNow)
    for (const [k, errs] of errsByKey) {
      errs.sort((a, b) => a - b)
      const median = errs[Math.floor(errs.length / 2)]
      const clamped = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, median))
      this.targets.set(k, clamped)
      this.log.push({ at, key: k, n: errs.length, median })
    }
    if (this.log.length > 2000) this.log.splice(0, this.log.length - 2000)
    this.matchedLast = matched
    this.lastIngestAt = performance.now()
    console.info(
      `[cal] 事件 ${events.length}・配對 ${matched}・組 ${errsByKey.size}`,
      Object.fromEntries([...this.targets].map(([k, v]) => [k, `${v > 0 ? '+' : ''}${Math.round(v)}s`])),
    )
  }

  // 每幀：向目標平滑收斂；過期（>90s 無資料）緩慢歸零
  tick(): void {
    const stale = performance.now() - this.lastIngestAt > 90_000
    for (const [k, target] of this.targets) {
      const cur = this.offsets.get(k) ?? 0
      const goal = stale ? 0 : target
      const next = cur + (goal - cur) * SMOOTH
      if (Math.abs(next) < 0.5 && stale) {
        this.offsets.delete(k)
        this.targets.delete(k)
      } else {
        this.offsets.set(k, next)
      }
    }
  }

  csv(): string {
    return 'simSec,key,n,medianErr\n' + this.log.map((r) => `${r.at},${r.key},${r.n},${Math.round(r.median)}`).join('\n')
  }
}
