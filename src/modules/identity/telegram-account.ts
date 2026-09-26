import { randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'
import { db } from '@/platform/database/prisma'
import { minorToNumber, toMinor } from '@/shared/money'
import type { TelegramUser } from '@/modules/notifications/server/telegram'

export type TelegramAccountResult =
  | { ok: true; userId: number; merged: boolean }
  | { ok: false; code: 'NOT_FOUND' | 'DISABLED' | 'TARGET_TELEGRAM_CONFLICT' | 'TELEGRAM_ALREADY_CLAIMED' | 'EMAIL_EXISTS' | 'UNSAFE_SOURCE'; message: string }

function displayName(tg: TelegramUser) {
  return [tg.first_name, tg.last_name].filter(Boolean).join(' ').trim() || tg.username || `Telegram ${tg.id}`
}

/**
 * Accounts created automatically from Telegram have an intentionally
 * unreachable local email and a random password. They are safe to merge/claim
 * because the customer never had separate website credentials for them.
 */
export function isTelegramPlaceholderEmail(email: string, telegramId?: string | null) {
  const escapedId = String(telegramId || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const idPart = escapedId ? escapedId : '\\d+'
  return new RegExp(`^tg${idPart}\\.[0-9a-f]{16}@telegram\\.local$`, 'i').test(String(email || ''))
}

export function isTelegramPlaceholderUser(user: { email: string; telegramId?: string | null; role?: string; roleId?: number | null }) {
  return user.role !== 'ADMIN' && user.roleId == null && isTelegramPlaceholderEmail(user.email, user.telegramId)
}

/** Find the canonical user for a Telegram Mini App login, creating only a provisional account when needed. */
export async function userForTelegram(tg: TelegramUser) {
  const telegramId = String(tg.id)
  const name = displayName(tg)

  let user = await db.user.findUnique({ where: { telegramId }, include: { roleRef: true } })
  if (!user) {
    user = await db.user.create({
      data: {
        email: `tg${telegramId}.${randomBytes(8).toString('hex')}@telegram.local`,
        passwordHash: await bcrypt.hash(randomBytes(24).toString('base64url'), 10),
        name,
        telegramId,
        telegramUsername: tg.username || '',
        telegramName: name,
        telegramPhoto: tg.photo_url || '',
        telegramLinkedAt: new Date(),
        lastLoginAt: new Date(),
      },
      include: { roleRef: true },
    })
  } else {
    user = await db.user.update({
      where: { id: user.id },
      data: {
        telegramUsername: tg.username || '',
        telegramName: name,
        telegramPhoto: tg.photo_url || user.telegramPhoto,
        lastLoginAt: new Date(),
      },
      include: { roleRef: true },
    })
  }

  return user.status === 'ACTIVE' ? user : null
}

async function mergeWallets(tx: any, source: { id: number; walletBalance: number }, target: { id: number; walletBalance: number }) {
  const [sourceAccounts, targetAccounts] = await Promise.all([
    tx.walletAccount.findMany({ where: { userId: source.id } }),
    tx.walletAccount.findMany({ where: { userId: target.id } }),
  ])
  const targetByCurrency = new Map<string, { id: number; balanceMinor: bigint }>(targetAccounts.map((account: any) => [account.currency, account]))
  const sourceHasUsd = sourceAccounts.some((account: any) => account.currency === 'USD')
  const targetHasUsd = targetAccounts.some((account: any) => account.currency === 'USD')

  // Bridge legacy balances only when no scoped USD wallet exists for that side.
  const sourceLegacyUsd = sourceHasUsd ? 0n : toMinor(source.walletBalance || 0, 'USD')
  const targetLegacyUsd = targetHasUsd ? 0n : toMinor(target.walletBalance || 0, 'USD')

  // If either side already has scoped wallet accounts, promote the target's
  // old USD mirror first so adding a non-USD source account cannot hide it.
  if (!targetHasUsd && targetLegacyUsd !== 0n && (sourceAccounts.length > 0 || sourceLegacyUsd !== 0n)) {
    const created = await tx.walletAccount.create({ data: { userId: target.id, currency: 'USD', balanceMinor: targetLegacyUsd } })
    targetByCurrency.set('USD', created)
  }

  for (const account of sourceAccounts) {
    const existing = targetByCurrency.get(account.currency)
    if (existing) {
      const updated = await tx.walletAccount.update({
        where: { id: existing.id },
        data: { balanceMinor: { increment: account.balanceMinor } },
      })
      targetByCurrency.set(account.currency, updated)
    } else {
      const initial = account.balanceMinor
      const created = await tx.walletAccount.create({ data: { userId: target.id, currency: account.currency, balanceMinor: initial } })
      targetByCurrency.set(account.currency, created)
    }
  }

  if (sourceLegacyUsd !== 0n) {
    const existing = targetByCurrency.get('USD')
    if (existing) {
      const updated = await tx.walletAccount.update({
        where: { id: existing.id },
        data: { balanceMinor: { increment: sourceLegacyUsd } },
      })
      targetByCurrency.set('USD', updated)
    } else {
      const created = await tx.walletAccount.create({
        data: { userId: target.id, currency: 'USD', balanceMinor: sourceLegacyUsd },
      })
      targetByCurrency.set('USD', created)
    }
  }

  await tx.walletAccount.deleteMany({ where: { userId: source.id } })

  const usd = targetByCurrency.get('USD')
  if (usd) {
    await tx.user.update({ where: { id: target.id }, data: { walletBalance: minorToNumber(usd.balanceMinor, 'USD') } })
  }
}

/**
 * Attach a Telegram identity to an existing website account. If that Telegram
 * identity currently belongs to an auto-created Telegram placeholder, all
 * customer-owned data is moved to the website account atomically first.
 */
export async function attachTelegramToUser(targetUserId: number, tg: TelegramUser): Promise<TelegramAccountResult> {
  const telegramId = String(tg.id)
  const name = displayName(tg)

  return db.$transaction(async (tx: any) => {
    const target = await tx.user.findUnique({ where: { id: targetUserId } })
    if (!target) return { ok: false, code: 'NOT_FOUND', message: 'حساب سایت پیدا نشد' } as const
    if (target.status !== 'ACTIVE') return { ok: false, code: 'DISABLED', message: 'حساب سایت فعال نیست' } as const
    if (target.telegramId && target.telegramId !== telegramId) {
      return { ok: false, code: 'TARGET_TELEGRAM_CONFLICT', message: 'این حساب سایت قبلاً به تلگرام دیگری وصل شده است' } as const
    }

    const source = await tx.user.findUnique({ where: { telegramId } })
    let merged = false
    let mergedSource: any = null

    if (source && source.id !== target.id) {
      const sourceReseller = await tx.reseller.findUnique({ where: { userId: source.id } })
      if (!isTelegramPlaceholderUser(source) || sourceReseller) {
        return { ok: false, code: 'TELEGRAM_ALREADY_CLAIMED', message: 'این تلگرام قبلاً به یک حساب سایت دیگر وصل شده است' } as const
      }
      if (source.status !== 'ACTIVE') {
        return { ok: false, code: 'DISABLED', message: 'حساب تلگرامی فعال نیست' } as const
      }

      mergedSource = source
      await mergeWallets(tx, source, target)

      // Every customer-owned record follows the canonical target userId.
      await tx.order.updateMany({ where: { userId: source.id }, data: { userId: target.id } })
      await tx.subscription.updateMany({ where: { userId: source.id }, data: { userId: target.id } })
      await tx.ticket.updateMany({ where: { userId: source.id }, data: { userId: target.id } })
      await tx.ticketMessage.updateMany({ where: { userId: source.id }, data: { userId: target.id } })
      await tx.crmNote.updateMany({ where: { userId: source.id }, data: { userId: target.id } })
      await tx.post.updateMany({ where: { authorId: source.id }, data: { authorId: target.id } })
      await tx.invoice.updateMany({ where: { userId: source.id }, data: { userId: target.id } })
      await tx.payment.updateMany({ where: { userId: source.id }, data: { userId: target.id } })
      await tx.walletTx.updateMany({ where: { userId: source.id }, data: { userId: target.id } })
      await tx.apiKey.updateMany({ where: { userId: source.id }, data: { userId: target.id } })
      await tx.auditLog.updateMany({ where: { actorUserId: source.id }, data: { actorUserId: target.id } })

      // Release the unique Telegram id before assigning it to the target.
      await tx.user.update({ where: { id: source.id }, data: { telegramId: null } })
      await tx.user.delete({ where: { id: source.id } })
      merged = true
    }

    const mergedNote = mergedSource?.note
      ? [target.note, mergedSource.note].filter(Boolean).join('\n--- Telegram merge ---\n')
      : target.note
    const lastLoginAt = [target.lastLoginAt, mergedSource?.lastLoginAt].filter(Boolean).sort((a: Date, b: Date) => b.getTime() - a.getTime())[0] || target.lastLoginAt

    await tx.user.update({
      where: { id: target.id },
      data: {
        name: target.name || mergedSource?.name || name,
        phone: target.phone || mergedSource?.phone || '',
        note: mergedNote || '',
        subscriptionAlerts: mergedSource ? Boolean(target.subscriptionAlerts && mergedSource.subscriptionAlerts) : target.subscriptionAlerts,
        lastLoginAt,
        telegramId,
        telegramUsername: tg.username || '',
        telegramName: name,
        telegramPhoto: tg.photo_url || mergedSource?.telegramPhoto || target.telegramPhoto || '',
        telegramLinkedAt: target.telegramLinkedAt || mergedSource?.telegramLinkedAt || new Date(),
      },
    })

    return { ok: true, userId: target.id, merged } as const
  })
}

/** Turn a Telegram-only placeholder into a normal website account without changing its userId. */
export async function claimTelegramAccount(input: {
  tg: TelegramUser
  email: string
  passwordHash: string
  name?: string
  referral?: { ownerId: number; code: string; rewardBps: number } | null
}): Promise<TelegramAccountResult> {
  const telegramId = String(input.tg.id)
  const tgName = displayName(input.tg)

  return db.$transaction(async (tx: any) => {
    const emailOwner = await tx.user.findUnique({ where: { email: input.email } })
    if (emailOwner) return { ok: false, code: 'EMAIL_EXISTS', message: 'این ایمیل قبلاً ثبت شده است' } as const

    const source = await tx.user.findUnique({ where: { telegramId } })
    if (source) {
      if (!isTelegramPlaceholderUser(source)) {
        return { ok: false, code: 'TELEGRAM_ALREADY_CLAIMED', message: 'این تلگرام قبلاً به یک حساب سایت وصل شده است؛ وارد همان حساب شوید' } as const
      }
      if (source.status !== 'ACTIVE') return { ok: false, code: 'DISABLED', message: 'این حساب فعال نیست' } as const
      if (input.referral) {
        if (source.id === input.referral.ownerId || await tx.invoice.findFirst({ where: { userId: source.id, status: 'PAID', kind: 'BILLING', totalMinor: { gt: 0n } }, select: { id: true } })) {
          return { ok: false, code: 'UNSAFE_SOURCE', message: 'حساب تلگرام دارای خرید قبلی است و برای معرفی جدید واجد شرایط نیست' } as const
        }
        const existingAttribution = await tx.referralAttribution.findUnique({ where: { referredUserId: source.id } })
        if (existingAttribution && existingAttribution.referrerUserId !== input.referral.ownerId) return { ok: false, code: 'UNSAFE_SOURCE', message: 'این حساب قبلاً توسط شخص دیگری معرفی شده است' } as const
      }

      await tx.user.update({
        where: { id: source.id },
        data: {
          email: input.email,
          passwordHash: input.passwordHash,
          name: input.name?.trim() || source.name || tgName,
          telegramUsername: input.tg.username || '',
          telegramName: tgName,
          telegramPhoto: input.tg.photo_url || source.telegramPhoto,
          telegramLinkedAt: source.telegramLinkedAt || new Date(),
        },
      })
      if (input.referral) await tx.referralAttribution.upsert({ where: { referredUserId: source.id }, create: { referredUserId: source.id, referrerUserId: input.referral.ownerId, code: input.referral.code, rewardBps: input.referral.rewardBps }, update: {} })
      return { ok: true, userId: source.id, merged: false } as const
    }

    const created = await tx.user.create({
      data: {
        email: input.email,
        passwordHash: input.passwordHash,
        name: input.name?.trim() || tgName,
        role: 'CUSTOMER',
        telegramId,
        telegramUsername: input.tg.username || '',
        telegramName: tgName,
        telegramPhoto: input.tg.photo_url || '',
        telegramLinkedAt: new Date(),
      },
    })
    if (input.referral && input.referral.ownerId !== created.id) await tx.referralAttribution.create({ data: { referredUserId: created.id, referrerUserId: input.referral.ownerId, code: input.referral.code, rewardBps: input.referral.rewardBps } })
    return { ok: true, userId: created.id, merged: false } as const
  })
}
