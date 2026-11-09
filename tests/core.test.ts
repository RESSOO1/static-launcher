import { describe, expect, it } from 'vitest'
import { parseIndex, safeRelPath } from '../src/main/lib/mrpack'
import { offlineUUID } from '../src/main/lib/offline'
import { isSafeUrl, isUsername, parseAddress, safeFileName, splitArgs, isId, isMcVersion } from '../src/main/lib/validate'
import { analyzeCrash } from '../src/main/lib/crash'
import { suggestRam, presetJvmArgs } from '../src/main/lib/performance'
import { handshake, parseStatus, readVarInt, writeVarInt } from '../src/main/lib/slp'

describe('offlineUUID', () => {
  it('matches the UUID an offline-mode server assigns', () => {
    // Known value: UUID.nameUUIDFromBytes("OfflinePlayer:Notch")
    expect(offlineUUID('Notch')).toBe('b50ad385-829d-3141-a216-7e7d7539ba7f')
  })
  it('is version 3 and stable', () => {
    const u = offlineUUID('Steve_TR')
    expect(u[14]).toBe('3')
    expect(offlineUUID('Steve_TR')).toBe(u)
    expect(offlineUUID('steve_tr')).not.toBe(u)
  })
})

describe('validation', () => {
  it('accepts only Minecraft-legal usernames', () => {
    expect(isUsername('Steve_123')).toBe(true)
    expect(isUsername('ab')).toBe(false)
    expect(isUsername('a'.repeat(17))).toBe(false)
    expect(isUsername('Çağrı')).toBe(false)
    expect(isUsername('bad name')).toBe(false)
    expect(isUsername(42)).toBe(false)
  })
  it('rejects path traversal in file names', () => {
    expect(safeFileName('sodium-0.6.jar', ['.jar'])).toBe('sodium-0.6.jar')
    expect(() => safeFileName('../evil.jar', ['.jar'])).toThrow()
    expect(() => safeFileName('..\\evil.jar', ['.jar'])).toThrow()
    expect(() => safeFileName('C:\\Windows\\evil.jar', ['.jar'])).toThrow()
    expect(() => safeFileName('.hidden.jar', ['.jar'])).toThrow()
    expect(() => safeFileName('virus.exe', ['.jar'])).toThrow()
    expect(() => safeFileName('a:b.jar', ['.jar'])).toThrow()
  })
  it('allows only https URLs and optional host list', () => {
    expect(isSafeUrl('https://modrinth.com/x')).toBe(true)
    expect(isSafeUrl('http://modrinth.com/x')).toBe(false)
    expect(isSafeUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeUrl('file:///C:/x')).toBe(false)
    expect(isSafeUrl('https://user:pw@host.com')).toBe(false)
    expect(isSafeUrl('https://cdn.modrinth.com/a', ['cdn.modrinth.com'])).toBe(true)
    expect(isSafeUrl('https://cdn.modrinth.com.evil.io/a', ['cdn.modrinth.com'])).toBe(false)
  })
  it('parses server addresses', () => {
    expect(parseAddress('play.example.com')).toEqual({ host: 'play.example.com', port: 25565 })
    expect(parseAddress('1.2.3.4:25570')).toEqual({ host: '1.2.3.4', port: 25570 })
    expect(parseAddress('[::1]:25566')).toEqual({ host: '::1', port: 25566 })
    expect(() => parseAddress('bad host!')).toThrow()
    expect(() => parseAddress('')).toThrow()
  })
  it('validates ids and versions', () => {
    expect(isId('survival')).toBe(true)
    expect(isId('p-1a2b3c4d')).toBe(true)
    expect(isId('../x')).toBe(false)
    expect(isId('Survival')).toBe(false)
    expect(isMcVersion('1.21.1')).toBe(true)
    expect(isMcVersion('26.4-snapshot-7')).toBe(true)
    expect(isMcVersion('../../etc')).toBe(false)
  })
  it('splits JVM args with quotes', () => {
    expect(splitArgs('-Xss2M "-Dfoo=a b"  -Dx=1')).toEqual(['-Xss2M', '-Dfoo=a b', '-Dx=1'])
    expect(splitArgs('')).toEqual([])
  })
})

describe('crash analysis', () => {
  it('detects common crash causes', () => {
    expect(analyzeCrash(['java.lang.OutOfMemoryError: Java heap space'], 1).title).toBe('Bellek yetersiz')
    expect(analyzeCrash(['UnsupportedClassVersionError: has been compiled by a more recent version of the Java Runtime'], 1).title).toBe('Java sürümü uyumsuz')
    expect(analyzeCrash(['Incompatible mods found!'], 1).title).toBe('Mod uyumsuzluğu')
    expect(analyzeCrash(['something else'], 7).hint).toContain('7')
  })
})

describe('performance', () => {
  it('suggests sane RAM', () => {
    expect(suggestRam(4096)).toBe(2048)
    expect(suggestRam(16384, 'balanced')).toBeGreaterThanOrEqual(4096)
    expect(suggestRam(65536, 'balanced')).toBe(8192)
    expect(suggestRam(65536, 'high')).toBe(12288)
    expect(suggestRam(16384) % 512).toBe(0)
  })
  it('has no JVM flags for custom', () => {
    expect(presetJvmArgs('custom')).toEqual([])
    expect(presetJvmArgs('balanced')).toContain('-XX:+UseG1GC')
  })
})

describe('server list ping', () => {
  it('round-trips VarInts', () => {
    for (const n of [0, 1, 127, 128, 255, 25565, 2097151, 2147483647, -1]) {
      const buf = writeVarInt(n)
      expect(readVarInt(buf)).toEqual([n, buf.length])
    }
    expect(readVarInt(Buffer.from([0x80]))).toBeNull()
  })
  it('builds a handshake and parses a status frame', () => {
    expect(handshake('localhost', 25565)[1]).toBe(0x00)
    const json = Buffer.from(JSON.stringify({ players: { online: 5, max: 100 } }))
    const body = Buffer.concat([writeVarInt(0), writeVarInt(json.length), json])
    const frame = Buffer.concat([writeVarInt(body.length), body])
    expect(parseStatus(frame.subarray(0, 5))).toBeNull()
    expect(parseStatus(frame)).toEqual({ players: { online: 5, max: 100 } })
  })
})

import { LogParser } from '../src/main/lib/logparse'

describe('log4j XML parser', () => {
  const ev = (lvl: string, msg: string) =>
    `<log4j:Event logger="X" timestamp="1793784007427" level="${lvl}" thread="main">\n  <log4j:Message><![CDATA[${msg}]]></log4j:Message>\n</log4j:Event>\n`
  it('turns events into readable lines, even split across chunks', () => {
    const p = new LogParser()
    const full = ev('INFO', 'Loading Minecraft 1.21.1') + 'plain line\n' + ev('ERROR', 'Boom')
    const a = p.push(full.slice(0, 50))
    const b = p.push(full.slice(50))
    const lines = [...a, ...b, ...p.flush()]
    expect(lines.map((l) => l.text.replace(/^\[[\d:]*\] /, ''))).toEqual(['[main/INFO]: Loading Minecraft 1.21.1', 'plain line', '[main/ERROR]: Boom'])
    expect(lines[2].level).toBe('error')
  })
  it('passes legacy plain logs through', () => {
    const p = new LogParser()
    expect(p.push('[12:00:00] [Client thread/WARN]: hi\n')[0]).toEqual({ level: 'warn', text: '[12:00:00] [Client thread/WARN]: hi' })
  })
})

describe('mrpack', () => {
  const hash = 'a'.repeat(128)
  const pack = (over: object = {}, file: object = {}) => ({
    formatVersion: 1,
    game: 'minecraft',
    name: 'Test',
    dependencies: { minecraft: '1.21.1', 'fabric-loader': '0.16.0' },
    files: [{ path: 'mods/a.jar', hashes: { sha512: hash }, downloads: ['https://cdn.modrinth.com/data/a.jar'], ...file }],
    ...over
  })
  it('reads a normal Fabric pack and skips server-only files', () => {
    const r = parseIndex(pack({}, {}))
    expect(r.mcVersion).toBe('1.21.1')
    expect(r.fabricVersion).toBe('0.16.0')
    expect(r.files).toHaveLength(1)
    expect(parseIndex(pack({}, { env: { client: 'unsupported' } })).files).toHaveLength(0)
  })
  it('refuses paths that leave the instance folder', () => {
    for (const p of ['../evil.jar', 'mods/../../evil.jar', '/etc/x', 'C:\\Windows\\x.dll', 'mods\\..\\..\\x', 'a/./b', 'mods/x.', 'a:b']) expect(() => safeRelPath(p)).toThrow()
    expect(safeRelPath('config/sodium\\options.json')).toBe('config/sodium/options.json')
    expect(() => parseIndex(pack({}, { path: '../../evil.jar' }))).toThrow()
  })
  it('refuses unknown hosts, http and missing hashes', () => {
    expect(() => parseIndex(pack({}, { downloads: ['https://evil.example/a.jar'] }))).toThrow()
    expect(() => parseIndex(pack({}, { downloads: ['http://cdn.modrinth.com/a.jar'] }))).toThrow()
    expect(() => parseIndex(pack({}, { hashes: {} }))).toThrow()
  })
  it('refuses non-Fabric packs', () => {
    expect(() => parseIndex(pack({ dependencies: { minecraft: '1.20.1', forge: '47.0' } }))).toThrow()
  })
})
