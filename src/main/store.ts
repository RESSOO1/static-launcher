import { readFileSync, writeFileSync, renameSync, existsSync, copyFileSync } from 'fs'
import { log } from './log'

/**
 * Small JSON file store. Writes go to a temp file first and are renamed into place,
 * so a crash or power loss mid-write never leaves a half written settings file.
 */
export class JsonStore<T> {
  private data: T
  private timer: NodeJS.Timeout | null = null

  constructor(
    private file: string,
    private defaults: () => T,
    private sanitize: (raw: unknown) => T
  ) {
    this.data = this.load()
  }

  private load(): T {
    if (!existsSync(this.file)) return this.defaults()
    try {
      return this.sanitize(JSON.parse(readFileSync(this.file, 'utf8')))
    } catch (e) {
      log.warn(`Bozuk veri dosyası yedeklendi: ${this.file}`, e)
      try {
        copyFileSync(this.file, `${this.file}.corrupt-${Date.now()}`)
      } catch {
        /* best effort */
      }
      return this.defaults()
    }
  }

  get(): T {
    return this.data
  }

  set(next: T): T {
    this.data = next
    this.scheduleSave()
    return next
  }

  update(fn: (d: T) => T): T {
    return this.set(fn(this.data))
  }

  private scheduleSave(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.flush(), 150)
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    try {
      const tmp = `${this.file}.tmp`
      writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8')
      renameSync(tmp, this.file)
    } catch (e) {
      log.error(`Veri kaydedilemedi: ${this.file}`, e)
    }
  }
}
