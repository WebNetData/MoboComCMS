import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { moduleGuard } from '@/extensions/server/modules'
import { requireUser } from '@/modules/identity/server/access'
import { HostingRefusal, memberHostingService, memberHostingServices, revealServicePassword } from '@/modules/hosting/server/services'
import { setServiceAutoRenew } from '@/modules/hosting/server/renewal'
import { createHourlyService, hourlyUsage, terminateHourlyByCustomer } from '@/modules/hosting/server/metering'
import { HostingError } from '@/modules/hosting/domain/catalog'

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
  return privateJson({ service, usage: service.cycle === 'HOURLY' ? await hourlyUsage(user.id, id) : null })
}

/** POST /api/hosting/services/:id { action: 'reveal' } — the login password, to its owner, a few times a minute;
 *  { action: 'auto-renew', on } — renewal from the wallet on or off. */
export async function POST_service(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const off = await moduleGuard('hosting')
  if (off) return off
  const user = await requireUser(req)
  if (!user) return err('ابتدا وارد حساب خود شوید', 401)
  const id = await serviceId(params)
  if (!id) return err('سرویس پیدا نشد', 404)
  const body = await req.json().catch(() => null)
  if (body?.action === 'auto-renew') {
    try { return privateJson(await setServiceAutoRenew(user.id, id, body.on === true)) }
    catch (error) { if (error instanceof HostingRefusal) return err(error.message, error.status); throw error }
  }
  if (body?.action === 'terminate') {
    if (!(await rateLimitStrict(`hosting:terminate:${user.id}`, 5, 60_000)).ok) return err('چند لحظه بعد دوباره امتحان کنید', 429)
    try { return privateJson(await terminateHourlyByCustomer(user.id, id, body.confirm)) }
    catch (error) { if (error instanceof HostingRefusal) return err(error.message, error.status); throw error }
  }
  if (body?.action !== 'reveal') return err('عملیات نامعتبر است')
  if (!(await rateLimitStrict(`hosting:reveal:${user.id}`, 6, 60_000)).ok) return err('چند لحظه بعد دوباره امتحان کنید', 429)
  try {
    return privateJson({ password: await revealServicePassword(user.id, id) })
  } catch (error) {
    if (error instanceof HostingRefusal) return err(error.message, error.status)
    throw error
  }
}

/** POST /api/hosting/hourly { productId, hostingName } with Idempotency-Key — buy an hourly service, paid per hour. */
export async function POST_hourly(req: NextRequest) {
  const off = await moduleGuard('hosting')
  if (off) return off
  const user = await requireUser(req)
  if (!user) return err('ابتدا وارد حساب خود شوید', 401, { code: 'NEED_LOGIN' })
  if (!(await rateLimitStrict(`hosting:hourly:${user.id}`, 10, 60_000)).ok) return err('چند لحظه بعد دوباره امتحان کنید', 429)
  const body = await req.json().catch(() => null)
  const productId = Number(body?.productId)
  if (!Number.isSafeInteger(productId) || productId <= 0) return err('پلن را انتخاب کنید')
  try {
    const result = await createHourlyService({ userId: user.id, productId, hostname: typeof body?.hostingName === 'string' ? body.hostingName.slice(0, 260) : '', requestKey: String(req.headers.get('idempotency-key') || '').trim() })
    return privateJson(result)
  } catch (error) {
    if (error instanceof HostingRefusal) return err(error.message, error.status, { code: error.code })
    if (error instanceof HostingError) return err(error.message, 400, { code: 'HOSTING' })
    throw error
  }
}
