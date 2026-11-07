import { readFileSync } from 'node:fs'
import { UpdateError } from '../domain/updater'

/** Native in-place updater cannot replace an active managed release or migrate under it. */
export function assertNativeUpdateTarget() {
  try {
    const current = JSON.parse(readFileSync('/run/mobocom-engineering/active.json', 'utf8'))
    if (current.id !== 'native') throw new UpdateError('نسخهٔ فعال با محیط مهندسی مدیریت می‌شود؛ انتشار یا بازگشت را از «پنل سرور ← مهندسی هوشمند» انجام دهید. به‌روزرسانی در محل روی این نسخه اجرا نمی‌شود.', 409)
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
}
