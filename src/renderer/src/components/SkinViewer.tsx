import { useEffect, useRef } from 'react'
import { SkinViewer as Viewer, IdleAnimation, RunningAnimation, WalkingAnimation, WaveAnimation } from 'skinview3d'

export type SkinAnim = 'idle' | 'walk' | 'run' | 'wave'

export function SkinViewer({ skin, slim, width, height, anim = 'idle', rotate = true, zoom = 0.9, fov = 55, angle = 0 }: { skin: string; slim?: boolean; width: number; height: number; anim?: SkinAnim; rotate?: boolean; zoom?: number; fov?: number; angle?: number }) {
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
    v.controls.enableZoom = false
    v.controls.enablePan = false
    v.globalLight.intensity = 2.2
    v.cameraLight.intensity = 1.1
    viewer.current = v
    return () => {
      v.dispose()
      viewer.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resizing keeps the same viewer below
  }, [])

  useEffect(() => {
    const v = viewer.current
    if (!v) return
    v.width = width
    v.height = height
    v.zoom = zoom
    v.fov = fov
    v.playerObject.rotation.y = angle
  }, [width, height, zoom, fov, angle])

  useEffect(() => {
    const v = viewer.current
    if (!v || !skin) return
    void v.loadSkin(skin, { model: slim ? 'slim' : 'default' }).catch(() => undefined)
  }, [skin, slim])

  useEffect(() => {
    const v = viewer.current
    if (!v) return
    v.animation = anim === 'walk' ? new WalkingAnimation() : anim === 'run' ? new RunningAnimation() : anim === 'wave' ? new WaveAnimation() : new IdleAnimation()
    if (anim === 'walk' && v.animation) v.animation.speed = 0.7
    v.autoRotate = rotate
    v.autoRotateSpeed = 0.6
  }, [anim, rotate])

  return <canvas ref={canvas} width={width} height={height} aria-label="3D karakter önizlemesi, sürükleyerek döndür" />
}
