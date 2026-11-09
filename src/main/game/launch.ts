import { existsSync, statSync } from 'fs'
import { mkdir } from 'fs/promises'
import { randomBytes } from 'crypto'
import { basename } from 'path'
import { createMinecraftProcessWatcher, launch, type LaunchOption } from '@xmcl/core'
import type { ChildProcess } from 'child_process'
import type { CrashInfo, GameState, LogLine, ProgressInfo } from '@shared/types'
import { currentAccount } from '../accounts'
import { settings } from '../data'
import { getProfile, recordPlay } from '../profiles'
import { ensureJava, ensureVersion } from './install'
import { ensureModeMods } from '../modrinth'
import { gameRoot, instanceDir } from '../paths'
import { presetJvmArgs } from '../lib/performance'
import { parseAddress, splitArgs } from '../lib/validate'
import { analyzeCrash } from '../lib/crash'
import { LogParser, type ParsedLine } from '../lib/logparse'
import { log, errorMessage } from '../log'
import { discordGameStarted, discordIdle } from '../discord'

export interface GameEvents {
  progress(p: ProgressInfo): void
  state(s: GameState): void
  logs(lines: LogLine[]): void
  crash(c: CrashInfo): void
  windowHide(): void
  windowRestore(): void
}

let events: GameEvents | null = null
let state: GameState = { status: 'idle' }
let proc: ChildProcess | null = null
let abort: AbortController | null = null
const logBuffer: LogLine[] = []
let pending: LogLine[] = []
let flushTimer: NodeJS.Timeout | null = null

export const bindGameEvents = (e: GameEvents): void => {
  events = e
}
export const gameState = (): GameState => state
export const gameLogs = (): LogLine[] => logBuffer.slice()

function setState(s: GameState): void {
  state = s
  events?.state(s)
}

function pushLines(lines: ParsedLine[], forceError = false): void {
  for (const p of lines) {
    const line: LogLine = { t: Date.now(), level: forceError && p.level === 'info' ? 'warn' : p.level, text: p.text.slice(0, 4000) }
    logBuffer.push(line)
    pending.push(line)
  }
  if (logBuffer.length > 5000) logBuffer.splice(0, logBuffer.length - 5000)
  if (!flushTimer)
    flushTimer = setTimeout(() => {
      flushTimer = null
      const batch = pending
      pending = []
      events?.logs(batch)
    }, 120)
}

/** Validate a user supplied Java path: must be an existing java(w) executable. */
function customJava(p: string): string | null {
  if (!p) return null
  const name = basename(p).toLowerCase()
  if (!['java.exe', 'javaw.exe', 'java'].includes(name)) throw new Error('Java yolu java.exe ya da javaw.exe dosyasını göstermeli')
  if (!existsSync(p) || !statSync(p).isFile()) throw new Error('Seçilen Java bulunamadı')
  return p
}

export function cancelPrepare(): void {
  abort?.abort()
}

export function killGame(): void {
  if (proc && !proc.killed) proc.kill()
}

export async function play(profileId: string, opts: { serverAddress?: string } = {}): Promise<void> {
  if (state.status !== 'idle') throw new Error('Oyun zaten çalışıyor ya da hazırlanıyor')
  const profile = getProfile(profileId)
  const account = currentAccount()
  if (!account) throw new Error('Önce bir oyuncu adı ekle')
  const s = settings.get()

  abort = new AbortController()
  const signal = abort.signal
  setState({ status: 'preparing', profileId })
  logBuffer.length = 0
  const report = (phase: ProgressInfo['phase'], label: string, progress: number, detail?: string) =>
    events?.progress({ profileId, phase, label, progress, detail })

  try {
    const ctx = { report, signal, concurrency: s.maxDownloads }
    const { versionId, resolved, releaseTime } = await ensureVersion(profile.mcVersion, profile.loader, profile.loaderVersion, ctx)
    const javaPath = customJava(s.javaPath) ?? (await ensureJava(resolved, ctx))

    const gameDir = instanceDir(profile.id)
    await mkdir(gameDir, { recursive: true })
    if (profile.managed && profile.mods?.length) {
      await ensureModeMods(profile, (title, i, n) => report('mods', 'Modlar hazırlanıyor', i / n, title))
    }
    if (signal.aborted) throw new Error('İptal edildi')

    report('launch', 'Oyun başlatılıyor', -1)
    const ram = profile.ramMB ?? s.ramMB
    const address = opts.serverAddress ?? profile.serverAddress
    const option: LaunchOption = {
      gamePath: gameDir,
      resourcePath: gameRoot(),
      javaPath,
      version: resolved,
      gameProfile: { name: account.name, id: account.uuid.replace(/-/g, '') },
      accessToken: randomBytes(16).toString('hex'),
      userType: 'legacy',
      properties: {},
      launcherName: 'StaticLauncher',
      launcherBrand: 'StaticLauncher',
      versionName: versionId,
      versionType: 'Static',
      minMemory: Math.min(1024, ram),
      maxMemory: ram,
      resolution: { width: s.width, height: s.height, fullscreen: s.fullscreen },
      extraJVMArgs: [...presetJvmArgs(s.performance), ...splitArgs(s.jvmArgs)],
      extraExecOption: { detached: false, windowsHide: false }
    }
    if (address) {
      const { host, port } = parseAddress(address)
      // 1.20+ dropped --server; Quick Play replaced it.
      if (releaseTime >= '2023-06-01') option.quickPlayMultiplayer = `${host}:${port}`
      else option.server = { ip: host, port }
    }

    const child = await launch(option)
    proc = child
    const startedAt = Date.now()
    setState({ status: 'running', profileId, startedAt })
    discordGameStarted(profile.name, startedAt)
    const out = new LogParser()
    const err = new LogParser()
    child.stdout?.on('data', (d: Buffer) => pushLines(out.push(d.toString('utf8'))))
    child.stderr?.on('data', (d: Buffer) => pushLines(err.push(d.toString('utf8')), true))
    child.once('exit', () => pushLines([...out.flush(), ...err.flush()]))

    const watcher = createMinecraftProcessWatcher(child)
    watcher.on('minecraft-window-ready', () => {
      if (settings.get().closeBehavior !== 'keep') events?.windowHide()
    })
    watcher.on('error', (e) => log.error('Oyun süreci hatası', e))
    watcher.on('minecraft-exit', ({ code, crashReport }) => {
      proc = null
      recordPlay(profile.id, Math.round((Date.now() - startedAt) / 1000))
      setState({ status: 'idle' })
      discordIdle()
      events?.windowRestore()
      if (code !== 0 && code !== null) {
        const tail = logBuffer.slice(-300).map((l) => l.text)
        if (crashReport) tail.push(crashReport)
        const hint = analyzeCrash(tail, code)
        events?.crash({ profileId: profile.id, exitCode: code, ...hint })
      }
      log.info(`Oyun kapandı (kod ${code})`)
    })
  } catch (e) {
    setState({ status: 'idle' })
    if (signal.aborted) throw new Error('İşlem iptal edildi')
    log.error('Oyun başlatılamadı', e)
    throw new Error(errorMessage(e))
  } finally {
    abort = null
  }
}
