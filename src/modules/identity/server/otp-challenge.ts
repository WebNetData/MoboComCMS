import { timingSafeEqual } from 'node:crypto'
import type { OtpCode } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { OTP_MAX_ATTEMPTS } from '@/modules/sms/domain/sms'

/** Shared SMS/email claims. The caller selects the latest row, including consumed/expired rows. */
export async function claimOtpChallenge(row: OtpCode | null, hash: string, consume = true, client: Pick<typeof db, 'otpCode'> = db): Promise<boolean> {
  if (!row || row.consumedAt || row.expiresAt.getTime() <= Date.now() || row.attempts >= OTP_MAX_ATTEMPTS) return false
  const expected = Buffer.from(row.codeHash, 'hex'), actual = Buffer.from(hash, 'hex')
  const matches = expected.length === actual.length && timingSafeEqual(expected, actual)
  const result = await client.otpCode.updateMany({
    where: { id: row.id, codeHash: row.codeHash, attempts: matches ? row.attempts : { lt: OTP_MAX_ATTEMPTS }, consumedAt: null, expiresAt: { gt: new Date() } },
    data: matches ? (consume ? { consumedAt: new Date() } : { attempts: { increment: 0 } }) : { attempts: { increment: 1 } },
  })
  return matches && result.count === 1
}
