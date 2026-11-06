import { db } from '@/platform/database/prisma'
import { updateJsonSetting } from '@/modules/settings/server'
import { auditAdminStrict, type AdminAuditInput } from '@/platform/audit/server'
import { decryptPanelCredential, encryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import { AI_PROVIDERS, DEFAULT_AI, normalizeAiConfig, type AiConfig } from '../domain/ai'
import { AI_PURPOSES, allowsPersonalAi, isAiPurpose, parentAiPurpose, type AiPurpose, type AiSource } from '../domain/routing'
import { AiError } from './error'

const KEY = 'ai.routing.v1'
type Route = { source: AiSource; config?: AiConfig }
type Routes = Partial<Record<AiPurpose, Route>>
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
function decode(value: Record<string, unknown>): Routes {
  if (!Object.keys(value).length) return {}
  if (value.version !== 1 || !object(value.routes)) throw new AiError('تنظیمات کاربردهای هوش مصنوعی قابل خواندن نیست؛ اطلاعات قبلی حفظ شد', 503)
  for (const [purpose, route] of Object.entries(value.routes)) {
    if (!isAiPurpose(purpose) || !object(route) || typeof route.source !== 'string' || !['inherit', 'api', 'personal'].includes(route.source) || (route.source === 'personal' && !allowsPersonalAi(purpose))) throw new AiError('تنظیمات کاربردهای هوش مصنوعی معتبر نیست؛ اطلاعات قبلی حفظ شد', 503)
    const config = route.config
    if (config !== undefined && (!object(config) || !AI_PROVIDERS.some(p => p.id === config.provider) || !['apiKey', 'model', 'baseUrl', 'voice', 'botName'].every(k => typeof config[k] === 'string'))) throw new AiError('تنظیمات API کاربرد قابل خواندن نیست', 503)
    if (route.source === 'api' && !route.config) throw new AiError('تنظیمات API کاربرد کامل نیست', 503)
  }
  return value.routes as Routes
}
export async function readAiRoutes(): Promise<Routes> {
  try { const row = await db.setting.findUnique({ where: { key: KEY } }); if (!row) return {}; const value: unknown = JSON.parse(row.value); if (!object(value)) throw new Error(); return decode(value) }
  catch (error) { if (error instanceof AiError) throw error; throw new AiError('خواندن تنظیمات کاربردهای هوش مصنوعی انجام نشد', 503) }
}
export function resolveAiRoute(routes: Routes, purpose: AiPurpose): Route & { inheritedFrom?: AiPurpose } {
  if (!isAiPurpose(purpose)) throw new AiError('کاربرد هوش مصنوعی معتبر نیست')
  const selected = routes[purpose]
  if (selected && selected.source !== 'inherit') return selected
  const parent = parentAiPurpose(purpose)
  return parent ? { ...resolveAiRoute(routes, parent), inheritedFrom: parent } : { source: 'inherit' }
}
export function publicAiRoutes(routes: Routes) {
  return AI_PURPOSES.map(p => {
    const route = routes[p.id], config = route?.config
    let hasKey = false
    try { hasKey = !!config?.apiKey && !!decryptPanelCredential(config.apiKey) } catch { /* unreadable key remains stored */ }
    const effective = resolveAiRoute(routes, p.id)
    return { ...p, source: route?.source || 'inherit', config: config ? { ...config, apiKey: '', hasKey } : null, effective: { source: effective.source, provider: effective.config?.provider || '', model: effective.config?.model || '', inheritedFrom: effective.inheritedFrom || '' } }
  })
}
export async function saveAiRoute(purpose: AiPurpose, input: Record<string, unknown>, audit?: AdminAuditInput) {
  if (!isAiPurpose(purpose)) throw new AiError('کاربرد هوش مصنوعی معتبر نیست')
  if (input.source !== undefined && (typeof input.source !== 'string' || !['inherit', 'api', 'personal'].includes(input.source))) throw new AiError('روش اتصال معتبر نیست')
  if (input.config !== undefined && !object(input.config)) throw new AiError('تنظیمات API معتبر نیست')
  const patch = (input.config || {}) as Record<string, unknown>
  if (Object.keys(patch).some(k => !['provider', 'model', 'baseUrl', 'apiKey', 'clearKey'].includes(k)) || Object.entries(patch).some(([k, v]) => k === 'clearKey' ? typeof v !== 'boolean' : typeof v !== 'string')) throw new AiError('فیلدهای تنظیمات API معتبر نیستند')
  if (typeof patch.provider === 'string' && !AI_PROVIDERS.some(p => p.id === patch.provider)) throw new AiError('سرویس API معتبر نیست')
  if (Object.entries(patch).some(([k, v]) => typeof v === 'string' && v.length > (k === 'model' ? 120 : k === 'apiKey' ? 400 : 300))) throw new AiError('مقدار واردشده بیش از حد طولانی است')
  return updateJsonSetting(KEY, async (value, tx) => {
    const routes = decode(value), old = routes[purpose] || { source: 'inherit' }, source = (input.source || old.source) as AiSource
    if (source === 'personal' && !allowsPersonalAi(purpose)) throw new AiError('حساب شخصی ChatGPT فقط برای ابزارهای مدیریت است')
    let config = old.config
    if (Object.keys(patch).length || (source === 'api' && !config)) {
      const previous = config || { ...DEFAULT_AI }, next = normalizeAiConfig({ ...previous, ...patch, apiKey: '' })
      if (patch.baseUrl !== undefined && next.provider === 'custom' && patch.baseUrl && !next.baseUrl) throw new AiError('نشانی API معتبر نیست')
      if (patch.model !== undefined && patch.model !== next.model) throw new AiError('نام مدل معتبر نیست')
      const replaced = typeof patch.apiKey === 'string' && patch.apiKey.trim() && !patch.apiKey.startsWith('••••')
      const sameDestination = previous.provider === next.provider && previous.baseUrl === next.baseUrl
      next.apiKey = patch.clearKey === true ? '' : replaced ? encryptPanelCredential(String(patch.apiKey).trim()) : sameDestination ? previous.apiKey : ''
      config = next
    }
    routes[purpose] = { source, ...(config ? { config } : {}) }; value.version = 1; value.routes = routes
    if (audit) await auditAdminStrict(audit, tx)
    return publicAiRoutes(routes)
  })
}
