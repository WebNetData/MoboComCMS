import { randomBytes, randomUUID } from 'node:crypto'
import { PayError } from '@/modules/billing/domain/pay'
import { webhookUrl, type PayWebhookOverview, type PayWebhookStatus } from '@/modules/billing/domain/pay-webhooks'
import { encryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import { enqueue } from '@/modules/operations/server/enqueue'
import { merchantFor, payAudit, payContext, payTransaction, type PayActor } from '../context'

const own = (input: Record<string, unknown>, fields: string[]) => Object.keys(input).every(key => fields.includes(key))
const uuid = (v: unknown) => typeof v === 'string' && /^[a-f0-9-]{36}$/.test(v)
const version = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0
const endpointView = (row: { id: string; terminalId: string; terminal: { name: string }; url: string; active: boolean; version: number; secretCiphertext: string; updatedAt: Date }) => ({ id: row.id, terminalId: row.terminalId, terminalName: row.terminal.name, url: row.url, active: row.active, version: row.version, hasSecret: Boolean(row.secretCiphertext), updatedAt: row.updatedAt.toISOString() })

export async function webhookOverview(actor: PayActor, params: URLSearchParams, admin = false): Promise<PayWebhookOverview> {
  if (actor.machine) throw new PayError('مدیریت وبهوک فقط از پنل انجام می‌شود', 403)
  return payTransaction(async tx => {
    const merchant = admin ? null : await merchantFor(actor, tx, true)
    if (admin) await payContext(actor, tx, 'mobocom-pay.manage')
    const baseWhere = merchant ? { payment: { merchantId: merchant.id } } : {}
    const filter = params.get('status') || ''
    if (filter && !['PENDING','SENDING','RETRY','DELIVERED','FAILED','PAUSED'].includes(filter)) throw new PayError('وضعیت ارسال معتبر نیست')
    const where = { ...baseWhere, ...(filter ? { status: filter } : {}) }
    const endpointWhere = { terminal: { archivedAt: null, ...(merchant ? { merchantId: merchant.id } : {}) } }
    const page = Math.max(1, Math.min(10000, Math.trunc(Number(params.get('page'))) || 1))
    const endpointPage = admin ? Math.max(1, Math.min(10000, Math.trunc(Number(params.get('endpointPage'))) || 1)) : 1
    const [endpoints, rows, total, pending, delivered, attention, endpointTotal] = await Promise.all([
      tx.payWebhookEndpoint.findMany({ where: endpointWhere, include: { terminal: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: admin ? (endpointPage - 1) * 25 : 0, take: admin ? 25 : 100 }),
      tx.payWebhookDelivery.findMany({ where, include: { endpoint: { include: { terminal: true } }, payment: { include: { terminal: true } }, history: { orderBy: { number: 'desc' }, take: 20 } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * 25, take: 25 }),
      tx.payWebhookDelivery.count({ where }),
      tx.payWebhookDelivery.count({ where: { ...baseWhere, status: { in: ['PENDING','SENDING','RETRY'] } } }),
      tx.payWebhookDelivery.count({ where: { ...baseWhere, status: 'DELIVERED' } }),
      tx.payWebhookDelivery.count({ where: { ...baseWhere, status: { in: ['FAILED','PAUSED'] } } }),
      tx.payWebhookEndpoint.count({ where: endpointWhere }),
    ])
    return { endpoints: endpoints.map(endpointView), deliveryEndpoints: [...new Map(rows.map(r => [r.endpoint.id, endpointView(r.endpoint)])).values()], endpointPage, endpointPages: Math.max(1, Math.ceil(endpointTotal / (admin ? 25 : 100))), page, pages: Math.max(1, Math.ceil(total / 25)), total, counts: { pending, delivered, attention }, deliveries: rows.map(row => ({ id: row.id, paymentId: row.paymentId, terminalId: row.payment.terminalId, externalId: row.payment.externalId, terminalName: row.payment.terminal.name, status: row.status as PayWebhookStatus, attempts: row.attempts, version: row.version, configVersion: row.configVersion, url: row.url, lastCode: row.lastCode, httpStatus: row.httpStatus, nextAttemptAt: row.nextAttemptAt.toISOString(), deliveredAt: row.deliveredAt?.toISOString() || null, createdAt: row.createdAt.toISOString(), history: row.history.map(a => ({ id: a.id, number: a.number, url: a.url, configVersion: a.configVersion, status: a.status, code: a.code, httpStatus: a.httpStatus, startedAt: a.startedAt.toISOString(), finishedAt: a.finishedAt?.toISOString() || null })) })) }
  })
}

/** Secret is returned only after creation/explicit rotation; never from reads or logs. */
export async function saveWebhookEndpoint(actor: PayActor, input: Record<string, unknown>, admin = false) {
  if (actor.machine) throw new PayError('مدیریت وبهوک فقط از پنل انجام می‌شود', 403)
  if (admin) {
    if (!own(input, ['id','version','active']) || !uuid(input.id) || !version(input.version) || input.active !== false) throw new PayError('درخواست توقف معتبر نیست')
    return payTransaction(async tx => {
      await payContext(actor, tx, 'mobocom-pay.manage')
      const current = await tx.payWebhookEndpoint.findUnique({ where: { id: input.id as string }, include: { terminal: true } })
      if (!current) throw new PayError('وبهوک پیدا نشد', 404)
      const changed = await tx.payWebhookEndpoint.updateMany({ where: { id: current.id, version: Number(input.version) }, data: { active: false, version: { increment: 1 } } })
      if (!changed.count) throw new PayError('وبهوک تغییر کرده است', 409)
      await payAudit(tx, actor, 'webhook.admin-pause', current.id, { terminalId: current.terminalId })
      return { endpoint: endpointView({ ...current, active: false, version: current.version + 1 }) }
    })
  }
  if (!own(input, ['terminalId','url','active','version','rotateSecret']) || !uuid(input.terminalId) || typeof input.active !== 'boolean' || input.rotateSecret !== undefined && input.rotateSecret !== true || input.version !== undefined && !version(input.version)) throw new PayError('تنظیمات وبهوک معتبر نیست')
  const url = webhookUrl(input.url)
  return payTransaction(async tx => {
    const merchant = await merchantFor(actor, tx, true)
    const terminal = await tx.payTerminal.findFirst({ where: { id: input.terminalId as string, merchantId: merchant.id, archivedAt: null } })
    if (!terminal) throw new PayError('پایانه پیدا نشد', 404)
    if (input.active && !terminal.active) throw new PayError('ابتدا پایانه را فعال کنید', 409)
    const current = await tx.payWebhookEndpoint.findUnique({ where: { terminalId: terminal.id } })
    if (current && (input.version === undefined || Number(input.version) !== current.version) || !current && input.version !== undefined) throw new PayError('نسخهٔ وبهوک تغییر کرده است', 409)
    const secret = !current || input.rotateSecret === true ? randomBytes(32).toString('base64url') : undefined
    const ciphertext = secret ? encryptPanelCredential(secret) : current!.secretCiphertext
    if (!ciphertext.startsWith('encv1:')) throw new PayError('کلید رمزنگاری سرور آماده نیست', 503)
    const id = current?.id || randomUUID()
    if (current) {
      const changed = await tx.payWebhookEndpoint.updateMany({ where: { id, version: current.version }, data: { url, active: input.active as boolean, secretCiphertext: ciphertext, version: { increment: 1 } } })
      if (!changed.count) throw new PayError('وبهوک هم‌زمان تغییر کرده است', 409)
    } else await tx.payWebhookEndpoint.create({ data: { id, terminalId: terminal.id, url, active: input.active as boolean, secretCiphertext: ciphertext } })
    const row = await tx.payWebhookEndpoint.findUniqueOrThrow({ where: { id }, include: { terminal: true } })
    await payAudit(tx, actor, current ? 'webhook.update' : 'webhook.create', id, { terminalId: terminal.id, active: row.active, rotated: Boolean(secret) })
    return { endpoint: endpointView(row), ...(secret ? { secret } : {}) }
  })
}

export async function recoverWebhookDelivery(actor: PayActor, input: Record<string, unknown>, admin = false) {
  if (actor.machine) throw new PayError('بازارسال فقط از پنل انجام می‌شود', 403)
  if (!own(input, ['id','version','configVersion','action','ackReplay']) || !uuid(input.id) || !version(input.version) || !version(input.configVersion) || Number(input.configVersion) < 1 || input.action !== 'redeliver' || input.ackReplay !== true) throw new PayError('نسخهٔ ارسال و تنظیمات و تأیید ارسال دوباره لازم است')
  return payTransaction(async tx => {
    const merchant = admin ? null : await merchantFor(actor, tx, true)
    if (admin) await payContext(actor, tx, 'mobocom-pay.manage')
    const row = await tx.payWebhookDelivery.findFirst({ where: { id: input.id as string, ...(merchant ? { payment: { merchantId: merchant.id } } : {}) }, include: { endpoint: true, payment: { include: { terminal: true, merchant: true } } } })
    if (!row) throw new PayError('ارسال پیدا نشد', 404)
    if (row.version !== Number(input.version) || row.status === 'SENDING' || row.status === 'PENDING' || row.status === 'RETRY') throw new PayError('وضعیت ارسال تغییر کرده یا هنوز در جریان است', 409)
    if (row.endpoint.version !== Number(input.configVersion)) throw new PayError('تنظیمات مقصد تغییر کرده است؛ پیش از ارسال دوباره صفحه را تازه کنید', 409)
    if (row.payment.status !== 'PAID' || !row.payment.walletTxId || !row.endpoint.active || !row.payment.terminal.active || row.payment.merchant.status !== 'ACTIVE') throw new PayError('ابتدا پایانه و وبهوک را فعال کنید', 409)
    const changed = await tx.payWebhookDelivery.updateMany({ where: { id: row.id, version: row.version, status: row.status }, data: { status: 'PENDING', version: { increment: 1 }, configVersion: row.endpoint.version, url: row.endpoint.url, secretCiphertext: row.endpoint.secretCiphertext, cycleAttempts: 0, attemptToken: '', leaseExpiresAt: null, nextAttemptAt: new Date(), lastCode: 'EXPLICIT_REDELIVERY', httpStatus: null, deliveredAt: null } })
    if (!changed.count) throw new PayError('ارسال هم‌زمان تغییر کرده است', 409)
    await enqueue('pay.webhook-delivery', { deliveryId: row.id }, { dedupeKey: 'pay-webhook-manual:' + row.id + ':' + (row.version + 1) }, tx)
    await payAudit(tx, actor, 'webhook.redeliver', row.id, { paymentId: row.paymentId, before: row.status, replayAcknowledged: true })
    return { saved: true }
  })
}
