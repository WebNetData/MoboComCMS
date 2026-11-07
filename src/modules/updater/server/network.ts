import { egressFetch } from '@/modules/social/server/egress'
import { UpdateError } from '../domain/updater'

/** Counts actual streamed bytes; a timeout continues to cover the body, not just headers. */
export async function updateJson(url: string) {
  const response = await egressFetch(url, { signal: AbortSignal.timeout(20_000), redirect: 'error', headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'MoboComCMS-updater' }, cache: 'no-store' })
  if (!response.ok) { await response.body?.cancel().catch(() => undefined); throw new UpdateError(response.status === 404 ? 'مخزن یا انتشار در دسترس نیست؛ دسترسی مخزن خصوصی را بررسی کنید' : `دریافت فهرست نسخه‌ها ناموفق بود (HTTP ${response.status})`, 502) }
  if (!response.body) throw new UpdateError('فهرست نسخه‌ها خالی بود', 502)
  const reader = response.body.getReader(), decoder = new TextDecoder(); let text = '', bytes = 0
  try {
    while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > 2 * 1024 * 1024) throw new UpdateError('فهرست نسخه‌ها بیش از حد بزرگ است', 502); text += decoder.decode(part.value, { stream: true }) }
    return JSON.parse(text + decoder.decode()) as unknown
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock() }
}

const downloadHost = (url: URL) => url.protocol === 'https:' && !url.username && !url.password && !url.port && (url.hostname === 'github.com' || url.hostname === 'release-assets.githubusercontent.com' || url.hostname === 'objects.githubusercontent.com')

/** Follow only official release-asset redirects, including on the proxy transport. */
export async function githubAsset(url: string, signal: AbortSignal) {
  let target = new URL(url)
  for (let hop = 0; hop < 4; hop++) {
    if (!downloadHost(target)) throw new UpdateError('مقصد فایل انتشار GitHub مجاز نیست', 502)
    const response = await egressFetch(target, { signal, redirect: 'manual', headers: { Accept: 'application/octet-stream', 'User-Agent': 'MoboComCMS-updater' }, cache: 'no-store' })
    if ([301, 302, 303, 307, 308].includes(response.status)) { const location = response.headers.get('location'); await response.body?.cancel().catch(() => undefined); if (!location) throw new UpdateError('نشانی فایل انتشار دریافت نشد', 502); target = new URL(location, target); continue }
    if (!response.ok || !response.body) { await response.body?.cancel().catch(() => undefined); throw new UpdateError(`دریافت بسته از GitHub ناموفق بود (HTTP ${response.status})؛ فایل mbrelease را می‌توانید دستی بارگذاری کنید`, 502) }
    return response
  }
  throw new UpdateError('تعداد هدایت‌های فایل انتشار بیش از حد است', 502)
}
