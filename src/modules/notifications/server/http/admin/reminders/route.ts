import { NextRequest } from 'next/server'
import { requirePerm } from '@/modules/identity/server/access'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { getReminderSettings, REMINDER_KEY } from '@/modules/notifications/server/reminder-settings'
import { REMINDER_RUN } from '@/modules/notifications/server/reminders'
import { validateReminderSettings } from '@/modules/notifications/domain/reminders'

export async function GET(req: NextRequest) {
  if (!await requirePerm(req, 'settings.manage')) return err('forbidden', 403)
  const [settings, run, sent, failed, uncertain] = await Promise.all([
    getReminderSettings(), db.setting.findUnique({ where: { key: REMINDER_RUN } }),
    db.subscriptionReminder.count({ where: { status: 'SENT' } }),
    db.subscriptionReminder.count({ where: { status: { in: ['FAILED', 'RETRY'] } } }),
    db.subscriptionReminder.count({ where: { status: { in: ['UNKNOWN', 'CLAIMED'] } } }),
  ])
  let lastRun = null
  try { lastRun = run ? JSON.parse(run.value) : null } catch {}
  return ok({ settings, lastRun, sent, failed, uncertain, schedulerEnabled: process.env.SUBSCRIPTION_REMINDER_SCHEDULER !== 'false' })
}
export async function PATCH(req: NextRequest) {
  if (!await requirePerm(req, 'settings.manage')) return err('forbidden', 403)
  try {
    const settings = validateReminderSettings(await req.json())
    await db.setting.upsert({ where: { key: REMINDER_KEY }, create: { key: REMINDER_KEY, value: JSON.stringify(settings) }, update: { value: JSON.stringify(settings) } })
    return ok({ saved: true })
  } catch (error) { return err(error instanceof Error ? error.message : 'Invalid settings', 400) }
}
