/**
 * Official sales invoice (صورتحساب فروش کالا و خدمات): seller profile,
 * per-row discount / VAT split in the standard Iranian layout, and the grand
 * total in Persian words. Pure — amounts are integers in minor units.
 */

export type InvoiceProfile = {
  sellerName: string
  nationalId: string        // شناسهٔ ملی (legal) or کد ملی (individual)
  economicCode: string      // کد اقتصادی
  registrationNo: string    // شمارهٔ ثبت
  province: string
  city: string
  address: string
  postalCode: string
  phone: string
  logo: string
  stamp: string             // image of the stamp / signature
  vatBps: number            // 1000 = 10%
  pricesIncludeVat: boolean
  unit: 'rial' | 'toman'
  footerNote: string
}

export const DEFAULT_INVOICE_PROFILE: InvoiceProfile = {
  sellerName: '', nationalId: '', economicCode: '', registrationNo: '', province: '', city: '', address: '', postalCode: '', phone: '',
  logo: '', stamp: '', vatBps: 1000, pricesIncludeVat: true, unit: 'rial', footerNote: '',
}

const text = (value: unknown, max: number) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
const digits = (value: unknown, max: number) => String(value ?? '').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/\D/g, '').slice(0, max)
const image = (value: unknown) => {
  const raw = String(value ?? '').trim()
  if (/^\/(?!\/)[^\s<>"'`\\]{1,299}$/.test(raw)) return raw
  try { const url = new URL(raw); return url.protocol === 'https:' ? url.toString().slice(0, 500) : '' } catch { return '' }
}

/** Invoice override, then the primary site wordmark, then its compact mark. Print uses the light-surface brand. */
export function invoiceLogo(override: unknown, site: { wordmark?: unknown; logo?: unknown }): string {
  return image(override) || image(site.wordmark) || image(site.logo)
}

export function normalizeInvoiceProfile(input: unknown): InvoiceProfile {
  const raw = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const bps = Math.round(Number(raw.vatBps))
  return {
    sellerName: text(raw.sellerName, 120),
    nationalId: digits(raw.nationalId, 11),
    economicCode: digits(raw.economicCode, 14),
    registrationNo: text(raw.registrationNo, 30),
    province: text(raw.province, 40),
    city: text(raw.city, 40),
    address: text(raw.address, 300),
    postalCode: digits(raw.postalCode, 10),
    phone: text(raw.phone, 40),
    logo: image(raw.logo),
    stamp: image(raw.stamp),
    vatBps: Number.isSafeInteger(bps) && bps >= 0 && bps <= 5000 ? bps : DEFAULT_INVOICE_PROFILE.vatBps,
    pricesIncludeVat: typeof raw.pricesIncludeVat === 'boolean' ? raw.pricesIncludeVat : DEFAULT_INVOICE_PROFILE.pricesIncludeVat,
    unit: raw.unit === 'toman' ? 'toman' : 'rial',
    footerNote: text(raw.footerNote, 500),
  }
}

// ------------------------------------------------------------------ rows

export type SourceLine = { name: string; variantName?: string; sku?: string; quantity: number; unitPriceMinor: bigint; listPriceMinor: bigint; totalMinor: bigint }

export type InvoiceRow = {
  index: number; code: string; description: string; quantity: number
  unitMinor: bigint      // unit list price
  grossMinor: bigint     // quantity × unit
  discountMinor: bigint  // item discount + share of the coupon
  netMinor: bigint       // after discount, before VAT
  vatMinor: bigint
  totalMinor: bigint     // payable for the row
}

export type InvoiceTotals = { grossMinor: bigint; discountMinor: bigint; netMinor: bigint; vatMinor: bigint; totalMinor: bigint }

/** Rounded division for non-negative bigints. */
const divRound = (a: bigint, b: bigint) => (b === 0n ? 0n : (a + b / 2n) / b)

/**
 * Builds the rows. Line totals and shipping are what the customer paid; the
 * coupon is spread over the lines in proportion to their total (the last
 * line absorbs rounding, so the discount column adds up exactly). With
 * VAT-inclusive prices the tax is carved out of each row, otherwise added.
 */
export function buildInvoiceRows(input: { lines: SourceLine[]; couponMinor: bigint; shippingMinor: bigint; vatBps: number; pricesIncludeVat: boolean }): { rows: InvoiceRow[]; totals: InvoiceTotals } {
  const sources = [...input.lines]
  if (input.shippingMinor > 0n) sources.push({ name: 'هزینهٔ ارسال', quantity: 1, unitPriceMinor: input.shippingMinor, listPriceMinor: input.shippingMinor, totalMinor: input.shippingMinor })
  const itemsMinor = input.lines.reduce((sum, line) => sum + line.totalMinor, 0n)
  const coupon = input.couponMinor > itemsMinor ? itemsMinor : input.couponMinor < 0n ? 0n : input.couponMinor
  let couponLeft = coupon
  const lastItem = input.lines.length - 1
  const rate = BigInt(Math.max(0, Math.floor(input.vatBps)))
  const rows = sources.map((line, index): InvoiceRow => {
    const quantity = Math.max(1, line.quantity)
    const unit = line.listPriceMinor > line.unitPriceMinor ? line.listPriceMinor : line.unitPriceMinor
    const gross = unit * BigInt(quantity)
    const itemDiscount = gross > line.totalMinor ? gross - line.totalMinor : 0n
    let couponShare = 0n
    if (index <= lastItem && coupon > 0n && itemsMinor > 0n) {
      couponShare = index === lastItem ? couponLeft : (coupon * line.totalMinor) / itemsMinor
      if (couponShare > couponLeft) couponShare = couponLeft
      couponLeft -= couponShare
    }
    const paid = line.totalMinor - couponShare
    let net: bigint, vat: bigint
    if (input.pricesIncludeVat) { net = divRound(paid * 10_000n, 10_000n + rate); vat = paid - net }
    else { net = paid; vat = divRound(paid * rate, 10_000n) }
    return {
      index: index + 1, code: line.sku || '', description: line.variantName ? `${line.name} — ${line.variantName}` : line.name, quantity,
      unitMinor: unit, grossMinor: gross, discountMinor: itemDiscount + couponShare, netMinor: net, vatMinor: vat, totalMinor: net + vat,
    }
  })
  const sum = (key: keyof Omit<InvoiceRow, 'index' | 'code' | 'description' | 'quantity' | 'unitMinor'>) => rows.reduce((total, row) => total + row[key], 0n)
  return { rows, totals: { grossMinor: sum('grossMinor'), discountMinor: sum('discountMinor'), netMinor: sum('netMinor'), vatMinor: sum('vatMinor'), totalMinor: sum('totalMinor') } }
}

// ------------------------------------------------------------------ amount in words

const ONES = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه']
const TEENS = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده']
const TENS = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود']
const HUNDREDS = ['', 'یکصد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد']
const SCALES = ['', 'هزار', 'میلیون', 'میلیارد', 'هزار میلیارد', 'میلیون میلیارد']

function belowThousand(n: number): string {
  const parts: string[] = []
  if (n >= 100) { parts.push(HUNDREDS[Math.floor(n / 100)]); n %= 100 }
  if (n >= 20) { parts.push(TENS[Math.floor(n / 10)]); n %= 10; if (n) parts.push(ONES[n]) }
  else if (n >= 10) parts.push(TEENS[n - 10])
  else if (n > 0) parts.push(ONES[n])
  return parts.join(' و ')
}

/** 1250000 → «یک میلیون و دویست و پنجاه هزار». */
export function persianWords(value: bigint | number): string {
  let n = typeof value === 'bigint' ? value : BigInt(Math.trunc(value))
  if (n === 0n) return 'صفر'
  const negative = n < 0n
  if (negative) n = -n
  const groups: string[] = []
  let scale = 0
  while (n > 0n && scale < SCALES.length) {
    const chunk = Number(n % 1000n)
    if (chunk) groups.unshift(`${belowThousand(chunk)}${SCALES[scale] ? ` ${SCALES[scale]}` : ''}`)
    n /= 1000n; scale++
  }
  return `${negative ? 'منفی ' : ''}${groups.join(' و ')}`
}

/** Displayed amount in the invoice unit (Toman orders shown in Rial ×10 when the unit is rial). */
export function invoiceUnitAmount(minor: bigint, currency: string, unit: InvoiceProfile['unit']): bigint {
  const code = currency.toUpperCase()
  if (code === 'IRT' || code === 'TMN') return unit === 'rial' ? minor * 10n : minor
  if (code === 'IRR') return unit === 'toman' ? minor / 10n : minor
  return minor
}
