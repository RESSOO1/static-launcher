import { randomUUID } from 'crypto'
import { rm, mkdir } from 'fs/promises'
import type { Profile, ProfileInput } from '@shared/types'
import { profiles, settings, stats } from './data'
import { getConfig } from './config'
import { instanceDir, isInside, instancesDir } from './paths'
import { isId, isMcVersion, int, str } from './lib/validate'

export function listProfiles(): Profile[] {
  const st = stats.get()
  const managed: Profile[] = getConfig().modes.map((m) => ({
    id: m.id,
    name: m.name,
    description: m.description,
    mcVersion: m.mcVersion,
    loader: m.loader,
    loaderVersion: m.loaderVersion,
    managed: true,
    serverAddress: m.server,
    mods: m.mods,
    accent: m.accent,
    image: m.image,
    createdAt: 0,
    lastPlayed: st[m.id]?.lastPlayed,
    playTimeSec: st[m.id]?.playTimeSec ?? 0,
    ramMB: st[m.id]?.ramMB
  }))
  const ids = new Set(managed.map((m) => m.id))
  return [...managed, ...profiles.get().filter((p) => !ids.has(p.id))]
}

export function getProfile(id: unknown): Profile {
  if (!isId(id)) throw new Error('Geçersiz profil')
  const p = listProfiles().find((x) => x.id === id)
  if (!p) throw new Error('Profil bulunamadı')
  return p
}

function readInput(raw: unknown): ProfileInput {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const name = str(r.name, 40).trim()
  if (!name) throw new Error('Profil adı boş olamaz')
  if (!isMcVersion(r.mcVersion)) throw new Error('Geçersiz Minecraft sürümü')
  const loader = r.loader === 'fabric' ? 'fabric' : 'vanilla'
  return {
    name,
    description: typeof r.description === 'string' ? r.description.slice(0, 300) : '',
    mcVersion: r.mcVersion,
    loader,
    loaderVersion: loader === 'fabric' && isMcVersion(r.loaderVersion) ? r.loaderVersion : undefined,
    ramMB: r.ramMB === undefined || r.ramMB === null || r.ramMB === 0 ? undefined : int(r.ramMB, 1024, 65536)
  }
}

export async function createProfile(raw: unknown): Promise<Profile> {
  const input = readInput(raw)
  if (profiles.get().length >= 200) throw new Error('Çok fazla profil var')
  const id = `p-${randomUUID().slice(0, 8)}`
  const p: Profile = { id, ...input, description: input.description ?? '', managed: false, createdAt: Date.now(), playTimeSec: 0 }
  await mkdir(instanceDir(id), { recursive: true })
  profiles.update((l) => [...l, p])
  return p
}

export function updateProfile(id: unknown, raw: unknown): Profile {
  const current = getProfile(id)
  if (current.managed) {
    // Only RAM is adjustable on server-defined modes.
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
    const ramMB = r.ramMB ? int(r.ramMB, 1024, 65536) : undefined
    stats.update((s) => ({ ...s, [current.id]: { ...(s[current.id] ?? { playTimeSec: 0 }), ramMB } }))
    return getProfile(id)
  }
  const input = readInput(raw)
  profiles.update((l) => l.map((p) => (p.id === current.id ? { ...p, ...input, description: input.description ?? '' } : p)))
  return getProfile(id)
}

export async function deleteProfile(id: unknown): Promise<void> {
  const p = getProfile(id)
  if (p.managed) throw new Error('Sunucu modları silinemez')
  profiles.update((l) => l.filter((x) => x.id !== p.id))
  const dir = instanceDir(p.id)
  if (isInside(instancesDir(), dir) && dir !== instancesDir()) await rm(dir, { recursive: true, force: true })
  if (settings.get().selectedProfileId === p.id) settings.update((s) => ({ ...s, selectedProfileId: listProfiles()[0]?.id ?? '' }))
}

export function recordPlay(id: string, seconds: number): void {
  const managed = getConfig().modes.some((m) => m.id === id)
  if (managed) {
    stats.update((s) => ({ ...s, [id]: { ...(s[id] ?? {}), lastPlayed: Date.now(), playTimeSec: (s[id]?.playTimeSec ?? 0) + seconds } }))
  } else {
    profiles.update((l) => l.map((p) => (p.id === id ? { ...p, lastPlayed: Date.now(), playTimeSec: p.playTimeSec + seconds } : p)))
  }
}
