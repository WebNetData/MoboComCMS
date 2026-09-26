'use strict'

function fail(message) {
  console.error(`[preflight] ${message}`)
  process.exitCode = 1
}

function value(name) {
  return String(process.env[name] || '').trim()
}

function strong(name, min = 32) {
  const v = value(name)
  if (v.length < min || /change[-_ ]?me|replace|example|dev-secret/i.test(v)) fail(`${name} must be a strong secret (${min}+ chars)`)
}

if (process.env.NODE_ENV !== 'production') fail('NODE_ENV must be production')
strong('NEXTAUTH_SECRET')
strong('INTERNAL_JOBS_SECRET')

if (!/^[0-9a-f]{64}$/i.test(value('PANEL_CREDENTIAL_KEY'))) {
  fail('PANEL_CREDENTIAL_KEY must be 64 hex chars (generate once with: openssl rand -hex 32)')
}

const db = value('DATABASE_URL')
if (!/^postgres(?:ql)?:\/\//i.test(db)) fail('DATABASE_URL must be a PostgreSQL URL')

try {
  const url = new URL(value('NEXTAUTH_URL'))
  const host = url.hostname.toLowerCase()
  if (url.protocol !== 'https:' || !host || host === 'localhost' || host.endsWith('.local') || host === '127.0.0.1' || host === '::1') {
    fail('NEXTAUTH_URL must be the public HTTPS site URL')
  }
} catch {
  fail('NEXTAUTH_URL must be a valid public HTTPS URL')
}

const turnstileSiteKey = value('NEXT_PUBLIC_TURNSTILE_SITE_KEY')
const turnstileSecret = value('TURNSTILE_SECRET_KEY')
if (Boolean(turnstileSiteKey) !== Boolean(turnstileSecret)) {
  fail('NEXT_PUBLIC_TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY must be configured together')
}
if (turnstileSecret && turnstileSecret.length < 20) fail('TURNSTILE_SECRET_KEY looks invalid')
if (turnstileSiteKey && turnstileSiteKey.length < 10) fail('NEXT_PUBLIC_TURNSTILE_SITE_KEY looks invalid')
if (turnstileSecret && !value('TURNSTILE_EXPECTED_HOSTNAME')) {
  fail('TURNSTILE_EXPECTED_HOSTNAME is required when Turnstile is enabled')
}

const internalOrigin = value('INTERNAL_APP_ORIGIN') || 'http://127.0.0.1:3000'
try {
  const u = new URL(internalOrigin)
  if (u.protocol !== 'http:' || !['127.0.0.1', 'localhost', '::1'].includes(u.hostname)) {
    fail('INTERNAL_APP_ORIGIN must stay on loopback so worker secrets are never sent off-host')
  }
} catch { fail('INTERNAL_APP_ORIGIN must be a valid loopback URL') }

if (value('FRENZYEX_API_KEY')) strong('FRENZYEX_CALLBACK_SECRET', 24)
if (value('BACKUP_SCHEDULER').toLowerCase() === 'true' && !/^[0-9a-f]{64}$/i.test(value('BACKUP_ENCRYPTION_KEY'))) {
  fail('BACKUP_ENCRYPTION_KEY must be 64 hex chars when BACKUP_SCHEDULER=true')
}

if (!process.exitCode) console.log('[preflight] production environment looks valid')
