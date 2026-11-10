// Account security rules: password policy, reset links, 2-step sign-in
// backup codes and the site-wide security policy. Pure — no I/O.

export const RESET_TTL_MS = 30 * 60_000
export const BACKUP_CODE_COUNT = 10

export function initialEntryMethod(input: { sms: boolean; email: boolean; registered: boolean; passwordChanged: boolean }): 'phone' | 'email' | 'password' {
  if (input.registered || input.passwordChanged) return 'password'
  return input.sms ? 'phone' : input.email ? 'email' : 'password'
}

/** Why a new password is refused, or '' when it is acceptable. */
export function passwordProblem(password: unknown, context: { email?: string; name?: string } = {}): string {
  const value = typeof password === 'string' ? password : ''
  if (value.length < 8) return 'رمز عبور باید دست‌کم ۸ کاراکتر باشد'
  if (value.length > 128) return 'رمز عبور حداکثر ۱۲۸ کاراکتر است'
  if (/^(.)\1+$/.test(value) || /^(?:0123456789|1234567890|12345678|123456789|password|qwertyui|11111111)/i.test(value)) return 'این رمز عبور بسیار ساده است'
  const local = String(context.email || '').split('@')[0].toLowerCase()
  if (local.length >= 4 && value.toLowerCase().includes(local)) return 'رمز عبور نباید شامل نام کاربری یا ایمیل شما باشد'
  return ''
}

/** Backup codes are shown as xxxxx-xxxxx; typed input is compared without separators or case. */
export const formatBackupCode = (raw: string) => `${raw.slice(0, 5)}-${raw.slice(5, 10)}`
export const normalizeBackupCode = (input: unknown) => String(input ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
export const looksLikeBackupCode = (input: unknown) => /^[a-z0-9]{10}$/.test(normalizeBackupCode(input))

/** Six digits, with Persian/Arabic digits and spaces tolerated. */
export function normalizeTotpInput(input: unknown) {
  return String(input ?? '')
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/\s/g, '')
}

export type SecurityPolicy = {
  /** Staff must turn on 2-step sign-in before using the admin panel. */
  requireAdmin2fa: boolean
  /** Password reset by an emailed link. */
  emailReset: boolean
  /** Password reset by an SMS code to the verified mobile. */
  smsReset: boolean
  /** Passwordless email entry, delivered by the site's configured SMTP. */
  emailOtp: boolean
}

export const DEFAULT_SECURITY_POLICY: SecurityPolicy = { requireAdmin2fa: false, emailReset: true, smsReset: true, emailOtp: true }

export function normalizeSecurityPolicy(input: unknown): SecurityPolicy {
  const raw = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const flag = (key: keyof SecurityPolicy) => typeof raw[key] === 'boolean' ? raw[key] as boolean : DEFAULT_SECURITY_POLICY[key]
  return { requireAdmin2fa: flag('requireAdmin2fa'), emailReset: flag('emailReset'), smsReset: flag('smsReset'), emailOtp: flag('emailOtp') }
}

/**
 * The staff 2-step rule as stored. No row means the owner never switched it on; a stored value that cannot be read is
 * not "switched off" and counts as on (fail-safe, audit 2026-11-10). Staff held back can still turn 2-step on from their
 * own account settings, which need only a signed-in member.
 */
export function staffTwoFactorRule(stored: string | null | undefined): { required: boolean; readable: boolean } {
  if (stored === null || stored === undefined) return { required: DEFAULT_SECURITY_POLICY.requireAdmin2fa, readable: true }
  try {
    const value: unknown = JSON.parse(stored)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { required: true, readable: false }
    return { required: normalizeSecurityPolicy(value).requireAdmin2fa, readable: true }
  } catch {
    return { required: true, readable: false }
  }
}

/** A session is void once the password changed after it signed in (1s slack for clock rounding). */
export function sessionRevoked(authAt: unknown, passwordChangedAt: Date | null | undefined) {
  if (!passwordChangedAt) return false
  const signedIn = Number(authAt)
  if (!Number.isFinite(signedIn) || signedIn <= 0) return false
  return passwordChangedAt.getTime() > signedIn + 1000
}

/** a***@gmail.com — enough for the owner to recognise, useless for harvesting. */
export function maskEmail(email: string) {
  const [local, domain] = email.split('@')
  if (!domain) return ''
  return `${local.slice(0, 1)}${'*'.repeat(Math.max(2, Math.min(6, local.length - 1)))}@${domain}`
}
