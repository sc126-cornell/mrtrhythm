// 站名搜尋：zh／en／站碼 子字串比對（「北車」可命中「台北車站」）
// iOS 加固：pointerdown 選取（早於 blur 序列）、聚焦全選舊字、hide 計時器可取消
import type { Station } from '../core/types.ts'

export function initSearch(stations: Map<string, Station>, onPick: (s: Station) => void): void {
  const input = document.getElementById('searchInput') as HTMLInputElement
  const list = document.getElementById('searchResults')!
  const idx = [...stations.values()].map((s) => ({ s, hay: `${s.zh} ${s.en} ${s.id}`.toLowerCase() }))

  let hideTimer = 0
  const hideNow = () => {
    clearTimeout(hideTimer)
    list.classList.add('hidden')
  }

  function render(q: string) {
    try {
      const needle = q.trim().toLowerCase()
      if (!needle) {
        hideNow()
        return
      }
      const hits = idx.filter((x) => x.hay.includes(needle)).slice(0, 8)
      list.innerHTML = hits.length
        ? hits
            .map(
              (h) =>
                `<button class="sr-row" data-id="${h.s.id}"><b>${h.s.zh}</b> <small>${h.s.en}・${h.s.id}</small></button>`,
            )
            .join('')
        : `<div class="sr-none">找不到「${q}」</div>`
      list.classList.remove('hidden')
    } catch (err) {
      console.error('[search]', err)
    }
  }

  input.addEventListener('input', () => render(input.value))
  input.addEventListener('focus', () => {
    input.select() // 舊查詢一鍵覆蓋（行動裝置重搜體驗）
    render(input.value)
  })
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      input.value = ''
      hideNow()
      input.blur()
    }
    e.stopPropagation() // 避免在輸入框打 1–4 觸發倍速
  })
  input.addEventListener('blur', () => {
    clearTimeout(hideTimer)
    hideTimer = window.setTimeout(() => list.classList.add('hidden'), 250)
  })

  // pointerdown：iOS 上早於 blur/click 序列，且不受節點抽換影響
  list.addEventListener('pointerdown', (e) => {
    try {
      clearTimeout(hideTimer)
      const btn = (e.target as HTMLElement).closest<HTMLElement>('.sr-row')
      if (!btn) return
      e.preventDefault()
      const s = stations.get(btn.dataset.id!)
      if (s) {
        onPick(s)
        input.value = s.zh
        hideNow()
        input.blur()
      }
    } catch (err) {
      console.error('[search:pick]', err)
    }
  })
}
