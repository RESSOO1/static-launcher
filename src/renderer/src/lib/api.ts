import type { Result } from '@shared/types'

export async function call<T = void>(channel: string, ...args: unknown[]): Promise<T> {
  const res = (await window.api.invoke(channel, ...args)) as Result<T>
  if (!res || typeof res !== 'object') throw new Error('Beklenmeyen yanıt')
  if (!res.ok) throw new Error(res.error)
  return res.data
}

export function on<T>(channel: string, cb: (payload: T) => void): () => void {
  return window.api.on(channel, (p) => cb(p as T))
}

export const openUrl = (url?: string): void => {
  if (url) void call('shell:openExternal', url).catch(() => undefined)
}
