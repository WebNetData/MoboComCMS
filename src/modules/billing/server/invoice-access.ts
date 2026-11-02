import { NextRequest } from 'next/server'
import { requirePerm } from '@/modules/identity/server/access'

/** Server pages use the same current-role/2-step invoice guard as the Admin API. */
export async function invoiceStaffAccess(incoming: Headers): Promise<boolean> {
  return Boolean(await requirePerm(new NextRequest('http://invoice.internal', { headers: incoming }), 'invoices.manage'))
}
