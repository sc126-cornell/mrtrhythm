import './style.css'
import { createMap } from './map/basemap.ts'
import { TrainsLayer, type DrawItem } from './map/trains.ts'
import { SimClock, serviceToday, fmtTime } from './core/clock.ts'
import { Schedule } from './core/schedule.ts'
import { buildGeo, stationDict } from './core/geo.ts'
import { positionOf, type TrainState } from './core/position.ts'
import { initControls } from './ui/controls.ts'
import type { Network, TT, Trip } from './core/types.ts'

export const BUILD = 'M2a-20260718'

const DAY_LABEL: Record<string, string> = { weekday: '平日', sat: '週六', sun: '週日' }

async function boot() {
  const { day, sec } = serviceToday()
  const [net, tt] = await Promise.all([
    fetch('/data/network.json').then((r) => r.json() as Promise<Network>),
    fetch(`/data/tt-${day}.json`).then((r) => r.json() as Promise<TT>),
  ])

  const geo = buildGeo(net)
  const stations = stationDict(net)
  const sched = new Schedule(tt.trips)
  const clock = new SimClock(sec)
  const map = createMap('map', net)
  const trains = new TrainsLayer(map)

  console.info(`捷奏 BUILD ${BUILD} ・ ${DAY_LABEL[day]}班表 ${tt.trips.length} 班`)
  document.getElementById('dayBadge')!.textContent = DAY_LABEL[day]

  // 列車選取與資訊卡
  const infoEl = document.getElementById('traininfo')!
  let selected: Trip | null = null
  let lastState: TrainState | null = null

  const destName = (trip: Trip) => stations.get(trip.stops[trip.stops.length - 1].s)?.zh ?? '—'

  function renderInfo(t: number) {
    if (!selected || !lastState) {
      infoEl.classList.add('hidden')
      return
    }
    const g = geo.get(selected.path)!
    const idx = Math.min(lastState.nextStopIdx, selected.stops.length - 1)
    const next = selected.stops[idx]
    const eta = Math.max(0, Math.round(next.d - t))
    const nextName = stations.get(next.s)?.zh ?? next.s
    const badge = selected.synthetic ? '<span class="chip warn">班距推算</span>' : ''
    infoEl.innerHTML =
      `<span class="chip" style="background:${g.lineColor}">${g.lineName}</span>` +
      `<b>往 ${destName(selected)}</b> ${badge}<br>` +
      `<small>${lastState.moving ? '下一站' : '停靠'} ${nextName}` +
      `${lastState.moving ? `・約 ${Math.floor(eta / 60)} 分 ${eta % 60} 秒` : ''}` +
      `・${selected.route}・發車 ${fmtTime(selected.stops[0].d)}</small>`
    infoEl.classList.remove('hidden')
  }

  map.on('click', (e) => {
    const hit = trains.hitTest(e.containerPoint.x, e.containerPoint.y)
    selected = hit?.trip ?? null
    lastState = hit
    renderInfo(clock.now())
  })

  const ui = initControls(clock, () => {
    const nowSvc = serviceToday()
    if (nowSvc.day !== day) {
      location.reload() // 跨營運日：重載換班表
      return
    }
    clock.speed = clock.speed // no-op 保持倍速
    clock.paused = false
    clock.jump(nowSvc.sec)
  })

  // 效能檔位：?eco=1 或行動裝置 → 30fps；?fps=1 顯示幀率
  const params = new URLSearchParams(location.search)
  const eco = params.has('eco') || /Mobi|Android/i.test(navigator.userAgent)
  const fpsEl = params.has('fps') ? document.getElementById('fpsMeter')! : null
  fpsEl?.classList.remove('hidden')
  let frames = 0
  let fpsWindow = performance.now()
  let lastFrame = 0

  function frame(nowMs: number) {
    requestAnimationFrame(frame)
    if (eco && nowMs - lastFrame < 30) return // ~30fps
    lastFrame = nowMs

    const t = clock.now()
    const active = sched.activeAt(t)
    const items: DrawItem[] = []
    let selectedAlive = false
    for (const trip of active) {
      const g = geo.get(trip.path)
      if (!g) continue
      const st = positionOf(trip, t, g)
      if (!st) continue
      const isSel = trip === selected
      if (isSel) {
        selectedAlive = true
        lastState = st
      }
      items.push({ st, color: g.lineColor, selected: isSel })
    }
    trains.draw(items)
    ui.tick(t, items.length)
    if (selected) {
      if (!selectedAlive) {
        selected = null
        lastState = null
      }
      renderInfo(t)
    }

    if (fpsEl) {
      frames++
      if (nowMs - fpsWindow >= 1000) {
        fpsEl.textContent = `${frames} fps ・ ${items.length} 班`
        frames = 0
        fpsWindow = nowMs
      }
    }
  }
  requestAnimationFrame(frame)
}

boot().catch((err) => {
  document.getElementById('trainCount')!.textContent = '載入失敗'
  console.error(err)
})
