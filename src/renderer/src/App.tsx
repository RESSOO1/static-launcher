import { Component, useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { useApp } from './lib/store'
import { on } from './lib/api'
import { ConsoleDrawer, CrashDialog, Splash, TitleBar, Toasts, UpdateDialog } from './components/Shell'
import { Dock } from './components/Dock'
import { Scene } from './components/Scene'
import { Wizard } from './components/Wizard'
import { Home } from './pages/Home'
import { Profiles } from './pages/Profiles'
import { Store } from './pages/Store'
import { Servers } from './pages/Servers'
import { News } from './pages/News'
import { Gallery } from './pages/Gallery'
import { Account } from './pages/Account'
import { Settings } from './pages/Settings'

/** A render error in one page shows a recover screen instead of a blank window. */
class PageBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="empty" style={{ height: '100%' }}>
        <AlertTriangle />
        <b>Bu sayfa yüklenirken bir sorun oldu</b>
        <span className="small">{this.state.error.message}</span>
        <button className="btn sm" onClick={() => this.setState({ error: null })}>
          <RotateCcw /> Tekrar dene
        </button>
      </div>
    )
  }
}

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches

export function App() {
  const { page, settings, accounts } = useApp()
  const [splash, setSplash] = useState(true)
  const [splashGone, setSplashGone] = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setSplash(false), settings.animations ? 1500 : 200)
    const t2 = setTimeout(() => setSplashGone(true), settings.animations ? 2200 : 300)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [settings.animations])

  useEffect(() => {
    document.body.classList.toggle('no-anim', !settings.animations)
  }, [settings.animations])

  const [maxed, setMaxed] = useState(false)
  useEffect(() => on<boolean>('win:maximized', setMaxed), [])

  const needsSetup = !settings.firstRunDone || accounts.length === 0

  return (
    <div className={`app ${maxed ? 'maxed' : ''}`}>
      <Scene animated={settings.animations && page === 'home' && !reducedMotion} />
      <TitleBar />
      <main className="stage">
        <PageBoundary resetKey={page}>
          {page === 'home' ? (
            <Home />
          ) : (
            <section className="sheet glass" key={page}>
              {page === 'profiles' && <Profiles />}
              {page === 'store' && <Store />}
              {page === 'servers' && <Servers />}
              {page === 'news' && <News />}
              {page === 'gallery' && <Gallery />}
              {page === 'account' && <Account />}
              {page === 'settings' && <Settings />}
            </section>
          )}
        </PageBoundary>
        <ConsoleDrawer />
      </main>
      <Dock />
      <CrashDialog />
      <UpdateDialog blocked={splash || needsSetup} />
      <Toasts />
      {needsSetup && !splash && <Wizard />}
      {!splashGone && <Splash done={!splash} />}
    </div>
  )
}
