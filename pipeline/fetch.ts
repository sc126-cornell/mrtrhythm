// T1.1 每日靜態資料抓取器
// 用法：npx tsx pipeline/fetch.ts [--force]
// raw/<name>.json 若為今日抓取則跳過；節流 15s、429 退避 65s（TDX 免費層限流，見 SPIKE-NOTES §4）
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ROOT, TDX_BASE, getToken } from './lib.ts'

const RAW = resolve(ROOT, 'pipeline/raw')
mkdirSync(RAW, { recursive: true })

// 僅每日靜態資料；LiveBoard/Alert 屬即時代理（M4），不在此列
const STATIC_ENDPOINTS = [
  'Station',
  'StationOfLine',
  'Shape',
  'S2STravelTime',
  'Frequency',
  'FirstLastTimetable',
  'StationTimeTable',
] as const

const force = process.argv.includes('--force')
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const isToday = (p: string) => {
  const d = statSync(p).mtime
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}

let token: string | null = null
let fetched = 0

for (const name of STATIC_ENDPOINTS) {
  const rawPath = resolve(RAW, `${name}.json`)
  if (!force && existsSync(rawPath) && isToday(rawPath)) {
    console.log(`⏭ ${name}: 今日快取存在，跳過`)
    continue
  }
  token ??= await getToken()
  if (fetched > 0) await sleep(15_000)
  const url = `${TDX_BASE}/v2/Rail/Metro/${name}/TRTC?%24top=1000000&%24format=JSON`
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } })
    if (res.status === 429 && attempt < 4) {
      console.log(`⏳ ${name}: 429 限流，等 65s 重試（${attempt}）`)
      await sleep(65_000)
      continue
    }
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status} — ${(await res.text()).slice(0, 200)}`)
    const text = await res.text()
    JSON.parse(text) // 壞檔防呆：不可解析就丟例外、不落盤
    writeFileSync(rawPath, text)
    console.log(`✅ ${name}: ${(text.length / 1024).toFixed(0)}KB`)
    fetched++
    break
  }
}

console.log(`完成（新抓 ${fetched} 個端點）`)
