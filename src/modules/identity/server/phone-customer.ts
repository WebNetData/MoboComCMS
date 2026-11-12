import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { normalizeMobile, phoneEmail } from '@/modules/sms/domain/sms'
import { db } from '@/platform/database/prisma'

export class PhoneCustomerError extends Error {}

/** A name typed by staff: either one full name, or first and last name kept apart like the member profile does. */
export type StaffName = string | { firstName?: string; lastName?: string; name?: string }
const clean = (value: unknown, limit: number) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit)
function readName(input: StaffName) {
  if (typeof input === 'string') return { name: clean(input, 120), firstName: '', lastName: '' }
  const firstName = clean(input.firstName, 40), lastName = clean(input.lastName, 40)
  return { name: clean([firstName, lastName].filter(Boolean).join(' ') || input.name, 120), firstName, lastName }
}
/** The member profile's convention (identity/server/first-access): User.name is "first last", profileData keeps the parts. */
function withNameParts(raw: string, firstName: string, lastName: string) {
  let stored: Record<string, unknown> = {}
  try { const value = JSON.parse(raw || '{}'); if (value && typeof value === 'object' && !Array.isArray(value)) stored = value } catch { /* keep only the new parts */ }
  return JSON.stringify({ ...stored, ...(firstName ? { firstName } : {}), ...(lastName ? { lastName } : {}) })
}

const phoneWhere = (phone: string) => ({ OR: [{ phone: { in: [phone, `0${phone.slice(-10)}`, phone.replace('+', '')] } }, { email: phoneEmail(phone) }] })
function onlyAccount<T extends { status: string; phone: string }>(rows: T[], phone: string) {
  if (rows.length > 1) throw new PhoneCustomerError('این شماره در چند حساب ثبت شده است؛ ابتدا حساب‌ها را از مدیریت کاربران بررسی کنید')
  if (!rows[0]) return null
  if (rows[0].status !== 'ACTIVE') throw new PhoneCustomerError('حساب این شماره فعال نیست')
  if (normalizeMobile(rows[0].phone) !== phone) throw new PhoneCustomerError('نشانی حساب قدیمی با موبایل فعلی سازگار نیست؛ مدیریت کاربران باید آن را بررسی کند')
  return rows[0]
}

/** Read-only preview for the counter: which account a mobile belongs to, without creating one. */
export async function findPhoneCustomer(raw: unknown) {
  const phone = normalizeMobile(raw)
  if (!phone) throw new PhoneCustomerError('شمارهٔ موبایل معتبر نیست')
  const row = onlyAccount(await db.user.findMany({ where: phoneWhere(phone), take: 3, orderBy: { id: 'asc' }, select: { id: true, name: true, phone: true, email: true, status: true, profileData: true } }), phone)
  if (!row) return null
  let parts: Record<string, unknown> = {}
  try { parts = JSON.parse(row.profileData || '{}') } catch { /* name only */ }
  return { id: row.id, name: row.name, phone: row.phone, email: row.email, firstName: typeof parts.firstName === 'string' ? parts.firstName : '', lastName: typeof parts.lastName === 'string' ? parts.lastName : '' }
}

/**
 * A staff-entered phone links a customer record; only a real OTP can verify it or grant authentication.
 * A new account takes the staff-typed name; an existing account keeps its own name and only gets one when it has none.
 */
export async function resolvePhoneCustomer(tx: Prisma.TransactionClient, raw: unknown, staffName: StaffName = '') {
  const phone = normalizeMobile(raw)
  if (!phone) throw new PhoneCustomerError('شمارهٔ موبایل معتبر نیست')
  if (!process.env.DATABASE_URL?.startsWith('file:')) await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`identity:phone:${phone}`}))`)
  const { name, firstName, lastName } = readName(staffName)
  const existing = onlyAccount(await tx.user.findMany({ where: phoneWhere(phone), take: 3, orderBy: { id: 'asc' } }), phone)
  if (existing) {
    if (existing.name.trim() || !name) return existing
    return tx.user.update({ where: { id: existing.id }, data: { name, profileData: withNameParts(existing.profileData, firstName, lastName) } })
  }
  return tx.user.create({ data: { email: phoneEmail(phone), phone, name, profileData: withNameParts('{}', firstName, lastName), passwordHash: await bcrypt.hash(randomBytes(32).toString('base64url'), 10), passwordSetupRequired: true } })
}

/** Called only after verified SMS sign-in; claims the same simple account the counter created. */
export async function claimPhoneLogin(phone: string) {
  return db.$transaction(async tx => {
    const customer = await resolvePhoneCustomer(tx, phone)
    return tx.user.update({ where: { id: customer.id }, data: { phone: normalizeMobile(phone), phoneVerifiedAt: new Date(), lastLoginAt: new Date() }, include: { roleRef: true } })
  })
}
