import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type {
  Account,
  CrashInfo,
  GameState,
  LauncherConfig,
  LogLine,
  Profile,
  ProgressInfo,
  Settings,
  SystemInfo,
  UpdateState
} from '@shared/types'
import { call, on } from './api'

export type Page = 'home' | 'profiles' | 'store' | 'servers' | 'news' | 'gallery' | 'account' | 'settings'

export interface Toast {
  id: number
  kind: 'success' | 'error' | 'info'
  text: string
}

interface InitData {
  settings: Settings
  accounts: Account[]
  profiles: Profile[]
  config: LauncherConfig
  system: SystemInfo
  game: GameState
  update: UpdateState
}

interface AppCtx extends InitData {
  ready: boolean
  page: Page
  setPage(p: Page): void
  progress: ProgressInfo | null
  logs: LogLine[]
  crash: CrashInfo | null
  dismissCrash(): void
  consoleOpen: boolean
  setConsoleOpen(v: boolean): void
  toasts: Toast[]
  toast(kind: Toast['kind'], text: string): void
  updateSettings(patch: Partial<Settings>): Promise<void>
  refreshAccounts(): Promise<void>
  refreshProfiles(): Promise<void>
  selectedProfile: Profile | undefined
  selectedAccount: Account | undefined
  play(profileId?: string, serverAddress?: string): Promise<void>
  skinVersion: number
  bumpSkin(): void
}

const Ctx = createContext<AppCtx | null>(null)

export function useApp(): AppCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('AppProvider eksik')
  return c
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<InitData | null>(null)
  const [page, setPage] = useState<Page>('home')
  const [progress, setProgress] = useState<ProgressInfo | null>(null)
  const [logs, setLogs] = useState<LogLine[]>([])
  const [crash, setCrash] = useState<CrashInfo | null>(null)
  const [consoleOpen, setConsoleOpen] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [skinVersion, setSkinVersion] = useState(0)
  const toastId = useRef(0)

  const toast = useCallback((kind: Toast['kind'], text: string) => {
    const id = ++toastId.current
    setToasts((t) => [...t.slice(-3), { id, kind, text }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6500 : 3500)
  }, [])

  useEffect(() => {
    call<InitData>('app:init')
      .then(setData)
      .catch((e) => toast('error', e.message))
    const offs = [
      on<ProgressInfo>('game:progress', setProgress),
      on<GameState>('game:state', (g) => {
        setData((d) => (d ? { ...d, game: g } : d))
        if (g.status !== 'preparing') setProgress(null)
        if (g.status === 'idle') void call<Profile[]>('profiles:list').then((profiles) => setData((d) => (d ? { ...d, profiles } : d)))
      }),
      on<LogLine[]>('game:logs', (l) => setLogs((cur) => (cur.length + l.length > 5000 ? [...cur, ...l].slice(-5000) : [...cur, ...l]))),
      on<CrashInfo>('game:crash', setCrash),
      on<UpdateState>('update:state', (u) => setData((d) => (d ? { ...d, update: u } : d))),
      // main already fetched the new config; just pick up config + profiles derived from it
      on<LauncherConfig>('config:updated', () =>
        void call<InitData>('app:init').then((r) => setData((d) => (d ? { ...d, config: r.config, profiles: r.profiles } : d)))
      ),
      on<string>('dev:goto', (p) => setPage(p as Page))
    ]
    return () => offs.forEach((o) => o())
  }, [toast])

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    const s = await call<Settings>('settings:set', patch)
    setData((d) => (d ? { ...d, settings: s } : d))
  }, [])

  const refreshAccounts = useCallback(async () => {
    const [accounts, init] = await Promise.all([call<Account[]>('accounts:list'), call<InitData>('app:init')])
    setData((d) => (d ? { ...d, accounts, settings: init.settings } : d))
  }, [])

  const refreshProfiles = useCallback(async () => {
    const init = await call<InitData>('app:init')
    setData((d) => (d ? { ...d, profiles: init.profiles, settings: init.settings } : d))
  }, [])

  const play = useCallback(
    async (profileId?: string, serverAddress?: string) => {
      if (!data) return
      const id = profileId ?? data.settings.selectedProfileId
      setLogs([])
      setProgress({ profileId: id, phase: 'prepare', label: 'Hazırlanıyor', progress: -1 })
      try {
        await call('game:play', id, serverAddress)
      } catch (e) {
        setProgress(null)
        toast('error', (e as Error).message)
      }
    },
    [data, toast]
  )

  const value = useMemo<AppCtx | null>(() => {
    if (!data) return null
    const selectedProfile = data.profiles.find((p) => p.id === data.settings.selectedProfileId) ?? data.profiles[0]
    const selectedAccount = data.accounts.find((a) => a.id === data.settings.selectedAccountId) ?? data.accounts[0]
    return {
      ...data,
      ready: true,
      page,
      setPage,
      progress,
      logs,
      crash,
      dismissCrash: () => setCrash(null),
      consoleOpen,
      setConsoleOpen,
      toasts,
      toast,
      updateSettings,
      refreshAccounts,
      refreshProfiles,
      selectedProfile,
      selectedAccount,
      play,
      skinVersion,
      bumpSkin: () => setSkinVersion((v) => v + 1)
    }
  }, [data, page, progress, logs, crash, consoleOpen, toasts, toast, updateSettings, refreshAccounts, refreshProfiles, play, skinVersion])

  if (!value) return <BootPlaceholder toasts={toasts} />
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

function BootPlaceholder({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="boot">
      {toasts.map((t) => (
        <div key={t.id} className="boot-error">
          {t.text}
        </div>
      ))}
    </div>
  )
}
