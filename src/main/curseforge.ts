import { join } from 'path'
import { mkdir, rm } from 'fs/promises'
import { existsSync } from 'fs'
import type { ContentType, ModrinthHit, Profile } from '@shared/types'
import { fetchJson, downloadVerified } from './net'
import { instanceDir, isInside } from './paths'
import { safeFileName } from './lib/validate'
import { resolveMcVersion } from './game/versions'
import { getConfig } from './config'
import { readManifest, writeManifest, EXT, FOLDER } from './content'
import { filterCf, pickCfFile, sameName, type CfMod, type CfType } from './lib/cf'
import { log } from './log'

// Bütün içerik CurseForge'dan gelir. Anahtar launcher'da değil panelde durur; launcher panelin /cf uçlarını kullanır.
export interface CfFile {
  fileName: string
  displayName: string
  downloadUrl: string | null
  sha1: string | null
  size: number
  deps: number[]
}

export const DL_HOSTS = ['edge.forgecdn.net', 'mediafilez.forgecdn.net', 'media.forgecdn.net']
const IRIS = 455508

function base(): string {
  const u = getConfig().remoteConfigUrl
  if (!u) throw new Error('CurseForge bağlantısı bu sürümde ayarlı değil')
  return new URL(u).origin
}

export async function cfGet<T>(path: string, body?: unknown): Promise<T> {
  try {
    if (body === undefined) return await fetchJson<T>(base() + path, { timeoutMs: 15000, maxBytes: 8 * 1024 * 1024 })
    const res = await fetch(base() + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) })
    if (!res.ok) throw new Error(`Sunucu yanıtı ${res.status}`)
    return (await res.json()) as T
  } catch (e) {
    log.warn(`CurseForge isteği başarısız: ${path}`, e)
    throw new Error(/ 404$/.test((e as Error).message) ? 'CurseForge\'da bulunamadı' : 'CurseForge\'a şu an ulaşılamıyor')
  }
}

/** İndirme adresi CurseForge'un kendi sunucusu olmalı. */
export function checkDownload(f: CfFile, name: string): string {
  if (!f.downloadUrl) throw new Error(`${name} yazarı launcher'lardan indirmeye izin vermiyor. CurseForge sitesinden indirip klasöre atabilirsin.`)
  if (!f.sha1) throw new Error('Dosya doğrulama bilgisi yok')
  const url = new URL(f.downloadUrl)
  if (url.protocol !== 'https:' || !DL_HOSTS.includes(url.hostname)) throw new Error('Güvenilmeyen indirme adresi')
  return f.sha1
}

const toHit = (m: CfMod): ModrinthHit => ({
  projectId: `cf-${m.id}`,
  slug: String(m.id),
  title: m.name,
  description: m.summary,
  author: m.author,
  downloads: m.downloads,
  follows: 0,
  icon: m.icon,
  categories: []
})

/**
 * Vitrin: CurseForge'un öne çıkanları + panelin seçtikleri, bu profile kurulabilenler.
 * Sadece rakam yazılırsa o proje numarası getirilir (CurseForge sayfasındaki "Project ID").
 */
export async function cfList(type: CfType, profile: Profile | null, query: string): Promise<{ hits: ModrinthHit[]; total: number }> {
  const mc = profile ? (await resolveMcVersion(profile.mcVersion)).id : ''
  const q = query.trim()
  const mods = /^\d{1,10}$/.test(q) ? [await cfGet<CfMod>(`/cf/proje/${q}`)] : filterCf(await cfGet<CfMod[]>(`/cf/vitrin?sinif=${type}`), q)
  const hits = mods.filter((m) => pickCfFile(m, mc, type) !== undefined).map(toHit)
  return { hits, total: hits.length }
}

/** Bir projeyi (modlar için zorunlu bağımlılıklarıyla) profile kurar; yeni kurulanların adlarını döner. */
export async function cfInstall(profile: Profile, projectId: string, type: ContentType, depth = 0): Promise<string[]> {
  const m = /^cf-(\d{1,10})$/.exec(projectId)
  if (!m) throw new Error('Geçersiz proje')
  if (type !== 'resourcepack' && profile.loader !== 'fabric') throw new Error('Mod ve shader kurmak için Fabric profili gerekli')
  if (depth > 4) return []
  const mc = (await resolveMcVersion(profile.mcVersion)).id
  const mod = await cfGet<CfMod>(`/cf/proje/${m[1]}`)
  const manifest = await readManifest(profile.id)
  const sameProject = Object.keys(manifest).find((k) => manifest[k].projectId === projectId)
  // bağımlılık başka yoldan (ör. eskiden kurulmuş Fabric API) zaten kuruluysa ikinci kopya kurulmaz
  if (depth > 0 && (sameProject || Object.values(manifest).some((e) => e.type === type && sameName(e.title, mod.name)))) return []

  const fileId = pickCfFile(mod, mc, type)
  if (fileId === undefined) throw new Error(`${mod.name}, Minecraft ${mc} için uygun değil`)
  const f = await cfGet<CfFile>(`/cf/dosya/${m[1]}/${fileId}`)
  const sha1 = checkDownload(f, mod.name)

  const name = safeFileName(f.fileName, EXT[type])
  const dir = join(instanceDir(profile.id), FOLDER[type])
  await mkdir(dir, { recursive: true })
  const dest = join(dir, name)
  if (!isInside(dir, dest)) throw new Error('Geçersiz dosya yolu')
  if (sameProject && sameProject !== name) await rm(join(dir, sameProject), { force: true }).catch(() => undefined)
  if (!existsSync(dest)) await downloadVerified(f.downloadUrl as string, dest, { algorithm: 'sha1', hash: sha1 }, { maxBytes: 300 * 1024 * 1024 })

  const fresh = await readManifest(profile.id)
  if (sameProject) delete fresh[sameProject]
  fresh[name] = { projectId, versionId: String(fileId), title: mod.name, icon: mod.icon, version: (f.displayName || f.fileName).slice(0, 40), type }
  await writeManifest(profile.id, fresh)

  const installed = [mod.name]
  const deps = type === 'mod' ? f.deps : type === 'shader' && depth === 0 ? [IRIS] : []
  for (const dep of deps) {
    try {
      installed.push(...(await cfInstall(profile, `cf-${dep}`, 'mod', depth + 1)))
    } catch (e) {
      log.warn(`Bağımlılık kurulamadı: cf-${dep}`, e)
    }
  }
  return installed
}
