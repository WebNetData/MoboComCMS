import { parseChannelDestination, profileOriginCompatible } from '@/modules/billing/domain/pay-channels'
import { PayError } from '@/modules/billing/domain/pay'
import { randomBytes, randomUUID } from 'node:crypto'
import { httpsUrl, integer, rial, text } from '@/modules/billing/domain/pay-policy'
import { resolveCurrentUser } from '@/modules/identity/server/access'
import { userOpensSection } from '@/modules/account/server/section-access'
import { payAudit, payContext, payTransaction, type PayActor } from '../context'
import { assertMerchantAdministration, merchantAdminNote } from './access'
import { botKeyHash } from '../bot/integrations'

const fields = {
  profile: ['name','website'], status: ['status'], terms: ['inherit','feeBearer','feeBps','flatFeeRial','feeCapRial'],
  'auto-access': ['allowed'], 'credit-mode': ['creditCurrency'], terminal: ['terminalId','active','baleEnabled'],
  'revoke-bot': ['terminalId','botVersion'], 'terminal-add': ['name','channelType','channelUrl','returnUrl'],
  'terminal-edit': ['terminalId','name','channelType','channelUrl','returnUrl'], 'terminal-delete': ['terminalId'],
} as const

export function manageMerchant(actor: PayActor, input: Record<string, unknown>) {
  const id = text(input.id, 60), note = merchantAdminNote(input.note), action = input.action
  if (!id || !Number.isSafeInteger(input.version) || Number(input.version) < 0 || typeof action !== 'string' || !Object.hasOwn(fields, action)) throw new PayError('درخواست مدیریت معتبر نیست', 422)
  const allowed = ['id','version','note','action', ...fields[action as keyof typeof fields]]
  if (Object.keys(input).some(key => !allowed.includes(key))) throw new PayError('فیلد مدیریت معتبر نیست', 422)
  return payTransaction(async tx => {
    await payContext(actor, tx, 'mobocom-pay.manage')
    const row = await tx.payMerchant.findUnique({ where: { id }, include: { terminals: { where: { archivedAt: null }, include: { botIntegration: true, webhookEndpoint: { select: { id: true } } } } } })
    if (!row) throw new PayError('پذیرنده پیدا نشد', 404)
    await assertMerchantAdministration(actor, row.userId, tx)
    if (row.version !== input.version) throw new PayError('اطلاعات پذیرنده تغییر کرده؛ دوباره بارگذاری کنید', 409)
    const data: { version: { increment: number }; name?: string; website?: string; creditCurrency?: string; status?: string; baleAllowed?: boolean; feeBearer?: string; feeBps?: number | null; flatFeeMinor?: bigint | null; feeCapMinor?: bigint | null } = { version: { increment: 1 } }
    if (action === 'profile') {
      data.name = text(input.name, 100); data.website = input.website === '' || input.website === undefined ? '' : httpsUrl(input.website)
      if (!data.name) throw new PayError('نام کسب‌وکار لازم است', 422)
      if (!profileOriginCompatible(data.website, row.terminals)) throw new PayError('دامنهٔ جدید با مقصد پایانه‌ها سازگار نیست؛ دامنهٔ قرارداد موجود را حفظ کنید', 409)
    } else if (action === 'credit-mode') {
      if (!['IRR','USDT'].includes(String(input.creditCurrency))) throw new PayError('واحد اعتبار معتبر نیست', 422)
      data.creditCurrency = String(input.creditCurrency)
    } else if (action === 'status') {
      if (input.status !== 'ACTIVE' && input.status !== 'SUSPENDED') throw new PayError('وضعیت معتبر نیست', 422)
      if (input.status === 'ACTIVE' && (!await resolveCurrentUser(row.userId, Date.now(), tx) || !await userOpensSection('mobocom-pay', row.userId))) throw new PayError('حساب پذیرنده فعال و مجاز نیست', 409)
      data.status = input.status
    } else if (action === 'auto-access') {
      if (typeof input.allowed !== 'boolean') throw new PayError('مجوز معتبر نیست', 422)
      data.baleAllowed = input.allowed
    } else if (action === 'terms') {
      if (typeof input.inherit !== 'boolean') throw new PayError('نوع قرارداد معتبر نیست', 422)
      if (input.inherit) Object.assign(data, { feeBearer: 'MERCHANT', feeBps: null, flatFeeMinor: null, feeCapMinor: null })
      else {
        if (input.feeBearer !== 'CUSTOMER' && input.feeBearer !== 'MERCHANT') throw new PayError('پرداخت‌کنندهٔ کارمزد معتبر نیست', 422)
        Object.assign(data, { feeBearer: input.feeBearer, feeBps: integer(input.feeBps, 0, 3000), flatFeeMinor: rial(input.flatFeeRial, true), feeCapMinor: rial(input.feeCapRial, true) })
      }
    }
    const needsTerminal = ['terminal','terminal-edit','terminal-delete','revoke-bot'].includes(action)
    const terminal = needsTerminal ? row.terminals.find(t => t.id === input.terminalId) : null
    if (needsTerminal && !terminal) throw new PayError('پایانهٔ پذیرنده پیدا نشد', 404)
    if (action === 'terminal' && (typeof input.active !== 'boolean' || typeof input.baleEnabled !== 'boolean' || input.baleEnabled && !row.baleAllowed)) throw new PayError('وضعیت یا مجوز روش خودکار معتبر نیست', 422)
    const claim = await tx.payMerchant.updateMany({ where: { id, version: Number(input.version), status: row.status }, data })
    if (claim.count !== 1) throw new PayError('پذیرنده هم‌زمان تغییر کرده است', 409)
    let terminalId = terminal?.id
    if (action === 'terminal-add' || action === 'terminal-edit') {
      const name = text(input.name, 100)
      const destination = parseChannelDestination(input, row.website)
      if (!name) throw new PayError('نام پایانه لازم است', 422)
      if (terminal) {
        if ((terminal.botIntegration || terminal.webhookEndpoint) && destination.channelType !== terminal.channelType) throw new PayError('برای تغییر نوع پایانهٔ دارای اتصال، پایانهٔ جدید بسازید', 409)
        const changed = await tx.payTerminal.updateMany({ where: { id: terminal.id, merchantId: row.id, archivedAt: null }, data: { name, ...destination } })
        if (changed.count !== 1) throw new PayError('پایانه هم‌زمان تغییر کرده است', 409)
      } else {
        if (row.terminals.length >= 20) throw new PayError('حداکثر ۲۰ پایانه قابل ثبت است', 422)
        terminalId = randomUUID()
        await tx.payTerminal.create({ data: { id: terminalId, merchantId: row.id, name, ...destination, active: false } })
      }
    } else if (action === 'terminal-delete' && terminal) {
      if (await tx.payPayment.count({ where: { terminalId: terminal.id, OR: [
        { status: 'PENDING', OR: [{ expiresAt: { gt: new Date() } }, { invoice: { receipts: { some: { status: 'PENDING' } } } }] },
        { botDelivery: { status: { in: ['QUEUED', 'SENDING'] } } },
        { webhookDelivery: { status: { in: ['PENDING', 'SENDING', 'RETRY'] } } },
      ] } })) throw new PayError('ابتدا پرداخت‌ها، رسیدها و ارسال‌های باز این پایانه را بررسی کنید', 409)
      const changed = await tx.payTerminal.updateMany({ where: { id: terminal.id, merchantId: row.id, archivedAt: null }, data: { archivedAt: new Date(), active: false, baleEnabled: false } })
      if (changed.count !== 1) throw new PayError('پایانه هم‌زمان تغییر کرده است', 409)
    } else if (action === 'terminal' && terminal) {
      const changed = await tx.payTerminal.updateMany({ where: { id: terminal.id, merchantId: row.id, archivedAt: null, active: terminal.active, baleEnabled: terminal.baleEnabled }, data: { active: input.active as boolean, baleEnabled: input.baleEnabled as boolean } })
      if (changed.count !== 1) throw new PayError('پایانه هم‌زمان تغییر کرده است', 409)
    } else if (action === 'revoke-bot' && terminal) {
      const bot = terminal.botIntegration
      if (!bot || !bot.active || bot.version !== input.botVersion) throw new PayError('نسخه یا وضعیت اتصال تغییر کرده است', 409)
      // Permanently invalidate the old creation capability, including after owner reactivation.
      // The replacement is deliberately never returned: the merchant must rotate to obtain a new key.
      const revoked = 'mcpbot_' + randomBytes(32).toString('base64url')
      const changed = await tx.payBotIntegration.updateMany({ where: { id: bot.id, version: bot.version, active: true }, data: { active: false, keyHash: botKeyHash(revoked), keyPrefix: revoked.slice(0, 15), version: { increment: 1 } } })
      if (changed.count !== 1) throw new PayError('اتصال هم‌زمان تغییر کرده است', 409)
    }
    await payAudit(tx, actor, 'merchant.admin-' + action, id, { note, version: Number(input.version) + 1, ...(action === 'status' ? { before: row.status, status: data.status } : {}), ...(action === 'credit-mode' ? { beforeCurrency: row.creditCurrency, creditCurrency: data.creditCurrency } : {}), ...(terminalId ? { terminalId } : {}) })
    return { saved: true, version: Number(input.version) + 1 }
  })
}
