import { keylessAi } from '../domain/ai'
import { effectiveModel, effectiveBaseUrl } from '../domain/ai'
import { AI_PURPOSES, allowsPersonalAi } from '../domain/routing'
import { decryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import { getAiConfig } from './client'
import { publicAiRoutes, readAiRoutes, resolveAiRoute } from './routing'
import { readState } from './chatgpt/store'
import { credentialPoolReady } from './credentials'

/** Configuration diagnostics only: never spends quota or refreshes a personal grant. */
export async function aiReadiness(actorId: number) {
  const routes = await readAiRoutes(), projection = publicAiRoutes(routes)
  const [base, personal] = await Promise.allSettled([getAiConfig(), readState(actorId)])
  return Promise.all(projection.map(async (route, index) => {
    try {
      const purpose = AI_PURPOSES[index].id, resolved = resolveAiRoute(routes, purpose)
      // Only an explicit personal choice uses the admin's ChatGPT; inherit is the site's configured provider.
      const selectedPersonal = allowsPersonalAi(purpose) && resolved.source === 'personal'
      if (selectedPersonal) {
        if (personal.status !== 'fulfilled') throw Error('personal settings')
        const s = personal.value, account = s.accounts.find(a => a.clientId === s.active), configured = s.enabled && !!s.model && !!account?.refresh
        return { ...route, readiness: { configured, source: 'personal', provider: 'chatgpt-personal', model: s.model, message: configured ? 'اتصال شخصی و مدل تنظیم شده‌اند؛ اعتبار و سهمیه با آزمایش مشخص می‌شود' : 'حساب شخصی و مدل را برای همین مدیر فعال کنید' } }
      }
      if (resolved.source === 'personal') throw Error('public personal route')
      if (resolved.source !== 'api' && base.status !== 'fulfilled') throw Error('default settings')
      const config = resolved.source === 'api' && resolved.config ? resolved.config : base.status === 'fulfilled' ? base.value : null
      if (!config) throw Error('missing config')
      const pooled = await credentialPoolReady(config)
      const configured = config.provider === 'economy' ? await (await import('./economy')).economyReady() : pooled === null ? keylessAi(config.provider) ? !!effectiveBaseUrl(config) : !!decryptPanelCredential(config.apiKey) : pooled
      return { ...route, readiness: { configured, source: 'api', provider: config.provider, model: effectiveModel(config), message: configured ? 'سرویس و مدل تنظیم شده‌اند؛ اتصال زنده با آزمایش همین کاربرد بررسی می‌شود' : 'کلید API این کاربرد یا پیش‌فرض سایت را تنظیم کنید' } }
    } catch {
      return { ...route, readiness: { configured: false, source: route.effective.source, provider: '', model: '', message: 'تنظیمات این کاربرد قابل خواندن نیست؛ اتصال و کلید ذخیره‌شده را بررسی کنید' } }
    }
  }))
}
