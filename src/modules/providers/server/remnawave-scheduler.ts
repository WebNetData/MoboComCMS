import { runRemnaControl } from './remnawave-control'
import { logEvent } from '@/platform/observability/logger'

const state = globalThis as typeof globalThis & { remnaTimer?: ReturnType<typeof setInterval>; remnaBusy?: boolean }
async function tick() {
  if (state.remnaBusy) return
  state.remnaBusy = true
  try { await runRemnaControl() }
  catch (error) { logEvent('warn', 'remnawave.control_failed', { reason: error instanceof Error ? error.name : 'unknown' }) }
  finally { state.remnaBusy = false }
}
export function startRemnaControlScheduler() {
  if (state.remnaTimer || process.env.REMNAWAVE_CONTROL_SCHEDULER === 'false') return
  state.remnaTimer = setInterval(() => { void tick() }, 15 * 60_000)
  state.remnaTimer.unref()
  setTimeout(() => { void tick() }, 60_000).unref()
}
