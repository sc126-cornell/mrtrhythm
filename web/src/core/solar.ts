// 太陽仰角計算（NOAA 簡化式）——「台北日夜」外觀模式用
// 只依 UTC 時刻與座標，與裝置時區無關：人在國外也跟著台北的天色走
const TAIPEI_LAT = 25.04
const TAIPEI_LON = 121.51
// 低於 -4°（日落後約 15–20 分鐘、民用暮光間）視為夜間——街燈亮起的體感時刻
const NIGHT_ELEVATION = -4

export function sunElevationDeg(date: Date, latDeg = TAIPEI_LAT, lonDeg = TAIPEI_LON): number {
  const rad = Math.PI / 180
  const jd = date.getTime() / 86400000 + 2440587.5 // Julian date（不可取整，需含當日時刻）
  const d = jd - 2451545.0 // J2000 起算日數
  const g = (357.529 + 0.98560028 * d) * rad // 平近點角
  const q = 280.459 + 0.98564736 * d // 平黃經
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad // 視黃經
  const e = (23.439 - 0.00000036 * d) * rad // 黃赤交角
  const RA = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) / rad // 赤經（度）
  const dec = Math.asin(Math.sin(e) * Math.sin(L)) // 赤緯
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24 // 格林威治恆星時（時）
  const ha = ((((gmst * 15 + lonDeg - RA) % 360) + 540) % 360) - 180 // 時角（度，-180..180）
  const lat = latDeg * rad
  const sinEl = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha * rad)
  return Math.asin(sinEl) / rad
}

export const isTaipeiNight = (date = new Date()): boolean => sunElevationDeg(date) < NIGHT_ELEVATION
