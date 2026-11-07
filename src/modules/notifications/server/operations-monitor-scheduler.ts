import { runtimeOwnsBackgroundWork } from '@/modules/operations/server/runtime'
import { runOperationsMonitor } from './operations-monitor'
import { logEvent } from '@/platform/observability/logger'

const state = globalThis as typeof globalThis & { operationsMonitorTimer?: ReturnType<typeof setInterval>; operationsMonitorBusy?: boolean }

async function tick() {
  if (!runtimeOwnsBackgroundWork()) return
  if (state.operationsMonitorBusy) return
  state.operationsMonitorBusy = true
  try { await runOperationsMonitor() }
  catch (error) { logEvent('warn', 'monitor.check_failed', { reason: error instanceof Error ? error.name : 'unknown' }) }
  finally { state.operationsMonitorBusy = false }
}

export function startOperationsMonitorScheduler() {
  if (state.operationsMonitorTimer || process.env.OPERATIONS_MONITOR_SCHEDULER === 'false') return
  state.operationsMonitorTimer = setInterval(() => { void tick() }, 5 * 60_000)
  state.operationsMonitorTimer.unref()
  setTimeout(() => { void tick() }, 30_000).unref()
}
