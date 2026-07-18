// 站名搜尋：zh／en／站碼 子字串比對（「北車」可命中「台北車站」）
import type { Station } from '../core/types.ts'

export function initSearch(stations: Map<string, Station>, onPick: (s: Station) => void): void {
  const input = document.getElementById('searchInput') as HTMLInputElement
  const list = document.getElementById('searchResults')!
  const idx = [...stations.values()].map((s) => ({ s, hay: `${s.zh} ${s.en} ${s.id}`.toLowerCase() }))

  const hide = () => list.classList.add('hidden')

  function render(q: string) {
    const needle = q.trim().toLowerCase()
    if (!needle) {
      hide()
      return
    }
    const hits = idx.filter((x) => x.hay.includes(needle)).slice(0, 8)
    if (!hits.length) {
      list.innerHTML = `<div class="sr-none">找不到「${q}」</div>`
      list.classList.remove('hidden')
      return
    }
    list.innerHTML = hits
      .map((h) => `<button class="sr-row" data-id="${h.s.id}"><b>${h.s.zh}</b> <small>${h.s.en}・${h.s.id}</small></button>`)
      .join('')
    list.classList.remove('hidden')
  }

  input.addEventListener('input', () => render(input.value))
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      input.value = ''
      hide()
      input.blur()
    }
    e.stopPropagation() // 避免在輸入框打 1–4 觸發倍速
  })
  input.addEventListener('blur', () => setTimeout(hide, 150))

  list.addEventListener('mousedown', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('.sr-row')
    if (!btn) return
    const s = stations.get(btn.dataset.id!)
    if (s) {
      onPick(s)
      input.value = s.zh
      hide()
      input.blur()
    }
  })
}
