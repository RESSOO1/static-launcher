// Pure validation helpers shared by IPC handlers. No Electron imports so they stay unit-testable.
import { basename } from 'path'

export const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/
export const ID_RE = /^[a-z0-9][a-z0-9-]{0,47}$/
const MC_VERSION_RE = /^[A-Za-z0-9._ -]{1,40}$/

export function isUsername(v: unknown): v is string {
  return typeof v === 'string' && USERNAME_RE.test(v)
}

export function isId(v: unknown): v is string {
  return typeof v === 'string' && ID_RE.test(v)
}

export function isMcVersion(v: unknown): v is string {
  return typeof v === 'string' && MC_VERSION_RE.test(v) && !v.includes('..')
}

export function str(v: unknown, max = 500): string {
  if (typeof v !== 'string') throw new Error('Geçersiz metin')
  if (v.length > max) throw new Error('Metin çok uzun')
  return v
}

export function int(v: unknown, min: number, max: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) throw new Error('Geçersiz sayı')
  return Math.min(max, Math.max(min, Math.round(n)))
}

export function bool(v: unknown): boolean {
  if (typeof v !== 'boolean') throw new Error('Geçersiz değer')
  return v
}

export function oneOf<T extends string>(v: unknown, options: readonly T[]): T {
  if (typeof v !== 'string' || !options.includes(v as T)) throw new Error('Geçersiz seçenek')
  return v as T
}

/** Reduce any untrusted name to a plain file name without path separators or traversal. */
export function safeFileName(name: unknown, allowedExt: readonly string[]): string {
  if (typeof name !== 'string' || !name) throw new Error('Geçersiz dosya adı')
  const base = basename(name.replace(/\\/g, '/'))
  if (base !== name || base.startsWith('.') || base.includes('..') || /[<>:"|?*\x00-\x1f]/.test(base)) {
    throw new Error('Geçersiz dosya adı')
  }
  const lower = base.toLowerCase()
  if (!allowedExt.some((e) => lower.endsWith(e))) throw new Error('Desteklenmeyen dosya türü')
  if (base.length > 200) throw new Error('Dosya adı çok uzun')
  return base
}

/** Only https links, optionally restricted to a host list. */
export function isSafeUrl(v: unknown, hosts?: readonly string[]): v is string {
  if (typeof v !== 'string' || v.length > 2048) return false
  try {
    const u = new URL(v)
    if (u.protocol !== 'https:') return false
    if (u.username || u.password) return false
    return !hosts || hosts.some((h) => u.hostname === h || u.hostname.endsWith('.' + h))
  } catch {
    return false
  }
}

export function parseAddress(address: string): { host: string; port: number } {
  const a = address.trim()
  if (!a || a.length > 255) throw new Error('Geçersiz sunucu adresi')
  // IPv6 in brackets: [::1]:25565
  const v6 = /^\[([0-9a-fA-F:]+)\](?::(\d{1,5}))?$/.exec(a)
  if (v6) return { host: v6[1], port: v6[2] ? int(v6[2], 1, 65535) : 25565 }
  const m = /^([A-Za-z0-9.-]+)(?::(\d{1,5}))?$/.exec(a)
  if (!m) throw new Error('Geçersiz sunucu adresi')
  return { host: m[1], port: m[2] ? int(m[2], 1, 65535) : 25565 }
}

/** Split a user supplied JVM argument string, honoring double quotes. */
export function splitArgs(input: string): string[] {
  const out: string[] = []
  const re = /"([^"]*)"|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(input))) out.push(m[1] ?? m[2])
  return out.filter((a) => a.length > 0 && a.length < 1000).slice(0, 100)
}
