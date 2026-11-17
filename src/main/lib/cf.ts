// CurseForge vitrin verisi için saf yardımcılar (Electron'suz, birim testli).

export interface CfFileIndex {
  gameVersion: string
  fileId: number
  modLoader: number | null
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
  files: CfFileIndex[]
}

const FABRIC = 4

/** Profilin Minecraft sürümüne uyan en yeni Fabric dosyası (CurseForge listeyi yeniden eskiye verir). */
export function pickCfFile(files: CfFileIndex[], mc: string): number | undefined {
  return files.find((f) => f.gameVersion === mc && f.modLoader === FABRIC)?.fileId
}

/** Arama izni olmadığı için arama vitrin içinde yapılır: ad ve açıklamada, büyük/küçük harf ve Türkçe i farkı gözetmeden. */
export function filterCf(mods: CfMod[], query: string): CfMod[] {
  // Türkçe küçültme "Items"ı "ıtems" yapar; ı'yı i'ye çevirince iki yazım da eşleşir
  const low = (s: string) => s.toLocaleLowerCase('tr').replace(/ı/g, 'i')
  const q = low(query.trim())
  if (!q) return mods
  return mods.filter((m) => low(`${m.name} ${m.summary}`).includes(q))
}

/** Aynı mod Modrinth'ten de kurulmuş olabilir; ikinci kopya oyunu çökertir. Adı sadeleştirip karşılaştırmak için. */
export const sameName = (a: string, b: string): boolean => {
  const n = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '')
  return n(a) !== '' && n(a) === n(b)
}
