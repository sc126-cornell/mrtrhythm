// 車站看板：未來班次（時間排序、往向標示線色）＋收班狀態
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

  el.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('[data-close]')) api.close()
  })

  function render() {
    if (!current) return
    const t = getTime()
    const deps = sched.departuresFrom(current.id, t, 10)
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
        const eta = left < 90 ? '<b class="soon">即將發車</b>' : `${Math.floor(left / 60)} 分`
        const syn = dep.trip.synthetic ? '<span class="syn">＊</span>' : ''
        html +=
          `<div class="sb-row"><span class="dest"><i style="background:${g?.lineColor ?? '#888'}"></i>往 ${dest}${syn}</span>` +
          `<span class="tm">${fmtTime(dep.d).slice(0, 5)}</span><span class="eta">${eta}</span></div>`
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
      el.classList.remove('hidden')
      render()
      onChange()
    },
    close() {
      if (!current) return
      current = null
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
