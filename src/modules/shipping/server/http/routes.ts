import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { moduleGuard } from '@/extensions/server/modules'
import { requireUser } from '@/modules/identity/server/access'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { ShippingError } from '@/modules/shipping/domain/shipping'
import { sectionSettingsSaveWith } from '@/modules/settings/server/http/section-history'
import { sectionSettingsRevision } from '@/modules/settings/server/section-history'
import {
  deleteAddress, deliverySchedule, getDeliverySettings, listAddresses, saveAddress, saveDeliverySettings, setDefaultAddress,
} from '@/modules/shipping/server/shipping'

function failure(error: unknown) {
  if (error instanceof ShippingError) return err(error.message, error.status, { code: error.code })
  console.error('[shipping]', error)
  return err('خطای داخلی؛ دوباره تلاش کنید', 500)
}

async function customer(req: NextRequest) {
  const off = await moduleGuard('store')
  if (off) return { response: off }
  const user = await requireUser(req)
  if (!user) return { response: err('ابتدا وارد حساب خود شوید', 401, { code: 'NEED_LOGIN' }) }
  return { user }
}

const addressId = (value: unknown) => {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : 0
}

/** GET /api/addresses — the signed-in customer's address book. */
export async function GET_addresses(req: NextRequest) {
  const c = await customer(req)
  if ('response' in c) return c.response
  return ok({ addresses: await listAddresses(c.user.id) })
}

/** POST /api/addresses { title, recipient, mobile, province, city, address, plaque, unit, postalCode, isDefault } */
export async function POST_addresses(req: NextRequest) {
  const c = await customer(req)
  if ('response' in c) return c.response
  const body = (await req.json().catch(() => null)) || {}
  try { return ok({ address: await saveAddress(c.user.id, body) }, 201) } catch (error) { return failure(error) }
}

type IdContext = { params: Promise<{ id: string }> }

/** PATCH /api/addresses/:id { ...fields } or { makeDefault: true } */
export async function PATCH_address(req: NextRequest, { params }: IdContext) {
  const c = await customer(req)
  if ('response' in c) return c.response
  const id = addressId((await params).id)
  if (!id) return err('invalid id')
  const body = (await req.json().catch(() => null)) || {}
  try {
    if (body.makeDefault === true && Object.keys(body).length === 1) return ok(await setDefaultAddress(c.user.id, id))
    return ok({ address: await saveAddress(c.user.id, body, id) })
  } catch (error) { return failure(error) }
}

/** DELETE /api/addresses/:id */
export async function DELETE_address(req: NextRequest, { params }: IdContext) {
  const c = await customer(req)
  if ('response' in c) return c.response
  const id = addressId((await params).id)
  if (!id) return err('invalid id')
  try { return ok(await deleteAddress(c.user.id, id)) } catch (error) { return failure(error) }
}

/** GET /api/delivery/schedule — selectable delivery days and time windows. */
export async function GET_schedule() {
  const off = await moduleGuard('store')
  if (off) return off
  const { settings, days } = await deliverySchedule()
  return ok({ enabled: settings.enabled, feeRial: settings.feeRial, freeOverRial: settings.freeOverRial, days })
}

const adminOnly = (req: NextRequest) => adminGuard(req, 'store', ['orders.manage', 'settings.manage'])

/** GET /api/admin/delivery — schedule settings plus the live booking view. */
export async function GET_admin(req: NextRequest) {
  const g = await adminOnly(req)
  if ('response' in g) return g.response
  const [settings, schedule] = await Promise.all([getDeliverySettings(), deliverySchedule()])
  return ok({ settings, days: schedule.days, settingsRevision: sectionSettingsRevision(settings) })
}

/** POST /api/admin/delivery { enabled, leadDays, daysAhead, cutoffHour, closedWeekdays, holidays, slots, feeRial, freeOverRial } */
export async function POST_admin(req: NextRequest) {
  const g = await adminOnly(req)
  if ('response' in g) return g.response
  const body = (await req.json().catch(() => null)) || {}
  try {
    return await sectionSettingsSaveWith(req, g.admin, (context) => saveDeliverySettings(body, context), async (settings) => ({ settings, days: (await deliverySchedule()).days }))
  } catch (error) { return failure(error) }
}
