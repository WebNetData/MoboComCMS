import { db } from '@/platform/database/prisma'
import { reminderDefaults, validateReminderSettings } from '@/modules/notifications/domain/reminders'
export const REMINDER_KEY = 'telegram.subscription-reminders'
export async function getReminderSettings() {
  const row = await db.setting.findUnique({ where: { key: REMINDER_KEY } })
  if (!row) return { ...reminderDefaults }
  try { return validateReminderSettings(JSON.parse(row.value)) } catch { return { ...reminderDefaults } }
}
