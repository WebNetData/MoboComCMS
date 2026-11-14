import { CONTENT_TYPES, DEFAULT_SETTINGS, type FieldType, type FormDefinition, type FormField, type FormSettings, type SubmissionStatus } from '@/modules/forms/domain/forms'

export type SavedForm = FormDefinition & { id: number; createdAt: string; updatedAt: string; counts: { total: number; new: number; spam: number } }
export type Template = { id: string; name: string; description: string; form: Omit<FormDefinition, 'id'> }
export type Row = { formId: number; formTitle: string; id: number; status: SubmissionStatus; note: string; userId: number | null; user: string; createdAt: string; answers: { id: string; label: string; type?: FieldType; value: string | boolean | string[] }[]; files: { id: string; name: string; size: number }[]
  amount: number; currency: string; lines: { id: string; label: string; detail: string; amount: number }[]; payStatus: string; paidAt: string | null; orderId: number | null
  stage: string; assigneeId: number | null; assignee: string; reply: string; hasSecrets: boolean; secretsErasedAt: string | null; score: number; scoreMax: number
  steps: { key: string; label: string; pickup: boolean; receipt: boolean; invoice: boolean }[]; receipt: boolean; source: string; receivedAt: string | null
  repairInvoice: { orderId: number; number: string; status: string } | null; canAttachPaidServiceOrder?: boolean }

export const blankForm = (): FormDefinition => ({
  slug: '', title: '', description: '', published: false, successText: 'پیام شما با موفقیت ثبت شد. به‌زودی بررسی می‌کنیم.', settings: { ...DEFAULT_SETTINGS },
  fields: [{ id: 'name', label: 'نام و نام خانوادگی', type: 'text', required: true, options: [], width: 'half' }, { id: 'email', label: 'ایمیل', type: 'email', required: true, options: [], width: 'half' }, { id: 'message', label: 'پیام شما', type: 'textarea', required: true, options: [] }],
})

export const settingsOf = (form: FormDefinition): FormSettings => ({ ...DEFAULT_SETTINGS, ...(form.settings || {}) })

/** A field id that is free in this form (ids are used by conditions and exports, so they never change silently). */
export function freshId(fields: FormField[], type: FieldType) {
  const taken = new Set(fields.map((f) => f.id))
  for (let n = fields.length + 1; ; n++) { const id = `${type}_${n}`; if (!taken.has(id)) return id }
}

export function newField(fields: FormField[], type: FieldType, label: string): FormField {
  const field: FormField = { id: freshId(fields, type), label, type, required: false, options: [] }
  if (['select', 'radio', 'checkboxes'].includes(type)) field.options = ['گزینهٔ اول', 'گزینهٔ دوم']
  if (type === 'paragraph') field.help = 'متن توضیحی را اینجا بنویسید.'
  if (type === 'rating') field.max = 5
  if (type === 'file') field.max = 1
  if (type === 'price') field.amount = 100000
  if (type === 'repeater') { field.columns = ['عنوان', 'توضیح']; field.max = 10 }
  if (type === 'slot') field.slot = { days: [6, 0, 1, 2, 3], from: '09:00', to: '17:00', minutes: 30, capacity: 1, horizon: 30 }
  if (type === 'slider') { field.min = 0; field.max = 100 }
  if (type === 'fxamount') { field.currencies = ['USD', 'EUR']; field.markupPercent = 5; field.markupFixed = 0; field.required = true }
  return field
}

export const isContent = (type: FieldType) => CONTENT_TYPES.includes(type)

export const dateTimeLocal = (iso: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
