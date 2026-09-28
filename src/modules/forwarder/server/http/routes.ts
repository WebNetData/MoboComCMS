import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { ForwarderError } from '@/modules/forwarder/domain/forwarder'
import { createShortLink, deleteShortLink, getForwarderSettings, listShortLinks, saveForwarderSettings, updateShortLink } from '@/modules/forwarder/server/forwarder'

const guard = (req: NextRequest) => adminGuard(req, 'forwarder', ['forwarder.manage', 'settings.manage'])
const fail = (error: unknown) => {
  if (error instanceof ForwarderError) return err(error.message, error.status)
  throw error
}

/** GET /api/admin/forwarder?q=&page= — links, totals and settings. */
export async function GET_admin(req: NextRequest) {
  const g = await guard(req)
  if ('response' in g) return g.response
  const params = req.nextUrl.searchParams
  const [list, settings] = await Promise.all([listShortLinks({ q: params.get('q') || '', page: Number(params.get('page')) || 1 }), getForwarderSettings()])
  return ok({ ...list, settings })
}

/** POST { slug?, target, title?, countdown? } — new short link. */
export async function POST_admin(req: NextRequest) {
  const g = await guard(req)
  if ('response' in g) return g.response
  const body = (await req.json().catch(() => null)) || {}
  try {
    const link = await createShortLink({ slug: body.slug, target: body.target, title: body.title, countdown: body.countdown, actorId: g.admin.id })
    await auditAdmin({ req, actor: g.admin, action: 'forwarder.link.create', targetType: 'short-link', targetId: link.id, metadata: { slug: link.slug, target: link.target } })
    return ok({ link }, 201)
  } catch (error) { return fail(error) }
}

/** PUT { settings } */
export async function PUT_admin(req: NextRequest) {
  const g = await guard(req)
  if ('response' in g) return g.response
  const body = await req.json().catch(() => null)
  const settings = await saveForwarderSettings(body?.settings)
  await auditAdmin({ req, actor: g.admin, action: 'forwarder.settings', targetType: 'setting', targetId: 'forwarder.v1', metadata: { enabled: settings.enabled, countdown: settings.countdown, allowRawUrls: settings.allowRawUrls } })
  return ok({ settings })
}

type IdContext = { params: Promise<{ id: string }> }
const idOf = async (params: IdContext['params']) => { const id = Number((await params).id); return Number.isSafeInteger(id) && id > 0 ? id : 0 }

/** PATCH /api/admin/forwarder/:id { slug?, target?, title?, countdown?, active? } */
export async function PATCH_link(req: NextRequest, { params }: IdContext) {
  const g = await guard(req)
  if ('response' in g) return g.response
  const id = await idOf(params)
  const body = (await req.json().catch(() => null)) || {}
  try {
    const link = await updateShortLink(id, body)
    await auditAdmin({ req, actor: g.admin, action: 'forwarder.link.update', targetType: 'short-link', targetId: id, metadata: { slug: link.slug } })
    return ok({ link })
  } catch (error) { return fail(error) }
}

export async function DELETE_link(req: NextRequest, { params }: IdContext) {
  const g = await guard(req)
  if ('response' in g) return g.response
  const id = await idOf(params)
  await deleteShortLink(id)
  await auditAdmin({ req, actor: g.admin, action: 'forwarder.link.delete', targetType: 'short-link', targetId: id })
  return ok({ ok: true })
}
