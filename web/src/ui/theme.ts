// 外觀三段切換：自動（跟隨系統）→ 深色 → 亮色；localStorage 記憶
export type ThemeMode = 'auto' | 'dark' | 'light'

const KEY = 'jiezou-theme'
const ICONS: Record<ThemeMode, string> = { auto: '◐', dark: '🌙', light: '☀️' }
const LABELS: Record<ThemeMode, string> = { auto: '自動', dark: '深色', light: '亮色' }

export function initTheme(onApply: (dark: boolean) => void): void {
  const btn = document.getElementById('themeBtn')!
  const stored = localStorage.getItem(KEY) as ThemeMode | null
  let mode: ThemeMode = stored === 'dark' || stored === 'light' ? stored : 'auto'
  const mq = matchMedia('(prefers-color-scheme: dark)')

  function apply() {
    if (mode === 'auto') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = mode
    btn.textContent = ICONS[mode]
    btn.title = `外觀：${LABELS[mode]}（點擊切換）`
    onApply(mode === 'auto' ? mq.matches : mode === 'dark')
  }

  btn.addEventListener('click', () => {
    mode = mode === 'auto' ? 'dark' : mode === 'dark' ? 'light' : 'auto'
    localStorage.setItem(KEY, mode)
    apply()
  })
  mq.addEventListener('change', () => {
    if (mode === 'auto') apply()
  })
  apply()
}
