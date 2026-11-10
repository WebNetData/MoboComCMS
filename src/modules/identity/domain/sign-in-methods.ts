import { deliverableEmail } from '@/modules/mail/domain/mail'

/**
 * The ways a member can actually get into their account now (audit 2026-11-10). Removing a connected sign-in method is
 * allowed only while another one remains, so nobody locks themselves out.
 *
 * Only what the stored account proves counts: a verified mobile, a Telegram or Google account, a password the member
 * set themselves, or their own email address while the site can send it a sign-in code or a reset link. The age of
 * the account proves nothing: accounts made by Telegram, a mobile or email code, or Google were all given a random
 * password nobody knows, and ordinary email sign-up does not record when its password was chosen. When unsure, the
 * answer is "no": the worst case is being asked to set a password first, never being shut out.
 */
export type WayIn = 'mobile' | 'telegram' | 'google' | 'password' | 'email'
export type RemovableWayIn = 'google' | 'telegram'

export type MemberWays = {
  email: string
  phoneVerifiedAt: Date | null
  telegramId: string | null
  googleId: string | null
  passwordChangedAt: Date | null
}

export function waysIn(member: MemberWays, site: { emailCanSignIn: boolean }): WayIn[] {
  const ways: WayIn[] = []
  if (member.phoneVerifiedAt) ways.push('mobile')
  if (member.telegramId) ways.push('telegram')
  if (member.googleId) ways.push('google')
  if (member.passwordChangedAt) ways.push('password')
  if (site.emailCanSignIn && deliverableEmail(member.email)) ways.push('email')
  return ways
}

/** Whether `method` may go: the member has it, and another way in stays. */
export function mayRemove(member: MemberWays, method: RemovableWayIn, site: { emailCanSignIn: boolean }) {
  const ways = waysIn(member, site)
  return ways.includes(method) && ways.some(way => way !== method)
}

export const LAST_WAY_IN_MESSAGE = 'این تنها راه ورود شما به حساب است. اول شمارهٔ موبایل را تأیید کنید یا در «تنظیمات حساب» رمز عبور بگذارید، سپس اتصال را قطع کنید.'
