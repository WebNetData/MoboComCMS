import { observeAi } from './telemetry'
import { providerUsage, type AiUsage } from '../domain/telemetry'
import { keylessAi, configurableAiBase, AI_PROVIDERS } from '../domain/ai'
import Anthropic from '@anthropic-ai/sdk'
import { db } from '@/platform/database/prisma'
import { decryptPanelCredential, encryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import { DEFAULT_AI, effectiveBaseUrl, effectiveModel, normalizeAiConfig, type AiConfig, type Prompt } from '@/modules/ai/domain/ai'
// The AI providers go through the Server Panel's Xray profile for the "ai" purpose when one is chosen; otherwise directly.
import { egressFetch, egressRoute } from '@/modules/social/server/egress'
import { personalAiActor } from './admin-context'
import { personalAiPurpose } from './admin-context'
import type { AiPurpose } from '../domain/routing'
import { readAiRoutes, resolveAiRoute } from './routing'
import { AiError } from './error'
import { credentialPoolReady, generateWithCredentialPool } from './credentials'
import { providerJson } from './provider-json'
export { AiError } from './error'

const KEY = 'ai.config.v1'
const TIMEOUT_MS = 120_000

export async function getAiConfig(): Promise<AiConfig> {
  const row = await db.setting.findUnique({ where: { key: KEY } }).catch(() => { throw new AiError('خواندن تنظیمات هوش مصنوعی انجام نشد؛ دوباره تلاش کنید', 503) })
  if (!row) return { ...DEFAULT_AI }
  try {
    const stored = JSON.parse(row.value)
    if (!stored || typeof stored !== 'object' || Array.isArray(stored) || !AI_PROVIDERS.some(p=>p.id===stored.provider) || (stored.apiKey !== undefined && typeof stored.apiKey !== 'string')) throw new Error('invalid settings')
    // Form limits apply to new plaintext input, never to the larger encrypted envelope in storage.
    return { ...normalizeAiConfig({ ...stored, apiKey: '' }), apiKey: stored.apiKey || '' }
  } catch {
    throw new AiError('تنظیمات ذخیره‌شدهٔ هوش مصنوعی قابل خواندن نیست؛ دادهٔ قبلی حفظ شد', 503)
  }
}

export async function saveAiConfig(input: Record<string, unknown>): Promise<AiConfig> {
  const previous = await getAiConfig()
  const next = normalizeAiConfig(input, previous)
  if (configurableAiBase(next.provider) && input.baseUrl && !next.baseUrl) throw new AiError('نشانی سرویس معتبر نیست؛ کلید یا نشانی دارای اطلاعات ورود پذیرفته نمی‌شود')
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

export interface AiResult { text: string; model: string; provider: string; usage?: AiUsage; observationId?: string }

/** Public feature availability follows its own API binding, never an Admin grant. */
export async function publicAiReady(purpose: 'support' | 'prompts') {
  const route = resolveAiRoute(await readAiRoutes(), purpose)
  if (route.source === 'personal') return false
  const config = route.source === 'api' && route.config ? route.config : await getAiConfig()
  const pooled = await credentialPoolReady(config)
  return config.provider === 'economy' ? (await import('./economy')).economyReady() : pooled === null ? keylessAi(config.provider) || !!config.apiKey : pooled
}

/** Runs one prompt on the configured provider and returns its text. */
export async function generate(prompt: Prompt, config?: AiConfig, purpose?: AiPurpose, signal?: AbortSignal): Promise<AiResult> {
  const actor = personalAiActor()
  const selected = purpose || personalAiPurpose() || (actor !== undefined ? 'admin' : undefined)
  const route = selected ? resolveAiRoute(await readAiRoutes(), selected) : { source: 'inherit' as const }
  // Owner 2026-11-11: an admin's personal ChatGPT serves only purposes explicitly set to it (directly or by inheriting
  // an Admin default set to it). "Inherit" with no such choice means the site's own configured provider, e.g. Gemini.
  if (route.source === 'personal') {
    if (actor === undefined) throw new AiError('ورود مدیر برای استفاده از حساب شخصی ChatGPT لازم است', 403)
    const { personalGenerate, ChatGptError } = await import('./chatgpt')
    try { const personal = await personalGenerate(actor, prompt); if (personal) return personal; throw new AiError('اتصال شخصی ChatGPT را در تنظیمات حساب خودتان فعال کنید', 409) }
    catch (error) { if (error instanceof ChatGptError) throw new AiError(error.message, error.status); throw error }
  }
  const settings = route.source === 'api' && route.config ? route.config : config || await getAiConfig()
  return generateApi(prompt, settings, { support: selected === 'support', purpose: selected, signal })
}

/** Explicit API transport: never consults actor/personal routing or falls back to ChatGPT. */
export async function generateApi(prompt: Prompt, settings: AiConfig, options: { support?: boolean; signal?: AbortSignal; purpose?: AiPurpose } = {}): Promise<AiResult> {
  if (settings.provider === 'economy') return (await import('./economy')).generateEconomy(prompt, settings, options, generateApi)
  const model = effectiveModel(settings)
  const observed = await observeAi({ purpose: options.purpose, provider: settings.provider, model }, async (attempt, usage) => {
    const combined = (signal?: AbortSignal) => AbortSignal.any([AbortSignal.timeout(TIMEOUT_MS), ...(signal ? [signal] : []), ...(options.signal ? [options.signal] : [])])
    let reported: AiUsage | undefined
    const call = async (key: string, signal?: AbortSignal) => {
      attempt()
      const reply = settings.provider === 'anthropic'
        ? await claude(key, model, prompt, options.support === true, combined(signal))
        : await openAiCompatible(effectiveBaseUrl(settings), key, model, prompt, settings.provider, combined(signal))
      reported = reply.usage; usage(reported)
      if (!reply.text.trim()) throw new AiError('پاسخی از هوش مصنوعی دریافت نشد؛ درخواست تکرار نشد', 502)
      return reply.text
    }
    const pooled = await generateWithCredentialPool(settings, call)
    if (pooled !== null) return { text: pooled, model, provider: settings.provider, usage: reported }
    let apiKey = ''
    try { apiKey = decryptPanelCredential(settings.apiKey) } catch { throw new AiError('کلید API قابل خواندن نیست؛ دوباره آن را ذخیره کنید') }
    if (!apiKey && !keylessAi(settings.provider)) throw new AiError('ابتدا کلید API سرویس را در تنظیمات دستیار وارد کنید')
    return { text: await call(apiKey), model, provider: settings.provider, usage: reported }
  })
  return { ...observed.value, observationId: observed.observationId }
}

async function claude(apiKey: string, model: string, prompt: Prompt, support = false, signal?: AbortSignal): Promise<{ text: string; usage?: AiUsage }> {
  const client = new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 0, fetch: egressFetch as unknown as typeof fetch })
  try {
    const response = await client.beta.messages.create({
      model,
      // Adaptive thinking shares this budget with the answer.
      max_tokens: support ? prompt.maxTokens : Math.max(prompt.maxTokens, 16000),
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
      ...(!support ? { thinking: { type: 'adaptive' as const } } : {}),
    }, { signal })
    if (response.stop_reason === 'refusal') throw new AiError('مدل به این درخواست پاسخ نداد؛ موضوع یا متن را تغییر دهید', 422)
    return { text: response.content.map((block) => block.type === 'text' ? block.text : '').join(''), usage: providerUsage(response.usage, 'anthropic') }
  } catch (error) {
    if (error instanceof AiError) throw error
    if (error instanceof Anthropic.AuthenticationError) throw new AiError('کلید API کلاد نامعتبر است', 401, 'auth')
    if (error instanceof Anthropic.RateLimitError) throw new AiError('محدودیت تعداد درخواست کلاد؛ کمی بعد دوباره تلاش کنید', 429, 'rate')
    if (error instanceof Anthropic.APIError) throw new AiError(`سرویس کلاد درخواست را نپذیرفت (HTTP ${error.status || 502})؛ مدل و دسترسی پروژه را بررسی کنید`, 502, error.status === 402 ? 'quota' : !error.status || error.status >= 500 ? 'unavailable' : undefined, !!error.status)
    throw new AiError('اتصال به کلاد برقرار نشد؛ درخواست دوباره خودکار ارسال نشد', 502, 'unavailable', false)
  }
}

function settingsJson(provider: string) {
  return { ...(provider !== 'custom' ? { response_format: { type: 'json_object' } } : {}), ...(provider === 'deepseek' ? { thinking: { type: 'disabled' } } : {}), ...(provider === 'qwen' ? { enable_thinking: false } : {}) }
}

async function openAiCompatible(baseUrl: string, apiKey: string, model: string, prompt: Prompt, provider: string, signal?: AbortSignal): Promise<{ text: string; usage?: AiUsage }> {
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
  let data: { usage?: unknown; choices?: { message?: { content?: string }; finish_reason?: string }[]; error?: { message?: string; code?: string } | string } | null
  try {
    response = await egressFetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, max_tokens: prompt.maxTokens, temperature: 0.7, ...reasoning, ...(prompt.json && settingsJson(provider)), messages: [{ role: 'system', content: prompt.system }, { role: 'user', content: prompt.user }] }),
      signal: signal || AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    })
    // A rejected HTTP request may carry HTML from an edge proxy. Classify the
    // status without exposing that body; malformed successful output is never replayed.
    data = await providerJson(response)
  } catch (error) {
    if (error instanceof SyntaxError) throw new AiError(`پاسخ سرویس هوش مصنوعی JSON معتبر نبود؛ ${routeHint}`, 502, 'unavailable', false)
    throw new AiError(`اتصال یا دریافت پاسخ سرویس هوش مصنوعی کامل نشد؛ ${routeHint}`, 502, 'unavailable', false)
  }
  if (!response.ok) {
    const detail = typeof data?.error === 'string' ? data.error : data?.error?.message || response.statusText
    if (/user location is not supported|unsupported (?:country|region|location)|not (?:available|supported) in (?:your|this) (?:country|region|location)/i.test(detail)) throw new AiError(`سرویس محدودیت جغرافیایی برای IP خروجی اعلام کرد؛ ${routeHint}`, 403)
    if (response.status === 401 || /API[_ ]KEY[_ ](?:INVALID|NOT[_ ]VALID)|invalid API key/i.test(detail)) throw new AiError('کلید API نامعتبر است؛ کلید همین سرویس را دوباره وارد کنید', 401, 'auth')
    if (response.status === 403) throw new AiError(`سرویس دسترسی این کلید یا پروژه را نپذیرفت (403)؛ مجوز API و محدودیت IP کلید را بررسی کنید؛ ${routeHint}`, 403)
    if (response.status === 402 || response.status === 429) throw new AiError('سهمیه یا محدودیت درخواست سرویس تمام شده؛ سهمیه و وضعیت پرداخت پروژه را بررسی کنید', response.status, response.status === 402 || /insufficient_quota|quota.*exceed|credit|billing/i.test(detail + (typeof data?.error === 'object' ? data.error?.code || '' : '')) ? 'quota' : 'rate')
    if (response.status === 404) throw new AiError('مدل یا نشانی API پیدا نشد؛ نام مدل و دسترسی پروژه به آن را بررسی کنید', 404)
    // Provider errors may echo credentials or user input; return a bounded, secret-free diagnostic.
    throw new AiError(`سرویس هوش مصنوعی درخواست را نپذیرفت (HTTP ${response.status})؛ مدل و تنظیمات سرویس را بررسی کنید`, 502, response.status >= 500 ? 'unavailable' : undefined)
  }
  const content = data?.choices?.[0]?.message?.content
  if (content != null && typeof content !== 'string') throw new AiError('قالب پاسخ سرویس هوش مصنوعی با پاسخ متنی سازگار نیست', 502, 'unavailable', false)
  if (prompt.json && data?.choices?.[0]?.finish_reason === 'length') throw new AiError('پاسخ JSON مدل ناقص شد؛ سقف خروجی را بررسی کنید. درخواست تکرار نشد', 502, 'unavailable', false)
  if (data?.choices?.[0]?.finish_reason === 'content_filter') throw new AiError('سرویس به این درخواست پاسخ نداد؛ موضوع یا متن را تغییر دهید', 422)
  if (data?.choices?.[0]?.finish_reason === 'length' && !content?.trim()) throw new AiError('بودجهٔ توکن مدل پیش از تولید پاسخ تمام شد؛ سقف خروجی یا تنظیم تفکر مدل را بررسی کنید', 502)
  return { text: content || '', usage: providerUsage(data?.usage) }
}
