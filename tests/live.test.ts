import { describe, expect, it } from 'vitest'
import { queryStatus } from '../src/main/lib/slp'

// Network test: run with LIVE=1 npx vitest run tests/live.test.ts
describe.runIf(process.env.LIVE === '1')('live server ping', () => {
  it('reads status from a public server (SRV + plain host)', async () => {
    const r = await queryStatus('mc.hypixel.net', 25565, false, 6000)
    const json = r.json as { players?: { online?: number } }
    expect(typeof json.players?.online).toBe('number')
    expect(r.ping).toBeGreaterThan(0)
  }, 15000)
})
