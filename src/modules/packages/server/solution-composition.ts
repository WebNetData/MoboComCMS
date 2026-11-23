import type { Prisma } from '@prisma/client'
import { requirePerm } from '@/modules/identity/server/access'
import { planSolutionRoles, applySolutionRoles } from '@/modules/identity/server/role-provision'
import { planSiteDefaults, applySiteDefaults } from '@/modules/site/config/provision'
import { planStarterContent, applyStarterContent } from '@/modules/site/server/starter-content'
import type { SolutionPack } from '@/modules/packages/domain/solution-pack'
import type { SolutionCompositionPlan } from '@/modules/packages/domain/solution-plan'
import type { SolutionCompositionReceipt } from '@/modules/packages/domain/solution-receipt'
import { PackageError } from '@/modules/packages/domain/format'
import { PackageAuthorityError, type PackageCommandContext } from './store/authority'

/** A pack coordinates existing owners; it never writes their rows directly. */
export async function compositionAuthority(pack: SolutionPack, context: PackageCommandContext, tx: Prisma.TransactionClient) {
  for (const [needed, permission, message] of [
    [!!pack.roles?.length, 'roles.manage', 'برای نقش‌های این بسته، دسترسی مدیریت نقش‌ها لازم است.'],
    [!!pack.starterContent?.length, 'cms.pages', 'برای محتوای اولیهٔ این بسته، دسترسی مدیریت صفحات لازم است.'],
  ] as const) {
    if (!needed) continue
    const actor = await requirePerm(context.req, permission, tx)
    if (!actor || actor.id !== context.actor.id) throw new PackageAuthorityError(message)
  }
}

export async function planComposition(pack: SolutionPack, previous: SolutionCompositionReceipt | undefined, context: PackageCommandContext, tx: Prisma.TransactionClient) {
  if (pack.apiVersion !== 2) return { composition: undefined, revisions: undefined }
  const plannedModules = new Set(pack.modules.map(item => item.id))
  const site = pack.theme || pack.navigation !== undefined
    ? await planSiteDefaults({ ...(pack.theme ? { theme: pack.theme } : {}), ...(pack.navigation !== undefined ? { navigation: pack.navigation } : {}) }, tx, context.req.headers.get('host') || context.req.nextUrl.host) : undefined
  const roles = pack.roles?.length ? await planSolutionRoles(context.req, pack.roles, previous?.roles || [], tx, plannedModules) : undefined
  const pages = pack.starterContent?.length ? await planStarterContent(context.req, pack.starterContent, previous?.starterContent || [], tx, plannedModules) : undefined
  const composition: SolutionCompositionPlan = {
    ...(site?.theme ? { theme: site.theme } : {}), ...(site?.navigation ? { navigation: site.navigation } : {}),
    ...(roles ? { roles: roles.items } : {}), ...(pages ? { starterContent: pages.items } : {}),
  }
  return { composition, revisions: { site: site?.revision, roles: roles?.revision, pages: pages?.revision } }
}

function retain<T>(previous: readonly T[], current: readonly T[], key: (item: T) => string): T[] {
  const merged = new Map(previous.map(item => [key(item), item]))
  for (const item of current) merged.set(key(item), item)
  if (merged.size > 100) throw new PackageError('سابقهٔ منابع این بسته به سقف مجاز رسیده است؛ بسته را پیش از ادامه بررسی کنید.')
  return [...merged.values()]
}

const navigationCount = (items: NonNullable<SolutionPack['navigation']>): number => items.reduce((count, item) => count + 1 + navigationCount(item.children || []), 0)

/** After module writes, every owner checks the real transaction state again. */
export async function applyComposition(pack: SolutionPack, previous: SolutionCompositionReceipt | undefined, context: PackageCommandContext, tx: Prisma.TransactionClient) {
  // Keep resource bindings through composition-free upgrades and temporary omissions.
  if (pack.apiVersion !== 2) return { receipt: previous, siteChanged: false }
  const site = pack.theme || pack.navigation !== undefined
    ? await applySiteDefaults(context.req, { ...(pack.theme ? { theme: pack.theme } : {}), ...(pack.navigation !== undefined ? { navigation: pack.navigation } : {}) }, tx) : undefined
  const roles = pack.roles?.length ? await applySolutionRoles(context.req, pack.roles, previous?.roles || [], tx) : undefined
  const pages = pack.starterContent?.length ? await applyStarterContent(context.req, pack.starterContent, previous?.starterContent || [], tx) : undefined
  const roleBindings = retain(previous?.roles || [], (roles?.items || []).flatMap(item => item.owned && item.roleId ? [{ template: item.template, roleId: item.roleId }] : []), item => item.template)
  const pageBindings = retain(previous?.starterContent || [], (pages?.items || []).flatMap(item => item.owned && item.pageId ? [{ key: item.key, pageId: item.pageId }] : []), item => item.key)
  const receipt: SolutionCompositionReceipt = {
    ...(site?.theme ? { theme: { id: site.theme.id, action: site.theme.action } } : {}),
    ...(site?.navigation ? { navigation: { action: site.navigation.action, count: navigationCount(site.navigation.items) } } : {}),
    ...(roleBindings.length ? { roles: roleBindings } : {}), ...(pageBindings.length ? { starterContent: pageBindings } : {}),
  }
  return { receipt, siteChanged: site?.theme?.action === 'set' || site?.navigation?.action === 'set' }
}
