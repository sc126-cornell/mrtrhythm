import './style.css'

// 版本戳記：字母序遞增，顯示於畫面與 console 供比對線上版本
export const BUILD = 'M0a-20260718'

const status = document.getElementById('status')!
status.textContent = `BUILD ${BUILD}`
console.info(`捷奏 BUILD ${BUILD}`)

// /api/health 煙霧測試——本地 dev 沒有 Vercel Functions，失敗屬預期
fetch('/api/health')
  .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
  .then((d: { ok: boolean }) => {
    status.textContent = `BUILD ${BUILD} ・ API ${d.ok ? '連線正常' : '異常'}`
  })
  .catch(() => {
    status.textContent = `BUILD ${BUILD} ・ API 未連線（本地 dev 屬正常）`
  })
