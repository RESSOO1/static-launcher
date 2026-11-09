import { existsSync } from 'fs'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { MinecraftFolder, Version, type ResolvedVersion } from '@xmcl/core'
import {
  createDefaultNodeInstallRuntime,
  createFabricInstallWorkflow,
  createJavaRuntimeInstallWorkflow,
  executeInstallManifest,
  executeInstallWorkflow,
  ProgressTrackerMultiple,
  resolveAssetMetadataInstallFiles,
  resolveAssetObjectInstallFiles,
  resolveLibraryInstallFiles,
  resolveMinecraftJarInstallFile,
  resolveMinecraftVersionJsonInstallFile,
  type InstallFile,
  type InstallRuntime,
  type JavaRuntimeTarget
} from '@xmcl/installer'
import type { ProgressPhase } from '@shared/types'
import { gameRoot, runtimeDir } from '../paths'
import { fetchJson } from '../net'
import { fabricSupported, latestFabricLoader, resolveMcVersion } from './versions'
import { log } from '../log'

export type Report = (phase: ProgressPhase, label: string, progress: number, detail?: string) => void

interface Ctx {
  report: Report
  signal: AbortSignal
  concurrency: number
}

/** Run one install stage with a byte-level progress tracker that is polled for the UI. */
async function stage<T>(ctx: Ctx, phase: ProgressPhase, label: string, run: (rt: InstallRuntime) => Promise<T>): Promise<T> {
  const tracker = new ProgressTrackerMultiple()
  const base = createDefaultNodeInstallRuntime({ tracker, maxConcurrency: ctx.concurrency, signal: ctx.signal })
  let files = 0
  const rt: InstallRuntime = {
    stat: (p) => base.stat(p),
    checksum: (p, a) => base.checksum(p, a),
    download: async (list) => {
      files += list.length
      return base.download(list)
    },
    java: (c) => base.java(c),
    materialize: (o) => base.materialize(o),
    remove: (p) => base.remove(p),
    validate: (p, v) => base.validate(p, v)
  }
  ctx.report(phase, label, -1)
  const timer = setInterval(() => {
    const total = tracker.total
    if (total > 0) ctx.report(phase, label, Math.min(1, tracker.progress / total), files ? `${files} dosya` : undefined)
  }, 250)
  try {
    return await run(rt)
  } finally {
    clearInterval(timer)
  }
}

const files = (id: string, list: (InstallFile | undefined)[]) => ({
  schemaVersion: 1 as const,
  tasks: [{ id, type: 'files' as const, files: list.filter((f): f is InstallFile => !!f) }]
})

/** Installs (or repairs) everything a version needs and returns the version id to launch. */
export async function ensureVersion(
  mcVersion: string,
  loader: 'vanilla' | 'fabric',
  loaderVersion: string | undefined,
  ctx: Ctx
): Promise<{ versionId: string; resolved: ResolvedVersion; mcId: string; releaseTime: string }> {
  const root = gameRoot()
  const folder = MinecraftFolder.from(root)
  ctx.report('prepare', 'Sürüm bilgisi alınıyor', -1)
  const meta = await resolveMcVersion(mcVersion)

  if (!existsSync(folder.getVersionJson(meta.id))) {
    await stage(ctx, 'version', 'Sürüm dosyası indiriliyor', (rt) =>
      executeInstallManifest(files('version-json', [resolveMinecraftVersionJsonInstallFile(meta, folder)]), rt, { signal: ctx.signal })
    )
  }

  let versionId = meta.id
  if (loader === 'fabric') {
    if (!(await fabricSupported(meta.id))) throw new Error(`Fabric, Minecraft ${meta.id} sürümünü desteklemiyor`)
    const lv = loaderVersion || (await latestFabricLoader())
    const expected = `fabric-loader-${lv}-${meta.id}`
    if (existsSync(folder.getVersionJson(expected))) versionId = expected
    else
      versionId = await stage(ctx, 'loader', 'Fabric kuruluyor', (rt) =>
        executeInstallWorkflow(createFabricInstallWorkflow({ minecraftVersion: meta.id, version: lv, minecraft: folder }), rt, { signal: ctx.signal })
      )
  }

  const resolved = await Version.parse(folder, versionId)

  await stage(ctx, 'libraries', 'Oyun dosyaları indiriliyor', (rt) =>
    executeInstallManifest(
      files('core', [
        resolveMinecraftJarInstallFile(resolved),
        ...resolveLibraryInstallFiles(resolved.libraries, folder),
        ...resolveAssetMetadataInstallFiles(resolved, folder)
      ]),
      rt,
      { signal: ctx.signal }
    )
  )

  await stage(ctx, 'assets', 'Ses ve dokular indiriliyor', async (rt) =>
    executeInstallManifest(files('assets', await resolveAssetObjectInstallFiles(resolved, folder)), rt, { signal: ctx.signal })
  )

  return { versionId, resolved, mcId: meta.id, releaseTime: meta.releaseTime }
}

type RuntimeIndex = Record<string, Record<string, JavaRuntimeTarget[]>>
let runtimeIndex: RuntimeIndex | null = null

/** Mojang ships the exact Java build each version expects; install it next to the launcher data. */
export async function ensureJava(resolved: ResolvedVersion, ctx: Ctx): Promise<string> {
  const component = resolved.javaVersion?.component || 'jre-legacy'
  if (!/^[a-z0-9-]{3,40}$/.test(component)) throw new Error('Geçersiz Java bileşeni')
  const dest = join(runtimeDir(), component)
  const exe = join(dest, 'bin', process.platform === 'win32' ? 'javaw.exe' : 'java')
  const marker = join(dest, '.static-ok')
  if (existsSync(exe) && existsSync(marker)) return exe

  ctx.report('java', `Java ${resolved.javaVersion?.majorVersion ?? ''} hazırlanıyor`, -1)
  if (!runtimeIndex)
    runtimeIndex = await fetchJson<RuntimeIndex>(
      'https://piston-meta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json',
      { timeoutMs: 15000 }
    )
  const platform = process.platform === 'win32' ? (process.arch === 'arm64' ? 'windows-arm64' : process.arch === 'ia32' ? 'windows-x86' : 'windows-x64') : process.platform === 'darwin' ? (process.arch === 'arm64' ? 'mac-os-arm64' : 'mac-os') : 'linux'
  const target = runtimeIndex[platform]?.[component]?.[0]
  if (!target) throw new Error(`Bu sistem için Java (${component}) bulunamadı. Ayarlar > Java bölümünden kendi Java yolunu seçebilirsin.`)

  await stage(ctx, 'java', `Java ${target.version.name} indiriliyor`, (rt) =>
    executeInstallWorkflow(createJavaRuntimeInstallWorkflow({ target, destination: dest }), rt, { signal: ctx.signal })
  )
  if (!existsSync(exe)) throw new Error('Java kurulumu tamamlanamadı')
  await writeFile(marker, target.version.name)
  log.info(`Java kuruldu: ${component} ${target.version.name}`)
  return exe
}
