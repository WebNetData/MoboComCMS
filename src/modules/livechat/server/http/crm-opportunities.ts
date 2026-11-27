import type { NextRequest } from 'next/server'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { err, ok } from '@/platform/http/response'
import { CRM_PERMISSIONS } from '../../domain/crm-desk'
import { validFollowUpId } from '../../domain/crm-follow-ups'
import { opportunityFilters, opportunitySource } from '../../domain/crm-opportunities'
import { ChatError } from '../../domain/livechat'
import { createOpportunity, listOpportunities, opportunityDetails, previewOpportunitySource, updateOpportunity } from '../crm-opportunities'

async function handle(req: NextRequest, action?: 'create' | 'update') {
  const guard = await adminGuard(req, 'livechat', CRM_PERMISSIONS)
  if ('response' in guard) return guard.response
  try {
    const { admin } = guard
    const query = req.nextUrl.searchParams
    let response: Response
    if (action) {
      const raw = await req.text()
      if (raw.length > 4096) return err('اطلاعات فرصت بیش از حد بزرگ است', 413)
      let input: unknown
      try { input = JSON.parse(raw) } catch { return err('اطلاعات فرصت معتبر نیست') }
      if (!input || typeof input !== 'object' || Array.isArray(input)) return err('اطلاعات فرصت معتبر نیست')
      const body = input as Record<string, unknown>
      response = action === 'create' ? ok(await createOpportunity(req, admin, body), 201) : ok(await updateOpportunity(req, admin, body))
    } else if (query.has('id')) {
      const id = Number(query.get('id'))
      if (!validFollowUpId(id)) return err('شناسهٔ فرصت معتبر نیست')
      response = ok(await opportunityDetails(req, admin, id))
    } else if (query.has('source') || query.has('sourceId')) {
      response = ok(await previewOpportunitySource(req, admin, opportunitySource(query.get('source'), Number(query.get('sourceId')))))
    } else {
      response = ok(await listOpportunities(admin, opportunityFilters(query)))
    }
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  } catch (error) {
    if (error instanceof ChatError) return err(error.message, error.status)
    throw error
  }
}

export const GET = (req: NextRequest) => handle(req)
export const POST = (req: NextRequest) => handle(req, 'create')
export const PATCH = (req: NextRequest) => handle(req, 'update')
