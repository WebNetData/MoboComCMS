import { db } from '@/platform/database/prisma'
import { auditAdminStrict, type AdminAuditInput } from '@/platform/audit/server'
import { validateAliases } from '@/platform/routing/aliases'
import { applySectionAlias, normalizePermalinks, PERMALINK_TYPES, validatePermalinks } from '@/shared/routing/permalinks'
import { ALIASES_KEY, PERMALINKS_KEY, publicRouteAliases, publishRoutingState, readRoutingState, routableSections, RouteAliasError, routingRevision } from './state'

type Context = Pick<AdminAuditInput, 'req' | 'actor'> & { expected?: string | null }
export async function saveRouting(input: { aliases?: unknown; aliasPatch?: Record<string, unknown>; templates?: unknown }, context?: Context) {
  for (let attempt = 0; ; attempt++) try {
    const state = await db.$transaction(async tx => {
      const before = await readRoutingState(tx)
      if (context?.expected && context.expected !== before.revision) throw new RouteAliasError('آدرس‌ها هم‌زمان تغییر کرده‌اند؛ صفحه را تازه کنید. پیش‌نویس شما حفظ شده است.', 409)
      const checked = validateAliases(input.aliasPatch ? { ...before.aliases, ...input.aliasPatch } : input.aliases ?? before.aliases, routableSections().map(t => t.base))
      if (!checked.ok) throw new RouteAliasError(checked.error)
      const aliases = checked.aliases, permalinks = normalizePermalinks(before.permalinks)
      if (input.templates !== undefined) {
        if (!input.templates || typeof input.templates !== 'object' || Array.isArray(input.templates)) throw new RouteAliasError('الگوهای مسیر معتبر نیستند.')
        for (const [key, value] of Object.entries(input.templates)) {
          if (!PERMALINK_TYPES.some(t => t.key === key) || typeof value !== 'string') throw new RouteAliasError('نوع محتوا یا الگوی ناشناخته است.')
          permalinks.templates[key as keyof typeof permalinks.templates] = value.trim()
        }
      }
      for (const type of PERMALINK_TYPES) {
        const old = applySectionAlias(before.permalinks.templates[type.key], before.aliases), next = applySectionAlias(permalinks.templates[type.key], aliases)
        if (old !== next) permalinks.history[type.key] = [...new Set([...(permalinks.history[type.key] || []), old])]
      }
      for (const base of new Set([...Object.keys(before.aliases), ...Object.keys(aliases)])) {
        const old = before.aliases[base] || base
        if (old !== (aliases[base] || base)) permalinks.aliasHistory[base] = [...new Set([...(permalinks.aliasHistory[base] || []), old])]
      }
      // The address a section has now is never one of its old addresses (going back to /blog must not redirect /blog to itself).
      for (const [base, history] of Object.entries(permalinks.aliasHistory)) {
        const current = aliases[base] || base, kept = history.filter((path) => path !== current)
        if (kept.length) permalinks.aliasHistory[base] = kept
        else delete permalinks.aliasHistory[base]
      }
      for (const [base, target] of Object.entries(aliases)) for (const [owner, history] of Object.entries(permalinks.aliasHistory)) if (base !== owner && history.includes(target)) throw new RouteAliasError('این آدرس در تاریخچهٔ بخش دیگری رزرو شده است.')
      const invalid = validatePermalinks(permalinks, publicRouteAliases(aliases))
      if (invalid) throw new RouteAliasError(invalid)
      for (const [key, raw, value] of [[ALIASES_KEY, before.rawAliases, JSON.stringify(aliases)], [PERMALINKS_KEY, before.rawPermalinks, JSON.stringify(permalinks)]] as const) {
        if (raw === undefined) await tx.setting.create({ data: { key, value } })
        else if ((await tx.setting.updateMany({ where: { key, value: raw }, data: { value } })).count !== 1) throw new RouteAliasError('آدرس‌ها هم‌زمان تغییر کرده‌اند.', 409)
      }
      const revision = routingRevision(aliases, permalinks)
      if (context) await auditAdminStrict({ ...context, action: 'site.routes.update', targetType: 'setting', targetId: ALIASES_KEY, metadata: { before: before.revision, revision, aliases, templates: permalinks.templates } }, tx)
      return { aliases, permalinks, revision }
    }, { isolationLevel: 'Serializable', timeout: 20000 })
    return publishRoutingState(state)
  } catch (error) {
    if (['P2034', 'P2002'].includes(String((error as { code?: string }).code)) && attempt < 3) continue
    throw error
  }
}
export async function saveRouteAliases(aliases: unknown, context?: Context) { return (await saveRouting({ aliases }, context)).aliases }
