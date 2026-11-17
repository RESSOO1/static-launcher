// CurseForge verisi için saf yardımcılar (Electron'suz, birim testli).
// Paketlerden gelen her şey güvenilmezdir: yollar profil klasöründen çıkamaz, sürüm adları sıkı biçimde denetlenir.

export type CfType = 'mod' | 'resourcepack' | 'shader' | 'modpack'

export interface CfFileIndex {
  gameVersion: string
  fileId: number
  modLoader: number | null
  release?: boolean
}

export interface CfMod {
  id: number
  name: string
  summary: string
  author: string
  downloads: number
  icon?: string
  url?: string
  distribution: boolean
  mainFileId?: number
  files: CfFileIndex[]
}

const FABRIC = 4

/** CurseForge listeyi yeniden eskiye verir; aynı uygunlukta kararlı sürüm, deneme sürümünden önce gelir. */
const best = (list: CfFileIndex[]): number | undefined => (list.find((f) => f.release !== false) ?? list[0])?.fileId

/**
 * Kurulacak dosya. Mod: profilin sürümüne uyan Fabric dosyası. Mod paketi: en yeni Fabric paketi (sürümü paket belirler).
 * Kaynak paketi ve shader: sürüme uyan dosya, yoksa projenin ana dosyası (çoğu sürümden bağımsızdır).
 */
export function pickCfFile(mod: Pick<CfMod, 'files' | 'mainFileId'>, mc: string, type: CfType = 'mod'): number | undefined {
  if (type === 'mod') return best(mod.files.filter((f) => f.gameVersion === mc && f.modLoader === FABRIC))
  if (type === 'modpack') return best(mod.files.filter((f) => f.modLoader === FABRIC))
  return best(mod.files.filter((f) => f.gameVersion === mc)) ?? mod.mainFileId ?? best(mod.files)
}

/** Arama izni olmadığı için arama vitrin içinde yapılır: ad ve açıklamada, büyük/küçük harf ve Türkçe i farkı gözetmeden. */
export function filterCf<T extends { name: string; summary: string }>(mods: T[], query: string): T[] {
  // Türkçe küçültme "Items"ı "ıtems" yapar; ı'yı i'ye çevirince iki yazım da eşleşir
  const low = (s: string) => s.toLocaleLowerCase('tr').replace(/ı/g, 'i')
  const q = low(query.trim())
  if (!q) return mods
  return mods.filter((m) => low(`${m.name} ${m.summary}`).includes(q))
}

/** Aynı mod başka bir yoldan kurulmuş olabilir; ikinci kopya oyunu çökertir. Adı sadeleştirip karşılaştırmak için. */
export const sameName = (a: string, b: string): boolean => {
  const n = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '')
  return n(a) !== '' && n(a) === n(b)
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

export interface CfManifest {
  name: string
  mcVersion: string
  fabricVersion: string
  overrides: string
  files: { projectId: number; fileId: number; required: boolean }[]
}

const MAX_FILES = 5000

/** CurseForge mod paketi manifest.json'unu doğrular. Launcher şimdilik sadece Fabric çalıştırabildiği için Forge paketleri reddedilir. */
export function parseCfManifest(raw: unknown): CfManifest {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  if (r.manifestType !== 'minecraftModpack') throw new Error('Bu mod paketi desteklenmiyor')
  const mc = (r.minecraft && typeof r.minecraft === 'object' ? r.minecraft : {}) as Record<string, unknown>
  if (typeof mc.version !== 'string' || !/^[A-Za-z0-9._-]{1,40}$/.test(mc.version)) throw new Error('Paketin Minecraft sürümü okunamadı')
  const loaders = Array.isArray(mc.modLoaders) ? (mc.modLoaders as Record<string, unknown>[]) : []
  const loader = loaders.find((l) => l && l.primary) ?? loaders[0]
  const m = typeof loader?.id === 'string' ? /^fabric-([A-Za-z0-9._+-]{1,40})$/.exec(loader.id) : null
  if (!m) throw new Error('Bu paket Forge/NeoForge kullanıyor; launcher şimdilik sadece Fabric paketlerini çalıştırabiliyor')
  if (!Array.isArray(r.files) || r.files.length > MAX_FILES) throw new Error('Paket dosya listesi geçersiz')
  const files = (r.files as Record<string, unknown>[]).map((f) => {
    if (!Number.isInteger(f?.projectID) || !Number.isInteger(f?.fileID) || (f.fileID as number) <= 0) throw new Error('Paket dosya listesi geçersiz')
    return { projectId: f.projectID as number, fileId: f.fileID as number, required: f.required !== false }
  })
  const overrides = r.overrides === undefined ? 'overrides' : safeRelPath(r.overrides)
  return { name: typeof r.name === 'string' ? r.name.slice(0, 40) : 'Mod paketi', mcVersion: mc.version, fabricVersion: m[1], overrides, files }
}
