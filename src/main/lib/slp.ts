// Minecraft Server List Ping (the "status" handshake every client does on the multiplayer screen).
import { Socket } from 'net'
import { promises as dns } from 'dns'

export function writeVarInt(n: number): Buffer {
  const out: number[] = []
  let v = n >>> 0
  do {
    let b = v & 0x7f
    v >>>= 7
    if (v) b |= 0x80
    out.push(b)
  } while (v)
  return Buffer.from(out)
}

/** Returns [value, bytesRead] or null when the buffer does not hold a full VarInt yet. */
export function readVarInt(buf: Buffer, offset = 0): [number, number] | null {
  let value = 0
  for (let i = 0; i < 5; i++) {
    if (offset + i >= buf.length) return null
    const b = buf[offset + i]
    value |= (b & 0x7f) << (7 * i)
    if (!(b & 0x80)) return [value | 0, i + 1]
  }
  throw new Error('VarInt çok uzun')
}

const packet = (id: number, payload: Buffer) => {
  const body = Buffer.concat([writeVarInt(id), payload])
  return Buffer.concat([writeVarInt(body.length), body])
}

export function handshake(host: string, port: number): Buffer {
  const h = Buffer.from(host, 'utf8')
  const p = Buffer.alloc(2)
  p.writeUInt16BE(port)
  return Buffer.concat([packet(0, Buffer.concat([writeVarInt(767), writeVarInt(h.length), h, p, writeVarInt(1)])), packet(0, Buffer.alloc(0))])
}

/** Parse a complete status response frame; null while more bytes are needed. */
export function parseStatus(buf: Buffer): unknown | null {
  const len = readVarInt(buf)
  if (!len) return null
  const [size, a] = len
  if (buf.length < a + size) return null
  const id = readVarInt(buf, a)
  if (!id || id[0] !== 0) throw new Error('Beklenmeyen paket')
  const strLen = readVarInt(buf, a + id[1])
  if (!strLen) throw new Error('Bozuk paket')
  const start = a + id[1] + strLen[1]
  return JSON.parse(buf.subarray(start, start + strLen[0]).toString('utf8'))
}

async function resolveTarget(host: string, port: number, explicitPort: boolean): Promise<{ host: string; port: number }> {
  if (explicitPort || /^[\d.]+$/.test(host) || host.includes(':')) return { host, port }
  try {
    const [srv] = await dns.resolveSrv(`_minecraft._tcp.${host}`)
    if (srv) return { host: srv.name, port: srv.port }
  } catch {
    /* no SRV record, use the plain host */
  }
  return { host, port }
}

export async function queryStatus(host: string, port: number, explicitPort: boolean, timeoutMs = 4000): Promise<{ json: unknown; ping: number }> {
  const target = await resolveTarget(host, port, explicitPort)
  return new Promise((resolve, reject) => {
    const sock = new Socket()
    let buf = Buffer.alloc(0)
    const started = Date.now()
    const done = (err: Error | null, json?: unknown) => {
      sock.destroy()
      if (err) reject(err)
      else resolve({ json, ping: Date.now() - started })
    }
    sock.setTimeout(timeoutMs, () => done(new Error('Zaman aşımı')))
    sock.once('error', (e) => done(e))
    sock.connect(target.port, target.host, () => sock.write(handshake(host, port)))
    sock.on('data', (d: Buffer) => {
      buf = Buffer.concat([buf, d])
      if (buf.length > 512 * 1024) return done(new Error('Yanıt çok büyük'))
      try {
        const json = parseStatus(buf)
        if (json !== null) done(null, json)
      } catch (e) {
        done(e as Error)
      }
    })
  })
}
