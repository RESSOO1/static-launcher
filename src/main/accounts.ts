import { createHash, randomUUID } from 'crypto'
import { readFile, writeFile, rm, readdir, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import AdmZip from 'adm-zip'
import type { Account, SkinItem, SkinMeta } from '@shared/types'
import { accounts, settings, skinLibrary } from './data'
import { fetchJson, USER_AGENT } from './net'
import { offlineUUID } from './lib/offline'
import { isUsername, isId } from './lib/validate'
import { gameRoot, skinsDir } from './paths'
import { log } from './log'

/** A real PNG skin of 64x64 or 64x32, judged by its header rather than the file name. */
function checkSkinPng(buf: Buffer): void {
  if (buf.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || buf.subarray(12, 16).toString('ascii') !== 'IHDR') throw new Error('Dosya geçerli bir PNG değil')
  const w = buf.readUInt32BE(16)
  const h = buf.readUInt32BE(20)
  if (w !== 64 || (h !== 64 && h !== 32)) throw new Error('Skin 64x64 ya da 64x32 piksel olmalı')
}

/**
 * Steve, read from a Minecraft client jar the launcher already downloaded to this PC.
 * Mojang's texture is never bundled with the launcher; null until a version has been installed.
 */
export async function getGameDefaultSkin(): Promise<string | null> {
  const cache = join(skinsDir(), '_steve.png')
  try {
    if (existsSync(cache)) return `data:image/png;base64,${(await readFile(cache)).toString('base64')}`
    const versions = join(gameRoot(), 'versions')
    if (!existsSync(versions)) return null
    for (const id of await readdir(versions)) {
      const jar = join(versions, id, `${id}.jar`)
      if (!existsSync(jar)) continue
      const zip = new AdmZip(jar)
      // 1.19.3+ keeps it under player/wide, older versions directly under entity
      const entry = zip.getEntry('assets/minecraft/textures/entity/player/wide/steve.png') ?? zip.getEntry('assets/minecraft/textures/entity/steve.png')
      if (!entry) continue
      const buf = entry.getData()
      checkSkinPng(buf)
      await writeFile(cache, buf)
      return `data:image/png;base64,${buf.toString('base64')}`
    }
  } catch (e) {
    log.warn('Varsayılan skin oyun dosyasından okunamadı', e)
  }
  return null
}

export function listAccounts(): Account[] {
  return accounts.get()
}

export function addAccount(name: unknown): Account {
  if (!isUsername(name)) throw new Error('Kullanıcı adı 3-16 karakter olmalı; sadece harf, rakam ve alt çizgi kullanılabilir.')
  const existing = accounts.get().find((a) => a.name.toLowerCase() === name.toLowerCase())
  if (existing) {
    settings.update((s) => ({ ...s, selectedAccountId: existing.id }))
    return existing
  }
  if (accounts.get().length >= 50) throw new Error('En fazla 50 hesap eklenebilir.')
  const acc: Account = { id: randomUUID().slice(0, 12), name, uuid: offlineUUID(name), createdAt: Date.now(), hasSkin: false, slim: false }
  accounts.update((l) => [...l, acc])
  settings.update((s) => ({ ...s, selectedAccountId: acc.id }))
  return acc
}

export async function removeAccount(id: unknown): Promise<void> {
  if (!isId(id)) throw new Error('Geçersiz hesap')
  accounts.update((l) => l.filter((a) => a.id !== id))
  await rm(join(skinsDir(), `${id}.png`), { force: true })
  const s = settings.get()
  if (s.selectedAccountId === id) settings.set({ ...s, selectedAccountId: accounts.get()[0]?.id ?? '' })
}

export function selectAccount(id: unknown): void {
  if (!isId(id) || !accounts.get().some((a) => a.id === id)) throw new Error('Hesap bulunamadı')
  settings.update((s) => ({ ...s, selectedAccountId: id }))
}

export function currentAccount(): Account | undefined {
  const s = settings.get()
  const list = accounts.get()
  return list.find((a) => a.id === s.selectedAccountId) ?? list[0]
}

export function setSlim(id: unknown, slim: boolean): void {
  if (!isId(id)) throw new Error('Geçersiz hesap')
  accounts.update((l) => l.map((a) => (a.id === id ? { ...a, slim } : a)))
}

export async function clearSkin(id: unknown): Promise<void> {
  if (!isId(id)) throw new Error('Geçersiz hesap')
  await rm(join(skinsDir(), `${id}.png`), { force: true })
  accounts.update((l) => l.map((a) => (a.id === id ? { ...a, hasSkin: false } : a)))
}

export async function getSkinDataUrl(id: unknown): Promise<string | null> {
  if (!isId(id)) return null
  try {
    const buf = await readFile(join(skinsDir(), `${id}.png`))
    return `data:image/png;base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

// ---------- skin library: every skin the player has, shared by all their names ----------
const MAX_SKIN_BYTES = 1024 * 1024
const libDir = (): string => join(skinsDir(), 'library')
const skinId = (buf: Buffer): string => createHash('sha1').update(buf).digest('hex').slice(0, 16)
const dataUrl = (buf: Buffer): string => `data:image/png;base64,${buf.toString('base64')}`

async function addToLibrary(buf: Buffer, name: string, slim: boolean): Promise<SkinItem> {
  if (buf.length > MAX_SKIN_BYTES) throw new Error('Skin dosyası çok büyük')
  checkSkinPng(buf)
  const id = skinId(buf)
  await mkdir(libDir(), { recursive: true })
  await writeFile(join(libDir(), `${id}.png`), buf)
  const known = skinLibrary.get().find((s) => s.id === id)
  if (known) return { ...known, url: dataUrl(buf) }
  if (skinLibrary.get().length >= 200) throw new Error('En fazla 200 skin saklanabilir')
  const meta: SkinMeta = { id, name: name.slice(0, 40).trim() || 'Skin', slim, addedAt: Date.now() }
  skinLibrary.update((l) => [...l, meta])
  return { ...meta, url: dataUrl(buf) }
}

/** The library plus which item the account is wearing; a skin uploaded before the library existed is adopted into it. */
export async function listSkins(accountId: unknown): Promise<{ items: SkinItem[]; currentId: string }> {
  if (!isId(accountId)) throw new Error('Geçersiz hesap')
  const account = accounts.get().find((a) => a.id === accountId)
  let currentId = 'default'
  if (account?.hasSkin) {
    try {
      const worn = await readFile(join(skinsDir(), `${accountId}.png`))
      currentId = (await addToLibrary(worn, account.name, account.slim)).id
    } catch (e) {
      log.warn('Giyili skin okunamadı', e)
    }
  }
  const items: SkinItem[] = []
  for (const m of skinLibrary.get()) {
    try {
      items.push({ ...m, url: dataUrl(await readFile(join(libDir(), `${m.id}.png`))) })
    } catch {
      /* file removed by hand: leave it out */
    }
  }
  return { items, currentId }
}

export function addSkinData(name: unknown, url: unknown): Promise<SkinItem> {
  const m = typeof url === 'string' && url.length < 2 * MAX_SKIN_BYTES ? /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(url) : null
  if (!m) throw new Error('Dosya geçerli bir PNG değil')
  return addToLibrary(Buffer.from(m[1], 'base64'), typeof name === 'string' ? name : 'Skin', false)
}

export async function removeSkin(id: unknown): Promise<void> {
  if (!isId(id)) throw new Error('Geçersiz skin')
  skinLibrary.update((l) => l.filter((s) => s.id !== id))
  await rm(join(libDir(), `${id}.png`), { force: true })
}

/** Wear a library skin, or 'default' to go back to Steve. Slim follows the skin unless the player changes it. */
export async function applySkin(accountId: unknown, id: unknown): Promise<void> {
  if (!isId(accountId) || !accounts.get().some((a) => a.id === accountId)) throw new Error('Hesap bulunamadı')
  if (id === 'default') return clearSkin(accountId)
  const meta = skinLibrary.get().find((s) => s.id === id)
  if (!meta) throw new Error('Skin bulunamadı')
  await writeFile(join(skinsDir(), `${accountId}.png`), await readFile(join(libDir(), `${meta.id}.png`)))
  accounts.update((l) => l.map((a) => (a.id === accountId ? { ...a, hasSkin: true, slim: meta.slim } : a)))
}

/** Remember the arm model on the library skin too, so it comes back the same way next time it is worn. */
export function setSkinSlim(id: unknown, slim: boolean): void {
  if (!isId(id)) return
  skinLibrary.update((l) => l.map((s) => (s.id === id ? { ...s, slim } : s)))
}

/** Copy the public skin of a premium Minecraft account into the library. Only Mojang's own hosts are contacted. */
export async function fetchSkinByName(name: unknown): Promise<SkinItem> {
  if (!isUsername(name)) throw new Error('Geçerli bir oyuncu adı yaz')
  let id: string
  try {
    id = (await fetchJson<{ id: string }>(`https://api.mojang.com/users/profiles/minecraft/${name}`, { timeoutMs: 10000 })).id
  } catch {
    throw new Error('Bu isimde premium hesap bulunamadı')
  }
  if (!/^[a-f0-9]{32}$/.test(id)) throw new Error('Bu isimde premium hesap bulunamadı')
  const profile = await fetchJson<{ properties?: { name: string; value: string }[] }>(`https://sessionserver.mojang.com/session/minecraft/profile/${id}`, { timeoutMs: 10000 })
  const prop = profile.properties?.find((p) => p.name === 'textures')
  if (!prop) throw new Error('Bu hesabın skini yok')
  const tex = JSON.parse(Buffer.from(prop.value, 'base64').toString('utf8')) as { textures?: { SKIN?: { url?: string; metadata?: { model?: string } } } }
  const skin = tex.textures?.SKIN
  if (!skin?.url) throw new Error('Bu hesabın skini yok')
  const url = new URL(skin.url)
  if (url.hostname !== 'textures.minecraft.net') throw new Error('Güvenilmeyen skin adresi')
  url.protocol = 'https:'
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error('Skin indirilemedi')
  return addToLibrary(Buffer.from(await res.arrayBuffer()), name, skin.metadata?.model === 'slim')
}
