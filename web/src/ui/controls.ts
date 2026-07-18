// 時間控制列：暫停／倍速／時間軸拖曳／回到現在＋鍵盤快捷
import { fmtTime, type SimClock } from '../core/clock.ts'

export interface Controls {
  tick(t: number, trainCount: number): void
  setSpeed(s: number): void
}

export interface ControlHooks {
  onSpeedChange?: (s: number) => void
  onJump?: (t: number) => void // 使用者拖曳時間軸（時間旅行開始）
}

export function initControls(clock: SimClock, onNow: () => void, hooks: ControlHooks = {}): Controls {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
  const btnPause = $<HTMLButtonElement>('btnPause')
  const btnNow = $<HTMLButtonElement>('btnNow')
  const slider = $<HTMLInputElement>('timeSlider')
  const clockEl = $('clockDisplay')
  const countEl = $('trainCount')
  const speedBtns = [...document.querySelectorAll<HTMLButtonElement>('[data-speed]')]

  let dragging = false

  const renderPause = () => {
    btnPause.textContent = clock.paused ? '▶' : '⏸'
    btnPause.title = clock.paused ? '播放（空白鍵）' : '暫停（空白鍵）'
  }
  const setSpeed = (s: number) => {
    clock.speed = s
    for (const b of speedBtns) b.classList.toggle('on', Number(b.dataset.speed) === s)
    hooks.onSpeedChange?.(s)
  }

  btnPause.addEventListener('click', () => {
    clock.paused = !clock.paused
    renderPause()
  })
  btnNow.addEventListener('click', onNow)
  for (const b of speedBtns) b.addEventListener('click', () => setSpeed(Number(b.dataset.speed)))

  slider.addEventListener('pointerdown', () => (dragging = true))
  slider.addEventListener('pointerup', () => (dragging = false))
  slider.addEventListener('input', () => {
    const v = Number(slider.value)
    clock.jump(v)
    hooks.onJump?.(v)
  })

  document.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement && e.target.type !== 'range') return
    if (e.code === 'Space') {
      e.preventDefault()
      clock.paused = !clock.paused
      renderPause()
    } else if (['1', '2', '3', '4'].includes(e.key)) {
      setSpeed([1, 10, 30, 60][Number(e.key) - 1])
    }
  })

  renderPause()
  return {
    tick(t, trainCount) {
      clockEl.textContent = fmtTime(t)
      countEl.textContent = trainCount > 0 ? `${trainCount} 班運行中` : '收班中'
      if (!dragging) slider.value = String(Math.floor(t))
    },
    setSpeed,
  }
}
