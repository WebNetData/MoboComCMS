import type { Prompt } from '@/modules/ai/domain/ai'
import { ChatGptError, RESOURCE } from './types'
import { readState } from './store'
import { activeAccount } from './session'
import { fixedFetch, jsonRequest } from './network'

// Account catalogs include provider metadata omitted from the bounded picker projection.
const MODEL_CATALOG_MAX_BYTES = 4 * 1024 * 1024

export async function modelsFor(id: number) {
  const account = await activeAccount(id), data = await jsonRequest(`${RESOURCE}/models`, { headers: { Authorization: `Bearer ${account.access}` } }, MODEL_CATALOG_MAX_BYTES)
  if (!Array.isArray(data.models)) throw new ChatGptError('فهرست مدل‌های حساب دریافت نشد', 502)
  return data.models.filter(m => m && typeof m === 'object' && m.visibility === 'list' && typeof m.slug === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(m.slug)).slice(0, 100).map(m => ({ id: String(m.slug), label: String(m.display_name || m.slug).slice(0, 120) }))
}
/** Rejects truncated/error streams; partial text is never published as a completed response. */
export async function responseText(response: Response) {
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined)
    throw new ChatGptError(response.status === 429 ? 'سهمیهٔ ChatGPT کافی نیست؛ API پولی استفاده نشد' : 'درخواست ChatGPT پذیرفته نشد؛ اتصال، مدل و مجوز حساب را بررسی کنید', response.status === 429 ? 429 : 502)
  }
  if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) throw new ChatGptError('پاسخ جریانی ChatGPT معتبر نیست', 502)
  const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '', text = '', total = 0, completed = false
  const event = (frame: string) => {
    const raw = frame.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n')
    if (!raw || raw === '[DONE]') return
    const data = JSON.parse(raw)
    if (data.type === 'response.output_text.delta') { if (typeof data.delta !== 'string') throw new Error('delta'); text += data.delta }
    if (['response.failed', 'response.incomplete', 'error'].includes(data.type)) throw new ChatGptError('پاسخ ChatGPT کامل نشد یا سهمیه در دسترس نیست؛ API پولی استفاده نشد', 502)
    if (data.type === 'response.completed') { if (data.response?.status !== 'completed') throw new Error('status'); completed = true }
    if (text.length > 100_000) throw new Error('output size')
  }
  try {
    while (!completed) {
      const part = await reader.read(); if (part.done) break
      total += part.value.length; if (total > 2 * 1024 * 1024) throw new Error('stream size')
      buffer = (buffer + decoder.decode(part.value, { stream: true })).replace(/\r\n/g, '\n')
      let end; while ((end = buffer.indexOf('\n\n')) >= 0) { event(buffer.slice(0, end)); buffer = buffer.slice(end + 2) }
    }
    if (!completed || !text.trim()) throw new Error('incomplete')
    return text
  } catch (error) {
    if (error instanceof ChatGptError) throw error
    throw new ChatGptError('دریافت پاسخ ChatGPT کامل نشد؛ متن ناقص استفاده نشد', 502)
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock() }
}
export async function personalGenerate(id: number, prompt: Prompt) {
  const state = await readState(id)
  if (!state.enabled) return null
  if (!state.model) throw new ChatGptError('مدل حساب شخصی ChatGPT را انتخاب کنید', 409)
  const account = await activeAccount(id)
  const current = await readState(id)
  if (!current.enabled || current.active !== state.active || account.clientId !== state.active || current.model !== state.model || current.accounts.find(a => a.clientId === account.clientId)?.refresh !== account.refresh) throw new ChatGptError('اتصال شخصی هم‌زمان تغییر کرد؛ دوباره تلاش کنید', 409)
  const response = await fixedFetch(`${RESOURCE}/responses`, { method: 'POST', headers: { Authorization: `Bearer ${account.access}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(120_000), body: JSON.stringify({ model: state.model, instructions: prompt.system, input: [{ role: 'user', content: prompt.user }], store: false, stream: true }) })
  return { text: await responseText(response), model: state.model, provider: 'chatgpt-personal' }
}
