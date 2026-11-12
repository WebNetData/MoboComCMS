/**
 * What a specialist hands the buyer of a virtual order (owner 2026-11-12, «a ChatGPT Plus account made by hand»): named
 * items such as an email and a password, each copied on its own, secret ones hidden until the buyer asks, and a note.
 * Stored in `ProductDelivery.digitalDelivery`, encrypted as before; older deliveries were free text and still read as a
 * note, so nothing written before changes. Pure rules, shared by the Admin form and the buyer's order page.
 */

export type DeliveryItem = { label: string; value: string; secret: boolean }
export type DeliveryDetails = { items: DeliveryItem[]; note: string }

/** A file handed over with the delivery (store/server/delivery-files), as the buyer and the specialist see it. */
export type DeliveryFileView = { id: number; label: string; filename: string; sizeBytes: string }

export const MAX_DELIVERY_ITEMS = 12
const MAX_LABEL = 60
const MAX_VALUE = 4000
const MAX_NOTE = 2000
const MARK = 'mobocom-delivery:v1:'

/** Starting points for the specialist; every row stays editable. */
export const DELIVERY_TEMPLATES: { id: string; label: string; items: Omit<DeliveryItem, 'value'>[] }[] = [
  { id: 'account', label: 'اکانت', items: [{ label: 'ایمیل', secret: false }, { label: 'رمز عبور', secret: true }] },
  { id: 'account-recovery', label: 'اکانت با کد بازیابی', items: [{ label: 'ایمیل', secret: false }, { label: 'رمز عبور', secret: true }, { label: 'کدهای بازیابی', secret: true }] },
  { id: 'license', label: 'کد لایسنس', items: [{ label: 'کد لایسنس', secret: true }] },
  { id: 'link', label: 'لینک دسترسی', items: [{ label: 'لینک', secret: false }] },
]

export class DeliveryDetailsError extends Error {}

const clean = (value: unknown, max: number) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max)

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
    items.push({ label, value, secret: item.secret === true })
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
      return typeof item.label === 'string' && typeof item.value === 'string' ? [{ label: item.label.slice(0, MAX_LABEL), value: item.value.slice(0, MAX_VALUE), secret: item.secret === true }] : []
    })
    return { items, note: typeof raw.note === 'string' ? raw.note.slice(0, MAX_NOTE) : '', structured: true }
  } catch { return { items: [], note: '', structured: true } }
}

/** The same delivery as plain lines (for the printable invoice). */
export function deliveryDetailsText(details: DeliveryDetails): string {
  return [...details.items.map((item) => `${item.label}: ${item.value}`), details.note].filter(Boolean).join('\n')
}
