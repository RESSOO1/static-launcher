import { useState } from 'react'
import { Check, Download, Footprints, Info, Plus, RotateCw, Shirt, Trash2, Upload, UserRound } from 'lucide-react'
import { call } from '@/lib/api'
import { useApp } from '@/lib/store'
import { Background, TopBar } from '@/components/Shell'
import { Avatar, useSkin } from '@/components/Avatar'
import { SkinViewer } from '@/components/SkinViewer'
import { Confirm, Modal, Seg, Spinner } from '@/components/ui'
import { ago } from '@/lib/format'

const NAME_RE = /^[A-Za-z0-9_]{3,16}$/

export function Account() {
  const { accounts, selectedAccount, refreshAccounts, toast, bumpSkin } = useApp()
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [walk, setWalk] = useState(true)
  const [rotate, setRotate] = useState(true)
  const [busy, setBusy] = useState(false)
  const skin = useSkin(selectedAccount?.id, selectedAccount?.hasSkin)

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

  return (
    <>
      <Background dim />
      <TopBar title="Hesap & Skin" />
      <div className="page">
        <div className="account-layout" style={{ marginTop: 6 }}>
          <div className="col">
            <div className="card skin-stage">
              {selectedAccount ? <SkinViewer skin={skin} slim={selectedAccount.slim} width={300} height={420} walk={walk} rotate={rotate} zoom={0.85} /> : <UserRound width={60} className="muted" />}
            </div>
            <div className="row" style={{ justifyContent: 'center' }}>
              <button className={`btn sm ${walk ? 'primary' : ''}`} onClick={() => setWalk(!walk)}>
                <Footprints /> Yürüme
              </button>
              <button className={`btn sm ${rotate ? 'primary' : ''}`} onClick={() => setRotate(!rotate)}>
                <RotateCw /> Döndür
              </button>
            </div>
          </div>

          <div className="col" style={{ gap: 16 }}>
            {selectedAccount && (
              <div className="card pad col">
                <div className="row">
                  <Avatar accountId={selectedAccount.id} hasSkin={selectedAccount.hasSkin} size={52} />
                  <div style={{ flex: 1 }}>
                    <b style={{ fontSize: 18 }}>{selectedAccount.name}</b>
                    <div className="tiny muted" style={{ userSelect: 'text' }}>
                      UUID: {selectedAccount.uuid}
                    </div>
                  </div>
                  <span className="tag">Çevrimdışı</span>
                </div>
                <div className="row wrap" style={{ marginTop: 6 }}>
                  <button className="btn primary sm" disabled={busy} onClick={() => act(async () => {
                    const changed = await call<boolean>('skin:choose', selectedAccount.id, selectedAccount.slim)
                    if (changed) toast('success', 'Skin güncellendi')
                  })}>
                    {busy ? <Spinner size={13} /> : <Upload />} Skin yükle (.png)
                  </button>
                  {selectedAccount.hasSkin && (
                    <button className="btn sm" disabled={busy} onClick={() => act(() => call('skin:clear', selectedAccount.id), 'Varsayılan skine (Steve) dönüldü')}>
                      <Shirt /> Varsayılana (Steve) dön
                    </button>
                  )}
                  <button
                    className="btn sm"
                    title="Skini PNG olarak kaydet (ör. sunucudaki SkinsRestorer'a yüklemek için)"
                    onClick={() =>
                      call<boolean>('skin:export', skin, selectedAccount.hasSkin ? selectedAccount.name : 'static-skin')
                        .then((ok) => ok && toast('success', 'Skin kaydedildi'))
                        .catch((e) => toast('error', e.message))
                    }
                  >
                    <Download /> PNG olarak kaydet
                  </button>
                  <div className="grow" />
                  <span className="small muted">Kol modeli</span>
                  <Seg
                    value={selectedAccount.slim ? 'slim' : 'classic'}
                    onChange={(v) => act(() => call('skin:setSlim', selectedAccount.id, v === 'slim'))}
                    options={[
                      { value: 'classic', label: 'Klasik' },
                      { value: 'slim', label: 'İnce' }
                    ]}
                  />
                </div>
                <div className="note" style={{ marginTop: 6 }}>
                  <Info />
                  <span>Yüklediğin skin launcher’da görünür. Oyunda başkalarının da görmesi için sunucuda SkinsRestorer gibi bir eklenti olması gerekir; çevrimdışı hesaplarda Minecraft skinleri doğrudan yüklemez.</span>
                </div>
              </div>
            )}

            <div className="card pad col">
              <div className="row between">
                <b>Oyuncu adların</b>
                <button className="btn sm" onClick={() => setAdding(true)}>
                  <Plus /> Yeni isim
                </button>
              </div>
              {accounts.map((a) => (
                <div key={a.id} className={`acc-item ${a.id === selectedAccount?.id ? 'on' : ''}`} onClick={() => a.id !== selectedAccount?.id && act(() => call('accounts:select', a.id), `${a.name} seçildi`)}>
                  <Avatar accountId={a.id} hasSkin={a.hasSkin} />
                  <div style={{ flex: 1 }}>
                    <b>{a.name}</b>
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
      </div>
      {adding && <AddAccount onClose={() => setAdding(false)} onAdded={() => act(async () => setAdding(false))} />}
      {removing && (
        <Confirm
          title="Bu isim kaldırılsın mı?"
          text="İsim ve yüklediğin skin launcher’dan kaldırılır. Dünyaların ve profillerin etkilenmez."
          confirmLabel="Kaldır"
          danger
          onClose={() => setRemoving(null)}
          onConfirm={() => act(() => call('accounts:remove', removing), 'Kaldırıldı')}
        />
      )}
    </>
  )
}

function AddAccount({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
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
