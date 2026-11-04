import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { clientIp, rateLimitHit, rateLimitStrict } from '@/platform/http/rate-limit'
import { auditAdmin } from '@/platform/audit/server'
import { moduleGuard } from '@/extensions/server/modules'
import { requireUser } from '@/modules/identity/server/access'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { HostingError } from '@/modules/hosting/domain/catalog'
import { HostingRefusal } from '@/modules/hosting/server/services'
import {
  adminDomains, adminTlds, cancelDomainOrder, completeDomainRegistration, completeDomainTask, deleteTld, memberDomain, memberDomains,
  requestAuthCode, requestNameservers, saveTld, searchDomains, setDomainAutoRenew,
} from '@/modules/hosting/server/domains'

const privateJson = (body: unknown) => { const response = ok(body); response.headers.set('cache-control', 'private, no-store'); return response }
const refusal = (error: unknown) => {
  if (error instanceof HostingRefusal) return err(error.message, error.status, { code: error.code })
  if (error instanceof HostingError) return err(error.message, 400, { code: 'HOSTING' })
  throw error
}
const PERMISSIONS = ['hosting.manage']

/** GET /api/hosting/domains/search?q= — public; a visitor can search a few times a minute. */
export async function GET_search(req: NextRequest) {
  const off = await moduleGuard('hosting')
  if (off) return off
  if (!rateLimitHit(`domains:search:${clientIp(req.headers)}`, 20, 60_000).ok) return err('چند لحظه بعد دوباره جست‌وجو کنید', 429)
  const q = new URL(req.url).searchParams.get('q') || ''
  return privateJson(await searchDomains(q.slice(0, 260)))
}

/** GET /api/hosting/domains — the member's own domains. */
export async function GET_domains(req: NextRequest) {
  const off = await moduleGuard('hosting')
  if (off) return off
  const user = await requireUser(req)
  if (!user) return err('ابتدا وارد حساب خود شوید', 401)
  return privateJson({ domains: await memberDomains(user.id) })
}

const domainId = async (params: Promise<{ id: string }>) => { const id = Number((await params).id); return Number.isSafeInteger(id) && id > 0 ? id : 0 }

/** GET /api/hosting/domains/:id — one of the member's own domains; another member's answers 404. */
export async function GET_domain(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const off = await moduleGuard('hosting')
  if (off) return off
  const user = await requireUser(req)
  if (!user) return err('ابتدا وارد حساب خود شوید', 401)
  const id = await domainId(params)
  const domain = id ? await memberDomain(user.id, id) : null
  if (!domain) return err('دامنه پیدا نشد', 404)
  return privateJson({ domain })
}

/** POST /api/hosting/domains/:id { action: auto-renew | nameservers | authcode } */
export async function POST_domain(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const off = await moduleGuard('hosting')
  if (off) return off
  const user = await requireUser(req)
  if (!user) return err('ابتدا وارد حساب خود شوید', 401)
  const id = await domainId(params)
  if (!id) return err('دامنه پیدا نشد', 404)
  if (!(await rateLimitStrict(`domains:action:${user.id}`, 20, 60_000)).ok) return err('چند لحظه بعد دوباره امتحان کنید', 429)
  const body = await req.json().catch(() => null)
  try {
    if (body?.action === 'auto-renew') return privateJson(await setDomainAutoRenew(user.id, id, body.on === true))
    if (body?.action === 'nameservers') return privateJson(await requestNameservers(user.id, id, body.nameservers))
    if (body?.action === 'authcode') return privateJson(await requestAuthCode(user.id, id))
    return err('عملیات نامعتبر است')
  } catch (error) { return refusal(error) }
}

/** GET /api/admin/hosting/domains?status=&q=&page= */
export async function GET_admin_domains(req: NextRequest) {
  const g = await adminGuard(req, 'hosting', PERMISSIONS)
  if ('response' in g) return g.response
  const url = new URL(req.url)
  return privateJson(await adminDomains({ status: url.searchParams.get('status') || '', q: url.searchParams.get('q') || '', page: Number(url.searchParams.get('page')) || 1 }))
}

/** POST /api/admin/hosting/domains { op: complete | cancel | complete-task, id, … } */
export async function POST_admin_domains(req: NextRequest) {
  const g = await adminGuard(req, 'hosting', PERMISSIONS)
  if ('response' in g) return g.response
  const body = await req.json().catch(() => null)
  const id = Number(body?.id) || 0
  if (!id) return err('پیدا نشد', 404)
  try {
    if (body?.op === 'complete') {
      const result = await completeDomainRegistration(id, { expiresAt: body.expiresAt || undefined, nameservers: body.nameservers || undefined }, g.admin.id)
      await auditAdmin({ req, actor: g.admin, action: 'hosting.domain.complete', targetType: 'domain', targetId: id })
      return ok(result)
    }
    if (body?.op === 'cancel') {
      const result = await cancelDomainOrder(id, String(body.reason || ''), g.admin.id)
      await auditAdmin({ req, actor: g.admin, action: 'hosting.domain.cancel', targetType: 'domain', targetId: id })
      return ok(result)
    }
    if (body?.op === 'complete-task') {
      const result = await completeDomainTask(id, g.admin.id, String(body.note || ''))
      await auditAdmin({ req, actor: g.admin, action: 'hosting.domain.task', targetType: 'domain-action', targetId: id })
      return ok(result)
    }
    return err('عملیات نامعتبر است')
  } catch (error) { return refusal(error) }
}

/** GET /api/admin/hosting/tlds */
export async function GET_admin_tlds(req: NextRequest) {
  const g = await adminGuard(req, 'hosting', PERMISSIONS)
  if ('response' in g) return g.response
  return privateJson({ tlds: await adminTlds() })
}

/** POST /api/admin/hosting/tlds { op: save | delete, … } */
export async function POST_admin_tlds(req: NextRequest) {
  const g = await adminGuard(req, 'hosting', PERMISSIONS)
  if ('response' in g) return g.response
  const body = await req.json().catch(() => null)
  try {
    if (body?.op === 'save') {
      const saved = await saveTld(body.tld || {})
      await auditAdmin({ req, actor: g.admin, action: 'hosting.tld.save', targetType: 'domain-tld', targetId: saved.id })
      return ok({ tld: saved })
    }
    if (body?.op === 'delete') {
      const id = Number(body.id) || 0
      if (!await deleteTld(id)) return err('پسوند پیدا نشد', 404)
      await auditAdmin({ req, actor: g.admin, action: 'hosting.tld.delete', targetType: 'domain-tld', targetId: id })
      return ok({ ok: true })
    }
    return err('عملیات نامعتبر است')
  } catch (error) { return refusal(error) }
}
