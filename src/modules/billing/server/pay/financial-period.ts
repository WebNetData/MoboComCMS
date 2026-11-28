import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { parsePermissions } from '@/modules/identity/rbac'
import { globalAuthenticationDenied } from '@/modules/identity/server/authentication-restrictions'
import { PayError } from '@/modules/billing/domain/pay'
import type { PayPeriodAction, PayPeriodView } from '@/modules/billing/domain/pay-financial-period'
import { payAudit, payContext, payTransaction, type PayActor } from './context'
import { readPayFinancialReport } from './financial-report'

const actions = new Set<PayPeriodAction>(['SUBMIT', 'ASSIGN', 'REVIEW', 'CLOSE', 'CORRECT'])

async function reviewers(tx: Prisma.TransactionClient) {
  const users = await tx.user.findMany({
    where: { role: 'ADMIN', status: 'ACTIVE', erasedAt: null },
    select: { id: true, name: true, roleId: true, roleRef: { select: { permissions: true } } },
    orderBy: { id: 'asc' },
  })
  const allowed = users.filter(user => user.roleId === null || parsePermissions(user.roleRef?.permissions || '').includes('mobocom-pay.manage'))
  return allowed.map(({ id, name }) => ({ id, name }))
}

async function periodView(tx: Prisma.TransactionClient, fromDay: string, toDay: string, revision?: number): Promise<PayPeriodView> {
  const [period, staff, recent] = await Promise.all([
    tx.payFinancialPeriod.findUnique({
      where: { fromDay_toDay: { fromDay, toDay } },
      include: { revisions: { orderBy: { version: 'desc' }, take: 30, select: { version: true, actorId: true, reviewerId: true, action: true, note: true, createdAt: true } } },
    }),
    reviewers(tx),
    tx.payFinancialPeriod.findMany({ orderBy: { fromDay: 'desc' }, take: 24, select: { fromDay: true, toDay: true, status: true } }),
  ])
  if (!period) return { period: null, reviewers: staff, recent }
  const snapshot = await tx.payFinancialPeriodRevision.findUniqueOrThrow({ where: { periodId_version: { periodId: period.id, version: period.version } }, select: { snapshot: true } })
  const picked = revision && await tx.payFinancialPeriodRevision.findUnique({ where: { periodId_version: { periodId: period.id, version: revision } }, select: { snapshot: true } })
  if (revision && !picked) throw new PayError('نسخهٔ گزارش پیدا نشد', 404)
  return {
    reviewers: staff,
    recent,
    period: {
      status: period.status, version: period.version, reviewerId: period.reviewerId, discrepancyNote: period.discrepancyNote,
      snapshot: JSON.parse(snapshot.snapshot),
      history: period.revisions.map(row => ({ ...row, createdAt: row.createdAt.toISOString() })),
    },
    ...(picked ? { selectedSnapshot: JSON.parse(picked.snapshot) } : {}),
  }
}

function periodDays(input: { from?: unknown; to?: unknown }) {
  const { from, to } = input
  if (typeof from !== 'string' || typeof to !== 'string' || ![from, to].every(day => /^\d{4}-\d{2}-\d{2}$/.test(day)) || from > to) {
    throw new PayError('بازهٔ مالی معتبر نیست', 422)
  }
  return { from, to }
}

export function payFinancialPeriod(actor: PayActor, params: URLSearchParams) {
  return payTransaction(async tx => {
    await payContext(actor, tx, 'mobocom-pay.manage')
    const { from, to } = periodDays({ from: params.get('from'), to: params.get('to') })
    const revision = params.has('revision') ? Number(params.get('revision')) : undefined
    if (revision !== undefined && (!Number.isSafeInteger(revision) || revision < 1)) throw new PayError('نسخهٔ گزارش معتبر نیست', 422)
    return periodView(tx, from, to, revision)
  })
}

export function changePayFinancialPeriod(actor: PayActor, input: Record<string, unknown>) {
  return payTransaction(async tx => {
    await payContext(actor, tx, 'mobocom-pay.manage')
    const { from, to } = periodDays(input)
    const action = input.action as PayPeriodAction
    if (!actions.has(action)) throw new PayError('عملیات معتبر نیست', 422)
    const version = input.version
    if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 0) throw new PayError('نسخهٔ دوره معتبر نیست', 422)
    const note = typeof input.note === 'string' ? input.note.trim() : ''
    if (note.length > 500 || ((action === 'REVIEW' || action === 'CLOSE' || action === 'CORRECT') && note.length < 3)) throw new PayError('نتیجه یا دلیل را در ۳ تا ۵۰۰ نویسه ثبت کنید', 422)

    const existing = await tx.payFinancialPeriod.findUnique({ where: { fromDay_toDay: { fromDay: from, toDay: to } } })
    if ((existing?.version ?? 0) !== version || (action === 'SUBMIT' ? existing !== null : existing === null)) {
      throw new PayError('دوره هم‌زمان تغییر کرد. صفحه را تازه کنید.', 409)
    }
    if (existing && (existing.status === 'CLOSED') !== (action === 'CORRECT')) throw new PayError('عملیات با وضعیت دوره سازگار نیست', 409)
    if ((action === 'REVIEW' || action === 'CLOSE') && existing?.reviewerId !== actor.id) throw new PayError('فقط مسئول تعیین‌شده می‌تواند نتیجهٔ بررسی را ثبت یا دوره را ببندد', 403)
    if (action === 'CLOSE' && to >= new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tehran' }).format(new Date())) throw new PayError('دوره پس از پایان روز آخر بسته می‌شود', 422)
    const reviewerId = action === 'SUBMIT' || action === 'ASSIGN' ? input.reviewerId : existing?.reviewerId
    if (typeof reviewerId !== 'number' || !(await reviewers(tx)).some(user => user.id === reviewerId) || await globalAuthenticationDenied(reviewerId, new Date(), tx)) throw new PayError('مسئول مجاز بررسی را انتخاب کنید', 422)

    const previous = existing && await tx.payFinancialPeriodRevision.findUniqueOrThrow({ where: { periodId_version: { periodId: existing.id, version } } })
    const snapshot = action === 'ASSIGN' && previous ? previous.snapshot
      : JSON.stringify(await readPayFinancialReport(tx, actor, 'admin', new URLSearchParams({ from, to })))
    if (action === 'CLOSE' && (previous?.action !== 'REVIEW' || previous.snapshot !== snapshot)) throw new PayError('نتیجهٔ بررسی را برای گزارش فعلی ثبت کنید، سپس دوره را ببندید', 409)
    const status = action === 'CLOSE' || action === 'CORRECT' ? 'CLOSED' : 'REVIEW'
    const discrepancyNote = action === 'REVIEW' || action === 'CORRECT' ? note : existing?.discrepancyNote ?? ''
    const id = existing?.id ?? randomUUID()
    if (existing) {
      const claimed = await tx.payFinancialPeriod.updateMany({
        where: { id, status: existing.status, version }, data: { status, reviewerId, discrepancyNote, version: version + 1 },
      })
      if (claimed.count !== 1) throw new PayError('دوره هم‌زمان تغییر کرد. صفحه را تازه کنید.', 409)
    } else {
      const overlap = await tx.payFinancialPeriod.count({ where: { fromDay: { lte: to }, toDay: { gte: from } } })
      if (overlap) throw new PayError('بخشی از این بازه در دورهٔ دیگری ثبت شده است', 409)
      await tx.payFinancialPeriod.create({ data: { id, status, fromDay: from, toDay: to, reviewerId } })
    }
    await tx.payFinancialPeriodRevision.create({ data: { periodId: id, version: version + 1, actorId: actor.id, reviewerId, action, note, snapshot } })
    await payAudit(tx, actor, 'period.' + action.toLowerCase(), id, { version: version + 1, reviewerId, from, to })
    return periodView(tx, from, to)
  })
}
