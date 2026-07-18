// URL 深連結：把畫面狀態編進 location.hash（replaceState，不轟炸歷史）
// c=lat,lng z=縮放 t=模擬秒(僅時間旅行時) spd=倍速(≠1時) f=route.dir.發車秒(跟隨) s=站碼(看板)
export interface DeepLinkState {
  c?: [number, number]
  z?: number
  t?: number
  spd?: number
  f?: string
  s?: string
}

export function parseHash(): DeepLinkState {
  const out: DeepLinkState = {}
  const h = new URLSearchParams(location.hash.replace(/^#/, ''))
  const c = h.get('c')?.split(',').map(Number)
  if (c?.length === 2 && c.every(Number.isFinite)) out.c = [c[0], c[1]]
  const z = Number(h.get('z'))
  if (Number.isFinite(z) && z >= 10 && z <= 19) out.z = z
  const t = Number(h.get('t'))
  if (Number.isFinite(t) && t >= 18000 && t <= 97200) out.t = t
  const spd = Number(h.get('spd'))
  if ([1, 10, 30, 60].includes(spd)) out.spd = spd
  const f = h.get('f')
  if (f && /^[A-Z]+-\d+\.\d\.\d+$/.test(f)) out.f = f
  const s = h.get('s')
  if (s && /^[A-Z]+\d+A?$/.test(s)) out.s = s
  return out
}

export function writeHash(st: DeepLinkState): void {
  const h = new URLSearchParams()
  if (st.c) h.set('c', `${st.c[0].toFixed(5)},${st.c[1].toFixed(5)}`)
  if (st.z !== undefined) h.set('z', String(st.z))
  if (st.t !== undefined) h.set('t', String(Math.floor(st.t)))
  if (st.spd !== undefined && st.spd !== 1) h.set('spd', String(st.spd))
  if (st.f) h.set('f', st.f)
  if (st.s) h.set('s', st.s)
  history.replaceState(null, '', `#${h.toString()}`)
}
