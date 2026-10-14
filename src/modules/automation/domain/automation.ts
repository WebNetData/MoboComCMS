// Automation rules: "when this happens, and these hold, do these". Pure: the catalogue of what can start a rule,
// what it can check and what it can do, and the checks on a rule an admin saves. The engine is server/engine.ts.

export class AutomationError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

export type FieldType = 'text' | 'number' | 'choice'
export type Field = { key: string; label: string; type: FieldType; options?: string[] }
/** How a rule starts: an event the site records, a scan for things that have waited too long, or a time of day. */
export type TriggerKind = 'event' | 'scan' | 'schedule'
export type TriggerDef = {
  id: string; label: string; group: string; kind: TriggerKind; description: string
  /** Facts a condition may test and a message may quote. */
  fields: Field[]
  /** What the subject is: a user, an order, a form answer, a ticket — decides which actions make sense. */
  subject: 'user' | 'order' | 'form' | 'ticket' | 'cart' | 'subscription' | 'product' | 'site'
  /** A scan waits this many hours (or days) before it fires; a schedule fires at this hour. */
  wait?: { key: 'hours' | 'days' | 'hour'; label: string; min: number; max: number; default: number }
}

const USER: Field[] = [{ key: 'user_name', label: 'نام کاربر', type: 'text' }, { key: 'user_email', label: 'ایمیل کاربر', type: 'text' }]
export const TRIGGERS: TriggerDef[] = [
  { id: 'user.registered', label: 'کاربر تازه ثبت‌نام کرد', group: 'کاربران', kind: 'event', subject: 'user', description: 'بلافاصله پس از ساخت حساب', fields: [...USER] },
  { id: 'user.inactive', label: 'کاربر مدتی وارد نشده', group: 'کاربران', kind: 'scan', subject: 'user', description: 'کاربری که از آخرین ورودش این‌قدر گذشته', fields: [...USER, { key: 'days_inactive', label: 'روزهای غیبت', type: 'number' }], wait: { key: 'days', label: 'پس از چند روز', min: 3, max: 365, default: 30 } },
  { id: 'order.paid', label: 'سفارش پرداخت شد', group: 'فروش', kind: 'event', subject: 'order', description: 'هر سفارشی که پرداختش تأیید شد (فروشگاه، اشتراک، فرم، محتوا)', fields: [...USER, { key: 'order_id', label: 'شمارهٔ سفارش', type: 'number' }, { key: 'amount', label: 'مبلغ', type: 'number' }, { key: 'currency', label: 'واحد پول', type: 'choice', options: ['IRT', 'IRR', 'USD'] }, { key: 'kind', label: 'نوع سفارش', type: 'choice', options: ['product', 'plan', 'form', 'content', 'membership'] }, { key: 'items', label: 'کالاها', type: 'text' }] },
  { id: 'cart.abandoned', label: 'سبد خرید رها شد', group: 'فروش', kind: 'scan', subject: 'cart', description: 'سبد کاربر واردشده که این‌قدر دست نخورده و خریده نشده', fields: [...USER, { key: 'items_count', label: 'تعداد کالا', type: 'number' }, { key: 'items', label: 'کالاها', type: 'text' }], wait: { key: 'hours', label: 'پس از چند ساعت', min: 1, max: 720, default: 24 } },
  { id: 'subscription.expiring', label: 'اشتراک رو به پایان است', group: 'فروش', kind: 'scan', subject: 'subscription', description: 'اشتراکی که این‌قدر تا پایانش مانده', fields: [...USER, { key: 'plan', label: 'پلن', type: 'text' }, { key: 'days_left', label: 'روزهای باقی‌مانده', type: 'number' }], wait: { key: 'days', label: 'چند روز مانده به پایان', min: 1, max: 60, default: 3 } },
  { id: 'stock.low', label: 'موجودی کالا کم شد', group: 'فروش', kind: 'scan', subject: 'product', description: 'کالایی که موجودی‌اش به حد هشدار رسیده', fields: [{ key: 'product_name', label: 'نام کالا', type: 'text' }, { key: 'stock', label: 'موجودی', type: 'number' }] },
  { id: 'form.submitted', label: 'فرم ارسال شد', group: 'فرم‌ها و خدمات', kind: 'event', subject: 'form', description: 'هر پاسخ تازه به یک فرم (فرم پرداختی: پیش از پرداخت)', fields: [...USER, { key: 'form_slug', label: 'نشانی فرم', type: 'text' }, { key: 'form_title', label: 'عنوان فرم', type: 'text' }, { key: 'submission_id', label: 'شمارهٔ درخواست', type: 'number' }, { key: 'amount', label: 'مبلغ', type: 'number' }] },
  { id: 'form.paid', label: 'درخواست فرم پرداخت شد', group: 'فرم‌ها و خدمات', kind: 'event', subject: 'form', description: 'درخواست یک فرم پرداختی، پس از پرداخت', fields: [...USER, { key: 'form_slug', label: 'نشانی فرم', type: 'text' }, { key: 'form_title', label: 'عنوان فرم', type: 'text' }, { key: 'submission_id', label: 'شمارهٔ درخواست', type: 'number' }, { key: 'amount', label: 'مبلغ', type: 'number' }] },
  { id: 'form.waiting', label: 'درخواست فرم بی‌مسئول مانده', group: 'فرم‌ها و خدمات', kind: 'scan', subject: 'form', description: 'درخواستی که این‌قدر در انتظار کارشناس مانده و کسی برنداشته', fields: [{ key: 'form_slug', label: 'نشانی فرم', type: 'text' }, { key: 'form_title', label: 'عنوان فرم', type: 'text' }, { key: 'submission_id', label: 'شمارهٔ درخواست', type: 'number' }, { key: 'hours_waiting', label: 'ساعت انتظار', type: 'number' }], wait: { key: 'hours', label: 'پس از چند ساعت', min: 1, max: 720, default: 4 } },
  { id: 'ticket.opened', label: 'تیکت تازه باز شد', group: 'پشتیبانی', kind: 'event', subject: 'ticket', description: 'تیکتی که کاربر باز کرد', fields: [...USER, { key: 'ticket_id', label: 'شمارهٔ تیکت', type: 'number' }, { key: 'department', label: 'دپارتمان', type: 'text' }, { key: 'priority', label: 'اولویت', type: 'choice', options: ['low', 'normal', 'high'] }, { key: 'subject', label: 'موضوع', type: 'text' }] },
  { id: 'ticket.waiting', label: 'تیکت بی‌پاسخ مانده', group: 'پشتیبانی', kind: 'scan', subject: 'ticket', description: 'تیکتی که آخرین پیامش از کاربر است و این‌قدر بی‌پاسخ مانده', fields: [{ key: 'ticket_id', label: 'شمارهٔ تیکت', type: 'number' }, { key: 'department', label: 'دپارتمان', type: 'text' }, { key: 'priority', label: 'اولویت', type: 'choice', options: ['low', 'normal', 'high'] }, { key: 'hours_waiting', label: 'ساعت انتظار', type: 'number' }], wait: { key: 'hours', label: 'پس از چند ساعت', min: 1, max: 720, default: 8 } },
  { id: 'ticket.answered_idle', label: 'کاربر به پاسخ تیکت جواب نداده', group: 'پشتیبانی', kind: 'scan', subject: 'ticket', description: 'تیکتی که پشتیبانی جواب داده و کاربر این‌قدر پاسخی نداده', fields: [{ key: 'ticket_id', label: 'شمارهٔ تیکت', type: 'number' }, { key: 'department', label: 'دپارتمان', type: 'text' }, { key: 'hours_waiting', label: 'ساعت سکوت', type: 'number' }], wait: { key: 'hours', label: 'پس از چند ساعت', min: 1, max: 2160, default: 72 } },
  { id: 'report.daily', label: 'گزارش روزانه', group: 'گزارش و هشدار', kind: 'schedule', subject: 'site', description: 'هر روز در ساعتی که تعیین می‌کنید (به وقت تهران)', fields: REPORT_FIELDS(), wait: { key: 'hour', label: 'ساعت ارسال', min: 0, max: 23, default: 9 } },
  { id: 'report.weekly', label: 'گزارش هفتگی', group: 'گزارش و هشدار', kind: 'schedule', subject: 'site', description: 'هر شنبه در ساعتی که تعیین می‌کنید', fields: REPORT_FIELDS(), wait: { key: 'hour', label: 'ساعت ارسال', min: 0, max: 23, default: 9 } },
]
function REPORT_FIELDS(): Field[] {
  return [{ key: 'new_users', label: 'کاربران تازه', type: 'number' }, { key: 'orders', label: 'سفارش‌های پرداخت‌شده', type: 'number' }, { key: 'revenue', label: 'فروش (تومان)', type: 'number' }, { key: 'form_requests', label: 'درخواست‌های فرم', type: 'number' }, { key: 'open_tickets', label: 'تیکت‌های باز', type: 'number' }, { key: 'waiting_requests', label: 'درخواست‌های منتظر کارشناس', type: 'number' }]
}
export const triggerOf = (id: string) => TRIGGERS.find((trigger) => trigger.id === id)

export type ActionDef = { id: string; label: string; needs?: TriggerDef['subject'][]; needsUser?: boolean; fields: Field[] }
const MESSAGE: Field = { key: 'text', label: 'متن', type: 'text' }
export const ACTIONS: ActionDef[] = [
  { id: 'notify_user', label: 'اعلان در حساب کاربر', needsUser: true, fields: [{ key: 'title', label: 'عنوان', type: 'text' }, MESSAGE, { key: 'href', label: 'پیوند (مسیر سایت)', type: 'text' }] },
  { id: 'email_user', label: 'ایمیل به کاربر', needsUser: true, fields: [{ key: 'subject', label: 'موضوع', type: 'text' }, MESSAGE] },
  { id: 'sms_user', label: 'پیامک به کاربر (فقط شمارهٔ تأییدشده و با رضایت)', needsUser: true, fields: [MESSAGE] },
  { id: 'discount_user', label: 'ساخت کد تخفیف شخصی و فرستادن برای کاربر', needsUser: true, fields: [{ key: 'percent', label: 'درصد تخفیف', type: 'number' }, { key: 'days', label: 'اعتبار (روز)', type: 'number' }, { key: 'title', label: 'عنوان اعلان', type: 'text' }, { key: 'text', label: 'متن (کد با {code})', type: 'text' }] },
  { id: 'notify_staff', label: 'اعلان به کارمندان', fields: [{ key: 'to', label: 'به', type: 'choice', options: ['managers', 'handlers', 'support'] }, { key: 'title', label: 'عنوان', type: 'text' }, MESSAGE] },
  { id: 'email_staff', label: 'ایمیل به یک نشانی (مثلاً مدیر)', fields: [{ key: 'to', label: 'نشانی ایمیل', type: 'text' }, { key: 'subject', label: 'موضوع', type: 'text' }, MESSAGE] },
  { id: 'sms_admins', label: 'پیامک به شماره‌های مدیر (تنظیمات پیامک)', fields: [MESSAGE] },
  { id: 'assign_form', label: 'سپردن درخواست به کارمند', needs: ['form'], fields: [{ key: 'mode', label: 'روش', type: 'choice', options: ['least_loaded'] }] },
  { id: 'set_form_stage', label: 'تغییر وضعیت درخواست', needs: ['form'], fields: [{ key: 'stage', label: 'وضعیت', type: 'choice', options: ['OPEN', 'IN_PROGRESS', 'DONE', 'REJECTED'] }] },
  { id: 'close_ticket', label: 'بستن تیکت (با پیام اختیاری)', needs: ['ticket'], fields: [MESSAGE] },
  { id: 'ticket_to_user', label: 'باز کردن تیکت برای کاربر', needsUser: true, fields: [{ key: 'subject', label: 'موضوع', type: 'text' }, MESSAGE] },
  { id: 'webhook', label: 'فرستادن به وب‌هوک', fields: [{ key: 'url', label: 'نشانی https', type: 'text' }, { key: 'secret', label: 'کلید امضا', type: 'text' }] },
]
export const actionOf = (id: string) => ACTIONS.find((action) => action.id === id)

export const OPS = ['eq', 'neq', 'gte', 'lte', 'contains'] as const
export type Op = (typeof OPS)[number]
export const OP_LABEL: Record<Op, string> = { eq: 'برابر', neq: 'نابرابر', gte: 'دست‌کم', lte: 'حداکثر', contains: 'شامل' }
export type Condition = { field: string; op: Op; value: string }
export type Action = { type: string; params: Record<string, string> }
export type Rule = { id?: number; name: string; description: string; enabled: boolean; trigger: string; wait: number; conditions: Condition[]; logic: 'all' | 'any'; actions: Action[]; cooldownHours: number }
export type Facts = Record<string, string | number | null | undefined>

const text = (value: unknown, max: number) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max)
const int = (value: unknown, min: number, max: number, fallback: number) => { const n = Math.trunc(Number(value)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback }

/** A rule as the admin sent it → a rule that can run. Throws with a message for the person building it. */
export function normalizeRule(input: unknown): Rule {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const name = text(raw.name, 120)
  if (!name) throw new AutomationError('نام قانون را بنویسید')
  const trigger = triggerOf(String(raw.trigger || ''))
  if (!trigger) throw new AutomationError('رویداد شروع قانون را انتخاب کنید')
  const fields = new Map(trigger.fields.map((field) => [field.key, field]))
  const conditions: Condition[] = (Array.isArray(raw.conditions) ? raw.conditions : []).slice(0, 8).map((item) => {
    const row = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    const field = fields.get(String(row.field || ''))
    if (!field) throw new AutomationError('یکی از شرط‌ها به چیزی اشاره می‌کند که این رویداد ندارد')
    const op = (OPS as readonly string[]).includes(String(row.op)) ? row.op as Op : 'eq'
    if ((op === 'gte' || op === 'lte') && field.type !== 'number') throw new AutomationError(`«${field.label}» عدد نیست؛ «دست‌کم» و «حداکثر» برای عددهاست`)
    return { field: field.key, op, value: text(row.value, 200) }
  })
  if (!Array.isArray(raw.actions) || !raw.actions.length) throw new AutomationError('دست‌کم یک اقدام لازم است')
  const actions: Action[] = raw.actions.slice(0, 8).map((item) => {
    const row = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    const def = actionOf(String(row.type || ''))
    if (!def) throw new AutomationError('اقدام ناشناخته است')
    if (def.needs && !def.needs.includes(trigger.subject)) throw new AutomationError(`«${def.label}» با رویداد «${trigger.label}» جور نیست`)
    if (def.needsUser && !trigger.fields.some((field) => field.key === 'user_name')) throw new AutomationError(`«${def.label}» کاربری می‌خواهد و رویداد «${trigger.label}» کاربر ندارد`)
    const given = (row.params && typeof row.params === 'object' ? row.params : {}) as Record<string, unknown>
    const params: Record<string, string> = {}
    for (const field of def.fields) params[field.key] = text(given[field.key], field.key === 'text' ? 2000 : 300)
    checkAction(def, params)
    return { type: def.id, params }
  })
  return {
    ...(raw.id ? { id: int(raw.id, 1, 2 ** 31, 0) } : {}),
    name, description: text(raw.description, 500), enabled: raw.enabled !== false, trigger: trigger.id,
    wait: trigger.wait ? int(raw.wait, trigger.wait.min, trigger.wait.max, trigger.wait.default) : 0,
    conditions, logic: raw.logic === 'any' ? 'any' : 'all', actions, cooldownHours: int(raw.cooldownHours, 0, 24 * 365, 0),
  }
}

function checkAction(def: ActionDef, params: Record<string, string>) {
  const need = (key: string, label: string) => { if (!params[key]) throw new AutomationError(`${label} «${def.label}» را بنویسید`) }
  switch (def.id) {
    case 'notify_user': case 'notify_staff': need('title', 'عنوان'); break
    case 'email_user': need('subject', 'موضوع'); need('text', 'متن'); break
    case 'email_staff': need('to', 'نشانی'); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(params.to)) throw new AutomationError('نشانی ایمیل معتبر نیست'); need('subject', 'موضوع'); break
    case 'sms_user': case 'sms_admins': need('text', 'متن'); break
    case 'ticket_to_user': need('subject', 'موضوع'); need('text', 'متن'); break
    case 'discount_user': {
      const percent = Number(params.percent), days = Number(params.days)
      if (!(percent >= 1 && percent <= 90)) throw new AutomationError('درصد تخفیف بین ۱ تا ۹۰ است')
      if (!(days >= 1 && days <= 365)) throw new AutomationError('اعتبار کد بین ۱ تا ۳۶۵ روز است')
      if (!params.text.includes('{code}')) throw new AutomationError('در متن کد تخفیف، جای کد را با {code} بنویسید')
      break
    }
    case 'webhook': {
      let url: URL | null = null
      try { url = new URL(params.url) } catch { url = null }
      if (!url || url.protocol !== 'https:' || url.username || url.password) throw new AutomationError('نشانی وب‌هوک باید https باشد')
      break
    }
    case 'set_form_stage': if (!['OPEN', 'IN_PROGRESS', 'DONE', 'REJECTED'].includes(params.stage)) throw new AutomationError('وضعیت درخواست معتبر نیست'); break
    case 'assign_form': params.mode = 'least_loaded'; break
    case 'notify_staff': if (!['managers', 'handlers', 'support'].includes(params.to)) params.to = 'managers'; break
  }
  if (params.href && !/^\/(?!\/)[A-Za-z0-9/_?=&.%-]*$/.test(params.href)) throw new AutomationError('پیوند باید یک مسیر سایت باشد (با / شروع شود)')
}

/** Whether the facts of an event meet the rule's conditions. */
export function conditionsHold(conditions: Condition[], logic: 'all' | 'any', facts: Facts): boolean {
  if (!conditions.length) return true
  const test = (condition: Condition) => {
    const have = facts[condition.field]
    const as = String(have ?? '').trim().toLowerCase(), want = condition.value.trim().toLowerCase()
    switch (condition.op) {
      case 'eq': return as === want
      case 'neq': return as !== want
      case 'contains': return as.includes(want)
      case 'gte': return Number(have) >= Number(condition.value)
      case 'lte': return Number(have) <= Number(condition.value)
    }
  }
  return logic === 'any' ? conditions.some(test) : conditions.every(test)
}

/** Fills {fact} tags of a message. An unknown tag becomes empty — never the raw tag. */
export const renderMessage = (template: string, facts: Facts) => String(template || '').replace(/\{([a-z_]{2,30})\}/g, (_match, key: string) => (facts[key] === undefined || facts[key] === null ? '' : String(facts[key])))

/** A rule may run again for the same subject only once its cooldown has passed (0: once per event, or once ever for a scan). */
export function mayRunAgain(lastRun: Date | null, cooldownHours: number, kind: TriggerKind, now = new Date()) {
  if (!lastRun) return true
  if (cooldownHours > 0) return now.getTime() - lastRun.getTime() >= cooldownHours * 3_600_000
  return kind === 'event'
}

/** Ready-made rules the admin starts from. */
export const RECIPES: { id: string; name: string; description: string; rule: Omit<Rule, 'id'> }[] = [
  { id: 'welcome', name: 'خوش‌آمد به کاربر تازه', description: 'اعلان و ایمیل خوش‌آمد بلافاصله پس از ثبت‌نام', rule: { name: 'خوش‌آمد به کاربر تازه', description: '', enabled: true, trigger: 'user.registered', wait: 0, conditions: [], logic: 'all', cooldownHours: 0, actions: [{ type: 'notify_user', params: { title: 'به {site} خوش آمدید', text: 'حساب شما ساخته شد. از پیشخوان همه‌چیز در دسترس است.', href: '/dashboard' } }] } },
  { id: 'cart', name: 'یادآوری سبد رهاشده با کد تخفیف', description: '۲۴ ساعت پس از رها شدن سبد، کد ۵٪ یک‌هفته‌ای', rule: { name: 'یادآوری سبد رهاشده', description: '', enabled: true, trigger: 'cart.abandoned', wait: 24, conditions: [], logic: 'all', cooldownHours: 24 * 7, actions: [{ type: 'discount_user', params: { percent: '5', days: '7', title: 'سبد خریدتان منتظر شماست', text: 'کالاهایی که انتخاب کرده بودید هنوز در سبد شماست. با کد {code} تا یک هفته ۵٪ تخفیف دارید.' } }] } },
  { id: 'winback', name: 'بازگرداندن کاربر غیرفعال', description: 'پس از ۳۰ روز غیبت، کد تخفیف ۱۰٪', rule: { name: 'بازگرداندن کاربر غیرفعال', description: '', enabled: true, trigger: 'user.inactive', wait: 30, conditions: [], logic: 'all', cooldownHours: 24 * 60, actions: [{ type: 'discount_user', params: { percent: '10', days: '14', title: 'دلمان برایتان تنگ شده', text: 'با کد {code} تا دو هفته روی خریدهای سایت ۱۰٪ تخفیف دارید.' } }] } },
  { id: 'renewal', name: 'یادآوری تمدید اشتراک', description: '۳ روز مانده به پایان اشتراک', rule: { name: 'یادآوری تمدید اشتراک', description: '', enabled: true, trigger: 'subscription.expiring', wait: 3, conditions: [], logic: 'all', cooldownHours: 0, actions: [{ type: 'notify_user', params: { title: 'اشتراک {plan} رو به پایان است', text: '{days_left} روز تا پایان اشتراک شما مانده؛ برای قطع نشدن، تمدید کنید.', href: '/dashboard' } }, { type: 'sms_user', params: { text: '{user_name} عزیز، {days_left} روز تا پایان اشتراک {plan} مانده است. {site}' } }] } },
  { id: 'assign', name: 'سپردن خودکار درخواست به کارمند کم‌کار', description: 'هر درخواست پرداخت‌شده به کارشناسی از همان فرم که کمترین کار باز را دارد', rule: { name: 'سپردن خودکار درخواست‌ها', description: '', enabled: true, trigger: 'form.paid', wait: 0, conditions: [], logic: 'all', cooldownHours: 0, actions: [{ type: 'assign_form', params: { mode: 'least_loaded' } }] } },
  { id: 'sla', name: 'هشدار درخواست بی‌مسئول', description: 'درخواستی که ۴ ساعت کسی برنداشته به مدیران خبر داده می‌شود', rule: { name: 'هشدار درخواست بی‌مسئول', description: '', enabled: true, trigger: 'form.waiting', wait: 4, conditions: [], logic: 'all', cooldownHours: 0, actions: [{ type: 'notify_staff', params: { to: 'managers', title: 'درخواست #{submission_id} در «{form_title}» {hours_waiting} ساعت بی‌مسئول مانده', text: '' } }] } },
  { id: 'ticket-sla', name: 'هشدار تیکت بی‌پاسخ', description: 'تیکتی که ۸ ساعت بی‌پاسخ مانده', rule: { name: 'هشدار تیکت بی‌پاسخ', description: '', enabled: true, trigger: 'ticket.waiting', wait: 8, conditions: [], logic: 'all', cooldownHours: 24, actions: [{ type: 'notify_staff', params: { to: 'support', title: 'تیکت #{ticket_id} ({department}) {hours_waiting} ساعت بی‌پاسخ مانده', text: '' } }] } },
  { id: 'ticket-close', name: 'بستن خودکار تیکت پاسخ‌داده', description: 'اگر کاربر ۷۲ ساعت به پاسخ پشتیبانی جواب ندهد', rule: { name: 'بستن خودکار تیکت', description: '', enabled: true, trigger: 'ticket.answered_idle', wait: 72, conditions: [], logic: 'all', cooldownHours: 0, actions: [{ type: 'close_ticket', params: { text: 'چون پاسخی دریافت نشد، این تیکت بسته شد. هر وقت لازم بود، پاسخ بدهید تا دوباره باز شود.' } }] } },
  { id: 'stock', name: 'هشدار موجودی کم', description: 'به مدیران و شماره‌های مدیر', rule: { name: 'هشدار موجودی کم', description: '', enabled: true, trigger: 'stock.low', wait: 0, conditions: [], logic: 'all', cooldownHours: 24, actions: [{ type: 'notify_staff', params: { to: 'managers', title: 'موجودی «{product_name}» به {stock} رسید', text: '' } }] } },
  { id: 'daily', name: 'گزارش روزانه به مدیر', description: 'هر روز ساعت ۹ صبح', rule: { name: 'گزارش روزانه', description: '', enabled: true, trigger: 'report.daily', wait: 9, conditions: [], logic: 'all', cooldownHours: 0, actions: [{ type: 'notify_staff', params: { to: 'managers', title: 'گزارش دیروز: {orders} سفارش، {revenue} تومان فروش', text: '{new_users} کاربر تازه · {form_requests} درخواست فرم · {open_tickets} تیکت باز · {waiting_requests} درخواست منتظر کارشناس' } }] } },
]
