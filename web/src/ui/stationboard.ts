// 車站看板：未來班次（時間排序、往向標示線色）＋收班狀態
// ⚠️ iOS 教訓：不可每秒 innerHTML 全量重建（觸控 click 會因節點抽換被取消）。
// 班次清單以「簽名」比對——清單不變時僅更新倒數文字節點；變化（班次駛離）才重建列。
import type { Station } from '../core/types.ts'
import type { Schedule } from '../core/schedule.ts'
import type { RouteGeo } from '../core/geo.ts'
import { fmtTime } from '../core/clock.ts'

export interface StationBoard {
  open(sta: Station): void
  close(): void
  readonly current: Station | null
  tick(t: number): void
}

export function initStationBoard(
  sched: Schedule,
  stations: Map<string, Station>,
  geo: Map<string, RouteGeo>,
  getTime: () => number,
  onChange: () => void,
): StationBoard {
  const el = document.getElementById('stationboard')!
  let current: Station | null = null
  let lastKey = -1
  let sig = ''

  el.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('[data-close]')) api.close()
  })

  const etaText = (left: number) => (left < 90 ? '即將發車' : `${Math.floor(left / 60)} 分`)

  function render() {
    if (!current) return
    const t = getTime()
    const deps = sched.departuresFrom(current.id, t, 10)
    const newSig = current.id + '|' + deps.map((d) => d.trip.route + d.d).join(',')

    if (newSig === sig) {
      // 清單未變：只更新倒數文字（不動 DOM 結構）
      const etas = el.querySelectorAll<HTMLElement>('.eta')
      deps.forEach((dep, i) => {
        const left = dep.d - t
        const node = etas[i]
        if (node) {
          node.textContent = etaText(left)
          node.classList.toggle('soon', left < 90)
        }
      })
      return
    }
    sig = newSig

    let html =
      `<div class="sb-head"><b>${current.zh}</b> <small>${current.en}・${current.id}</small>` +
      `<button data-close title="關閉">✕</button></div>`
    if (!deps.length) {
      html += `<div class="sb-empty">今日收班<br><small>拖曳時間軸回營運時段可見班次</small></div>`
    } else {
      for (const dep of deps) {
        const g = geo.get(dep.trip.path)
        const destId = dep.trip.stops[dep.trip.stops.length - 1].s
        const dest = stations.get(destId)?.zh ?? destId
        const left = dep.d - t
        const syn = dep.trip.synthetic ? '<span class="syn">＊</span>' : ''
        html +=
          `<div class="sb-row"><span class="dest"><i style="background:${g?.lineColor ?? '#888'}"></i>往 ${dest}${syn}</span>` +
          `<span class="tm">${fmtTime(dep.d).slice(0, 5)}</span>` +
          `<span class="eta${left < 90 ? ' soon' : ''}">${etaText(left)}</span></div>`
      }
      html += `<div class="sb-foot">＊＝班距推算（文湖線）・時刻為表定發車</div>`
    }
    el.innerHTML = html
  }

  const api: StationBoard = {
    get current() {
      return current
    },
    open(sta) {
      current = sta
      lastKey = -1
      sig = ''
      el.classList.remove('hidden')
      render()
      onChange()
    },
    close() {
      if (!current) return
      current = null
      sig = ''
      el.classList.add('hidden')
      onChange()
    },
    tick(t) {
      if (!current) return
      const key = Math.floor(t)
      if (key !== lastKey) {
        lastKey = key
        render()
      }
    },
  }
  return api
}
