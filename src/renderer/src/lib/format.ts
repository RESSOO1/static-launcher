export function bytes(n: number): string {
  if (!n) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`
}

export function compact(n: number): string {
  return new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

export function number(n: number): string {
  return new Intl.NumberFormat('tr-TR').format(n)
}

export function ago(ts?: number): string {
  if (!ts) return 'Hiç oynanmadı'
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 60) return 'az önce'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} dk önce`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} saat önce`
  const d = Math.round(h / 24)
  if (d < 30) return `${d} gün önce`
  return new Date(ts).toLocaleDateString('tr-TR')
}

export function playtime(sec: number): string {
  if (sec < 60) return sec ? '1 dk’dan az' : '0 dk'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return h ? `${h} sa ${m} dk` : `${m} dk`
}

export function date(s: string): string {
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function ram(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(mb % 1024 ? 1 : 0)} GB` : `${mb} MB`
}
