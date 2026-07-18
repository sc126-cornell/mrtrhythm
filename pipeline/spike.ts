// T0.3 API Spike：實測 9 個 TDX Metro 端點（TRTC）
// 完整回應存 pipeline/raw/（gitignored），節錄樣本存 pipeline/samples/（進版控）
// Spike 發現：免費層有突發限流（連發 9 次時第 6 次起 429）→ 端點間隔 15s、429 退避 65s
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ROOT, TDX_BASE, getToken } from './lib.ts'

const RAW = resolve(ROOT, 'pipeline/raw')
const SAMPLES = resolve(ROOT, 'pipeline/samples')
mkdirSync(RAW, { recursive: true })
mkdirSync(SAMPLES, { recursive: true })

const ENDPOINTS = [
  { name: 'Station', path: '/v2/Rail/Metro/Station/TRTC' },
  { name: 'StationOfLine', path: '/v2/Rail/Metro/StationOfLine/TRTC' },
  { name: 'Shape', path: '/v2/Rail/Metro/Shape/TRTC' },
  { name: 'S2STravelTime', path: '/v2/Rail/Metro/S2STravelTime/TRTC' },
  { name: 'Frequency', path: '/v2/Rail/Metro/Frequency/TRTC' },
  { name: 'FirstLastTimetable', path: '/v2/Rail/Metro/FirstLastTimetable/TRTC' },
  { name: 'StationTimeTable', path: '/v2/Rail/Metro/StationTimeTable/TRTC' },
  { name: 'LiveBoard', path: '/v2/Rail/Metro/LiveBoard/TRTC' },
  { name: 'Alert', path: '/v2/Rail/Metro/Alert/TRTC' },
]

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// 節錄：頂層大陣列只留前 3 筆＋總數；物件內的大陣列欄位同理
function trim(v: unknown): unknown {
  if (Array.isArray(v)) return { __totalCount: v.length, __sample: v.slice(0, 3) }
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v)) {
      o[k] = Array.isArray(val) && val.length > 5 ? { __totalCount: val.length, __sample: val.slice(0, 3) } : val
    }
    return o
  }
  return v
}

const token = await getToken()
const summary: string[] = []

for (const ep of ENDPOINTS) {
  const rawPath = resolve(RAW, `${ep.name}.json`)
  if (existsSync(rawPath)) {
    summary.push(`⏭ ${ep.name}: raw 已存在，跳過`)
    continue
  }
  const url = `${TDX_BASE}${ep.path}?%24top=1000000&%24format=JSON`
  for (let attempt = 1; ; attempt++) {
    const t0 = Date.now()
    try {
      const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } })
      const text = await res.text()
      const ms = Date.now() - t0
      if (res.status === 429 && attempt < 4) {
        console.log(`⏳ ${ep.name}: 429 限流，等 65s 後重試（第 ${attempt} 次）`)
        await sleep(65_000)
        continue
      }
      if (!res.ok) {
        summary.push(`❌ ${ep.name}: HTTP ${res.status} (${ms}ms) — ${text.slice(0, 120)}`)
        break
      }
      const data = JSON.parse(text) as unknown
      writeFileSync(rawPath, text)
      writeFileSync(
        resolve(SAMPLES, `${ep.name}.sample.json`),
        JSON.stringify({ fetchedAt: new Date().toISOString(), url, data: trim(data) }, null, 2),
      )
      const count = Array.isArray(data) ? data.length : `(object: ${Object.keys(data as object).join(',').slice(0, 60)})`
      summary.push(`✅ ${ep.name}: ${count} 筆, ${(text.length / 1024).toFixed(0)}KB, ${ms}ms`)
      break
    } catch (e) {
      summary.push(`❌ ${ep.name}: ${(e as Error).message.slice(0, 120)}`)
      break
    }
  }
  await sleep(15_000) // 免費層限流：端點間隔 15s
}

console.log('\n=== Spike 摘要 ===')
for (const line of summary) console.log(line)
console.log('\n完整回應在 pipeline/raw/，節錄樣本在 pipeline/samples/')
