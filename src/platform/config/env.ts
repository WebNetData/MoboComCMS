const DEV_AUTH_SECRET = 'dev-secret-change-me'

export function env(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value || undefined
}

export function requiredEnv(name: string): string {
  const value = env(name)
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

/**
 * Production must never boot with the historical development secret.
 * Development keeps the old fallback so existing local setups are not broken.
 */
export function authSecret(): string {
  const configured = env('NEXTAUTH_SECRET')
  if (configured) return configured
  if (process.env.NODE_ENV === 'production') {
    throw new Error('NEXTAUTH_SECRET is required in production')
  }
  return DEV_AUTH_SECRET
}

function secretLooksStrong(value: string | undefined, min = 32) {
  return Boolean(value && value.length >= min && !/change[-_ ]?me|replace|example|dev-secret/i.test(value))
}

function assertHttpsPublicUrl(name: string, raw: string | undefined) {
  if (!raw) throw new Error(`${name} is required in production`)
  let url: URL
  try { url = new URL(raw) } catch { throw new Error(`${name} must be a valid absolute URL`) }
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (url.protocol !== 'https:') throw new Error(`${name} must use https in production`)
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === '127.0.0.1' || host === '::1') {
    throw new Error(`${name} must use the public production hostname`)
  }
}

/**
 * Fail fast before a production process starts accepting traffic. Keep this
 * deliberately limited to platform-critical values; optional gateways/bots
 * validate themselves when enabled.
 */
export function validateProductionEnvironment() {
  if (process.env.NODE_ENV !== 'production') return

  const auth = env('NEXTAUTH_SECRET')
  if (!secretLooksStrong(auth, 32)) throw new Error('NEXTAUTH_SECRET must be a strong production secret (32+ chars)')
  assertHttpsPublicUrl('NEXTAUTH_URL', env('NEXTAUTH_URL'))

  const database = env('DATABASE_URL')
  if (!database || !/^postgres(?:ql)?:\/\//i.test(database)) {
    throw new Error('DATABASE_URL must point to PostgreSQL in production')
  }

  const workerSecret = env('INTERNAL_JOBS_SECRET')
  if (!secretLooksStrong(workerSecret, 32)) throw new Error('INTERNAL_JOBS_SECRET must be a strong production secret (32+ chars)')

  const internalOrigin = env('INTERNAL_APP_ORIGIN') || 'http://127.0.0.1:3000'
  let internalUrl: URL
  try { internalUrl = new URL(internalOrigin) } catch { throw new Error('INTERNAL_APP_ORIGIN must be a valid loopback URL') }
  if (internalUrl.protocol !== 'http:' || !['127.0.0.1', 'localhost', '::1'].includes(internalUrl.hostname)) {
    throw new Error('INTERNAL_APP_ORIGIN must stay on loopback')
  }

  const panelKey = env('PANEL_CREDENTIAL_KEY') || ''
  if (!/^[0-9a-f]{64}$/i.test(panelKey)) throw new Error('PANEL_CREDENTIAL_KEY must be 32 bytes (64 hex chars)')

  const frenzyKey = env('FRENZYEX_API_KEY')
  if (frenzyKey && !secretLooksStrong(env('FRENZYEX_CALLBACK_SECRET'), 24)) {
    throw new Error('FRENZYEX_CALLBACK_SECRET is required and must be strong when FrenzyEx is enabled')
  }

  if ((env('BACKUP_SCHEDULER') || '').toLowerCase() === 'true') {
    const key = env('BACKUP_ENCRYPTION_KEY') || ''
    if (!/^[0-9a-f]{64}$/i.test(key)) throw new Error('BACKUP_ENCRYPTION_KEY must be 32 bytes (64 hex chars) when the app backup scheduler is enabled')
  }
}
