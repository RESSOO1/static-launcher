import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronRight, Globe, Plus, Terminal } from 'lucide-react'
import logo from '@/assets/logo.png'
import type { Profile, ServerStatus } from '@shared/types'
import { call, openUrl } from '@/lib/api'
import { useApp } from '@/lib/store'
import { paintNewsArt } from '@/lib/scene'
import { Wordmark } from '@/components/Pixel'
import { SkinViewer } from '@/components/SkinViewer'
import { Avatar, useSkin } from '@/components/Avatar'
import { AddAccount } from './Account'

export function useServerStatus(address?: string): ServerStatus | null {
  const [st, setSt] = useState<ServerStatus | null>(null)
  useEffect(() => {
    if (!address) return setSt(null)
    let alive = true
    const tick = () => call<ServerStatus>('servers:ping', address).then((s) => alive && setSt(s)).catch(() => alive && setSt({ online: false }))
    void tick()
    const t = setInterval(tick, 30000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [address])
  return st
}

export function versionLabel(p: Profile): string {
  const v = p.mcVersion === 'latest' ? 'En son sürüm' : p.mcVersion
  return p.loader === 'fabric' ? `${v} · Fabric` : v
}

function AccountMenu() {
  const { accounts, selectedAccount, refreshAccounts, toast, bumpSkin } = useApp()
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    addEventListener('mousedown', close)
    return () => removeEventListener('mousedown', close)
  }, [open])

  const select = async (id: string) => {
    setOpen(false)
    try {
      await call('accounts:select', id)
      await refreshAccounts()
      bumpSkin()
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }

  return (
    <div className="acct-wrap" ref={root}>
      <button className="acct glass" aria-expanded={open} title="Oyuncu adını değiştir" onClick={() => setOpen(!open)}>
        <Avatar accountId={selectedAccount?.id} hasSkin={selectedAccount?.hasSkin} size={40} />
        <span>
          <b>{selectedAccount?.name ?? 'Misafir'}</b>
          <small>
            <i className="dot" /> Çevrimdışı hesap
          </small>
        </span>
        <ChevronDown />
      </button>
      {open && (
        <div className="acct-menu glass">
          {accounts.map((a) => (
            <button key={a.id} onClick={() => select(a.id)}>
              <Avatar accountId={a.id} hasSkin={a.hasSkin} size={24} />
              <span className="ellipsis">{a.name}</span>
              {a.id === selectedAccount?.id && <Check />}
            </button>
          ))}
          <hr />
          <button
            onClick={() => {
              setOpen(false)
              setAdding(true)
            }}
          >
            <Plus /> Yeni isim ekle
          </button>
        </div>
      )}
      {adding && (
        <AddAccount
          onClose={() => setAdding(false)}
          onAdded={async () => {
            setAdding(false)
            await refreshAccounts()
            bumpSkin()
          }}
        />
      )}
    </div>
  )
}

function NewsCard() {
  const { config, setPage } = useApp()
  const art = useRef<HTMLCanvasElement>(null)
  const [i, setI] = useState(0)
  const news = config.news
  const item = news[Math.min(i, news.length - 1)]
  useEffect(() => {
    if (art.current) paintNewsArt(art.current)
  }, [!!item])
  if (!item) return null
  return (
    <aside className="news glass">
      <div className="news-h">
        <span className="chip-tag">{(item.tag ?? 'Haber').toLocaleUpperCase('tr')}</span>
        {news.length > 1 && (
          <div className="pager">
            <button aria-label="Önceki haber" onClick={() => setI((n) => (n - 1 + news.length) % news.length)}>
              ‹
            </button>
            <span>
              {Math.min(i, news.length - 1) + 1}/{news.length}
            </span>
            <button aria-label="Sonraki haber" onClick={() => setI((n) => (n + 1) % news.length)}>
              ›
            </button>
          </div>
        )}
      </div>
      <canvas ref={art} />
      <div className="news-b">
        <b>{item.title}</b>
        <div className="news-f">
          <span>{new Date(item.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
          <button onClick={() => setPage('news')}>
            OKU <ChevronRight />
          </button>
        </div>
      </div>
    </aside>
  )
}

export function Home() {
  const { selectedProfile: profile, selectedAccount, config, consoleOpen, setConsoleOpen } = useApp()
  const skin = useSkin(selectedAccount?.id, selectedAccount?.hasSkin)
  const server = profile?.serverAddress ?? config.servers.find((s) => s.featured)?.address
  const status = useServerStatus(server)

  return (
    <div className="home">
      <AccountMenu />

      <div className="top-right">
        {server && (
          <div className="pill glass">
            <span className={`dot ${status ? (status.online ? '' : 'off') : 'warn pulse'}`} />
            {server}
            <small>{status?.online ? `${status.players ?? 0} / ${status.max ?? 0} oyuncu` : status ? 'Kapalı' : 'Bakılıyor'}</small>
          </div>
        )}
        {config.links.discord && (
          <button className="icon-btn glass" title="Discord" aria-label="Discord" onClick={() => openUrl(config.links.discord)}>
            <svg viewBox="0 0 24 24" className="filled">
              <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
            </svg>
          </button>
        )}
        {config.links.website && (
          <button className="icon-btn glass" title="Web sitesi" aria-label="Web sitesi" onClick={() => openUrl(config.links.website)}>
            <Globe />
          </button>
        )}
        <button className={`icon-btn glass ${consoleOpen ? 'on' : ''}`} title="Oyun konsolu" aria-label="Oyun konsolu" onClick={() => setConsoleOpen(!consoleOpen)}>
          <Terminal />
        </button>
      </div>

      <div className="brand">
        <img src={logo} alt="" />
        <div className="word">
          <Wordmark />
          <p>LAUNCHER</p>
          {config.tagline && <span className="splash-text">{config.tagline}</span>}
        </div>
      </div>

      <div className="hero">
        <div className="pedestal" />
        <div className="name-tag">{selectedAccount?.name ?? 'Misafir'}</div>
        <SkinViewer skin={skin} slim={selectedAccount?.slim} width={320} height={440} zoom={0.7} fov={38} angle={-0.42} rotate={false} />
      </div>

      <NewsCard />
    </div>
  )
}
