import { observeAi } from '../telemetry'
import { personalAiPurpose } from '../admin-context'
import type { Prompt } from '@/modules/ai/domain/ai'
import { ChatGptError, RESOURCE } from './types'
import { readState } from './store'
import { activeAccount } from './session'
import { fixedFetch, jsonRequest } from './network'
import { responseText } from './response'

// Account catalogs include provider metadata omitted from the bounded picker projection.
const MODEL_CATALOG_MAX_BYTES = 4 * 1024 * 1024

export async function modelsFor(id: number) {
  const account = await activeAccount(id), data = await jsonRequest(`${RESOURCE}/models`, { headers: { Authorization: `Bearer ${account.access}` } }, MODEL_CATALOG_MAX_BYTES)
  if (!Array.isArray(data.models)) throw new ChatGptError('فهرست مدل‌های حساب دریافت نشد', 502)
  return data.models.filter(m => m && typeof m === 'object' && m.visibility === 'list' && typeof m.slug === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(m.slug)).slice(0, 100).map(m => ({ id: String(m.slug), label: String(m.display_name || m.slug).slice(0, 120) }))
}
export { responseText } from './response'

export async function personalGenerate(id: number, prompt: Prompt) {
  const state = await readState(id)
  if (!state.enabled) return null
  if (!state.model) throw new ChatGptError('مدل حساب شخصی ChatGPT را انتخاب کنید', 409)
  const account = await activeAccount(id)
  const current = await readState(id)
  if (!current.enabled || current.active !== state.active || account.clientId !== state.active || current.model !== state.model || current.accounts.find(a => a.clientId === account.clientId)?.refresh !== account.refresh) throw new ChatGptError('اتصال شخصی هم‌زمان تغییر کرد؛ دوباره تلاش کنید', 409)
  const observed = await observeAi({ purpose: personalAiPurpose() || 'admin', provider: 'chatgpt-personal', model: state.model, transport: 'personal' }, async attempt => {
    attempt()
    const response = await fixedFetch(`${RESOURCE}/responses`, { method: 'POST', headers: { Authorization: `Bearer ${account.access}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' }, signal: AbortSignal.timeout(120_000), body: JSON.stringify({ model: state.model, instructions: prompt.system, input: [{ role: 'user', content: prompt.user }], store: false, stream: true }) })
    return { text: await responseText(response), model: state.model, provider: 'chatgpt-personal' }
  })
  return { ...observed.value, observationId: observed.observationId }
}
