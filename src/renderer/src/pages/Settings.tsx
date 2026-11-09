import { useEffect, useState } from 'react'
import { Coffee, Cpu, FolderOpen, Gamepad2, Gauge, Info, MemoryStick, Monitor, Palette, RefreshCw, Rocket, Zap } from 'lucide-react'
import type { CloseBehavior, PerformancePreset } from '@shared/types'
import { call } from '@/lib/api'
import { useApp } from '@/lib/store'
import { ram } from '@/lib/format'
import { TopBar } from '@/components/Shell'
import { Seg, Switch } from '@/components/ui'
import { suggest } from '@/components/Wizard'

export function Settings() {
  const { settings, updateSettings, system, toast, update } = useApp()
  const [ramDraft, setRamDraft] = useState(settings.ramMB)
  const [jvm, setJvm] = useState(settings.jvmArgs)
  const [w, setW] = useState(String(settings.width))
  const [h, setH] = useState(String(settings.height))
  useEffect(() => setRamDraft(settings.ramMB), [settings.ramMB])

  const set = (patch: Parameters<typeof updateSettings>[0]) => updateSettings(patch).catch((e) => toast('error', e.message))
  const maxRam = Math.max(2048, Math.floor((system.totalRamMB * 0.85) / 512) * 512)
  const recommended = suggest(system.totalRamMB, settings.performance === 'custom' ? 'balanced' : settings.performance)
  const fill = `${((ramDraft - 1024) / (maxRam - 1024)) * 100}%`

  const preset = (p: PerformancePreset) => set({ performance: p, ...(p !== 'custom' ? { ramMB: suggest(system.totalRamMB, p) } : {}) })

  return (
    <>
      <TopBar title="Ayarlar" />
      <div className="page">
        <div className="settings">
          <div className="set-group">
            <h3>
              <Gauge /> Performans
            </h3>
            <div className="row" style={{ alignItems: 'stretch' }}>
              {(
                [
                  ['low', 'Zayıf PC', 'Akıcılık öncelikli, az RAM', <Cpu key="i" />],
                  ['balanced', 'Dengeli', 'Çoğu bilgisayar için ideal', <Gauge key="i" />],
                  ['high', 'Güçlü PC', 'Yüksek RAM, agresif GC', <Zap key="i" />],
                  ['custom', 'Özel', 'Her şeyi kendin ayarla', <Rocket key="i" />]
                ] as const
              ).map(([id, title, sub, icon]) => (
                <button key={id} className={`preset ${settings.performance === id ? 'on' : ''}`} onClick={() => preset(id)}>
                  {icon}
                  <b>{title}</b>
                  <small>{sub}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="set-group">
            <h3>
              <MemoryStick /> Bellek
            </h3>
            <div className="card">
              <div className="ram-box">
                <div className="row between">
                  <div>
                    <div className="ram-value">{ram(ramDraft)}</div>
                    <span className="small muted">
                      Önerilen: {ram(recommended)} · Bilgisayarda toplam {ram(system.totalRamMB)}
                    </span>
                  </div>
                  <button className="btn sm" onClick={() => set({ ramMB: recommended, performance: settings.performance === 'custom' ? 'balanced' : settings.performance })}>
                    Önerileni kullan
                  </button>
                </div>
                <input
                  className="range"
                  style={{ '--fill': fill, marginTop: 16 } as React.CSSProperties}
                  type="range"
                  min={1024}
                  max={maxRam}
                  step={512}
                  value={ramDraft}
                  onChange={(e) => setRamDraft(Number(e.target.value))}
                  onMouseUp={() => set({ ramMB: ramDraft, performance: 'custom' })}
                  onKeyUp={() => set({ ramMB: ramDraft, performance: 'custom' })}
                  aria-label="RAM miktarı"
                />
                <div className="ram-marks">
                  <span>1 GB</span>
                  <span>{ram(Math.round(maxRam / 2 / 512) * 512)}</span>
                  <span>{ram(maxRam)}</span>
                </div>
                {ramDraft > system.totalRamMB * 0.7 && <div className="note warn" style={{ marginTop: 12 }}>Toplam belleğin %70’inden fazlasını vermek Windows’u yavaşlatabilir.</div>}
              </div>
            </div>
          </div>

          <div className="set-group">
            <h3>
              <Monitor /> Oyun penceresi
            </h3>
            <div className="card">
              <div className="set-row">
                <div className="info">
                  <b>Çözünürlük</b>
                  <small>Oyun penceresinin açılış boyutu</small>
                </div>
                <div className="ctl">
                  <input className="input" style={{ width: 86 }} value={w} onChange={(e) => setW(e.target.value.replace(/\D/g, ''))} onBlur={() => set({ width: Number(w) || 1280 })} aria-label="Genişlik" />
                  <span className="muted">×</span>
                  <input className="input" style={{ width: 86 }} value={h} onChange={(e) => setH(e.target.value.replace(/\D/g, ''))} onBlur={() => set({ height: Number(h) || 720 })} aria-label="Yükseklik" />
                </div>
              </div>
              <div className="set-row">
                <div className="info">
                  <b>Tam ekran başlat</b>
                  <small>Oyun doğrudan tam ekran açılır</small>
                </div>
                <div className="ctl">
                  <Switch on={settings.fullscreen} onChange={(v) => set({ fullscreen: v })} label="Tam ekran" />
                </div>
              </div>
              <div className="set-row">
                <div className="info">
                  <b>Oyun açılınca launcher</b>
                  <small>Oyun penceresi açıldığında launcher ne yapsın</small>
                </div>
                <div className="ctl">
                  <Seg<CloseBehavior>
                    value={settings.closeBehavior}
                    onChange={(v) => set({ closeBehavior: v })}
                    options={[
                      { value: 'hide', label: 'Gizlensin' },
                      { value: 'minimize', label: 'Küçülsün' },
                      { value: 'keep', label: 'Açık kalsın' }
                    ]}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="set-group">
            <h3>
              <Coffee /> Java
            </h3>
            <div className="card">
              <div className="set-row">
                <div className="info">
                  <b>Java kurulumu</b>
                  <small className="ellipsis">{settings.javaPath ? settings.javaPath : 'Otomatik: her sürüme doğru Java launcher tarafından indirilir (önerilen)'}</small>
                </div>
                <div className="ctl">
                  {settings.javaPath && (
                    <button className="btn sm" onClick={() => set({ javaPath: '' })}>
                      Otomatiğe dön
                    </button>
                  )}
                  <button
                    className="btn sm"
                    onClick={async () => {
                      const p = await call<string | null>('java:choose')
                      if (p) await set({ javaPath: p })
                    }}
                  >
                    <FolderOpen /> Java seç
                  </button>
                </div>
              </div>
              <div className="set-row" style={{ alignItems: 'flex-start' }}>
                <div className="info">
                  <b>Ek JVM argümanları</b>
                  <small>Sadece ne yaptığını biliyorsan değiştir. Performans ön ayarının argümanlarına eklenir.</small>
                  <input className="input" style={{ marginTop: 10, fontFamily: 'Consolas, monospace', fontSize: 12 }} value={jvm} maxLength={2000} placeholder="-Dfile.encoding=UTF-8" onChange={(e) => setJvm(e.target.value)} onBlur={() => set({ jvmArgs: jvm })} />
                </div>
              </div>
            </div>
          </div>

          <div className="set-group">
            <h3>
              <Palette /> Launcher
            </h3>
            <div className="card">
              <div className="set-row">
                <div className="info">
                  <b>Animasyonlar</b>
                  <small>Kıvılcımlar, parıltılar ve geçişler</small>
                </div>
                <div className="ctl">
                  <Switch on={settings.animations} onChange={(v) => set({ animations: v })} label="Animasyonlar" />
                </div>
              </div>
              <div className="set-row">
                <div className="info">
                  <b>Discord durumu</b>
                  <small>Discord profilinde ne oynadığın görünsün</small>
                </div>
                <div className="ctl">
                  <Switch on={settings.discordRpc} onChange={(v) => set({ discordRpc: v })} label="Discord" />
                </div>
              </div>
              <div className="set-row">
                <div className="info">
                  <b>Eşzamanlı indirme</b>
                  <small>İnternetin yavaşsa düşür ({settings.maxDownloads} dosya)</small>
                </div>
                <div className="ctl">
                  <Seg
                    value={String(settings.maxDownloads)}
                    onChange={(v) => set({ maxDownloads: Number(v) })}
                    options={['4', '8', '16', '32'].map((v) => ({ value: v, label: v }))}
                  />
                </div>
              </div>
              <div className="set-row">
                <div className="info">
                  <b>Snapshot sürümleri</b>
                  <small>Profil oluştururken deneme sürümlerini de listele</small>
                </div>
                <div className="ctl">
                  <Switch on={settings.showSnapshots} onChange={(v) => set({ showSnapshots: v })} label="Snapshot" />
                </div>
              </div>
            </div>
          </div>

          <div className="set-group">
            <h3>
              <Gamepad2 /> Klasörler
            </h3>
            <div className="card">
              <div className="set-row">
                <div className="info">
                  <b>Launcher verileri</b>
                  <small className="ellipsis">{system.dataDir}</small>
                </div>
                <div className="ctl">
                  <button className="btn sm" onClick={() => call('shell:openFolder', 'root').catch((e) => toast('error', e.message))}>
                    <FolderOpen /> Aç
                  </button>
                  <button className="btn sm" onClick={() => call('shell:openFolder', 'logs').catch((e) => toast('error', e.message))}>
                    Loglar
                  </button>
                  <button className="btn sm" onClick={() => call('shell:openFolder', 'backups').catch((e) => toast('error', e.message))}>
                    Yedekler
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="set-group">
            <h3>
              <Info /> Hakkında
            </h3>
            <div className="card">
              <div className="set-row">
                <div className="info">
                  <b>Static Launcher {system.appVersion}</b>
                  <small>
                    {system.platform} · {system.cpus} çekirdek · {ram(system.totalRamMB)} RAM
                  </small>
                </div>
                <div className="ctl">
                  {update.state === 'error' && <span className="tiny muted">{update.message}</span>}
                  {update.state === 'none' && <span className="tag ok">Güncel</span>}
                  <button className="btn sm" disabled={update.state === 'checking'} onClick={() => call('update:check').catch((e) => toast('error', e.message))}>
                    <RefreshCw className={update.state === 'checking' ? 'spin' : ''} /> Güncellemeleri denetle
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
