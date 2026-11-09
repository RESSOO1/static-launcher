import { Client } from '@xhayper/discord-rpc'
import { settings } from './data'
import { getConfig } from './config'
import { log } from './log'

let client: Client | null = null
let ready = false

/** Rich Presence is optional: without a client id in launcher.config.json this module does nothing. */
export function initDiscord(): void {
  const id = getConfig().discordClientId
  if (!id || !settings.get().discordRpc) return
  try {
    client = new Client({ clientId: id })
    client.on('ready', () => {
      ready = true
      discordIdle()
    })
    client.login().catch(() => {
      client = null // Discord not running; stay silent
    })
  } catch (e) {
    log.warn('Discord RPC başlatılamadı', e)
    client = null
  }
}

function set(details: string, state: string, start?: number): void {
  if (!client || !ready || !settings.get().discordRpc) return
  client.user
    ?.setActivity({ details, state, startTimestamp: start, largeImageKey: 'logo', largeImageText: `${getConfig().name} Launcher` })
    .catch(() => undefined)
}

export const discordIdle = (): void => set('Launcher’da', 'Menüde geziniyor')
export const discordGameStarted = (mode: string, start: number): void => set(`${mode} oynuyor`, `${getConfig().name} Launcher`, start)

export function shutdownDiscord(): void {
  client?.destroy().catch(() => undefined)
  client = null
}
