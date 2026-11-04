import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { moduleGuard } from '@/extensions/server/modules'
import { requireUser } from '@/modules/identity/server/access'
import { HostingRefusal, memberHostingService, memberHostingServices, revealServicePassword } from '@/modules/hosting/server/services'

const privateJson = (body: unknown) => { const response = ok(body); response.headers.set('cache-control', 'private, no-store'); return response }

/** GET /api/hosting/services — the signed-in member's own services. */
export async function GET_services(req: NextRequest) {
  const off = await moduleGuard('hosting')
  if (off) return off
  const user = await requireUser(req)
  if (!user) return err('ابتدا وارد حساب خود شوید', 401)
  return privateJson({ services: await memberHostingServices(user.id) })
}

const serviceId = async (params: Promise<{ id: string }>) => { const id = Number((await params).id); return Number.isSafeInteger(id) && id > 0 ? id : 0 }

/** GET /api/hosting/services/:id — one of the member's own services; another member's answers 404. */
export async function GET_service(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const off = await moduleGuard('hosting')
  if (off) return off
  const user = await requireUser(req)
  if (!user) return err('ابتدا وارد حساب خود شوید', 401)
  const id = await serviceId(params)
  const service = id ? await memberHostingService(user.id, id) : null
  if (!service) return err('سرویس پیدا نشد', 404)
  return privateJson({ service })
}

/** POST /api/hosting/services/:id { action: 'reveal' } — the login password, to its owner, a few times a minute. */
export async function POST_service(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const off = await moduleGuard('hosting')
  if (off) return off
  const user = await requireUser(req)
  if (!user) return err('ابتدا وارد حساب خود شوید', 401)
  const id = await serviceId(params)
  if (!id) return err('سرویس پیدا نشد', 404)
  const body = await req.json().catch(() => null)
  if (body?.action !== 'reveal') return err('عملیات نامعتبر است')
  if (!(await rateLimitStrict(`hosting:reveal:${user.id}`, 6, 60_000)).ok) return err('چند لحظه بعد دوباره امتحان کنید', 429)
  try {
    return privateJson({ password: await revealServicePassword(user.id, id) })
  } catch (error) {
    if (error instanceof HostingRefusal) return err(error.message, error.status)
    throw error
  }
}
