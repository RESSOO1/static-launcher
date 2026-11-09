// The launcher's world, drawn in code at low resolution and scaled up with crisp pixels:
// night sky, big violet moon, blocky hills and glowing amethyst. All art here is original.

const hash = (x: number, s: number): number => {
  const n = Math.sin(x * 127.1 + s * 311.7) * 43758.5453
  return n - Math.floor(n)
}
const rgb = (c: string): [number, number, number] => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]

const SKY = ['#04020a', '#070412', '#0b061b', '#100826', '#170b33', '#1f0f44', '#2a1457', '#36196d', '#442084', '#53289c', '#6432b4', '#7a41cc', '#9355de', '#ad74ec'].map(rgb)
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16)

function drawSky(cv: HTMLCanvasElement, w: number, h: number, hy: number, moon: { y: number; r: number }): void {
  cv.width = w
  cv.height = h
  const g = cv.getContext('2d')!
  const im = g.createImageData(w, h)
  const cx = w / 2
  const craters = [[0.34, -0.28, 0.2], [-0.42, 0.05, 0.15], [0.08, 0.42, 0.24], [-0.12, -0.55, 0.1], [0.56, 0.3, 0.1]]
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const glow = Math.max(0, 1 - Math.hypot((x - cx) / (w * 0.55), (y - hy) / (h * 0.55)))
      let v = Math.pow(Math.min(1, y / hy), 2.1) * 8 + glow * glow * 7.2
      const m = Math.hypot(x - cx, y - moon.y)
      if (m < moon.r) {
        v = 13 - ((y - (moon.y - moon.r)) / (moon.r * 2)) * 4.6
        for (const [a, b, r] of craters) if (Math.hypot(x - cx - a * moon.r, y - moon.y - b * moon.r) < r * moon.r) v -= 1.4
      } else if (m < moon.r * 1.5) v += (1 - (m - moon.r) / (moon.r * 0.5)) * 2.2
      const c = SKY[Math.max(0, Math.min(SKY.length - 1, Math.floor(v + BAYER[(y % 4) * 4 + (x % 4)])))]
      const o = (y * w + x) * 4
      im.data[o] = c[0]
      im.data[o + 1] = c[1]
      im.data[o + 2] = c[2]
      im.data[o + 3] = 255
    }
  g.putImageData(im, 0, 0)
  for (let i = 0; i < w * 0.34; i++) {
    const x = Math.floor(hash(i, 1) * w)
    const y = Math.floor(hash(i, 2) * hy * 0.8)
    const b = hash(i, 3)
    if (Math.hypot(x - cx, y - moon.y) < moon.r * 1.15) continue
    g.fillStyle = b > 0.86 ? '#efe6ff' : b > 0.5 ? '#9d84d6' : '#5c4a8e'
    g.fillRect(x, y, b > 0.97 ? 2 : 1, b > 0.97 ? 2 : 1)
  }
}

interface Hills {
  base: number
  amp: number
  lift: number
  gap: number
  bw: number
  step: number
  seed: number
  color: string
  speck: string
  rim: string
}
type Col = { x: number; bw: number; top: number }

function drawHills(cv: HTMLCanvasElement, w: number, h: number, o: Hills): Col[] {
  cv.width = w
  cv.height = h
  const g = cv.getContext('2d')!
  const cx = w / 2
  const cols: Col[] = []
  for (let x = 0, i = 0; x < w; i++) {
    const bw = o.bw + Math.floor(hash(i, o.seed) * o.bw * 0.6)
    const mid = (x + bw / 2 - cx) / (w / 2)
    const wave = Math.sin(i * 0.33 + o.seed) * 0.5 + Math.sin(i * 0.91 + o.seed * 2) * 0.3 + hash(i, o.seed + 1) * 0.5
    const open = Math.min(1, Math.pow(Math.abs(mid) / o.gap, 2.2))
    cols.push({ x, bw, top: Math.round((o.base - (wave * o.amp + o.lift) * open) / o.step) * o.step })
    x += bw
  }
  cols.forEach((c, i) => {
    g.fillStyle = o.color
    g.fillRect(c.x, c.top, c.bw, h - c.top)
    for (let n = 0; n < c.bw * (h - c.top) * 0.015; n++) {
      g.fillStyle = o.speck
      g.fillRect(c.x + Math.floor(hash(n, i + o.seed) * c.bw), c.top + Math.floor(hash(n + 0.5, i * 3 + o.seed) * (h - c.top)), 2, 1)
    }
    g.fillStyle = o.rim
    g.fillRect(c.x, c.top, c.bw, 1)
    const left = c.x + c.bw / 2 < cx
    const toward = left ? cols[i + 1] : cols[i - 1]
    if (toward && toward.top > c.top) {
      g.globalAlpha = 0.65
      g.fillRect(left ? c.x + c.bw - 1 : c.x, c.top, 1, toward.top - c.top)
      g.globalAlpha = 1
    }
  })
  return cols
}

function pine(g: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  const left = x < g.canvas.width / 2
  for (let t = 0; t < 3; t++) {
    const b = y - t * s * 0.72
    for (let r = 0; r < s; r++) {
      const hw = Math.floor((s - r) * 0.72)
      g.fillStyle = '#0e0620'
      g.fillRect(x - hw, b - r, hw * 2 + 1, 1)
      g.fillStyle = '#6d40c8'
      g.fillRect(x + hw * (left ? 1 : -1), b - r, 1, 1)
    }
  }
  g.fillStyle = '#0e0620'
  g.fillRect(x, y, 1, 3)
}

function crystal(g: CanvasRenderingContext2D, x: number, y: number, h: number, w: number, lean: number): void {
  for (let r = 0; r < h; r++) {
    const f = r / h
    const hw = Math.max(0, Math.round(w * (f > 0.74 ? (1 - f) / 0.26 : 1)))
    const cx = x + Math.round(lean * f * h)
    for (let i = -hw; i <= hw; i++) {
      g.fillStyle = i < -hw * 0.35 ? '#cfaeff' : i < hw * 0.3 ? '#8a50ee' : '#4d21b0'
      g.fillRect(cx + i, y - r, 1, 1)
    }
    if (f > 0.86) {
      g.fillStyle = '#f4ebff'
      g.fillRect(cx, y - r, 1, 1)
    }
  }
}

function cluster(g: CanvasRenderingContext2D, x: number, y: number, scale: number): void {
  const rad = g.createRadialGradient(x, y - 10 * scale, 0, x, y - 10 * scale, 34 * scale)
  rad.addColorStop(0, 'rgba(170,110,255,.5)')
  rad.addColorStop(1, 'rgba(170,110,255,0)')
  g.globalCompositeOperation = 'lighter'
  g.fillStyle = rad
  g.fillRect(x - 40 * scale, y - 50 * scale, 80 * scale, 70 * scale)
  g.globalCompositeOperation = 'source-over'
  for (const [dx, h, w, l] of [[-8, 12, 2, -0.18], [7, 15, 2, 0.2], [-3, 25, 3, -0.05], [3, 19, 2, 0.08], [-13, 7, 1, -0.3], [12, 8, 1, 0.3]])
    crystal(g, x + Math.round(dx * scale), y, Math.round(h * scale), Math.max(1, Math.round(w * scale)), l)
}

export const SCENE_PX = 3

/** Paints all four parallax layers for a window of the given size; bottom is the height of the menu band. */
export function paintScene(layers: { sky: HTMLCanvasElement; far: HTMLCanvasElement; mid: HTMLCanvasElement; near: HTMLCanvasElement }, viewW: number, viewH: number, bottom: number): void {
  const w = Math.ceil((viewW + 48) / SCENE_PX)
  const h = Math.ceil((viewH + 16) / SCENE_PX)
  const ground = (viewH - bottom - 18) / SCENE_PX + 3
  drawSky(layers.sky, w, h, ground - 12, { y: h * 0.4, r: Math.min(h * 0.2, 74) })
  drawHills(layers.far, w, h, { base: ground - 44, amp: 17, lift: 8, gap: 0.2, bw: 12, step: 3, seed: 3, color: '#21104a', speck: '#2a1658', rim: '#6a3cc4' })
  const mids = drawHills(layers.mid, w, h, { base: ground - 20, amp: 16, lift: 14, gap: 0.3, bw: 10, step: 3, seed: 8, color: '#120828', speck: '#190b38', rim: '#7f4be0' })
  const mg = layers.mid.getContext('2d')!
  mids.forEach((c, i) => {
    if (Math.abs(c.x - w / 2) / (w / 2) > 0.34 && hash(i, 44) > 0.52) pine(mg, c.x + Math.floor(c.bw / 2), c.top - 1, 4 + Math.floor(hash(i, 45) * 4))
  })
  const nears = drawHills(layers.near, w, h, { base: ground, amp: 14, lift: 18, gap: 0.42, bw: 9, step: 3, seed: 21, color: '#080414', speck: '#0e0720', rim: '#9a66f5' })
  const ng = layers.near.getContext('2d')!
  for (const [p, s] of [[0.22, 1.05], [0.34, 0.72], [0.71, 0.8], [0.82, 1.15], [0.09, 0.8], [0.93, 0.72]]) {
    const px = Math.floor(p * w)
    const c = nears.find((k) => px >= k.x && px < k.x + k.bw)
    if (c) cluster(ng, px, c.top + 2, s)
  }
  for (const c of Object.values(layers)) {
    c.style.width = `${c.width * SCENE_PX}px`
    c.style.height = `${c.height * SCENE_PX}px`
  }
}

/** The small picture on the news card: the same world at dusk. */
export function paintNewsArt(cv: HTMLCanvasElement): void {
  drawSky(cv, 84, 30, 24, { y: 16, r: 9 })
  const g = cv.getContext('2d')!
  g.fillStyle = '#0a0518'
  for (let x = 0; x < 84; x += 5) g.fillRect(x, 23 + Math.floor(hash(x, 9) * 5), 5, 12)
  cluster(g, 18, 27, 0.45)
  cluster(g, 64, 27, 0.6)
}
