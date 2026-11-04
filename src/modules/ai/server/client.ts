import Anthropic from '@anthropic-ai/sdk'
import { db } from '@/platform/database/prisma'
import { decryptPanelCredential, encryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import { DEFAULT_AI, effectiveBaseUrl, effectiveModel, normalizeAiConfig, providerById, type AiConfig, type Prompt } from '@/modules/ai/domain/ai'
// The AI providers go through the Server Panel's Xray profile for the "ai" purpose when one is chosen; otherwise directly.
import { egressFetch } from '@/modules/social/server/egress'

const KEY = 'ai.config.v1'
const TIMEOUT_MS = 120_000

export class AiError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

export async function getAiConfig(): Promise<AiConfig> {
  const row = await db.setting.findUnique({ where: { key: KEY } }).catch(() => null)
  if (!row) return { ...DEFAULT_AI }
  try {
    const stored = JSON.parse(row.value)
    return { ...normalizeAiConfig(stored, { ...DEFAULT_AI, apiKey: String(stored.apiKey || '') }) }
  } catch {
    return { ...DEFAULT_AI }
  }
}

export async function saveAiConfig(input: Record<string, unknown>): Promise<AiConfig> {
  const previous = await getAiConfig()
  const next = normalizeAiConfig(input, previous)
  // A new key is encrypted at rest (AES-256-GCM with PANEL_CREDENTIAL_KEY).
  const stored = { ...next, apiKey: next.apiKey === previous.apiKey ? next.apiKey : encryptPanelCredential(next.apiKey) }
  const value = JSON.stringify(stored)
  await db.setting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } })
  return stored
}

/** Settings for the admin form: the key is replaced by a mask. */
export function publicAiConfig(config: AiConfig) {
  let hint = ''
  try { const plain = decryptPanelCredential(config.apiKey); hint = plain ? `••••${plain.slice(-4)}` : '' } catch { hint = '••••' }
  return { ...config, apiKey: hint, hasKey: !!config.apiKey, effectiveModel: effectiveModel(config) }
}

export interface AiResult { text: string; model: string; provider: string }

/** Runs one prompt on the configured provider and returns its text. */
export async function generate(prompt: Prompt, config?: AiConfig): Promise<AiResult> {
  const settings = config || await getAiConfig()
  let apiKey = ''
  try { apiKey = decryptPanelCredential(settings.apiKey) } catch { throw new AiError('کلید API قابل خواندن نیست؛ دوباره آن را ذخیره کنید') }
  const model = effectiveModel(settings)
  if (!apiKey && settings.provider !== 'custom') throw new AiError(`ابتدا کلید API سرویس ${providerById(settings.provider).label} را در تنظیمات دستیار وارد کنید`)
  const text = settings.provider === 'anthropic'
    ? await claude(apiKey, model, prompt)
    : await openAiCompatible(effectiveBaseUrl(settings), apiKey, model, prompt, settings.provider)
  if (!text.trim()) throw new AiError('پاسخی از هوش مصنوعی دریافت نشد؛ دوباره تلاش کنید', 502)
  return { text, model, provider: settings.provider }
}

async function claude(apiKey: string, model: string, prompt: Prompt): Promise<string> {
  const client = new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 2, fetch: egressFetch as unknown as typeof fetch })
  try {
    const response = await client.beta.messages.create({
      model,
      // Adaptive thinking shares this budget with the answer.
      max_tokens: Math.max(prompt.maxTokens, 16000),
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
      thinking: { type: 'adaptive' },
      // If the model declines for policy reasons, the API retries on its default fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    })
    if (response.stop_reason === 'refusal') throw new AiError('مدل به این درخواست پاسخ نداد؛ موضوع یا متن را تغییر دهید', 422)
    return response.content.map((block) => block.type === 'text' ? block.text : '').join('')
  } catch (error) {
    if (error instanceof AiError) throw error
    if (error instanceof Anthropic.AuthenticationError) throw new AiError('کلید API کلاد نامعتبر است', 401)
    if (error instanceof Anthropic.RateLimitError) throw new AiError('محدودیت تعداد درخواست کلاد؛ کمی بعد دوباره تلاش کنید', 429)
    if (error instanceof Anthropic.APIError) throw new AiError(`خطای کلاد: ${error.message}`.slice(0, 300), 502)
    throw new AiError('اتصال به کلاد برقرار نشد', 502)
  }
}

async function openAiCompatible(baseUrl: string, apiKey: string, model: string, prompt: Prompt, provider: string): Promise<string> {
  if (!baseUrl) throw new AiError('نشانی سرویس هوش مصنوعی تنظیم نشده است')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  if (provider === 'openrouter') { headers['X-Title'] = 'MoboComCMS'; if (process.env.NEXTAUTH_URL) headers['HTTP-Referer'] = process.env.NEXTAUTH_URL }
  let response: Response
  try {
    response = await egressFetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, max_tokens: prompt.maxTokens, temperature: 0.7, messages: [{ role: 'system', content: prompt.system }, { role: 'user', content: prompt.user }] }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    })
  } catch {
    throw new AiError('اتصال به سرویس هوش مصنوعی برقرار نشد (نشانی یا شبکهٔ سرور را بررسی کنید)', 502)
  }
  const data = await response.json().catch(() => null) as { choices?: { message?: { content?: string }; finish_reason?: string }[]; error?: { message?: string } | string } | null
  if (!response.ok) {
    const detail = typeof data?.error === 'string' ? data.error : data?.error?.message || response.statusText
    if (response.status === 401 || response.status === 403) throw new AiError('کلید API نامعتبر است یا دسترسی ندارد', 401)
    if (response.status === 429) throw new AiError('سهمیهٔ رایگان این سرویس فعلاً تمام شده؛ کمی بعد یا با مدل/سرویس دیگری تلاش کنید', 429)
    throw new AiError(`خطای سرویس هوش مصنوعی: ${detail}`.slice(0, 300), 502)
  }
  return data?.choices?.[0]?.message?.content || ''
}
