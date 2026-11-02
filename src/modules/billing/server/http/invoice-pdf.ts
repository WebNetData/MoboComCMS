import { NextRequest } from 'next/server'
import { err } from '@/platform/http/response'
import { rateLimitHit } from '@/platform/http/rate-limit'
import { requirePerm, requireUser } from '@/modules/identity/server/access'
import { getSettings } from '@/modules/settings/server'
import { officialInvoice } from '@/modules/billing/server/official-invoice'
import { invoicePdf } from '@/modules/billing/server/invoice-pdf'

/** The invoice as a PDF file, for its owner or staff. Drafts have no document yet. */
export async function GET_invoicePdf(req: NextRequest, { params }: { params: Promise<{ number: string }> }) {
  const user = await requireUser(req)
  if (!user) return err('برای دریافت فاکتور وارد شوید', 401)
  if (!rateLimitHit(`invoice-pdf:${user.id}`, 40, 10 * 60_000).ok) return err('کمی بعد دوباره تلاش کنید', 429)
  const number = decodeURIComponent((await params).number)
  const admin = user.role === 'ADMIN' && Boolean(await requirePerm(req, 'invoices.manage'))
  const doc = await officialInvoice(number, { id: user.id, admin })
  if (!doc || doc.status === 'DRAFT') return err('فاکتور پیدا نشد', 404)
  const settings = await getSettings()
  const siteUrl = (settings.siteUrl || process.env.NEXTAUTH_URL || '').replace(/\/+$/, '')
  const bytes = await invoicePdf({ doc, link: `${siteUrl}/invoice/${encodeURIComponent(doc.number)}`, siteUrl, supportEmail: settings.supportEmail || '' })
  const name = `invoice-${doc.number.replace(/[^\w.-]/g, '_')}.pdf`
  return new Response(new Uint8Array(bytes), { headers: {
    'content-type': 'application/pdf', 'content-length': String(bytes.length),
    'content-disposition': `${req.nextUrl.searchParams.get('download') === '1' ? 'attachment' : 'inline'}; filename="${name}"`,
    'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff',
  } })
}
