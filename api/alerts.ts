// GET /api/alerts —— 北捷營運告警（過濾「正常營運」佔位訊息）
import { fetchTdx, type Res } from './_tdx.js'

interface AlertPayload {
  Alerts?: Array<{ AlertID: string; Title: string; Description?: string; Status: number }>
}

export default async function handler(_req: unknown, res: Res) {
  try {
    const data = (await fetchTdx('/v2/Rail/Metro/Alert/TRTC?%24format=JSON')) as AlertPayload
    const alerts = (data.Alerts ?? [])
      .filter((a) => a.AlertID !== '0' && a.Title !== '正常營運')
      .map((a) => ({ title: a.Title, desc: (a.Description ?? '').slice(0, 200) }))
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120')
    res.status(200).json({ ok: true, alerts })
  } catch {
    res.setHeader('Cache-Control', 's-maxage=30')
    res.status(503).json({ ok: false })
  }
}
