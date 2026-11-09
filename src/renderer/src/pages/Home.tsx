import { useEffect, useState } from 'react'
import { Box, Clock, Gamepad2, Globe, Layers, MemoryStick, MessageCircle, Package, Play, Plus, Settings2, Square, Swords, Terminal, Users, X, Sparkles } from 'lucide-react'
import type { Profile, Screenshot, ServerStatus } from '@shared/types'
import { call, openUrl } from '@/lib/api'
import { useApp } from '@/lib/store'
import { ago, playtime, ram } from '@/lib/format'
import { Background, TopBar } from '@/components/Shell'
import { SkinViewer } from '@/components/SkinViewer'
import { useSkin } from '@/components/Avatar'

const MODE_ICONS: Record<string, React.ReactNode> = { survival: <Sparkles />, classic: <Swords />, vanilla: <Box /> }

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

export function Home() {
  const app = useApp()
  const { selectedProfile: profile, profiles, settings, game, progress, config, selectedAccount, setPage, setConsoleOpen, consoleOpen, updateSettings, play, toast } = app
  const [bgShot, setBgShot] = useState<string | undefined>()
  const skin = useSkin(selectedAccount?.id, selectedAccount?.hasSkin)
  const featuredServer = profile?.serverAddress ?? config.servers.find((s) => s.featured)?.address
  const status = useServerStatus(featuredServer)

  useEffect(() => {
    if (!profile) return
    let alive = true
    void call<Screenshot[]>('shots:list', profile.id)
      .then((s) => alive && setBgShot(s[0]?.url))
      .catch(() => alive && setBgShot(undefined))
    return () => {
      alive = false
    }
  }, [profile?.id, game.status])

  if (!profile)
    return (
      <div className="home">
        <Background />
        <TopBar />
      </div>
    )

  const busyHere = game.status !== 'idle' && game.profileId === profile.id
  const busyOther = game.status !== 'idle' && game.profileId !== profile.id
  const effectiveRam = profile.ramMB ?? settings.ramMB

  const select = (id: string) => {
    if (id !== profile.id) void updateSettings({ selectedProfileId: id }).catch((e) => toast('error', e.message))
  }

  return (
    <div className="home" style={profile.accent ? ({ '--hero': profile.accent } as React.CSSProperties) : undefined}>
      <Background image={bgShot} color={profile.accent} />
      <TopBar>
        {featuredServer && (
          <div className="chip">
            <span className={`dot ${status ? (status.online ? '' : 'off') : 'warn pulse'}`} />
            <div>
              <small>Çevrimiçi oyuncu</small>
              <b>{status?.online ? `${status.players ?? 0} / ${status.max ?? 0}` : status ? 'Kapalı' : '…'}</b>
            </div>
          </div>
        )}
        {featuredServer && (
          <div className="chip">
            <Globe width={15} />
            <div>
              <small>Sunucu</small>
              <b>{featuredServer}</b>
            </div>
          </div>
        )}
      </TopBar>

      <section className="hero">
        <div className="hero-content" key={profile.id}>
          <div className="kicker">
            <i />
            {profile.managed ? 'Sunucu modu' : 'Özel profil'}
          </div>
          {/* mode names are usually English: avoid Turkish dotted İ from text-transform */}
          <h1 lang="en">{profile.name.toLocaleUpperCase('en-US')}</h1>
          <p className="desc">{profile.description || `${versionLabel(profile)} ile oynamaya hazır.`}</p>
          <div className="hero-actions">
            {busyHere && game.status === 'running' ? (
              <button className="btn btn-play running" onClick={() => call('game:kill')}>
                <Square /> Oyunu kapat
              </button>
            ) : busyHere ? (
              <button className="btn btn-play" onClick={() => call('game:cancel')}>
                <X /> İptal
              </button>
            ) : (
              <button className="btn primary btn-play" disabled={busyOther || !selectedAccount} onClick={() => play(profile.id)}>
                <Play /> Oyna
              </button>
            )}
            <button className="btn" style={{ height: 54, borderRadius: 14, padding: '0 18px' }} onClick={() => setPage('profiles')}>
              <Settings2 /> Ayarlar
            </button>
          </div>
          <div className="hero-tags">
            <span className="tag">
              <Gamepad2 /> {versionLabel(profile)}
            </span>
            <span className="tag">
              <MemoryStick /> {ram(effectiveRam)} RAM
            </span>
            {profile.mods && profile.mods.length > 0 && (
              <span className="tag">
                <Package /> {profile.mods.length} hazır mod
              </span>
            )}
            <span className="tag">
              <Clock /> {playtime(profile.playTimeSec)}
            </span>
            <span className="tag">{ago(profile.lastPlayed)}</span>
          </div>
        </div>
        <div className="hero-side">
          <SkinViewer skin={skin} slim={selectedAccount?.slim} width={300} height={420} zoom={0.82} />
        </div>
      </section>

      <div className="modes">
        {profiles.map((p) => (
          <button key={p.id} className={`mode ${p.id === profile.id ? 'on' : ''}`} style={p.accent ? ({ '--mc': p.accent } as React.CSSProperties) : undefined} onClick={() => select(p.id)}>
            <div className="mode-ic">{MODE_ICONS[p.id] ?? <Layers />}</div>
            <b className="ellipsis">{p.name}</b>
            <small>{versionLabel(p)}</small>
          </button>
        ))}
        <button className="mode" onClick={() => setPage('profiles')}>
          <div className="mode-ic">
            <Plus />
          </div>
          <b>Yeni profil</b>
          <small>Kendi sürümünü kur</small>
        </button>
      </div>

      <footer className="bottombar">
        <button className="chip" onClick={() => setPage('store')} disabled={profile.loader !== 'fabric'} title={profile.loader !== 'fabric' ? 'Vanilla profillerde mod yok' : undefined}>
          <Package width={15} /> Mod listesi
        </button>
        {progress && game.status === 'preparing' ? (
          <div className="progress-wrap">
            <div className="row between">
              <span>{progress.label}</span>
              <span className="muted">
                {progress.detail ? `${progress.detail} · ` : ''}
                {progress.progress >= 0 ? `%${Math.round(progress.progress * 100)}` : ''}
              </span>
            </div>
            <div className={`bar ${progress.progress < 0 ? 'indeterminate' : ''}`}>
              <i style={{ width: `${Math.max(2, progress.progress * 100)}%` }} />
            </div>
          </div>
        ) : game.status === 'running' ? (
          <span className="status-pill">
            <span className="dot pulse" /> {profiles.find((p) => p.id === game.profileId)?.name ?? 'Oyun'} çalışıyor
          </span>
        ) : (
          <span className="status-pill muted">
            <Users width={15} /> {selectedAccount ? `${selectedAccount.name} olarak oynanacak` : 'Hesap seçilmedi'}
          </span>
        )}
        <div className="grow" />
        {config.links.discord && (
          <button className="chip" onClick={() => openUrl(config.links.discord)}>
            <MessageCircle width={15} /> Discord
          </button>
        )}
        {config.links.website && (
          <button className="chip" onClick={() => openUrl(config.links.website)}>
            <Globe width={15} /> Web sitesi
          </button>
        )}
        <button className={`chip ${consoleOpen ? 'on' : ''}`} onClick={() => setConsoleOpen(!consoleOpen)}>
          <Terminal width={15} /> Konsol
        </button>
      </footer>
    </div>
  )
}
