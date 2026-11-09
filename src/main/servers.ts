import { randomUUID } from 'crypto'
import { queryStatus } from './lib/slp'
import type { ServerDef, ServerStatus } from '@shared/types'
import { userServers } from './data'
import { getConfig } from './config'
import { parseAddress, str } from './lib/validate'

const cache = new Map<string, { at: number; status: ServerStatus }>()

function motdText(desc: unknown): string {
  if (typeof desc === 'string') return desc
  if (!desc || typeof desc !== 'object') return ''
  const d = desc as { text?: string; extra?: unknown[] }
  return (d.text ?? '') + (Array.isArray(d.extra) ? d.extra.map(motdText).join('') : '')
}

export async function pingServer(address: unknown): Promise<ServerStatus> {
  const raw = str(address, 255)
  const { host, port } = parseAddress(raw)
  const key = `${host}:${port}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < 15000) return hit.status
  let status: ServerStatus
  try {
    const { json, ping } = await queryStatus(host, port, /:\d+$/.test(raw.trim()))
    const res = (json && typeof json === 'object' ? json : {}) as {
      players?: { online?: number; max?: number }
      version?: { name?: string }
      description?: unknown
      favicon?: unknown
    }
    status = {
      online: true,
      players: typeof res.players?.online === 'number' ? res.players.online : undefined,
      max: typeof res.players?.max === 'number' ? res.players.max : undefined,
      ping,
      motd: motdText(res.description).replace(/§./g, '').slice(0, 200),
      version: typeof res.version?.name === 'string' ? res.version.name.slice(0, 40) : undefined,
      favicon: typeof res.favicon === 'string' && res.favicon.startsWith('data:image/png;base64,') && res.favicon.length < 64 * 1024 ? res.favicon : undefined
    }
  } catch {
    status = { online: false }
  }
  cache.set(key, { at: Date.now(), status })
  return status
}

export function listServers(): ServerDef[] {
  return [...getConfig().servers.map((s) => ({ ...s, featured: true })), ...userServers.get()]
}

export function addServer(name: unknown, address: unknown): ServerDef {
  const n = str(name, 40).trim() || 'Sunucu'
  const a = str(address, 255).trim()
  parseAddress(a)
  if (userServers.get().length >= 100) throw new Error('Çok fazla sunucu var')
  const s: ServerDef = { id: `s-${randomUUID().slice(0, 8)}`, name: n, address: a }
  userServers.update((l) => [...l, s])
  return s
}

export function removeServer(id: unknown): void {
  const i = str(id, 50)
  userServers.update((l) => l.filter((s) => s.id !== i))
}
