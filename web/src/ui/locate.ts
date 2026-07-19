// 「我的位置」——藍點＋精度圈＋朝向光束（與 nycrhythm 同款姊妹功能）。
// 開站自動啟動：瀏覽器的定位詢問即同意面；auto 模式的錯誤／範圍外一律靜默，
// 拒絕過的訪客不會被重複騷擾。iOS 羅盤（motion）權限依規需手勢，
// 光束於首次觸碰畫面時補綁（先前已允許者無感）。
// 每次啟動只置中一次；帶深連結開站由呼叫端決定不自動啟動。
// 方向來源：iOS webkitCompassHeading ＞ Android absolute alpha ＞ GPS 行進方向（步行中）。
import * as L from 'leaflet'

const TPE: [number, number] = [25.05, 121.53]
const kmFromTpe = (lat: number, lon: number): number => {
  const rad = Math.PI / 180
  const x = (lon - TPE[1]) * rad * Math.cos(((lat + TPE[0]) / 2) * rad)
  const y = (lat - TPE[0]) * rad
  return Math.hypot(x, y) * 6371
}

type CompassEvent = DeviceOrientationEvent & { webkitCompassHeading?: number }

// 先存成布林：行內 `in window` 守衛會把 window 窄化成 never
const hasAbsoluteOrientation = 'ondeviceorientationabsolute' in window

export function initLocate(map: L.Map, onCenter: () => void, auto = false) {
  const btn = document.getElementById('locateBtn') as HTMLButtonElement
  let watchId: number | null = null
  let marker: L.Marker | null = null
  let ring: L.Circle | null = null
  let beamEl: HTMLElement | null = null
  let centered = false
  let warned = false
  let compass = false // 已有羅盤來源在供應方向
  let shownDeg = 0 // 解纏繞後的累積角度，避免 CSS 轉場繞遠路
  let beamOn = false
  let boundEvent: 'deviceorientation' | 'deviceorientationabsolute' | null = null
  let retryPending = false

  function toast(msg: string) {
    const el = document.createElement('div')
    el.className = 'toast'
    el.textContent = msg
    document.body.appendChild(el)
    setTimeout(() => el.remove(), 2600)
  }

  function applyHeading(h: number) {
    if (!beamEl) return
    const delta = ((((h - shownDeg) % 360) + 540) % 360) - 180
    if (beamOn && Math.abs(delta) < 2) return
    shownDeg += delta
    beamEl.style.transform = `rotate(${shownDeg}deg)`
    if (!beamOn) {
      beamOn = true
      beamEl.style.opacity = '1'
    }
  }

  const onOrient = (e: CompassEvent) => {
    let h: number | null = null
    if (typeof e.webkitCompassHeading === 'number' && !Number.isNaN(e.webkitCompassHeading)) {
      // iOS：以裝置頂端為準、順時針自北——補償螢幕旋轉
      h = e.webkitCompassHeading + (screen.orientation?.angle ?? 0)
    } else if (e.absolute && e.alpha !== null) {
      h = 360 - e.alpha + (screen.orientation?.angle ?? 0)
    }
    if (h === null) return
    compass = true
    applyHeading(((h % 360) + 360) % 360)
  }

  const retryBind = () => {
    retryPending = false
    if (watchId !== null && !boundEvent) bindOrientation(false)
  }

  function bindOrientation(deferToGesture: boolean) {
    // iOS 13+ 的羅盤權限必須在點擊手勢內請求
    const doe = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }
    if (typeof doe.requestPermission === 'function') {
      doe
        .requestPermission()
        .then((r) => {
          // 對話框可能比功能活得久：定位仍開著才綁
          if (r === 'granted' && watchId !== null) {
            boundEvent = 'deviceorientation'
            window.addEventListener('deviceorientation', onOrient)
          }
        })
        .catch(() => {
          if (deferToGesture && !retryPending) {
            retryPending = true
            window.addEventListener('pointerdown', retryBind, { once: true })
          }
        })
    } else if (hasAbsoluteOrientation) {
      boundEvent = 'deviceorientationabsolute'
      window.addEventListener('deviceorientationabsolute', onOrient as EventListener)
    } else {
      boundEvent = 'deviceorientation'
      window.addEventListener('deviceorientation', onOrient)
    }
  }

  function stop() {
    if (watchId !== null) navigator.geolocation.clearWatch(watchId)
    watchId = null
    if (boundEvent) window.removeEventListener(boundEvent, onOrient as EventListener)
    boundEvent = null
    window.removeEventListener('pointerdown', retryBind)
    retryPending = false
    marker?.remove()
    ring?.remove()
    marker = null
    ring = null
    beamEl = null
    centered = false
    warned = false
    compass = false
    beamOn = false
    shownDeg = 0
    btn.classList.remove('active')
  }

  function start(silent: boolean) {
    if (!navigator.geolocation) {
      if (!silent) toast('此瀏覽器不支援定位')
      return
    }
    btn.classList.add('active')
    bindOrientation(silent)
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lon, accuracy, heading, speed } = pos.coords
        if (!marker) {
          ring = L.circle([lat, lon], {
            radius: accuracy,
            color: '#1a73e8',
            weight: 1,
            opacity: 0.35,
            fillColor: '#1a73e8',
            fillOpacity: 0.08,
            interactive: false,
          }).addTo(map)
          marker = L.marker([lat, lon], {
            icon: L.divIcon({ className: 'me-icon', html: '<div class="me-beam"></div><div class="me-dot"></div>', iconSize: [0, 0] }),
            interactive: false,
            keyboard: false,
          }).addTo(map)
          beamEl = marker.getElement()?.querySelector('.me-beam') ?? null
        } else {
          marker.setLatLng([lat, lon])
          ring!.setLatLng([lat, lon])
          ring!.setRadius(accuracy)
        }
        // 無羅盤（拒絕／不支援）：步行中退回 GPS 行進方向
        if (!compass && heading !== null && !Number.isNaN(heading) && (speed ?? 0) > 0.5) {
          applyHeading(heading)
        }
        if (!centered) {
          centered = true
          if (kmFromTpe(lat, lon) <= 80) {
            onCenter()
            map.setView([lat, lon], Math.max(map.getZoom(), 15))
          } else if (!silent) {
            toast('你似乎不在台北都會區——僅顯示藍點，地圖不移動')
          }
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          stop()
          if (!silent) toast('未取得定位權限')
        } else if (!warned && !silent) {
          // 地下站首次定位可能很慢或失敗——持續等待
          warned = true
          toast('等待 GPS 定位中…')
        }
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    )
  }

  btn.addEventListener('click', () => {
    if (watchId !== null) stop()
    else start(false)
  })
  if (auto) start(true)
}
