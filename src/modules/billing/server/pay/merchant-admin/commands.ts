import { PayError } from '@/modules/billing/domain/pay'
import { randomBytes } from 'node:crypto'
import { httpsUrl, integer, rial, text } from '@/modules/billing/domain/pay-policy'
import { resolveCurrentUser } from '@/modules/identity/server/access'
import { userOpensSection } from '@/modules/account/server/section-access'
import { payAudit, payContext, payTransaction, type PayActor } from '../context'
import { merchantAdminNote } from './access'
import { botKeyHash } from '../bot/integrations'

export function manageMerchant(actor: PayActor, input: Record<string, unknown>) {
  const id = text(input.id, 60), note = merchantAdminNote(input.note), action = input.action
  if (!id || !Number.isSafeInteger(input.version) || Number(input.version) < 0 || typeof action !== 'string' || !['profile','status','terms','auto-access','terminal','revoke-bot'].includes(action)) throw new PayError('درخواست مدیریت معتبر نیست', 422)
  const allowed = ['id','version','note','action', ...(action === 'profile' ? ['name','website'] : action === 'status' ? ['status'] : action === 'terms' ? ['inherit','feeBearer','feeBps','flatFeeRial','feeCapRial'] : action === 'auto-access' ? ['allowed'] : action === 'terminal' ? ['terminalId','active','baleEnabled'] : ['terminalId','botVersion'])]
  if (Object.keys(input).some(key => !allowed.includes(key))) throw new PayError('فیلد مدیریت معتبر نیست', 422)
  return payTransaction(async tx => {
    await payContext(actor, tx, 'mobocom-pay.manage')
    const row = await tx.payMerchant.findUnique({ where: { id }, include: { terminals: { include: { botIntegration: true } } } })
    if (!row) throw new PayError('پذیرنده پیدا نشد', 404)
    if (row.userId === actor.id) throw new PayError('مدیریت پذیرندگی خودتان مجاز نیست', 403)
    if (row.version !== input.version) throw new PayError('اطلاعات پذیرنده تغییر کرده؛ دوباره بارگذاری کنید', 409)
    const data: { version: { increment: number }; name?: string; website?: string; status?: string; baleAllowed?: boolean; feeBearer?: string; feeBps?: number | null; flatFeeMinor?: bigint | null; feeCapMinor?: bigint | null } = { version: { increment: 1 } }
    if (action === 'profile') {
      data.name = text(input.name, 100); data.website = httpsUrl(input.website)
      if (!data.name) throw new PayError('نام کسب‌وکار لازم است', 422)
      if (row.terminals.some(t => new URL(t.returnUrl).origin !== new URL(data.website!).origin || t.botIntegration && new URL(t.botIntegration.callbackUrl).origin !== new URL(data.website!).origin)) throw new PayError('دامنهٔ جدید با مقصد پایانه‌ها سازگار نیست؛ دامنهٔ قرارداد موجود را حفظ کنید', 409)
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
    const terminal = ['terminal','revoke-bot'].includes(action) ? row.terminals.find(t => t.id === input.terminalId) : null
    if (['terminal','revoke-bot'].includes(action) && !terminal) throw new PayError('پایانهٔ پذیرنده پیدا نشد', 404)
    if (action === 'terminal' && (typeof input.active !== 'boolean' || typeof input.baleEnabled !== 'boolean' || input.baleEnabled && !row.baleAllowed)) throw new PayError('وضعیت یا مجوز روش خودکار معتبر نیست', 422)
    const claim = await tx.payMerchant.updateMany({ where: { id, version: Number(input.version), status: row.status }, data })
    if (claim.count !== 1) throw new PayError('پذیرنده هم‌زمان تغییر کرده است', 409)
    if (action === 'terminal' && terminal) {
      const changed = await tx.payTerminal.updateMany({ where: { id: terminal.id, merchantId: row.id, active: terminal.active, baleEnabled: terminal.baleEnabled }, data: { active: input.active as boolean, baleEnabled: input.baleEnabled as boolean } })
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
    await payAudit(tx, actor, 'merchant.admin-' + action, id, { note, version: Number(input.version) + 1, ...(action === 'status' ? { before: row.status, status: data.status } : {}), ...(terminal ? { terminalId: terminal.id } : {}) })
    return { saved: true, version: Number(input.version) + 1 }
  })
}
