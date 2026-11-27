import type { NextRequest } from 'next/server'
import { moduleGuard } from '@/extensions/server/modules'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { currentAdminHasPermission } from '@/modules/identity/server/access'
import { err, ok } from '@/platform/http/response'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { StoreError } from '@/modules/store/domain/store'
import { counterProducts } from '@/modules/store/server/counter-sales'
import { CRM_PERMISSIONS } from '../../domain/crm-desk'
import { validFollowUpId } from '../../domain/crm-follow-ups'
import { ChatError } from '../../domain/livechat'
import { createOpportunityQuotation, listOpportunityQuotations, readQuoteOpportunity, shareOpportunityQuotation } from '../crm-opportunities'

async function handle(req: NextRequest, mutate = false) {
  const guard = await adminGuard(req, 'livechat', CRM_PERMISSIONS)
  if ('response' in guard) return guard.response
  const off = await moduleGuard('store')
  if (off) return off
  const { admin } = guard
  if (!currentAdminHasPermission(admin, 'orders.manage')) return err('دسترسی مدیریت سفارش لازم است', 403)
  try {
    let response: Response
    if (mutate) {
      const raw = await req.text()
      if (raw.length > 12_000) return err('درخواست بیش از حد بزرگ است', 413)
      let parsed: unknown
      try { parsed = JSON.parse(raw) } catch { return err('درخواست معتبر نیست') }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return err('درخواست معتبر نیست')
      const body = parsed as Record<string, unknown>
      if (!validFollowUpId(body.opportunityId)) return err('شناسهٔ فرصت معتبر نیست')
      if (!(await rateLimitStrict(`crm:quotation:${admin.id}`, 20, 60_000)).ok) return err('کمی بعد دوباره تلاش کنید', 429)
      if (body.op === 'create' && validFollowUpId(body.version)) {
        response = ok(await createOpportunityQuotation(req, admin, body.opportunityId, body.version, body), 201)
      } else if (body.op === 'share' && validFollowUpId(body.quotationId) && body.confirmed === true) {
        response = ok(await shareOpportunityQuotation(req, admin, body.opportunityId, body.quotationId))
      } else return err('نوع درخواست یا تأیید اشتراک معتبر نیست')
    } else {
      const query = req.nextUrl.searchParams
      const id = Number(query.get('opportunityId'))
      if (!validFollowUpId(id)) return err('شناسهٔ فرصت معتبر نیست')
      if (query.get('products') === '1') {
        await readQuoteOpportunity(admin, id)
        const products = await counterProducts((query.get('q') || '').trim().slice(0, 100))
        response = ok({ products: products.filter(row => row.kind === 'PHYSICAL' && !row.fields.length) })
      } else {
        response = ok(await listOpportunityQuotations(admin, id))
      }
    }
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  } catch (error) {
    if (error instanceof ChatError || error instanceof StoreError) return err(error.message, error.status)
    throw error
  }
}

export const GET = (req: NextRequest) => handle(req)
export const POST = (req: NextRequest) => handle(req, true)
