import Anthropic from '@anthropic-ai/sdk'
import { db } from '@/platform/database/prisma'
import { decryptPanelCredential, encryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import { DEFAULT_AI, effectiveBaseUrl, effectiveModel, normalizeAiConfig, providerById, type AiConfig, type Prompt } from '@/modules/ai/domain/ai'
// The AI providers go through the Server Panel's Xray profile for the "ai" purpose when one is chosen; otherwise directly.
import { egressFetch, egressRoute } from '@/modules/social/server/egress'
import { personalAiActor } from './admin-context'

const KEY = 'ai.config.v1'
const TIMEOUT_MS = 120_000

export class AiError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

export async function getAiConfig(): Promise<AiConfig> {
  const row = await db.setting.findUnique({ where: { key: KEY } }).catch(() => { throw new AiError('خواندن تنظیمات هوش مصنوعی انجام نشد؛ دوباره تلاش کنید', 503) })
  if (!row) return { ...DEFAULT_AI }
  try {
    const stored = JSON.parse(row.value)
    if (!stored || typeof stored !== 'object' || Array.isArray(stored) || (stored.apiKey !== undefined && typeof stored.apiKey !== 'string')) throw new Error('invalid settings')
    // Form limits apply to new plaintext input, never to the larger encrypted envelope in storage.
    return { ...normalizeAiConfig({ ...stored, apiKey: '' }), apiKey: stored.apiKey || '' }
  } catch {
    throw new AiError('تنظیمات ذخیره‌شدهٔ هوش مصنوعی قابل خواندن نیست؛ دادهٔ قبلی حفظ شد', 503)
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
  return { ...config, apiKey: hint, hasKey: !!config.apiKey && hint !== '••••', effectiveModel: effectiveModel(config) }
}

export interface AiResult { text: string; model: string; provider: string }

/** Runs one prompt on the configured provider and returns its text. */
export async function generate(prompt: Prompt, config?: AiConfig): Promise<AiResult> {
  const actor = personalAiActor()
  if (actor !== undefined) {
    const { personalGenerate, ChatGptError } = await import('./chatgpt')
    try { const personal = await personalGenerate(actor, prompt); if (personal) return personal }
    catch (error) { if (error instanceof ChatGptError) throw new AiError(error.message, error.status); throw error }
  }
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
  const route = await egressRoute(baseUrl)
  const routeHint = route === 'proxy'
    ? 'مسیر Xray: سرویس محلی و پیکربندی انتخاب‌شده برای «هوش مصنوعی» در /admin/server/proxy را بررسی کنید'
    : provider === 'custom'
      ? 'مسیر مستقیم: نشانی سرویس سفارشی و شبکهٔ سرور را بررسی کنید؛ میزبان خارج از فهرست مجاز Xray مستقیم متصل می‌شود'
      : 'مسیر مستقیم: برای استفاده از Xray، در /admin/server/proxy یک پیکربندی برای «هوش مصنوعی» انتخاب و اعمال کنید'
  // Gemini 2.5 Flash's default thinking shares max_tokens with the answer. Short editor/meta/test requests
  // can spend the entire budget on thinking and look like a failed connection. Other model protocols stay intact.
  const reasoning = provider === 'gemini' && prompt.maxTokens <= 1200 && /^gemini-2\.5-flash(?:$|-)/.test(model) ? { reasoning_effort: 'none' } : {}
  let response: Response
  let data: { choices?: { message?: { content?: string }; finish_reason?: string }[]; error?: { message?: string } | string } | null
  try {
    response = await egressFetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, max_tokens: prompt.maxTokens, temperature: 0.7, ...reasoning, messages: [{ role: 'system', content: prompt.system }, { role: 'user', content: prompt.user }] }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    })
    data = await response.json()
  } catch (error) {
    if (error instanceof SyntaxError) throw new AiError(`پاسخ سرویس هوش مصنوعی JSON معتبر نبود؛ ${routeHint}`, 502)
    throw new AiError(`اتصال یا دریافت پاسخ سرویس هوش مصنوعی کامل نشد؛ ${routeHint}`, 502)
  }
  if (!response.ok) {
    const detail = typeof data?.error === 'string' ? data.error : data?.error?.message || response.statusText
    if (/user location is not supported|unsupported (?:country|region|location)|not (?:available|supported) in (?:your|this) (?:country|region|location)/i.test(detail)) throw new AiError(`سرویس محدودیت جغرافیایی برای IP خروجی اعلام کرد؛ ${routeHint}`, 403)
    if (response.status === 401 || /API[_ ]KEY[_ ](?:INVALID|NOT[_ ]VALID)|invalid API key/i.test(detail)) throw new AiError('کلید API نامعتبر است؛ کلید همین سرویس را دوباره وارد کنید', 401)
    if (response.status === 403) throw new AiError(`سرویس دسترسی این کلید یا پروژه را نپذیرفت (403)؛ مجوز API و محدودیت IP کلید را بررسی کنید؛ ${routeHint}`, 403)
    if (response.status === 429) throw new AiError('سهمیه یا محدودیت درخواست سرویس تمام شده؛ سهمیه و وضعیت پرداخت پروژه را بررسی کنید', 429)
    if (response.status === 404) throw new AiError('مدل یا نشانی API پیدا نشد؛ نام مدل و دسترسی پروژه به آن را بررسی کنید', 404)
    // Provider errors may echo credentials or user input; return a bounded, secret-free diagnostic.
    throw new AiError(`سرویس هوش مصنوعی درخواست را نپذیرفت (HTTP ${response.status})؛ مدل و تنظیمات سرویس را بررسی کنید`, 502)
  }
  const content = data?.choices?.[0]?.message?.content
  if (content != null && typeof content !== 'string') throw new AiError('قالب پاسخ سرویس هوش مصنوعی با پاسخ متنی سازگار نیست', 502)
  if (data?.choices?.[0]?.finish_reason === 'content_filter') throw new AiError('سرویس به این درخواست پاسخ نداد؛ موضوع یا متن را تغییر دهید', 422)
  if (data?.choices?.[0]?.finish_reason === 'length' && !content?.trim()) throw new AiError('بودجهٔ توکن مدل پیش از تولید پاسخ تمام شد؛ سقف خروجی یا تنظیم تفکر مدل را بررسی کنید', 502)
  return content || ''
}
