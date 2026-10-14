/**
 * What an invoice is for, in the customer's words: a title for its row and a line that explains it.
 * Pure — the invoice page, the customer's invoice list and the official invoice all read it from here.
 */

export type InvoiceSubjectInput = {
  kind: string
  /** What staff wrote on the invoice; it wins over anything worked out. */
  title?: string | null
  detail?: string | null
  planName?: string | null
  productName?: string | null
  /** The order's meta (`Order.meta`, parsed): forms, content and membership purchases name themselves there. */
  meta?: Record<string, unknown> | null
  siteName: string
  /** The invoice's amount, already formatted for the reader (۱٬۰۰۰٬۰۰۰ تومان). */
  amountText: string
  notes?: string | null
}

const str = (value: unknown, max = 300) => (typeof value === 'string' ? value.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '')

export function invoiceSubject(input: InvoiceSubjectInput): { title: string; detail: string } {
  const site = str(input.siteName, 60) || 'موبوکام'
  const meta = input.meta && typeof input.meta === 'object' ? input.meta : {}
  const own = str(input.title, 120)
  if (own) return { title: own, detail: str(input.detail, 500) }
  if (input.kind === 'WALLET_TOPUP') {
    return { title: `افزایش موجودی کیف پول ${site}`, detail: `افزایش موجودی حساب کاربری پلتفرم ${site}${input.amountText ? ` به مبلغ ${input.amountText}` : ''}` }
  }
  if (meta.kind === 'form') {
    const id = Number(meta.submissionId)
    return {
      title: str(meta.invoiceTitle, 120) || str(meta.formTitle, 120) || 'درخواست خدمات',
      detail: str(meta.invoiceText, 500) || (Number.isSafeInteger(id) && id > 0 ? `درخواست شمارهٔ ${id.toLocaleString('fa-IR')}` : ''),
    }
  }
  if (meta.kind === 'membership') {
    const days = Number(meta.days)
    return { title: `اشتراک ویژهٔ ${str(meta.planName, 80) || site}`, detail: days > 0 ? `اعتبار ${days.toLocaleString('fa-IR')} روزه در ${site}` : '' }
  }
  if (meta.kind === 'content') return { title: `دسترسی به «${str(meta.contentTitle, 120) || 'محتوای ویژه'}»`, detail: `خرید محتوا در ${site}` }
  if (input.planName) return { title: str(input.planName, 120), detail: '' }
  if (input.productName) return { title: str(input.productName, 120), detail: str(meta.variantName, 120) }
  const note = str(String(input.notes || '').split('\n')[0], 120)
  return { title: note || 'فاکتور', detail: '' }
}
