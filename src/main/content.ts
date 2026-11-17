import { join } from 'path'
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import type { ContentType, InstalledMod, Profile } from '@shared/types'
import { instanceDir, isInside } from './paths'
import { safeFileName } from './lib/validate'
import { cfInstall } from './curseforge'
import { log } from './log'

export const FOLDER: Record<ContentType, string> = { mod: 'mods', resourcepack: 'resourcepacks', shader: 'shaderpacks' }
export const EXT: Record<ContentType, string[]> = { mod: ['.jar', '.jar.disabled'], resourcepack: ['.zip', '.zip.disabled'], shader: ['.zip', '.zip.disabled'] }

interface ManifestEntry {
  projectId: string
  versionId: string
  title: string
  icon?: string
  version: string
  type: ContentType
}
type Manifest = Record<string, ManifestEntry>

const manifestPath = (pid: string) => join(instanceDir(pid), '.static-content.json')

export async function readManifest(pid: string): Promise<Manifest> {
  try {
    const raw = JSON.parse(await readFile(manifestPath(pid), 'utf8'))
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

export async function writeManifest(pid: string, m: Manifest): Promise<void> {
  await mkdir(instanceDir(pid), { recursive: true })
  const tmp = manifestPath(pid) + '.tmp'
  await writeFile(tmp, JSON.stringify(m, null, 2))
  await rename(tmp, manifestPath(pid))
}

export async function listInstalled(profileId: string, type: ContentType): Promise<InstalledMod[]> {
  const dir = join(instanceDir(profileId), FOLDER[type])
  if (!existsSync(dir)) return []
  const manifest = await readManifest(profileId)
  const out: InstalledMod[] = []
  for (const f of await readdir(dir)) {
    const lower = f.toLowerCase()
    if (!EXT[type].some((e) => lower.endsWith(e))) continue
    const enabled = !lower.endsWith('.disabled')
    const key = enabled ? f : f.slice(0, -'.disabled'.length)
    const m = manifest[key]
    let size = 0
    try {
      size = (await stat(join(dir, f))).size
    } catch {
      continue
    }
    out.push({
      file: f,
      name: m?.title ?? key.replace(/\.(jar|zip)$/i, ''),
      version: m?.version,
      enabled,
      size,
      icon: m?.icon,
      projectId: m?.projectId
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'tr'))
}

export async function toggleContent(profileId: string, type: ContentType, file: unknown): Promise<void> {
  const name = safeFileName(file, EXT[type])
  const dir = join(instanceDir(profileId), FOLDER[type])
  const from = join(dir, name)
  const to = name.toLowerCase().endsWith('.disabled') ? join(dir, name.slice(0, -'.disabled'.length)) : `${from}.disabled`
  if (!isInside(dir, from) || !isInside(dir, to)) throw new Error('Geçersiz dosya')
  await rename(from, to)
}

export async function removeContent(profileId: string, type: ContentType, file: unknown): Promise<void> {
  const name = safeFileName(file, EXT[type])
  const dir = join(instanceDir(profileId), FOLDER[type])
  const target = join(dir, name)
  if (!isInside(dir, target)) throw new Error('Geçersiz dosya')
  await rm(target, { force: true })
  const manifest = await readManifest(profileId)
  const key = name.toLowerCase().endsWith('.disabled') ? name.slice(0, -'.disabled'.length) : name
  if (manifest[key]) {
    delete manifest[key]
    await writeManifest(profileId, manifest)
  }
}

// Sunucu modlarının yapılandırması eski launcher'larla uyumlu kalsın diye modları kısa adla yazar; CurseForge numarası buradan gelir.
const MODE_MODS: Record<string, number> = {
  'fabric-api': 306612,
  sodium: 394468,
  lithium: 360438,
  'ferrite-core': 459857,
  iris: 455508,
  entityculling: 448233
}

/** Sunucu modlarının istediği modlar oyundan önce kurulur; başka yoldan aynı ada sahip mod kuruluysa atlanır. */
export async function ensureModeMods(profile: Profile, onItem: (title: string, i: number, n: number) => void): Promise<void> {
  const wanted = profile.mods ?? []
  if (!wanted.length || profile.loader !== 'fabric') return
  let i = 0
  for (const slug of wanted) {
    i++
    onItem(slug, i, wanted.length)
    const id = MODE_MODS[slug] ?? (/^\d{1,10}$/.test(slug) ? Number(slug) : undefined)
    if (id === undefined) {
      log.warn(`Sunucu modu için bilinmeyen mod: ${slug}`)
      continue
    }
    const manifest = await readManifest(profile.id)
    if (Object.values(manifest).some((e) => e.projectId === `cf-${id}`)) continue
    try {
      // derinlik 1: aynı adlı mod (ör. eskiden kurulmuş Sodium) varsa ikinci kopya kurulmaz
      await cfInstall(profile, `cf-${id}`, 'mod', 1)
    } catch (e) {
      log.warn(`Mod kurulamadı: ${slug}`, e)
    }
  }
}
