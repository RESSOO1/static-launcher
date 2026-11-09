// Dev-only helper: walks every page and saves a screenshot, used to check the UI without clicking around.
// With STATIC_AUTOPLAY=<profileId> it also launches the game end to end and reports what happened.
import type { BrowserWindow } from 'electron'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { gameLogs, gameState, killGame, play } from './game/launch'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function snap(getWin: () => BrowserWindow | null, outDir: string, name: string): Promise<void> {
  const win = getWin()
  if (!win || win.isDestroyed()) return
  const img = await win.webContents.capturePage()
  writeFileSync(join(outDir, `${name.replace(/[^a-z0-9-]/gi, '_')}.png`), img.toPNG())
}

export async function run(getWin: () => BrowserWindow | null, outDir: string): Promise<void> {
  mkdirSync(outDir, { recursive: true })
  const pages = (process.env.STATIC_CAPTURE_PAGES ?? 'home').split(',').filter(Boolean)
  await wait(Number(process.env.STATIC_CAPTURE_DELAY ?? 3500))
  for (const page of pages) {
    getWin()?.webContents.send('dev:goto', page)
    await wait(1500)
    await snap(getWin, outDir, page)
  }

  const auto = process.env.STATIC_AUTOPLAY
  if (auto) {
    getWin()?.webContents.send('dev:goto', 'home')
    const started = Date.now()
    console.log(`[autoplay] ${auto} başlatılıyor`)
    const p = play(auto).then(
      () => console.log(`[autoplay] launch() döndü (${Math.round((Date.now() - started) / 1000)} sn)`),
      (e) => console.log(`[autoplay] HATA: ${e.message}`)
    )
    let shots = 0
    while (gameState().status === 'preparing') {
      await wait(15000)
      if (gameState().status === 'preparing') await snap(getWin, outDir, `progress-${shots++}`)
    }
    await p
    if (gameState().status === 'running') {
      const deadline = Date.now() + Number(process.env.STATIC_AUTOPLAY_SECONDS ?? 60) * 1000
      let ready = false
      while (Date.now() < deadline && gameState().status === 'running') {
        await wait(2000)
        const text = gameLogs().map((l) => l.text).join('\n')
        if (/Sound engine started|OpenAL initialized|Created: \d+x\d+.*atlas|Reloading ResourceManager/i.test(text)) {
          ready = true
          break
        }
      }
      console.log(`[autoplay] oyun ${ready ? 'BAŞARIYLA açıldı' : 'açılış sinyali görülmedi'}; durum=${gameState().status}`)
      await wait(4000)
      writeFileSync(join(outDir, 'game.log'), gameLogs().map((l) => l.text).join('\n'))
      killGame()
      await wait(3000)
    } else {
      writeFileSync(join(outDir, 'game.log'), gameLogs().map((l) => l.text).join('\n'))
      console.log(`[autoplay] oyun çalışmıyor, durum=${gameState().status}`)
    }
  }
  if (process.env.STATIC_CAPTURE_QUIT !== '0') getWin()?.destroy()
}
