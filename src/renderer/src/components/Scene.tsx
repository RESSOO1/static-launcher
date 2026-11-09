import { useEffect, useRef } from 'react'
import { paintScene } from '@/lib/scene'

const BAND = 118

interface Ember {
  x: number
  y: number
  z: number
  p: number
  life: number
}

/** The world behind the whole launcher. The embers stop when animations are off or a panel covers the scene. */
export function Scene({ animated }: { animated: boolean }) {
  const sky = useRef<HTMLCanvasElement>(null)
  const far = useRef<HTMLCanvasElement>(null)
  const mid = useRef<HTMLCanvasElement>(null)
  const near = useRef<HTMLCanvasElement>(null)
  const embers = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const paint = () => paintScene({ sky: sky.current!, far: far.current!, mid: mid.current!, near: near.current! }, Math.max(innerWidth, 1040), Math.max(innerHeight, 640), BAND)
    paint()
    let t: ReturnType<typeof setTimeout>
    const onResize = () => {
      clearTimeout(t)
      t = setTimeout(paint, 140)
    }
    addEventListener('resize', onResize)
    return () => {
      clearTimeout(t)
      removeEventListener('resize', onResize)
    }
  }, [])

  useEffect(() => {
    if (!animated) return
    const onMove = (e: MouseEvent) => {
      const mx = e.clientX / innerWidth - 0.5
      const my = e.clientY / innerHeight - 0.5
      if (sky.current) sky.current.style.transform = `translate(${-mx * 3}px,0)`
      if (far.current) far.current.style.transform = `translate(${-mx * 7}px,${-my * 2}px)`
      if (mid.current) mid.current.style.transform = `translate(${-mx * 13}px,${-my * 3}px)`
      if (near.current) near.current.style.transform = `translate(${-mx * 22}px,${-my * 5}px)`
    }
    addEventListener('mousemove', onMove)
    return () => removeEventListener('mousemove', onMove)
  }, [animated])

  useEffect(() => {
    const cv = embers.current!
    const g = cv.getContext('2d')!
    if (!animated) {
      g.clearRect(0, 0, cv.width, cv.height)
      return
    }
    const size = () => {
      cv.width = innerWidth
      cv.height = innerHeight
    }
    size()
    addEventListener('resize', size)
    const sprite = document.createElement('canvas')
    sprite.width = sprite.height = 24
    const sg = sprite.getContext('2d')!
    const rad = sg.createRadialGradient(12, 12, 0, 12, 12, 12)
    rad.addColorStop(0, 'rgba(190,140,255,.75)')
    rad.addColorStop(1, 'rgba(150,90,255,0)')
    sg.fillStyle = rad
    sg.fillRect(0, 0, 24, 24)
    const spawn = (any: boolean): Ember => ({ x: Math.random() * innerWidth, y: any ? Math.random() * innerHeight : innerHeight - BAND + Math.random() * 40, z: 0.4 + Math.random(), p: Math.random() * 6.28, life: any ? Math.random() : 0 })
    const parts = Array.from({ length: 64 }, () => spawn(true))
    let raf = 0
    const tick = (t: number) => {
      g.clearRect(0, 0, cv.width, cv.height)
      g.globalCompositeOperation = 'lighter'
      parts.forEach((p, i) => {
        p.life += 0.0016 * p.z
        p.y -= 0.34 * p.z
        p.x += Math.sin(t * 0.0006 + p.p) * 0.22
        if (p.life > 1 || p.y < 20) {
          parts[i] = spawn(false)
          return
        }
        g.globalAlpha = Math.sin(p.life * Math.PI) * 0.85
        g.drawImage(sprite, p.x - 9, p.y - 9, 18, 18)
        g.fillStyle = p.z > 1 ? '#f1e6ff' : '#c9a6ff'
        const s = Math.round(1 + p.z * 2)
        g.fillRect(Math.round(p.x), Math.round(p.y), s, s)
      })
      g.globalAlpha = 1
      g.globalCompositeOperation = 'source-over'
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      removeEventListener('resize', size)
    }
  }, [animated])

  return (
    <div className="scene" aria-hidden="true">
      <canvas ref={sky} />
      <canvas ref={far} />
      <canvas ref={mid} />
      <canvas ref={near} />
      <canvas ref={embers} className="embers" />
      <div className="vignette" />
    </div>
  )
}
