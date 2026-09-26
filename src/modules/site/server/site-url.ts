// Where the shop lives, in one place. Kept tiny and dependency-free so both the
// subscription engine and the Telegram notifier can import it without creating a
// cycle (subs → provision → telegram → subs).
import { db } from '@/platform/database/prisma'

let cache: { at: number; value: string } | null = null

function publicOrigin(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    if (process.env.NODE_ENV === 'production') {
      const host = url.hostname.toLowerCase().replace(/\.$/, '')
      if (url.protocol !== 'https:' || host === 'localhost' || host.endsWith('.local') || host === '127.0.0.1' || host === '::1') return null
    }
    return `${url.protocol}//${url.host}`
  } catch {
    return null
  }
}

/** The public origin of the shop: valid `siteUrl` setting, else `NEXTAUTH_URL`. */
export async function siteBaseUrl(): Promise<string> {
  if (cache && Date.now() - cache.at < 60_000) return cache.value
  const row = await db.setting.findUnique({ where: { key: 'siteUrl' } }).catch(() => null)
  const value = publicOrigin(row?.value) || publicOrigin(process.env.NEXTAUTH_URL)
  if (!value) {
    if (process.env.NODE_ENV === 'production') throw new Error('A valid public HTTPS siteUrl/NEXTAUTH_URL is required')
    return 'http://localhost:3000'
  }
  cache = { at: Date.now(), value }
  return value
}

/** The mirror URL on our own domain (kept only for backwards compatibility). */
export function mirrorUrl(base: string, token: string) {
  return `${base.replace(/\/+$/, '')}/s/${encodeURIComponent(token)}`
}

/** The legacy mirror path — old links may still resolve during migrations. */
export function legacyMirrorUrl(base: string, token: string) {
  return `${base.replace(/\/+$/, '')}/api/sub/${token}`
}
