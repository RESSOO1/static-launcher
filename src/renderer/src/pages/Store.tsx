import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Download, FolderOpen, Heart, Image as ImageIcon, Package, Puzzle, Search, Sparkles, Trash2 } from 'lucide-react'
import type { ContentType, InstalledMod, ModrinthHit } from '@shared/types'
import { call } from '@/lib/api'
import { useApp } from '@/lib/store'
import { bytes, compact } from '@/lib/format'
import { Background, TopBar } from '@/components/Shell'
import { Empty, Seg, Spinner, Switch, useAction } from '@/components/ui'
import { versionLabel } from './Home'

const TYPES: { value: ContentType; label: string; icon: React.ReactNode }[] = [
  { value: 'mod', label: 'Modlar', icon: <Puzzle /> },
  { value: 'resourcepack', label: 'Kaynak paketleri', icon: <ImageIcon /> },
  { value: 'shader', label: 'Shader', icon: <Sparkles /> }
]
const FOLDER: Record<ContentType, string> = { mod: 'mods', resourcepack: 'resourcepacks', shader: 'shaderpacks' }

export function Store() {
  const { profiles, selectedProfile, toast } = useApp()
  const [profileId, setProfileId] = useState(selectedProfile?.id ?? profiles[0]?.id ?? '')
  const [type, setType] = useState<ContentType>('mod')
  const [tab, setTab] = useState<'browse' | 'installed'>('browse')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('relevance')
  const [hits, setHits] = useState<ModrinthHit[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [installed, setInstalled] = useState<InstalledMod[]>([])
  const { busy, run } = useAction(toast)
  const reqId = useRef(0)
  const profile = profiles.find((p) => p.id === profileId)
  const blocked = type !== 'resourcepack' && profile?.loader === 'vanilla'

  const loadInstalled = useCallback(() => {
    if (!profileId) return
    call<InstalledMod[]>('content:list', profileId, type).then(setInstalled).catch(() => setInstalled([]))
  }, [profileId, type])

  const searchNow = useCallback(
    async (offset: number) => {
      if (!profileId || blocked) return
      const id = ++reqId.current
      setLoading(true)
      try {
        const res = await call<{ hits: ModrinthHit[]; total: number }>('content:search', profileId, type, query, offset, sort)
        if (id !== reqId.current) return
        setHits((h) => (offset ? [...h, ...res.hits] : res.hits))
        setTotal(res.total)
      } catch (e) {
        if (id === reqId.current) toast('error', (e as Error).message)
      } finally {
        if (id === reqId.current) setLoading(false)
      }
    },
    [profileId, type, query, sort, blocked, toast]
  )

  useEffect(() => {
    const t = setTimeout(() => void searchNow(0), 350)
    return () => clearTimeout(t)
  }, [searchNow])
  useEffect(loadInstalled, [loadInstalled])

  const installedIds = new Set(installed.map((m) => m.projectId).filter(Boolean))

  return (
    <>
      <Background dim />
      <TopBar title="Mod Mağazası" />
      <div className="page">
        <div className="page-head">
          <div className="row wrap">
            <Seg value={type} onChange={setType} options={TYPES} />
          </div>
          <div className="row">
            <span className="muted small">Profil</span>
            <select className="select" style={{ width: 240 }} value={profileId} onChange={(e) => setProfileId(e.target.value)}>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {versionLabel(p)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="tabs">
          <button className={tab === 'browse' ? 'on' : ''} onClick={() => setTab('browse')}>
            <Search /> Keşfet
          </button>
          <button className={tab === 'installed' ? 'on' : ''} onClick={() => setTab('installed')}>
            <Package /> Yüklü <span className="tag">{installed.length}</span>
          </button>
          <div className="grow" />
          <button className="btn sm ghost" onClick={() => call('shell:openFolder', FOLDER[type], profileId).catch((e) => toast('error', e.message))}>
            <FolderOpen /> Klasörü aç
          </button>
        </div>

        {blocked ? (
          <div className="card">
            <Empty icon={<Puzzle />} title="Bu profil Vanilla" text="Mod ve shader kurmak için Fabric kullanan bir profil seç ya da Profiller sayfasından yeni bir Fabric profili oluştur." />
          </div>
        ) : tab === 'browse' ? (
          <>
            <div className="row" style={{ marginBottom: 16 }}>
              <div className="search" style={{ flex: 1 }}>
                <Search />
                <input className="input" placeholder={`${TYPES.find((t) => t.value === type)?.label} içinde ara…`} value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              <select className="select" style={{ width: 190 }} value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="relevance">En alakalı</option>
                <option value="downloads">En çok indirilen</option>
                <option value="follows">En popüler</option>
                <option value="newest">En yeni</option>
                <option value="updated">Son güncellenen</option>
              </select>
            </div>
            {loading && !hits.length ? (
              <div className="grid g3">
                {Array.from({ length: 9 }).map((_, i) => (
                  <div key={i} className="skeleton" style={{ height: 104 }} />
                ))}
              </div>
            ) : hits.length === 0 ? (
              <div className="card">
                <Empty icon={<Search />} title="Sonuç bulunamadı" text="Farklı bir arama dene." />
              </div>
            ) : (
              <>
                <div className="grid g3">
                  {hits.map((h) => {
                    const done = installedIds.has(h.projectId)
                    return (
                      <div key={h.projectId} className="card hover mod-card">
                        {h.icon ? <img className="mod-icon" src={h.icon} alt="" loading="lazy" /> : <div className="mod-icon"><Puzzle /></div>}
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <h4 className="ellipsis">{h.title}</h4>
                          <span className="tiny muted">{h.author}</span>
                          <p>{h.description}</p>
                          <div className="row between">
                            <div className="row tiny muted" style={{ gap: 10 }}>
                              <span className="row" style={{ gap: 4 }}>
                                <Download width={12} /> {compact(h.downloads)}
                              </span>
                              <span className="row" style={{ gap: 4 }}>
                                <Heart width={12} /> {compact(h.follows)}
                              </span>
                            </div>
                            <button
                              className={`btn sm ${done ? '' : 'primary'}`}
                              disabled={busy === h.projectId}
                              onClick={() =>
                                run(
                                  h.projectId,
                                  async () => {
                                    const titles = await call<string[]>('content:install', profileId, h.projectId, type)
                                    loadInstalled()
                                    toast('success', titles.length > 1 ? `${titles[0]} ve ${titles.length - 1} bağımlılık kuruldu` : `${titles[0] ?? h.title} kuruldu`)
                                  }
                                )
                              }
                            >
                              {busy === h.projectId ? <Spinner size={13} /> : done ? <Check /> : <Download />}
                              {done ? 'Güncelle' : 'Kur'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
                {hits.length < total && (
                  <div className="row" style={{ justifyContent: 'center', marginTop: 18 }}>
                    <button className="btn" disabled={loading} onClick={() => searchNow(hits.length)}>
                      {loading && <Spinner size={14} />} Daha fazla göster
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        ) : installed.length === 0 ? (
          <div className="card">
            <Empty icon={<Package />} title="Henüz bir şey kurulmamış" text="Keşfet sekmesinden içerik kurabilir ya da dosyaları klasöre sürükleyebilirsin." />
          </div>
        ) : (
          <div className="list">
            {installed.map((m) => (
              <div key={m.file} className={`list-item ${m.enabled ? '' : 'off'}`}>
                {m.icon ? <img className="mod-icon" src={m.icon} alt="" /> : <div className="mod-icon"><Puzzle /></div>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b className="ellipsis" style={{ display: 'block' }}>
                    {m.name}
                  </b>
                  <span className="tiny muted ellipsis" style={{ display: 'block' }}>
                    {m.version ? `${m.version} · ` : ''}
                    {bytes(m.size)} · {m.file}
                  </span>
                </div>
                <Switch
                  on={m.enabled}
                  label={`${m.name} etkin`}
                  onChange={() => run(m.file, async () => {
                    await call('content:toggle', profileId, type, m.file)
                    loadInstalled()
                  })}
                />
                <button
                  className="btn sm icon danger"
                  title="Sil"
                  onClick={() =>
                    run(m.file, async () => {
                      await call('content:remove', profileId, type, m.file)
                      loadInstalled()
                    }, `${m.name} kaldırıldı`)
                  }
                >
                  <Trash2 />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
