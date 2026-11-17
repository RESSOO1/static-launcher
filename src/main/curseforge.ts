import { join } from 'path'
import { mkdir, rm } from 'fs/promises'
import { existsSync } from 'fs'
import type { ModrinthHit, Profile } from '@shared/types'
import { fetchJson, downloadVerified } from './net'
import { instanceDir, isInside } from './paths'
import { safeFileName } from './lib/validate'
import { resolveMcVersion } from './game/versions'
import { getConfig } from './config'
import { readManifest, writeManifest, EXT } from './modrinth'
import { filterCf, pickCfFile, sameName, type CfMod } from './lib/cf'
import { log } from './log'

// CurseForge anahtarı launcher'da değil panelde durur; launcher panelin /cf uçlarını kullanır.
interface CfFile {
  fileName: string
  displayName: string
  downloadUrl: string | null
  sha1: string | null
  size: number
  deps: number[]
}

const DL_HOSTS = ['edge.forgecdn.net', 'mediafilez.forgecdn.net', 'media.forgecdn.net']

function base(): string {
  const u = getConfig().remoteConfigUrl
  if (!u) throw new Error('CurseForge bağlantısı bu sürümde ayarlı değil')
  return new URL(u).origin
}

async function get<T>(path: string): Promise<T> {
  try {
    return await fetchJson<T>(base() + path, { timeoutMs: 15000, maxBytes: 8 * 1024 * 1024 })
  } catch (e) {
    log.warn(`CurseForge isteği başarısız: ${path}`, e)
    throw new Error(/ 404$/.test((e as Error).message) ? 'CurseForge\'da bulunamadı' : 'CurseForge\'a şu an ulaşılamıyor')
  }
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

/** Vitrin: CurseForge'un öne çıkanları + panelin seçtikleri, profile uyanlar. Sadece rakam yazılırsa o proje numarası getirilir. */
export async function cfList(profile: Profile, query: string): Promise<{ hits: ModrinthHit[]; total: number }> {
  const mc = (await resolveMcVersion(profile.mcVersion)).id
  const q = query.trim()
  const mods = /^\d{1,10}$/.test(q) ? [await get<CfMod>(`/cf/proje/${q}`)] : filterCf(await get<CfMod[]>('/cf/vitrin?sinif=mod'), q)
  const hits = mods.filter((m) => pickCfFile(m.files, mc) !== undefined).map(toHit)
  return { hits, total: hits.length }
}

export async function cfInstall(profile: Profile, projectId: string, depth = 0): Promise<string[]> {
  const m = /^cf-(\d{1,10})$/.exec(projectId)
  if (!m) throw new Error('Geçersiz proje')
  if (profile.loader !== 'fabric') throw new Error('Mod kurmak için Fabric profili gerekli')
  if (depth > 4) return []
  const mc = (await resolveMcVersion(profile.mcVersion)).id
  const mod = await get<CfMod>(`/cf/proje/${m[1]}`)
  const manifest = await readManifest(profile.id)
  const sameProject = Object.keys(manifest).find((k) => manifest[k].projectId === projectId)
  // bağımlılık başka kaynaktan (ör. Modrinth'ten Fabric API) zaten kuruluysa ikinci kopya kurulmaz
  if (depth > 0 && (sameProject || Object.values(manifest).some((e) => sameName(e.title, mod.name)))) return []

  const fileId = pickCfFile(mod.files, mc)
  if (fileId === undefined) throw new Error(`${mod.name}, Minecraft ${mc} Fabric için uygun değil`)
  const f = await get<CfFile>(`/cf/dosya/${m[1]}/${fileId}`)
  if (!f.downloadUrl) throw new Error(`${mod.name} yazarı, launcher'lardan indirmeye izin vermiyor. CurseForge sitesinden indirip mods klasörüne atabilirsin.`)
  if (!f.sha1) throw new Error('Dosya doğrulama bilgisi yok')
  const url = new URL(f.downloadUrl)
  if (url.protocol !== 'https:' || !DL_HOSTS.includes(url.hostname)) throw new Error('Güvenilmeyen indirme adresi')

  const name = safeFileName(f.fileName, EXT.mod)
  const dir = join(instanceDir(profile.id), 'mods')
  await mkdir(dir, { recursive: true })
  const dest = join(dir, name)
  if (!isInside(dir, dest)) throw new Error('Geçersiz dosya yolu')
  if (sameProject && sameProject !== name) await rm(join(dir, sameProject), { force: true }).catch(() => undefined)
  if (!existsSync(dest)) await downloadVerified(f.downloadUrl, dest, { algorithm: 'sha1', hash: f.sha1 }, { maxBytes: 300 * 1024 * 1024 })

  const fresh = await readManifest(profile.id)
  if (sameProject) delete fresh[sameProject]
  fresh[name] = { projectId, versionId: String(fileId), title: mod.name, icon: mod.icon, version: (f.displayName || f.fileName).slice(0, 40), type: 'mod' }
  await writeManifest(profile.id, fresh)

  const installed = [mod.name]
  for (const dep of f.deps) {
    try {
      installed.push(...(await cfInstall(profile, `cf-${dep}`, depth + 1)))
    } catch (e) {
      log.warn(`Bağımlılık kurulamadı: cf-${dep}`, e)
    }
  }
  return installed
}
