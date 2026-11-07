import { runtimeOwnsBackgroundWork } from '@/modules/operations/server/runtime'
import { runSubscriptionReminders } from './reminders'
import { logEvent } from '@/platform/observability/logger'

const state = globalThis as typeof globalThis & { reminderTimer?: ReturnType<typeof setInterval>; reminderRunning?: boolean }
export function startReminderScheduler() {
  if (state.reminderTimer || process.env.SUBSCRIPTION_REMINDER_SCHEDULER === 'false') return
  state.reminderTimer = setInterval(async () => {
    if (!runtimeOwnsBackgroundWork()) return
    if (state.reminderRunning) return
    state.reminderRunning = true
    try { await runSubscriptionReminders() }
    catch { logEvent('error', 'subscription_reminders.worker_failed') }
    finally { state.reminderRunning = false }
  }, 60_000)
  state.reminderTimer.unref?.()
}
