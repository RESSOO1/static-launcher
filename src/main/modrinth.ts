import { join } from 'path'
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import type { ContentType, InstalledMod, ModrinthHit, Profile } from '@shared/types'
import { fetchJson, downloadVerified } from './net'
import { instanceDir, isInside } from './paths'
import { safeFileName, int } from './lib/validate'
import { resolveMcVersion } from './game/versions'
import { log } from './log'

const API = 'https://api.modrinth.com/v2'
const CDN_HOSTS = ['cdn.modrinth.com']
const PROJECT_RE = /^[a-zA-Z0-9_-]{2,64}$/

const FOLDER: Record<ContentType, string> = { mod: 'mods', resourcepack: 'resourcepacks', shader: 'shaderpacks' }
const EXT: Record<ContentType, string[]> = { mod: ['.jar', '.jar.disabled'], resourcepack: ['.zip', '.zip.disabled'], shader: ['.zip', '.zip.disabled'] }

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

async function readManifest(pid: string): Promise<Manifest> {
  try {
    const raw = JSON.parse(await readFile(manifestPath(pid), 'utf8'))
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

async function writeManifest(pid: string, m: Manifest): Promise<void> {
  await mkdir(instanceDir(pid), { recursive: true })
  const tmp = manifestPath(pid) + '.tmp'
  await writeFile(tmp, JSON.stringify(m, null, 2))
  await rename(tmp, manifestPath(pid))
}

interface MrVersion {
  id: string
  project_id: string
  version_number: string
  loaders: string[]
  game_versions: string[]
  files: Array<{ url: string; filename: string; primary: boolean; size: number; hashes: { sha512?: string; sha1?: string } }>
  dependencies: Array<{ project_id: string | null; dependency_type: string }>
}

function loaderFacet(type: ContentType, profile: Profile): string[] {
  if (type === 'mod') return [profile.loader]
  if (type === 'shader') return profile.loader === 'fabric' ? ['iris'] : ['optifine']
  return ['minecraft']
}

export async function search(
  query: string,
  type: ContentType,
  profile: Profile,
  offset: number,
  sort: string
): Promise<{ hits: ModrinthHit[]; total: number }> {
  const mc = (await resolveMcVersion(profile.mcVersion)).id
  const facets: string[][] = [[`project_type:${type}`], [`versions:${mc}`]]
  if (type !== 'resourcepack') facets.push(loaderFacet(type, profile).map((l) => `categories:${l}`))
  const params = new URLSearchParams({
    query: query.slice(0, 100),
    facets: JSON.stringify(facets),
    limit: '24',
    offset: String(int(offset, 0, 10000)),
    index: ['relevance', 'downloads', 'follows', 'newest', 'updated'].includes(sort) ? sort : 'relevance'
  })
  const res = await fetchJson<{ hits: Record<string, unknown>[]; total_hits: number }>(`${API}/search?${params}`, { timeoutMs: 12000, maxBytes: 4 * 1024 * 1024 })
  return {
    total: res.total_hits,
    hits: res.hits.map((h) => ({
      projectId: String(h.project_id),
      slug: String(h.slug),
      title: String(h.title).slice(0, 80),
      description: String(h.description ?? '').slice(0, 300),
      author: String(h.author ?? ''),
      downloads: Number(h.downloads) || 0,
      follows: Number(h.follows) || 0,
      icon: typeof h.icon_url === 'string' && h.icon_url.startsWith('https://') ? h.icon_url : undefined,
      categories: Array.isArray(h.categories) ? h.categories.map(String).slice(0, 6) : []
    }))
  }
}

async function bestVersion(projectId: string, type: ContentType, profile: Profile, mc: string): Promise<MrVersion | undefined> {
  const loaders = loaderFacet(type, profile)
  const params = new URLSearchParams({ game_versions: JSON.stringify([mc]) })
  if (type !== 'resourcepack') params.set('loaders', JSON.stringify(loaders))
  const list = await fetchJson<MrVersion[]>(`${API}/project/${encodeURIComponent(projectId)}/version?${params}`, { timeoutMs: 12000, maxBytes: 8 * 1024 * 1024 })
  return list[0]
}

/**
 * Install a project (and its required dependencies for mods) into the profile.
 * Returns the titles that were newly installed.
 */
export async function installProject(profile: Profile, projectId: string, type: ContentType, depth = 0): Promise<string[]> {
  if (!PROJECT_RE.test(projectId)) throw new Error('Geçersiz proje')
  if (type === 'mod' && profile.loader === 'vanilla') throw new Error('Vanilla profillere mod kurulamaz. Fabric profili oluştur.')
  if (depth > 4) return []
  const mc = (await resolveMcVersion(profile.mcVersion)).id
  const manifest = await readManifest(profile.id)
  const already = Object.values(manifest).find((e) => e.projectId === projectId || e.projectId === projectId.toLowerCase())
  if (already && depth > 0) return []

  const v = await bestVersion(projectId, type, profile, mc)
  if (!v) throw new Error(`Bu içerik Minecraft ${mc} için uygun değil`)
  const file = v.files.find((f) => f.primary) ?? v.files[0]
  if (!file) throw new Error('İndirilebilir dosya yok')
  const url = new URL(file.url)
  if (url.protocol !== 'https:' || !CDN_HOSTS.includes(url.hostname)) throw new Error('Güvenilmeyen indirme adresi')
  const name = safeFileName(file.filename, EXT[type])
  const dir = join(instanceDir(profile.id), FOLDER[type])
  await mkdir(dir, { recursive: true })
  const dest = join(dir, name)
  if (!isInside(dir, dest)) throw new Error('Geçersiz dosya yolu')

  const installed: string[] = []
  // remove an older file of the same project before writing the new one
  if (already) {
    const oldFile = Object.keys(manifest).find((k) => manifest[k] === already)
    if (oldFile && oldFile !== name) await rm(join(dir, oldFile), { force: true }).catch(() => undefined)
    if (oldFile) delete manifest[oldFile]
  }
  if (!existsSync(dest)) {
    const hash = file.hashes.sha512 ? { algorithm: 'sha512' as const, hash: file.hashes.sha512 } : file.hashes.sha1 ? { algorithm: 'sha1' as const, hash: file.hashes.sha1 } : null
    if (!hash) throw new Error('Dosya doğrulama bilgisi yok')
    await downloadVerified(file.url, dest, hash, { maxBytes: 300 * 1024 * 1024 })
  }

  let meta: { title: string; icon_url?: string } = { title: projectId }
  try {
    meta = await fetchJson(`${API}/project/${encodeURIComponent(v.project_id)}`, { timeoutMs: 8000 })
  } catch {
    /* title is cosmetic */
  }
  manifest[name] = {
    projectId: v.project_id,
    versionId: v.id,
    title: String(meta.title).slice(0, 80),
    icon: typeof meta.icon_url === 'string' && meta.icon_url.startsWith('https://') ? meta.icon_url : undefined,
    version: v.version_number.slice(0, 40),
    type
  }
  await writeManifest(profile.id, manifest)
  installed.push(manifest[name].title)

  if (type === 'mod') {
    for (const dep of v.dependencies) {
      if (dep.dependency_type !== 'required' || !dep.project_id) continue
      try {
        installed.push(...(await installProject(profile, dep.project_id, 'mod', depth + 1)))
      } catch (e) {
        log.warn(`Bağımlılık kurulamadı: ${dep.project_id}`, e)
      }
    }
  }
  // Shaders on Fabric need Iris (which brings Sodium).
  if (type === 'shader' && profile.loader === 'fabric' && depth === 0) {
    const m2 = await readManifest(profile.id)
    if (!Object.values(m2).some((e) => e.projectId === 'YL57xq9U' || e.title.toLowerCase().startsWith('iris'))) {
      try {
        installed.push(...(await installProject(profile, 'iris', 'mod', 1)))
      } catch (e) {
        log.warn('Iris kurulamadı', e)
      }
    }
  }
  return installed
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

/** Server modes list Modrinth slugs; make sure each one is present before launch. */
export async function ensureModeMods(profile: Profile, onItem: (title: string, i: number, n: number) => void): Promise<void> {
  const wanted = profile.mods ?? []
  if (!wanted.length || profile.loader !== 'fabric') return
  const manifest = await readManifest(profile.id)
  const have = new Set(Object.values(manifest).map((e) => e.projectId))
  const slugs = new Set(Object.values(manifest).map((e) => e.title.toLowerCase()))
  let i = 0
  for (const slug of wanted) {
    i++
    onItem(slug, i, wanted.length)
    // projects are recorded by id; resolve slug -> id lazily via the install call
    if (have.has(slug) || slugs.has(slug.toLowerCase())) continue
    try {
      const proj = await fetchJson<{ id: string }>(`${API}/project/${encodeURIComponent(slug)}`, { timeoutMs: 8000 })
      if (have.has(proj.id)) continue
      await installProject(profile, proj.id, 'mod')
    } catch (e) {
      log.warn(`Mod kurulamadı: ${slug}`, e)
    }
  }
}
