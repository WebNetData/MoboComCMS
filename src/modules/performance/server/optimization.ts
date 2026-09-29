import { cacheState, flushViews, getPageCacheConfig, pageCacheReport, purgeAll, purgePrefix, resetPageCacheStats, savePageCacheConfig, warmPages } from '@/modules/performance/server/pagecache'
import { DEFAULT_EXCLUDE, DEFAULT_INCLUDE, PRESETS } from '@/modules/performance/domain/pagecache'

/** Everything the optimization page shows: settings, presets and live numbers. */
export async function optimizationOverview() {
  const config = await getPageCacheConfig(true)
  return {
    config, report: pageCacheReport(), presets: PRESETS, defaults: { include: DEFAULT_INCLUDE, exclude: DEFAULT_EXCLUDE },
    redis: !!process.env.REDIS_URL, instance: `${process.pid}`,
  }
}

export { savePageCacheConfig, purgeAll, purgePrefix, warmPages, resetPageCacheStats, flushViews }

/**
 * Requests a page twice the way a visitor would (through the middleware) and
 * reports what the cache did — the quickest way to check the settings work.
 */
export async function probePage(path: string, host: string) {
  if (!/^\/[A-Za-z0-9/_%.\-~]{0,200}$/.test(path)) throw new Error('مسیر معتبر نیست')
  const port = process.env.PORT || cacheState().port || '3000'
  const attempt = async () => {
    const started = performance.now()
    const response = await fetch(`http://127.0.0.1:${port}${path}`, { redirect: 'manual', cache: 'no-store', headers: { host, accept: 'text/html', 'accept-encoding': 'gzip' }, signal: AbortSignal.timeout(30_000) })
    const bytes = (await response.arrayBuffer()).byteLength
    return { status: response.status, cache: response.headers.get('x-cache') || '—', ms: Math.round(performance.now() - started), bytes, age: response.headers.get('x-cache-age') || '' }
  }
  const first = await attempt()
  const second = await attempt()
  return { first, second }
}
