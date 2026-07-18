import './style.css'
import { createMap } from './map/basemap.ts'
import { TrainsLayer, type DrawItem } from './map/trains.ts'
import { SimClock, serviceToday, fmtTime } from './core/clock.ts'
import { Schedule } from './core/schedule.ts'
import { buildGeo, stationDict, distMeters } from './core/geo.ts'
import { positionOf, type TrainState } from './core/position.ts'
import { initControls } from './ui/controls.ts'
import { initStationBoard } from './ui/stationboard.ts'
import { Calibrator, type LiveEvent } from './core/calibrate.ts'
import { initSearch } from './ui/search.ts'
import { parseHash, writeHash } from './ui/deeplink.ts'
import { initTheme } from './ui/theme.ts'
import type { Network, Station, TT, Trip } from './core/types.ts'

export const BUILD = 'M5a-20260718'

// 遠端除錯保底：任何未攔截錯誤浮出到徽章（行動裝置無 console 可看）
window.addEventListener('error', (e) => {
  const el = document.getElementById('trainCount')
  if (el) el.textContent = `⚠ ${String(e.message).slice(0, 40)}`
})
window.addEventListener('unhandledrejection', (e) => {
  const el = document.getElementById('trainCount')
  if (el) el.textContent = `⚠ ${String(e.reason).slice(0, 40)}`
})

const DAY_LABEL: Record<string, string> = { weekday: '平日', sat: '週六', sun: '週日' }
const tripKey = (t: Trip) => `${t.route}.${t.dir}.${t.stops[0].d}`

async function boot() {
  const svc = serviceToday()
  // ?day=weekday|sat|sun：測試用日別覆蓋（尖峰效能驗證等）
  const forced = new URLSearchParams(location.search).get('day')
  const day = forced === 'weekday' || forced === 'sat' || forced === 'sun' ? forced : svc.day
  const sec = svc.sec
  const [net, tt] = await Promise.all([
    fetch('/data/network.json').then((r) => r.json() as Promise<Network>),
    fetch(`/data/tt-${day}.json`).then((r) => r.json() as Promise<TT>),
  ])

  const geo = buildGeo(net)
  const stations = stationDict(net)
  const sched = new Schedule(tt.trips)
  const clock = new SimClock(sec)
  const calib = new Calibrator()
  ;(window as unknown as Record<string, unknown>).__calCsv = () => calib.csv()

  console.info(`捷奏 BUILD ${BUILD} ・ ${DAY_LABEL[day]}班表 ${tt.trips.length} 班`)
  document.getElementById('dayBadge')!.textContent = DAY_LABEL[day]

  // ---- 選取與跟隨狀態 ----
  let selected: Trip | null = null
  let lastState: TrainState | null = null
  let follow: 'off' | 'lock' | 'free' = 'off'
  let timeTravel = false
  let speedKmh = 0
  let lastSample: { t: number; lonlat: [number, number] } | null = null
  // ⚠️ 必須在所有回呼接線（board offsetFor 等）之前宣告——曾因排在深連結還原之後，
  // 造成帶 s= 的分享連結開啟即 TDZ 崩潰
  const nowMode = () => !timeTravel && clock.speed === 1 && !clock.paused

  const infoEl = document.getElementById('traininfo')!
  const backBtn = document.getElementById('backBtn')!

  // 手機看板為底部半屏：聚焦車站時把它抬到可視區上緣 ~28%，避免被看板蓋住
  const isMobile = () => matchMedia('(max-width: 640px)').matches
  function focusStation(s: Station, minZoom = 0) {
    const target: [number, number] = [s.lonlat[1], s.lonlat[0]]
    map.setView(target, Math.max(map.getZoom(), minZoom))
    if (isMobile()) map.panBy([0, map.getSize().y * 0.22], { animate: false })
  }

  const { map, wasStationClick, setTheme } = createMap('map', net, (s) => {
    board.open(s)
    focusStation(s)
  })
  const trains = new TrainsLayer(map)
  let isDark = false
  initTheme((d) => {
    isDark = d
    setTheme(d)
  })

  // 自繪站名標籤（NLSC 點陣磚無 @2x：銳利/大字不可兼得——站名由我們畫，銳利且字級可控）
  // 轉乘站同名雙站碼（R10/BL12）合併為一枚，取座標平均
  const stationLabels: Array<{ lonlat: [number, number]; zh: string }> = []
  {
    const byName = new Map<string, Array<[number, number]>>()
    for (const s of stations.values()) {
      let arr = byName.get(s.zh)
      if (!arr) byName.set(s.zh, (arr = []))
      arr.push(s.lonlat)
    }
    for (const [zh, pts] of byName) {
      const groups: Array<Array<[number, number]>> = []
      for (const p of pts) {
        const g = groups.find((G) => distMeters(G[0], p) < 500)
        if (g) g.push(p)
        else groups.push([p])
      }
      for (const g of groups) {
        stationLabels.push({
          lonlat: [g.reduce((a, q) => a + q[0], 0) / g.length, g.reduce((a, q) => a + q[1], 0) / g.length],
          zh,
        })
      }
    }
  }

  // 關於面板
  const aboutPanel = document.getElementById('aboutPanel')!
  document.getElementById('aboutBuild')!.textContent = BUILD
  document.getElementById('aboutBtn')!.addEventListener('click', () => aboutPanel.classList.remove('hidden'))
  document.getElementById('aboutClose')!.addEventListener('click', () => aboutPanel.classList.add('hidden'))
  aboutPanel.addEventListener('click', (e) => {
    if (e.target === aboutPanel) aboutPanel.classList.add('hidden')
  })

  const board = initStationBoard(
    sched,
    stations,
    geo,
    () => clock.now(),
    () => syncHash(),
    (trip) => (nowMode() && calib.active ? calib.offsetFor(trip) : 0),
  )
  initSearch(stations, (s) => {
    board.open(s)
    focusStation(s, 15)
  })

  const destName = (trip: Trip) => stations.get(trip.stops[trip.stops.length - 1].s)?.zh ?? '—'

  function setFollow(mode: 'off' | 'lock' | 'free') {
    follow = mode
    infoBuilt = false // 按鈕文字（跟隨/取消跟隨）需重建骨架
    backBtn.classList.toggle('hidden', mode !== 'free')
    syncHash()
  }

  function select(trip: Trip | null, state: TrainState | null) {
    selected = trip
    lastState = state
    speedKmh = 0
    lastSample = null
    infoBuilt = false // 路線頭／終點／發車時刻換班次需重建骨架
    if (!trip) setFollow('off')
    renderInfo(clock.now())
    syncHash()
  }

  // ⚠️ iOS 教訓：資訊卡不可每幀 innerHTML 重建——觸控的 touchstart→click 序列中
  // 節點被抽換會讓 iOS 取消 click（按鈕全滅）。骨架只建一次，每幀僅更新文字節點。
  let infoBuilt = false
  function buildInfoSkeleton() {
    if (!selected) return
    const g = geo.get(selected.path)!
    const badge = selected.synthetic ? '<span class="chip warn">班距推算</span>' : ''
    const followBtn =
      follow === 'off'
        ? '<button data-act="follow">🎥 跟隨</button>'
        : '<button data-act="unfollow">取消跟隨</button>'
    infoEl.innerHTML =
      `<div><span class="chip" style="background:${g.lineColor}">${g.lineName}</span>` +
      `<b>往 ${destName(selected)}</b> ${badge}</div>` +
      `<div class="ti-sub"><span id="tiStatus"></span><span id="tiEta"></span>` +
      `・<span class="spd"><span id="tiSpd">0</span> km/h</span></div>` +
      `<div class="ti-btns">${followBtn}<button data-act="close">✕ 關閉</button>` +
      `<small>${selected.route}・發車 ${fmtTime(selected.stops[0].d).slice(0, 5)}</small></div>`
    infoEl.classList.remove('hidden')
    infoBuilt = true
  }

  function renderInfo(t: number) {
    if (!selected || !lastState) {
      infoEl.classList.add('hidden')
      infoBuilt = false
      return
    }
    if (!infoBuilt) buildInfoSkeleton()
    const idx = Math.min(lastState.nextStopIdx, selected.stops.length - 1)
    const next = selected.stops[idx]
    const eta = Math.max(0, Math.round(next.d - t))
    const nextName = stations.get(next.s)?.zh ?? next.s
    document.getElementById('tiStatus')!.textContent = `${lastState.moving ? '下一站' : '停靠'} ${nextName}`
    document.getElementById('tiEta')!.textContent = lastState.moving
      ? `・${Math.floor(eta / 60)} 分 ${String(eta % 60).padStart(2, '0')} 秒`
      : ''
    document.getElementById('tiSpd')!.textContent = String(Math.round(speedKmh))
  }

  infoEl.addEventListener('click', (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act
    if (act === 'close') select(null, null)
    if (act === 'unfollow') {
      setFollow('off')
      renderInfo(clock.now())
    }
    if (act === 'follow' && lastState) {
      if (map.getZoom() < 14) map.setView([lastState.lonlat[1], lastState.lonlat[0]], 15)
      setFollow('lock')
      renderInfo(clock.now())
    }
  })

  backBtn.addEventListener('click', () => setFollow('lock'))
  map.on('dragstart', () => {
    if (follow === 'lock') setFollow('free')
  })

  map.on('click', (e) => {
    if (wasStationClick()) return
    const hit = trains.hitTest(e.containerPoint.x, e.containerPoint.y)
    select(hit?.trip ?? null, hit)
  })

  // ---- 深連結 ----
  // 注意：跟隨中 panTo 每幀觸發 moveend——用 throttle（含尾端保底）而非 debounce，
  // 否則計時器永遠被重置、hash 永不更新
  let hashTimer = 0
  let lastHashWrite = 0
  function syncHash() {
    const write = () => {
      lastHashWrite = Date.now()
      const c = map.getCenter()
      writeHash({
        c: [c.lat, c.lng],
        z: map.getZoom(),
        t: timeTravel ? clock.now() : undefined,
        spd: clock.speed,
        f: follow !== 'off' && selected ? tripKey(selected) : undefined,
        s: board.current?.id,
      })
    }
    clearTimeout(hashTimer)
    if (Date.now() - lastHashWrite > 1000) write()
    else hashTimer = window.setTimeout(write, 400)
  }
  map.on('moveend', syncHash)

  const ui = initControls(
    clock,
    () => goNow(),
    {
      onSpeedChange: () => syncHash(),
      onJump: () => {
        timeTravel = true
        syncHash()
      },
    },
  )

  // 回到即時：現在時刻＋1×＋播放，一鍵完整還原
  const btnNowEl = document.getElementById('btnNow')!
  function goNow() {
    const nowSvc = serviceToday()
    if (nowSvc.day !== day) {
      location.reload() // 跨營運日：重載換班表
      return
    }
    timeTravel = false
    clock.paused = false
    ui.setSpeed(1)
    ui.syncPlay()
    clock.jump(nowSvc.sec)
    syncHash()
  }

  // 還原深連結狀態
  {
    const dl = parseHash()
    if (dl.c) map.setView(dl.c, dl.z ?? map.getZoom())
    if (dl.t !== undefined) {
      timeTravel = true
      clock.jump(dl.t)
    }
    if (dl.spd) ui.setSpeed(dl.spd)
    if (dl.s) {
      const s = stations.get(dl.s)
      if (s) board.open(s)
    }
    if (dl.f) {
      const trip = sched.trips.find((tr) => tripKey(tr) === dl.f)
      if (trip) {
        const g = geo.get(trip.path)
        const st = g ? positionOf(trip, clock.now(), g) : null
        if (st) {
          select(trip, st)
          if (!dl.c) map.setView([st.lonlat[1], st.lonlat[0]], Math.max(dl.z ?? 15, 14))
          setFollow('lock')
        }
      }
    }
  }

  // ---- 即時校正輪詢（僅「現在模式」：非時間旅行、1×、未暫停）----
  const liveBadge = document.getElementById('liveBadge')!
  const alertBanner = document.getElementById('alertBanner')!

  async function pollLive() {
    if (!nowMode() || document.hidden) return
    try {
      const r = await fetch('/api/live')
      if (!r.ok) return
      const j = (await r.json()) as { ok: boolean; events?: LiveEvent[] }
      if (j.ok && Array.isArray(j.events)) calib.ingest(j.events, clock.now(), sched)
    } catch {
      // TDX／代理失效：靜默退化為純表定
    }
  }
  async function pollAlerts() {
    if (document.hidden) return
    try {
      const r = await fetch('/api/alerts')
      if (!r.ok) return
      const j = (await r.json()) as { ok: boolean; alerts?: Array<{ title: string }> }
      if (j.ok && j.alerts?.length) {
        alertBanner.textContent = `⚠ ${j.alerts[0].title}`
        alertBanner.classList.remove('hidden')
      } else {
        alertBanner.classList.add('hidden')
      }
    } catch {
      // 告警取得失敗不影響主功能
    }
  }
  setInterval(pollLive, 20_000)
  setInterval(pollAlerts, 60_000)
  pollLive()
  pollAlerts()

  // ---- 效能檔位 ----
  const params = new URLSearchParams(location.search)
  const eco = params.has('eco') || /Mobi|Android/i.test(navigator.userAgent)
  const fpsEl = params.has('fps') ? document.getElementById('fpsMeter')! : null
  fpsEl?.classList.remove('hidden')
  let frames = 0
  let fpsWindow = performance.now()
  let lastFrame = 0

  function frame(nowMs: number) {
    requestAnimationFrame(frame)
    if (eco && nowMs - lastFrame < 30) return
    lastFrame = nowMs

    const t = clock.now()
    calib.tick()
    const applyCal = nowMode() && calib.active
    liveBadge.textContent = applyCal ? '即時⚡' : '表定'
    liveBadge.classList.toggle('on', applyCal)
    btnNowEl.classList.toggle('attention', !nowMode()) // 偏離即時→亮起指路
    const active = sched.activeAt(t)
    const items: DrawItem[] = []
    let selectedAlive = false
    for (const trip of active) {
      const g = geo.get(trip.path)
      if (!g) continue
      const st = positionOf(trip, applyCal ? t - calib.offsetFor(trip) : t, g)
      if (!st) continue
      const isSel = trip === selected
      if (isSel) {
        selectedAlive = true
        // 時速：模擬時間下的位移微分＋EMA 平滑
        if (lastSample && t > lastSample.t) {
          const v = (distMeters(lastSample.lonlat, st.lonlat) / (t - lastSample.t)) * 3.6
          speedKmh = speedKmh * 0.85 + v * 0.15
        }
        lastSample = { t, lonlat: st.lonlat }
        lastState = st
      }
      items.push({ st, color: g.lineColor, selected: isSel })
    }
    trains.draw(items, stationLabels, isDark)
    ui.tick(t, items.length)
    board.tick(t)

    if (selected) {
      if (!selectedAlive) select(null, null)
      else {
        if (follow === 'lock' && lastState) map.panTo([lastState.lonlat[1], lastState.lonlat[0]], { animate: false })
        renderInfo(t)
      }
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
