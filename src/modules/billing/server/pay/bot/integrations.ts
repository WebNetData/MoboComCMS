import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { PayBotIntegration } from '@prisma/client'
import { PayError } from '@/modules/billing/domain/pay'
import { BOT_ACK_POLICIES, botCallbackUrl, type PayBotIntegrationView } from '@/modules/billing/domain/pay-bot'
import { encryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import { merchantFor, payAudit, payTransaction, type PayActor } from '../context'
import { db } from '@/platform/database/prisma'
import { parseRoutingRules } from '@/modules/billing/domain/pay-routing'

export const botKeyHash = (value: string) => createHash('sha256').update(value).digest('hex')
export const integrationView = (row: PayBotIntegration): PayBotIntegrationView => ({
  id: row.id, terminalId: row.terminalId, active: row.active, version: row.version,
  callbackUrl: row.callbackUrl, ackPolicy: row.ackPolicy, responseMode: row.responseMode,
  keyPrefix: row.keyPrefix, hasCallbackToken: !!row.callbackTokenCiphertext, routingRules: parseRoutingRules(JSON.parse(row.routingRules)), routingVersion: row.routingVersion,
})

export async function botIntegrations(actor: PayActor) {
  return payTransaction(async tx => {
    const merchant = await merchantFor(actor, tx)
    return (await tx.payBotIntegration.findMany({ where: { terminal: { merchantId: merchant.id, archivedAt: null } }, orderBy: { createdAt: 'desc' } })).map(integrationView)
  })
}

/** Only the merchant's authenticated browser configures destinations/secrets. */
export async function saveBotIntegration(actor: PayActor, input: Record<string, unknown>) {
  if (actor.machine) throw new PayError('تنظیم اتصال فقط از حساب پذیرنده انجام می‌شود', 403)
  if (Object.keys(input).some(key => !['terminalId','version','callbackUrl','callbackToken','ackPolicy','responseMode','active','rotateKey'].includes(key))) throw new PayError('تنظیم اتصال معتبر نیست')
  if (typeof input.terminalId !== 'string' || !Number.isSafeInteger(input.version) || Number(input.version) < 0 || typeof input.active !== 'boolean' || !['URL','LINKS'].includes(String(input.responseMode)) || ![...BOT_ACK_POLICIES, 'UNCONFIGURED'].includes(String(input.ackPolicy))) throw new PayError('تنظیم اتصال معتبر نیست')
  if (input.rotateKey !== undefined && typeof input.rotateKey !== 'boolean') throw new PayError('درخواست تغییر کلید معتبر نیست')
  if (!/^[a-f0-9]{64}$/i.test(process.env.PANEL_CREDENTIAL_KEY || '')) throw new PayError('کلید رمزگذاری سرور برای اتصال ربات آماده نیست', 503)
  const callbackUrl = botCallbackUrl(input.callbackUrl)
  if (input.active && input.ackPolicy === 'UNCONFIGURED') throw new PayError('ابتدا معیار پاسخ موفق ربات را انتخاب کنید')
  if (input.callbackToken !== undefined && (typeof input.callbackToken !== 'string' || input.callbackToken.length > 512 || /[\r\n\u0000]/.test(input.callbackToken))) throw new PayError('کلید تأیید ربات معتبر نیست')
  return payTransaction(async tx => {
    const merchant = await merchantFor(actor, tx, true)
    const terminal = await tx.payTerminal.findFirst({ where: { id: String(input.terminalId), merchantId: merchant.id, archivedAt: null } })
    if (!terminal) throw new PayError('پایانه پیدا نشد', 404)
    if (!['WEBSITE', 'BOT'].includes(terminal.channelType) || terminal.channelType==='WEBSITE'&&!merchant.website) throw new PayError('اتصال به پایانهٔ وب‌سایت یا ربات نیاز دارد')
    // A Telegram merchant may use a hosted bot panel on another public origin.
    // Browser-only configuration, exact HTTPS path and pinned outbound validation
    // still apply; website terminals keep their original registered-origin rule.
    if (terminal.channelType==='WEBSITE' && new URL(callbackUrl).origin !== new URL(merchant.website).origin) throw new PayError('API وب‌سایت باید روی دامنهٔ ثبت‌شدهٔ پذیرنده باشد')
    const previous = await tx.payBotIntegration.findUnique({ where: { terminalId: terminal.id } })
    if ((previous?.version || 0) !== input.version) throw new PayError('اتصال تغییر کرده است؛ صفحه را تازه کنید', 409)
    const plain = String(input.callbackToken || '')
    const ciphertext = plain ? encryptPanelCredential(plain) : previous?.callbackTokenCiphertext || ''
    if (!ciphertext.startsWith('encv1:')) throw new PayError('کلید جداگانهٔ API پرداخت ربات لازم است')
    const token = !previous || input.rotateKey === true ? 'mcpbot_' + randomBytes(32).toString('base64url') : ''
    const data = { callbackUrl, callbackTokenCiphertext: ciphertext, ackPolicy: String(input.ackPolicy), responseMode: String(input.responseMode), active: input.active as boolean, ...(token ? { keyHash: botKeyHash(token), keyPrefix: token.slice(0, 15) } : {}) }
    let row: PayBotIntegration
    if (previous) {
      const claim = await tx.payBotIntegration.updateMany({ where: { id: previous.id, version: previous.version }, data: { ...data, version: { increment: 1 } } })
      if (!claim.count) throw new PayError('اتصال هم‌زمان تغییر کرده است', 409)
      row = await tx.payBotIntegration.findUniqueOrThrow({ where: { id: previous.id } })
    } else row = await tx.payBotIntegration.create({ data: { ...data, id: randomUUID(), terminalId: terminal.id, keyHash: botKeyHash(token), keyPrefix: token.slice(0, 15) } })
    await payAudit(tx, actor, 'bot.configure', row.id, { terminalId: terminal.id, active: row.active, ackPolicy: row.ackPolicy, rotated: !!token, version: row.version })
    return { integration: integrationView(row), ...(token ? { token } : {}) }
  })
}

/** Lookup is followed by transaction-bound reauthorization; token plaintext is never stored. */
export async function resolveBotIntegration(id: string, token: unknown) {
  if (typeof token !== 'string' || !/^mcpbot_[A-Za-z0-9_-]{43}$/.test(token)) throw new PayError('کلید اتصال معتبر نیست', 401)
  const row = await db.payBotIntegration.findUnique({ where: { keyHash: botKeyHash(token) }, include: { terminal: { include: { merchant: { include: { user: true } } } } } })
  if (!row || row.id !== id || !row.active) throw new PayError('کلید اتصال معتبر نیست', 401)
  return row
}
