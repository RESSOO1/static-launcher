import { dirname, join } from 'path'
import { mkdir, rm, writeFile } from 'fs/promises'
import AdmZip from 'adm-zip'
import type { ModrinthHit, PackProgress, Profile } from '@shared/types'
import { fetchJson, downloadVerified } from './net'
import { instanceDir, isInside } from './paths'
import { createProfile, deleteProfile, updateProfile } from './profiles'
import { settings } from './data'
import { int } from './lib/validate'
import { parseIndex, safeRelPath } from './lib/mrpack'
import { log } from './log'

const API = 'https://api.modrinth.com/v2'
const PROJECT_RE = /^[a-zA-Z0-9_-]{2,64}$/
const MAX_PACK_BYTES = 512 * 1024 * 1024
const MAX_UNPACKED_BYTES = 4 * 1024 * 1024 * 1024
const MAX_ENTRIES = 50_000

let running: AbortController | null = null

export function cancelPack(): void {
  running?.abort()
}

export async function searchPacks(query: string, offset: number, sort: string): Promise<{ hits: ModrinthHit[]; total: number }> {
  const params = new URLSearchParams({
    query: query.slice(0, 100),
    // shortcut: Fabric packs only, widen once the launcher can run Forge and NeoForge
    facets: JSON.stringify([['project_type:modpack'], ['categories:fabric']]),
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

interface MrVersion {
  files: { url: string; filename: string; primary: boolean; hashes: { sha512?: string } }[]
}

/** Downloads a pack, creates a new profile for it and fills that profile's folder. A failed install leaves nothing behind. */
export async function installPack(projectId: unknown, title: unknown, onProgress: (p: PackProgress) => void): Promise<Profile> {
  if (typeof projectId !== 'string' || !PROJECT_RE.test(projectId)) throw new Error('Geçersiz mod paketi')
  if (running) throw new Error('Başka bir mod paketi kuruluyor')
  const ctrl = new AbortController()
  running = ctrl
  const signal = ctrl.signal
  let profile: Profile | null = null
  try {
    onProgress({ label: 'Paket bilgisi alınıyor', progress: -1 })
    const versions = await fetchJson<MrVersion[]>(`${API}/project/${encodeURIComponent(projectId)}/version?loaders=${encodeURIComponent('["fabric"]')}`, { timeoutMs: 15000, maxBytes: 16 * 1024 * 1024, signal })
    const file = versions[0]?.files.find((f) => f.primary) ?? versions[0]?.files[0]
    if (!file) throw new Error('Launcher şimdilik sadece Fabric mod paketlerini kurabiliyor')
    if (new URL(file.url).hostname !== 'cdn.modrinth.com' || !file.hashes.sha512 || !file.filename.endsWith('.mrpack')) throw new Error('Paket dosyası güvenilir değil')

    // the profile folder is created first so every download lands in a place we can delete on failure
    const placeholder = await createProfile({ name: String(title ?? 'Mod paketi').slice(0, 40).trim() || 'Mod paketi', mcVersion: 'latest', loader: 'vanilla' })
    const dir = instanceDir(placeholder.id)
    profile = placeholder
    const packFile = join(dir, '.pack.mrpack')

    onProgress({ label: 'Paket indiriliyor', progress: -1 })
    await downloadVerified(file.url, packFile, { algorithm: 'sha512', hash: file.hashes.sha512 }, { maxBytes: MAX_PACK_BYTES, timeoutMs: 600_000, signal })

    const zip = new AdmZip(packFile)
    const entries = zip.getEntries()
    const unpacked = entries.reduce((n, e) => n + e.header.size, 0)
    if (entries.length > MAX_ENTRIES || unpacked > MAX_UNPACKED_BYTES) throw new Error('Paket çok büyük')
    const indexEntry = zip.getEntry('modrinth.index.json')
    if (!indexEntry) throw new Error('Bu mod paketi desteklenmiyor')
    const index = parseIndex(JSON.parse(indexEntry.getData().toString('utf8')))

    const target = (rel: string): string => {
      const p = join(dir, safeRelPath(rel))
      if (!isInside(dir, p)) throw new Error('Paket geçersiz bir dosya yolu içeriyor')
      return p
    }
    // validate every path up front so a bad pack is rejected before anything is downloaded
    const jobs = index.files.map((f) => ({ ...f, dest: target(f.path) }))

    let done = 0
    let next = 0
    const report = () => onProgress({ label: 'Modlar indiriliyor', detail: `${done} / ${jobs.length}`, progress: jobs.length ? done / jobs.length : 1 })
    report()
    const worker = async (): Promise<void> => {
      while (next < jobs.length) {
        const job = jobs[next++]
        await mkdir(dirname(job.dest), { recursive: true })
        let lastError: unknown
        for (const url of job.urls) {
          try {
            await downloadVerified(url, job.dest, { algorithm: 'sha512', hash: job.sha512 }, { timeoutMs: 300_000, signal })
            lastError = undefined
            break
          } catch (e) {
            lastError = e
            if (signal.aborted) throw e
          }
        }
        if (lastError) throw new Error(`Dosya indirilemedi: ${job.path}`)
        done++
        report()
      }
    }
    await Promise.all(Array.from({ length: Math.min(Math.max(2, settings.get().maxDownloads), 16) }, worker))

    onProgress({ label: 'Ayarlar kopyalanıyor', progress: -1 })
    // client-overrides come second on purpose: the format says they win over overrides
    for (const prefix of ['overrides/', 'client-overrides/']) {
      for (const e of entries) {
        if (signal.aborted) throw new Error('İptal edildi')
        const name = e.entryName.replace(/\\/g, '/')
        if (e.isDirectory || !name.startsWith(prefix) || name.length === prefix.length) continue
        const dest = target(name.slice(prefix.length))
        await mkdir(dirname(dest), { recursive: true })
        await writeFile(dest, e.getData())
      }
    }
    await rm(packFile, { force: true })

    const final = updateProfile(placeholder.id, {
      name: placeholder.name,
      description: index.name === placeholder.name ? '' : index.name,
      mcVersion: index.mcVersion,
      loader: 'fabric',
      loaderVersion: index.fabricVersion
    })
    settings.update((s) => ({ ...s, selectedProfileId: final.id }))
    return final
  } catch (e) {
    if (profile) await deleteProfile(profile.id).catch((err) => log.warn('Yarım kalan paket silinemedi', err))
    if (signal.aborted) throw new Error('Kurulum iptal edildi')
    throw e
  } finally {
    running = null
  }
}
