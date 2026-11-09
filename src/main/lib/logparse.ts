// Minecraft's log4j config prints XML events to stdout; turn them into readable one-line entries.
export interface ParsedLine {
  level: 'info' | 'warn' | 'error'
  text: string
}

const EVENT_RE = /<log4j:Event\b([^>]*)>([\s\S]*?)<\/log4j:Event>/g
const attr = (s: string, name: string) => new RegExp(`${name}="([^"]*)"`).exec(s)?.[1] ?? ''
const cdata = (s: string, tag: string) => new RegExp(`<log4j:${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></log4j:${tag}>`).exec(s)?.[1]

function levelOf(l: string): ParsedLine['level'] {
  return l === 'ERROR' || l === 'FATAL' ? 'error' : l === 'WARN' ? 'warn' : 'info'
}

function plain(raw: string): ParsedLine {
  return { level: /\b(ERROR|FATAL)\b|Exception/.test(raw) ? 'error' : /\bWARN\b/.test(raw) ? 'warn' : 'info', text: raw }
}

/** Feed stdout chunks; returns finished lines and keeps an incomplete XML event for the next chunk. */
export class LogParser {
  private rest = ''

  push(chunk: string): ParsedLine[] {
    const out: ParsedLine[] = []
    let text = this.rest + chunk
    this.rest = ''
    let last = 0
    const emitPlain = (s: string) => {
      for (const l of s.split(/\r?\n/)) if (l.trim()) out.push(plain(l))
    }
    for (const m of text.matchAll(EVENT_RE)) {
      emitPlain(text.slice(last, m.index))
      last = (m.index ?? 0) + m[0].length
      const head = m[1]
      const body = m[2]
      const t = Number(attr(head, 'timestamp'))
      const time = Number.isFinite(t) && t > 0 ? new Date(t).toTimeString().slice(0, 8) : ''
      const level = attr(head, 'level') || 'INFO'
      const thread = attr(head, 'thread')
      const msg = cdata(body, 'Message') ?? ''
      const thr = cdata(body, 'Throwable')
      out.push({ level: levelOf(level), text: `[${time}] [${thread}/${level}]: ${msg}` })
      if (thr) for (const l of thr.split(/\r?\n/)) if (l.trim()) out.push({ level: 'error', text: l })
    }
    text = text.slice(last)
    const open = text.indexOf('<log4j:Event')
    if (open !== -1) {
      emitPlain(text.slice(0, open))
      this.rest = text.slice(open)
      if (this.rest.length > 1_000_000) this.rest = '' // never grow unbounded on garbage
    } else {
      // keep a trailing partial line for the next chunk
      const nl = text.lastIndexOf('\n')
      emitPlain(text.slice(0, nl + 1))
      this.rest = text.slice(nl + 1)
    }
    return out
  }

  flush(): ParsedLine[] {
    const r = this.rest.trim()
    this.rest = ''
    return r ? [plain(r)] : []
  }
}
