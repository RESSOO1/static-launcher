import { app } from 'electron'
import { join, resolve, sep } from 'path'
import { mkdirSync } from 'fs'

let rootDir = ''

/**
 * Java and LWJGL natives break on non-ASCII paths (common with Turkish Windows user names),
 * so fall back to a plain folder on the system drive in that case.
 */
function pickRoot(): string {
  const preferred = join(app.getPath('appData'), '.staticlauncher')
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(preferred)) return preferred
  return join(process.env.SystemDrive ? process.env.SystemDrive + sep : 'C:' + sep, 'StaticLauncher')
}

export function initPaths(): void {
  rootDir = pickRoot()
  for (const d of [rootDir, gameRoot(), instancesDir(), runtimeDir(), skinsDir(), backupsDir(), logsDir()]) {
    mkdirSync(d, { recursive: true })
  }
}

export const root = (): string => rootDir
export const gameRoot = (): string => join(rootDir, 'game')
export const instancesDir = (): string => join(rootDir, 'instances')
export const instanceDir = (profileId: string): string => join(instancesDir(), profileId)
export const runtimeDir = (): string => join(rootDir, 'runtime')
export const skinsDir = (): string => join(rootDir, 'skins')
export const backupsDir = (): string => join(rootDir, 'backups')
export const logsDir = (): string => join(rootDir, 'logs')
export const dataFile = (name: string): string => join(rootDir, `${name}.json`)

/** True when target resolves inside base (prevents ../ escapes). */
export function isInside(base: string, target: string): boolean {
  const b = resolve(base) + sep
  const t = resolve(target)
  return t === resolve(base) || t.toLowerCase().startsWith(b.toLowerCase())
}
