export type Loader = 'vanilla' | 'fabric'
export type PerformancePreset = 'low' | 'balanced' | 'high' | 'custom'
export type CloseBehavior = 'hide' | 'minimize' | 'keep'
export type Accent = 'violet' | 'blue' | 'emerald' | 'rose' | 'amber'

export type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export interface Account {
  id: string
  name: string
  uuid: string
  createdAt: number
  hasSkin: boolean
  slim: boolean
}

export interface Settings {
  firstRunDone: boolean
  ramMB: number
  javaPath: string
  jvmArgs: string
  width: number
  height: number
  fullscreen: boolean
  closeBehavior: CloseBehavior
  performance: PerformancePreset
  discordRpc: boolean
  accent: Accent
  animations: boolean
  maxDownloads: number
  showSnapshots: boolean
  selectedProfileId: string
  selectedAccountId: string
}

export interface Profile {
  id: string
  name: string
  description: string
  mcVersion: string
  loader: Loader
  loaderVersion?: string
  /** Managed profiles come from the launcher config (server modes) and cannot be deleted. */
  managed: boolean
  serverAddress?: string
  mods?: string[]
  accent?: string
  image?: string
  ramMB?: number
  createdAt: number
  lastPlayed?: number
  playTimeSec: number
}

export interface ProfileInput {
  name: string
  description?: string
  mcVersion: string
  loader: Loader
  loaderVersion?: string
  ramMB?: number
}

export interface ModeDef {
  id: string
  name: string
  description: string
  mcVersion: string
  loader: Loader
  loaderVersion?: string
  server?: string
  mods?: string[]
  accent?: string
  image?: string
}

export interface ServerDef {
  id: string
  name: string
  address: string
  description?: string
  featured?: boolean
}

export interface NewsItem {
  id: string
  title: string
  body: string
  date: string
  tag?: string
  url?: string
}

export interface LauncherConfig {
  name: string
  tagline: string
  modes: ModeDef[]
  servers: ServerDef[]
  news: NewsItem[]
  links: { discord?: string; website?: string }
  discordClientId?: string
  remoteConfigUrl?: string
  updateUrl?: string
}

export type ProgressPhase = 'prepare' | 'java' | 'version' | 'loader' | 'libraries' | 'assets' | 'mods' | 'launch'

export interface ProgressInfo {
  profileId: string
  phase: ProgressPhase
  label: string
  /** 0..1, or -1 when indeterminate */
  progress: number
  detail?: string
}

export type GameStatus = 'idle' | 'preparing' | 'running'

export interface GameState {
  status: GameStatus
  profileId?: string
  startedAt?: number
}

export interface CrashInfo {
  profileId: string
  exitCode: number | null
  title: string
  hint: string
}

export interface LogLine {
  t: number
  level: 'info' | 'warn' | 'error'
  text: string
}

export interface McVersion {
  id: string
  type: string
  releaseTime: string
}

export interface InstalledMod {
  file: string
  name: string
  version?: string
  enabled: boolean
  size: number
  icon?: string
  projectId?: string
}

export type ContentType = 'mod' | 'resourcepack' | 'shader'

export interface ModrinthHit {
  projectId: string
  slug: string
  title: string
  description: string
  author: string
  downloads: number
  follows: number
  icon?: string
  categories: string[]
}

export interface ServerStatus {
  online: boolean
  players?: number
  max?: number
  ping?: number
  motd?: string
  version?: string
  favicon?: string
}

export interface WorldInfo {
  folder: string
  name: string
  lastPlayed: number
  sizeBytes: number
}

export interface BackupInfo {
  file: string
  world: string
  createdAt: number
  sizeBytes: number
}

export interface Screenshot {
  file: string
  url: string
  createdAt: number
}

export interface SystemInfo {
  totalRamMB: number
  freeRamMB: number
  cpus: number
  platform: string
  appVersion: string
  dataDir: string
}

export type UpdateState =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string; notes?: string }
  | { state: 'downloading'; percent: number }
  | { state: 'ready'; version: string }
  | { state: 'none' }
  | { state: 'error'; message: string }
