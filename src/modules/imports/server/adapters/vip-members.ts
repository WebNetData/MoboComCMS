import { createHash } from 'node:crypto'
import { db } from '@/platform/database/prisma'
import { destinationActor } from '@/modules/imports/server/authority'
import { toText } from '@/modules/imports/domain/values'
import type { FieldDef, SourceItem } from '@/modules/imports/domain/types'
import { seenBefore } from './common'
import { grantMembership } from '@/modules/membership/server/membership'
import { planPeriod } from '@/modules/membership/domain/plans'
import type { ImportAdapter, ImportContext, Plan } from '@/modules/imports/server/registry'

const fields: FieldDef[] = [
  { key: 'user', label: 'ایمیل، موبایل یا شناسهٔ کاربر', type: 'text', group: 'main', requiredOnCreate: true, synonyms: ['email', 'mail', 'user', 'username', 'mobile', 'phone', 'user_id', 'user_email', 'ایمیل', 'موبایل', 'کاربر'] },
  { key: 'plan', label: 'نامک یا نام پلن', type: 'text', group: 'main', hint: 'بدون پلن، عضو در پایین‌ترین سطح است.', synonyms: ['plan', 'level', 'membership', 'membership_level', 'پلن', 'سطح'] },
  { key: 'days', label: 'تعداد روز', type: 'int', group: 'main', hint: 'بدون روز و تاریخ پایان، مدت خود پلن به‌کار می‌رود.', synonyms: ['days', 'duration', 'روز', 'مدت'] },
  { key: 'endsAt', label: 'تاریخ پایان', type: 'date', group: 'main', synonyms: ['ends_at', 'end_date', 'expires', 'expires_at', 'expiration', 'expiry', 'تاریخ پایان', 'انقضا'] },
  { key: 'note', label: 'یادداشت', type: 'text', group: 'meta', synonyms: ['note', 'comment', 'یادداشت'] },
]

type Resolved = { userId: number; planId: number | null; days: number; endsAt: string | null; note: string; dedupeKey: string }
const PLANS = 'vip-import-plans'

function failure(item: SourceItem, text: string): Plan {
  const title = toText(item.values.user, 120) || `ردیف ${item.rows[0]}`
  const messages: Plan['messages'] = [{ level: 'error', text }]
  return { action: 'FAIL', title, sourceKey: '', messages, counters: {}, preview: { title, action: 'FAIL', lines: [], messages } }
}

async function plansOf(ctx: ImportContext) {
  const held = ctx.cache.get(PLANS) as Awaited<ReturnType<typeof load>> | undefined
  if (held) return held
  const plans = await load()
  ctx.cache.set(PLANS, plans)
  return plans
}
const load = () => db.membershipPlan.findMany({ select: { id: true, slug: true, name: true, days: true, billing: true, fixedEndsAt: true, trialDays: true } })

function findUser(who: string) {
  const text = who.trim().toLowerCase()
  if (/^\d{1,9}$/.test(text)) return db.user.findUnique({ where: { id: Number(text) }, select: { id: true } })
  if (text.includes('@')) return db.user.findFirst({ where: { email: text }, select: { id: true } })
  return db.user.findFirst({ where: { phone: text }, select: { id: true } })
}

/**
 * Members of another system move in as ordinary periods given by the team. The same row imported again is recognised
 * by its key and left alone. People with no account here are reported, not created: an account is theirs to open.
 */
export const vipMembersImporter: ImportAdapter = {
  id: 'vip-members', label: 'اعضای اشتراک ویژه', description: 'ورود اعضای VIP از فایل، با پیش‌نمایش و امکان بازگردانی.', entity: 'عضو', module: 'membership', permissions: ['membership.manage'], strictValues: true,
  fields, supports: {}, identity: ['ایمیل، موبایل یا شناسهٔ کاربر با پلن و مدت همان ردیف'], options: [], normalizeOptions: () => ({}),

  async plan(item: SourceItem, values: Record<string, unknown>, _variants: Record<string, unknown>[], ctx: ImportContext): Promise<Plan> {
    try {
      const allowed = ctx.allow(values, 'create')
      const who = toText(allowed.user, 190)
      if (!who) throw new Error('ستون کاربر خالی است')
      const user = await findUser(who)
      if (!user) throw new Error(`کاربری با «${who}» در سایت نیست؛ این ردیف وارد نشد`)
      const wanted = toText(allowed.plan, 120)
      const plan = wanted ? (await plansOf(ctx)).find((row) => row.slug === wanted || row.name === wanted) : null
      if (wanted && !plan) throw new Error(`پلن «${wanted}» پیدا نشد`)
      const endsAt = allowed.endsAt ? new Date(String(allowed.endsAt)) : null
      if (endsAt && (Number.isNaN(endsAt.getTime()) || endsAt <= new Date())) throw new Error('تاریخ پایان باید در آینده باشد')
      const days = Number(allowed.days) || plan?.days || 0
      if (!endsAt && !plan && !days) throw new Error('برای این ردیف پلن، تعداد روز یا تاریخ پایان لازم است')
      if (days < 0 || days > 3650) throw new Error('تعداد روز باید بین ۱ تا ۳۶۵۰ باشد')
      const title = who, sourceKey = createHash('sha256').update([user.id, plan?.id ?? 0, days, endsAt?.toISOString() ?? ''].join('|')).digest('hex').slice(0, 32)
      const dedupeKey = `import:${sourceKey}`
      const messages: Plan['messages'] = []
      const repeated = seenBefore(ctx, `vip-members:${sourceKey}`, item.index) !== null || await db.userMembership.count({ where: { dedupeKey } }) > 0
      if (repeated) { messages.push({ level: 'warning', text: 'این ردیف قبلاً وارد شده است؛ روز دوباره اضافه نمی‌شود' }); return { action: 'SKIP', title, sourceKey, messages, counters: { duplicates: 1 }, preview: { title, action: 'SKIP', lines: [], messages } } }
      const lines = ctx.previewLines(fields, values, allowed, (_name, value) => toText(value, 120))
      const data: Resolved = { userId: user.id, planId: plan?.id ?? null, days, endsAt: endsAt?.toISOString() ?? null, note: toText(allowed.note, 300), dedupeKey }
      return { action: 'CREATE', title, sourceKey, messages, counters: {}, preview: { title, action: 'CREATE', lines, messages }, data }
    } catch (error) { return failure(item, error instanceof Error ? error.message : 'ردیف معتبر نیست') }
  },

  async apply(_item, planned, ctx) {
    const data = planned.data as Resolved
    await db.$transaction((tx) => destinationActor(ctx, tx))
    const now = new Date()
    const plan = data.planId ? await db.membershipPlan.findUnique({ where: { id: data.planId } }) : null
    const current = await db.userMembership.findFirst({ where: { userId: data.userId, revokedAt: null, endsAt: { gt: now } }, orderBy: { endsAt: 'desc' }, select: { endsAt: true } })
    const period = data.endsAt ? { startsAt: now, endsAt: new Date(data.endsAt) } : planPeriod({ days: data.days, billing: plan?.billing ?? 'DAYS', fixedEndsAt: plan?.fixedEndsAt ?? null, trialDays: 0 }, current?.endsAt, now)
    const granted = await grantMembership({ userId: data.userId, days: data.days || 1, source: 'ADMIN', planId: data.planId, period, note: data.note, createdBy: ctx.actor.id, dedupeKey: data.dedupeKey, silent: true })
    return { action: 'CREATE', entityType: 'userMembership', entityId: granted.id, changes: [{ kind: 'created', entity: 'userMembership', id: granted.id }], messages: [], counters: {} }
  },

  async rollback(changes, ctx) {
    if (!ctx) return { undone: 0, conflicts: ['اطلاعات اختیار اجرای بازگردانی موجود نیست'] }
    await db.$transaction((tx) => destinationActor(ctx, tx, true))
    const conflicts: string[] = []; let undone = 0
    for (const change of changes) {
      const row = await db.userMembership.updateMany({ where: { id: change.id, revokedAt: null }, data: { revokedAt: new Date() } })
      if (row.count) undone++; else conflicts.push(`دورهٔ ${change.id} قبلاً لغو شده است`)
    }
    return { undone, conflicts }
  },
}
