import { toPublicPath } from '@/platform/routing/aliases'
import { db } from '@/platform/database/prisma'
import { getSettings } from '@/modules/settings/server'
import { getSeoConfig, indexNowKey } from './config'

// IndexNow tells Bing, Yandex, Seznam, Naver and other participating engines
// (and the AI answer engines built on their indexes) about new or changed URLs
// within minutes. Google does not take part; it follows the sitemap.

const LOG_KEY = 'seo.indexnow.log.v1'
const recent = new Map<string, number>()
export type IndexNowLogEntry = { at: string; count: number; status: number; urls: string[]; error?: string }

async function siteBase() {
  const settings = await getSettings().catch(() => ({} as Record<string, string>))
  return String(settings.siteUrl || process.env.NEXTAUTH_URL || '').replace(/\/+$/, '')
}

async function log(entry: IndexNowLogEntry) {
  const row = await db.setting.findUnique({ where: { key: LOG_KEY } }).catch(() => null)
  let entries: IndexNowLogEntry[] = []
  try { entries = row ? JSON.parse(row.value) : [] } catch { entries = [] }
  const value = JSON.stringify([entry, ...entries].slice(0, 30))
  await db.setting.upsert({ where: { key: LOG_KEY }, create: { key: LOG_KEY, value }, update: { value } }).catch(() => undefined)
}

export async function indexNowLog(): Promise<IndexNowLogEntry[]> {
  const row = await db.setting.findUnique({ where: { key: LOG_KEY } }).catch(() => null)
  try { return row ? JSON.parse(row.value) : [] } catch { return [] }
}

/**
 * Submits site paths or absolute URLs of this site. Only public https
 * deployments are submitted, and the same URL at most once per 10 minutes.
 */
export async function submitIndexNow(pathsOrUrls: string[], options: { force?: boolean } = {}): Promise<IndexNowLogEntry | null> {
  const config = await getSeoConfig()
  if (!config.indexNow.enabled && !options.force) return null
  const base = await siteBase()
  let host: string
  try {
    const url = new URL(base)
    if (url.protocol !== 'https:' || /^(localhost|127\.|0\.0\.0\.0)/.test(url.hostname)) return null
    host = url.host
  } catch { return null }
  const now = Date.now()
  // Internal routes (/blog/x) are announced under the address visitors see (/magazine/x).
  await import('@/modules/site/server/routes/state').then((m) => m.loadRoutingState()).catch(() => null)
  const urls = [...new Set(pathsOrUrls.map((item) => (item.startsWith('http') ? item : `${base}${toPublicPath(item.startsWith('/') ? item : `/${item}`)}`)))]
    .filter((url) => { try { return new URL(url).host === host } catch { return false } })
    .filter((url) => options.force || now - (recent.get(url) || 0) > 10 * 60_000)
    .slice(0, 10_000)
  if (!urls.length) return null
  for (const url of urls) recent.set(url, now)
  if (recent.size > 5000) for (const [url, at] of recent) if (now - at > 10 * 60_000) recent.delete(url)
  const key = await indexNowKey()
  const entry: IndexNowLogEntry = { at: new Date().toISOString(), count: urls.length, status: 0, urls: urls.slice(0, 20) }
  try {
    const response = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host, key, keyLocation: `${base}/indexnow-key.txt`, urlList: urls }),
      signal: AbortSignal.timeout(15_000),
    })
    entry.status = response.status
    if (!response.ok) entry.error = (await response.text().catch(() => '')).slice(0, 200)
  } catch (error) {
    entry.error = error instanceof Error ? error.message : 'request failed'
  }
  await log(entry)
  return entry
}

/** Fire-and-forget: content saves must never wait for or fail on IndexNow. */
export function queueIndexNow(paths: string[]) {
  if (!paths.length) return
  setTimeout(() => { void submitIndexNow(paths).catch(() => undefined) }, 0)
}

/** Maps an admin save response to the public path it changed. */
export function publicPathFor(type: string, row: { id?: unknown; slug?: unknown; status?: unknown; publishedAt?: unknown; active?: unknown; approval?: unknown } | null): string | null {
  if (!row || typeof row !== 'object') return null
  const status = typeof row.status === 'string' ? row.status : ''
  if (status && !['PUBLISHED', 'ACTIVE', 'VISIBLE'].includes(status)) return null
  if (type === 'posts' && !(row.publishedAt && new Date(String(row.publishedAt)).getTime() <= Date.now())) return null
  if (type === 'products' && (row.active !== true || row.approval !== 'APPROVED')) return null
  const slug = typeof row.slug === 'string' && /^[\w-]+$/.test(row.slug) ? row.slug : ''
  const paths: Record<string, string> = {
    posts: `/blog/${slug}`, products: `/products/${slug}`, pages: `/p/${slug}`,
    'music-tracks': `/music/track/${slug}`, 'music-albums': `/music/album/${slug}`, 'music-artists': `/music/artist/${slug}`,
    'cinema-titles': `/cinema/${slug}`, games: `/games/${slug}`, software: `/software/${slug}`,
  }
  return slug && paths[type] ? paths[type] : null
}

type Handler = (req: import('next/server').NextRequest) => Promise<Response>

/**
 * Wraps an admin save handler (?type=posts|products|…): after a successful
 * create/update of a public item, its URL is queued for IndexNow.
 */
export function withIndexNow(handler: Handler): Handler {
  return async (req) => {
    const response = await handler(req)
    if (!response.ok) return response
    const type = req.nextUrl.searchParams.get('type') || ''
    try {
      const body = await response.clone().json()
      const path = publicPathFor(type, body)
      if (path) queueIndexNow([path])
    } catch { /* non-JSON or unexpected shape: nothing to announce */ }
    return response
  }
}
