import type { NextRequest } from 'next/server'
import { requireAdmin } from '@/modules/identity/server/access'
import { StoreError } from '@/modules/store/domain/store'
import { TicketReplyError } from '@/modules/support/server/ticket-reply'
import { originIsThisSite } from '@/platform/http/origin-policy'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { JsonBodyError, readJsonObject } from '@/platform/http/read-json'
import { err, ok } from '@/platform/http/response'
import { executeDeskAction, listDeskTargets, prepareDeskAction, suggestDeskAction } from '../management-actions'
import { ReviewError, reviewHistory } from '../management-review'
import { AiError } from '../client'

const base = ['action', 'id', 'version', 'signalId']
const selection = [...base, 'targetId', 'stamp', 'command']
const fields: Record<string, string[]> = {
  targets: base,
  suggest: selection,
  prepare: [...selection, 'text', 'assigneeId', 'assessment', 'externallyChecked'],
  execute: [...base, 'confirmed'],
}

export async function POST(req: NextRequest) {
  try {
    const origin = req.headers.get('origin')
    if (!origin || !originIsThisSite(origin, req.nextUrl.host)) return err('درخواست باید از همین سایت باشد', 403)
    const actor = await requireAdmin(req)
    if (!actor) return err('دسترسی مجاز نیست', 403)
    if (!(await rateLimitStrict(`ai:management-actions:${actor.id}`, 30, 60_000)).ok) return err('تعداد درخواست زیاد است', 429)
    const input = await readJsonObject(req, 4000)
    const action = input.action
    if (typeof action !== 'string' || !Object.hasOwn(fields, action) || Object.keys(input).some(key => !fields[action].includes(key))) return err('درخواست اقدام معتبر نیست', 422)

    let data: unknown
    if (action === 'targets') data = await listDeskTargets(req, input)
    else if (action === 'suggest') {
      if (!(await rateLimitStrict(`ai:management-draft:${actor.id}`, 8, 600_000)).ok) return err('تعداد درخواست پیش‌نویس زیاد است', 429)
      data = await suggestDeskAction(req, input)
    } else {
      if (action === 'prepare') await prepareDeskAction(req, input)
      else await executeDeskAction(req, input)
      data = await reviewHistory(req)
    }
    const response = ok(data)
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  } catch (error) {
    if (error instanceof ReviewError || error instanceof StoreError || error instanceof TicketReplyError || error instanceof JsonBodyError || error instanceof AiError) {
      return err(error.message, error.status)
    }
    if (['P2002', 'P2034'].includes((error as { code?: string })?.code || '')) return err('رکورد هم‌زمان تغییر کرد. دوباره بارگیری کنید.', 409)
    return err('بررسی یا اجرای اقدام در دسترس نیست', 503)
  }
}
