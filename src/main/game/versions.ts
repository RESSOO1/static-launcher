import { getVersionList, type MinecraftVersion } from '@xmcl/installer'
import type { McVersion } from '@shared/types'
import { fetchJson } from '../net'

let cache: { at: number; list: MinecraftVersion[]; latest: string } | null = null
let fabricGames: { at: number; list: Set<string> } | null = null
const TTL = 30 * 60 * 1000

export async function versionManifest(): Promise<{ list: MinecraftVersion[]; latest: string }> {
  if (cache && Date.now() - cache.at < TTL) return cache
  try {
    const res = await getVersionList({ remote: 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json' })
    cache = { at: Date.now(), list: res.versions, latest: res.latest.release }
  } catch (e) {
    if (cache) return cache // stale is better than nothing while offline
    throw new Error('Sürüm listesi alınamadı. İnternet bağlantını kontrol et.', { cause: e })
  }
  return cache
}

export async function resolveMcVersion(v: string): Promise<MinecraftVersion> {
  const m = await versionManifest()
  const id = v === 'latest' ? m.latest : v
  const found = m.list.find((x) => x.id === id)
  if (!found) throw new Error(`Minecraft ${id} sürümü bulunamadı`)
  return found
}

export async function listVersions(snapshots: boolean): Promise<McVersion[]> {
  const m = await versionManifest()
  return m.list
    .filter((v) => v.type === 'release' || (snapshots && v.type === 'snapshot'))
    .map((v) => ({ id: v.id, type: v.type, releaseTime: v.releaseTime }))
}

export async function fabricSupported(mc: string): Promise<boolean> {
  if (!fabricGames || Date.now() - fabricGames.at > TTL) {
    const list = await fetchJson<Array<{ version: string }>>('https://meta.fabricmc.net/v2/versions/game', { timeoutMs: 10000 })
    fabricGames = { at: Date.now(), list: new Set(list.map((g) => g.version)) }
  }
  return fabricGames.list.has(mc)
}

export async function latestFabricLoader(): Promise<string> {
  const list = await fetchJson<Array<{ version: string; stable: boolean }>>('https://meta.fabricmc.net/v2/versions/loader', { timeoutMs: 10000 })
  const stable = list.find((l) => l.stable) ?? list[0]
  if (!stable) throw new Error('Fabric sürümü bulunamadı')
  return stable.version
}

export async function fabricLoaders(): Promise<string[]> {
  const list = await fetchJson<Array<{ version: string; stable: boolean }>>('https://meta.fabricmc.net/v2/versions/loader', { timeoutMs: 10000 })
  return list.filter((l) => l.stable).slice(0, 15).map((l) => l.version)
}
