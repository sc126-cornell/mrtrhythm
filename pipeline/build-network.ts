// T1.2 路網建置：TDX raw → web/public/data/network.json
// 流程：WKT MULTILINESTRING 解析 → 分段縫合（端點 <30m）→ 車站投影 →
//       按交路（S2S 站鏈）於縫合鏈上切片組裝 → 每交路 shape/chainage/stationKm
// 用法：npx tsx pipeline/build-network.ts
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ROOT } from './lib.ts'

type Pt = [number, number] // [lon, lat]

// ---------- 幾何工具（等距圓柱近似；臺北範圍誤差 <0.1%） ----------
const EARTH = 6371000
const rad = (d: number) => (d * Math.PI) / 180

function dist(a: Pt, b: Pt): number {
  const x = rad(b[0] - a[0]) * Math.cos(rad((a[1] + b[1]) / 2))
  const y = rad(b[1] - a[1])
  return Math.hypot(x, y) * EARTH
}

function cumLen(pts: Pt[]): number[] {
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]))
  return cum
}

// 點投影到折線：回傳最近點的沿線里程與偏移距離
function project(p: Pt, pts: Pt[], cum: number[]): { m: number; off: number } {
  let best = { m: 0, off: Infinity }
  const ky = EARTH * (Math.PI / 180)
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const kx = ky * Math.cos(rad((a[1] + b[1]) / 2))
    const ax = (p[0] - a[0]) * kx
    const ay = (p[1] - a[1]) * ky
    const bx = (b[0] - a[0]) * kx
    const by = (b[1] - a[1]) * ky
    const len2 = bx * bx + by * by
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (ax * bx + ay * by) / len2))
    const dx = ax - t * bx
    const dy = ay - t * by
    const off = Math.hypot(dx, dy)
    if (off < best.off) best = { m: cum[i - 1] + t * (cum[i] - cum[i - 1]), off }
  }
  return best
}

// 取折線 fromM→toM 的切片（可反向），端點內插
function slice(pts: Pt[], cum: number[], fromM: number, toM: number): Pt[] {
  const lo = Math.min(fromM, toM)
  const hi = Math.max(fromM, toM)
  const interp = (m: number): Pt => {
    let i = cum.findIndex((c) => c >= m)
    if (i <= 0) i = 1
    const t = (m - cum[i - 1]) / (cum[i] - cum[i - 1] || 1)
    return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]
  }
  const out: Pt[] = [interp(lo)]
  for (let i = 0; i < pts.length; i++) if (cum[i] > lo && cum[i] < hi) out.push(pts[i])
  out.push(interp(hi))
  if (fromM > toM) out.reverse()
  return out
}

// ---------- WKT 解析與縫合 ----------
function parseMulti(wkt: string): Pt[][] {
  const m = wkt.match(/MULTILINESTRING\s*\(\((.*)\)\)\s*$/s)
  if (!m) throw new Error('非 MULTILINESTRING WKT')
  return m[1].split(/\)\s*,\s*\(/).map((seg) =>
    seg.split(',').map((pair) => {
      const [lon, lat] = pair.trim().split(/\s+/).map(Number)
      return [lon, lat] as Pt
    }),
  )
}

// 兩向量夾角（度）——用於縫合時的轉角約束
function turnAngle(a1: Pt, a2: Pt, b1: Pt, b2: Pt): number {
  const ky = 1
  const kx = Math.cos(rad((a2[1] + b1[1]) / 2))
  const v1 = [(a2[0] - a1[0]) * kx, (a2[1] - a1[1]) * ky]
  const v2 = [(b2[0] - b1[0]) * kx, (b2[1] - b1[1]) * ky]
  const dot = v1[0] * v2[0] + v1[1] * v2[1]
  const n1 = Math.hypot(v1[0], v1[1])
  const n2 = Math.hypot(v2[0], v2[1])
  if (n1 === 0 || n2 === 0) return 0
  return (Math.acos(Math.max(-1, Math.min(1, dot / (n1 * n2)))) * 180) / Math.PI
}

// 縫合：全域最佳優先＋轉角約束（>75° 視為支線分岔，不併）
// 若不加約束，支線會在交會點黏進主線、把真正的主線續段擠成孤鏈（G 線實測踩雷）
function stitch(segs: Pt[][], tol = 30, maxTurn = 75): Pt[][] {
  const chains = segs.map((s) => [...s])
  for (;;) {
    let best: { i: number; j: number; make: () => Pt[]; score: number } | null = null
    for (let i = 0; i < chains.length; i++) {
      for (let j = i + 1; j < chains.length; j++) {
        const a = chains[i]
        const b = chains[j]
        const rb = [...b].reverse()
        const combos: Array<{ gap: number; turn: number; make: () => Pt[] }> = [
          { gap: dist(a[a.length - 1], b[0]), turn: turnAngle(a[a.length - 2], a[a.length - 1], b[0], b[1]), make: () => a.concat(b.slice(1)) },
          { gap: dist(a[a.length - 1], rb[0]), turn: turnAngle(a[a.length - 2], a[a.length - 1], rb[0], rb[1]), make: () => a.concat(rb.slice(1)) },
          { gap: dist(b[b.length - 1], a[0]), turn: turnAngle(b[b.length - 2], b[b.length - 1], a[0], a[1]), make: () => b.concat(a.slice(1)) },
          { gap: dist(rb[rb.length - 1], a[0]), turn: turnAngle(rb[rb.length - 2], rb[rb.length - 1], a[0], a[1]), make: () => rb.concat(a.slice(1)) },
        ]
        for (const c of combos) {
          if (c.gap < tol && c.turn < maxTurn) {
            const score = c.gap + c.turn * 0.5
            if (!best || score < best.score) best = { i, j, make: c.make, score }
          }
        }
      }
    }
    if (!best) return chains
    chains[best.i] = best.make()
    chains.splice(best.j, 1)
  }
}

// ---------- 載入 raw ----------
const RAW = resolve(ROOT, 'pipeline/raw')
const load = <T>(n: string): T => JSON.parse(readFileSync(resolve(RAW, `${n}.json`), 'utf8')) as T

interface TdxStation {
  StationID: string
  StationName: { Zh_tw: string; En: string }
  StationPosition: { PositionLon: number; PositionLat: number }
}
interface TdxShape {
  LineID: string
  Geometry: string
}
interface TdxS2S {
  LineID: string
  RouteID: string
  TravelTimes: Array<{
    Sequence: number
    FromStationID: string
    ToStationID: string
    RunTime: number
    StopTime: number
  }>
}

const stations = load<TdxStation[]>('Station')
const shapes = load<TdxShape[]>('Shape')
const s2s = load<TdxS2S[]>('S2STravelTime')

const staById = new Map(stations.map((s) => [s.StationID, s]))
const staPt = (id: string): Pt => {
  const s = staById.get(id)
  if (!s) throw new Error(`未知車站 ${id}`)
  return [s.StationPosition.PositionLon, s.StationPosition.PositionLat]
}

const LINE_META: Record<string, { name: string; color: string }> = {
  BR: { name: '文湖線', color: '#C48C31' },
  R: { name: '淡水信義線', color: '#E3002C' },
  G: { name: '松山新店線', color: '#008659' },
  O: { name: '中和新蘆線', color: '#F8B61C' },
  BL: { name: '板南線', color: '#0070BD' },
}

// ---------- 主流程 ----------
const round5 = (v: number) => Math.round(v * 1e5) / 1e5
const warnings: string[] = []

interface RouteOut {
  id: string
  kind: 'full' | 'short' | 'branch'
  stations: string[]
  runTimes: number[]
  stopTimes: number[]
  shape: Pt[]
  chainage: number[]
  stationKm: number[]
}

const lines = Object.keys(LINE_META).map((lineId) => {
  const shapeRec = shapes.find((s) => s.LineID === lineId)
  if (!shapeRec) throw new Error(`Shape 缺 ${lineId}`)
  const chains = stitch(parseMulti(shapeRec.Geometry))
  const chainCums = chains.map(cumLen)
  console.log(`${lineId}: ${parseMulti(shapeRec.Geometry).length} 段 → 縫合為 ${chains.length} 鏈（${chainCums.map((c) => (c[c.length - 1] / 1000).toFixed(1)).join(' / ')} km）`)

  const lineRoutes = s2s.filter((r) => r.LineID === lineId)
  const maxIntervals = Math.max(...lineRoutes.map((r) => r.TravelTimes.length))

  const routes: RouteOut[] = lineRoutes.map((r) => {
    // 站鏈：S2S TravelTimes 的 From 串起來＋最後一個 To
    const ids = [r.TravelTimes[0].FromStationID, ...r.TravelTimes.map((t) => t.ToStationID)]
    const shape: Pt[] = []
    const stationKm: number[] = [0]
    let total = 0

    for (let k = 1; k < ids.length; k++) {
      const pa = staPt(ids[k - 1])
      const pb = staPt(ids[k])
      // 找兩站都貼得夠近的鏈，取偏移和最小者
      let best: { ci: number; a: { m: number; off: number }; b: { m: number; off: number } } | null = null
      for (let ci = 0; ci < chains.length; ci++) {
        const a = project(pa, chains[ci], chainCums[ci])
        const b = project(pb, chains[ci], chainCums[ci])
        if (a.off < 150 && b.off < 150 && (!best || a.off + b.off < best.a.off + best.b.off)) best = { ci, a, b }
      }
      let seg: Pt[]
      if (best) {
        seg = slice(chains[best.ci], chainCums[best.ci], best.a.m, best.b.m)
        if (Math.max(best.a.off, best.b.off) > 80)
          warnings.push(`${r.RouteID} ${ids[k - 1]}→${ids[k]}: 投影偏移 ${best.a.off.toFixed(0)}/${best.b.off.toFixed(0)}m`)
      } else {
        // 跨鏈橋接：交會站前後分屬兩條鏈（支線↔主線）——各自切片、於交會點相接
        const bestFor = (p: Pt) => {
          let r2: { ci: number; m: number; off: number } | null = null
          for (let ci = 0; ci < chains.length; ci++) {
            const pr = project(p, chains[ci], chainCums[ci])
            if (pr.off < 150 && (!r2 || pr.off < r2.off)) r2 = { ci, ...pr }
          }
          return r2
        }
        const A = bestFor(pa)
        const B = bestFor(pb)
        if (A && B && A.ci !== B.ci) {
          // 交會點＝兩鏈四個端點中「離對方鏈最近」者（支線端點通常貼著主線）
          const chainA = chains[A.ci]
          const cumA = chainCums[A.ci]
          const chainB = chains[B.ci]
          const cumB = chainCums[B.ci]
          const ends = (pts: Pt[], cum: number[]): Array<{ m: number; pt: Pt }> => [
            { m: 0, pt: pts[0] },
            { m: cum[cum.length - 1], pt: pts[pts.length - 1] },
          ]
          const cands = [
            ...ends(chainA, cumA).map((e) => ({ own: 'A' as const, e, pr: project(e.pt, chainB, cumB) })),
            ...ends(chainB, cumB).map((e) => ({ own: 'B' as const, e, pr: project(e.pt, chainA, cumA) })),
          ].sort((x, y) => x.pr.off - y.pr.off)
          const jc = cands[0]
          const [mA, mB] = jc.own === 'A' ? [jc.e.m, jc.pr.m] : [jc.pr.m, jc.e.m]
          const seg1 = slice(chainA, cumA, A.m, mA)
          const seg2 = slice(chainB, cumB, mB, B.m)
          seg = seg1.concat(seg2.slice(1))
          if (jc.pr.off > 100)
            warnings.push(`${r.RouteID} ${ids[k - 1]}→${ids[k]}: 橋接間隙 ${jc.pr.off.toFixed(0)}m`)
        } else {
          seg = [pa, pb]
          warnings.push(`⚠️ ${r.RouteID} ${ids[k - 1]}→${ids[k]}: 無可用鏈，直線代替`)
        }
      }
      const segLen = cumLen(seg)[seg.length - 1]
      total += segLen
      stationKm.push(total)
      // 併入 route shape（跳過與前一點重複的接縫點）
      for (const p of shape.length ? seg.slice(1) : seg) shape.push(p)
    }

    const kind: RouteOut['kind'] =
      r.TravelTimes.length === maxIntervals ? 'full' : ids.some((id) => id.endsWith('A')) ? 'branch' : 'short'

    return {
      id: r.RouteID,
      kind,
      stations: ids,
      runTimes: r.TravelTimes.map((t) => t.RunTime),
      stopTimes: r.TravelTimes.map((t) => t.StopTime),
      shape: shape.map(([x, y]) => [round5(x), round5(y)] as Pt),
      chainage: cumLen(shape).map(Math.round),
      stationKm: stationKm.map(Math.round),
    }
  })

  // 該線用到的所有車站
  const usedIds = [...new Set(routes.flatMap((r) => r.stations))]
  return {
    id: lineId,
    name: LINE_META[lineId].name,
    color: LINE_META[lineId].color,
    stations: usedIds.map((id) => {
      const s = staById.get(id)!
      return {
        id,
        zh: s.StationName.Zh_tw,
        en: s.StationName.En,
        lonlat: [round5(s.StationPosition.PositionLon), round5(s.StationPosition.PositionLat)] as Pt,
      }
    }),
    routes,
  }
})

const out = {
  version: new Date().toISOString().slice(0, 10),
  generatedAt: new Date().toISOString(),
  meta: { warnings },
  lines,
}

const OUT_DIR = resolve(ROOT, 'web/public/data')
mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(resolve(OUT_DIR, 'network.json'), JSON.stringify(out))

console.log('\n=== 交路組裝結果 ===')
for (const l of lines)
  for (const r of l.routes)
    console.log(
      `${r.id.padEnd(5)} ${r.kind.padEnd(6)} ${String(r.stations.length).padStart(2)} 站  ${(r.stationKm[r.stationKm.length - 1] / 1000).toFixed(1).padStart(5)} km  shape ${r.shape.length} 點`,
    )
console.log(`\n警告 ${warnings.length} 筆${warnings.length ? '：' : ''}`)
for (const w of warnings) console.log('  ' + w)
const size = JSON.stringify(out).length
console.log(`\nnetwork.json 寫出：${(size / 1024).toFixed(0)}KB（未壓縮）`)
