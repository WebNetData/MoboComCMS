import type { Prisma } from '@prisma/client'
import type { NextRequest } from 'next/server'
import { createHash } from 'node:crypto'
import { db } from '@/platform/database/prisma'
import { getSiteConfigFrom } from '@/modules/site/config/store'
import type { SiteLink } from '@/modules/site/config/types'
import { identifyMenu } from '@/modules/site/config/menus'
import { MEGA_SECTIONS, normalizeMegaConfig, type MegaSection } from '@/modules/navigation/domain/megamenu'
import { megaConfigRevision, saveMegaConfig } from '@/modules/navigation/server/megamenu'
import { patchAssistantMenu, siteMenuRevision, updateSiteConfiguration, type MenuChange } from '@/modules/navigation/server/assistant-menu'
import { isModuleEnabled } from '@/extensions/server/modules'
import { requirePerm } from '@/modules/identity/server/access'
import { recordRevision } from '@/modules/content/server/revisions'
import { configurationSnapshot } from '@/modules/settings/server/configuration-history'
import { auditAdminStrict } from '@/platform/audit/server'
import { AiOperationError } from '../../domain/operations'

type Reader = Prisma.TransactionClient | typeof db
type Selection = { menu?: unknown; section?: unknown }
type MenuOperation = { args: Record<string, unknown> }
type Guard = (tx: Prisma.TransactionClient) => Promise<void>
type Commit = (tx: Prisma.TransactionClient, result: Record<string, unknown>) => Promise<void>
type Actor = { id: number; email: string; roleId?: number | null; permissions?: string[] | null }
const target = (args: { menu?: unknown; section?: unknown }) => {
  const menu = args.menu
  if (!['header', 'footer', 'footerExplore', 'footerAccount', 'section'].includes(String(menu))) throw new AiOperationError('منوی انتخاب‌شده معتبر نیست')
  if (menu === 'section' && !(MEGA_SECTIONS as readonly unknown[]).includes(args.section)) throw new AiOperationError('بخش منو معتبر نیست')
  return { menu: menu as 'header' | 'footer' | 'footerExplore' | 'footerAccount' | 'section', section: args.section as MegaSection }
}
async function readMega(reader: Reader) {
  const row = await reader.setting.findUnique({ where: { key: 'site.megamenu.v1' } })
  try { const raw = row ? JSON.parse(row.value) : {}; if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error(); return normalizeMegaConfig(raw) }
  catch { throw new AiOperationError('تنظیمات منو نیاز به بررسی دارد', 409) }
}
function identifyAssistantMenu(items: SiteLink[], menu: string, section?: string) {
  const used = new Set<string>()
  const collect = (rows: SiteLink[]) => rows.forEach(row => { if (row.id) used.add(row.id); if (row.children) collect(row.children) })
  collect(items)
  return identifyMenu(items, (link, path) => {
    let salt = 0, id: string
    do {
      const digest = createHash('sha256').update(JSON.stringify([menu, section ?? null, path, link, salt++])).digest('hex')
      id = `ai-${digest}`
    } while (used.has(id))
    used.add(id)
    return id
  })
}
async function readTarget(selection: Selection, reader: Reader) {
  const chosen = target(selection)
  if (chosen.menu === 'section') {
    if (!await isModuleEnabled('mega-menu', reader)) throw new AiOperationError('ماژول منوی بخش غیرفعال است', 409)
    const config = await readMega(reader)
    return { ...chosen, items: identifyAssistantMenu(config.sections[chosen.section].customItems, chosen.menu, chosen.section), revision: megaConfigRevision(config), fallback: false }
  }
  const config = await getSiteConfigFrom(reader, true)
  if (chosen.menu === 'footerAccount' && config.footerAccount === undefined) throw new AiOperationError('ابتدا منوی حساب را در تنظیمات منو به‌صورت مستقل تنظیم کنید', 409)
  const items = chosen.menu === 'header' ? config.navigation : chosen.menu === 'footerExplore' ? config.footerExplore ?? config.navigation : chosen.menu === 'footerAccount' ? config.footerAccount! : config.footer
  return { ...chosen, items: identifyAssistantMenu(items, chosen.menu), revision: siteMenuRevision(config), fallback: chosen.menu === 'footerExplore' && config.footerExplore === undefined }
}
function bounded(items: SiteLink[]) {
  let remaining = 40, total = 0
  const walk = (rows: SiteLink[]): object[] => rows.flatMap(row => {
    total++
    if (remaining-- <= 0) { const count = (children: SiteLink[]) => children.forEach(c => { total++; count(c.children || []) }); count(row.children || []); return [] }
    return [{ id: row.id, label: row.label.fa, href: row.href, icon: row.icon, enabled: row.enabled !== false, ...(row.children ? { children: walk(row.children) } : {}) }]
  })
  const tree = walk(items)
  return { tree, total, truncated: total > 40 }
}
/** The patch itself is bounded to 20 nodes, so every actionable change fits. */
function changesPreview(before: SiteLink[], after: SiteLink[], patches: MenuChange[]) {
  const changes: Array<{ id?: string; action: 'add' | 'update'; parent: string; label: string; href: string; icon: string; enabled: boolean; beforeLabel?: string; beforeHref?: string; beforeIcon?: string; beforeEnabled?: boolean }> = []
  const walk = (oldRows: SiteLink[], newRows: SiteLink[], rows: MenuChange[], parent: string) => {
    let added = oldRows.length
    for (const patch of rows) {
      const old = patch.id === undefined ? undefined : oldRows.find(row => row.id === patch.id)
      const next = patch.id === undefined ? newRows[added++] : newRows.find(row => row.id === patch.id)
      if (!next) throw new AiOperationError('پیش‌نمایش تغییر منو معتبر نیست', 409)
      changes.push({ ...(old?.id ? { id: old.id } : {}), action: old ? 'update' : 'add', parent, label: next.label.fa, href: next.href, icon: next.icon ?? '', enabled: next.enabled !== false, ...(old ? { beforeLabel: old.label.fa, beforeHref: old.href, beforeIcon: old.icon ?? '', beforeEnabled: old.enabled !== false } : {}) })
      if (patch.children?.length) walk(old?.children ?? [], next.children ?? [], patch.children, parent ? `${parent} / ${next.label.fa}` : next.label.fa)
    }
  }
  walk(before, after, patches, 'ریشه')
  return changes
}
export async function menuContext(reader: Reader = db, selection?: Selection) {
  if (!selection?.menu) return { note: 'برای دیدن منو، هدف مشخص لازم است.' }
  const current = await readTarget(selection, reader)
  return { menu: current.menu, ...(current.menu === 'section' ? { section: current.section } : {}), revision: current.revision, fallback: current.fallback, ...bounded(current.items) }
}
export async function menuPreview(op: MenuOperation, reader: Reader = db) {
  const current = await readTarget(op.args, reader)
  let next: SiteLink[]
  try { next = patchAssistantMenu(current.items, op.args.items as MenuChange[]) }
  catch { throw new AiOperationError('تغییر منو، شناسه، آیکن یا نشانی معتبر نیست', 422) }
  return { snapshot: { revision: current.revision }, preview: { title: 'تغییر منو', href: current.menu === 'section' ? '/admin/mega-menu' : '/admin/menus', menu: current.menu, ...(current.menu === 'section' ? { section: current.section } : {}), revision: current.revision, changes: changesPreview(current.items, next, op.args.items as MenuChange[]), before: bounded(current.items), after: bounded(next), warning: `پس از تأیید، تغییر منو بلافاصله در سایت عمومی اعمال می‌شود.${current.fallback ? ' این تغییر منوی کشف را مستقل از منوی اصلی می‌کند.' : ''}` } }
}
export async function executeMenuOperation(req: NextRequest, _actor: Actor, op: MenuOperation, snapshot: string, guard: Guard, commit: Commit) {
  let revision: string
  try { revision = JSON.parse(snapshot).revision; if (typeof revision !== 'string') throw Error() } catch { throw new AiOperationError('نسخهٔ پیشنهاد معتبر نیست', 409) }
  const current = await readTarget(op.args, db)
  if (revision !== current.revision) throw new AiOperationError('منو پس از پیشنهاد تغییر کرده است', 409)
  let items: SiteLink[]
  try { items = patchAssistantMenu(current.items, op.args.items as MenuChange[]) } catch { throw new AiOperationError('تغییر منو معتبر نیست', 422) }
  const receipt = { title: 'تغییر منو', href: current.menu === 'section' ? '/admin/mega-menu' : '/admin/menus' }
  if (current.menu === 'section') {
    await saveMegaConfig({ sections: { [current.section]: { customItems: items } } }, { revision, beforeCommit: async (tx, next, previous) => {
      const actor = await requirePerm(req, 'settings.manage', tx)
      if (!actor || !await isModuleEnabled('mega-menu', tx)) throw new AiOperationError('دسترسی مجاز نیست', 403)
      await guard(tx)
      await recordRevision({ entityType: 'settings-navigation', entityId: 1, before: configurationSnapshot(previous), after: configurationSnapshot(next), actor, client: tx, strict: true })
      await auditAdminStrict({ req, actor, action: 'mega_menu.update', targetType: 'setting', targetId: 'site.megamenu.v1', metadata: { enabled: next.enabled } }, tx)
      await commit(tx, receipt)
    } })
  } else {
    await updateSiteConfiguration(req, revision, config => ({ ...config, [current.menu === 'header' ? 'navigation' : current.menu]: items }), async tx => { await guard(tx); await commit(tx, receipt) })
  }
}
