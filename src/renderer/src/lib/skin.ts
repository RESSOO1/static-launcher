// The launcher's own default character: fluffy violet hoodie with the hood up, black fringe,
// pale face, dark fluffy trousers. Plain on purpose, no logos or accessories.
// Drawn from scratch in our own pixels (both skin layers); no third-party texture is copied.
import { call } from './api'

let cached: string | null = null

type Face = 'top' | 'bottom' | 'right' | 'front' | 'left' | 'back'
/** Returns a CSS colour, or null for a transparent pixel. */
type Painter = (face: Face, x: number, y: number, w: number, h: number) => string | null

const rnd = (x: number, y: number, s: number) => {
  const n = Math.sin(x * 91.7 + y * 47.3 + s * 13.1) * 9631.17
  return n - Math.floor(n)
}
/** Smooth value noise so neighbouring pixels clump together like fluffy fabric. */
function vnoise(x: number, y: number, scale: number, s: number): number {
  const gx = Math.floor(x / scale)
  const gy = Math.floor(y / scale)
  const fx = x / scale - gx
  const fy = y / scale - gy
  const sm = (t: number) => t * t * (3 - 2 * t)
  const a = rnd(gx, gy, s)
  const b = rnd(gx + 1, gy, s)
  const c = rnd(gx, gy + 1, s)
  const d = rnd(gx + 1, gy + 1, s)
  return (a + (b - a) * sm(fx)) * (1 - sm(fy)) + (c + (d - c) * sm(fx)) * sm(fy)
}

const FACE_LIGHT: Record<Face, number> = { top: 1.1, front: 1, right: 0.9, left: 0.9, back: 0.85, bottom: 0.72 }
function tone(hex: string, f: number): string {
  const v = parseInt(hex.slice(1), 16)
  const ch = (sh: number) => Math.max(0, Math.min(255, Math.round(((v >> sh) & 255) * f)))
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`
}
const pick = (pal: string[], t: number) => pal[Math.max(0, Math.min(pal.length - 1, Math.round(t * (pal.length - 1))))]

// dark -> light
const VIOLET = ['#2a0e63', '#36137f', '#43199a', '#5120b4', '#6129cc', '#7236e0', '#8550ee', '#9d70f7']
const HAIR = ['#0a090d', '#111017', '#1a1822', '#25222f']
const PANTS = ['#111116', '#18181e', '#202027', '#292931', '#34343d', '#40404b']
const SK = { base: '#f6dccb', shade: '#e6c3ad', deep: '#d4ab94' }

/** Fluffy fabric: light from above, soft clumps, a little grain. */
function fluff(pal: string[], face: Face, x: number, y: number, h: number, s: number, lift = 0): string {
  const grad = face === 'top' ? 0.8 : face === 'bottom' ? 0.15 : 1 - y / Math.max(1, h - 1)
  const t = grad * 0.4 + vnoise(x, y, 1.8, s) * 0.55 + rnd(x, y, s + 70) * 0.12 + lift - 0.05
  return tone(pick(pal, t), FACE_LIGHT[face])
}

function box(g: CanvasRenderingContext2D, u: number, v: number, w: number, h: number, d: number, paint: Painter) {
  const faces: [Face, number, number, number, number][] = [
    ['top', u + d, v, w, d],
    ['bottom', u + d + w, v, w, d],
    ['right', u, v + d, d, h],
    ['front', u + d, v + d, w, h],
    ['left', u + d + w, v + d, d, h],
    ['back', u + d + w + d, v + d, w, h]
  ]
  for (const [face, fx, fy, fw, fh] of faces)
    for (let y = 0; y < fh; y++)
      for (let x = 0; x < fw; x++) {
        const col = paint(face, x, y, fw, fh)
        if (!col) continue
        g.fillStyle = col
        g.fillRect(fx + x, fy + y, 1, 1)
      }
}

// ---------- head ----------
// h hair, s skin, S shade, w eye white, k pupil
const FACE = ['hhhhhhhh', 'hhhhhhhh', 'hhshhhsh', 'ssssssss', 'swksskws', 'ssssssss', 'ssssssss', 'SssssssS']
const head: Painter = (f, x, y, w) => {
  const L = f === 'front' ? 1 : FACE_LIGHT[f]
  if (f === 'front') {
    const k = FACE[y][x]
    if (k === 'h') return tone(pick(HAIR, 0.3 + rnd(x, y, 1) * 0.5 + (y === 1 ? 0.2 : 0)), 1)
    if (k === 'w') return '#f6f4fb'
    if (k === 'k') return '#141118'
    return tone(k === 'S' ? SK.shade : SK.base, L)
  }
  if (f === 'bottom') return tone(SK.deep, 0.9)
  // under the hood the head is hair, with a little skin at the cheeks
  const fx = f === 'right' ? x : w - 1 - x
  if ((f === 'right' || f === 'left') && fx > 5 && y > 2) return tone(SK.shade, L)
  return tone(pick(HAIR, 0.2 + rnd(x, y, 2) * 0.6), L)
}

// the hood (second head layer): covers top, back and sides, frames the face with a darker inner rim
const hood: Painter = (f, x, y, w, h) => {
  if (f === 'bottom') return null
  if (f === 'front') {
    if (y === 0) return fluff(VIOLET, f, x, y, h, 4, 0.1)
    if (x === 0 || x === w - 1) return fluff(VIOLET, f, x, y, h, 5, -0.05)
    if (y === 1 && (x === 1 || x === w - 2)) return fluff(VIOLET, f, x, y, h, 6, -0.15) // inner rim shadow
    return null
  }
  if (f === 'right' || f === 'left') {
    const fx = f === 'right' ? x : w - 1 - x
    return fluff(VIOLET, f, x, y, h, 7, fx === w - 1 ? -0.12 : 0)
  }
  return fluff(VIOLET, f, x, y, h, f === 'top' ? 8 : 9, f === 'top' ? 0.12 : 0)
}

// ---------- body & arms ----------
const hoodieBase =
  (s: number): Painter =>
  (f, x, y, w, h) => {
    if (f === 'bottom') return tone(VIOLET[1], 0.8)
    if (y === h - 1 && f !== 'top') return fluff(VIOLET, f, x, y, h, s, -0.2) // hem
    const ao = f === 'front' && (x === 0 || x === w - 1) ? -0.1 : 0
    return fluff(VIOLET, f, x, y, h, s, ao)
  }
const hoodieFluff =
  (s: number): Painter =>
  (f, x, y, _w, h) => {
    if (f === 'top' || f === 'bottom') return null
    return vnoise(x, y, 1.6, s) > 0.6 ? fluff(VIOLET, f, x, y, h, s + 1, 0.12) : null
  }
const sleeve: Painter = (f, x, y, w, h) => {
  if (f === 'bottom') return tone(SK.shade, 0.85)
  if (y >= 10) return tone(f === 'front' ? SK.base : SK.shade, f === 'front' ? 1 : FACE_LIGHT[f]) // hands
  if (y === 9) return fluff(VIOLET, f, x, y, h, 10, -0.2) // cuff
  return fluff(VIOLET, f, x, y, h, 11 + w, f === 'top' ? 0.1 : 0)
}
const sleeveFluff: Painter = (f, x, y, _w, h) => {
  if (f === 'top' || f === 'bottom' || y > 9) return null
  return vnoise(x, y, 1.5, 12) > 0.6 ? fluff(VIOLET, f, x, y, h, 13, 0.12) : null
}

// ---------- legs ----------
const trousers: Painter = (f, x, y, _w, h) => {
  if (f === 'bottom') return '#0b0a0e'
  if (y >= 10) return tone(y === 11 ? '#0d0c10' : '#16151b', FACE_LIGHT[f]) // shoes
  return fluff(PANTS, f, x, y, h, 14, y > 5 ? 0.08 : 0)
}
const trousersFluff: Painter = (f, x, y, _w, h) => {
  if (f === 'top' || f === 'bottom' || y > 9) return null
  return vnoise(x, y, 1.5, 15) > 0.66 ? fluff(PANTS, f, x, y, h, 16, 0.12) : null
}

let steve: string | null = null
let steveLoading: Promise<string> | null = null

/** Last loaded default, for a first render without flicker. */
export const knownDefaultSkin = (): string | null => steve

/**
 * Default look = Steve from the installed game files (same as what offline players show in-game).
 * Before any version is installed we fall back to our own drawn skin and try again next time.
 */
export function gameDefaultSkin(): Promise<string> {
  if (steve) return Promise.resolve(steve)
  steveLoading ??= call<string | null>('skin:default')
    .then((u) => {
      if (u) steve = u
      return u ?? defaultSkin()
    })
    .catch(() => defaultSkin())
    .finally(() => {
      steveLoading = null
    })
  return steveLoading
}

export function defaultSkin(): string {
  if (cached) return cached
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  box(g, 0, 0, 8, 8, 8, head)
  box(g, 32, 0, 8, 8, 8, hood)
  box(g, 16, 16, 8, 12, 4, hoodieBase(20))
  box(g, 16, 32, 8, 12, 4, hoodieFluff(21))
  box(g, 40, 16, 4, 12, 4, sleeve)
  box(g, 40, 32, 4, 12, 4, sleeveFluff)
  box(g, 32, 48, 4, 12, 4, sleeve)
  box(g, 48, 48, 4, 12, 4, sleeveFluff)
  box(g, 0, 16, 4, 12, 4, trousers)
  box(g, 0, 32, 4, 12, 4, trousersFluff)
  box(g, 16, 48, 4, 12, 4, trousers)
  box(g, 0, 48, 4, 12, 4, trousersFluff)
  cached = c.toDataURL('image/png')
  return cached
}
