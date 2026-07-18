// T0.1 驗收：TDX OAuth2 client credentials 煙霧測試
// 讀取 repo 根目錄 .env 的 TDX_CLIENT_ID / TDX_CLIENT_SECRET，換發 access token
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function loadDotEnv(): Record<string, string> {
  const out: Record<string, string> = {}
  try {
    for (const line of readFileSync(resolve(root, '.env'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch {
    // .env 不存在時改用 process.env（CI／Vercel 環境）
  }
  return out
}

const env = { ...loadDotEnv(), ...process.env }
const id = env.TDX_CLIENT_ID
const secret = env.TDX_CLIENT_SECRET

if (!id || !secret) {
  console.error('❌ 缺少 TDX_CLIENT_ID / TDX_CLIENT_SECRET')
  console.error('   請先完成 T0.1：複製 .env.example 為 .env，填入 TDX 會員中心建立的金鑰')
  process.exit(1)
}

const res = await fetch(
  'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token',
  {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: id,
      client_secret: secret,
    }),
  },
)

if (!res.ok) {
  console.error(`❌ Token 換發失敗：HTTP ${res.status}`)
  console.error(await res.text())
  process.exit(1)
}

const tok = (await res.json()) as { access_token: string; expires_in: number }
console.log(
  `✅ TDX token 換發成功（效期 ${tok.expires_in}s ≈ ${(tok.expires_in / 3600).toFixed(1)} 小時）`,
)
