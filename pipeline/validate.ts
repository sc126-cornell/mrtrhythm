// T1.6 資料驗證器：檢查 network.json 與 tt-*.json 是否符合 SDD §4.3 門檻
// 供 CI 使用：任一門檻不過 → exit 1（每日管線失敗時保留昨日資料）
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ROOT } from './lib.ts'

const DATA = resolve(ROOT, 'web/public/data')
const load = <T>(p: string): T => JSON.parse(readFileSync(resolve(DATA, p), 'utf8')) as T

interface Network {
  meta: { warnings: string[] }
  lines: Array<{
    id: string
    stations: Array<{ id: string; zh: string; lonlat: [number, number] }>
    routes: Array<{ id: string; stations: string[]; runTimes: number[]; stopTimes: number[]; shape: [number, number][]; chainage: number[]; stationKm: number[] }>
  }>
}
interface TT {
  serviceDay: string
  trips: Array<{ route: string; dir: 0 | 1; synthetic: boolean; path: string; stops: Array<{ s: string; d: number }> }>
}

const errors: string[] = []
const warns: string[] = []
const ok = (cond: boolean, msg: string) => {
  if (!cond) errors.push(msg)
}

// ---- network.json ----
const net = load<Network>('network.json')
const routeById = new Map<string, Network['lines'][0]['routes'][0]>()
ok(net.lines.length === 5, `路線數 ${net.lines.length} ≠ 5`)
let routeCount = 0
for (const line of net.lines) {
  const staSet = new Set(line.stations.map((s) => s.id))
  for (const r of line.routes) {
    routeCount++
    routeById.set(r.id, r)
    ok(r.stations.length === r.runTimes.length + 1, `${r.id} 站數 ${r.stations.length} ≠ runTimes+1`)
    ok(r.stations.length === r.stopTimes.length + 1, `${r.id} stopTimes 長度不符`)
    ok(r.shape.length === r.chainage.length, `${r.id} shape/chainage 長度不符`)
    ok(r.stations.every((s) => staSet.has(s)), `${r.id} 含未知車站`)
    for (let i = 1; i < r.chainage.length; i++)
      if (r.chainage[i] < r.chainage[i - 1]) { errors.push(`${r.id} chainage 非遞增 @${i}`); break }
    for (let i = 1; i < r.stationKm.length; i++)
      if (r.stationKm[i] <= r.stationKm[i - 1]) { errors.push(`${r.id} stationKm 非嚴格遞增 @${i}`); break }
    const len = r.stationKm[r.stationKm.length - 1]
    ok(len > 800 && len < 40000, `${r.id} 全長 ${len}m 不合理`)
  }
}
ok(routeCount === 11, `交路數 ${routeCount} ≠ 11`)
if (net.meta.warnings.length > 10) warns.push(`network 警告 ${net.meta.warnings.length} 筆（>10）`)

// ---- tt-*.json ----
const BANDS: Record<string, [number, number]> = { weekday: [2400, 3600], sat: [2000, 3200], sun: [2000, 3200] }
for (const day of ['weekday', 'sat', 'sun']) {
  const tt = load<TT>(`tt-${day}.json`)
  ok(tt.serviceDay === day, `tt-${day} serviceDay 欄位不符`)
  const [lo, hi] = BANDS[day]
  ok(tt.trips.length >= lo && tt.trips.length <= hi, `tt-${day} 班次數 ${tt.trips.length} 超出 ${lo}–${hi}`)

  // path 幾何映射快取：交路 → (站 → 里程)
  const kmMaps = new Map<string, Map<string, number>>()
  for (const [id, r] of routeById) kmMaps.set(id, new Map(r.stations.map((s, i) => [s, r.stationKm[i]])))

  const seenRoutes = new Set<string>()
  let badMono = 0
  let badGap = 0
  let badPath = 0
  let badKmOrder = 0
  for (const trip of tt.trips) {
    seenRoutes.add(trip.route)
    const r = routeById.get(trip.route)
    if (!r) { errors.push(`tt-${day}: 未知交路 ${trip.route}`); continue }
    if (trip.stops.length < 2) { errors.push(`tt-${day}: ${trip.route} 有 <2 站的班次`); continue }
    for (let i = 1; i < trip.stops.length; i++) {
      const dt = trip.stops[i].d - trip.stops[i - 1].d
      if (dt < 0) badMono++
      // 站間耗時上限：S2S 最大值 + 停靠 + 緩衝（防瞬移／死班）
      if (dt > 15 * 60) badGap++
    }
    // 渲染前提：每個停靠都在 path 鏈上，且沿鏈里程嚴格單調（方向一致、無折返）
    const km = kmMaps.get(trip.path)
    if (!km || trip.stops.some((st) => !km.has(st.s))) {
      badPath++
    } else {
      const ks = trip.stops.map((st) => km.get(st.s)!)
      const sign = Math.sign(ks[ks.length - 1] - ks[0])
      for (let i = 1; i < ks.length; i++)
        if (Math.sign(ks[i] - ks[i - 1]) !== sign) { badKmOrder++; break }
    }
  }
  ok(badPath === 0, `tt-${day}: ${badPath} 班的停靠不在 path 鏈上`)
  ok(badKmOrder === 0, `tt-${day}: ${badKmOrder} 班沿 path 里程非單調`)
  ok(badMono === 0, `tt-${day}: ${badMono} 個站間時刻倒退`)
  if (badGap > 0) warns.push(`tt-${day}: ${badGap} 個站間 >15min 的長間隔`)
  // G-2 台電大樓區間車僅平日行駛（實測），假日缺席屬預期
  const allowMissing = day === 'weekday' ? new Set<string>() : new Set(['G-2'])
  const missing = [...routeById.keys()].filter((id) => !seenRoutes.has(id))
  ok(
    missing.every((id) => allowMissing.has(id)),
    `tt-${day}: 缺交路 ${missing.join(',') || '無'}（允許缺席：${[...allowMissing].join(',') || '無'}）`,
  )

  const synth = tt.trips.filter((t) => t.synthetic).length
  ok(synth > 200 && synth < 600, `tt-${day}: BR 合成班次 ${synth} 超出 200–600`)
}

// ---- 結果 ----
console.log('=== validate ===')
for (const w of warns) console.log('⚠️ ' + w)
if (errors.length) {
  for (const e of errors) console.log('❌ ' + e)
  console.log(`\n共 ${errors.length} 個錯誤`)
  process.exitCode = 1
} else {
  console.log(`✅ 全數通過（11 交路、3 種日別、警告 ${warns.length} 筆）`)
}
