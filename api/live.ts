// GET /api/live —— 北捷即時到站看板（事件式）瘦身代理
// CDN 共享快取 15s：使用者數與 TDX 呼叫數脫鉤（SDD §7；限流見 SPIKE-NOTES §4）
import { fetchTdx, type Res } from './_tdx.js'

interface LiveRow {
  LineID: string
  StationID: string
  DestinationStationID?: string
  DestinationStaionID?: string // TDX 原始欄位拼字如此
  ServiceStatus: number
  SrcUpdateTime: string
}

const METRO_LINES = new Set(['BR', 'R', 'G', 'O', 'BL'])

export default async function handler(_req: unknown, res: Res) {
  try {
    const data = (await fetchTdx('/v2/Rail/Metro/LiveBoard/TRTC?%24top=1000&%24format=JSON')) as LiveRow[]
    const events = data
      .filter((r) => METRO_LINES.has(r.LineID))
      .map((r) => ({
        sta: r.StationID,
        dest: r.DestinationStationID ?? r.DestinationStaionID ?? '',
        t: r.SrcUpdateTime,
      }))
      .filter((e) => e.dest)
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30')
    res.status(200).json({ ok: true, events })
  } catch (e) {
    res.setHeader('Cache-Control', 's-maxage=10')
    res.status(503).json({ ok: false, error: String((e as Error).message).slice(0, 80) })
  }
}
