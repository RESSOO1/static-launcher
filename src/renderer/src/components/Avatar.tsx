import { useEffect, useState } from 'react'
import { call } from '@/lib/api'
import { gameDefaultSkin, knownDefaultSkin } from '@/lib/skin'
import { useApp } from '@/lib/store'

const cache = new Map<string, string>()

/** Crops face + hat layer out of a skin texture into a crisp 64px avatar. */
function headFromSkin(src: string): Promise<string> {
  const hit = cache.get(src)
  if (hit) return Promise.resolve(hit)
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = c.height = 64
      const g = c.getContext('2d')!
      g.imageSmoothingEnabled = false
      g.drawImage(img, 8, 8, 8, 8, 0, 0, 64, 64)
      g.drawImage(img, 40, 8, 8, 8, 0, 0, 64, 64)
      const url = c.toDataURL()
      cache.set(src, url)
      resolve(url)
    }
    img.onerror = () => resolve('')
    img.src = src
  })
}

export function useSkin(accountId?: string, hasSkin?: boolean): string {
  const { skinVersion } = useApp()
  const [url, setUrl] = useState(knownDefaultSkin() ?? '')
  useEffect(() => {
    let alive = true
    const fallback = () => gameDefaultSkin().then((d) => alive && setUrl(d))
    if (!accountId || !hasSkin) void fallback()
    else void call<string | null>('skin:get', accountId).then((u) => (u ? alive && setUrl(u) : fallback()))
    return () => {
      alive = false
    }
  }, [accountId, hasSkin, skinVersion])
  return url
}

export function Avatar({ accountId, hasSkin, size = 36 }: { accountId?: string; hasSkin?: boolean; size?: number }) {
  const skin = useSkin(accountId, hasSkin)
  const [head, setHead] = useState('')
  useEffect(() => {
    void headFromSkin(skin).then(setHead)
  }, [skin])
  return head ? <img className="avatar" src={head} width={size} height={size} style={{ width: size, height: size }} alt="" /> : <div className="avatar" style={{ width: size, height: size }} />
}
