import { timingSafeEqual } from 'node:crypto'
import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { runSubscriptionReminders } from '@/modules/notifications/server/reminders'
import { runInboxExpiryNotices } from '@/modules/notifications/server/inbox-reminders'
export const runtime = 'nodejs'
export const maxDuration = 120
export const dynamic = 'force-dynamic'
export async function POST(req: NextRequest) {
  const secret = process.env.INTERNAL_JOBS_SECRET
  if (!secret) return err('worker secret not configured', 503)
  const expected = Buffer.from(secret)
  const provided = Buffer.from((req.headers.get('authorization') || '').replace(/^Bearer /, ''))
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return err('unauthorized', 401)
  const inbox = await runInboxExpiryNotices()
  const telegram = await runSubscriptionReminders()
  return ok({ inbox, telegram })
}
