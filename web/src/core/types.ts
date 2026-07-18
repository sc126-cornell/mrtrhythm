// 資料格式定義（對應 SDD §8，由 pipeline 產出）
export interface Station {
  id: string
  zh: string
  en: string
  lonlat: [number, number]
}

export interface Route {
  id: string
  kind: 'full' | 'short' | 'branch'
  stations: string[]
  runTimes: number[]
  stopTimes: number[]
  shape: [number, number][]
  chainage: number[]
  stationKm: number[]
}

export interface Line {
  id: string
  name: string
  color: string
  stations: Station[]
  routes: Route[]
}

export interface Network {
  version: string
  generatedAt: string
  meta: { warnings: string[] }
  lines: Line[]
}

export interface Stop {
  s: string
  d: number // 發車秒（午夜起，跨日 > 86400；分鐘精度）
}

export interface Trip {
  route: string // 名義交路（顯示用）
  dir: 0 | 1
  synthetic: boolean // true = 班距合成（文湖線）
  path: string // 幾何交路：停靠皆在此交路站鏈上
  stops: Stop[]
}

export interface TT {
  serviceDay: string
  trips: Trip[]
}
