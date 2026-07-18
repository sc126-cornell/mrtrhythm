// pipeline 共用：.env 載入與 TDX token 換發
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const TDX_BASE = 'https://tdx.transportdata.tw/api/basic'
const TOKEN_URL = 'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token'

export function loadEnv(): Record<string, string | undefined> {
  const out: Record<string, string> = {}
  try {
    for (const line of readFileSync(resolve(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch {
    // .env 不存在時走 process.env（CI／Vercel 環境）
  }
  return { ...out, ...process.env }
}

export async function getToken(): Promise<string> {
  const env = loadEnv()
  const id = env.TDX_CLIENT_ID
  const secret = env.TDX_CLIENT_SECRET
  if (!id || !secret) {
    throw new Error('缺少 TDX_CLIENT_ID / TDX_CLIENT_SECRET（請先完成 T0.1，複製 .env.example 為 .env 並填入金鑰）')
  }
  // CI 實測：token 端點偶發 500（GitHub 美國機房請求）——重試 3 次、間隔 20s
  let lastErr = ''
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: id,
        client_secret: secret,
      }),
    })
    if (res.ok) {
      const tok = (await res.json()) as { access_token: string; expires_in: number }
      console.log(`🔑 token 取得（效期 ${(tok.expires_in / 3600).toFixed(1)} 小時）`)
      return tok.access_token
    }
    lastErr = `HTTP ${res.status}`
    if (attempt < 3) {
      console.log(`token 第 ${attempt} 次失敗（${lastErr}），20s 後重試`)
      await new Promise((r) => setTimeout(r, 20_000))
    }
  }
  throw new Error(`TDX token 換發失敗：${lastErr}（已重試 3 次）`)
}
