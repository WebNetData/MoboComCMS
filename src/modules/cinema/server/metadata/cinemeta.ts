import { parseCinemeta } from '@/modules/cinema/domain/cinemeta'

/** Public documented Stremio metadata, never an IMDb challenge proxy or arbitrary URL. */
export async function lookupCinemeta(id: string, preferredKind?: unknown) {
  if (!/^tt\d{7,12}$/.test(id)) throw new Error('شناسهٔ IMDb معتبر نیست')
  const kinds = preferredKind === 'SERIES' ? ['series', 'movie'] : ['movie', 'series']
  const deadline = AbortSignal.timeout(12000)
  for (const kind of kinds) {
    const response = await fetch(`https://v3-cinemeta.strem.io/meta/${kind}/${id}.json`, { headers: { Accept: 'application/json', 'User-Agent': 'MoboComMetadata/1.0' }, redirect: 'error', cache: 'no-store', signal: AbortSignal.any([deadline, AbortSignal.timeout(8000)]) })
    if (response.status === 404) { await response.body?.cancel(); continue }
    if (response.status !== 200 || !response.headers.get('content-type')?.includes('application/json') || !response.body) { await response.body?.cancel(); throw new Error('دریافت جزئیات از Cinemeta انجام نشد') }
    const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0
    try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 2 * 1024 * 1024) throw new Error('پاسخ Cinemeta بیش از حد بزرگ است'); chunks.push(value) } }
    finally { await reader.cancel().catch(() => {}) }
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (payload?.meta === null) continue
    return parseCinemeta(payload, id)
  }
  throw new Error('عنوانی با این شناسه در Cinemeta پیدا نشد')
}
