import { dirname, join } from 'path'
import { mkdir, rm, writeFile } from 'fs/promises'
import AdmZip from 'adm-zip'
import type { ModrinthHit, PackProgress, Profile } from '@shared/types'
import { downloadVerified } from './net'
import { instanceDir, isInside } from './paths'
import { createProfile, deleteProfile, updateProfile } from './profiles'
import { settings } from './data'
import { safeFileName } from './lib/validate'
import { parseCfManifest, pickCfFile, safeRelPath, type CfMod } from './lib/cf'
import { cfGet, cfList, checkDownload, type CfFile } from './curseforge'
import { readManifest, writeManifest } from './content'
import { log } from './log'

const MAX_PACK_BYTES = 512 * 1024 * 1024
const MAX_UNPACKED_BYTES = 4 * 1024 * 1024 * 1024
const MAX_ENTRIES = 50_000
// CurseForge sınıfı -> profil klasörü; başka sınıflar (ör. dünya) atlanır
const CLASS_FOLDER: Record<number, { dir: string; type: 'mod' | 'resourcepack' | 'shader'; ext: string[] }> = {
  6: { dir: 'mods', type: 'mod', ext: ['.jar'] },
  12: { dir: 'resourcepacks', type: 'resourcepack', ext: ['.zip'] },
  6552: { dir: 'shaderpacks', type: 'shader', ext: ['.zip'] }
}

let running: AbortController | null = null

export function cancelPack(): void {
  running?.abort()
}

export function searchPacks(query: string): Promise<{ hits: ModrinthHit[]; total: number }> {
  return cfList('modpack', null, query)
}

type Resolved = CfFile & { id: number; modId: number; classId?: number; modName: string }

/**
 * CurseForge paketini indirir, paket için yeni profil açar ve klasörünü doldurur. Başarısız kurulum geride bir şey bırakmaz.
 * Yazarı launcher'dan indirmeye izin vermeyen modlar atlanır ve adları döner; kullanıcı onları siteden indirebilir.
 */
export async function installPack(projectId: unknown, title: unknown, onProgress: (p: PackProgress) => void): Promise<{ profile: Profile; missing: string[] }> {
  const pm = typeof projectId === 'string' ? /^cf-(\d{1,10})$/.exec(projectId) : null
  if (!pm) throw new Error('Geçersiz mod paketi')
  if (running) throw new Error('Başka bir mod paketi kuruluyor')
  const ctrl = new AbortController()
  running = ctrl
  const signal = ctrl.signal
  let profile: Profile | null = null
  try {
    onProgress({ label: 'Paket bilgisi alınıyor', progress: -1 })
    const mod = await cfGet<CfMod>(`/cf/proje/${pm[1]}`)
    const fileId = pickCfFile(mod, '', 'modpack')
    if (fileId === undefined) throw new Error('Launcher şimdilik sadece Fabric mod paketlerini kurabiliyor')
    const pf = await cfGet<CfFile>(`/cf/dosya/${pm[1]}/${fileId}`)
    const packSha1 = checkDownload(pf, mod.name)

    // profil klasörü önce açılır ki her indirme, başarısızlıkta silinebilecek bir yere insin
    const placeholder = await createProfile({ name: String(title ?? mod.name).slice(0, 40).trim() || 'Mod paketi', mcVersion: 'latest', loader: 'vanilla' })
    const dir = instanceDir(placeholder.id)
    profile = placeholder
    const packFile = join(dir, '.pack.zip')

    onProgress({ label: 'Paket indiriliyor', progress: -1 })
    await downloadVerified(pf.downloadUrl as string, packFile, { algorithm: 'sha1', hash: packSha1 }, { maxBytes: MAX_PACK_BYTES, timeoutMs: 600_000, signal })

    const zip = new AdmZip(packFile)
    const entries = zip.getEntries()
    const unpacked = entries.reduce((n, e) => n + e.header.size, 0)
    if (entries.length > MAX_ENTRIES || unpacked > MAX_UNPACKED_BYTES) throw new Error('Paket çok büyük')
    const manEntry = zip.getEntry('manifest.json')
    if (!manEntry) throw new Error('Bu mod paketi desteklenmiyor')
    const man = parseCfManifest(JSON.parse(manEntry.getData().toString('utf8')))

    onProgress({ label: 'Mod listesi alınıyor', progress: -1 })
    const wanted = man.files.filter((f) => f.required)
    const resolved = wanted.length ? await cfGet<Resolved[]>('/cf/dosyalar', { fileIds: wanted.map((f) => f.fileId) }) : []
    const missing: string[] = []
    const jobs: { r: Resolved; dest: string; key: string; type: 'mod' | 'resourcepack' | 'shader'; sha1: string }[] = []
    for (const r of resolved) {
      const cls = CLASS_FOLDER[r.classId ?? 6]
      if (!cls) continue
      let sha1: string
      try {
        sha1 = checkDownload(r, r.modName)
      } catch {
        missing.push(r.modName || r.fileName)
        continue
      }
      const name = safeFileName(r.fileName, cls.ext)
      const folder = join(dir, cls.dir)
      const dest = join(folder, name)
      if (!isInside(folder, dest)) throw new Error('Paket geçersiz bir dosya yolu içeriyor')
      jobs.push({ r, dest, key: name, type: cls.type, sha1 })
    }

    let done = 0
    let next = 0
    const report = () => onProgress({ label: 'Modlar indiriliyor', detail: `${done} / ${jobs.length}`, progress: jobs.length ? done / jobs.length : 1 })
    report()
    const worker = async (): Promise<void> => {
      while (next < jobs.length) {
        const job = jobs[next++]
        await mkdir(dirname(job.dest), { recursive: true })
        await downloadVerified(job.r.downloadUrl as string, job.dest, { algorithm: 'sha1', hash: job.sha1 }, { timeoutMs: 300_000, signal }).catch((e) => {
          if (signal.aborted) throw e
          throw new Error(`Dosya indirilemedi: ${job.r.fileName}`)
        })
        done++
        report()
      }
    }
    await Promise.all(Array.from({ length: Math.min(Math.max(2, settings.get().maxDownloads), 16) }, worker))

    onProgress({ label: 'Ayarlar kopyalanıyor', progress: -1 })
    const prefix = `${man.overrides}/`
    for (const e of entries) {
      if (signal.aborted) throw new Error('İptal edildi')
      const name = e.entryName.replace(/\\/g, '/')
      if (e.isDirectory || !name.startsWith(prefix) || name.length === prefix.length) continue
      const dest = join(dir, safeRelPath(name.slice(prefix.length)))
      if (!isInside(dir, dest)) throw new Error('Paket geçersiz bir dosya yolu içeriyor')
      await mkdir(dirname(dest), { recursive: true })
      await writeFile(dest, e.getData())
    }
    await rm(packFile, { force: true })

    // Yüklü sekmesinde adlarıyla görünsünler
    const content = await readManifest(placeholder.id)
    for (const j of jobs) content[j.key] = { projectId: `cf-${j.r.modId}`, versionId: String(j.r.id), title: j.r.modName || j.key, version: (j.r.displayName || j.r.fileName).slice(0, 40), type: j.type }
    await writeManifest(placeholder.id, content)

    const final = updateProfile(placeholder.id, {
      name: placeholder.name,
      description: man.name === placeholder.name ? '' : man.name,
      mcVersion: man.mcVersion,
      loader: 'fabric',
      loaderVersion: man.fabricVersion
    })
    settings.update((s) => ({ ...s, selectedProfileId: final.id }))
    if (missing.length) log.warn(`Paket kuruldu, indirilemeyen modlar: ${missing.join(', ')}`)
    return { profile: final, missing }
  } catch (e) {
    if (profile) await deleteProfile(profile.id).catch((err) => log.warn('Yarım kalan paket silinemedi', err))
    if (signal.aborted) throw new Error('Kurulum iptal edildi')
    throw e
  } finally {
    running = null
  }
}
