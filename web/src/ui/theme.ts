// 外觀四段切換：台北日夜（預設）→ 跟隨系統 → 深色 → 亮色；localStorage 記憶
// 「台北日夜」依台北實際日出日落切換（solar.ts 本地計算，與裝置時區無關）
import { isTaipeiNight } from '../core/solar.ts'

export type ThemeMode = 'sun' | 'auto' | 'dark' | 'light'

const KEY = 'jiezou-theme'
const ORDER: ThemeMode[] = ['sun', 'auto', 'dark', 'light']
const ICONS: Record<ThemeMode, string> = { sun: '🌆', auto: '◐', dark: '🌙', light: '☀️' }
const LABELS: Record<ThemeMode, string> = {
  sun: '台北日夜（依台北日出日落自動）',
  auto: '跟隨系統',
  dark: '深色',
  light: '亮色',
}

export function initTheme(onApply: (dark: boolean) => void): void {
  const btn = document.getElementById('themeBtn')!
  const stored = localStorage.getItem(KEY) as ThemeMode | null
  let mode: ThemeMode = stored && ORDER.includes(stored) ? stored : 'sun'
  const mq = matchMedia('(prefers-color-scheme: dark)')
  let lastResolved: boolean | null = null

  const resolve = (): boolean => {
    if (mode === 'sun') return isTaipeiNight()
    if (mode === 'auto') return mq.matches
    return mode === 'dark'
  }

  function apply(force = false) {
    const dark = resolve()
    btn.textContent = ICONS[mode]
    btn.title = `外觀：${LABELS[mode]}（點擊切換）`
    if (!force && dark === lastResolved) return
    lastResolved = dark
    // auto 交給 CSS prefers-color-scheme；sun/dark/light 明確標注
    if (mode === 'auto') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    onApply(dark)
  }

  btn.addEventListener('click', () => {
    mode = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length]
    localStorage.setItem(KEY, mode)
    apply(true)
  })
  mq.addEventListener('change', () => {
    if (mode === 'auto') apply(true)
  })
  // 台北日夜：每分鐘重評（跨越晨昏線時自動換裝）；分頁喚醒時補一次
  setInterval(() => {
    if (mode === 'sun') apply()
  }, 60_000)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && mode === 'sun') apply()
  })
  apply(true)
}
