import { app, BrowserWindow, Menu, Tray, nativeImage, net, protocol, session, shell } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { pathToFileURL } from 'url'
import { initPaths, instanceDir, isInside, logsDir } from './paths'
import { initLog, log } from './log'
import { initData, flushAll, settings } from './data'
import { registerIpc } from './ipc'
import { bindGameEvents, gameState } from './game/launch'
import { initDiscord, shutdownDiscord } from './discord'
import { checkIfStale, initUpdater } from './updater'
import { loadCachedRemoteConfig, refreshRemoteConfig } from './config'
import { isId, isSafeUrl } from './lib/validate'

const DEV_URL = !app.isPackaged ? process.env['ELECTRON_RENDERER_URL'] : undefined
let win: BrowserWindow | null = null
let tray: Tray | null = null

process.on('uncaughtException', (e) => log.error('Yakalanmamış hata', e))
process.on('unhandledRejection', (e) => log.error('Yakalanmamış promise hatası', e))

// Dev-only: isolate test data from the real launcher folder.
if (!app.isPackaged && process.env.STATIC_DATA_DIR) {
  mkdirSync(process.env.STATIC_DATA_DIR, { recursive: true })
  app.setPath('appData', process.env.STATIC_DATA_DIR)
}

protocol.registerSchemesAsPrivileged([{ scheme: 'static-file', privileges: { standard: true, secure: true, supportFetchAPI: true } }])

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    showWindow()
    void checkIfStale(10_000) // the player clicked the shortcut again: give them a fresh answer
  })
  app.whenReady().then(start).catch((e) => log.error('Başlatma hatası', e))
}

const iconPath = (): string => (app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(app.getAppPath(), 'resources', 'icon.png'))

function showWindow(): void {
  if (!win) return createWindow() // window was closed while the game kept running
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function send(channel: string, payload: unknown): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1240,
    height: 760,
    minWidth: 1040,
    minHeight: 640,
    frame: false,
    // transparent so the page can draw rounded corners (Windows 10 does not round frameless windows)
    transparent: true,
    backgroundColor: '#00000000',
    show: false,
    title: 'Static Launcher',
    icon: iconPath(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      devTools: !app.isPackaged,
      backgroundThrottling: false
    }
  })

  win.once('ready-to-show', () => win?.show())
  win.on('maximize', () => send('win:maximized', true))
  win.on('unmaximize', () => send('win:maximized', false))
  win.webContents.on('did-finish-load', () => send('win:maximized', win?.isMaximized() ?? false))
  win.on('closed', () => (win = null))
  // coming back to the launcher (e.g. after playing) re-checks for updates at most every 2 minutes
  win.on('focus', () => void checkIfStale(2 * 60 * 1000))

  const wc = win.webContents
  // External links open in the user's browser; the app window never navigates away.
  wc.setWindowOpenHandler(({ url }) => {
    if (isSafeUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  wc.on('will-navigate', (e, url) => {
    if (DEV_URL && url.startsWith(DEV_URL)) return
    e.preventDefault()
  })
  // Reload a crashed UI, but at most 3 times a minute: when memory is exhausted an instant
  // reload just crashes again and spins in a loop.
  const crashes: number[] = []
  wc.on('render-process-gone', (_e, d) => {
    log.error(`Arayüz süreci kapandı: ${d.reason}`)
    if (d.reason === 'clean-exit') return
    const now = Date.now()
    while (crashes.length && now - crashes[0] > 60_000) crashes.shift()
    crashes.push(now)
    if (crashes.length <= 3) setTimeout(() => !wc.isDestroyed() && wc.reload(), 1500 * crashes.length)
    else log.error('Arayüz tekrar tekrar çöktü; yeniden yükleme durduruldu (bellek yetersiz olabilir)')
  })

  if (DEV_URL) void win.loadURL(DEV_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

function createTray(): void {
  try {
    const img = nativeImage.createFromPath(iconPath()).resize({ width: 16, height: 16 })
    tray = new Tray(img)
    tray.setToolTip('Static Launcher')
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Launcher’ı göster', click: showWindow },
        { type: 'separator' },
        { label: 'Çıkış', click: () => app.quit() }
      ])
    )
    tray.on('click', showWindow)
  } catch (e) {
    log.warn('Tepsi simgesi oluşturulamadı', e)
  }
}

async function start(): Promise<void> {
  app.setAppUserModelId('com.static.launcher')
  initPaths()
  initLog(logsDir())
  initData()
  loadCachedRemoteConfig()
  log.info(`Static Launcher ${app.getVersion()} başlıyor`)

  // The renderer never needs camera, mic, notifications etc.
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false))
  session.defaultSession.setPermissionCheckHandler(() => false)

  // static-file://shot/<profileId>/<file> serves screenshots only, nothing else on disk.
  protocol.handle('static-file', (req) => {
    try {
      const u = new URL(req.url)
      const [, profileId, file] = u.pathname.split('/').map(decodeURIComponent)
      if (u.host !== 'shot' || !isId(profileId) || !file || !/^[^/\\]+\.(png|jpe?g)$/i.test(file)) return new Response('', { status: 404 })
      const dir = join(instanceDir(profileId), 'screenshots')
      const p = join(dir, file)
      if (!isInside(dir, p)) return new Response('', { status: 403 })
      return net.fetch(pathToFileURL(p).toString())
    } catch {
      return new Response('', { status: 400 })
    }
  })

  registerIpc(() => win, DEV_URL)
  bindGameEvents({
    progress: (p) => send('game:progress', p),
    state: (s) => send('game:state', s),
    logs: (l) => send('game:logs', l),
    crash: (c) => send('game:crash', c),
    windowHide: () => {
      const mode = settings.get().closeBehavior
      if (mode === 'hide') win?.hide()
      else if (mode === 'minimize') win?.minimize()
    },
    // if the user closed the launcher while playing, quit once the game exits instead of popping it back up
    windowRestore: () => (win ? showWindow() : app.quit())
  })

  createWindow()
  createTray()
  initUpdater((s) => {
    send('update:state', s)
    // blink the taskbar button so an update is noticed even when the launcher is in the background
    if (s.state === 'available' && win && !win.isDestroyed() && !win.isFocused()) win.flashFrame(true)
  })
  initDiscord()
  void refreshRemoteConfig().then((c) => send('config:updated', c)).catch(() => undefined)
  if (!app.isPackaged && process.env.STATIC_CAPTURE) void import('./devcapture').then((m) => m.run(() => win, process.env.STATIC_CAPTURE!))
}


app.on('web-contents-created', (_e, contents) => {
  contents.on('will-attach-webview', (e) => e.preventDefault())
})

app.on('window-all-closed', () => {
  // keep running while the game is open so play time and crash reports are still tracked
  if (gameState().status === 'running') return
  app.quit()
})

app.on('before-quit', () => {
  flushAll()
  shutdownDiscord()
  tray?.destroy()
})
