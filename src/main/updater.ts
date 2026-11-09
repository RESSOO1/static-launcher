import { app } from 'electron'
import electronUpdater from 'electron-updater'
import type { UpdateState } from '@shared/types'
import { getConfig } from './config'
import { log, errorMessage } from './log'

let state: UpdateState = { state: 'idle' }
let notify: (s: UpdateState) => void = () => undefined
let enabled = false
let lastCheck = 0
let inflight: Promise<void> | null = null

function set(s: UpdateState): void {
  state = s
  notify(s)
}

export const updateState = (): UpdateState => state

/** Self-update from a generic HTTPS feed (updateUrl in launcher.config.json). Inactive in dev builds. */
export function initUpdater(onChange: (s: UpdateState) => void): void {
  notify = onChange
  // dev-only: preview the update dialog without publishing anything
  if (!app.isPackaged && process.env.STATIC_FAKE_UPDATE) {
    setTimeout(() => set({ state: 'available', version: process.env.STATIC_FAKE_UPDATE!, notes: 'Deneme güncellemesi' }), 3000)
    return
  }
  const url = getConfig().updateUrl
  if (!app.isPackaged || !url) return
  enabled = true
  const { autoUpdater } = electronUpdater
  autoUpdater.autoDownload = false
  autoUpdater.allowDowngrade = false
  autoUpdater.setFeedURL({ provider: 'generic', url })
  autoUpdater.on('update-available', (i) => {
    log.info(`Güncelleme bulundu: ${i.version}`)
    set({ state: 'available', version: i.version, notes: plainNotes(i.releaseNotes) })
  })
  autoUpdater.on('update-not-available', () => set({ state: 'none' }))
  autoUpdater.on('download-progress', (p) => set({ state: 'downloading', percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', (i) => {
    log.info(`Güncelleme indirildi: ${i.version}`)
    set({ state: 'ready', version: i.version })
  })
  autoUpdater.on('error', (e) => {
    log.warn('Güncelleme hatası', e)
    fail(e)
  })
  // check right away, then every 15 minutes while the launcher stays open
  void checkUpdates()
  setInterval(() => void checkIfStale(15 * 60 * 1000), 15 * 60 * 1000)
}

/** Only states where a new check cannot disturb a download or a ready-to-install update. */
const idle = () => state.state === 'idle' || state.state === 'none' || state.state === 'error'

/** Called when the window comes back to the front: re-check if the last look is older than maxAgeMs. */
export async function checkIfStale(maxAgeMs: number): Promise<void> {
  if (enabled && idle() && Date.now() - lastCheck > maxAgeMs) await checkUpdates()
}

export async function checkUpdates(): Promise<void> {
  if (!enabled) {
    set({ state: 'none' })
    return
  }
  if (!idle() && state.state !== 'available') return
  if (inflight) return inflight
  lastCheck = Date.now()
  // a quiet background re-check keeps showing the current result instead of flashing "checking"
  if (idle()) set({ state: 'checking' })
  inflight = electronUpdater.autoUpdater
    .checkForUpdates()
    .then(() => undefined)
    .catch(fail)
    .finally(() => {
      inflight = null
    })
  return inflight
}

/** latest.yml may carry release notes as text, HTML or a list; reduce to short plain text. */
function plainNotes(n: unknown): string | undefined {
  const raw = Array.isArray(n) ? n.map((x) => (x && typeof x === 'object' && 'note' in x ? String(x.note ?? '') : '')).join('\n') : typeof n === 'string' ? n : ''
  const text = raw.replace(/<[^>]*>/g, ' ').replace(/[ \t]+/g, ' ').trim().slice(0, 1500)
  return text || undefined
}

/** No latest.yml on the server yet simply means "no update", not an error worth showing. */
function fail(e: unknown): void {
  const msg = errorMessage(e)
  if (/\b404\b|Cannot find latest\.yml|ERR_UPDATER_CHANNEL_FILE_NOT_FOUND/i.test(msg)) set({ state: 'none' })
  else set({ state: 'error', message: 'Güncelleme sunucusuna ulaşılamadı' })
}

export async function downloadUpdate(): Promise<void> {
  if (state.state !== 'available') return
  await electronUpdater.autoUpdater.downloadUpdate()
}

export function installUpdate(): void {
  // silent install, then start the new version automatically
  if (state.state === 'ready') electronUpdater.autoUpdater.quitAndInstall(true, true)
}
