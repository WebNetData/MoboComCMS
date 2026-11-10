import { db } from '@/platform/database/prisma'
import { RevisionError } from '@/modules/content/server/revisions'
import { emailOtpAvailable } from '@/modules/identity/server/email-otp'
import { resetMethods } from '@/modules/identity/server/account-security'
import { LAST_WAY_IN_MESSAGE, mayRemove, type MemberWays, type RemovableWayIn } from '@/modules/identity/domain/sign-in-methods'

/**
 * Removing a connected sign-in method (Google, Telegram) only while another way in remains (domain/sign-in-methods.ts).
 * The check and the removal happen in one transaction holding the member's row, so two removals at once cannot each
 * see the other method and leave the member with none.
 */
const FIELDS = { email: true, phoneVerifiedAt: true, telegramId: true, googleId: true, passwordChangedAt: true } as const
const CLEARED: Record<RemovableWayIn, Record<string, unknown>> = {
  google: { googleId: null, googleEmail: '', googleLinkedAt: null },
  telegram: { telegramId: null, telegramUsername: '', telegramName: '', telegramPhoto: '', telegramLinkedAt: null },
}

/** Whether the site can let a member in by their own email now (a sign-in code or a reset link). Unknown counts as no. */
export async function emailCanSignIn() {
  const [code, reset] = await Promise.all([emailOtpAvailable().catch(() => false), resetMethods().then(m => m.email).catch(() => false)])
  return code || reset
}

export async function canRemoveSignInMethod(userId: number, method: RemovableWayIn) {
  const member = await db.user.findUnique({ where: { id: userId }, select: FIELDS })
  return !!member && mayRemove(member, method, { emailCanSignIn: await emailCanSignIn() })
}

/** Removes `method` from the member; 'absent' when they did not have it. Refuses (409) when it is their last way in. */
export async function removeSignInMethod(userId: number, method: RemovableWayIn): Promise<'removed' | 'absent'> {
  const site = { emailCanSignIn: await emailCanSignIn() }
  return db.$transaction(async tx => {
    if (/^postgres(?:ql)?:/i.test(process.env.DATABASE_URL || '')) await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`
    const member = await tx.user.findUnique({ where: { id: userId }, select: FIELDS }) as MemberWays | null
    if (!member || !(method === 'google' ? member.googleId : member.telegramId)) return 'absent'
    if (!mayRemove(member, method, site)) throw new RevisionError(LAST_WAY_IN_MESSAGE, 409)
    await tx.user.update({ where: { id: userId }, data: CLEARED[method] })
    return 'removed'
  })
}
