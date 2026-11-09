import { useEffect, useRef, useState } from 'react'
import { Check, ChevronUp, Plus } from 'lucide-react'
import { call } from '@/lib/api'
import { useApp, type Page } from '@/lib/store'
import { ram } from '@/lib/format'
import { versionLabel } from '@/pages/Home'
import { PixelIcon, type PixelIconName } from './Pixel'

function Tile({ page, icon, label }: { page: Page; icon: PixelIconName; label: string }) {
  const { page: current, setPage } = useApp()
  const on = current === page
  return (
    <button className={`tile ${on ? 'on' : ''}`} aria-current={on ? 'page' : undefined} onClick={() => setPage(on ? 'home' : page)}>
      <PixelIcon name={icon} />
      <span>{label}</span>
    </button>
  )
}

function PlayButton() {
  const { selectedProfile: profile, profiles, game, progress, selectedAccount, play, updateSettings, setPage, toast } = useApp()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    addEventListener('mousedown', close)
    return () => removeEventListener('mousedown', close)
  }, [open])

  const busyHere = !!profile && game.status !== 'idle' && game.profileId === profile.id
  const busyOther = !!profile && game.status !== 'idle' && game.profileId !== profile.id
  const preparing = busyHere && game.status === 'preparing'
  const running = busyHere && game.status === 'running'
  const pct = progress && progress.progress >= 0 ? Math.round(progress.progress * 100) : null

  const onPlay = () => {
    if (running) return void call('game:kill')
    if (preparing) return void call('game:cancel')
    if (profile) void play(profile.id)
  }

  return (
    <div className="play-w" ref={root}>
      <button className={`play ${running ? 'running' : ''}`} disabled={!profile || busyOther || !selectedAccount} title={running ? 'Oyunu kapat' : preparing ? 'İptal et' : undefined} onClick={onPlay}>
        {preparing && <i className={pct === null ? 'indet' : ''} style={pct === null ? undefined : { width: `${pct}%` }} />}
        <b>{running ? 'KAPAT' : preparing ? (pct === null ? 'İPTAL' : `%${pct}`) : 'OYNA'}</b>
        <small className="ellipsis">{running ? `${profile?.name} çalışıyor` : preparing ? (progress?.label ?? 'Hazırlanıyor') : profile ? `${profile.name} · ${profile.mcVersion === 'latest' ? 'En son' : profile.mcVersion}` : 'Profil yok'}</small>
      </button>
      <button className="play-m" aria-label="Profil seç" aria-expanded={open} title="Profil seç" onClick={() => setOpen(!open)}>
        <ChevronUp />
      </button>
      {open && (
        <div className="modes-menu glass">
          {profiles.map((p) => (
            <button
              key={p.id}
              className={p.id === profile?.id ? 'sel' : ''}
              onClick={() => {
                setOpen(false)
                if (p.id !== profile?.id) void updateSettings({ selectedProfileId: p.id }).catch((e) => toast('error', e.message))
              }}
            >
              <span className="ellipsis">
                <b className="ellipsis">{p.name}</b>
                <small>{versionLabel(p)}</small>
              </span>
              {p.id === profile?.id && <Check />}
            </button>
          ))}
          <button
            onClick={() => {
              setOpen(false)
              setPage('profiles')
            }}
          >
            <Plus />
            <span>
              <b>Yeni profil</b>
              <small>Kendi sürümünü ve modlarını seç</small>
            </span>
          </button>
        </div>
      )}
    </div>
  )
}

function UpdateStatus() {
  const { update, system, toast } = useApp()
  if (update.state === 'available')
    return (
      <button className="foot-link" onClick={() => call('update:download').catch((e) => toast('error', e.message))}>
        Yeni sürüm {update.version}: indir
      </button>
    )
  if (update.state === 'downloading') return <span className="foot-up">Güncelleme indiriliyor %{update.percent}</span>
  if (update.state === 'ready')
    return (
      <button className="foot-link" onClick={() => call('update:install')}>
        Güncelleme hazır: yeniden başlat
      </button>
    )
  return <span className="foot-ok">Launcher güncel · {system.appVersion}</span>
}

export function Dock() {
  const { selectedProfile: profile, settings } = useApp()
  return (
    <footer className="band">
      {profile && (
        <div className="foot l">
          <b className="ellipsis">{versionLabel(profile).replace(/^/, profile.mcVersion === 'latest' ? '' : 'Minecraft ')}</b>
          {profile.mods?.length ? `${profile.mods.length} mod · ` : ''}
          {ram(profile.ramMB ?? settings.ramMB)} RAM
        </div>
      )}
      <nav className="dock" aria-label="Ana menü">
        <Tile page="servers" icon="server" label="SUNUCULAR" />
        <Tile page="store" icon="chest" label="MAĞAZA" />
        <Tile page="profiles" icon="layers" label="PROFİLLER" />
        <PlayButton />
        <Tile page="account" icon="shirt" label="GARDIROP" />
        <Tile page="gallery" icon="frame" label="GALERİ" />
        <Tile page="settings" icon="gear" label="AYARLAR" />
      </nav>
      <div className="foot r">
        <UpdateStatus />
      </div>
    </footer>
  )
}
