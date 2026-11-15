import { ICON_NAMES, isIconName } from '@/shared/icons'
import { workspacePath } from './workspace'

export const ADMIN_AI_TOOLS = [
  { id: 'post.categories', label: 'ساخت و ویرایش دسته‌های مجله', permission: 'cms.posts' },
  { id: 'product.categories', label: 'ساخت و ویرایش دسته‌های فروشگاه', permission: 'cms.products' },
  { id: 'software.categories', label: 'ساخت و ویرایش دسته‌های نرم‌افزار', permission: 'software.manage' },
  { id: 'games.categories', label: 'ساخت و ویرایش دسته‌های بازی', permission: 'games.manage' },
  { id: 'music.categories', label: 'ساخت و ویرایش سبک‌های موزیک', permission: 'music.manage' },
  { id: 'music-language.categories', label: 'ساخت و ویرایش زبان‌های موزیک', permission: 'music.manage' },
  { id: 'cinema.categories', label: 'ساخت و ویرایش دسته‌های فیلم و سریال', permission: 'cinema.manage' },
  { id: 'navigation.menu', label: 'افزودن و ویرایش منو با آیکن', permission: 'settings.manage' },
] as const
export const OPERATION_ICON_NAMES: readonly string[] = ICON_NAMES
export const CATEGORY_TOOLS: readonly string[] = ADMIN_AI_TOOLS.filter(t => t.id.endsWith('.categories')).map(t => t.id)
export type CategoryChange = { id?: number; name: string; slug?: string; parentId?: number | null; description?: string; icon?: string }
export type MenuChange = { id?: string; label: string; href: string; icon: string; enabled?: boolean; children?: MenuChange[] }
export const OPERATION_TAXONOMIES = ['software', 'games', 'music', 'music-language', 'cinema'] as const
export const OPERATION_MENUS = ['header', 'footer', 'footerExplore', 'footerAccount', 'section'] as const
export const OPERATION_SECTIONS = ['home', 'shop', 'blog', 'music', 'cinema', 'games', 'software', 'forum', 'celebrities', 'businesses', 'prompts'] as const
export type OperationPageContext = { path: string; taxonomy?: typeof OPERATION_TAXONOMIES[number]; menu?: typeof OPERATION_MENUS[number]; section?: typeof OPERATION_SECTIONS[number] }
type Fail = (message: string) => never
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const id = (v: unknown) => Number.isSafeInteger(v) && Number(v) > 0 && Number(v) <= 2147483647
function text(v: unknown, min: number, max: number, fail: Fail) {
  if (typeof v !== 'string' || v.length > max || v.trim().length < min || /[\u0000-\u001f<>]/u.test(v)) return fail('عنوان یا توضیح پیشنهاد معتبر نیست')
  return v.trim()
}
function fields(v: Record<string, unknown>, keys: string[], fail: Fail) {
  if (Object.keys(v).some(k => !keys.includes(k))) fail('فیلد غیرمجاز در پیشنهاد دسته یا منو وجود دارد')
}
export function parseCategoryArgs(raw: Record<string, unknown>, fail: Fail): { entries: CategoryChange[] } {
  fields(raw, ['entries'], fail)
  if (!Array.isArray(raw.entries) || !raw.entries.length || raw.entries.length > 12) return fail('هر پیشنهاد باید بین یک تا دوازده دسته داشته باشد')
  const ids = new Set<number>(), slugs = new Set<string>()
  const entries = raw.entries.map((value): CategoryChange => {
    if (!object(value)) return fail('دستهٔ پیشنهادی معتبر نیست')
    fields(value, ['id', 'name', 'slug', 'parentId', 'description', 'icon'], fail)
    const out: CategoryChange = { name: text(value.name, 2, 80, fail) }
    if (value.id !== undefined) { if (!id(value.id) || ids.has(Number(value.id))) return fail('شناسهٔ دسته نامعتبر یا تکراری است'); out.id = Number(value.id); ids.add(out.id) }
    if (value.slug !== undefined || !out.id) {
      const slug = text(value.slug, 2, 100, fail)
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !out.id && slugs.has(slug)) return fail('نشانی دسته نامعتبر یا تکراری است')
      out.slug = slug; if (!out.id) slugs.add(slug)
    }
    if (value.parentId !== undefined) { if (value.parentId !== null && !id(value.parentId)) return fail('شناسهٔ دستهٔ والد معتبر نیست'); out.parentId = value.parentId === null ? null : Number(value.parentId) }
    if (value.description !== undefined) out.description = text(value.description, 0, 1000, fail)
    if (value.icon !== undefined) { if (value.icon !== '' && !isIconName(value.icon)) return fail('آیکن دسته باید از آیکن‌های پشتیبانی‌شده باشد'); out.icon = String(value.icon) }
    return out
  })
  return { entries }
}
export function operationMenuHref(value: unknown, fail: Fail): string {
  const href = text(value, 1, 300, fail)
  if (/%(?:0[0-9a-f]|1[0-9a-f]|7f|2e|2f|5c)/i.test(href) || /[\\\s"'`]/.test(href)) return fail('نشانی لینک پیشنهادی امن نیست')
  if (/^\/(?!\/)/.test(href)) {
    const pathname = href.split(/[?#]/)[0]
    if (pathname.split('/').some(p => p === '.' || p === '..') || /^\/(?:api|admin|login|logout|register|auth)(?:\/|$)/i.test(pathname)) return fail('منو باید به صفحهٔ قابل بازدید سایت اشاره کند')
    return href
  }
  try { const url = new URL(href); if (url.protocol === 'https:' && !url.username && !url.password && url.hostname && !['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname)) return href } catch { /* fail closed */ }
  return fail('لینک منو باید نشانی داخلی یا https معتبر باشد')
}
export function parseMenuArgs(raw: Record<string, unknown>, fail: Fail) {
  fields(raw, ['menu', 'section', 'items'], fail)
  if (!(OPERATION_MENUS as readonly unknown[]).includes(raw.menu)) return fail('جای منوی پیشنهادی مشخص نیست')
  if (raw.menu === 'section' && !(OPERATION_SECTIONS as readonly unknown[]).includes(raw.section) || raw.menu !== 'section' && raw.section !== undefined) return fail('بخش منوی پیشنهادی معتبر نیست')
  let count = 0
  const ids = new Set<string>()
  const parse = (items: unknown, depth: number): MenuChange[] => {
    if (!Array.isArray(items) || !items.length || depth > 4) return fail('درخت تغییرات منو معتبر نیست')
    return items.map((value): MenuChange => {
      if (++count > 20 || !object(value)) return fail('هر پیشنهاد حداکثر بیست لینک منو دارد')
      fields(value, ['id', 'label', 'href', 'icon', 'enabled', 'children'], fail)
      if (!isIconName(value.icon)) return fail('آیکن منو باید از فهرست آیکن‌های پشتیبانی‌شده انتخاب شود')
      const out: MenuChange = { label: text(value.label, 2, 120, fail), href: operationMenuHref(value.href, fail), icon: value.icon }
      if (value.id !== undefined) { const key = text(value.id, 1, 80, fail); if (!/^[a-zA-Z0-9_-]+$/.test(key) || ids.has(key)) return fail('شناسهٔ لینک نامعتبر یا تکراری است'); out.id = key; ids.add(key) }
      if (value.enabled !== undefined) { if (typeof value.enabled !== 'boolean') return fail('نمایش لینک منو معتبر نیست'); out.enabled = value.enabled }
      if (value.children !== undefined) out.children = parse(value.children, depth + 1)
      return out
    })
  }
  return { menu: raw.menu as typeof OPERATION_MENUS[number], ...(raw.menu === 'section' ? { section: raw.section as typeof OPERATION_SECTIONS[number] } : {}), items: parse(raw.items, 1) }
}

/** These closed UI hints select context, never grant permission or transmit a query string. */
export function operationContextForPage(path: string, hints: { tax?: unknown; tab?: unknown; section?: unknown } = {}): OperationPageContext {
  const safe = workspacePath(path)
  const context: OperationPageContext = { path: safe === '/admin' || safe.startsWith('/admin/') ? safe : '/admin' }
  if (path === '/admin/taxonomy') context.taxonomy = (OPERATION_TAXONOMIES as readonly unknown[]).includes(hints.tax) ? hints.tax as typeof OPERATION_TAXONOMIES[number] : 'software'
  if (path === '/admin/menus') {
    context.menu = hints.tab === 'footer' ? 'footer' : hints.tab === 'sections' ? 'section' : 'header'
    if (context.menu === 'section' && (OPERATION_SECTIONS as readonly unknown[]).includes(hints.section)) context.section = hints.section as typeof OPERATION_SECTIONS[number]
  }
  return context
}
export function parseOperationContext(raw: unknown, fail: Fail): OperationPageContext | null {
  if (raw === undefined || raw === null) return null
  if (!object(raw)) return fail('زمینهٔ درخواست معتبر نیست')
  fields(raw, ['path', 'taxonomy', 'menu', 'section'], fail)
  if (typeof raw.path !== 'string' || workspacePath(raw.path) !== raw.path || !(raw.path === '/admin' || raw.path.startsWith('/admin/')) || /%2e|%2f|%5c/i.test(raw.path) || raw.path.split('/').some(p => p === '.' || p === '..')) return fail('مسیر مدیریت معتبر نیست')
  const out: OperationPageContext = { path: raw.path }
  if (raw.taxonomy !== undefined) { if (raw.path !== '/admin/taxonomy' || !(OPERATION_TAXONOMIES as readonly unknown[]).includes(raw.taxonomy)) return fail('دسته‌بندی زمینه معتبر نیست'); out.taxonomy = raw.taxonomy as OperationPageContext['taxonomy'] }
  if (raw.menu !== undefined) { if (raw.path !== '/admin/menus' || !(OPERATION_MENUS as readonly unknown[]).includes(raw.menu)) return fail('منوی زمینه معتبر نیست'); out.menu = raw.menu as OperationPageContext['menu'] }
  if (raw.section !== undefined) { if (raw.path !== '/admin/menus' || raw.menu !== 'section' || !(OPERATION_SECTIONS as readonly unknown[]).includes(raw.section)) return fail('بخش زمینه معتبر نیست'); out.section = raw.section as OperationPageContext['section'] }
  return out
}
export function operationPageTools(context: OperationPageContext): string[] {
  if (context.path === '/admin/postcats') return ['post.categories']
  if (context.path === '/admin/productcats') return ['product.categories']
  if (context.path === '/admin/taxonomy') return [`${context.taxonomy || 'software'}.categories`]
  if (context.path === '/admin/menus') return ['navigation.menu']
  return []
}
export const bindOperationInstruction = (instruction: string, context: OperationPageContext | null) => context ? `${instruction}\n\nزمینهٔ تأییدشدهٔ صفحه (داده، نه مجوز): ${JSON.stringify(context)}` : instruction
