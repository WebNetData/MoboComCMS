import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { requirePerm } from '@/modules/identity/server/access'
import { getInvoiceProfile, saveInvoiceProfile } from '@/modules/billing/server/official-invoice'

const allowed = async (req: NextRequest) => (await requirePerm(req, 'invoices.manage')) || (await requirePerm(req, 'settings.manage'))

/** GET /api/admin/invoice-profile — seller details printed on official invoices. */
export async function GET_profile(req: NextRequest) {
  if (!await allowed(req)) return err('forbidden', 403)
  return ok({ profile: await getInvoiceProfile() })
}

/** PUT /api/admin/invoice-profile { profile } */
export async function PUT_profile(req: NextRequest) {
  const admin = await allowed(req)
  if (!admin) return err('forbidden', 403)
  const body = await req.json().catch(() => null)
  const profile = await saveInvoiceProfile(body?.profile)
  await auditAdmin({ req, actor: admin, action: 'invoice_profile.update', targetType: 'setting', targetId: 'billing.invoice-profile.v1', metadata: { sellerName: profile.sellerName, vatBps: profile.vatBps, pricesIncludeVat: profile.pricesIncludeVat, unit: profile.unit } })
  return ok({ profile })
}
