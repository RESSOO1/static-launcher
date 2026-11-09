import { join } from 'path'
import { existsSync } from 'fs'
import { mkdir, readdir, stat, rm } from 'fs/promises'
import AdmZip from 'adm-zip'
import type { BackupInfo, Screenshot, WorldInfo } from '@shared/types'
import { backupsDir, instanceDir, isInside } from './paths'
import { safeFileName } from './lib/validate'

const WORLD_RE = /^[^<>:"/\\|?*\x00-\x1f]{1,120}$/

async function dirSize(dir: string, depth = 0): Promise<number> {
  if (depth > 8) return 0
  let total = 0
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) total += await dirSize(p, depth + 1)
    else if (e.isFile()) total += (await stat(p)).size
  }
  return total
}

export async function listWorlds(profileId: string): Promise<WorldInfo[]> {
  const saves = join(instanceDir(profileId), 'saves')
  if (!existsSync(saves)) return []
  const out: WorldInfo[] = []
  for (const e of await readdir(saves, { withFileTypes: true })) {
    if (!e.isDirectory()) continue
    const level = join(saves, e.name, 'level.dat')
    if (!existsSync(level)) continue
    out.push({ folder: e.name, name: e.name, lastPlayed: (await stat(level)).mtimeMs, sizeBytes: await dirSize(join(saves, e.name)) })
  }
  return out.sort((a, b) => b.lastPlayed - a.lastPlayed)
}

function worldPath(profileId: string, folder: unknown): string {
  if (typeof folder !== 'string' || !WORLD_RE.test(folder) || folder.startsWith('.') || folder.includes('..')) throw new Error('Geçersiz dünya')
  const saves = join(instanceDir(profileId), 'saves')
  const p = join(saves, folder)
  if (!isInside(saves, p) || !existsSync(p)) throw new Error('Dünya bulunamadı')
  return p
}

export async function backupWorld(profileId: string, folder: unknown): Promise<BackupInfo> {
  const src = worldPath(profileId, folder)
  const dir = join(backupsDir(), profileId)
  await mkdir(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const file = `${String(folder).replace(/[^A-Za-z0-9_-]/g, '_')}__${stamp}.zip`
  const zip = new AdmZip()
  // session.lock is held open by a running game; it is not part of the world data anyway
  zip.addLocalFolder(src, String(folder), (name: string) => !/(^|[\\/])session\.lock$/.test(name))
  await zip.writeZipPromise(join(dir, file))
  const st = await stat(join(dir, file))
  return { file, world: String(folder), createdAt: st.mtimeMs, sizeBytes: st.size }
}

export async function listBackups(profileId: string): Promise<BackupInfo[]> {
  const dir = join(backupsDir(), profileId)
  if (!existsSync(dir)) return []
  const out: BackupInfo[] = []
  for (const f of await readdir(dir)) {
    if (!f.endsWith('.zip')) continue
    const st = await stat(join(dir, f))
    out.push({ file: f, world: f.split('__')[0], createdAt: st.mtimeMs, sizeBytes: st.size })
  }
  return out.sort((a, b) => b.createdAt - a.createdAt)
}

/** Restore into a new folder so an existing world is never overwritten. Zip entries are checked for path escapes. */
export async function restoreBackup(profileId: string, file: unknown): Promise<string> {
  const name = safeFileName(file, ['.zip'])
  const zipPath = join(backupsDir(), profileId, name)
  if (!existsSync(zipPath)) throw new Error('Yedek bulunamadı')
  const saves = join(instanceDir(profileId), 'saves')
  await mkdir(saves, { recursive: true })
  const zip = new AdmZip(zipPath)
  const base = name.split('__')[0]
  let target = `${base} (yedek)`
  let n = 2
  while (existsSync(join(saves, target))) target = `${base} (yedek ${n++})`
  const dest = join(saves, target)
  for (const entry of zip.getEntries()) {
    const rel = entry.entryName.split('/').slice(1).join('/')
    if (!rel) continue
    const out = join(dest, rel)
    if (!isInside(dest, out)) throw new Error('Yedek dosyası güvenli değil')
  }
  await mkdir(dest, { recursive: true })
  for (const entry of zip.getEntries()) {
    const rel = entry.entryName.split('/').slice(1).join('/')
    if (!rel || entry.isDirectory) continue
    const out = join(dest, rel)
    await mkdir(join(out, '..'), { recursive: true })
    zip.extractEntryTo(entry, join(out, '..'), false, true)
  }
  return target
}

export async function deleteBackup(profileId: string, file: unknown): Promise<void> {
  const name = safeFileName(file, ['.zip'])
  const dir = join(backupsDir(), profileId)
  const p = join(dir, name)
  if (!isInside(dir, p)) throw new Error('Geçersiz yedek')
  await rm(p, { force: true })
}

export async function listScreenshots(profileId: string): Promise<Screenshot[]> {
  const dir = join(instanceDir(profileId), 'screenshots')
  if (!existsSync(dir)) return []
  const out: Screenshot[] = []
  for (const f of await readdir(dir)) {
    if (!/\.(png|jpe?g)$/i.test(f)) continue
    const st = await stat(join(dir, f))
    out.push({ file: f, url: `static-file://shot/${encodeURIComponent(profileId)}/${encodeURIComponent(f)}`, createdAt: st.mtimeMs })
  }
  return out.sort((a, b) => b.createdAt - a.createdAt).slice(0, 300)
}

export async function deleteScreenshot(profileId: string, file: unknown): Promise<void> {
  const name = safeFileName(file, ['.png', '.jpg', '.jpeg'])
  const dir = join(instanceDir(profileId), 'screenshots')
  const p = join(dir, name)
  if (!isInside(dir, p)) throw new Error('Geçersiz dosya')
  await rm(p, { force: true })
}
