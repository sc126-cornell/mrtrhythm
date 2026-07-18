// Vercel Functions 共用：TDX token 記憶體快取與代理抓取
// 底線開頭的檔案不會成為路由
const TOKEN_URL = 'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token'
export const TDX_BASE = 'https://tdx.transportdata.tw/api/basic'

let cache: { token: string; exp: number } | null = null

export async function getToken(): Promise<string> {
  if (cache && Date.now() < cache.exp) return cache.token
  const id = process.env.TDX_CLIENT_ID
  const secret = process.env.TDX_CLIENT_SECRET
  if (!id || !secret) throw new Error('TDX env not configured')
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret }),
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) throw new Error(`token ${res.status}`)
  const tok = (await res.json()) as { access_token: string; expires_in: number }
  // 提前 5 分鐘視為過期（冷啟動重換發可接受）
  cache = { token: tok.access_token, exp: Date.now() + (tok.expires_in - 300) * 1000 }
  return tok.access_token
}

export async function fetchTdx(path: string): Promise<unknown> {
  const token = await getToken()
  const res = await fetch(`${TDX_BASE}${path}`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(3000),
  })
  if (!res.ok) throw new Error(`tdx ${res.status}`)
  return res.json()
}

export interface Res {
  setHeader(k: string, v: string): void
  status(code: number): { json(body: unknown): void }
}
