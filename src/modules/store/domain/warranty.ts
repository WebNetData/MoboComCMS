import { StoreError } from './store'

export type WarrantyDraft = {
  orderLineId: number
  unitIndex: number
  warrantyStartsAt: Date
  warrantyEndsAt: Date
  provider: string
  conditions: string
}

const text = (value: unknown, max: number) => String(value ?? '').replace(/[<>\u0000-\u001f]/g, ' ').trim().slice(0, max)

function date(value: unknown, field: string) {
  const raw = String(value ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new StoreError(`${field} را به شکل تاریخ معتبر وارد کنید`)
  const parsed = new Date(`${raw}T00:00:00.000Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) throw new StoreError(`${field} معتبر نیست`)
  return parsed
}

/** Warranty metadata is staff-entered; this validates the record without asserting coverage policy. */
export function parseWarrantyDraft(raw: unknown): WarrantyDraft {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {}
  const orderLineId = Number(value.orderLineId), unitIndex = Number(value.unitIndex)
  if (!Number.isSafeInteger(orderLineId) || orderLineId <= 0 || !Number.isSafeInteger(unitIndex) || unitIndex < 0 || unitIndex > 98) throw new StoreError('شناسهٔ ردیف و واحد دستگاه معتبر نیست')
  const warrantyStartsAt = date(value.warrantyStartsAt, 'تاریخ شروع ضمانت')
  const warrantyEndsAt = date(value.warrantyEndsAt, 'تاریخ پایان ضمانت')
  if (warrantyEndsAt < warrantyStartsAt) throw new StoreError('تاریخ پایان ضمانت نمی‌تواند پیش از شروع آن باشد')
  const provider = text(value.provider, 160), conditions = text(value.conditions, 2000)
  if (provider.length < 2 || conditions.length < 2) throw new StoreError('ارائه‌دهنده و شرایط ثبت‌شدهٔ ضمانت را وارد کنید')
  return { orderLineId, unitIndex, warrantyStartsAt, warrantyEndsAt, provider, conditions }
}

export function parseWarrantyUpdate(raw: unknown) {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {}
  const expectedUpdatedAt = new Date(String(value.expectedUpdatedAt ?? ''))
  if (!Number.isFinite(expectedUpdatedAt.getTime())) throw new StoreError('نسخهٔ ضمانت معتبر نیست')
  const warrantyStartsAt = date(value.warrantyStartsAt, 'تاریخ شروع ضمانت')
  const warrantyEndsAt = date(value.warrantyEndsAt, 'تاریخ پایان ضمانت')
  if (warrantyEndsAt < warrantyStartsAt) throw new StoreError('تاریخ پایان ضمانت نمی‌تواند پیش از شروع آن باشد')
  const provider = text(value.provider, 160), conditions = text(value.conditions, 2000)
  if (provider.length < 2 || conditions.length < 2) throw new StoreError('ارائه‌دهنده و شرایط ثبت‌شدهٔ ضمانت را وارد کنید')
  return { expectedUpdatedAt, warrantyStartsAt, warrantyEndsAt, provider, conditions }
}
