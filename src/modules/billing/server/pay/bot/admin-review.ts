import type { Prisma } from '@prisma/client'

export const paidBotReviewWhere = {
  status: { in: ['UNKNOWN', 'BLOCKED'] },
  payment: { status: 'PAID' },
} satisfies Prisma.PayBotDeliveryWhereInput

const reasons: Record<string, string> = {
  CONFIG_OR_AUTHORITY_CHANGED: 'تنظیمات اتصال یا دسترسی تغییر کرده است.',
  INTERRUPTED_AFTER_CLAIM: 'پردازش ارسال پس از شروع قطع شده است.',
  ACK_NOT_MATCHED: 'پاسخ پنل ربات با معیار موفقیت ثبت‌شده مطابقت نداشت.',
  RESPONSE_UNKNOWN: 'نتیجهٔ درخواست به پنل ربات مشخص نیست.',
  NOT_SENT_RETRY_EXHAUSTED: 'ارسال پیش از رسیدن درخواست به پنل ناموفق بود و فرصت تلاش تمام شد.',
  OPERATOR_INSPECTED_INTERRUPTION: 'وقفهٔ ارسال برای بررسی ثبت شده است.',
}

/** Minimal staff projection. Callers must require mobocom-pay.manage and an active module. */
export async function paidBotReviewEvidence(reader: Prisma.TransactionClient, id?: string) {
  const rows = await reader.payBotDelivery.findMany({
    where: { ...paidBotReviewWhere, ...(id ? { id } : {}) },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    take: id ? 1 : 15,
    select: {
      id: true, version: true, attempts: true, lastCode: true, httpStatus: true, lastAttemptAt: true,
      payment: { select: { externalId: true, terminal: { select: { name: true } } } },
    },
  })
  return rows.map(row => ({
    id: row.id, version: row.version, externalId: row.payment.externalId, terminalName: row.payment.terminal.name,
    attempts: row.attempts, reason: reasons[row.lastCode] || 'دلیل مشخصی برای نتیجه ثبت نشده است.',
    httpStatus: row.httpStatus, lastAttemptAt: row.lastAttemptAt?.toISOString() ?? null,
  }))
}
