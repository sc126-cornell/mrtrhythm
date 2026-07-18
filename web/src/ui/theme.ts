// 外觀：一律依台北日出日落自動切換（2026-07-19 用戶指示取消手動模式）
// 太陽仰角本地計算（solar.ts），與裝置時區無關；每分鐘重評、分頁喚醒補評
import { isTaipeiNight } from '../core/solar.ts'

export function initTheme(onApply: (dark: boolean) => void): void {
  localStorage.removeItem('jiezou-theme') // 清除舊版手動偏好
  let last: boolean | null = null

  const apply = () => {
    const dark = isTaipeiNight()
    if (dark === last) return
    last = dark
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    onApply(dark)
  }

  setInterval(apply, 60_000)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) apply()
  })
  apply()
}
