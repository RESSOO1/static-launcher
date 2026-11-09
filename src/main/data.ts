import { totalmem } from 'os'
import { randomUUID } from 'crypto'
import type { Account, Accent, CloseBehavior, PerformancePreset, Profile, ServerDef, Settings, SkinMeta } from '@shared/types'
import { JsonStore } from './store'
import { dataFile } from './paths'
import { isId, isMcVersion, isUsername } from './lib/validate'
import { suggestRam } from './lib/performance'

const ACCENTS: Accent[] = ['violet', 'blue', 'emerald', 'rose', 'amber']
const CLOSE: CloseBehavior[] = ['hide', 'minimize', 'keep']
const PRESETS: PerformancePreset[] = ['low', 'balanced', 'high', 'custom']

export const totalRamMB = (): number => Math.floor(totalmem() / 1024 / 1024)

export function defaultSettings(): Settings {
  return {
    firstRunDone: false,
    ramMB: suggestRam(totalRamMB()),
    javaPath: '',
    jvmArgs: '',
    width: 1280,
    height: 720,
    fullscreen: false,
    closeBehavior: 'hide',
    performance: 'balanced',
    discordRpc: true,
    accent: 'violet',
    animations: true,
    maxDownloads: 16,
    showSnapshots: false,
    selectedProfileId: 'survival',
    selectedAccountId: ''
  }
}

const num = (v: unknown, d: number, min: number, max: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : d
const s = (v: unknown, d: string, max = 500): string => (typeof v === 'string' && v.length <= max ? v : d)
const b = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d)
const pick = <T extends string>(v: unknown, list: T[], d: T): T => (list.includes(v as T) ? (v as T) : d)

export function sanitizeSettings(raw: unknown): Settings {
  const d = defaultSettings()
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    firstRunDone: b(r.firstRunDone, d.firstRunDone),
    ramMB: num(r.ramMB, d.ramMB, 1024, Math.max(2048, totalRamMB())),
    javaPath: s(r.javaPath, ''),
    jvmArgs: s(r.jvmArgs, '', 2000),
    width: num(r.width, d.width, 640, 7680),
    height: num(r.height, d.height, 480, 4320),
    fullscreen: b(r.fullscreen, d.fullscreen),
    closeBehavior: pick(r.closeBehavior, CLOSE, d.closeBehavior),
    performance: pick(r.performance, PRESETS, d.performance),
    discordRpc: b(r.discordRpc, d.discordRpc),
    accent: pick(r.accent, ACCENTS, d.accent),
    animations: b(r.animations, d.animations),
    maxDownloads: num(r.maxDownloads, d.maxDownloads, 2, 64),
    showSnapshots: b(r.showSnapshots, d.showSnapshots),
    selectedProfileId: isId(r.selectedProfileId) ? r.selectedProfileId : d.selectedProfileId,
    selectedAccountId: typeof r.selectedAccountId === 'string' ? r.selectedAccountId : ''
  }
}

function sanitizeAccounts(raw: unknown): Account[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((a) => a && typeof a === 'object' && isUsername(a.name) && isId(a.id) && typeof a.uuid === 'string')
    .map((a) => ({
      id: a.id,
      name: a.name,
      uuid: a.uuid,
      createdAt: num(a.createdAt, Date.now(), 0, Number.MAX_SAFE_INTEGER),
      hasSkin: b(a.hasSkin, false),
      slim: b(a.slim, false)
    }))
    .slice(0, 50)
}

function sanitizeProfiles(raw: unknown): Profile[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((p) => p && typeof p === 'object' && isId(p.id) && isMcVersion(p.mcVersion) && typeof p.name === 'string')
    .map(
      (p): Profile => ({
        id: p.id,
        name: s(p.name, 'Profil', 40),
        description: s(p.description, '', 300),
        mcVersion: p.mcVersion,
        loader: p.loader === 'fabric' ? 'fabric' : 'vanilla',
        loaderVersion: typeof p.loaderVersion === 'string' && isMcVersion(p.loaderVersion) ? p.loaderVersion : undefined,
        managed: false,
        ramMB: typeof p.ramMB === 'number' ? num(p.ramMB, 0, 1024, 65536) : undefined,
        createdAt: num(p.createdAt, Date.now(), 0, Number.MAX_SAFE_INTEGER),
        lastPlayed: typeof p.lastPlayed === 'number' ? p.lastPlayed : undefined,
        playTimeSec: num(p.playTimeSec, 0, 0, Number.MAX_SAFE_INTEGER)
      })
    )
    .slice(0, 200)
}

/** Per-profile stats for managed (config-defined) profiles, which are not stored as profiles. */
interface ProfileStats {
  [id: string]: { lastPlayed?: number; playTimeSec: number; ramMB?: number }
}

function sanitizeStats(raw: unknown): ProfileStats {
  const out: ProfileStats = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!isId(k) || !v || typeof v !== 'object') continue
    const o = v as Record<string, unknown>
    out[k] = {
      lastPlayed: typeof o.lastPlayed === 'number' ? o.lastPlayed : undefined,
      playTimeSec: num(o.playTimeSec, 0, 0, Number.MAX_SAFE_INTEGER),
      ramMB: typeof o.ramMB === 'number' ? num(o.ramMB, 0, 1024, 65536) : undefined
    }
  }
  return out
}

function sanitizeServers(raw: unknown): ServerDef[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((x) => x && typeof x === 'object' && typeof x.address === 'string' && typeof x.name === 'string')
    .map((x) => ({ id: isId(x.id) ? x.id : randomUUID().slice(0, 8), name: s(x.name, 'Sunucu', 40), address: s(x.address, '', 255) }))
    .slice(0, 100)
}

function sanitizeSkins(raw: unknown): SkinMeta[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((x) => x && typeof x === 'object' && isId(x.id) && typeof x.name === 'string')
    .map((x) => ({ id: x.id, name: s(x.name, 'Skin', 40), slim: b(x.slim, false), addedAt: num(x.addedAt, Date.now(), 0, Number.MAX_SAFE_INTEGER) }))
    .slice(0, 200)
}

export let settings: JsonStore<Settings>
export let accounts: JsonStore<Account[]>
export let profiles: JsonStore<Profile[]>
export let stats: JsonStore<ProfileStats>
export let userServers: JsonStore<ServerDef[]>
export let skinLibrary: JsonStore<SkinMeta[]>

export function initData(): void {
  settings = new JsonStore(dataFile('settings'), defaultSettings, sanitizeSettings)
  accounts = new JsonStore(dataFile('accounts'), () => [], sanitizeAccounts)
  profiles = new JsonStore(dataFile('profiles'), () => [], sanitizeProfiles)
  stats = new JsonStore(dataFile('stats'), () => ({}), sanitizeStats)
  userServers = new JsonStore(dataFile('servers'), () => [], sanitizeServers)
  skinLibrary = new JsonStore(dataFile('skin-library'), () => [], sanitizeSkins)
}

export function flushAll(): void {
  for (const st of [settings, accounts, profiles, stats, userServers, skinLibrary]) st?.flush()
}
