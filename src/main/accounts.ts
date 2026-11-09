import { randomUUID } from 'crypto'
import { readFile, writeFile, rm, stat, readdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import AdmZip from 'adm-zip'
import type { Account } from '@shared/types'
import { accounts, settings } from './data'
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

/** Accept only a real PNG skin of 64x64 or 64x32. Reads the IHDR header instead of trusting the extension. */
export async function setSkin(id: unknown, sourcePath: string, slim: boolean): Promise<void> {
  if (!isId(id) || !accounts.get().some((a) => a.id === id)) throw new Error('Hesap bulunamadı')
  const st = await stat(sourcePath)
  if (!st.isFile() || st.size > 1024 * 1024) throw new Error('Skin dosyası çok büyük')
  const buf = await readFile(sourcePath)
  checkSkinPng(buf)
  await writeFile(join(skinsDir(), `${id}.png`), buf)
  accounts.update((l) => l.map((a) => (a.id === id ? { ...a, hasSkin: true, slim } : a)))
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
