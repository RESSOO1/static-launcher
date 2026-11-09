import { useEffect, useMemo, useState } from 'react'
import { Box, Check, FolderOpen, Layers, Pencil, Play, Plus, Sparkles, Swords, Trash2, Wrench } from 'lucide-react'
import type { Loader, McVersion, Profile } from '@shared/types'
import { call } from '@/lib/api'
import { useApp } from '@/lib/store'
import { ago, playtime, ram } from '@/lib/format'
import { TopBar } from '@/components/Shell'
import { Confirm, Modal, Seg, Spinner, useAction } from '@/components/ui'
import { versionLabel } from './Home'

const ICONS: Record<string, React.ReactNode> = { survival: <Sparkles />, classic: <Swords />, vanilla: <Box /> }

export function Profiles() {
  const { profiles, settings, updateSettings, play, game, refreshProfiles, toast, setPage } = useApp()
  const [editing, setEditing] = useState<Profile | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Profile | null>(null)
  const { busy, run } = useAction(toast)
  const managed = profiles.filter((p) => p.managed)
  const custom = profiles.filter((p) => !p.managed)

  const card = (p: Profile) => (
    <div key={p.id} className={`card hover pcard ${settings.selectedProfileId === p.id ? 'sel' : ''}`} style={p.accent ? ({ '--pc': p.accent } as React.CSSProperties) : undefined}>
      <div className="pcard-top">
        <div className="pic">{ICONS[p.id] ?? <Layers />}</div>
        <div className="row">
          {p.managed && <span className="tag accent">Sunucu modu</span>}
          {settings.selectedProfileId === p.id && (
            <span className="tag ok">
              <Check /> Seçili
            </span>
          )}
        </div>
      </div>
      <div className="pcard-body">
        <h4>{p.name}</h4>
        <p>{p.description || versionLabel(p)}</p>
        <div className="row wrap" style={{ gap: 6 }}>
          <span className="tag">{versionLabel(p)}</span>
          <span className="tag">{ram(p.ramMB ?? settings.ramMB)}</span>
          <span className="tag">{playtime(p.playTimeSec)}</span>
        </div>
        <span className="tiny muted">Son oynama: {ago(p.lastPlayed)}</span>
        <div className="pcard-actions">
          <button
            className="btn primary sm"
            disabled={game.status !== 'idle'}
            onClick={async () => {
              await updateSettings({ selectedProfileId: p.id })
              setPage('home')
              void play(p.id)
            }}
          >
            <Play /> Oyna
          </button>
          {settings.selectedProfileId !== p.id && (
            <button className="btn sm" onClick={() => updateSettings({ selectedProfileId: p.id })}>
              Seç
            </button>
          )}
          <div className="grow" />
          <button className="btn sm icon" title="Düzenle" onClick={() => setEditing(p)}>
            <Pencil />
          </button>
          <button className="btn sm icon" title="Klasörü aç" onClick={() => call('shell:openFolder', 'instance', p.id).catch((e) => toast('error', e.message))}>
            <FolderOpen />
          </button>
          <button className="btn sm icon" title="Dosyaları onar" disabled={busy === p.id || game.status !== 'idle'} onClick={() => run(p.id, () => call('game:repair', p.id), 'Dosyalar doğrulandı ve onarıldı')}>
            {busy === p.id ? <Spinner size={14} /> : <Wrench />}
          </button>
          {!p.managed && (
            <button className="btn sm icon danger" title="Sil" onClick={() => setDeleting(p)}>
              <Trash2 />
            </button>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <>
      <TopBar title="Profiller" />
      <div className="page">
        <div className="page-head">
          <p>Sunucu modları hazır gelir. Kendi profilini oluşturup istediğin sürümü ve Fabric’i kurabilirsin; her profilin modları ve dünyaları ayrı tutulur.</p>
          <button className="btn primary" onClick={() => setEditing('new')}>
            <Plus /> Yeni profil
          </button>
        </div>
        <div className="section-title">
          <h3>Sunucu modları</h3>
        </div>
        <div className="grid g3">{managed.map(card)}</div>
        <div className="section-title">
          <h3>Profillerim</h3>
          <span className="muted small">{custom.length} profil</span>
        </div>
        {custom.length ? (
          <div className="grid g3">{custom.map(card)}</div>
        ) : (
          <div className="card">
            <div className="empty">
              <Layers />
              <b>Henüz kendi profilin yok</b>
              <span>İstediğin Minecraft sürümüyle yeni bir profil oluştur.</span>
              <button className="btn primary sm" onClick={() => setEditing('new')}>
                <Plus /> Profil oluştur
              </button>
            </div>
          </div>
        )}
      </div>
      {editing && (
        <ProfileEditor
          profile={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async (p) => {
            setEditing(null)
            await refreshProfiles()
            if (editing === 'new') await updateSettings({ selectedProfileId: p.id })
            toast('success', editing === 'new' ? `${p.name} oluşturuldu` : 'Profil kaydedildi')
          }}
        />
      )}
      {deleting && (
        <Confirm
          title={`${deleting.name} silinsin mi?`}
          text="Bu profildeki dünyalar, modlar ve ekran görüntüleri kalıcı olarak silinir. Önemli dünyaları önce Galeri & Dünyalar sayfasından yedekleyebilirsin."
          confirmLabel="Profili sil"
          danger
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            try {
              await call('profiles:delete', deleting.id)
              await refreshProfiles()
              toast('success', 'Profil silindi')
            } catch (e) {
              toast('error', (e as Error).message)
            }
          }}
        />
      )}
    </>
  )
}

function ProfileEditor({ profile, onClose, onSaved }: { profile: Profile | null; onClose: () => void; onSaved: (p: Profile) => void }) {
  const { settings, system, toast } = useApp()
  const [name, setName] = useState(profile?.name ?? '')
  const [description, setDescription] = useState(profile?.description ?? '')
  const [mcVersion, setMcVersion] = useState(profile?.mcVersion ?? '')
  const [loader, setLoader] = useState<Loader>(profile?.loader ?? 'fabric')
  const [loaderVersion, setLoaderVersion] = useState(profile?.loaderVersion ?? '')
  const [customRam, setCustomRam] = useState(!!profile?.ramMB)
  const [ramMB, setRamMB] = useState(profile?.ramMB ?? settings.ramMB)
  const [versions, setVersions] = useState<McVersion[]>([])
  const [loaders, setLoaders] = useState<string[]>([])
  const [snap, setSnap] = useState(settings.showSnapshots)
  const [saving, setSaving] = useState(false)
  const locked = profile?.managed

  useEffect(() => {
    call<McVersion[]>('versions:list', snap)
      .then((v) => {
        setVersions(v)
        setMcVersion((cur) => cur || v.find((x) => x.type === 'release')?.id || '')
      })
      .catch((e) => toast('error', e.message))
  }, [snap, toast])
  useEffect(() => {
    if (loader === 'fabric' && !loaders.length) call<string[]>('versions:fabric').then(setLoaders).catch(() => undefined)
  }, [loader, loaders.length])

  const options = useMemo(() => {
    const list = versions.map((v) => v.id)
    if (mcVersion && !list.includes(mcVersion)) list.unshift(mcVersion)
    return list
  }, [versions, mcVersion])

  const save = async () => {
    setSaving(true)
    try {
      const input = { name: name.trim(), description, mcVersion, loader, loaderVersion: loader === 'fabric' && loaderVersion ? loaderVersion : undefined, ramMB: customRam ? ramMB : 0 }
      const p = profile ? await call<Profile>('profiles:update', profile.id, input) : await call<Profile>('profiles:create', input)
      onSaved(p)
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const max = Math.max(2048, Math.floor(system.totalRamMB * 0.85 / 512) * 512)
  return (
    <Modal
      title={profile ? `${profile.name} ayarları` : 'Yeni profil'}
      icon={<Layers />}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn primary" disabled={saving || (!locked && (!name.trim() || !mcVersion))} onClick={save}>
            {saving && <Spinner size={14} />} {profile ? 'Kaydet' : 'Oluştur'}
          </button>
        </>
      }
    >
      {!locked && (
        <>
          <div className="grid g2">
            <div className="field">
              <label>Profil adı</label>
              <input className="input" value={name} maxLength={40} autoFocus placeholder="ör. Modlu Survival" onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label>Minecraft sürümü</label>
              <select className="select" value={mcVersion} onChange={(e) => setMcVersion(e.target.value)}>
                {options.length === 0 && <option>Yükleniyor…</option>}
                {options.map((v) => (
                  <option key={v} value={v}>
                    {v === 'latest' ? 'En son sürüm' : v}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label>Açıklama</label>
            <input className="input" value={description} maxLength={300} placeholder="İsteğe bağlı" onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="row between">
            <div className="field">
              <label>Mod yükleyici</label>
              <Seg<Loader>
                value={loader}
                onChange={setLoader}
                options={[
                  { value: 'fabric', label: 'Fabric' },
                  { value: 'vanilla', label: 'Vanilla' }
                ]}
              />
            </div>
            <label className="row small muted" style={{ cursor: 'pointer' }}>
              <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} /> Snapshot sürümlerini göster
            </label>
          </div>
          {loader === 'fabric' && (
            <div className="field">
              <label>Fabric sürümü</label>
              <select className="select" value={loaderVersion} onChange={(e) => setLoaderVersion(e.target.value)}>
                <option value="">En son kararlı sürüm (önerilen)</option>
                {loaders.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      )}
      {locked && <div className="note">Bu bir sunucu modu; sürümü ve modları sunucu tarafından belirlenir. Bu profil için sadece RAM ayarını değiştirebilirsin.</div>}
      <div className="field">
        <div className="row between">
          <label>Bu profile özel RAM</label>
          <input type="checkbox" checked={customRam} onChange={(e) => setCustomRam(e.target.checked)} aria-label="Özel RAM" />
        </div>
        {customRam ? (
          <>
            <input className="range" type="range" min={1024} max={max} step={512} value={ramMB} style={{ '--fill': `${((ramMB - 1024) / (max - 1024)) * 100}%` } as React.CSSProperties} onChange={(e) => setRamMB(Number(e.target.value))} />
            <span className="help">{ram(ramMB)} ayrılacak</span>
          </>
        ) : (
          <span className="help">Genel ayar kullanılıyor ({ram(settings.ramMB)})</span>
        )}
      </div>
    </Modal>
  )
}
