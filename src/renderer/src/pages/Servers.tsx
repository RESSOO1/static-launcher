import { useCallback, useEffect, useState } from 'react'
import { Plus, RefreshCw, Server, Star, Trash2, Wifi, WifiOff, Play, Copy } from 'lucide-react'
import type { ServerDef, ServerStatus } from '@shared/types'
import { call } from '@/lib/api'
import { useApp } from '@/lib/store'
import { Background, TopBar } from '@/components/Shell'
import { Empty, Modal, Spinner } from '@/components/ui'
import { versionLabel } from './Home'

export function Servers() {
  const { selectedProfile, profiles, play, game, toast, setPage, updateSettings } = useApp()
  const [servers, setServers] = useState<ServerDef[]>([])
  const [status, setStatus] = useState<Record<string, ServerStatus | 'loading'>>({})
  const [adding, setAdding] = useState(false)
  const [joinTarget, setJoinTarget] = useState<ServerDef | null>(null)

  const pingAll = useCallback((list: ServerDef[]) => {
    for (const s of list) {
      setStatus((st) => ({ ...st, [s.id]: 'loading' }))
      call<ServerStatus>('servers:ping', s.address)
        .then((r) => setStatus((st) => ({ ...st, [s.id]: r })))
        .catch(() => setStatus((st) => ({ ...st, [s.id]: { online: false } })))
    }
  }, [])

  const load = useCallback(() => {
    call<ServerDef[]>('servers:list')
      .then((l) => {
        setServers(l)
        pingAll(l)
      })
      .catch((e) => toast('error', e.message))
  }, [pingAll, toast])
  useEffect(load, [load])

  return (
    <>
      <Background dim />
      <TopBar title="Sunucular" />
      <div className="page">
        <div className="page-head">
          <p>Sunucuların canlı durumunu gör ve tek tıkla bağlan. Çevrimdışı hesaplarla sadece crack’li (online-mode=false) sunuculara girilebilir.</p>
          <div className="row">
            <button className="btn" onClick={() => pingAll(servers)}>
              <RefreshCw /> Yenile
            </button>
            <button className="btn primary" onClick={() => setAdding(true)}>
              <Plus /> Sunucu ekle
            </button>
          </div>
        </div>
        {servers.length === 0 ? (
          <div className="card">
            <Empty icon={<Server />} title="Henüz sunucu eklenmedi" text="Favori sunucunun adresini ekle; durumunu ve oyuncu sayısını burada canlı takip et.">
              <button className="btn primary sm" onClick={() => setAdding(true)}>
                <Plus /> Sunucu ekle
              </button>
            </Empty>
          </div>
        ) : (
          <div className="grid g2">
            {servers.map((s) => {
              const st = status[s.id]
              const info = st && st !== 'loading' ? st : null
              return (
                <div key={s.id} className="card hover srv">
                  {info?.favicon ? <img className="srv-icon" src={info.favicon} alt="" /> : <div className="srv-icon"><Server /></div>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row" style={{ gap: 8 }}>
                      <b className="ellipsis">{s.name}</b>
                      {s.featured && (
                        <span className="tag accent">
                          <Star /> Resmi
                        </span>
                      )}
                    </div>
                    <span className="tiny muted">{s.address}</span>
                    <div className="motd" style={{ marginTop: 6 }}>
                      {st === 'loading' ? 'Bağlanılıyor…' : info?.online ? info.motd || info.version : 'Sunucuya ulaşılamadı'}
                    </div>
                  </div>
                  <div className="col" style={{ alignItems: 'flex-end', gap: 8 }}>
                    <span className={`tag ${info?.online ? 'ok' : ''}`}>
                      {st === 'loading' ? <Spinner size={12} /> : info?.online ? <Wifi /> : <WifiOff />}
                      {info?.online ? `${info.players ?? 0}/${info.max ?? 0} · ${info.ping ?? '?'} ms` : st === 'loading' ? '…' : 'Kapalı'}
                    </span>
                    <div className="row" style={{ gap: 6 }}>
                      <button className="btn sm icon" title="Adresi kopyala" onClick={() => call('clipboard:write', s.address).then(() => toast('success', 'Adres kopyalandı'))}>
                        <Copy />
                      </button>
                      {!s.featured && (
                        <button
                          className="btn sm icon danger"
                          title="Kaldır"
                          onClick={() =>
                            call('servers:remove', s.id)
                              .then(load)
                              .catch((e) => toast('error', e.message))
                          }
                        >
                          <Trash2 />
                        </button>
                      )}
                      <button className="btn sm primary" disabled={game.status !== 'idle'} onClick={() => setJoinTarget(s)}>
                        <Play /> Bağlan
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      {adding && (
        <AddServer
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false)
            load()
          }}
        />
      )}
      {joinTarget && (
        <JoinDialog
          server={joinTarget}
          defaultProfile={selectedProfile?.id ?? profiles[0]?.id}
          onClose={() => setJoinTarget(null)}
          onJoin={async (pid) => {
            setJoinTarget(null)
            await updateSettings({ selectedProfileId: pid })
            setPage('home')
            await play(pid, joinTarget.address)
          }}
        />
      )}
    </>
  )
}

function AddServer({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const { toast } = useApp()
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true)
    try {
      await call('servers:add', name || address, address)
      toast('success', 'Sunucu eklendi')
      onAdded()
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      title="Sunucu ekle"
      icon={<Server />}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn primary" disabled={busy || !address.trim()} onClick={submit}>
            {busy && <Spinner size={14} />} Ekle
          </button>
        </>
      }
    >
      <div className="field">
        <label>Sunucu adı</label>
        <input className="input" value={name} maxLength={40} placeholder="ör. Arkadaşların sunucusu" onChange={(e) => setName(e.target.value)} autoFocus />
      </div>
      <div className="field">
        <label>Adres</label>
        <input className="input" value={address} maxLength={255} placeholder="play.ornek.com veya 192.168.1.10:25565" onChange={(e) => setAddress(e.target.value.trim())} onKeyDown={(e) => e.key === 'Enter' && address && submit()} />
      </div>
    </Modal>
  )
}

function JoinDialog({ server, defaultProfile, onClose, onJoin }: { server: ServerDef; defaultProfile?: string; onClose: () => void; onJoin: (pid: string) => void }) {
  const { profiles } = useApp()
  const [pid, setPid] = useState(defaultProfile ?? '')
  return (
    <Modal
      title={`${server.name} sunucusuna bağlan`}
      icon={<Play />}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn primary" disabled={!pid} onClick={() => onJoin(pid)}>
            <Play /> Oyna ve bağlan
          </button>
        </>
      }
    >
      <div className="field">
        <label>Hangi profille girilsin?</label>
        <select className="select" value={pid} onChange={(e) => setPid(e.target.value)}>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {versionLabel(p)}
            </option>
          ))}
        </select>
        <span className="help">Sunucunun sürümüyle uyumlu bir profil seç. Oyun açılınca doğrudan sunucuya bağlanır.</span>
      </div>
    </Modal>
  )
}
