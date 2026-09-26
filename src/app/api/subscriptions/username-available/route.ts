import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { requireUser } from '@/modules/identity/server/access'
import { checkUsername, sanitizeUsername, suggestUsername } from '@/modules/subscriptions/server/usernames'

export const dynamic = 'force-dynamic'

/** GET /api/subscriptions/username-available?username=x&planId=1 */
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return err('unauthorized', 401)

  const raw = req.nextUrl.searchParams.get('username') || ''
  const planId = Number(req.nextUrl.searchParams.get('planId')) || null

  if (!raw.trim()) {
    return ok({ username: '', available: false, suggestion: suggestUsername(user.email.split('@')[0] || 'happ') })
  }

  const check = await checkUsername(raw, planId)
  return ok({
    ...check,
    suggestion: check.available ? check.username : suggestUsername(sanitizeUsername(raw) || user.email.split('@')[0] || 'happ'),
  })
}
