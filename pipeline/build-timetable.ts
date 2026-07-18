// T1.3+T1.4 逐班時刻建置：StationTimeTable 串班（按交路×方向）＋文湖線班距合成
// 產出 web/public/data/tt-{weekday|sat|sun}.json
// 演算法見 SDD §4.3；資料特性見 pipeline/SPIKE-NOTES.md
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ROOT } from './lib.ts'

const RAW = resolve(ROOT, 'pipeline/raw')
const DATA = resolve(ROOT, 'web/public/data')
const load = <T>(p: string, dir = RAW): T => JSON.parse(readFileSync(resolve(dir, p), 'utf8')) as T

interface ServiceDayFlags {
  ServiceTag?: string
  Monday: boolean
  Tuesday: boolean
  Wednesday: boolean
  Thursday: boolean
  Friday: boolean
  Saturday: boolean
  Sunday: boolean
  NationalHolidays: boolean
}
interface SttRow {
  RouteID: string
  LineID: string
  StationID: string
  Direction: 0 | 1
  DestinationStaionID: string
  Timetables: Array<{ Sequence: number; DepartureTime: string }>
  ServiceDay: ServiceDayFlags
}
interface FirstLastRow {
  LineID: string
  StationID: string
  DestinationStaionID: string
  FirstTrainTime: string
  LastTrainTime: string
  ServiceDay: ServiceDayFlags
}
interface FreqRow {
  LineID: string
  RouteID: string
  ServiceDay: ServiceDayFlags
  Headways: Array<{ StartTime: string; EndTime: string; MinHeadwayMins: number; MaxHeadwayMins: number }>
}
interface Network {
  lines: Array<{
    id: string
    routes: Array<{ id: string; stations: string[]; runTimes: number[]; stopTimes: number[] }>
  }>
}

const stt = load<SttRow[]>('StationTimeTable.json')
const firstLast = load<FirstLastRow[]>('FirstLastTimetable.json')
const freq = load<FreqRow[]>('Frequency.json')
const network = load<Network>('network.json', resolve(ROOT, 'web/public/data'))

// "HH:MM" → 秒；凌晨 3 點前視為跨日（營運日 06:00–約 01:00）
const toSec = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 3600 + m * 60 + (h < 3 ? 86400 : 0)
}

const DAY_FLAG: Record<string, keyof ServiceDayFlags> = {
  weekday: 'Monday',
  sat: 'Saturday',
  sun: 'Sunday',
}
// 同站同交路同方向可能同時有「假日」與「週六/週日」版本——取旗標數最少（最特定）者
const specificity = (sd: ServiceDayFlags): number =>
  ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'NationalHolidays'].filter(
    (k) => sd[k as keyof ServiceDayFlags],
  ).length

interface Trip {
  route: string // 名義交路（顯示用）
  dir: 0 | 1
  synthetic: boolean
  path: string // 幾何交路：停靠實際落在此交路的站鏈上（cascade／跨鏈群組可能 ≠ route）
  stops: Array<{ s: string; d: number }>
}

const TOLERANCE = 90 // 秒；時刻表為分鐘精度

for (const serviceDay of ['weekday', 'sat', 'sun'] as const) {
  const flag = DAY_FLAG[serviceDay]
  const trips: Trip[] = []
  const stats: string[] = []

  // ---- 串班（BL/G/O/R；BR 無 StationTimeTable）----
  // 實測：同一（RouteID×Direction）可含多個「終點群組」，且群組可超出該交路的 S2S 站鏈
  // （BL-2 dir0 兼有往南港展覽館／往昆陽；R-2 實際營運為北投↔象山，超出標示的大安）。
  // 故按 DestinationStaionID 分組，每組在同線所有交路鏈（含反向）中找「涵蓋群組全站＋終點在下游」
  // 的最短裁切段，於其上串班。
  for (const line of network.lines) {
    for (const route of line.routes) {
      for (const dir of [0, 1] as const) {
        const rows = stt.filter((r) => r.RouteID === route.id && r.Direction === dir && r.ServiceDay[flag])
        if (!rows.length) continue

        // 終點分組；各站取最特定列
        const groups = new Map<string, Map<string, SttRow>>()
        for (const r of rows) {
          let g = groups.get(r.DestinationStaionID)
          if (!g) groups.set(r.DestinationStaionID, (g = new Map()))
          const prev = g.get(r.StationID)
          if (!prev || specificity(r.ServiceDay) < specificity(prev.ServiceDay)) g.set(r.StationID, r)
        }

        for (const [dest, staMap] of groups) {
          let pick: { rtId: string; order: string[]; runs: number[]; stops: number[] } | null = null
          let pickSpan = Infinity
          for (const rt of line.routes) {
            for (const rev of [false, true]) {
              const ch = rev ? [...rt.stations].reverse() : rt.stations
              const di = ch.indexOf(dest)
              if (di < 0) continue
              const idxs = [...staMap.keys()].map((s) => ch.indexOf(s))
              if (idxs.some((i) => i < 0 || i >= di)) continue
              const start = Math.min(...idxs)
              if (di - start < pickSpan) {
                const runsA = rev ? [...rt.runTimes].reverse() : rt.runTimes
                const stopsA = rev ? [...rt.stopTimes].reverse() : rt.stopTimes
                pickSpan = di - start
                pick = { rtId: rt.id, order: ch.slice(start, di + 1), runs: runsA.slice(start, di), stops: stopsA.slice(start, di) }
              }
            }
          }
          if (!pick) {
            stats.push(`⚠️ ${route.id} dir${dir}→${dest}: 無可涵蓋的交路鏈，跳過（${staMap.size} 站）`)
            continue
          }
          const { rtId, order, runs, stops } = pick

          const pool = new Map<string, Array<{ t: number; claimed: boolean }>>()
          let totalTimes = 0
          for (const [sta, row] of staMap) {
            const ts = row.Timetables.map((t) => ({ t: toSec(t.DepartureTime), claimed: false })).sort((a, b) => a.t - b.t)
            pool.set(sta, ts)
            totalTimes += ts.length
          }
          const anchor = pool.get(order[0])
          if (!anchor?.length) {
            stats.push(`⚠️ ${route.id} dir${dir}→${dest}: 起站 ${order[0]} 無時刻，跳過`)
            continue
          }

          let claimed = 0
          let synthesized = 0
          for (const a of anchor) {
            a.claimed = true
            claimed++
            const stopsOut: Trip['stops'] = [{ s: order[0], d: a.t }]
            let tExpect = a.t
            for (let i = 1; i < order.length; i++) {
              tExpect += runs[i - 1] + (i < order.length - 1 ? stops[i - 1] : 0)
              const cand = pool.get(order[i])
              let picked: { t: number; claimed: boolean } | null = null
              if (cand) {
                for (const c of cand) {
                  if (c.claimed) continue
                  if (Math.abs(c.t - tExpect) <= TOLERANCE && (!picked || Math.abs(c.t - tExpect) < Math.abs(picked.t - tExpect)))
                    picked = c
                }
              }
              if (picked) {
                picked.claimed = true
                claimed++
                tExpect = picked.t
                stopsOut.push({ s: order[i], d: picked.t })
              } else {
                synthesized++
                stopsOut.push({ s: order[i], d: Math.round(tExpect / 60) * 60 })
              }
            }
            trips.push({ route: route.id, dir, synthetic: false, path: rtId, stops: stopsOut })
          }

          // 殘餘時刻＝中途起點班次（實測：平日大安發車往北投、中途站發車往昆陽等）
          // 由上游往下游逐站重新錨定；只認領到起點一筆的視為雜訊（不成班）
          let cascaded = 0
          let noise = 0
          for (;;) {
            let ai = -1
            for (let i = 1; i < order.length - 1; i++) {
              if (pool.get(order[i])?.some((c) => !c.claimed)) {
                ai = i
                break
              }
            }
            if (ai < 0) break
            const order2 = order.slice(ai)
            const runs2 = runs.slice(ai)
            const stops2 = stops.slice(ai)
            for (const a of pool.get(order2[0])!.filter((c) => !c.claimed)) {
              a.claimed = true
              const stopsOut: Trip['stops'] = [{ s: order2[0], d: a.t }]
              let tExpect = a.t
              let got = 0
              for (let i = 1; i < order2.length; i++) {
                tExpect += runs2[i - 1] + (i < order2.length - 1 ? stops2[i - 1] : 0)
                const cand = pool.get(order2[i])
                let picked: { t: number; claimed: boolean } | null = null
                if (cand) {
                  for (const c of cand) {
                    if (c.claimed) continue
                    if (Math.abs(c.t - tExpect) <= TOLERANCE && (!picked || Math.abs(c.t - tExpect) < Math.abs(picked.t - tExpect)))
                      picked = c
                  }
                }
                if (picked) {
                  picked.claimed = true
                  got++
                  tExpect = picked.t
                  stopsOut.push({ s: order2[i], d: picked.t })
                } else {
                  stopsOut.push({ s: order2[i], d: Math.round(tExpect / 60) * 60 })
                }
              }
              if (got >= 1) {
                claimed += 1 + got
                cascaded++
                trips.push({ route: route.id, dir, synthetic: false, path: rtId, stops: stopsOut })
              } else {
                noise++
              }
            }
          }

          const rate = totalTimes ? ((claimed / totalTimes) * 100).toFixed(1) : '—'
          const extra = (cascaded ? `, 中途起 ${cascaded} 班` : '') + (noise ? `, 雜訊 ${noise}` : '')
          stats.push(`${route.id} dir${dir}→${dest}: ${anchor.length} 班, 認領 ${claimed}/${totalTimes} (${rate}%), 合成停靠 ${synthesized}${extra}`)
        }
      }
    }
  }

  // ---- 文湖線合成（T1.4）----
  const brRoute = network.lines.find((l) => l.id === 'BR')!.routes[0]
  const brFreq = freq.filter(
    (f) => f.LineID === 'BR' && (serviceDay === 'weekday' ? f.ServiceDay.Monday : f.ServiceDay.Saturday || f.ServiceDay.Sunday),
  )
  for (const dir of [0, 1] as const) {
    const chain = dir === 0 ? brRoute.stations : [...brRoute.stations].reverse()
    const runs = dir === 0 ? brRoute.runTimes : [...brRoute.runTimes].reverse()
    const stops = dir === 0 ? brRoute.stopTimes : [...brRoute.stopTimes].reverse()
    const origin = chain[0]
    const dest = chain[chain.length - 1]
    const fl = firstLast.find((r) => r.LineID === 'BR' && r.StationID === origin && r.DestinationStaionID === dest && r.ServiceDay[DAY_FLAG[serviceDay]])
    if (!fl || !brFreq.length) {
      stats.push(`⚠️ BR dir${dir}: 缺 FirstLast 或 Frequency，跳過`)
      continue
    }
    const first = toSec(fl.FirstTrainTime)
    const last = toSec(fl.LastTrainTime)
    const headwayAt = (t: number): number => {
      for (const f of brFreq)
        for (const h of f.Headways) {
          const s = toSec(h.StartTime)
          let e = toSec(h.EndTime)
          if (e <= s) e += 86400
          if (t >= s && t < e) return ((h.MinHeadwayMins + h.MaxHeadwayMins) / 2) * 60
        }
      return 480 // 缺時段時保守 8 分
    }
    let n = 0
    for (let t = first; t <= last; t += headwayAt(t)) {
      const stopsOut: Trip['stops'] = [{ s: chain[0], d: Math.round(t / 60) * 60 }]
      let cur = t
      for (let i = 1; i < chain.length; i++) {
        cur += runs[i - 1] + (i < chain.length - 1 ? stops[i - 1] : 0)
        stopsOut.push({ s: chain[i], d: Math.round(cur / 60) * 60 })
      }
      trips.push({ route: brRoute.id, dir, synthetic: true, path: brRoute.id, stops: stopsOut })
      n++
    }
    stats.push(`BR-1 dir${dir}: 合成 ${n} 班（${fl.FirstTrainTime}–${fl.LastTrainTime}）`)
  }

  trips.sort((a, b) => a.stops[0].d - b.stops[0].d)
  const out = { serviceDay, generatedAt: new Date().toISOString(), trips }
  writeFileSync(resolve(DATA, `tt-${serviceDay}.json`), JSON.stringify(out))
  const stopsTotal = trips.reduce((a, t) => a + t.stops.length, 0)
  console.log(`\n=== tt-${serviceDay}.json：${trips.length} 班 / ${stopsTotal} 停靠 / ${(JSON.stringify(out).length / 1024).toFixed(0)}KB ===`)
  for (const s of stats) console.log('  ' + s)
}
