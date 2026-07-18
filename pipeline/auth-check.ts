// T0.1 驗收：TDX OAuth2 client credentials 煙霧測試
import { getToken } from './lib.ts'

try {
  await getToken()
  console.log('✅ TDX 金鑰有效')
} catch (e) {
  console.error(`❌ ${(e as Error).message}`)
  process.exitCode = 1
}
