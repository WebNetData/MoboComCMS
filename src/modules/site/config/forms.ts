export type FormField = { id: string; label: string; type: 'text' | 'email' | 'tel' | 'textarea' | 'select' | 'checkbox'; required: boolean; options: string[] }
export type FormDefinition = { id?: number; slug: string; title: string; description: string; fields: FormField[]; published: boolean; successText: string }
export function validForm(b: unknown): b is FormDefinition {
  if (!b || typeof b !== 'object') return false
  const v = b as FormDefinition
  return typeof v.slug === 'string' && /^[a-z][a-z0-9-]{1,79}$/.test(v.slug) && typeof v.title === 'string' && v.title.trim().length > 0 && v.title.length <= 150 && typeof v.description === 'string' && v.description.length <= 2000 && typeof v.successText === 'string' && v.successText.trim().length > 0 && v.successText.length <= 1000 && typeof v.published === 'boolean' && Array.isArray(v.fields) && v.fields.length > 0 && v.fields.length <= 30 && new Set(v.fields.map(f => f?.id)).size === v.fields.length && v.fields.every(f => f && typeof f.id === 'string' && /^[a-z][a-z0-9_]{0,50}$/.test(f.id) && !['__proto__','constructor','prototype','website'].includes(f.id) && typeof f.label === 'string' && f.label.trim().length > 0 && f.label.length <= 200 && ['text','email','tel','textarea','select','checkbox'].includes(f.type) && typeof f.required === 'boolean' && Array.isArray(f.options) && f.options.length <= 40 && (f.type !== 'select' || f.options.length > 0) && f.options.every(o => typeof o === 'string' && o.trim().length > 0 && o.length <= 150))
}
export function validateSubmission(fields: FormField[], input: unknown): Record<string, string | boolean> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('اطلاعات فرم معتبر نیست')
  const values = input as Record<string, unknown>
  const result: Record<string, string | boolean> = Object.create(null)
  for (const f of fields) {
    const v = values[f.id]
    if (f.type === 'checkbox') {
      if (v !== undefined && typeof v !== 'boolean') throw new Error(`مقدار ${f.label} معتبر نیست`)
      if (f.required && v !== true) throw new Error(`${f.label} الزامی است`)
      result[f.id] = v === true; continue
    }
    if (v !== undefined && typeof v !== 'string') throw new Error(`مقدار ${f.label} معتبر نیست`)
    const value = ((v as string) || '').trim()
    if (f.required && !value) throw new Error(`${f.label} الزامی است`)
    if (value.length > (f.type === 'textarea' ? 5000 : 500)) throw new Error(`${f.label} بیش از حد طولانی است`)
    if (value && f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error('ایمیل معتبر وارد کنید')
    if (value && f.type === 'select' && !f.options.includes(value)) throw new Error('گزینه انتخاب‌شده معتبر نیست')
    result[f.id] = value
  }
  return result
}
