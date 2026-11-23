import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import type { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { isModuleEnabled } from '@/extensions/server/modules'
import { clientIp, rateLimitStrict } from '@/platform/http/rate-limit'
import { globalAuthenticationDenied } from '@/modules/identity/server/authentication-restrictions'
import { verifyHuman } from '@/modules/identity/server/human-check'
import { requestOtp, verifyOtp, SmsError } from '@/modules/sms/server/sms'
import { normalizeMobile } from '@/modules/sms/domain/sms'
import { decryptPanelCredential, encryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import { PayError } from '@/modules/billing/domain/pay'
import { payTransaction } from './context'

type Client = Prisma.TransactionClient | typeof db
const validId = (id: string) => /^[A-Za-z0-9_-]{32}$/.test(id)
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
const validToken = (value: string) => /^[A-Za-z0-9_-]{43}$/.test(value)
export const payPayerCookie = (id: string) => `pay_payer_${id}`
export const payPayerChallengeCookie = (id: string) => `pay_challenge_${id}`
// The purpose is stored in the shared OTP/SMS records: never persist the checkout capability there.
const purpose = (id: string, challenge: string): `PAY_CHECKOUT:${string}:${string}` => `PAY_CHECKOUT:${digest(id).slice(0, 32)}:${digest(challenge).slice(0, 32)}`

async function payment(id: string, tx: Client, allowPaid = false) {
  if (!validId(id) || !(await isModuleEnabled('mobocom-pay', tx))) throw new PayError('پرداخت پیدا نشد', 404)
  const row = await tx.payPayment.findUnique({ where: { id }, include: { merchant: { include: { user: true } }, terminal: true } })
  if (!row) throw new PayError('پرداخت پیدا نشد', 404)
  if (row.status !== 'PENDING' && !(allowPaid && row.status === 'PAID')) throw new PayError('وضعیت این پرداخت تغییر کرده است', 409)
  if (row.status === 'PENDING' && row.expiresAt <= new Date()) throw new PayError('مهلت این پرداخت پایان یافته است', 409)
  if (row.status !== 'PAID' && (row.merchant.status !== 'ACTIVE' || !row.terminal.active || row.merchant.user.status !== 'ACTIVE' || await globalAuthenticationDenied(row.merchant.userId, new Date(), tx)))
    throw new PayError('دریافت این پایانه متوقف شده است', 409)
  return row
}

async function limit(key: string, count: number, windowMs: number) {
  if (!(await rateLimitStrict(key, count, windowMs)).ok) throw new PayError('درخواست زیاد است؛ کمی بعد دوباره تلاش کنید', 429)
}

/** Issue a browser-bound challenge using the canonical SMS service; no login identity is created. */
export async function requestPayPayerOtp(req: NextRequest, id: string, input: Record<string, unknown>) {
  const phone = normalizeMobile(input.phone)
  if (!phone) throw new PayError('شمارهٔ موبایل معتبر نیست')
  await payment(id, db)
  const ip = clientIp(req.headers)
  await limit(`pay:payer:send:ip:${ip}`, 15, 60 * 60_000)
  await limit(`pay:payer:send:payment:${id}`, 5, 60 * 60_000)
  if (!(await verifyHuman(input.humanToken ?? input.turnstileToken, req.headers, 'login'))) throw new PayError('بررسی امنیتی انجام نشد؛ دوباره تلاش کنید.', 400, 'HUMAN_CHECK')
  const challengeToken = randomBytes(32).toString('base64url')
  try {
    const result = await requestOtp({ phone, purpose: purpose(id, challengeToken), ip, beforeIssue: async tx => { await payment(id, tx) } })
    return { challengeToken, expiresIn: result.expiresIn, resendIn: result.resendIn, ...('delivery' in result ? { delivery: result.delivery, notice: result.notice } : {}) }
  } catch (error) {
    if (error instanceof SmsError) throw new PayError(error.message, error.status, 'PAY_OTP_FAILED')
    throw error
  }
}

/** Consume the bound code before minting an opaque, payment-specific checkout ticket. */
export async function verifyPayPayerOtp(req: NextRequest, id: string, input: Record<string, unknown>) {
  const phone = normalizeMobile(input.phone), challenge = req.cookies.get(payPayerChallengeCookie(id))?.value || ''
  if (!phone || !validId(id) || !validToken(challenge)) throw new PayError('کد وارد شده صحیح نیست یا منقضی شده است', 400, 'PAY_OTP_FAILED')
  await limit(`pay:payer:verify:ip:${clientIp(req.headers)}`, 30, 60 * 60_000)
  await limit(`pay:payer:verify:payment:${id}`, 15, 60 * 60_000)
  await payment(id, db)
  try { await verifyOtp({ phone, code: input.code, purpose: purpose(id, challenge) }) }
  catch (error) {
    // verifyOtp commits failed-attempt increments itself; never wrap this call in a transaction that throws.
    if (error instanceof SmsError) throw new PayError(error.message, error.status, 'PAY_OTP_FAILED')
    throw error
  }
  const token = randomBytes(32).toString('base64url'), hash = digest(token)
  const encrypted = encryptPanelCredential(phone), phoneLast4 = phone.slice(-4)
  const expiresAt = new Date(Date.now() + 24 * 60 * 60_000)
  await payTransaction(async tx => {
    const current = await payment(id, tx)
    if (current.invoiceId) throw new PayError('این پرداخت به شمارهٔ تأییدشده متصل است؛ از همان مرورگر ادامه دهید', 409)
    const changed = await tx.payPayment.updateMany({
      where: { id, status: 'PENDING', expiresAt: { gt: new Date() }, payerSessionHash: current.payerSessionHash },
      data: { payerSessionHash: hash, payerPhoneCiphertext: encrypted, payerPhoneLast4: phoneLast4, payerVerifiedAt: new Date(), payerSessionExpiresAt: expiresAt },
    })
    if (changed.count !== 1) throw new PayError('وضعیت پرداخت تغییر کرده است', 409)
  })
  return { token, expiresAt, phoneLast4 }
}

/** Recheck the checkout ticket against current payment and merchant state on every use. */
export async function requirePayPayer(req: NextRequest, id: string, tx: Client = db) {
  const token = req.cookies.get(payPayerCookie(id))?.value || ''
  if (!validToken(token)) throw new PayError('ابتدا شمارهٔ موبایل را تأیید کنید', 401, 'PAY_PHONE_REQUIRED')
  const row = await payment(id, tx, true)
  const expected = Buffer.from(row.payerSessionHash, 'hex'), actual = Buffer.from(digest(token), 'hex')
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual) || !row.payerVerifiedAt || !row.payerSessionExpiresAt || row.payerSessionExpiresAt <= new Date())
    throw new PayError('تأیید شماره منقضی شده است', 401, 'PAY_PHONE_REQUIRED')
  let phone = ''
  try { phone = decryptPanelCredential(row.payerPhoneCiphertext) } catch { throw new PayError('شمارهٔ تأییدشده در دسترس نیست', 503) }
  if (!normalizeMobile(phone)) throw new PayError('شمارهٔ تأییدشده در دسترس نیست', 503)
  return { phone }
}

export async function payPayerVerified(req: NextRequest, id: string, tx: Client = db) {
  try { await requirePayPayer(req, id, tx); return true }
  catch (error) { if (error instanceof PayError && error.status === 401) return false; throw error }
}
