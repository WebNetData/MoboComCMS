import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import type { NextRequest } from 'next/server'
import { assistantMenuHref, patchAssistantMenu, siteMenuRevision, updateSiteConfiguration, type MenuChange } from '@/modules/navigation/server/assistant-menu'
import { ICON_NAMES } from '@/shared/icons'
import { bundledThemes } from '@/themes/registry'
import { getSiteConfigFrom, SITE_KEY } from './store'
import { validateMenu, validateSite } from './validation'
import type { SiteLink } from './types'

export class SiteDefaultsError extends Error {}

export interface SiteDefaultLink { label: string; href: string; icon?: string; children?: SiteDefaultLink[] }
export interface SiteDefaults { theme?: { id: string }; navigation?: SiteDefaultLink[] }
export interface SiteDefaultsPlan {
  revision: string
  theme?: { id: string; name: string; action: 'set' | 'preserve'; current: string }
  navigation?: { action: 'set' | 'preserve'; items: SiteDefaultLink[] }
}

/** Validate the same menu shape as the existing writer without generating persistent IDs. */
async function planNavigation(input: SiteDefaultLink[], tx: Prisma.TransactionClient, localHost?: string) {
  let count = 0
  const pageSlugs = new Set<string>()
  function convert(items: SiteDefaultLink[], depth: number): { plain: SiteDefaultLink[]; menu: SiteLink[] } {
    if (!Array.isArray(items) || depth > 4) throw new SiteDefaultsError('فهرست منوی بسته معتبر نیست.')
    const plain: SiteDefaultLink[] = [], menu: SiteLink[] = []
    for (const item of items) {
      if (++count > 20 || !item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some(key => !['label', 'href', 'icon', 'children'].includes(key)) || typeof item.label !== 'string' || !item.label.trim() || item.label.length > 160 || typeof item.href !== 'string' || !assistantMenuHref(item.href) || (item.icon !== undefined && (typeof item.icon !== 'string' || (item.icon !== '' && !ICON_NAMES.includes(item.icon))))) throw new SiteDefaultsError('پیوند یا آیکون منوی بسته معتبر نیست.')
      const url = new URL(item.href, 'https://menu.invalid')
      let pathname = url.pathname
      for (let i = 0; i < 3; i++) { const decoded = decodeURIComponent(pathname); if (decoded === pathname) break; pathname = decoded }
      const local = item.href.startsWith('/') || !localHost || url.host.toLowerCase() === localHost.toLowerCase()
      if (local && /^\/p(?:\/|$)/i.test(pathname)) {
        const match = /^\/p\/([^/]+)\/?$/i.exec(pathname)
        if (!match) throw new SiteDefaultsError('نشانی صفحهٔ منو معتبر نیست.')
        pageSlugs.add(match[1])
      }
      const children = item.children === undefined ? undefined : convert(item.children, depth + 1)
      const icon = item.icon ?? ''
      plain.push({ label: item.label, href: item.href, ...(item.icon !== undefined ? { icon } : {}), ...(children ? { children: children.plain } : {}) })
      menu.push({ label: { fa: item.label, en: '' }, href: item.href, icon, ...(children ? { children: children.menu } : {}) })
    }
    return { plain, menu }
  }
  const converted = convert(input, 1)
  if (!validateMenu(converted.menu)) throw new SiteDefaultsError('منوی بسته معتبر نیست.')
  const pages = []
  for (const slug of [...pageSlugs].sort()) {
    const page = await tx.page.findUnique({ where: { slug }, select: { slug: true, status: true } })
    if (!page || page.status !== 'PUBLISHED') throw new SiteDefaultsError(`صفحهٔ «${slug}» منتشر نشده است؛ نمی‌توان آن را به منوی عمومی افزود.`)
    pages.push(page)
  }
  return { items: converted.plain, pages }
}

/** Preview validates the candidate even when a customer's existing value is preserved. */
export async function planSiteDefaults(input: SiteDefaults, tx: Prisma.TransactionClient, localHost?: string): Promise<SiteDefaultsPlan> {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => key !== 'theme' && key !== 'navigation')) throw new SiteDefaultsError('تنظیمات ظاهری بسته معتبر نیست.')
  const row = await tx.setting.findUnique({ where: { key: SITE_KEY } })
  let raw: Record<string, unknown> = {}
  if (row) {
    try {
      const parsed: unknown = JSON.parse(row.value)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new SiteDefaultsError('invalid object')
      raw = parsed as Record<string, unknown>
    } catch { throw new SiteDefaultsError('تنظیمات ذخیره‌شدهٔ سایت معتبر نیست؛ ابتدا بازیابی کنید.') }
  }
  const current = await getSiteConfigFrom(tx, true)
  if (current.themes.some(theme => bundledThemes.some(bundled => bundled.id === theme.id))) throw new SiteDefaultsError('شناسهٔ قالب با قالب داخلی تداخل دارد.')
  const themes = [...bundledThemes, ...current.themes]
  let theme: SiteDefaultsPlan['theme']
  if (input.theme !== undefined) {
    if (!input.theme || typeof input.theme !== 'object' || Array.isArray(input.theme) || Object.keys(input.theme).some(key => key !== 'id') || typeof input.theme.id !== 'string') throw new SiteDefaultsError('قالب بسته معتبر نیست.')
    const selected = themes.find(item => item.id === input.theme!.id)
    if (!selected) throw new SiteDefaultsError('قالب پیشنهادی بسته نصب نشده است.')
    theme = { id: selected.id, name: selected.name, action: Object.hasOwn(raw, 'themeId') ? 'preserve' : 'set', current: current.themeId }
  }
  const nav = input.navigation === undefined ? undefined : await planNavigation(input.navigation, tx, localHost)
  const navigation: SiteDefaultsPlan['navigation'] = nav ? { action: Object.hasOwn(raw, 'navigation') ? 'preserve' : 'set', items: nav.items } : undefined
  const candidate = { ...current, ...(theme?.action === 'set' ? { themeId: theme.id } : {}), ...(navigation?.action === 'set' ? { navigation: navigation.items.map(item => ({ label: { fa: item.label, en: '' }, href: item.href })) } : {}) }
  // Full nested menu validation ran above; full SiteConfig validation protects unrelated fields.
  if (!validateSite(candidate)) throw new SiteDefaultsError('تنظیمات سایت یا قالب بسته معتبر نیست.')
  const revision = createHash('sha256').update(JSON.stringify({ stored: row?.value ?? null, current, themes, pages: nav?.pages ?? [], localHost: localHost?.toLowerCase() ?? null })).digest('hex')
  return { revision, ...(theme ? { theme } : {}), ...(navigation ? { navigation } : {}) }
}

/** Caller owns a serializable transaction and invalidates settings cache after it commits. */
export async function applySiteDefaults(req: NextRequest, input: SiteDefaults, tx: Prisma.TransactionClient, expectedRevision?: string): Promise<SiteDefaultsPlan> {
  const plan = await planSiteDefaults(input, tx, req.headers.get('host') || req.nextUrl.host)
  if (expectedRevision !== undefined && expectedRevision !== plan.revision) throw new SiteDefaultsError('تنظیمات سایت تغییر کرده است؛ پیش‌نمایش را تازه کنید.')
  if (plan.theme?.action !== 'set' && plan.navigation?.action !== 'set') return plan
  const toChanges = (items: SiteDefaultLink[]): MenuChange[] => items.map(item => ({ label: item.label, href: item.href, icon: item.icon ?? '', ...(item.children ? { children: toChanges(item.children) } : {}) }))
  const current = await getSiteConfigFrom(tx, true)
  await updateSiteConfiguration(req, siteMenuRevision(current), site => ({
    ...site,
    ...(plan.theme?.action === 'set' ? { themeId: plan.theme.id } : {}),
    ...(plan.navigation?.action === 'set' ? { navigation: patchAssistantMenu([], toChanges(plan.navigation.items)) } : {}),
  }), undefined, { transaction: tx })
  return plan
}
