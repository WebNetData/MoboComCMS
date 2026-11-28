import { Prisma } from '@prisma/client'
import { PayError } from '@/modules/billing/domain/pay'
import type { PayFinancialReport, PayReportSettlement } from '@/modules/billing/domain/pay-report'
import { minorToDecimal } from '@/shared/money'
import { payContext, payTransaction, type PayActor } from './context'
import { merchantRead } from './views'

const dayMs = 86400000
const localDay = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tehran' })
const moneyFields = ['receivedRial', 'platformFeeRial', 'bankServiceFeeRial', 'roundingRial', 'netRial', 'creditedRial', 'creditedUsdt'] as const
type DayAmounts = Record<(typeof moneyFields)[number], bigint> & { paidCount: number }
type DailyRow = Record<(typeof moneyFields)[number], string> & { date: string; paidCount: number }

function parseDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new PayError('تاریخ را به میلادی انتخاب کنید')
  const date = new Date(value + 'T00:00:00Z')
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || date.getUTCFullYear() < 2000) throw new PayError('تاریخ گزارش معتبر نیست')
  return date.getTime()
}

function range(params: URLSearchParams) {
  const today = localDay.format(new Date())
  const to = params.get('to') || today
  const end = parseDay(to)
  const from = params.get('from') || new Date(end - 29 * dayMs).toISOString().slice(0, 10)
  const start = parseDay(from)
  if (start > end || end > parseDay(today) || (end - start) / dayMs >= 90) throw new PayError('بازهٔ گزارش باید حداکثر ۹۰ روز و تا امروز باشد')
  return { from, to, start, end }
}

const emptyDay = () => ({ paidCount: 0, receivedRial: 0n, platformFeeRial: 0n, bankServiceFeeRial: 0n, roundingRial: 0n, netRial: 0n, creditedRial: 0n, creditedUsdt: 0n })
const settlementSource = Prisma.sql`CASE WHEN s."sourceCurrency" = 'IRR' AND s."sourceMinor" = 0 THEN s."amountMinor" ELSE s."sourceMinor" END`
const amountView = (row: DayAmounts) => ({
  paidCount: row.paidCount,
  receivedRial: row.receivedRial.toString(),
  platformFeeRial: row.platformFeeRial.toString(),
  bankServiceFeeRial: row.bankServiceFeeRial.toString(),
  roundingRial: row.roundingRial.toString(),
  netRial: row.netRial.toString(),
  creditedRial: row.creditedRial.toString(),
  creditedUsdt: minorToDecimal(row.creditedUsdt, 'USDT'),
})

export function payFinancialReport(actor: PayActor, scope: 'admin' | 'merchant', params: URLSearchParams): Promise<PayFinancialReport> {
  return payTransaction(async tx => {
    if (actor.machine) throw new PayError('گزارش مالی به نشست کاربری نیاز دارد', 403)
    const merchant = scope === 'merchant' ? await merchantRead(actor, tx) : null
    if (scope === 'admin') await payContext(actor, tx, 'mobocom-pay.manage')
    const terminalId = params.get('terminalId')?.trim() || null
    if (terminalId && (terminalId.length > 100 || !await tx.payTerminal.count({
      where: { id: terminalId, ...(merchant && { merchantId: merchant.id }) },
    }))) throw new PayError('پایانهٔ گزارش پیدا نشد', 404)
    const { from, to, start, end } = range(params)
    // Prisma stores these timestamps without a zone, in UTC.
    const startsAt = Prisma.sql`(${from}::date::timestamp AT TIME ZONE 'Asia/Tehran') AT TIME ZONE 'UTC'`
    const endsBefore = Prisma.sql`((${to}::date + 1)::timestamp AT TIME ZONE 'Asia/Tehran') AT TIME ZONE 'UTC'`
    const [paidDays, settlementRows, completed] = await Promise.all([
      tx.$queryRaw<DailyRow[]>(Prisma.sql`
        SELECT to_char(((p."paidAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tehran')::date, 'YYYY-MM-DD') AS "date",
          count(*)::int AS "paidCount",
          sum(p."totalMinor" + COALESCE(proof.fee, 0))::text AS "receivedRial",
          sum(p."feeMinor")::text AS "platformFeeRial",
          sum(COALESCE(proof.fee, 0))::text AS "bankServiceFeeRial",
          sum(p."creditRoundingRial")::text AS "roundingRial",
          sum(p."netMinor")::text AS "netRial",
          COALESCE(sum(w."amountMinor") FILTER (WHERE w.currency = 'IRR'), 0)::text AS "creditedRial",
          COALESCE(sum(w."amountMinor") FILTER (WHERE w.currency = 'USDT'), 0)::text AS "creditedUsdt"
        FROM "PayPayment" p
        LEFT JOIN "WalletTx" w ON w.id = p."walletTxId" AND w.type = 'PAY_CREDIT' AND w.status = 'DONE'
        LEFT JOIN LATERAL (
          SELECT sum(c."paidCollectedRial" - c."principalRial") AS fee
          FROM "PayBaleCollection" c WHERE c."invoiceId" = p."invoiceId" AND c.status = 'PAID'
        ) proof ON true
        WHERE p.status = 'PAID' AND p."paidAt" >= (${startsAt}) AND p."paidAt" < (${endsBefore})
        ${merchant ? Prisma.sql`AND p."merchantId" = ${merchant.id}` : Prisma.empty}
        ${terminalId ? Prisma.sql`AND p."terminalId" = ${terminalId}` : Prisma.empty}
        GROUP BY 1 ORDER BY 1`),
      terminalId ? [] : tx.$queryRaw<Array<Pick<PayReportSettlement, 'currency' | 'status' | 'count'> & { sourceMinor: string }>>(Prisma.sql`
        SELECT s."sourceCurrency" AS currency, s.status, count(*)::int AS count,
          sum(${settlementSource})::text AS "sourceMinor"
        FROM "PaySettlement" s
        WHERE s."createdAt" >= (${startsAt}) AND s."createdAt" < (${endsBefore})
        ${merchant ? Prisma.sql`AND s."merchantId" = ${merchant.id}` : Prisma.empty}
        GROUP BY s."sourceCurrency", s.status ORDER BY s."sourceCurrency", s.status`),
      // Paid rows are terminal. Their update timestamp is the completion time,
      // including for requests created before the reporting period.
      terminalId ? [] : tx.$queryRaw<{ currency: 'IRR' | 'USDT'; sourceMinor: string }[]>(Prisma.sql`
        SELECT s."sourceCurrency" AS currency, sum(${settlementSource})::text AS "sourceMinor"
        FROM "PaySettlement" s
        WHERE s.status = 'PAID' AND s."updatedAt" >= (${startsAt}) AND s."updatedAt" < (${endsBefore})
        ${merchant ? Prisma.sql`AND s."merchantId" = ${merchant.id}` : Prisma.empty}
        GROUP BY s."sourceCurrency"`),
    ])
    const totals = emptyDay()
    const byDate = new Map(paidDays.map(row => [row.date, row]))
    const days = []
    for (let day = start; day <= end; day += dayMs) {
      const date = new Date(day).toISOString().slice(0, 10)
      const saved = byDate.get(date)
      const row = emptyDay()
      if (saved) {
        row.paidCount = saved.paidCount
        for (const field of moneyFields) row[field] = BigInt(saved[field])
      }
      totals.paidCount += row.paidCount
      for (const field of moneyFields) totals[field] += row[field]
      days.push({ date, ...amountView(row) })
    }
    const settlements = settlementRows.map(({ sourceMinor, ...row }) => ({ ...row, sourceAmount: minorToDecimal(sourceMinor, row.currency) }))
    const closing = terminalId ? [] : (['IRR', 'USDT'] as const).map(currency => {
      const credited = currency === 'IRR' ? totals.creditedRial : totals.creditedUsdt
      const paid = BigInt(completed.find(row => row.currency === currency)?.sourceMinor ?? '0')
      return { currency, credited: minorToDecimal(credited, currency), paid: minorToDecimal(paid, currency), difference: minorToDecimal(credited - paid, currency) }
    })
    return { from, to, totals: amountView(totals), days, settlements, terminalId, closing }
  })
}
