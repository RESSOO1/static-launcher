import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

// Narrow, explicit surface: the page can only call these channels and listen to these events.
const INVOKE = new Set([
  'app:init', 'config:refresh', 'system:info', 'settings:set',
  'accounts:add', 'accounts:remove', 'accounts:select', 'accounts:list',
  'skin:get', 'skin:default', 'skin:clear', 'skin:setSlim', 'skin:export',
  'skins:list', 'skins:add', 'skins:remove', 'skins:apply', 'skins:setSlim', 'skins:fetch',
  'pack:search', 'pack:install', 'pack:cancel',
  'profiles:list', 'profiles:create', 'profiles:update', 'profiles:delete', 'profiles:select',
  'versions:list', 'versions:fabric',
  'game:play', 'game:cancel', 'game:kill', 'game:logs', 'game:repair',
  'content:search', 'content:install', 'content:list', 'content:toggle', 'content:remove',
  'servers:list', 'servers:add', 'servers:update', 'servers:remove', 'servers:ping',
  'worlds:list', 'worlds:backup', 'backups:list', 'backups:restore', 'backups:delete',
  'shots:list', 'shots:delete',
  'shell:openFolder', 'shell:openExternal', 'clipboard:write', 'java:choose',
  'update:check', 'update:download', 'update:install',
  'win:minimize', 'win:maximize', 'win:close'
])
const EVENTS = new Set(['game:progress', 'game:state', 'game:logs', 'game:crash', 'update:state', 'config:updated', 'win:maximized', 'dev:goto', 'pack:progress'])

const api = {
  invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    if (!INVOKE.has(channel)) return Promise.resolve({ ok: false, error: 'Bilinmeyen işlem' })
    return ipcRenderer.invoke(channel, ...args)
  },
  on(channel: string, cb: (payload: unknown) => void): () => void {
    if (!EVENTS.has(channel)) return () => undefined
    const listener = (_e: IpcRendererEvent, payload: unknown) => cb(payload)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
