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
