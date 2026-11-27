import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { PayError } from '@/modules/billing/domain/pay'
import { payAudit, payContext, payTransaction, type PayActor } from './context'
import { assertMerchantAdministration, merchantAdminNote } from './merchant-admin/access'
import { mintTerminalKey } from './terminal-key-auth'

const projection = {
  id: true, label: true, prefix: true, version: true, createdAt: true, rotatedAt: true, revokedAt: true,
} satisfies Prisma.PayTerminalApiKeySelect
const invalid = () => new PayError('درخواست کلید پایانه معتبر نیست', 422, 'PAY_TERMINAL_KEY_BAD_INPUT')
const conflict = () => new PayError('وضعیت کلید تغییر کرده است. فهرست را دوباره بارگیری کنید.', 409, 'PAY_TERMINAL_KEY_CONFLICT')
const terminalMissing = () => new PayError('پایانه پیدا نشد', 404, 'PAY_TERMINAL_NOT_FOUND')

function requiredId(input: unknown) {
  if (typeof input !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(input)) throw invalid()
  return input
}

async function merchantForAdmin(actor: PayActor, merchantId: string, tx: Prisma.TransactionClient) {
  await payContext(actor, tx, 'mobocom-pay.manage')
  const merchant = await tx.payMerchant.findUnique({ where: { id: merchantId }, select: {
    id: true, userId: true, status: true, user: { select: { status: true, erasedAt: true } },
  } })
  if (!merchant) throw new PayError('پذیرنده پیدا نشد', 404)
  await assertMerchantAdministration(actor, merchant.userId, tx)
  return merchant
}

export function adminTerminalKeys(actor: PayActor, input: unknown) {
  const merchantId = requiredId(input)
  return payTransaction(async tx => {
    await merchantForAdmin(actor, merchantId, tx)
    const terminals = await tx.payTerminal.findMany({ where: { merchantId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: {
      id: true, name: true, active: true, apiKeys: {
        orderBy: [{ revokedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }, { id: 'desc' }], take: 50, select: projection,
      },
    } })
    return { terminals: terminals.map(({ apiKeys, ...terminal }) => ({ ...terminal, keys: apiKeys })) }
  })
}

export function changeAdminTerminalKey(actor: PayActor, method: 'POST' | 'PATCH', input: Record<string, unknown>) {
  const common = ['merchantId', 'terminalId', 'note', 'confirmed']
  const issuing = method === 'POST'
  const allowed = issuing ? [...common, 'label'] : [...common, 'id', 'version', 'action']
  if (input.confirmed !== true || Object.keys(input).some(key => !allowed.includes(key))) throw invalid()
  const merchantId = requiredId(input.merchantId), terminalId = requiredId(input.terminalId)
  const note = merchantAdminNote(input.note)
  const label = typeof input.label === 'string' ? input.label.trim() : ''
  const id = issuing ? randomUUID() : requiredId(input.id)
  const action = issuing ? 'issue' : input.action
  if (issuing ? !label || label.length > 80 || /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(label)
    : (action !== 'rotate' && action !== 'revoke') || !Number.isSafeInteger(input.version) || Number(input.version) < 1) throw invalid()
  return payTransaction(async tx => {
    const merchant = await merchantForAdmin(actor, merchantId, tx)
    const terminal = await tx.payTerminal.findFirst({ where: { id: terminalId, merchantId }, select: { active: true } })
    if (!terminal) throw terminalMissing()
    if (action !== 'revoke' && (!terminal.active || merchant.status !== 'ACTIVE' || merchant.user.status !== 'ACTIVE' || merchant.user.erasedAt)) {
      throw new PayError('پذیرنده و پایانه باید فعال باشند', 409, 'PAY_TERMINAL_INACTIVE')
    }
    const secret = action !== 'revoke' ? mintTerminalKey() : null
    if (issuing && secret) {
      if (await tx.payTerminalApiKey.count({ where: { terminalId, revokedAt: null } }) >= 20) {
        throw new PayError('حداکثر ۲۰ کلید فعال برای هر پایانه مجاز است', 409, 'PAY_TERMINAL_KEY_LIMIT')
      }
      await tx.payTerminalApiKey.create({ data: { id, terminalId, label, keyHash: secret.keyHash, prefix: secret.prefix }, select: { id: true } })
    } else {
      const previous = await tx.payTerminalApiKey.findFirst({ where: { id, terminalId }, select: { id: true } })
      if (!previous) throw new PayError('کلید این پایانه پیدا نشد', 404, 'PAY_TERMINAL_KEY_NOT_FOUND')
      const now = new Date()
      const claim = await tx.payTerminalApiKey.updateMany({ where: { id, terminalId, version: Number(input.version), revokedAt: null },
        data: { ...(secret ? { keyHash: secret.keyHash, prefix: secret.prefix, rotatedAt: now } : { revokedAt: now }), version: { increment: 1 } },
      })
      if (claim.count !== 1) throw conflict()
    }
    await payAudit(tx, actor, 'terminal-key.' + action, id, { merchantId, terminalId, note })
    const key = await tx.payTerminalApiKey.findUniqueOrThrow({ where: { id }, select: projection })
    return secret ? { key, token: secret.token } : { key }
  })
}
