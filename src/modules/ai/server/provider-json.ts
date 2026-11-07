import { AiError } from './error'
/** Count actual bytes, including through a proxy; Content-Length is not trusted. */
export async function providerJson(response: Response) {
  if (!response.body) { if (!response.ok) return null; throw new SyntaxError('Empty provider response') }
  const reader = response.body.getReader(), decoder = new TextDecoder(); let text = '', size = 0
  try {
    while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 2 * 1024 * 1024) throw new AiError('پاسخ سرویس بیش از حد بزرگ بود؛ درخواست تکرار نشد', 502, 'unavailable', false); text += decoder.decode(part.value, { stream: true }) }
    try { return JSON.parse(text + decoder.decode()) } catch (error) { if (response.ok) throw error; return null }
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock() }
}
