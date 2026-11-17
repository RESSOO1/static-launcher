import { useCallback, useEffect, useRef, useState } from 'react'
import { Boxes, Check, Download, FolderOpen, Image as ImageIcon, Package, Puzzle, Search, Sparkles, Trash2, X } from 'lucide-react'
import type { ContentType, InstalledMod, ModrinthHit, PackProgress, Profile } from '@shared/types'
import { call, on } from '@/lib/api'
import { useApp } from '@/lib/store'
import { bytes, compact } from '@/lib/format'
import { TopBar } from '@/components/Shell'
import { Empty, Modal, Seg, Spinner, Switch, useAction } from '@/components/ui'
import { versionLabel } from './Home'

type StoreType = ContentType | 'modpack'

const TYPES: { value: StoreType; label: string; icon: React.ReactNode }[] = [
  { value: 'modpack', label: 'Mod paketleri', icon: <Boxes /> },
  { value: 'mod', label: 'Modlar', icon: <Puzzle /> },
  { value: 'resourcepack', label: 'Kaynak paketleri', icon: <ImageIcon /> },
  { value: 'shader', label: 'Shader', icon: <Sparkles /> }
]
const FOLDER: Record<ContentType, string> = { mod: 'mods', resourcepack: 'resourcepacks', shader: 'shaderpacks' }

function PackDialog({ title, progress }: { title: string; progress: PackProgress | null }) {
  const pct = progress && progress.progress >= 0 ? Math.round(progress.progress * 100) : null
  return (
    <Modal
      title={`${title} kuruluyor`}
      icon={<Boxes />}
      onClose={() => void call('pack:cancel')}
      footer={
        <button className="btn" onClick={() => call('pack:cancel')}>
          <X /> İptal
        </button>
      }
    >
      <div className="pack-progress">
        <div className="row between small">
          <span>{progress?.label ?? 'Hazırlanıyor'}</span>
          <span className="muted">
            {progress?.detail ? `${progress.detail} · ` : ''}
            {pct === null ? '' : `%${pct}`}
          </span>
        </div>
        <div className={`bar ${pct === null ? 'indeterminate' : ''}`}>
          <i style={{ width: `${Math.max(2, pct ?? 0)}%` }} />
        </div>
        <span className="tiny muted">Bittiğinde paket için yeni bir profil oluşur ve seçili hale gelir.</span>
      </div>
    </Modal>
  )
}

export function Store() {
  const { profiles, selectedProfile, toast, refreshProfiles, setPage } = useApp()
  const [profileId, setProfileId] = useState(selectedProfile?.id ?? profiles[0]?.id ?? '')
  const [type, setType] = useState<StoreType>('modpack')
  const [installingPack, setInstallingPack] = useState<string | null>(null)
  const [packProgress, setPackProgress] = useState<PackProgress | null>(null)
  const [tab, setTab] = useState<'browse' | 'installed'>('browse')
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<ModrinthHit[]>([])
  const [loading, setLoading] = useState(false)
  const [installed, setInstalled] = useState<InstalledMod[]>([])
  const { busy, run } = useAction(toast)
  const reqId = useRef(0)
  const profile = profiles.find((p) => p.id === profileId)
  const isPack = type === 'modpack'
  const blocked = (type === 'mod' || type === 'shader') && profile?.loader === 'vanilla'

  useEffect(() => on<PackProgress>('pack:progress', setPackProgress), [])

  const loadInstalled = useCallback(() => {
    if (!profileId || isPack) return setInstalled([])
    call<InstalledMod[]>('content:list', profileId, type).then(setInstalled).catch(() => setInstalled([]))
  }, [profileId, type, isPack])

  const searchNow = useCallback(
    async () => {
      if ((!profileId && !isPack) || blocked) return
      const id = ++reqId.current
      setLoading(true)
      try {
        const res = isPack ? await call<{ hits: ModrinthHit[] }>('pack:search', query) : await call<{ hits: ModrinthHit[] }>('content:search', profileId, type, query)
        if (id !== reqId.current) return
        setHits(res.hits)
      } catch (e) {
        if (id === reqId.current) toast('error', (e as Error).message)
      } finally {
        if (id === reqId.current) setLoading(false)
      }
    },
    [profileId, type, isPack, query, blocked, toast]
  )

  useEffect(() => {
    const t = setTimeout(() => void searchNow(), 350)
    return () => clearTimeout(t)
  }, [searchNow])
  useEffect(loadInstalled, [loadInstalled])

  const installedIds = new Set(installed.map((m) => m.projectId).filter(Boolean))

  const installPack = async (h: ModrinthHit) => {
    setPackProgress(null)
    setInstallingPack(h.title)
    try {
      const { profile: p, missing } = await call<{ profile: Profile; missing: string[] }>('pack:install', h.projectId, h.title)
      await refreshProfiles()
      if (missing.length) toast('error', `${p.name} kuruldu ama ${missing.length} mod yazarı launcher'dan indirmeye izin vermiyor: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}. Bunları CurseForge sitesinden indirip mods klasörüne atabilirsin.`)
      else toast('success', `${p.name} kuruldu. OYNA ile başlatabilirsin.`)
      setPage('home')
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setInstallingPack(null)
    }
  }

  return (
    <>
      <TopBar title="Mağaza" />
      <div className="page">
        <div className="page-head">
          <div className="row wrap">
            <Seg value={type} onChange={(t) => {
              setType(t)
              setTab('browse')
            }} options={TYPES} />
          </div>
          {!isPack && <div className="row">
            <span className="muted small">Profil</span>
            <select className="select" style={{ width: 240 }} value={profileId} onChange={(e) => setProfileId(e.target.value)}>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {versionLabel(p)}
                </option>
              ))}
            </select>
          </div>}
        </div>

        {!isPack && <div className="tabs">
          <button className={tab === 'browse' ? 'on' : ''} onClick={() => setTab('browse')}>
            <Search /> Keşfet
          </button>
          <button className={tab === 'installed' ? 'on' : ''} onClick={() => setTab('installed')}>
            <Package /> Yüklü <span className="tag">{installed.length}</span>
          </button>
          <div className="grow" />
          <button className="btn sm ghost" onClick={() => call('shell:openFolder', FOLDER[type as ContentType], profileId).catch((e) => toast('error', e.message))}>
            <FolderOpen /> Klasörü aç
          </button>
        </div>}

        {blocked ? (
          <div className="card">
            <Empty icon={<Puzzle />} title="Bu profil Vanilla" text="Mod ve shader kurmak için Fabric kullanan bir profil seç ya da Profiller sayfasından yeni bir Fabric profili oluştur." />
          </div>
        ) : isPack || tab === 'browse' ? (
          <>
            <div className="row" style={{ marginBottom: 8 }}>
              <div className="search" style={{ flex: 1 }}>
                <Search />
                <input className="input" placeholder="Listede ara ya da CurseForge proje numarası yaz…" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
            </div>
            <p className="tiny muted" style={{ margin: '0 0 16px' }}>İçerikler CurseForge'dan gelir. Şimdilik öne çıkan ve popüler olanlar listelenir; listede olmayan bir şey için CurseForge sayfasındaki "Project ID" numarasını yaz.</p>
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
                            </div>
                            <button
                              className={`btn sm ${done ? '' : 'primary'}`}
                              disabled={busy === h.projectId}
                              onClick={() =>
                                isPack ? void installPack(h) : run(
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
                              {done && !isPack ? 'Güncelle' : 'Kur'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
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
      {installingPack && <PackDialog title={installingPack} progress={packProgress} />}
    </>
  )
}
