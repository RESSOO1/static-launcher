import { useCallback, useEffect, useState } from 'react'
import { Archive, FolderOpen, Globe2, Images, RotateCcw, Trash2, X, ChevronLeft, ChevronRight } from 'lucide-react'
import type { BackupInfo, Screenshot, WorldInfo } from '@shared/types'
import { call } from '@/lib/api'
import { useApp } from '@/lib/store'
import { ago, bytes } from '@/lib/format'
import { TopBar } from '@/components/Shell'
import { Confirm, Empty, Spinner, useAction } from '@/components/ui'

type Tab = 'shots' | 'worlds' | 'backups'

export function Gallery() {
  const { profiles, selectedProfile, toast } = useApp()
  const [pid, setPid] = useState(selectedProfile?.id ?? profiles[0]?.id ?? '')
  const [tab, setTab] = useState<Tab>('shots')
  const [shots, setShots] = useState<Screenshot[]>([])
  const [worlds, setWorlds] = useState<WorldInfo[]>([])
  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<number | null>(null)
  const [confirm, setConfirm] = useState<{ title: string; text: string; label: string; action: () => Promise<void> } | null>(null)
  const { busy, run } = useAction(toast)

  const load = useCallback(async () => {
    if (!pid) return
    setLoading(true)
    try {
      const [s, w, b] = await Promise.all([call<Screenshot[]>('shots:list', pid), call<WorldInfo[]>('worlds:list', pid), call<BackupInfo[]>('backups:list', pid)])
      setShots(s)
      setWorlds(w)
      setBackups(b)
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [pid, toast])
  useEffect(() => void load(), [load])

  useEffect(() => {
    if (view === null) return
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setView(null)
      if (e.key === 'ArrowRight') setView((v) => (v === null ? v : Math.min(shots.length - 1, v + 1)))
      if (e.key === 'ArrowLeft') setView((v) => (v === null ? v : Math.max(0, v - 1)))
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [view, shots.length])

  const folder = tab === 'shots' ? 'screenshots' : tab === 'worlds' ? 'saves' : 'backups'

  return (
    <>
      <TopBar title="Galeri & Dünyalar" />
      <div className="page">
        <div className="page-head">
          <p>Ekran görüntülerine bak, dünyalarını tek tıkla yedekle ve gerektiğinde geri yükle.</p>
          <select className="select" style={{ width: 240 }} value={pid} onChange={(e) => setPid(e.target.value)}>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="tabs">
          <button className={tab === 'shots' ? 'on' : ''} onClick={() => setTab('shots')}>
            <Images /> Ekran görüntüleri <span className="tag">{shots.length}</span>
          </button>
          <button className={tab === 'worlds' ? 'on' : ''} onClick={() => setTab('worlds')}>
            <Globe2 /> Dünyalar <span className="tag">{worlds.length}</span>
          </button>
          <button className={tab === 'backups' ? 'on' : ''} onClick={() => setTab('backups')}>
            <Archive /> Yedekler <span className="tag">{backups.length}</span>
          </button>
          <div className="grow" />
          <button className="btn sm ghost" onClick={() => call('shell:openFolder', folder, pid).catch((e) => toast('error', e.message))}>
            <FolderOpen /> Klasörü aç
          </button>
        </div>

        {loading ? (
          <div className="shots">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ aspectRatio: '16/9' }} />
            ))}
          </div>
        ) : tab === 'shots' ? (
          shots.length ? (
            <div className="shots">
              {shots.map((s, i) => (
                <div key={s.file} className="shot" onClick={() => setView(i)}>
                  <img src={s.url} alt={s.file} loading="lazy" />
                </div>
              ))}
            </div>
          ) : (
            <div className="card">
              <Empty icon={<Images />} title="Henüz ekran görüntüsü yok" text="Oyunda F2 tuşuna basarak ekran görüntüsü alabilirsin; burada otomatik görünür." />
            </div>
          )
        ) : tab === 'worlds' ? (
          worlds.length ? (
            <div className="list">
              {worlds.map((w) => (
                <div key={w.folder} className="list-item">
                  <div className="mod-icon">
                    <Globe2 />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b className="ellipsis" style={{ display: 'block' }}>
                      {w.name}
                    </b>
                    <span className="tiny muted">
                      {ago(w.lastPlayed)} · {bytes(w.sizeBytes)}
                    </span>
                  </div>
                  <button
                    className="btn sm primary"
                    disabled={busy === w.folder}
                    onClick={() =>
                      run(w.folder, async () => {
                        await call('worlds:backup', pid, w.folder)
                        await load()
                      }, `${w.name} yedeklendi`)
                    }
                  >
                    {busy === w.folder ? <Spinner size={13} /> : <Archive />} Yedekle
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="card">
              <Empty icon={<Globe2 />} title="Bu profilde dünya yok" text="Tek oyunculu bir dünya oluşturduğunda burada listelenir." />
            </div>
          )
        ) : backups.length ? (
          <div className="list">
            {backups.map((b) => (
              <div key={b.file} className="list-item">
                <div className="mod-icon">
                  <Archive />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b className="ellipsis" style={{ display: 'block' }}>
                    {b.world}
                  </b>
                  <span className="tiny muted">
                    {new Date(b.createdAt).toLocaleString('tr-TR')} · {bytes(b.sizeBytes)}
                  </span>
                </div>
                <button
                  className="btn sm"
                  disabled={busy === b.file}
                  onClick={() =>
                    run(b.file, async () => {
                      const name = await call<string>('backups:restore', pid, b.file)
                      await load()
                      toast('success', `“${name}” olarak geri yüklendi`)
                    })
                  }
                >
                  {busy === b.file ? <Spinner size={13} /> : <RotateCcw />} Geri yükle
                </button>
                <button
                  className="btn sm icon danger"
                  title="Yedeği sil"
                  onClick={() =>
                    setConfirm({
                      title: 'Yedek silinsin mi?',
                      text: `${b.world} dünyasının bu yedeği kalıcı olarak silinecek.`,
                      label: 'Sil',
                      action: async () => {
                        await call('backups:delete', pid, b.file)
                        await load()
                      }
                    })
                  }
                >
                  <Trash2 />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="card">
            <Empty icon={<Archive />} title="Henüz yedek yok" text="Dünyalar sekmesinden bir dünyayı yedekleyebilirsin. Geri yükleme mevcut dünyanın üzerine yazmaz, yeni bir kopya oluşturur." />
          </div>
        )}
      </div>

      {view !== null && shots[view] && (
        <div className="lightbox" onClick={() => setView(null)}>
          <img src={shots[view].url} alt="" onClick={(e) => e.stopPropagation()} />
          <div className="row" onClick={(e) => e.stopPropagation()}>
            <button className="btn icon" disabled={view === 0} onClick={() => setView(view - 1)} aria-label="Önceki">
              <ChevronLeft />
            </button>
            <button className="btn icon" disabled={view === shots.length - 1} onClick={() => setView(view + 1)} aria-label="Sonraki">
              <ChevronRight />
            </button>
            <button
              className="btn icon danger"
              aria-label="Sil"
              onClick={() =>
                setConfirm({
                  title: 'Ekran görüntüsü silinsin mi?',
                  text: 'Bu görüntü kalıcı olarak silinecek.',
                  label: 'Sil',
                  action: async () => {
                    await call('shots:delete', pid, shots[view].file)
                    setView(null)
                    await load()
                  }
                })
              }
            >
              <Trash2 />
            </button>
            <button className="btn icon" onClick={() => setView(null)} aria-label="Kapat">
              <X />
            </button>
          </div>
        </div>
      )}
      {confirm && (
        <Confirm
          title={confirm.title}
          text={confirm.text}
          confirmLabel={confirm.label}
          danger
          onClose={() => setConfirm(null)}
          onConfirm={() => confirm.action().catch((e) => toast('error', e.message))}
        />
      )}
    </>
  )
}
