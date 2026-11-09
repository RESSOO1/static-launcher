import { appendFileSync, statSync, renameSync, existsSync } from 'fs'
import { join } from 'path'

let file = ''

export function initLog(dir: string): void {
  file = join(dir, 'launcher.log')
  try {
    // keep one previous log, cap size at ~2 MB
    if (existsSync(file) && statSync(file).size > 2 * 1024 * 1024) renameSync(file, join(dir, 'launcher.old.log'))
  } catch {
    /* ignore */
  }
}

function write(level: string, msg: string, err?: unknown): void {
  const detail = err instanceof Error ? ` ${err.stack ?? err.message}` : err !== undefined ? ` ${String(err)}` : ''
  const line = `[${new Date().toISOString()}] [${level}] ${msg}${detail}\n`
  if (level === 'ERROR') console.error(line.trim())
  else console.log(line.trim())
  if (!file) return
  try {
    appendFileSync(file, line, 'utf8')
  } catch {
    /* never crash because of logging */
  }
}

export const log = {
  info: (m: string, e?: unknown) => write('INFO', m, e),
  warn: (m: string, e?: unknown) => write('WARN', m, e),
  error: (m: string, e?: unknown) => write('ERROR', m, e)
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  return 'Bilinmeyen hata'
}
