import type { Prisma } from '@prisma/client'
import type { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { isModuleEnabled } from '@/extensions/server/modules'
import { requirePerm, requireUser } from '@/modules/identity/server/access'
import { globalAuthenticationDenied } from '@/modules/identity/server/authentication-restrictions'
import { resolveApiCaller } from '@/modules/public-api/server/api-keys'
import { isPublicApiEnabled } from '@/modules/public-api/server/availability'
import { userOpensSection } from '@/modules/account/server/section-access'
import { auditAdminStrict, auditSystemStrict } from '@/platform/audit/server'
import { PayError } from '@/modules/billing/domain/pay'
import { paySettings } from './settings'
import { assertTerminalKey, resolveTerminalKey, terminalBearer, type TerminalKeyAuthority } from './terminal-key-auth'

export type PayActor = { id: number; email: string; req: NextRequest; machine?: boolean; keyId?: number; botIntegrationId?: string; botKeyHash?: string; terminalKey?: TerminalKeyAuthority }

export function isPaySerializationConflict(error: unknown) {
  const { code, meta } = (error ?? {}) as { code?: string; meta?: { code?: string } }
  // Prisma wraps SQLSTATE from raw row locks as P2010 instead of P2034.
  return code === 'P2034' || code === 'P2010' && (meta?.code === '40001' || meta?.code === '40P01')
}

export function assertPayTerminal(actor: PayActor, terminalId: string) {
  if (actor.terminalKey && actor.terminalKey.terminalId !== terminalId) throw new PayError('پایانه پیدا نشد', 404, 'PAY_TERMINAL_NOT_FOUND')
}
export async function payTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(work, { isolationLevel: 'Serializable', timeout: 15000 })
    } catch (error) {
      if (attempt >= 3 || (!isPaySerializationConflict(error) && (error as { code?: string } | null)?.code !== 'P2002')) throw error
    }
  }
}
export async function payContext(actor: PayActor, tx: Prisma.TransactionClient, permission?: string) {
  if (!(await isModuleEnabled('mobocom-pay', tx)))
    throw new PayError('درگاه غیرفعال است', 404, 'PAY_DISABLED')
  const user = await tx.user.findUnique({ where: { id: actor.id } })
  if (!user || user.status !== 'ACTIVE' || (await globalAuthenticationDenied(actor.id, new Date(), tx)))
    throw new PayError('حساب در دسترس نیست', 403)
  if (permission && !(await requirePerm(actor.req, permission, tx)))
    throw new PayError('اجازهٔ انجام این کار را ندارید', 403)
  if (!actor.machine && !(await requireUser(actor.req, tx))) throw new PayError('نشست معتبر نیست', 401)
  if (actor.machine) {
    if (actor.terminalKey) {
      await assertTerminalKey(tx, actor.id, actor.terminalKey)
    } else if (actor.botIntegrationId) {
      const integration = await tx.payBotIntegration.findUnique({ where: { id: actor.botIntegrationId }, include: { terminal: { include: { merchant: true } } } })
      if (!integration?.active || integration.keyHash !== actor.botKeyHash || integration.terminal.merchant.userId !== actor.id || !integration.terminal.active || integration.terminal.merchant.status !== 'ACTIVE' || (await tx.setting.findUnique({ where: { key: 'publicApiEnabled' } }))?.value !== 'true')
        throw new PayError('اتصال ربات غیرفعال یا کلید آن تغییر کرده است', 401)
    } else {
      const key = await tx.apiKey.findUnique({ where: { id: actor.keyId } })
      if (
        !key?.active ||
        key.userId !== actor.id ||
        (await tx.setting.findUnique({ where: { key: 'publicApiEnabled' } }))?.value !== 'true'
      )
        throw new PayError('کلید API غیرفعال است', 401)
    }
  }
  const settings = await paySettings.read(tx)
  return { user, settings }
}
export async function merchantFor(actor: PayActor, tx: Prisma.TransactionClient, active = false) {
  await payContext(actor, tx)
  const merchant = await tx.payMerchant.findUnique({ where: { userId: actor.id } })
  if (!merchant || merchant.status !== 'ACTIVE')
    throw new PayError('پذیرندهٔ فعال لازم است', 403, 'PAY_MERCHANT_INACTIVE')
  // Every merchant command participates in the same fence as suspension/activation.
  const claimed = await tx.payMerchant.updateMany({
    where: { id: merchant.id, status: merchant.status, version: merchant.version },
    data: { version: { increment: 1 } },
  })
  if (claimed.count !== 1) throw new PayError('وضعیت پذیرنده تغییر کرده؛ دوباره تلاش کنید', 409)
  return merchant
}
export async function payActor(req: NextRequest, machine = false): Promise<PayActor> {
  if (!(await isModuleEnabled('mobocom-pay'))) throw new PayError('درگاه غیرفعال است', 404, 'PAY_DISABLED')
  let actor: PayActor
  if (machine) {
    if (!/^Bearer [^\s]+$/i.test(req.headers.get('authorization') || '') || !(await isPublicApiEnabled()))
      throw new PayError('کلید Bearer لازم است', 401)
    const terminalToken = terminalBearer(req)
    if (terminalToken) {
      if (!req.nextUrl.pathname.startsWith('/api/v2/pay/')) throw new PayError('کلید پایانه در این مسیر معتبر نیست', 401, 'PAY_TERMINAL_KEY_INVALID')
      const { user, terminalKey } = await resolveTerminalKey(req, terminalToken)
      actor = { id: user.id, email: user.email, req, machine: true, terminalKey }
    } else {
      const caller = await resolveApiCaller(req)
      if (!caller?.keyId) throw new PayError('کلید API معتبر نیست', 401)
      actor = { id: caller.userId, email: caller.email, req, machine: true, keyId: caller.keyId }
    }
  } else {
    const user = await requireUser(req)
    if (!user) throw new PayError('ابتدا وارد شوید', 401)
    actor = { id: user.id, email: user.email, req }
  }
  if (!(await userOpensSection('mobocom-pay', actor.id))) throw new PayError('دسترسی این بخش محدود است', 403)
  return actor
}
export function payAudit(
  tx: Prisma.TransactionClient,
  actor: Pick<PayActor, 'id' | 'email'> & { req?: NextRequest },
  action: string,
  id: string,
  metadata: Record<string, unknown> = {},
) {
  if (actor.req)
    return auditAdminStrict(
      {
        req: actor.req,
        actor,
        action: 'mobocom-pay.' + action,
        targetType: 'mobocom-pay',
        targetId: id,
        metadata,
      },
      tx,
    )
  return auditSystemStrict(
    { actor, action: 'mobocom-pay.' + action, targetType: 'mobocom-pay', targetId: id, metadata },
    tx,
  )
}
