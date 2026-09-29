export async function register() {
  // Everything below is Node.js only; keeping the imports inside this branch keeps them out of the Edge build.
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NEXT_PHASE !== 'phase-production-build') {
    // The web installer runs before there is a database: nothing else may start, and the environment is not yet complete.
    if (process.env.SETUP_MODE === '1') return
    const { validateProductionEnvironment } = await import('@/platform/config/env')
    validateProductionEnvironment()

    const startBackgroundWork = async () => {
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

    // Background jobs need the tables of an installed site; a site still being installed starts them when it is finished.
    const { installMode } = await import('@/modules/installer/server/state')
    const mode = await installMode().catch(() => 'unknown' as const)
    if (mode === 'installed' || mode === 'unknown') { await startBackgroundWork(); return }
    const wait = setInterval(() => {
      void installMode().then((now) => { if (now === 'installed') { clearInterval(wait); void startBackgroundWork() } }).catch(() => undefined)
    }, 5000)
    wait.unref?.()
  }
}

/** Unhandled errors in pages and route handlers land on the monitoring page (and the log). */
export async function onRequestError(error: unknown, request: { path: string; method: string }) {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { logEvent } = await import('@/platform/observability/logger')
  logEvent('error', 'request.unhandled', { error: error instanceof Error ? error.message : String(error), path: `${request.method} ${request.path}` })
}
