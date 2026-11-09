import { createHash } from 'crypto'

/**
 * Same UUID a vanilla server in offline mode assigns: name-based (v3) MD5 of "OfflinePlayer:<name>".
 * Keeping it identical means inventories and permissions survive between launcher and server.
 */
export function offlineUUID(name: string): string {
  const md5 = createHash('md5').update(`OfflinePlayer:${name}`, 'utf8').digest()
  md5[6] = (md5[6] & 0x0f) | 0x30
  md5[8] = (md5[8] & 0x3f) | 0x80
  const h = md5.toString('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
