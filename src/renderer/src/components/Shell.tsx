import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  House,
  Images,
  Info,
  Layers,
  Maximize2,
  Minimize2,
  Minus,
  Newspaper,
  Package,
  RefreshCw,
  Server,
  Settings as SettingsIcon,
  Square,
  Terminal,
  Trash2,
  UserRound,
  X,
  XCircle
} from 'lucide-react'
import logo from '@/assets/logo.png'
import { call, on } from '@/lib/api'
import { useApp, type Page } from '@/lib/store'
import { Avatar } from './Avatar'
import { Modal } from './ui'

const NAV: { id: Page; label: string; icon: ReactNode }[] = [
  { id: 'home', label: 'Ana Sayfa', icon: <House /> },
  { id: 'profiles', label: 'Profiller', icon: <Layers /> },
  { id: 'store', label: 'Mod Mağazası', icon: <Package /> },
  { id: 'servers', label: 'Sunucular', icon: <Server /> },
  { id: 'news', label: 'Haberler', icon: <Newspaper /> },
  { id: 'gallery', label: 'Galeri & Dünyalar', icon: <Images /> }
]

export function Sidebar() {
  const { page, setPage, config, update, system } = useApp()
  const [seenNews, setSeenNews] = useState(() => {
    try {
      return localStorage.getItem('seenNews') ?? ''
    } catch {
      return ''
    }
  })
  const latestNews = config.news[0]?.id ?? ''
  const unread = latestNews && latestNews !== seenNews ? Math.min(9, config.news.findIndex((n) => n.id === seenNews) === -1 ? config.news.length : config.news.findIndex((n) => n.id === seenNews)) : 0

  useEffect(() => {
    if (page !== 'news' || !latestNews) return
    setSeenNews(latestNews)
    try {
      localStorage.setItem('seenNews', latestNews)
    } catch {
      /* storage may be unavailable */
    }
  }, [page, latestNews])
  const go = (p: Page) => setPage(p)

  return (
    <aside className="sidebar">
      <div className="brand">
        <img src={logo} alt="" />
        <div>
          <b>{config.name.toUpperCase()}</b>
          <small>Launcher</small>
        </div>
      </div>
      {NAV.map((n) => (
        <button key={n.id} className={`nav ${page === n.id ? 'on' : ''}`} onClick={() => go(n.id)}>
          {n.icon}
          {n.label}
          {n.id === 'news' && unread > 0 && <span className="badge">{unread}</span>}
        </button>
      ))}
      <div className="nav-sep" />
      <button className={`nav ${page === 'account' ? 'on' : ''}`} onClick={() => go('account')}>
        <UserRound />
        Hesap & Skin
      </button>
      <div className="grow" />
      <button className={`nav ${page === 'settings' ? 'on' : ''}`} onClick={() => go('settings')}>
        <SettingsIcon />
        Ayarlar
      </button>
      <UpdateCard version={system.appVersion} update={update} />
    </aside>
  )
}

function UpdateCard({ version, update }: { version: string; update: ReturnType<typeof useApp>['update'] }) {
  const { toast } = useApp()
  if (update.state === 'available')
    return (
      <div className="update-banner">
        <Download width={16} />
        <div className="grow">
          <b>Yeni sürüm {update.version}</b>
        </div>
        <button className="btn sm primary" onClick={() => call('update:download').catch((e) => toast('error', e.message))}>
          İndir
        </button>
      </div>
    )
  if (update.state === 'downloading')
    return (
      <div className="update-banner">
        <RefreshCw width={16} className="spin" />
        <span>Güncelleme indiriliyor… %{update.percent}</span>
      </div>
    )
  if (update.state === 'ready')
    return (
      <div className="update-banner">
        <CheckCircle2 width={16} />
        <div className="grow">Güncelleme hazır</div>
        <button className="btn sm primary" onClick={() => call('update:install')}>
          Yeniden başlat
        </button>
      </div>
    )
  return (
    <div className="side-card">
      <span className="dot" />
      <div>
        Launcher güncel
        <small>Sürüm {version}</small>
      </div>
    </div>
  )
}

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

export function TopBar({ title, children }: { title?: string; children?: ReactNode }) {
  const { selectedAccount, setPage } = useApp()
  return (
    <header className="topbar">
      {title && <div className="page-title">{title}</div>}
      {children}
      <div className="spacer" />
      <button className="user-chip" onClick={() => setPage('account')} title="Hesabı değiştir">
        <div>
          <b>{selectedAccount?.name ?? 'Misafir'}</b>
          <small>Çevrimdışı hesap</small>
        </div>
        <Avatar accountId={selectedAccount?.id} hasSkin={selectedAccount?.hasSkin} />
      </button>
      <WindowControls />
    </header>
  )
}

export function Background({ image, color, dim }: { image?: string; color?: string; dim?: boolean }) {
  const [loaded, setLoaded] = useState<string | undefined>()
  useEffect(() => {
    if (!image) return setLoaded(undefined)
    const img = new Image()
    img.onload = () => setLoaded(image)
    img.onerror = () => setLoaded(undefined)
    img.src = image
  }, [image])
  return (
    <div className={`bg ${dim ? 'dim' : ''}`} style={color ? ({ '--hero': color } as React.CSSProperties) : undefined}>
      <div className="bg-aurora" />
      <div className="blob b1" />
      <div className="blob b2" />
      <div className="pixels" />
      <div className={`bg-img ${loaded ? 'on' : ''}`} style={loaded ? { backgroundImage: `url("${loaded}")` } : undefined} />
      <div className="bg-shade" />
    </div>
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
