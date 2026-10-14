import { createHmac, randomBytes } from 'node:crypto'
import dns from 'node:dns/promises'
import { db } from '@/platform/database/prisma'
import { logEvent } from '@/platform/observability/logger'
import { getSettings } from '@/modules/settings/server'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { sendMail } from '@/modules/mail/server/mailer'
import { getSmsConfig, sendSms } from '@/modules/sms/server/sms'
import { isPrivateAddress } from '@/modules/server-panel/domain/downloads'
import { parsePermissions } from '@/modules/identity/rbac'
import { BASE_CURRENCY } from '@/shared/money/base'
import { minorToNumber } from '@/shared/money'
import {
  AutomationError, conditionsHold, mayRunAgain, normalizeRule, renderMessage, triggerOf,
  type Action, type Facts, type Rule, type TriggerDef,
} from '@/modules/automation/domain/automation'

// The engine: events the site records, scans for what has waited too long, schedules — matched against the
// enabled rules, each rule run once per subject (or again after its cooldown), every run written down.

const parse = <T,>(value: string, fallback: T): T => { try { return JSON.parse(value) as T } catch { return fallback } }

// ------------------------------------------------------------------ rules

export function ruleOf(row: { id: number; name: string; description: string; enabled: boolean; trigger: string; wait: number; conditions: string; logic: string; actions: string; cooldownHours: number }): Rule {
  return { id: row.id, name: row.name, description: row.description, enabled: row.enabled, trigger: row.trigger, wait: row.wait, conditions: parse(row.conditions, []), logic: row.logic === 'any' ? 'any' : 'all', actions: parse(row.actions, []), cooldownHours: row.cooldownHours }
}

export async function saveRule(input: unknown) {
  const rule = normalizeRule(input)
  const data = { name: rule.name, description: rule.description, enabled: rule.enabled, trigger: rule.trigger, wait: rule.wait, conditions: JSON.stringify(rule.conditions), logic: rule.logic, actions: JSON.stringify(rule.actions), cooldownHours: rule.cooldownHours }
  const row = rule.id ? await db.automationRule.update({ where: { id: rule.id }, data }) : await db.automationRule.create({ data })
  enabledTriggers = null
  return ruleOf(row)
}

export async function deleteRule(id: number) {
  await db.automationRule.delete({ where: { id } }).catch(() => undefined)
  enabledTriggers = null
}

export async function listRules() {
  const rows = await db.automationRule.findMany({ orderBy: [{ enabled: 'desc' }, { id: 'desc' }] })
  return rows.map((row) => ({ ...ruleOf(row), runCount: row.runCount, lastRunAt: row.lastRunAt?.toISOString() || null }))
}

export async function recentRuns(ruleId?: number, take = 60) {
  const rows = await db.automationRun.findMany({ where: ruleId ? { ruleId } : {}, orderBy: { id: 'desc' }, take, include: { rule: { select: { name: true } } } })
  return rows.map((row) => ({ id: row.id, ruleId: row.ruleId, rule: row.rule.name, subject: row.subjectKey, status: row.status, detail: row.detail, at: row.createdAt.toISOString() }))
}

// ------------------------------------------------------------------ events

let enabledTriggers: { at: number; ids: Set<string> } | null = null
async function triggersInUse() {
  if (enabledTriggers && Date.now() - enabledTriggers.at < 60_000) return enabledTriggers.ids
  const rows = await db.automationRule.findMany({ where: { enabled: true }, select: { trigger: true } })
  enabledTriggers = { at: Date.now(), ids: new Set(rows.map((row) => row.trigger)) }
  return enabledTriggers.ids
}

/**
 * Records that something happened, for the rules that start from it. Never throws and never slows the caller:
 * nothing is stored when no enabled rule listens to this event.
 */
export async function emitAutomation(name: string, subjectKey: string, userId: number | null, payload: Facts) {
  try {
    if (!(await triggersInUse()).has(name)) return
    await db.automationEvent.create({ data: { name, subjectKey: subjectKey.slice(0, 120), userId, payload: JSON.stringify(payload) } })
  } catch (error) { logEvent('warn', 'automation.emit_failed', { name, error }) }
}

// ------------------------------------------------------------------ facts

async function userFacts(userId: number | null | undefined): Promise<Facts> {
  if (!userId) return {}
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true } })
  return user ? { user_id: user.id, user_name: user.name || user.email.split('@')[0], user_email: user.email } : {}
}

let site: { at: number; name: string; url: string } | null = null
async function siteFacts(): Promise<Facts> {
  if (!site || Date.now() - site.at > 300_000) {
    const settings = await getSettings().catch(() => ({} as Record<string, string>))
    site = { at: Date.now(), name: settings.brandName || 'موبوکام', url: (settings.siteUrl || process.env.NEXTAUTH_URL || '').replace(/\/+$/, '') }
  }
  return { site: site.name, site_url: site.url }
}

// ------------------------------------------------------------------ running a rule

type Subject = { key: string; userId: number | null; facts: Facts }

/** Runs one rule for one subject when its conditions hold and its cooldown allows. Returns whether it ran. */
async function runRule(rule: Rule, trigger: TriggerDef, subject: Subject, now = new Date()): Promise<boolean> {
  const facts = { ...(await siteFacts()), ...(await userFacts(subject.userId)), ...subject.facts }
  if (!conditionsHold(rule.conditions, rule.logic, facts)) return false
  const last = await db.automationRun.findFirst({ where: { ruleId: rule.id!, subjectKey: subject.key }, orderBy: { id: 'desc' }, select: { createdAt: true } })
  if (!mayRunAgain(last?.createdAt || null, rule.cooldownHours, trigger.kind, now)) return false
  const results: string[] = []
  let failed = 0
  for (const [index, action] of rule.actions.entries()) {
    try { results.push(await runAction(rule, action, index, subject, facts)) } catch (error) {
      failed++
      results.push(`✗ ${error instanceof Error ? error.message : 'خطا'}`)
    }
  }
  const status = failed === 0 ? 'DONE' : failed === rule.actions.length ? 'FAILED' : 'PARTIAL'
  await db.automationRun.create({ data: { ruleId: rule.id!, subjectKey: subject.key, status, detail: results.join(' · ').slice(0, 1000) } })
  await db.automationRule.update({ where: { id: rule.id! }, data: { runCount: { increment: 1 }, lastRunAt: now } })
  return true
}

async function staffIds(to: string, facts: Facts): Promise<number[]> {
  const people = await db.user.findMany({ where: { role: 'ADMIN', status: 'ACTIVE' }, select: { id: true, roleId: true, roleRef: { select: { permissions: true } } }, take: 300 })
  const held = (person: typeof people[number]) => (person.roleId == null ? null : parsePermissions(person.roleRef?.permissions || ''))
  const has = (person: typeof people[number], ...wanted: string[]) => { const list = held(person); return list === null || wanted.some((permission) => list.includes(permission)) }
  if (to === 'support') return people.filter((person) => has(person, 'tickets.handle')).map((person) => person.id)
  if (to === 'handlers' && facts.form_id) {
    const form = await db.siteForm.findUnique({ where: { id: Number(facts.form_id) }, select: { settings: true } })
    const named = parse<{ handlers?: number[] }>(form?.settings || '{}', {}).handlers || []
    if (named.length) return named
    return people.filter((person) => has(person, 'forms.handle', 'cms.pages')).map((person) => person.id)
  }
  return people.filter((person) => held(person) === null || has(person, 'settings.manage', 'automation.manage')).map((person) => person.id)
}

async function runAction(rule: Rule, action: Action, index: number, subject: Subject, facts: Facts): Promise<string> {
  const p = action.params
  const say = (template: string) => renderMessage(template, facts)
  const stamp = `auto:${rule.id}:${subject.key}:${index}:${Date.now().toString(36)}`
  const href = (value: string) => (value && /^\/(?!\/)/.test(value) ? value : '/dashboard')
  switch (action.type) {
    case 'notify_user': {
      if (!subject.userId) throw new AutomationError('کاربری ندارد')
      await createInboxEvent({ userId: subject.userId, kind: 'AUTOMATION', dedupeKey: stamp, titleFa: say(p.title).slice(0, 200), titleEn: '', bodyFa: say(p.text).slice(0, 500), bodyEn: '', href: href(p.href) })
      return 'اعلان کاربر'
    }
    case 'email_user': {
      const email = String(facts.user_email || '')
      if (!email) throw new AutomationError('ایمیل کاربر نیست')
      const sent = await sendMail({ to: email, subject: say(p.subject), text: say(p.text), source: 'automation' })
      if (!sent.ok) throw new AutomationError(`ایمیل نرفت: ${sent.error}`)
      return 'ایمیل کاربر'
    }
    case 'sms_user': {
      if (!subject.userId) throw new AutomationError('کاربری ندارد')
      const user = await db.user.findUnique({ where: { id: subject.userId }, select: { phone: true, phoneVerifiedAt: true, smsAlerts: true } })
      // Only to a number the member verified and agreed to receive messages on.
      if (!user?.phone || !user.phoneVerifiedAt || !user.smsAlerts) return 'پیامک: کاربر شمارهٔ تأییدشده یا رضایت ندارد'
      const sent = await sendSms({ phone: user.phone, event: 'AUTOMATION', text: say(p.text), userId: subject.userId })
      return sent ? 'پیامک کاربر' : 'پیامک فرستاده نشد (پنل یا سقف روزانه)'
    }
    case 'discount_user': {
      if (!subject.userId) throw new AutomationError('کاربری ندارد')
      const code = `MC${randomBytes(4).toString('hex').toUpperCase()}`
      const now = new Date()
      await db.promotion.create({ data: { code, active: true, kind: 'PERCENT', percentBps: Math.round(Number(p.percent) * 100), currency: BASE_CURRENCY, maxUses: 1, perUserLimit: 1, startsAt: now, endsAt: new Date(now.getTime() + Number(p.days) * 86_400_000) } })
      const withCode = { ...facts, code }
      await createInboxEvent({ userId: subject.userId, kind: 'AUTOMATION', dedupeKey: stamp, titleFa: renderMessage(p.title || 'کد تخفیف شما', withCode).slice(0, 200), titleEn: '', bodyFa: renderMessage(p.text, withCode).slice(0, 500), bodyEn: '', href: '/cart' })
      if (facts.user_email) await sendMail({ to: String(facts.user_email), subject: renderMessage(p.title || 'کد تخفیف شما', withCode), text: renderMessage(p.text, withCode), source: 'automation' }).catch(() => undefined)
      return `کد تخفیف ${code}`
    }
    case 'notify_staff': {
      const ids = await staffIds(p.to, facts)
      for (const id of ids) await createInboxEvent({ userId: id, kind: 'AUTOMATION', dedupeKey: `${stamp}:${id}`, titleFa: say(p.title).slice(0, 200), titleEn: '', bodyFa: say(p.text).slice(0, 500), bodyEn: '', href: staffHref(facts) }).catch(() => undefined)
      return `اعلان به ${ids.length.toLocaleString('fa-IR')} کارمند`
    }
    case 'email_staff': {
      const sent = await sendMail({ to: p.to, subject: say(p.subject), text: say(p.text), source: 'automation' })
      if (!sent.ok) throw new AutomationError(`ایمیل نرفت: ${sent.error}`)
      return 'ایمیل مدیر'
    }
    case 'sms_admins': {
      const config = await getSmsConfig()
      let sent = 0
      for (const phone of config.adminPhones) if (await sendSms({ phone, event: 'AUTOMATION_ADMIN', text: say(p.text) }, config)) sent++
      return `پیامک مدیر: ${sent.toLocaleString('fa-IR')}`
    }
    case 'assign_form': return assignForm(Number(facts.submission_id), Number(facts.form_id))
    case 'set_form_stage': {
      // Through the forms owner, so the sender is told, hooks fire and turns are released as for a change made by hand.
      const id = Number(facts.submission_id)
      const row = await db.formSubmission.findUnique({ where: { id }, select: { payStatus: true, assigneeId: true, stage: true } })
      if (!row || row.payStatus === 'UNPAID') throw new AutomationError('درخواست پیدا نشد یا پرداخت نشده است')
      if (row.stage === p.stage) return 'وضعیت از قبل همین بود'
      if (p.stage === 'IN_PROGRESS' && !row.assigneeId) throw new AutomationError('درخواستی که کسی برنداشته «در حال انجام» نمی‌شود؛ اول آن را بسپارید')
      const { workOnSubmission } = await import('@/modules/forms/server/paid')
      await workOnSubmission(id, { id: row.assigneeId || await firstAdminId() }, { stage: p.stage }, true)
      return `وضعیت ${p.stage}`
    }
    case 'close_ticket': return closeTicket(Number(facts.ticket_id), say(p.text))
    case 'ticket_to_user': return ticketToUser(subject.userId, say(p.subject), say(p.text))
    case 'webhook': return postWebhook(p.url, p.secret, rule.trigger, { rule: rule.name, subject: subject.key, facts })
  }
  throw new AutomationError('اقدام ناشناخته')
}

const staffHref = (facts: Facts) => (facts.ticket_id ? `/admin/tickets?id=${facts.ticket_id}` : facts.form_id ? `/admin/forms?form=${facts.form_id}&tab=inbox` : facts.order_id ? `/admin/orders?q=${facts.order_id}` : '/admin')

/** Gives a form request to the member of the form's staff with the least open work (ties: the one who waited longest). */
async function assignForm(submissionId: number, formId: number) {
  const row = await db.formSubmission.findUnique({ where: { id: submissionId }, select: { assigneeId: true, payStatus: true, stage: true } })
  if (!row) throw new AutomationError('درخواست پیدا نشد')
  if (row.assigneeId) return 'از قبل در دست کسی است'
  if (row.payStatus === 'UNPAID') throw new AutomationError('درخواست هنوز پرداخت نشده است')
  const { formStaff } = await import('@/modules/forms/server/advanced')
  const form = await db.siteForm.findUnique({ where: { id: formId }, select: { settings: true } })
  const named = parse<{ handlers?: number[] }>(form?.settings || '{}', {}).handlers || []
  // The form's own staff when it names them; otherwise the operators, and the managers only when there is nobody else.
  const everyone = await formStaff()
  const pool = named.length ? everyone.filter((person) => named.includes(person.id)) : everyone.filter((person) => !person.manager)
  const able = pool.length ? pool : named.length ? [] : everyone
  if (!able.length) throw new AutomationError('کارمندی برای این فرم نیست')
  const load = await db.formSubmission.groupBy({ by: ['assigneeId'], where: { assigneeId: { in: able.map((person) => person.id) }, stage: { in: ['OPEN', 'IN_PROGRESS'] } }, _count: { _all: true } })
  const busy = (id: number) => load.find((group) => group.assigneeId === id)?._count._all || 0
  const chosen = [...able].sort((a, b) => busy(a.id) - busy(b.id) || a.id - b.id)[0]
  const { workOnSubmission } = await import('@/modules/forms/server/paid')
  await workOnSubmission(submissionId, { id: chosen.id }, { assignTo: chosen.id }, true)
  return `سپرده به ${chosen.name}`
}

async function firstAdminId() {
  const admin = await db.user.findFirst({ where: { role: 'ADMIN', status: 'ACTIVE', roleId: null }, orderBy: { id: 'asc' }, select: { id: true } })
    || await db.user.findFirst({ where: { role: 'ADMIN', status: 'ACTIVE' }, orderBy: { id: 'asc' }, select: { id: true } })
  if (!admin) throw new AutomationError('حساب مدیری برای نوشتن پیام نیست')
  return admin.id
}

async function closeTicket(ticketId: number, message: string) {
  const ticket = await db.ticket.findUnique({ where: { id: ticketId }, select: { id: true, userId: true, status: true, subject: true } })
  if (!ticket) throw new AutomationError('تیکت پیدا نشد')
  if (ticket.status === 'CLOSED') return 'از قبل بسته بود'
  const now = new Date()
  const author = message ? await firstAdminId() : 0
  await db.$transaction(async (tx) => {
    if (message) await tx.ticketMessage.create({ data: { ticketId, userId: author, fromAdmin: true, internal: false, body: `<p>${message.replace(/[<>&]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[ch]!))}</p>` } })
    await tx.ticket.update({ where: { id: ticketId }, data: { status: 'CLOSED', closedAt: now, updatedAt: now, ...(message ? { lastStaffAt: now } : {}) } })
  })
  await createInboxEvent({ userId: ticket.userId, kind: 'TICKET_REPLY', dedupeKey: `auto:ticket-closed:${ticketId}:${now.getTime()}`, titleFa: `تیکت «${ticket.subject.slice(0, 80)}» بسته شد`, titleEn: 'Your ticket was closed', bodyFa: message.slice(0, 300), bodyEn: '', href: `/dashboard/tickets/${ticketId}` }).catch(() => undefined)
  return 'تیکت بسته شد'
}

async function ticketToUser(userId: number | null, subject: string, message: string) {
  if (!userId) throw new AutomationError('کاربری ندارد')
  const author = await firstAdminId()
  const now = new Date()
  const body = `<p>${message.replace(/[<>&]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[ch]!))}</p>`
  const ticket = await db.ticket.create({ data: { userId, subject: subject.slice(0, 200), priority: 'normal', department: 'GENERAL', status: 'PENDING', lastStaffAt: now, firstResponseAt: now, messages: { create: { userId: author, fromAdmin: true, internal: false, body } } } })
  await createInboxEvent({ userId, kind: 'TICKET_REPLY', dedupeKey: `ticket:${ticket.id}:opened-by-automation`, titleFa: `پیام تازه از پشتیبانی: ${subject.slice(0, 80)}`, titleEn: 'A message from support', bodyFa: message.slice(0, 300), bodyEn: '', href: `/dashboard/tickets/${ticket.id}` }).catch(() => undefined)
  return `تیکت #${ticket.id}`
}

async function postWebhook(raw: string, secret: string, event: string, payload: Record<string, unknown>) {
  const url = new URL(raw)
  if (url.protocol !== 'https:') throw new AutomationError('وب‌هوک باید https باشد')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  const addresses = /^[\d.]+$|:/.test(host) ? [host] : (await dns.lookup(host, { all: true })).map((row) => row.address)
  if (!addresses.length || addresses.some(isPrivateAddress)) throw new AutomationError('نشانی وب‌هوک عمومی نیست')
  const body = JSON.stringify({ event, sentAt: new Date().toISOString(), ...payload })
  const response = await fetch(url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(6000), headers: { 'content-type': 'application/json', 'user-agent': 'MoboCom-Automation/1', 'x-mobocom-event': event, ...(secret ? { 'x-mobocom-signature': `sha256=${createHmac('sha256', secret).update(body).digest('hex')}` } : {}) }, body })
  if (!response.ok) throw new AutomationError(`وب‌هوک پاسخ ${response.status} داد`)
  return 'وب‌هوک'
}

// ------------------------------------------------------------------ scans and schedules

const hoursAgo = (hours: number, now: Date) => new Date(now.getTime() - hours * 3_600_000)
const tehran = (now: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false, weekday: 'short' }).formatToParts(now)
  const get = (type: string) => parts.find((part) => part.type === type)?.value || ''
  return { day: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) % 24, weekday: get('weekday') }
}

/** What a scan or schedule finds now, as subjects for the rule. */
async function subjectsFor(rule: Rule, now: Date): Promise<Subject[]> {
  const wait = rule.wait
  switch (rule.trigger) {
    case 'user.inactive': {
      const before = new Date(now.getTime() - wait * 86_400_000)
      const users = await db.user.findMany({ where: { role: { not: 'ADMIN' }, status: 'ACTIVE', OR: [{ lastLoginAt: { lt: before } }, { lastLoginAt: null, createdAt: { lt: before } }] }, select: { id: true, lastLoginAt: true, createdAt: true }, orderBy: { id: 'asc' }, take: 200 })
      return users.map((user) => ({ key: `user:${user.id}`, userId: user.id, facts: { days_inactive: Math.floor((now.getTime() - (user.lastLoginAt || user.createdAt).getTime()) / 86_400_000) } }))
    }
    case 'cart.abandoned': {
      const carts = await db.cart.findMany({ where: { userId: { not: null }, updatedAt: { lt: hoursAgo(wait, now), gt: hoursAgo(24 * 30, now) }, lines: { some: {} } }, select: { id: true, userId: true, updatedAt: true, lines: { select: { quantity: true, product: { select: { name: true } } } } }, take: 200 })
      return carts.map((cart) => ({ key: `cart:${cart.id}:${cart.updatedAt.getTime()}`, userId: cart.userId, facts: { items_count: cart.lines.reduce((sum, line) => sum + line.quantity, 0), items: cart.lines.map((line) => line.product.name).slice(0, 3).join('، ') } }))
    }
    case 'subscription.expiring': {
      const until = new Date(now.getTime() + wait * 86_400_000)
      const rows = await db.subscription.findMany({ where: { status: 'ACTIVE', expiresAt: { gt: now, lte: until } }, select: { id: true, userId: true, expiresAt: true, plan: { select: { name: true } } }, take: 300 })
      return rows.map((row) => ({ key: `subscription:${row.id}:${row.expiresAt.getTime()}`, userId: row.userId, facts: { plan: row.plan.name, days_left: Math.max(0, Math.ceil((row.expiresAt.getTime() - now.getTime()) / 86_400_000)) } }))
    }
    case 'stock.low': {
      const rows = await db.product.findMany({ where: { active: true, stock: { gte: 0, lte: 50 } }, select: { id: true, name: true, stock: true, lowStockAt: true }, take: 500 })
      return rows.filter((row) => row.stock <= (row.lowStockAt || 3)).map((row) => ({ key: `product:${row.id}`, userId: null, facts: { product_id: row.id, product_name: row.name, stock: row.stock } }))
    }
    case 'form.waiting': {
      const rows = await db.formSubmission.findMany({ where: { stage: 'OPEN', assigneeId: null, status: { not: 'SPAM' }, payStatus: { not: 'UNPAID' }, OR: [{ paidAt: { lt: hoursAgo(wait, now) } }, { paidAt: null, createdAt: { lt: hoursAgo(wait, now) } }] }, select: { id: true, formId: true, userId: true, createdAt: true, paidAt: true, form: { select: { slug: true, title: true } } }, take: 200 })
      return rows.map((row) => ({ key: `form:${row.id}`, userId: row.userId, facts: { submission_id: row.id, form_id: row.formId, form_slug: row.form.slug, form_title: row.form.title, hours_waiting: Math.floor((now.getTime() - (row.paidAt || row.createdAt).getTime()) / 3_600_000) } }))
    }
    case 'ticket.waiting': {
      const rows = await db.ticket.findMany({ where: { status: 'OPEN', lastCustomerAt: { lt: hoursAgo(wait, now) } }, select: { id: true, userId: true, department: true, priority: true, lastCustomerAt: true, lastStaffAt: true }, take: 300 })
      return rows.filter((row) => !row.lastStaffAt || (row.lastCustomerAt && row.lastStaffAt < row.lastCustomerAt)).map((row) => ({ key: `ticket:${row.id}:${row.lastCustomerAt!.getTime()}`, userId: row.userId, facts: { ticket_id: row.id, department: row.department, priority: row.priority, hours_waiting: Math.floor((now.getTime() - row.lastCustomerAt!.getTime()) / 3_600_000) } }))
    }
    case 'ticket.answered_idle': {
      const rows = await db.ticket.findMany({ where: { status: 'PENDING', lastStaffAt: { lt: hoursAgo(wait, now) } }, select: { id: true, userId: true, department: true, lastCustomerAt: true, lastStaffAt: true }, take: 300 })
      return rows.filter((row) => !row.lastCustomerAt || (row.lastStaffAt && row.lastCustomerAt < row.lastStaffAt)).map((row) => ({ key: `ticket:${row.id}:${row.lastStaffAt!.getTime()}`, userId: row.userId, facts: { ticket_id: row.id, department: row.department, hours_waiting: Math.floor((now.getTime() - row.lastStaffAt!.getTime()) / 3_600_000) } }))
    }
    case 'report.daily':
    case 'report.weekly': {
      const clock = tehran(now)
      if (clock.hour !== wait) return []
      if (rule.trigger === 'report.weekly' && clock.weekday !== 'Sat') return []
      const days = rule.trigger === 'report.weekly' ? 7 : 1
      return [{ key: `site:${rule.trigger}:${clock.day}`, userId: null, facts: await reportFacts(new Date(now.getTime() - days * 86_400_000), now) }]
    }
  }
  return []
}

export async function reportFacts(from: Date, to: Date): Promise<Facts> {
  const [newUsers, orders, revenue, requests, openTickets, waiting] = await Promise.all([
    db.user.count({ where: { createdAt: { gte: from, lt: to }, role: { not: 'ADMIN' } } }),
    db.order.count({ where: { status: 'PAID', createdAt: { gte: from, lt: to } } }),
    db.order.aggregate({ where: { status: 'PAID', createdAt: { gte: from, lt: to }, currency: BASE_CURRENCY }, _sum: { totalMinor: true } }),
    db.formSubmission.count({ where: { createdAt: { gte: from, lt: to }, status: { not: 'SPAM' } } }),
    db.ticket.count({ where: { status: 'OPEN' } }),
    db.formSubmission.count({ where: { stage: 'OPEN', assigneeId: null, payStatus: { not: 'UNPAID' } } }),
  ])
  const fa = (n: number) => n.toLocaleString('fa-IR')
  return { new_users: fa(newUsers), orders: fa(orders), revenue: fa(Math.round(minorToNumber(revenue._sum.totalMinor || 0n, BASE_CURRENCY))), form_requests: fa(requests), open_tickets: fa(openTickets), waiting_requests: fa(waiting) }
}

/**
 * One pass of the engine (the scheduler calls it every minute): the waiting events first, then the scans and
 * schedules. A failing rule is written down and the others go on.
 */
export async function processAutomation(now = new Date()) {
  const rows = await db.automationRule.findMany({ where: { enabled: true } })
  if (!rows.length) return { events: 0, runs: 0 }
  const rules = rows.map(ruleOf)
  const since = new Map(rows.map((row) => [row.id, row.createdAt.getTime()]))
  let runs = 0, events = 0
  const pending = await db.automationEvent.findMany({ where: { processedAt: null }, orderBy: { id: 'asc' }, take: 100 })
  for (const event of pending) {
    // Claimed once, so two servers never run the same event.
    const claimed = await db.automationEvent.updateMany({ where: { id: event.id, processedAt: null }, data: { processedAt: now } })
    if (!claimed.count) continue
    events++
    // A rule answers only what happened after it was made; an older event in the queue is not its business.
    for (const rule of rules.filter((item) => item.trigger === event.name && since.get(item.id!)! <= event.createdAt.getTime())) {
      const trigger = triggerOf(rule.trigger)!
      try { if (await runRule(rule, trigger, { key: event.subjectKey, userId: event.userId, facts: parse<Facts>(event.payload, {}) }, now)) runs++ } catch (error) { logEvent('error', 'automation.rule_failed', { rule: rule.id, error }) }
    }
  }
  for (const rule of rules) {
    const trigger = triggerOf(rule.trigger)
    if (!trigger || trigger.kind === 'event') continue
    try {
      for (const subject of await subjectsFor(rule, now)) if (await runRule(rule, trigger, subject, now)) runs++
    } catch (error) { logEvent('error', 'automation.scan_failed', { rule: rule.id, error }) }
  }
  // Processed events are kept two weeks for the record, runs half a year.
  await db.automationEvent.deleteMany({ where: { processedAt: { lt: new Date(now.getTime() - 14 * 86_400_000) } } }).catch(() => undefined)
  await db.automationRun.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 180 * 86_400_000) } } }).catch(() => undefined)
  return { events, runs }
}

/** What a rule would find right now, without doing anything (the builder's "try it"). */
export async function previewRule(input: unknown, now = new Date()) {
  const rule = normalizeRule(input)
  const trigger = triggerOf(rule.trigger)!
  if (trigger.kind === 'event') {
    const recent = await db.automationEvent.findMany({ where: { name: rule.trigger }, orderBy: { id: 'desc' }, take: 20 })
    const matches = []
    for (const event of recent) {
      const facts = { ...(await siteFacts()), ...(await userFacts(event.userId)), ...parse<Facts>(event.payload, {}) }
      if (conditionsHold(rule.conditions, rule.logic, facts)) matches.push({ subject: event.subjectKey, facts })
    }
    return { kind: trigger.kind, found: matches.length, sample: matches.slice(0, 5), note: recent.length ? '' : 'هنوز رویدادی از این نوع ثبت نشده است (رویدادها از وقتی قانونی برایشان فعال است ثبت می‌شوند).' }
  }
  const subjects = trigger.kind === 'schedule' ? [{ key: 'site', userId: null, facts: await reportFacts(new Date(now.getTime() - (rule.trigger === 'report.weekly' ? 7 : 1) * 86_400_000), now) }] : await subjectsFor(rule, now)
  const matches = []
  for (const subject of subjects) {
    const facts = { ...(await siteFacts()), ...(await userFacts(subject.userId)), ...subject.facts }
    if (conditionsHold(rule.conditions, rule.logic, facts)) matches.push({ subject: subject.key, facts })
  }
  return { kind: trigger.kind, found: matches.length, sample: matches.slice(0, 5), note: '' }
}
