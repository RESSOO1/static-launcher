import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Download, Plus, Trash2, UserRound, X } from 'lucide-react'
import type { SkinItem } from '@shared/types'
import { call } from '@/lib/api'
import { useApp } from '@/lib/store'
import { gameDefaultSkin } from '@/lib/skin'
import { TopBar } from '@/components/Shell'
import { Avatar } from '@/components/Avatar'
import { SkinViewer, type SkinAnim } from '@/components/SkinViewer'
import { Confirm, Modal, Seg, Spinner } from '@/components/ui'
import { ago } from '@/lib/format'

const NAME_RE = /^[A-Za-z0-9_]{3,16}$/
const ANIMS: { value: SkinAnim; label: string }[] = [
  { value: 'idle', label: 'Dur' },
  { value: 'walk', label: 'Yürü' },
  { value: 'run', label: 'Koş' },
  { value: 'wave', label: 'El salla' }
]

/** Flat front view of a skin for the collection grid. */
function SkinFigure({ url }: { url: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!url) return
    let alive = true
    const im = new Image()
    im.onload = () => {
      const g = ref.current?.getContext('2d')
      if (!g || !alive) return
      const old = im.height === 32
      const B = (sx: number, sy: number, w: number, h: number, dx: number, dy: number) => g.drawImage(im, sx, sy, w, h, dx, dy, w, h)
      g.imageSmoothingEnabled = false
      g.clearRect(0, 0, 16, 32)
      B(8, 8, 8, 8, 4, 0)
      B(20, 20, 8, 12, 4, 8)
      B(44, 20, 4, 12, 0, 8)
      B(old ? 44 : 36, old ? 20 : 52, 4, 12, 12, 8)
      B(4, 20, 4, 12, 4, 20)
      B(old ? 4 : 20, old ? 20 : 52, 4, 12, 8, 20)
      B(40, 8, 8, 8, 4, 0)
      if (!old) {
        B(20, 36, 8, 12, 4, 8)
        B(44, 36, 4, 12, 0, 8)
        B(52, 52, 4, 12, 12, 8)
        B(4, 36, 4, 12, 4, 20)
        B(4, 52, 4, 12, 8, 20)
      }
    }
    im.src = url
    return () => {
      alive = false
    }
  }, [url])
  return <canvas ref={ref} width={16} height={32} />
}

export function Account() {
  const { accounts, selectedAccount, refreshAccounts, toast, bumpSkin, skinVersion } = useApp()
  const [items, setItems] = useState<SkinItem[]>([])
  const [currentId, setCurrentId] = useState('default')
  const [steve, setSteve] = useState('')
  const [anim, setAnim] = useState<SkinAnim>('idle')
  const [busy, setBusy] = useState(false)
  const [fetchName, setFetchName] = useState('')
  const [over, setOver] = useState(false)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const stage = useRef<HTMLDivElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const accountId = selectedAccount?.id

  const load = useCallback(() => {
    if (!accountId) return
    call<{ items: SkinItem[]; currentId: string }>('skins:list', accountId)
      .then((r) => {
        setItems(r.items)
        setCurrentId(r.currentId)
      })
      .catch((e) => toast('error', e.message))
  }, [accountId, toast])
  useEffect(load, [load, skinVersion])
  useEffect(() => void gameDefaultSkin().then(setSteve), [])

  useEffect(() => {
    const el = stage.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true)
    try {
      await fn()
      await refreshAccounts()
      bumpSkin()
      if (ok) toast('success', ok)
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const wear = (id: string, ok?: string) => (accountId ? act(() => call('skins:apply', accountId, id), ok) : Promise.resolve())

  const addFile = (file?: File) => {
    if (!file) return
    if (file.type !== 'image/png' || file.size > 1024 * 1024) return toast('error', 'Skin 1 MB altında bir PNG dosyası olmalı')
    const reader = new FileReader()
    reader.onerror = () => toast('error', 'Dosya okunamadı')
    reader.onload = () =>
      act(async () => {
        const item = await call<SkinItem>('skins:add', file.name.replace(/\.png$/i, ''), reader.result)
        if (accountId) await call('skins:apply', accountId, item.id)
      }, 'Skin eklendi ve giyildi')
    reader.readAsDataURL(file)
  }

  const fetchByName = () => {
    if (!NAME_RE.test(fetchName)) return toast('error', 'Geçerli bir oyuncu adı yaz')
    void act(async () => {
      const item = await call<SkinItem>('skins:fetch', fetchName)
      if (accountId) await call('skins:apply', accountId, item.id)
      setFetchName('')
    }, `${fetchName} skini eklendi ve giyildi`)
  }

  const worn = items.find((s) => s.id === currentId)
  const shown = worn?.url ?? steve
  const slim = selectedAccount?.slim

  return (
    <>
      <TopBar title="Gardırop" />
      <div className="wd">
        <div className="wd-stage" ref={stage}>
          <div className="wd-ped" />
          {selectedAccount && size.w > 0 && size.h > 0 ? <SkinViewer skin={shown} slim={slim} width={size.w} height={size.h} anim={anim} zoom={0.72} fov={38} rotate /> : null}
          <div className="wd-anim">
            <Seg value={anim} onChange={setAnim} options={ANIMS} />
          </div>
        </div>

        <div className="wd-side">
          <div className="wd-h">
            <h3>Skinlerim</h3>
            <span>{items.length + 1} skin</span>
          </div>
          <div className="skins">
            <div className={`skin ${currentId === 'default' ? 'on' : ''}`} role="button" tabIndex={0} aria-label="Steve skinini giy" onClick={() => void wear('default')} onKeyDown={(e) => e.key === 'Enter' && void wear('default')}>
              <SkinFigure url={steve} />
              <b>Steve</b>
              {currentId === 'default' && <Check className="ck" />}
            </div>
            {items.map((s) => (
              <div key={s.id} className={`skin ${currentId === s.id ? 'on' : ''}`} role="button" tabIndex={0} aria-label={`${s.name} skinini giy`} onClick={() => void wear(s.id)} onKeyDown={(e) => e.key === 'Enter' && void wear(s.id)}>
                <SkinFigure url={s.url} />
                <b title={s.name}>{s.name}</b>
                {currentId === s.id && <Check className="ck" />}
                <button
                  className="rm"
                  title="Koleksiyondan kaldır"
                  aria-label={`${s.name} skinini kaldır`}
                  onClick={(e) => {
                    e.stopPropagation()
                    void act(async () => {
                      if (currentId === s.id && accountId) await call('skins:apply', accountId, 'default')
                      await call('skins:remove', s.id)
                    })
                  }}
                >
                  <X />
                </button>
              </div>
            ))}
            <button
              className={`skin add ${over ? 'over' : ''}`}
              disabled={busy}
              onClick={() => picker.current?.click()}
              onDragOver={(e) => {
                e.preventDefault()
                setOver(true)
              }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setOver(false)
                addFile(e.dataTransfer.files[0])
              }}
            >
              {busy ? <Spinner size={24} /> : <Plus />}
              <b>Skin yükle</b>
              <small>PNG seç ya da buraya sürükle</small>
            </button>
            <input
              ref={picker}
              type="file"
              accept="image/png"
              hidden
              onChange={(e) => {
                addFile(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </div>

          {selectedAccount && (
            <div className="wd-row">
              <span className="small muted">Kol modeli</span>
              <Seg
                value={slim ? 'slim' : 'classic'}
                onChange={(v) =>
                  void act(async () => {
                    await call('skin:setSlim', selectedAccount.id, v === 'slim')
                    await call('skins:setSlim', currentId, v === 'slim')
                  })
                }
                options={[
                  { value: 'classic', label: 'Klasik' },
                  { value: 'slim', label: 'İnce' }
                ]}
              />
              <button
                className="btn sm"
                title="Skini PNG olarak kaydet (ör. sunucudaki SkinsRestorer'a yüklemek için)"
                disabled={!shown}
                onClick={() =>
                  call<boolean>('skin:export', shown, (worn?.name ?? 'skin').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 40) || 'skin')
                    .then((ok) => ok && toast('success', 'Skin kaydedildi'))
                    .catch((e) => toast('error', e.message))
                }
              >
                <Download /> PNG olarak kaydet
              </button>
            </div>
          )}

          <div className="wd-fetch">
            <input className="input" maxLength={16} placeholder="Premium oyuncu adından skin getir" aria-label="Oyuncu adı" value={fetchName} onChange={(e) => setFetchName(e.target.value.replace(/\s/g, ''))} onKeyDown={(e) => e.key === 'Enter' && fetchByName()} />
            <button className="btn" disabled={busy || !fetchName} onClick={fetchByName}>
              Getir
            </button>
          </div>
          <p className="hint">Skinler launcher’da hemen görünür. Sunucuda başkalarının da görmesi için sunucuda SkinsRestorer gibi bir eklenti gerekir.</p>

          <div className="wd-h">
            <h3>Oyuncu adların</h3>
            <button className="btn sm" onClick={() => setAdding(true)}>
              <Plus /> Yeni isim
            </button>
          </div>
          <div className="list">
            {accounts.map((a) => (
              <div key={a.id} className={`acc-item ${a.id === selectedAccount?.id ? 'on' : ''}`} onClick={() => a.id !== selectedAccount?.id && void act(() => call('accounts:select', a.id), `${a.name} seçildi`)}>
                <Avatar accountId={a.id} hasSkin={a.hasSkin} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b className="ellipsis" style={{ display: 'block' }}>
                    {a.name}
                  </b>
                  <div className="tiny muted">Eklendi: {ago(a.createdAt)}</div>
                </div>
                {a.id === selectedAccount?.id && (
                  <span className="tag ok">
                    <Check /> Aktif
                  </span>
                )}
                <button
                  className="btn sm icon ghost"
                  title="Kaldır"
                  aria-label={`${a.name} adını kaldır`}
                  disabled={accounts.length <= 1}
                  onClick={(e) => {
                    e.stopPropagation()
                    setRemoving(a.id)
                  }}
                >
                  <Trash2 />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
      {adding && (
        <AddAccount
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false)
            void act(async () => undefined)
          }}
        />
      )}
      {removing && (
        <Confirm
          title="Bu isim kaldırılsın mı?"
          text="İsim launcher’dan kaldırılır. Dünyaların, profillerin ve skin koleksiyonun etkilenmez."
          confirmLabel="Kaldır"
          danger
          onClose={() => setRemoving(null)}
          onConfirm={() => act(() => call('accounts:remove', removing), 'Kaldırıldı')}
        />
      )}
    </>
  )
}

export function AddAccount({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const { toast } = useApp()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const valid = NAME_RE.test(name)
  const submit = async () => {
    if (!valid) return
    setBusy(true)
    try {
      await call('accounts:add', name)
      toast('success', `${name} eklendi`)
      onAdded()
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      title="Yeni oyuncu adı"
      icon={<UserRound />}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn primary" disabled={!valid || busy} onClick={submit}>
            {busy && <Spinner size={14} />} Ekle
          </button>
        </>
      }
    >
      <div className="field">
        <label>Oyuncu adı</label>
        <input className={`input ${name && !valid ? 'err' : ''}`} value={name} maxLength={16} autoFocus onChange={(e) => setName(e.target.value.replace(/\s/g, ''))} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        <span className={name && !valid ? 'error' : 'help'}>3-16 karakter; harf, rakam ve alt çizgi.</span>
      </div>
      <span className="small muted">Eklenen isim otomatik olarak aktif olur.</span>
    </Modal>
  )
}
