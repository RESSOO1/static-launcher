// Parsing and validation of Modrinth .mrpack files. No Electron imports so it stays unit-testable.
// Everything in a pack is untrusted: paths must stay inside the instance, downloads must come from known hosts.

// the host list the .mrpack format itself allows
const HOSTS = ['cdn.modrinth.com', 'github.com', 'raw.githubusercontent.com', 'gitlab.com']
const MAX_FILES = 5000

export interface PackFile {
  path: string
  sha512: string
  urls: string[]
  size: number
}

export interface PackIndex {
  name: string
  mcVersion: string
  fabricVersion: string
  files: PackFile[]
}

/** A relative path with forward slashes that cannot leave the folder it is joined to, or throws. */
export function safeRelPath(p: unknown): string {
  if (typeof p !== 'string' || !p || p.length > 400) throw new Error('Paket geçersiz bir dosya yolu içeriyor')
  const norm = p.replace(/\\/g, '/')
  // eslint-disable-next-line no-control-regex
  if (norm.startsWith('/') || /^[A-Za-z]:/.test(norm) || /[<>:"|?*\x00-\x1f]/.test(norm)) throw new Error('Paket geçersiz bir dosya yolu içeriyor')
  const parts = norm.split('/')
  if (parts.some((s) => !s || s === '.' || s === '..' || s.endsWith('.') || s.endsWith(' '))) throw new Error('Paket geçersiz bir dosya yolu içeriyor')
  return norm
}

const allowedUrl = (u: unknown): u is string => {
  if (typeof u !== 'string' || u.length > 2048) return false
  try {
    const url = new URL(u)
    return url.protocol === 'https:' && HOSTS.includes(url.hostname)
  } catch {
    return false
  }
}

/** Validates modrinth.index.json. Only Fabric packs are accepted, since that is what the launcher can run. */
export function parseIndex(raw: unknown): PackIndex {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  if (r.formatVersion !== 1 || r.game !== 'minecraft') throw new Error('Bu mod paketi desteklenmiyor')
  const deps = (r.dependencies && typeof r.dependencies === 'object' ? r.dependencies : {}) as Record<string, unknown>
  const mcVersion = deps.minecraft
  const fabricVersion = deps['fabric-loader']
  if (typeof mcVersion !== 'string' || !/^[A-Za-z0-9._-]{1,40}$/.test(mcVersion)) throw new Error('Paketin Minecraft sürümü okunamadı')
  if (typeof fabricVersion !== 'string' || !/^[A-Za-z0-9._+-]{1,40}$/.test(fabricVersion)) throw new Error('Launcher şimdilik sadece Fabric mod paketlerini kurabiliyor')
  if (!Array.isArray(r.files) || r.files.length > MAX_FILES) throw new Error('Paket dosya listesi geçersiz')
  const files: PackFile[] = []
  for (const f of r.files as Record<string, unknown>[]) {
    if ((f?.env as { client?: string } | undefined)?.client === 'unsupported') continue
    const sha512 = (f?.hashes as { sha512?: unknown } | undefined)?.sha512
    if (typeof sha512 !== 'string' || !/^[a-fA-F0-9]{128}$/.test(sha512)) throw new Error('Paketteki bir dosyanın doğrulama bilgisi yok')
    const urls = (Array.isArray(f.downloads) ? f.downloads : []).filter(allowedUrl)
    if (!urls.length) throw new Error('Paket güvenilmeyen bir indirme adresi içeriyor')
    files.push({ path: safeRelPath(f.path), sha512, urls, size: typeof f.fileSize === 'number' ? f.fileSize : 0 })
  }
  return { name: typeof r.name === 'string' ? r.name.slice(0, 40) : 'Mod paketi', mcVersion, fabricVersion, files }
}
