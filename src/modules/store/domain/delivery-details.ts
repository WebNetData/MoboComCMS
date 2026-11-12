import { DEFAULT_CARD_DESIGN, readCardDesign, type CardDesign } from '@/modules/store/domain/card-designs'

/**
 * What a specialist hands the buyer of a virtual order (owner 2026-11-12, «a ChatGPT Plus account made by hand»): named
 * items such as an email and a password, each copied on its own, secret ones hidden until the buyer asks, and a note.
 * Stored in `ProductDelivery.digitalDelivery`, encrypted as before; older deliveries were free text and still read as a
 * note, so nothing written before changes. Pure rules, shared by the Admin form and the buyer's order page.
 */

/**
 * Where a row sits on the delivery card: `card` (the default), `hero` (large: an amount such as «$50»), `email` (its
 * own part of the card: the mailbox made with an account) or `aside` (beside the card: security questions).
 */
export const DELIVERY_PLACES = ['card', 'hero', 'email', 'aside'] as const
export type DeliveryPlace = typeof DELIVERY_PLACES[number]
export type DeliveryItem = { label: string; value: string; secret: boolean; place?: DeliveryPlace }
export type DeliveryDetails = { items: DeliveryItem[]; note: string }
export const placeOf = (item: { place?: unknown; aside?: unknown }): DeliveryPlace => DELIVERY_PLACES.includes(item.place as DeliveryPlace) ? item.place as DeliveryPlace : item.aside === true ? 'aside' : 'card'

/** A file handed over with the delivery (store/server/delivery-files), as the buyer and the specialist see it. */
export type DeliveryFileView = { id: number; label: string; filename: string; sizeBytes: string }

export const MAX_DELIVERY_ITEMS = 12
const MAX_LABEL = 160
const MAX_VALUE = 4000
const MAX_NOTE = 2000
const MARK = 'mobocom-delivery:v1:'

/** Starting points for the specialist and the product template; every row stays editable. */
export const DELIVERY_TEMPLATES: { id: string; label: string; items: Omit<DeliveryItem, 'value'>[] }[] = [
  { id: 'account', label: 'اکانت', items: [{ label: 'ایمیل', secret: false }, { label: 'رمز عبور', secret: true }] },
  { id: 'account-email', label: 'اکانت با ساخت ایمیل', items: [{ label: 'Apple ID', secret: false }, { label: 'رمز عبور', secret: true }, { label: 'آدرس ایمیل', secret: false, place: 'email' }, { label: 'رمز ایمیل', secret: true, place: 'email' }] },
  { id: 'account-recovery', label: 'اکانت با کد بازیابی', items: [{ label: 'ایمیل', secret: false }, { label: 'رمز عبور', secret: true }, { label: 'کدهای بازیابی', secret: true }] },
  { id: 'gift', label: 'گیفت کارت', items: [{ label: 'اعتبار', secret: false, place: 'hero' }, { label: 'کد', secret: true }, { label: 'ریجن', secret: false }] },
  { id: 'license', label: 'کد لایسنس', items: [{ label: 'کد لایسنس', secret: true }] },
  { id: 'link', label: 'لینک دسترسی', items: [{ label: 'لینک', secret: false }] },
  { id: 'questions', label: 'سؤال‌های امنیتی', items: [{ label: 'سؤال امنیتی ۱', secret: false, place: 'aside' }, { label: 'سؤال امنیتی ۲', secret: false, place: 'aside' }, { label: 'سؤال امنیتی ۳', secret: false, place: 'aside' }] },
]

export class DeliveryDetailsError extends Error {}

const clean = (value: unknown, max: number) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max)
const placed = (place: DeliveryPlace) => place === 'card' ? {} : { place }

/** The specialist's form, checked: the text to encrypt. Rows left empty are dropped; a row needs a name and a value. */
export function composeDeliveryDetails(input: { items?: unknown; note?: unknown }): string {
  const rows = Array.isArray(input.items) ? input.items : []
  const items: DeliveryItem[] = []
  for (const row of rows) {
    const item = row && typeof row === 'object' ? row as Record<string, unknown> : {}
    const label = clean(item.label, MAX_LABEL)
    // A secret (a password) is kept as typed: its spaces may matter.
    const value = item.secret === true ? String(item.value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, MAX_VALUE) : clean(item.value, MAX_VALUE)
    if (!label && !value.trim()) continue
    if (!label) throw new DeliveryDetailsError('برای هر مقدار یک عنوان بنویسید (مثلاً ایمیل)')
    if (!value.trim()) throw new DeliveryDetailsError(`مقدار «${label}» خالی است`)
    items.push({ label, value, secret: item.secret === true, ...placed(placeOf(item)) })
  }
  if (items.length > MAX_DELIVERY_ITEMS) throw new DeliveryDetailsError(`حداکثر ${MAX_DELIVERY_ITEMS.toLocaleString('fa-IR')} مورد`)
  const note = clean(input.note, MAX_NOTE)
  if (!items.length && !note) throw new DeliveryDetailsError('اطلاعات تحویل خالی است')
  return MARK + JSON.stringify({ items, note })
}

/** A stored delivery as items and a note; free text written before this (or a code list) is its note. */
export function readDeliveryDetails(text: string): DeliveryDetails & { structured: boolean } {
  if (!text.startsWith(MARK)) return { items: [], note: text.trim(), structured: false }
  try {
    const raw = JSON.parse(text.slice(MARK.length)) as { items?: unknown; note?: unknown }
    const items = (Array.isArray(raw.items) ? raw.items : []).slice(0, MAX_DELIVERY_ITEMS).flatMap((row): DeliveryItem[] => {
      const item = row && typeof row === 'object' ? row as Record<string, unknown> : {}
      return typeof item.label === 'string' && typeof item.value === 'string' ? [{ label: item.label.slice(0, MAX_LABEL), value: item.value.slice(0, MAX_VALUE), secret: item.secret === true, ...placed(placeOf(item)) }] : []
    })
    return { items, note: typeof raw.note === 'string' ? raw.note.slice(0, MAX_NOTE) : '', structured: true }
  } catch { return { items: [], note: '', structured: true } }
}

/** The same delivery as plain lines (for the printable invoice and the text file). */
export function deliveryDetailsText(details: DeliveryDetails): string {
  return [...details.items.map((item) => `${item.label}: ${item.value}`), details.note].filter(Boolean).join('\n')
}

// ------------------------------------------------------------------ the product's delivery template

/**
 * What a product's deliveries look like (owner 2026-11-12, «like an Apple ID card»): the rows the specialist's form
 * starts with (each for all of the product's options or only some, «with an email» say), a default note, notices the
 * buyer reads above what was delivered (turn off Find My…), whether the delivery is shown as a card, and its design.
 * Stored on `Product.deliveryTemplate` as JSON.
 */
export const NOTICE_TONES = ['info', 'warning', 'danger'] as const
export type NoticeTone = typeof NOTICE_TONES[number]
export type DeliveryNotice = { tone: NoticeTone; text: string }
/** `variants`: the product options this row is for; empty = all. */
export type DeliveryTemplateRow = { label: string; secret: boolean; place: DeliveryPlace; variants: string[] }
export type ProductDeliveryTemplate = { card: boolean; rows: DeliveryTemplateRow[]; note: string; notices: DeliveryNotice[]; design: CardDesign }
export const EMPTY_DELIVERY_TEMPLATE: ProductDeliveryTemplate = { card: false, rows: [], note: '', notices: [], design: DEFAULT_CARD_DESIGN }
export const MAX_DELIVERY_NOTICES = 6
const MAX_NOTICE = 600

function templateOf(raw: unknown, strict: boolean): ProductDeliveryTemplate {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {}
  const rows = (Array.isArray(value.rows) ? value.rows : []).flatMap((row): DeliveryTemplateRow[] => {
    const item = row && typeof row === 'object' ? row as Record<string, unknown> : {}
    const label = clean(item.label, MAX_LABEL)
    const variants = (Array.isArray(item.variants) ? item.variants : []).map((name) => clean(name, 120)).filter(Boolean).slice(0, 30)
    return label ? [{ label, secret: item.secret === true, place: placeOf(item), variants }] : []
  })
  const notices = (Array.isArray(value.notices) ? value.notices : []).flatMap((row): DeliveryNotice[] => {
    const item = row && typeof row === 'object' ? row as Record<string, unknown> : {}
    const text = clean(item.text, MAX_NOTICE)
    return text ? [{ tone: NOTICE_TONES.includes(item.tone as NoticeTone) ? item.tone as NoticeTone : 'info', text }] : []
  })
  if (strict && rows.length > MAX_DELIVERY_ITEMS) throw new DeliveryDetailsError(`الگوی تحویل حداکثر ${MAX_DELIVERY_ITEMS.toLocaleString('fa-IR')} ردیف دارد`)
  if (strict && notices.length > MAX_DELIVERY_NOTICES) throw new DeliveryDetailsError(`حداکثر ${MAX_DELIVERY_NOTICES.toLocaleString('fa-IR')} پیام مهم`)
  return { card: value.card === true, rows: rows.slice(0, MAX_DELIVERY_ITEMS), note: clean(value.note, MAX_NOTE), notices: notices.slice(0, MAX_DELIVERY_NOTICES), design: readCardDesign(value.design) }
}
/** The Admin product form's template, checked before it is saved. */
export const validateDeliveryTemplate = (raw: unknown) => templateOf(raw, true)
/** A stored template; anything unreadable is the empty one. */
export function readDeliveryTemplate(text: string | null | undefined): ProductDeliveryTemplate {
  try { return templateOf(JSON.parse(text || '{}'), false) } catch { return EMPTY_DELIVERY_TEMPLATE }
}
/** The template's rows for one of the product's options (rows for other options are left out). */
export const rowsForVariant = (template: ProductDeliveryTemplate, variant: string) => template.rows.filter((row) => !row.variants.length || row.variants.includes(variant.trim()))
