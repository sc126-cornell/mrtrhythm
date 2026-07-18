// 模擬時鐘：simTime = 錨定值 + 牆鐘流逝 × 倍速
export type ServiceDay = 'weekday' | 'sat' | 'sun'

// ⚠️ 一律以台北時鐘為準（用戶可能在任何時區——實測：紐約用戶看到當地時間的班表）
function taipeiClock(): { sec: number; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    hour12: false,
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date())
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0'
  const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return {
    sec: (Number(get('hour')) % 24) * 3600 + Number(get('minute')) * 60 + Number(get('second')),
    weekday: WD[get('weekday')] ?? 0,
  }
}

// 營運日規則：台北凌晨 3 點前屬前一日班表（跨日班次 d > 86400）
export function serviceToday(): { day: ServiceDay; sec: number } {
  const t = taipeiClock()
  let sec = t.sec
  let wd = t.weekday
  if (sec < 3 * 3600) {
    sec += 86400
    wd = (wd + 6) % 7
  }
  return { day: wd === 0 ? 'sun' : wd === 6 ? 'sat' : 'weekday', sec }
}

export class SimClock {
  private anchorSim: number
  private anchorWall = performance.now()
  private spd = 1
  private isPaused = false

  constructor(startSim: number) {
    this.anchorSim = startSim
  }

  now(): number {
    if (this.isPaused) return this.anchorSim
    return this.anchorSim + ((performance.now() - this.anchorWall) * this.spd) / 1000
  }

  private rebase() {
    this.anchorSim = this.now()
    this.anchorWall = performance.now()
  }

  get speed(): number {
    return this.spd
  }
  set speed(s: number) {
    this.rebase()
    this.spd = s
  }

  get paused(): boolean {
    return this.isPaused
  }
  set paused(p: boolean) {
    if (p === this.isPaused) return
    this.rebase() // 暫停前結算；恢復前重設牆鐘錨點
    this.isPaused = p
  }

  jump(sim: number) {
    this.anchorSim = sim
    this.anchorWall = performance.now()
  }
}

export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec)) % 86400
  const hh = String(Math.floor(s / 3600)).padStart(2, '0')
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}
