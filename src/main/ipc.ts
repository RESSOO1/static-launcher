import { app, BrowserWindow, clipboard, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import { join } from 'path'
import { cpus, freemem } from 'os'
import type { ContentType, Result, Settings, SystemInfo } from '@shared/types'
import { settings, sanitizeSettings, totalRamMB } from './data'
import { getConfig, refreshRemoteConfig } from './config'
import * as acc from './accounts'
import * as prof from './profiles'
import * as game from './game/launch'
import { listVersions, fabricLoaders } from './game/versions'
import { ensureJava, ensureVersion } from './game/install'
import * as mr from './modrinth'
import * as srv from './servers'
import * as pack from './modpack'
import * as worlds from './worlds'
import * as upd from './updater'
import { backupsDir, instanceDir, logsDir, root } from './paths'
import { isId, isSafeUrl, oneOf, str, int } from './lib/validate'
import { log, errorMessage } from './log'

const CONTENT: readonly ContentType[] = ['mod', 'resourcepack', 'shader']
const FOLDERS = ['instance', 'mods', 'screenshots', 'saves', 'resourcepacks', 'shaderpacks', 'root', 'logs', 'backups'] as const

let devUrl: string | undefined

/** Only our own page may call the backend; anything else (an injected iframe, a navigated page) is rejected. */
function trusted(e: IpcMainInvokeEvent): boolean {
  const url = e.senderFrame?.url ?? ''
  if (devUrl && url.startsWith(devUrl)) return true
  // navigation away from our bundled page is blocked in index.ts, so any file:// frame is ours
  return url.startsWith('file://')
}

function handle<A extends unknown[], R>(channel: string, fn: (...args: A) => R | Promise<R>): void {
  ipcMain.handle(channel, async (e, ...args): Promise<Result<Awaited<R>>> => {
    if (!trusted(e)) {
      log.warn(`Güvenilmeyen IPC çağrısı reddedildi: ${channel}`)
      return { ok: false, error: 'Yetkisiz istek' }
    }
    try {
      return { ok: true, data: await fn(...(args as A)) }
    } catch (err) {
      log.warn(`IPC ${channel} hata`, err)
      return { ok: false, error: errorMessage(err) }
    }
  })
}

const pid = (v: unknown): string => {
  if (!isId(v)) throw new Error('Geçersiz profil')
  return prof.getProfile(v).id
}

function systemInfo(): SystemInfo {
  return {
    totalRamMB: totalRamMB(),
    freeRamMB: Math.floor(freemem() / 1024 / 1024),
    cpus: cpus().length,
    platform: `${process.platform} ${process.arch}`,
    appVersion: app.getVersion(),
    dataDir: root()
  }
}

export function registerIpc(getWindow: () => BrowserWindow | null, dev?: string): void {
  devUrl = dev

  handle('app:init', () => ({
    settings: settings.get(),
    accounts: acc.listAccounts(),
    profiles: prof.listProfiles(),
    config: getConfig(),
    system: systemInfo(),
    game: game.gameState(),
    update: upd.updateState()
  }))
  handle('config:refresh', async () => {
    const config = await refreshRemoteConfig()
    return { config, profiles: prof.listProfiles() }
  })
  handle('system:info', systemInfo)

  // settings
  handle('settings:set', (patch: unknown): Settings => {
    if (!patch || typeof patch !== 'object') throw new Error('Geçersiz ayar')
    return settings.set(sanitizeSettings({ ...settings.get(), ...(patch as object) }))
  })

  // accounts & skins
  handle('accounts:add', (name: unknown) => acc.addAccount(name))
  handle('accounts:remove', (id: unknown) => acc.removeAccount(id))
  handle('accounts:select', (id: unknown) => acc.selectAccount(id))
  handle('accounts:list', () => acc.listAccounts())
  handle('skin:get', (id: unknown) => acc.getSkinDataUrl(id))
  handle('skin:default', () => acc.getGameDefaultSkin())
  handle('skin:clear', (id: unknown) => acc.clearSkin(id))
  handle('skins:list', (id: unknown) => acc.listSkins(id))
  handle('skins:add', (name: unknown, url: unknown) => acc.addSkinData(name, url))
  handle('skins:remove', (id: unknown) => acc.removeSkin(id))
  handle('skins:apply', (accountId: unknown, id: unknown) => acc.applySkin(accountId, id))
  handle('skins:setSlim', (id: unknown, slim: unknown) => acc.setSkinSlim(id, slim === true))
  handle('skins:fetch', (name: unknown) => acc.fetchSkinByName(name))
  handle('skin:setSlim', (id: unknown, slim: unknown) => acc.setSlim(id, slim === true))
  // save the shown skin (e.g. the Static default) as a PNG the user picks a place for
  handle('skin:export', async (dataUrl: unknown, name: unknown) => {
    const url = str(dataUrl, 200_000)
    const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(url)
    if (!m) throw new Error('Geçersiz skin')
    const buf = Buffer.from(m[1], 'base64')
    if (buf.subarray(1, 4).toString('ascii') !== 'PNG') throw new Error('Geçersiz skin')
    const file = `${typeof name === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(name) ? name : 'static-skin'}.png`
    const w = getWindow()
    const opts = { title: 'Skini kaydet', defaultPath: file, filters: [{ name: 'PNG', extensions: ['png'] }] }
    const res = w ? await dialog.showSaveDialog(w, opts) : await dialog.showSaveDialog(opts)
    if (res.canceled || !res.filePath) return false
    const { writeFile } = await import('fs/promises')
    await writeFile(res.filePath, buf)
    return true
  })

  // profiles
  handle('profiles:list', () => prof.listProfiles())
  handle('profiles:create', (input: unknown) => prof.createProfile(input))
  handle('profiles:update', (id: unknown, input: unknown) => prof.updateProfile(id, input))
  handle('profiles:delete', (id: unknown) => prof.deleteProfile(id))
  handle('profiles:select', (id: unknown) => {
    const p = pid(id)
    return settings.update((s) => ({ ...s, selectedProfileId: p }))
  })

  handle('versions:list', (snapshots: unknown) => listVersions(snapshots === true))
  handle('versions:fabric', () => fabricLoaders())

  // game
  handle('game:play', (id: unknown, address: unknown) => game.play(pid(id), { serverAddress: typeof address === 'string' && address ? str(address, 255) : undefined }))
  handle('game:cancel', () => game.cancelPrepare())
  handle('game:kill', () => game.killGame())
  handle('game:logs', () => game.gameLogs())
  handle('game:repair', async (id: unknown) => {
    const p = prof.getProfile(pid(id))
    const s = settings.get()
    const ctx = { report: () => undefined, signal: new AbortController().signal, concurrency: s.maxDownloads }
    const { resolved } = await ensureVersion(p.mcVersion, p.loader, p.loaderVersion, ctx)
    if (!s.javaPath) await ensureJava(resolved, ctx)
    return true
  })

  // content (mods, resource packs, shaders)
  handle('content:search', (id: unknown, type: unknown, query: unknown, offset: unknown, sort: unknown) =>
    mr.search(typeof query === 'string' ? query : '', oneOf(type, CONTENT), prof.getProfile(pid(id)), int(offset ?? 0, 0, 10000), typeof sort === 'string' ? sort : 'relevance')
  )
  handle('content:install', (id: unknown, projectId: unknown, type: unknown) => mr.installProject(prof.getProfile(pid(id)), str(projectId, 64), oneOf(type, CONTENT)))
  handle('content:list', (id: unknown, type: unknown) => mr.listInstalled(pid(id), oneOf(type, CONTENT)))
  handle('content:toggle', (id: unknown, type: unknown, file: unknown) => mr.toggleContent(pid(id), oneOf(type, CONTENT), file))
  handle('content:remove', (id: unknown, type: unknown, file: unknown) => mr.removeContent(pid(id), oneOf(type, CONTENT), file))

  handle('pack:search', (query: unknown, offset: unknown, sort: unknown) => pack.searchPacks(typeof query === 'string' ? query : '', int(offset ?? 0, 0, 10000), typeof sort === 'string' ? sort : 'relevance'))
  handle('pack:install', (projectId: unknown, title: unknown) => pack.installPack(projectId, title, (p) => getWindow()?.webContents.send('pack:progress', p)))
  handle('pack:cancel', () => pack.cancelPack())

  // servers
  handle('servers:list', () => srv.listServers())
  handle('servers:add', (name: unknown, address: unknown) => srv.addServer(name, address))
  handle('servers:update', (id: unknown, name: unknown, address: unknown) => srv.updateServer(id, name, address))
  handle('servers:remove', (id: unknown) => srv.removeServer(id))
  handle('servers:ping', (address: unknown) => srv.pingServer(address))

  // worlds, backups, screenshots
  handle('worlds:list', (id: unknown) => worlds.listWorlds(pid(id)))
  handle('worlds:backup', (id: unknown, folder: unknown) => worlds.backupWorld(pid(id), folder))
  handle('backups:list', (id: unknown) => worlds.listBackups(pid(id)))
  handle('backups:restore', (id: unknown, file: unknown) => worlds.restoreBackup(pid(id), file))
  handle('backups:delete', (id: unknown, file: unknown) => worlds.deleteBackup(pid(id), file))
  handle('shots:list', (id: unknown) => worlds.listScreenshots(pid(id)))
  handle('shots:delete', (id: unknown, file: unknown) => worlds.deleteScreenshot(pid(id), file))

  // shell helpers
  handle('shell:openFolder', async (kind: unknown, id: unknown) => {
    const k = oneOf(kind, FOLDERS)
    let dir: string
    if (k === 'root') dir = root()
    else if (k === 'logs') dir = logsDir()
    else if (k === 'backups') dir = backupsDir()
    else {
      const base = instanceDir(pid(id))
      dir = k === 'instance' ? base : join(base, k)
    }
    const { mkdir } = await import('fs/promises')
    await mkdir(dir, { recursive: true })
    const err = await shell.openPath(dir)
    if (err) throw new Error(err)
  })
  handle('shell:openExternal', async (url: unknown) => {
    if (!isSafeUrl(url)) throw new Error('Sadece güvenli (https) bağlantılar açılabilir')
    await shell.openExternal(url)
  })
  handle('clipboard:write', (text: unknown) => clipboard.writeText(str(text, 2_000_000)))
  handle('java:choose', async () => {
    const w = getWindow()
    const opts = { title: 'Java seç', filters: [{ name: 'Java', extensions: ['exe'] }], properties: ['openFile' as const] }
    const res = w ? await dialog.showOpenDialog(w, opts) : await dialog.showOpenDialog(opts)
    return res.canceled ? null : res.filePaths[0] ?? null
  })

  // updates
  handle('update:check', () => upd.checkUpdates())
  handle('update:download', () => upd.downloadUpdate())
  handle('update:install', () => upd.installUpdate())

  // window controls
  handle('win:minimize', () => getWindow()?.minimize())
  handle('win:maximize', () => {
    const w = getWindow()
    if (!w) return
    if (w.isMaximized()) w.unmaximize()
    else w.maximize()
  })
  handle('win:close', () => getWindow()?.close())
}
