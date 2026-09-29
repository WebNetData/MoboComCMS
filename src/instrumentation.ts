export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NEXT_PHASE !== 'phase-production-build') {
    const { validateProductionEnvironment } = await import('@/platform/config/env')
    validateProductionEnvironment()

    const { startReminderScheduler } = await import('@/modules/notifications/server/reminder-scheduler')
    startReminderScheduler()
    const { startBackupScheduler } = await import('@/modules/notifications/server/backup-scheduler')
    startBackupScheduler()
    const { startOperationsMonitorScheduler } = await import('@/modules/notifications/server/operations-monitor-scheduler')
    startOperationsMonitorScheduler()
    const { startRemnaControlScheduler } = await import('@/modules/providers/server/remnawave-scheduler')
    startRemnaControlScheduler()
    const { startJobScheduler } = await import('@/modules/notifications/server/jobs-scheduler')
    startJobScheduler()
  }
}

/** Unhandled errors in pages and route handlers land on the monitoring page (and the log). */
export async function onRequestError(error: unknown, request: { path: string; method: string }) {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { logEvent } = await import('@/platform/observability/logger')
  logEvent('error', 'request.unhandled', { error: error instanceof Error ? error.message : String(error), path: `${request.method} ${request.path}` })
}
