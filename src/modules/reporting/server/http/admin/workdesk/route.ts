import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { requireUser } from '@/modules/identity/server/access'
import { adminWorkdesk } from '@/modules/reporting/server/workdesk'

export async function GET(req: NextRequest) {
  const actor = await requireUser(req)
  if (actor?.role !== 'ADMIN') return err('دسترسی مجاز نیست', 403)
  const response = ok({ queues: await adminWorkdesk(req) })
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}
