import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dataFile } from './paths'
import type { LauncherConfig, ModeDef, NewsItem, ServerDef } from '@shared/types'
import { isId, isMcVersion, isSafeUrl } from './lib/validate'
import { fetchJson } from './net'
import { log } from './log'

let config: LauncherConfig | null = null

const s = (v: unknown, max: number, d = ''): string => (typeof v === 'string' ? v.slice(0, max) : d)

/** Config can come from a remote URL, so every field is checked before use. */
export function sanitizeConfig(raw: unknown): LauncherConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : [])
  const modes: ModeDef[] = arr(r.modes)
    .filter((m) => isId(m.id) && isMcVersion(m.mcVersion))
    .slice(0, 12)
    .map((m) => ({
      id: m.id as string,
      name: s(m.name, 40, 'Mod'),
      description: s(m.description, 400),
      mcVersion: m.mcVersion as string,
      loader: m.loader === 'fabric' ? 'fabric' : 'vanilla',
      loaderVersion: isMcVersion(m.loaderVersion) ? m.loaderVersion : undefined,
      server: typeof m.server === 'string' && m.server.length < 256 ? m.server : undefined,
      mods: Array.isArray(m.mods) ? m.mods.filter((x): x is string => typeof x === 'string' && /^[a-zA-Z0-9_-]{2,64}$/.test(x)).slice(0, 50) : [],
      accent: typeof m.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(m.accent) ? m.accent : undefined,
      image: isSafeUrl(m.image) ? m.image : undefined
    }))
  const servers: ServerDef[] = arr(r.servers)
    .filter((x) => isId(x.id) && typeof x.address === 'string')
    .slice(0, 20)
    .map((x) => ({ id: x.id as string, name: s(x.name, 40, 'Sunucu'), address: s(x.address, 255), description: s(x.description, 200), featured: x.featured === true }))
  const news: NewsItem[] = arr(r.news)
    .filter((n) => typeof n.title === 'string')
    .slice(0, 30)
    .map((n, i) => ({
      id: s(n.id, 40, String(i)),
      title: s(n.title, 120),
      body: s(n.body, 2000),
      date: s(n.date, 30),
      tag: s(n.tag, 20) || undefined,
      url: isSafeUrl(n.url) ? n.url : undefined
    }))
  const links = (r.links && typeof r.links === 'object' ? r.links : {}) as Record<string, unknown>
  return {
    name: s(r.name, 30, 'Static'),
    tagline: s(r.tagline, 80),
    modes,
    servers,
    news,
    links: { discord: isSafeUrl(links.discord) ? links.discord : undefined, website: isSafeUrl(links.website) ? links.website : undefined },
    discordClientId: typeof r.discordClientId === 'string' && /^\d{10,25}$/.test(r.discordClientId) ? r.discordClientId : undefined,
    remoteConfigUrl: isSafeUrl(r.remoteConfigUrl) ? r.remoteConfigUrl : undefined,
    updateUrl: isSafeUrl(r.updateUrl) ? r.updateUrl : undefined
  }
}

function bundledPath(): string {
  return app.isPackaged ? join(process.resourcesPath, 'launcher.config.json') : join(app.getAppPath(), 'resources', 'launcher.config.json')
}

export function getConfig(): LauncherConfig {
  if (!config) {
    try {
      config = sanitizeConfig(JSON.parse(readFileSync(bundledPath(), 'utf8')))
    } catch (e) {
      log.error('launcher.config.json okunamadı', e)
      config = sanitizeConfig({})
    }
  }
  return config
}

let bundled: LauncherConfig | null = null
const cacheFile = () => dataFile('remote-config')

/**
 * Remote content may change news, modes, servers and links, but never where config or
 * updates come from: an attacker who edits the remote file must not be able to point
 * players at a different installer.
 */
function overlay(base: LauncherConfig, remote: LauncherConfig): LauncherConfig {
  return {
    ...remote,
    modes: remote.modes.length ? remote.modes : base.modes,
    remoteConfigUrl: base.remoteConfigUrl,
    updateUrl: base.updateUrl
  }
}

/** Apply the last successfully downloaded remote config so offline starts still show current news. */
export function loadCachedRemoteConfig(): void {
  bundled = bundled ?? getConfig()
  if (!bundled.remoteConfigUrl || !existsSync(cacheFile())) return
  try {
    config = overlay(bundled, sanitizeConfig(JSON.parse(readFileSync(cacheFile(), 'utf8'))))
  } catch (e) {
    log.warn('Önbellekteki uzak yapılandırma okunamadı', e)
  }
}

/** Pull news/modes/servers from the remote URL if one is configured; keep the last good copy on any failure. */
export async function refreshRemoteConfig(): Promise<LauncherConfig> {
  bundled = bundled ?? getConfig()
  if (!bundled.remoteConfigUrl) return getConfig()
  try {
    const raw = await fetchJson(bundled.remoteConfigUrl, { timeoutMs: 6000, maxBytes: 512 * 1024 })
    const remote = sanitizeConfig(raw)
    config = overlay(bundled, remote)
    writeFileSync(`${cacheFile()}.tmp`, JSON.stringify(remote))
    renameSync(`${cacheFile()}.tmp`, cacheFile())
  } catch (e) {
    log.warn('Uzak yapılandırma alınamadı, son kayıtlı kopya kullanılıyor', e)
  }
  return getConfig()
}
