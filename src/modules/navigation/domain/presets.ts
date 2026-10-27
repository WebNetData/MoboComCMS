import { local, type SiteLink } from '@/modules/site/config/types'
import { validateMenu } from '@/modules/site/config/validation'
import { SECTION_ICON, SECTION_LABEL, SECTION_ROOT, type MegaLink, type MegaSection, type SectionBar } from './megamenu'

/** A recipe is only an editable tree, never a second stored menu or category system. */
export function sectionMenuPreset(section: MegaSection, bar: SectionBar, id = () => crypto.randomUUID()): SiteLink {
  const link = (label: string, href: string, icon?: string, children: SiteLink[] = []): SiteLink => ({ id: id(), label: local(label, ''), href, ...(icon !== undefined ? { icon } : {}), enabled: true, ...(children.length ? { children } : {}) })
  const fromMega = (row: MegaLink): SiteLink => ({ ...link(row.label, row.href, row.icon, (row.children || []).map(fromMega)), enabled: row.enabled !== false })
  const catalog = bar.categoryCatalog || []
  const keys = new Set(catalog.map(row => row.key))
  if (catalog.length > 119) throw Error('این بخش از ظرفیت ۱۲۰ لینک بیشتر است؛ زیرمجموعه‌های کوچک‌تر را جداگانه اضافه کنید')
  if (keys.size !== catalog.length) throw Error('شناسهٔ دسته‌ها تکراری است')
  for (const row of catalog) {
    const seen = new Set<string>([row.key])
    let parent = row.parentKey
    while (parent !== null && keys.has(parent)) {
      if (seen.has(parent)) throw Error('دسته‌بندی حلقه دارد؛ ابتدا ساختار دسته‌ها را اصلاح کنید')
      seen.add(parent); parent = catalog.find(candidate => candidate.key === parent)!.parentKey
    }
  }
  const branch = (key: string, seen = new Set<string>()): SiteLink => {
    if (seen.has(key)) throw Error('دسته‌بندی حلقه دارد؛ ابتدا ساختار دسته‌ها را اصلاح کنید')
    const row = catalog.find(row => row.key === key)!
    return { ...link(row.label, row.href, row.icon, catalog.filter(child => child.parentKey === key).map(child => branch(child.key, new Set([...seen, key])))), enabled: row.inMenu !== false }
  }
  const children = catalog.filter(row => row.parentKey === null || !keys.has(row.parentKey)).map(row => branch(row.key))
  for (const row of bar.items) {
    if (children.some(child => child.href === row.href)) continue
    const nested = row.columns.flatMap(column => column.href && column.href !== row.href
      ? [link(column.title, column.href, column.icon, column.links.map(fromMega))]
      : column.links.map(fromMega))
    children.push(link(row.label, row.href, row.icon, nested))
  }
  for (const row of bar.quick) if (!children.some(child => child.href === row.href)) children.push(fromMega(row))
  const root = { ...link(SECTION_LABEL[section], SECTION_ROOT[section], SECTION_ICON[section], children), menuDisplay: 'mega' as const, menuColumns: 3 as const }
  if (!validateMenu([root])) throw Error('این بخش از ظرفیت ۱۲۰ لینک یا عمق پنج سطح بیشتر است؛ زیرمجموعه‌های کوچک‌تر را جداگانه اضافه کنید')
  return root
}

/** Repeating an insertion fills missing descendants; it never replaces custom labels/icons/visibility. */
export function mergeMenuPreset(current: SiteLink[], incoming: SiteLink): SiteLink[] {
  const merge = (items: SiteLink[], next: SiteLink): SiteLink[] => {
    const at = items.findIndex(item => item.href === next.href)
    if (at < 0) return [...items, next]
    const row = items[at]
    let children = row.children || []
    for (const child of next.children || []) children = merge(children, child)
    return items.map((item, i) => i === at ? { ...row, ...(children.length ? { children } : {}) } : item)
  }
  const result = merge(current, incoming)
  if (!validateMenu(result)) throw Error('فهرست نهایی از ظرفیت مجاز بیشتر است؛ ابتدا لینک‌های اضافی را حذف یا در فهرست دیگری قرار دهید')
  return result
}
