import { CONTENT_TYPES, DEFAULT_SETTINGS, type FieldType, type FormDefinition, type FormField, type FormSettings, type SubmissionStatus } from '@/modules/forms/domain/forms'

export type SavedForm = FormDefinition & { id: number; createdAt: string; updatedAt: string; counts: { total: number; new: number; spam: number } }
export type Template = { id: string; name: string; description: string; form: Omit<FormDefinition, 'id'> }
export type Row = { id: number; status: SubmissionStatus; note: string; userId: number | null; user: string; createdAt: string; answers: { id: string; label: string; type?: FieldType; value: string | boolean | string[] }[]; files: { id: string; name: string; size: number }[] }

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
