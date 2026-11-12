import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { normalizeMobile, phoneEmail } from '@/modules/sms/domain/sms'
import { db } from '@/platform/database/prisma'

export class PhoneCustomerError extends Error {}

/** A staff-entered phone links a customer record; only a real OTP can verify it or grant authentication. */
export async function resolvePhoneCustomer(tx: Prisma.TransactionClient, raw: unknown, name = '') {
  const phone = normalizeMobile(raw)
  if (!phone) throw new PhoneCustomerError('شمارهٔ موبایل معتبر نیست')
 if(!process.env.DATABASE_URL?.startsWith('file:'))await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`identity:phone:${phone}`}))`)
  const local = `0${phone.slice(-10)}`
  const rows = await tx.user.findMany({ where: { OR: [{ phone: { in: [phone, local, phone.replace('+', '')] } }, { email: phoneEmail(phone) }] }, take: 3, orderBy: { id: 'asc' } })
  if (rows.length > 1) throw new PhoneCustomerError('این شماره در چند حساب ثبت شده است؛ ابتدا حساب‌ها را از مدیریت کاربران بررسی کنید')
  if (rows[0]) {
    if (rows[0].status !== 'ACTIVE') throw new PhoneCustomerError('حساب این شماره فعال نیست')
 if (normalizeMobile(rows[0].phone) !== phone) throw new PhoneCustomerError('نشانی حساب قدیمی با موبایل فعلی سازگار نیست؛ مدیریت کاربران باید آن را بررسی کند')
    return rows[0]
  }
  return tx.user.create({ data: { email: phoneEmail(phone), phone, name: name.trim().slice(0,120), passwordHash: await bcrypt.hash(randomBytes(32).toString('base64url'),10), passwordSetupRequired: true } })
}

/** Called only after verified SMS sign-in; claims the same simple account the counter created. */
export async function claimPhoneLogin(phone: string) {
  return db.$transaction(async tx => {
    const customer = await resolvePhoneCustomer(tx, phone)
    return tx.user.update({ where: { id: customer.id }, data: { phone: normalizeMobile(phone), phoneVerifiedAt: new Date(), lastLoginAt: new Date() }, include: { roleRef: true } })
  })
}
