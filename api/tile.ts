// GET /api/tile?z=&x=&y= —— NLSC 圖磚全球邊緣快取代理
// 動機：NLSC 僅台灣機房，海外用戶跨洋抓磚極慢（detectRetina 4 倍磚數放大之）
// 快取：邊緣 30 天＋瀏覽器 1 天（圖磚內容按月更版，immutable 安全）
interface TileReq {
  query?: Record<string, string | string[] | undefined>
}
interface TileRes {
  setHeader(k: string, v: string): void
  status(code: number): { send(body: Buffer): void; json(body: unknown): void }
}

const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : (v ?? ''))

export default async function handler(req: TileReq, res: TileRes) {
  const z = Number(one(req.query?.z))
  const x = Number(one(req.query?.x))
  const y = Number(one(req.query?.y))
  const max = 2 ** z
  if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y) || z < 7 || z > 20 || x < 0 || y < 0 || x >= max || y >= max) {
    res.setHeader('Cache-Control', 's-maxage=86400')
    res.status(400).json({ ok: false })
    return
  }
  try {
    // 注意 NLSC WMTS 路徑順序為 {z}/{y}/{x}
    const r = await fetch(`https://wmts.nlsc.gov.tw/wmts/EMAP/default/GoogleMapsCompatible/${z}/${y}/${x}`, {
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) {
      res.setHeader('Cache-Control', 's-maxage=60')
      res.status(502).json({ ok: false })
      return
    }
    const buf = Buffer.from(await r.arrayBuffer())
    res.setHeader('Content-Type', r.headers.get('content-type') ?? 'image/png')
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=2592000, immutable')
    res.status(200).send(buf)
  } catch {
    res.setHeader('Cache-Control', 's-maxage=30')
    res.status(504).json({ ok: false })
  }
}
