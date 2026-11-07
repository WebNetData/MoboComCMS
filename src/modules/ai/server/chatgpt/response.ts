import { ChatGptError } from './types'
import { boundedText } from './network'

const LIMIT = 2 * 1024 * 1024
const failure = () => new ChatGptError('دریافت پاسخ ChatGPT کامل نشد؛ متن ناقص استفاده نشد', 502)
function completedText(value: unknown) {
  const response = value as { status?: string; error?: unknown; output?: { type?: string; role?: string; content?: { type?: string; text?: string }[] }[] } | null
  if (!response || response.status !== 'completed' || response.error || !Array.isArray(response.output)) throw failure()
  const text = response.output.filter(item => item?.type === 'message' && item.role === 'assistant').flatMap(item => Array.isArray(item.content) ? item.content.filter(part => part?.type === 'output_text' && typeof part.text === 'string').map(part => part.text) : []).join('')
  if (!text.trim() || text.length > 100_000) throw failure()
  return text
}
/** Both documented completed JSON and SSE are accepted; HTML, partial and error responses never are. */
export async function responseText(response: Response) {
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined)
    throw new ChatGptError(response.status === 429 ? 'سهمیهٔ ChatGPT کافی نیست؛ API پولی استفاده نشد' : `درخواست ChatGPT پذیرفته نشد (HTTP ${response.status})؛ اتصال و مجوز حساب را بررسی کنید`, response.status === 429 ? 429 : 502)
  }
  const mime = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
  if (mime === 'application/json') {
    try { return completedText(JSON.parse(await boundedText(response, LIMIT))) }
    catch { throw failure() }
  }
  if (!response.body || !['text/event-stream', 'application/octet-stream', ''].includes(mime)) {
    await response.body?.cancel().catch(() => undefined)
    throw new ChatGptError('نوع پاسخ ChatGPT با JSON یا جریان رویداد سازگار نیست؛ مسیر پراکسی را بررسی کنید', 502)
  }
  const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true })
  let buffer = '', text = '', total = 0, completed = false
  const event = (frame: string) => {
    const raw = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
    if (!raw || raw === '[DONE]') return
    const data = JSON.parse(raw)
    if (['response.failed', 'response.incomplete', 'error'].includes(data.type)) throw failure()
    if (data.type === 'response.output_text.delta') { if (typeof data.delta !== 'string') throw failure(); text += data.delta }
    if (text.length > 100_000) throw failure()
    if (data.type === 'response.completed') {
      if (data.response?.status !== 'completed' || data.response.error) throw failure()
      if (Array.isArray(data.response.output)) {
        const full = completedText(data.response)
        if (text && full !== text) throw failure()
        text = full
      }
      completed = true
    }
  }
  try {
    while (!completed) {
      const part = await reader.read()
      if (part.done) { buffer += decoder.decode(); if (buffer.trim()) event(buffer.replace(/\r\n/g, '\n')); break }
      total += part.value.length; if (total > LIMIT) throw failure()
      buffer = (buffer + decoder.decode(part.value, { stream: true })).replace(/\r\n/g, '\n')
      let end: number
      while ((end = buffer.indexOf('\n\n')) >= 0) { event(buffer.slice(0, end)); buffer = buffer.slice(end + 2) }
    }
    if (!completed || !text.trim()) throw failure()
    return text
  } catch { throw failure() }
  finally { await reader.cancel().catch(() => undefined); reader.releaseLock() }
}
