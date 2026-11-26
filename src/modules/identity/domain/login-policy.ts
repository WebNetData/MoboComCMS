export const LOGIN_METHODS = ['password', 'sms', 'email', 'telegram', 'google'] as const
export type LoginMethod = typeof LOGIN_METHODS[number]
export type LoginPolicy = Record<LoginMethod, boolean>
export const DEFAULT_LOGIN_POLICY: LoginPolicy = { password: true, sms: true, email: true, telegram: true, google: true }
export function loginPolicy(raw: unknown): LoginPolicy {
  if (raw === undefined || raw === null || raw === '') return { ...DEFAULT_LOGIN_POLICY }
  try {
    const input = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !(LOGIN_METHODS as readonly string[]).includes(k)) || Object.values(input).some(v => typeof v !== 'boolean')) throw Error('Invalid login policy')
    return { ...DEFAULT_LOGIN_POLICY, ...input }
  } catch { return { password: false, sms: false, email: false, telegram: false, google: false } }
}
export function loginMethod(provider: unknown): LoginMethod | null {
  if (provider === 'credentials') return 'password'
  if (provider === 'sms-otp') return 'sms'
  if (provider === 'email-otp') return 'email'
  if (provider === 'telegram' || provider === 'telegram-web') return 'telegram'
  return provider === 'google' ? 'google' : null
}
export function methodAllowed(raw: unknown, method: unknown): boolean {
  return typeof method === 'string' && (LOGIN_METHODS as readonly string[]).includes(method) && loginPolicy(raw)[method as LoginMethod]
}
