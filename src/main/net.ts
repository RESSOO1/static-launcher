import { createWriteStream } from 'fs'
import { rename, rm } from 'fs/promises'
import { createHash } from 'crypto'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { Transform } from 'stream'

export const USER_AGENT = 'StaticLauncher/1.0.0'

interface FetchOpts {
  timeoutMs?: number
  maxBytes?: number
  signal?: AbortSignal
}

function withTimeout(ms: number, outer?: AbortSignal): AbortSignal {
  const signals = [AbortSignal.timeout(ms)]
  if (outer) signals.push(outer)
  return AbortSignal.any(signals)
}

export async function fetchJson<T = unknown>(url: string, opts: FetchOpts = {}): Promise<T> {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: withTimeout(opts.timeoutMs ?? 15000, opts.signal),
    redirect: 'follow'
  })
  if (!res.ok) throw new Error(`Sunucu yanıtı ${res.status}`)
  const text = await res.text()
  if (opts.maxBytes && text.length > opts.maxBytes) throw new Error('Yanıt çok büyük')
  return JSON.parse(text) as T
}

/**
 * Download to a temp file, verify the hash, then move into place.
 * A failed or tampered download never replaces anything on disk.
 */
export async function downloadVerified(
  url: string,
  dest: string,
  expected: { algorithm: 'sha1' | 'sha512'; hash: string },
  opts: FetchOpts = {}
): Promise<void> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: withTimeout(opts.timeoutMs ?? 120000, opts.signal) })
  if (!res.ok || !res.body) throw new Error(`İndirme başarısız (${res.status})`)
  const max = opts.maxBytes ?? 512 * 1024 * 1024
  const hash = createHash(expected.algorithm)
  let size = 0
  const meter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      size += chunk.length
      if (size > max) return cb(new Error('Dosya çok büyük'))
      hash.update(chunk)
      cb(null, chunk)
    }
  })
  const tmp = `${dest}.part`
  try {
    await pipeline(Readable.fromWeb(res.body as import('stream/web').ReadableStream), meter, createWriteStream(tmp))
    if (hash.digest('hex').toLowerCase() !== expected.hash.toLowerCase()) throw new Error('Dosya doğrulaması başarısız (hash uyuşmuyor)')
    await rename(tmp, dest)
  } catch (e) {
    await rm(tmp, { force: true })
    throw e
  }
}
