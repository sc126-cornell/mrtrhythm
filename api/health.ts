// Vercel Serverless Function 煙霧測試端點（T0.4 驗收用）
// 不引入 @vercel/node 依賴，以結構型別描述最小介面即可
type Res = { status(code: number): { json(body: unknown): void } }

export default function handler(_req: unknown, res: Res) {
  res.status(200).json({
    ok: true,
    service: 'jiezou',
    phase: 'M0',
    time: new Date().toISOString(),
  })
}
