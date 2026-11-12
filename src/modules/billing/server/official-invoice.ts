import { db } from '@/platform/database/prisma'
import { readJsonSetting, writeJsonSetting, getSettings } from '@/modules/settings/server'
import { memberNationalId } from '@/modules/identity/server/profile-fields'
import { normalizeCurrency } from '@/shared/money'
import { invoiceSubject } from '@/modules/billing/domain/invoice-subject'
import { getSiteConfig } from '@/modules/site/config/store'
import {
  buildInvoiceRows, invoiceLogo, invoiceUnitAmount, normalizeInvoiceProfile, persianWords, type InvoiceProfile, type SourceLine,
} from '@/modules/billing/domain/official-invoice'

// The printable official invoice: seller profile from the admin, buyer from
// the order (shipping snapshot, then the default address) and the account.

const PROFILE_KEY = 'billing.invoice-profile.v1'

export async function getInvoiceProfile(): Promise<InvoiceProfile> {
  const [stored, settings] = await Promise.all([readJsonSetting(PROFILE_KEY, db).catch(() => undefined), getSettings().catch(() => ({} as Record<string, string>))])
  const profile = normalizeInvoiceProfile(stored)
  return { ...profile, sellerName: profile.sellerName || settings.brandName || '' }
}

/** Resolve presentation without storing the inherited logo as an override in the Admin form. */
export async function getBrandedInvoiceProfile(): Promise<InvoiceProfile> {
  const [profile, site] = await Promise.all([getInvoiceProfile(), getSiteConfig()])
  return { ...profile, logo: invoiceLogo(profile.logo, site) }
}

export async function saveInvoiceProfile(input: unknown) {
  const profile = normalizeInvoiceProfile(input)
  await writeJsonSetting(PROFILE_KEY, profile)
  return profile
}

const parse = (raw: string | null | undefined): Record<string, unknown> => { try { const value = JSON.parse(raw || '{}'); return value && typeof value === 'object' ? value : {} } catch { return {} } }
const minorOf = (value: unknown) => { try { return BigInt(String(value ?? '0')) } catch { return 0n } }
const str = (value: unknown) => (typeof value === 'string' ? value : '')

/** Everything the official invoice shows, or null when the viewer may not see it. */
export async function officialInvoice(number: string, viewer: { id: number; admin: boolean }) {
  const invoice = await db.invoice.findUnique({
    where: { number },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true } },
      plan: { select: { name: true } },
      product: { select: { name: true, sku: true } },
      gateway: { select: { name: true, provider: true } },
      order: { select: { id: true, meta: true, customerName: true, customerPhone: true, lines: { orderBy: { line: 'asc' }, select: { name: true, variantName: true, sku: true, quantity: true, unitPriceMinor: true, listPriceMinor: true, totalMinor: true } }, productDelivery: { select: { address: true } } } },
    },
  })
  if (!invoice || (!viewer.admin && invoice.userId !== viewer.id)) return null
  const [profile, nationalId, address] = await Promise.all([
    getBrandedInvoiceProfile(),
    invoice.userId === null ? '' : memberNationalId(invoice.userId).catch(() => ''),
    invoice.userId === null ? null : db.userAddress.findFirst({ where: { userId: invoice.userId }, orderBy: [{ isDefault: 'desc' }, { id: 'desc' }] }),
  ])
  const currency = normalizeCurrency(invoice.currency, 'IRT')
  const meta = parse(invoice.order?.meta)
  const shipTo = invoice.order?.productDelivery?.address ? parse(invoice.order.productDelivery.address) : (meta.shippingAddress && typeof meta.shippingAddress === 'object' ? meta.shippingAddress as Record<string, unknown> : null)

  let lines: SourceLine[]
  let couponMinor = 0n
  let shippingMinor = 0n
  if (invoice.order?.lines.length) {
    lines = invoice.order.lines
    couponMinor = minorOf(meta.discountMinor)
    shippingMinor = minorOf(meta.shippingMinor)
  } else {
    // Service / VIP / wallet invoices: one row from the invoice amounts.
    const subject = invoiceSubject({ kind: invoice.kind, title: invoice.title, detail: invoice.detail, planName: invoice.plan?.name, productName: invoice.product?.name, meta, siteName: profile.sellerName || 'موبوکام', amountText: '', notes: invoice.notes })
    const title = subject.detail ? `${subject.title} — ${subject.detail}` : subject.title
    lines = [{ name: title, sku: invoice.product?.sku || '', quantity: 1, unitPriceMinor: invoice.subtotalMinor, listPriceMinor: invoice.subtotalMinor, totalMinor: invoice.subtotalMinor }]
    couponMinor = invoice.discountMinor
  }
  // Wallet top-ups are not sales: no VAT line.
  const vatBps = invoice.kind === 'WALLET_TOPUP' ? 0 : profile.vatBps
  const { rows, totals } = buildInvoiceRows({ lines, couponMinor, shippingMinor, vatBps, pricesIncludeVat: profile.pricesIncludeVat })
  const shown = (minor: bigint) => invoiceUnitAmount(minor, currency, profile.unit).toString()
  const unitLabel = ['IRT', 'TMN', 'IRR'].includes(currency) ? (profile.unit === 'rial' ? 'ریال' : 'تومان') : currency
  const payable = invoiceUnitAmount(totals.totalMinor, currency, profile.unit)

  return {
    number: invoice.number, status: invoice.status, issuedAt: invoice.issuedAt, paidAt: invoice.paidAt, orderId: invoice.order?.id ?? null,
    payment: invoice.gateway?.name || (invoice.walletAppliedMinor >= invoice.totalMinor && invoice.totalMinor > 0n ? 'کیف پول' : ''),
    walletApplied: invoice.walletAppliedMinor > 0n ? shown(invoice.walletAppliedMinor) : '',
    seller: profile,
    buyer: {
      name: invoice.order?.customerName || invoice.user?.name || str(shipTo?.recipient) || invoice.user?.email || 'مشتری حضوری',
      nationalId,
      phone: invoice.order?.customerPhone || str(shipTo?.phone) || invoice.user?.phone || address?.mobile || '',
      province: str(shipTo?.province) || address?.province || '',
      city: str(shipTo?.city) || address?.city || '',
      address: str(shipTo?.address) || address?.address || '',
      postalCode: str(shipTo?.postalCode) || address?.postalCode || '',
      email: /@(phone|bot)\.mobocom\.local$|\.local$/.test(invoice.user?.email || '') ? '' : invoice.user?.email || '',
    },
    unitLabel,
    vatPercent: vatBps / 100,
    pricesIncludeVat: profile.pricesIncludeVat,
    rows: rows.map((row) => ({ index: row.index, code: row.code, description: row.description, quantity: row.quantity, unit: shown(row.unitMinor), gross: shown(row.grossMinor), discount: shown(row.discountMinor), net: shown(row.netMinor), vat: shown(row.vatMinor), total: shown(row.totalMinor) })),
    totals: { gross: shown(totals.grossMinor), discount: shown(totals.discountMinor), net: shown(totals.netMinor), vat: shown(totals.vatMinor), total: shown(totals.totalMinor) },
    totalWords: `${persianWords(payable)} ${unitLabel}`,
  }
}
export type OfficialInvoice = NonNullable<Awaited<ReturnType<typeof officialInvoice>>>
