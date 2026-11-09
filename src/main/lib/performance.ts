import type { PerformancePreset } from '@shared/types'

/** Suggested RAM for the machine: leave the OS room, never below 2 GB or above 8 GB by default. */
export function suggestRam(totalMB: number, preset: PerformancePreset = 'balanced'): number {
  const ratio = preset === 'low' ? 0.25 : preset === 'high' ? 0.5 : 0.35
  const raw = Math.round((totalMB * ratio) / 512) * 512
  const cap = preset === 'high' ? 12288 : 8192
  return Math.max(2048, Math.min(cap, raw))
}

/** G1 tuning similar to what most modern launchers ship; only flags supported by Java 8+. */
export function presetJvmArgs(preset: PerformancePreset): string[] {
  const base = ['-XX:+UseG1GC', '-XX:+ParallelRefProcEnabled', '-XX:MaxGCPauseMillis=200', '-XX:+UnlockExperimentalVMOptions', '-XX:+DisableExplicitGC']
  if (preset === 'low') return [...base, '-XX:G1NewSizePercent=20', '-XX:G1ReservePercent=20', '-XX:G1HeapRegionSize=16M']
  if (preset === 'high') return [...base, '-XX:+AlwaysPreTouch', '-XX:G1NewSizePercent=30', '-XX:G1MaxNewSizePercent=40', '-XX:G1HeapRegionSize=8M', '-XX:G1ReservePercent=20', '-XX:InitiatingHeapOccupancyPercent=15']
  if (preset === 'balanced') return [...base, '-XX:G1NewSizePercent=30', '-XX:G1MaxNewSizePercent=40', '-XX:G1HeapRegionSize=8M', '-XX:G1ReservePercent=20']
  return []
}
