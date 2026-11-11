/** One read-only Wikidata query: the fixed public endpoint, no redirects, a short deadline and a bounded answer. */
export async function wikidataSelect(query: string, signal: AbortSignal, maxBytes = 256 * 1024): Promise<unknown> {
  const url = new URL('https://query.wikidata.org/sparql'); url.search = new URLSearchParams({ query, format: 'json' }).toString()
  const response = await fetch(url, { headers: { Accept: 'application/sparql-results+json', 'User-Agent': 'MoboComMetadata/1.0' }, redirect: 'error', cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) })
  if (response.status !== 200 || !/application\/(?:sparql-results\+)?json/.test(response.headers.get('content-type') || '') || !response.body) { await response.body?.cancel(); throw new Error('دریافت اطلاعات عوامل از ویکی‌داده انجام نشد') }
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0
  try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > maxBytes) throw new Error('پاسخ ویکی‌داده بیش از حد بزرگ است'); chunks.push(value) } }
  finally { await reader.cancel().catch(() => {}) }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}
