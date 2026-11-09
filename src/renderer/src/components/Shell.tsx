import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Copy, Download, Info, Maximize2, Minimize2, Minus, RefreshCw, Square, Terminal, Trash2, X, XCircle } from 'lucide-react'
import logo from '@/assets/logo.png'
import { call, on } from '@/lib/api'
import { useApp } from '@/lib/store'
import { Modal } from './ui'

export function WindowControls() {
  const [max, setMax] = useState(false)
  useEffect(() => on<boolean>('win:maximized', setMax), [])
  return (
    <div className="winctl">
      <button onClick={() => call('win:minimize')} aria-label="Küçült">
        <Minus />
      </button>
      <button onClick={() => call('win:maximize')} aria-label={max ? 'Önceki boyut' : 'Büyüt'}>
        {max ? <Minimize2 /> : <Maximize2 />}
      </button>
      <button className="close" onClick={() => call('win:close')} aria-label="Kapat">
        <X />
      </button>
    </div>
  )
}

/** The strip across the top of the window: drag area, name and window buttons. */
export function TitleBar() {
  const { system } = useApp()
  return (
    <div className="titlebar">
      <img src={logo} alt="" />
      <b>Static Launcher</b>
      <span>{system.appVersion}</span>
      <WindowControls />
    </div>
  )
}

/** Header of the glass panel every page opens in. */
export function TopBar({ title, children }: { title?: string; children?: ReactNode }) {
  const { setPage } = useApp()
  return (
    <header className="sheet-h">
      {title && <h2>{title}</h2>}
      {children}
      <div className="spacer" />
      <button className="btn ghost sm icon" onClick={() => setPage('home')} aria-label="Paneli kapat" title="Kapat">
        <X />
      </button>
    </header>
  )
}

export function Toasts() {
  const { toasts } = useApp()
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.kind === 'success' ? <CheckCircle2 /> : t.kind === 'error' ? <XCircle /> : <Info />}
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  )
}

export function Splash({ done }: { done: boolean }) {
  const { config } = useApp()
  return (
    <div className={`splash ${done ? 'out' : ''}`}>
      <img src={logo} alt="" />
      <div className="name">{config.name.toUpperCase()}</div>
      <div className="tagline">{config.tagline}</div>
      <div className="loader">
        <i />
      </div>
    </div>
  )
}

export function ConsoleDrawer() {
  const { logs, consoleOpen, setConsoleOpen, game, toast } = useApp()
  const body = useRef<HTMLDivElement>(null)
  const [cleared, setCleared] = useState(0)
  const [follow, setFollow] = useState(true)
  const visible = logs.slice(cleared)
  useEffect(() => {
    if (follow && body.current) body.current.scrollTop = body.current.scrollHeight
  }, [visible.length, follow, consoleOpen])
  if (!consoleOpen) return null
  return (
    <div className="console">
      <div className="console-head">
        <Terminal width={16} />
        <b>Oyun konsolu</b>
        <span className="tag">{visible.length} satır</span>
        <div className="grow" />
        <button className="btn sm" onClick={() => call('clipboard:write', visible.map((l) => l.text).join('\n')).then(() => toast('success', 'Log panoya kopyalandı'))}>
          <Copy /> Kopyala
        </button>
        <button className="btn sm" onClick={() => setCleared(logs.length)}>
          <Trash2 /> Temizle
        </button>
        {game.status === 'running' && (
          <button className="btn sm danger" onClick={() => call('game:kill')}>
            <Square /> Oyunu kapat
          </button>
        )}
        <button className="btn sm ghost icon" onClick={() => setConsoleOpen(false)} aria-label="Konsolu kapat">
          <X />
        </button>
      </div>
      <div
        className="console-body"
        ref={body}
        onScroll={(e) => {
          const el = e.currentTarget
          setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 40)
        }}
      >
        {visible.length === 0 ? <div className="muted">Oyun başladığında çıktılar burada görünür.</div> : visible.map((l, i) => <div key={i} className={`l ${l.level}`}>{l.text}</div>)}
      </div>
    </div>
  )
}

/**
 * Pops up once per version when an update is found, and stays open through download → restart
 * if the player chooses to update. Never interrupts while a game is being prepared or played.
 */
export function UpdateDialog({ blocked }: { blocked: boolean }) {
  const { update, game, system, toast } = useApp()
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [following, setFollowing] = useState(false)
  const version = update.state === 'available' || update.state === 'ready' ? update.version : null
  const busy = game.status !== 'idle'

  useEffect(() => {
    if (update.state === 'error' && following) {
      setFollowing(false)
      toast('error', update.message)
    }
  }, [update, following, toast])

  const open = !blocked && !busy && (following ? ['available', 'downloading', 'ready'].includes(update.state) : !!version && dismissed !== version)
  if (!open) return null

  const later = () => {
    setFollowing(false)
    setDismissed(version) // closing mid-download still re-opens once the update is ready
  }

  return (
    <Modal title={update.state === 'ready' ? 'Güncelleme hazır' : 'Yeni güncelleme var!'} icon={update.state === 'ready' ? <CheckCircle2 /> : <Download />} onClose={later}>
      <div className="upd-versions">
        <span className="tag">Sürüm {system.appVersion}</span>
        <span className="upd-arrow">→</span>
        <span className="tag accent">Sürüm {version ?? '…'}</span>
      </div>
      {update.state === 'available' && update.notes && <div className="upd-notes">{update.notes}</div>}
      {update.state === 'available' && <p className="muted" style={{ margin: 0 }}>Güncelleme arka planda iner; oyunlarına, dünyalarına ve ayarlarına dokunulmaz.</p>}
      {update.state === 'downloading' && (
        <div className="progress-wrap" style={{ maxWidth: 'none' }}>
          <div className="row between small">
            <span>İndiriliyor…</span>
            <span className="muted">%{update.percent}</span>
          </div>
          <div className="bar">
            <i style={{ width: `${Math.max(2, update.percent)}%` }} />
          </div>
        </div>
      )}
      {update.state === 'ready' && <p className="muted" style={{ margin: 0 }}>Launcher kapanıp birkaç saniye içinde yeni sürümle kendiliğinden açılacak.</p>}
      <div className="modal-foot" style={{ padding: '6px 0 0' }}>
        <button className="btn ghost" onClick={later}>
          Sonra
        </button>
        {update.state === 'available' && (
          <button
            className="btn primary"
            onClick={() => {
              setFollowing(true)
              void call('update:download').catch((e) => toast('error', e.message))
            }}
          >
            <Download /> Şimdi güncelle
          </button>
        )}
        {update.state === 'downloading' && (
          <button className="btn primary" disabled>
            <RefreshCw className="spin" /> İndiriliyor
          </button>
        )}
        {update.state === 'ready' && (
          <button className="btn primary" onClick={() => call('update:install')}>
            <RefreshCw /> Yeniden başlat ve kur
          </button>
        )}
      </div>
    </Modal>
  )
}

export function CrashDialog() {
  const { crash, dismissCrash, setConsoleOpen, logs, toast } = useApp()
  if (!crash) return null
  return (
    <Modal
      title={crash.title}
      icon={<AlertTriangle />}
      danger
      onClose={dismissCrash}
      footer={
        <>
          <button className="btn" onClick={() => call('clipboard:write', logs.slice(-400).map((l) => l.text).join('\n')).then(() => toast('success', 'Log panoya kopyalandı'))}>
            <Copy /> Logu kopyala
          </button>
          <button
            className="btn primary"
            onClick={() => {
              dismissCrash()
              setConsoleOpen(true)
            }}
          >
            <Terminal /> Konsolu aç
          </button>
        </>
      }
    >
      <p style={{ margin: 0, lineHeight: 1.6 }}>{crash.hint}</p>
      <span className="tiny muted">Çıkış kodu: {crash.exitCode ?? '—'}</span>
    </Modal>
  )
}
