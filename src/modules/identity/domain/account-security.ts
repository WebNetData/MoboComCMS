// Account security rules: password policy, reset links, 2-step sign-in
// backup codes and the site-wide security policy. Pure — no I/O.

export const RESET_TTL_MS = 30 * 60_000
export const BACKUP_CODE_COUNT = 10

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
}

export const DEFAULT_SECURITY_POLICY: SecurityPolicy = { requireAdmin2fa: false, emailReset: true, smsReset: true }

export function normalizeSecurityPolicy(input: unknown): SecurityPolicy {
  const raw = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const flag = (key: keyof SecurityPolicy) => typeof raw[key] === 'boolean' ? raw[key] as boolean : DEFAULT_SECURITY_POLICY[key]
  return { requireAdmin2fa: flag('requireAdmin2fa'), emailReset: flag('emailReset'), smsReset: flag('smsReset') }
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
