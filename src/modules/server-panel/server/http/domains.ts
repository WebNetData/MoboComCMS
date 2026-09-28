import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { serverGate } from '@/modules/server-panel/server/gate'
import { DomainError } from '@/modules/server-panel/domain/domains'
import {
  cloudflareRecords, cloudflareZones, deleteCertificate, deleteCloudflareRecord, domainsOverview, issueCertificate, removeSite,
  renewCertificates, saveCloudflareRecord, saveCloudflareToken, saveSite, setSiteUrl,
} from '@/modules/server-panel/server/domains'

function failure(error: unknown) {
  if (error instanceof DomainError) return err(error.message, error.status)
  return err('عملیات انجام نشد', 500)
}

/** GET /api/admin/server/domains?view=overview|zones|records&zone= */
export async function GET_domains(req: NextRequest) {
  const gate = await serverGate(req)
  if ('response' in gate) return gate.response
  const q = req.nextUrl.searchParams
  try {
    switch (q.get('view') || 'overview') {
      case 'overview': return ok(await domainsOverview())
      case 'zones': return ok({ zones: await cloudflareZones() })
      case 'records': return ok({ records: await cloudflareRecords(q.get('zone')) })
      default: return err('نمای نامعتبر')
    }
  } catch (error) { return failure(error) }
}

type Body = Record<string, unknown> & { op?: string }

/** POST /api/admin/server/domains {op, …} */
export async function POST_domains(req: NextRequest) {
  const gate = await serverGate(req)
  if ('response' in gate) return gate.response
  const body = (await req.json().catch(() => null) || {}) as Body
  const audit = (action: string, target: unknown, metadata?: Record<string, unknown>) => auditAdmin({ req, actor: gate.user, action: `server.${action}`, targetType: 'domain', targetId: String(target ?? ''), metadata })
  try {
    switch (body.op) {
      case 'site-save': { const r = await saveSite(body.site && typeof body.site === 'object' ? body.site as Record<string, unknown> : {}); await audit('domain_save', r.domain, { mode: r.mode, https: r.https, cert: r.cert }); return ok(r) }
      case 'site-remove': { await removeSite(body.domain); await audit('domain_remove', body.domain); return ok({ removed: true }) }
      case 'cert-issue': {
        const r = await issueCertificate({ domain: body.domain, wildcard: body.wildcard === true, www: body.www === true, email: body.email, extra: body.extra })
        await audit('cert_issue', r.name, { names: r.names })
        return ok(r)
      }
      case 'cert-renew': { const r = await renewCertificates(body.dry === true); await audit('cert_renew', '', { dry: body.dry === true, ok: r.ok }); return ok(r) }
      case 'cert-delete': { await deleteCertificate(body.name); await audit('cert_delete', body.name); return ok({ deleted: true }) }
      case 'site-url': { const r = await setSiteUrl(body.url); await audit('site_url', r.url); return ok(r) }
      case 'cf-token': { const r = await saveCloudflareToken(body.token); await audit('cloudflare_token', '', { set: r.cloudflare }); return ok(r) }
      case 'dns-save': {
        const r = await saveCloudflareRecord(body.zone, body.zoneName, body.record && typeof body.record === 'object' ? body.record as Record<string, unknown> : {})
        await audit('dns_save', body.zoneName, { record: body.record })
        return ok(r)
      }
      case 'dns-delete': { await deleteCloudflareRecord(body.zone, body.id); await audit('dns_delete', body.zoneName, { id: body.id }); return ok({ deleted: true }) }
      default: return err('عملیات نامعتبر است')
    }
  } catch (error) { return failure(error) }
}
