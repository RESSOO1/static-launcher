import { useEffect, useRef } from 'react'
import { SkinViewer as Viewer, IdleAnimation, WalkingAnimation } from 'skinview3d'

export function SkinViewer({ skin, slim, width, height, walk = false, rotate = true, zoom = 0.9 }: { skin: string; slim?: boolean; width: number; height: number; walk?: boolean; rotate?: boolean; zoom?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const viewer = useRef<Viewer | null>(null)

  useEffect(() => {
    if (!canvas.current) return
    let v: Viewer
    try {
      v = new Viewer({ canvas: canvas.current, width, height })
    } catch {
      return // WebGL unavailable: simply show nothing instead of breaking the page
    }
    v.zoom = zoom
    v.fov = 55
    v.controls.enableZoom = false
    v.controls.enablePan = false
    v.globalLight.intensity = 3
    v.cameraLight.intensity = 0.6
    viewer.current = v
    return () => {
      v.dispose()
      viewer.current = null
    }
  }, [width, height, zoom])

  useEffect(() => {
    const v = viewer.current
    if (!v) return
    void v.loadSkin(skin, { model: slim ? 'slim' : 'default' }).catch(() => undefined)
  }, [skin, slim, width, height, zoom])

  useEffect(() => {
    const v = viewer.current
    if (!v) return
    v.animation = walk ? new WalkingAnimation() : new IdleAnimation()
    if (v.animation) v.animation.speed = walk ? 0.7 : 1
    v.autoRotate = rotate
    v.autoRotateSpeed = 0.8
  }, [walk, rotate, width, height, zoom])

  return <canvas ref={canvas} width={width} height={height} aria-label="3D karakter önizlemesi" />
}
