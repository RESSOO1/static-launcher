import { useState } from 'react'
import { ArrowLeft, ArrowRight, Cpu, Gauge, Rocket, Package, ShieldCheck, Sparkles, Server, Zap } from 'lucide-react'
import logo from '@/assets/logo.png'
import { call } from '@/lib/api'
import { useApp } from '@/lib/store'
import { ram } from '@/lib/format'
import type { PerformancePreset } from '@shared/types'
import { SkinViewer } from './SkinViewer'
import { useSkin } from './Avatar'
import { Spinner } from './ui'
import { WindowControls } from './Shell'

const NAME_RE = /^[A-Za-z0-9_]{3,16}$/

export function suggest(total: number, p: PerformancePreset): number {
  const ratio = p === 'low' ? 0.25 : p === 'high' ? 0.5 : 0.35
  const cap = p === 'high' ? 12288 : 8192
  return Math.max(2048, Math.min(cap, Math.round((total * ratio) / 512) * 512))
}

export function Wizard() {
  const { system, config, refreshAccounts, updateSettings, accounts, toast } = useApp()
  const [step, setStep] = useState(0)
  const [name, setName] = useState(accounts[0]?.name ?? '')
  const [preset, setPreset] = useState<PerformancePreset>(system.totalRamMB <= 8192 ? 'low' : 'balanced')
  const [busy, setBusy] = useState(false)
  const valid = NAME_RE.test(name)
  const wizardSkin = useSkin()

  const finish = async () => {
    setBusy(true)
    try {
      await call('accounts:add', name)
      await updateSettings({ performance: preset, ramMB: suggest(system.totalRamMB, preset), firstRunDone: true })
      await refreshAccounts()
      toast('success', `Hoş geldin, ${name}!`)
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="wizard">
      <div className="wizard-drag">
        <WindowControls />
      </div>
      <div className="wizard-card">
        <div className="steps">
          {[0, 1, 2].map((i) => (
            <i key={i} className={i <= step ? 'on' : ''} />
          ))}
        </div>

        {step === 0 && (
          <>
            <img className="welcome-logo" src={logo} alt="" />
            <h2 style={{ textAlign: 'center' }}>{config.name} Launcher’a hoş geldin</h2>
            <p style={{ textAlign: 'center' }}>Birkaç saniyede kurulumu tamamlayıp oyuna geçelim.</p>
            <div className="feature-list">
              <div>
                <Rocket /> Tek tıkla kurulum
              </div>
              <div>
                <Package /> Mod mağazası
              </div>
              <div>
                <Server /> Canlı sunucu durumu
              </div>
              <div>
                <ShieldCheck /> Doğrulanmış indirmeler
              </div>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h2>Oyuncu adını seç</h2>
            <p>Oyunda ve sunucularda bu isimle görüneceksin. Daha sonra yeni isimler ekleyebilirsin.</p>
            <div className="row" style={{ gap: 18, alignItems: 'center' }}>
              <div style={{ width: 120, height: 170, flexShrink: 0 }}>
                <SkinViewer skin={wizardSkin} width={120} height={170} zoom={0.75} />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label htmlFor="wname">Oyuncu adı</label>
                <input
                  id="wname"
                  className={`input ${name && !valid ? 'err' : ''}`}
                  value={name}
                  maxLength={16}
                  autoFocus
                  placeholder="ör. Steve_TR"
                  onChange={(e) => setName(e.target.value.replace(/\s/g, ''))}
                  onKeyDown={(e) => e.key === 'Enter' && valid && setStep(2)}
                />
                {name && !valid ? <span className="error">3-16 karakter; sadece harf, rakam ve _ kullanılabilir.</span> : <span className="help">Türkçe karakter (ç, ş, ğ…) kullanılamaz.</span>}
              </div>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2>Bilgisayarına göre ayarlayalım</h2>
            <p>
              Bilgisayarında {ram(system.totalRamMB)} RAM ve {system.cpus} işlemci çekirdeği var. Sana uygun olanı seç; istediğin zaman Ayarlar’dan değiştirebilirsin.
            </p>
            <div className="row" style={{ alignItems: 'stretch' }}>
              {(
                [
                  ['low', 'Zayıf PC', 'Akıcılık öncelikli', <Cpu key="i" />],
                  ['balanced', 'Dengeli', 'Çoğu bilgisayar için', <Gauge key="i" />],
                  ['high', 'Güçlü PC', 'Maksimum performans', <Zap key="i" />]
                ] as const
              ).map(([id, title, sub, icon]) => (
                <button key={id} className={`preset ${preset === id ? 'on' : ''}`} onClick={() => setPreset(id)}>
                  {icon}
                  <b>{title}</b>
                  <small>{sub}</small>
                  <small style={{ color: 'var(--accent-text)', marginTop: 6 }}>{ram(suggest(system.totalRamMB, id))} RAM</small>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="wizard-foot">
          {step > 0 ? (
            <button className="btn ghost" onClick={() => setStep(step - 1)}>
              <ArrowLeft /> Geri
            </button>
          ) : (
            <span />
          )}
          {step < 2 ? (
            <button className="btn primary" disabled={step === 1 && !valid} onClick={() => setStep(step + 1)}>
              {step === 0 ? 'Başlayalım' : 'Devam'} <ArrowRight />
            </button>
          ) : (
            <button className="btn primary" disabled={busy} onClick={finish}>
              {busy ? <Spinner size={14} /> : <Sparkles />} Kurulumu bitir
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
