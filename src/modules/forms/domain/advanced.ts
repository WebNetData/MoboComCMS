// Form builder, the parts built on top of the field rules: merge tags, messages that depend on the
// answers, quiz scores, per-field statistics and the open days of an appointment field. Pure.
import {
  CHOICE_TYPES, CONTENT_TYPES, answerText, conditionHolds, visibleFields,
  type Answer, type Condition, type FormConfirmation, type FormField, type FormNotification, type FormSettings, type SlotRule, type StoredAnswer,
} from '@/modules/forms/domain/forms'

type Values = Record<string, Answer | undefined>

export const holds = (when: Condition[], logic: 'all' | 'any', values: Values) => !when.length || (logic === 'any' ? when.some((condition) => conditionHolds(condition, values)) : when.every((condition) => conditionHolds(condition, values)))

// ------------------------------------------------------------------ merge tags

export interface MergeContext { formTitle: string; entryId?: number; answers: StoredAnswer[]; total?: number; user?: string; score?: { score: number; max: number }; now?: Date }
export const MERGE_TAGS: [tag: string, meaning: string][] = [
  ['{field:شناسه}', 'پاسخ یک فیلد'], ['{all_fields}', 'همهٔ پاسخ‌ها، هر کدام در یک خط'], ['{form_title}', 'عنوان فرم'], ['{entry_id}', 'شمارهٔ پاسخ'],
  ['{total}', 'جمع قابل پرداخت'], ['{score}', 'امتیاز آزمون'], ['{user}', 'نام کاربر واردشده'], ['{date}', 'تاریخ امروز'],
]

/** Replaces `{tag}`s in a message. An unknown tag, or a field with no answer, becomes empty — never the raw tag. */
export function mergeTags(template: string, context: MergeContext): string {
  const line = (answer: StoredAnswer) => `${answer.label}: ${answer.type === 'file' || answer.type === 'signature' ? (Array.isArray(answer.value) && answer.value.length ? 'پیوست شد' : '—') : answerText(answer.value) || '—'}`
  return String(template || '').replace(/\{(field:([a-z][a-z0-9_]{0,50})|all_fields|form_title|entry_id|total|score|user|date)\}/g, (_match, tag: string, fieldId: string) => {
    if (fieldId) { const answer = context.answers.find((item) => item.id === fieldId); return answer && answer.type !== 'file' && answer.type !== 'signature' ? answerText(answer.value) : '' }
    switch (tag) {
      case 'all_fields': return context.answers.map(line).join('\n')
      case 'form_title': return context.formTitle
      case 'entry_id': return context.entryId ? String(context.entryId) : ''
      case 'total': return context.total ? `${Math.round(context.total).toLocaleString('fa-IR')} تومان` : ''
      case 'score': return context.score ? `${context.score.score.toLocaleString('fa-IR')} از ${context.score.max.toLocaleString('fa-IR')}` : ''
      case 'user': return context.user || ''
      case 'date': return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { dateStyle: 'long', timeZone: 'Asia/Tehran' }).format(context.now || new Date())
      default: return ''
    }
  })
}

/** What the sender is shown: the first confirmation whose conditions hold, else the form's own message and address. */
export function pickConfirmation(settings: Pick<FormSettings, 'confirmations' | 'redirectUrl'>, successText: string, values: Values): Pick<FormConfirmation, 'message' | 'redirectUrl'> {
  const match = settings.confirmations.find((item) => holds(item.when, item.logic, values))
  return match ? { message: match.message || successText, redirectUrl: match.redirectUrl } : { message: successText, redirectUrl: settings.redirectUrl }
}

export const dueNotifications = (settings: Pick<FormSettings, 'notifications'>, values: Values): FormNotification[] => settings.notifications.filter((item) => holds(item.when, item.logic, values))

/** Addresses of a notification: literal ones, and the answers of e-mail fields named as {field:id}. */
export function recipients(to: string, answers: StoredAnswer[]): string[] {
  const out = new Set<string>()
  for (const part of to.split(/[\s,،;]+/).filter(Boolean)) {
    const field = /^\{field:([a-z][a-z0-9_]{0,50})\}$/.exec(part)?.[1]
    const address = field ? String(answers.find((answer) => answer.id === field && answer.type === 'email')?.value || '') : part
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) out.add(address.toLowerCase())
  }
  return [...out].slice(0, 10)
}

// ------------------------------------------------------------------ quiz

/** Points of the chosen options against the most that could be had (only the fields that are shown count). */
export function scoreOf(fields: FormField[], values: Values): { score: number; max: number } {
  let score = 0, max = 0
  for (const field of visibleFields(fields, values)) {
    if (!field.scores?.length) continue
    const points = field.scores
    const chosen = Array.isArray(values[field.id]) ? values[field.id] as string[] : values[field.id] ? [String(values[field.id])] : []
    for (const option of chosen) score += points[field.options.indexOf(option)] || 0
    max += field.type === 'checkboxes' ? points.filter((point) => point > 0).reduce((sum, point) => sum + point, 0) : Math.max(0, ...points)
  }
  return { score, max }
}

// ------------------------------------------------------------------ statistics

export type FieldStat = { id: string; label: string; type: string; answered: number } & ({ kind: 'choices'; options: { label: string; count: number }[] } | { kind: 'numbers'; average: number; min: number; max: number })

/** How the answers of each countable field spread: options by how often they were chosen, numbers by their range. */
export function fieldStats(fields: FormField[], rows: StoredAnswer[][]): FieldStat[] {
  const out: FieldStat[] = []
  for (const field of fields) {
    if (CONTENT_TYPES.includes(field.type)) continue
    const values = rows.map((answers) => answers.find((answer) => answer.id === field.id)?.value).filter((value) => value !== undefined && value !== '' && !(Array.isArray(value) && !value.length))
    if (CHOICE_TYPES.includes(field.type) || field.type === 'checkbox') {
      const options = field.type === 'checkbox' ? ['بله', 'خیر'] : field.options
      const counts = new Map(options.map((option) => [option, 0]))
      for (const value of values) for (const item of Array.isArray(value) ? value : [typeof value === 'boolean' ? (value ? 'بله' : 'خیر') : String(value)]) if (counts.has(item)) counts.set(item, counts.get(item)! + 1)
      out.push({ id: field.id, label: field.label, type: field.type, answered: values.length, kind: 'choices', options: options.map((label) => ({ label, count: counts.get(label) || 0 })) })
    } else if (['rating', 'slider', 'number'].includes(field.type)) {
      const numbers = values.map(Number).filter(Number.isFinite)
      if (!numbers.length) { out.push({ id: field.id, label: field.label, type: field.type, answered: 0, kind: 'numbers', average: 0, min: 0, max: 0 }); continue }
      out.push({ id: field.id, label: field.label, type: field.type, answered: numbers.length, kind: 'numbers', average: Math.round(numbers.reduce((sum, n) => sum + n, 0) / numbers.length * 100) / 100, min: Math.min(...numbers), max: Math.max(...numbers) })
    }
  }
  return out
}

// ------------------------------------------------------------------ appointments

/** The open days of an appointment field from `today` (YYYY-MM-DD) as far ahead as its horizon allows. */
export function slotDays(rule: SlotRule, today: string): string[] {
  const start = new Date(`${today}T00:00:00Z`).getTime()
  const out: string[] = []
  for (let i = 0; i <= rule.horizon && out.length < 120; i++) {
    const day = new Date(start + i * 86_400_000)
    if (rule.days.includes(day.getUTCDay())) out.push(day.toISOString().slice(0, 10))
  }
  return out
}

/** Fields a member of staff may correct on a stored answer: plain ones. Money, turns, passwords and files keep what the sender gave. */
export const STAFF_EDITABLE = ['text', 'textarea', 'email', 'tel', 'mobile', 'national', 'url', 'number', 'date', 'jdate', 'time', 'slider', 'rating', 'checkbox'] as const
export const staffEditable = (field: FormField) => (STAFF_EDITABLE as readonly string[]).includes(field.type) || (CHOICE_TYPES.includes(field.type) && !field.prices?.length)
