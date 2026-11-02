import { db } from '@/platform/database/prisma'
import { getPublicExtensionRuntime } from '@/extensions/server/state'
import { getSiteSeo } from '@/modules/site/server/seo'
import { closedSectionPlugins } from '@/modules/site/server/maintenance'
import { buildLlmsTxt, buildRss, metaDescription, type LlmsSection } from '@/modules/seo/domain/seo'
import { publicProductWhere } from '@/modules/catalog/domain/product-publication'

const live = () => ({ status: 'PUBLISHED', publishedAt: { lte: new Date() }, audienceGroups: '' })

async function enabledModules() {
  const [runtime, closed] = await Promise.all([getPublicExtensionRuntime().catch(() => ({} as Record<string, { enabled: boolean }>)), closedSectionPlugins()])
  // A section in maintenance is left out like a module that is off.
  return (id: string) => runtime[id]?.enabled !== false && !closed.has(id)
}

/** RSS 2.0 of the latest magazine posts (and software releases), for readers and faster discovery. */
export async function rssFeed(): Promise<string> {
  const [seo, on] = await Promise.all([getSiteSeo('fa'), enabledModules()])
  const [posts, software] = await Promise.all([
    on('journal') ? db.post.findMany({ where: { ...live(), access: 'PUBLIC' }, orderBy: { publishedAt: 'desc' }, take: 40, select: { slug: true, title: true, excerpt: true, content: true, cover: true, publishedAt: true, category: { select: { name: true } } } }).catch(() => []) : [],
    on('software') ? db.softwareTitle.findMany({ where: live(), orderBy: { updatedAt: 'desc' }, take: 20, select: { slug: true, title: true, version: true, summary: true, icon: true, updatedAt: true, category: true } }).catch(() => []) : [],
  ])
  const items = [
    ...posts.map((post) => ({ title: post.title, url: `${seo.base}/blog/${post.slug}`, description: metaDescription(post.excerpt || post.content, 300), date: post.publishedAt, category: post.category?.name, image: post.cover && !post.cover.startsWith('/') ? post.cover : post.cover ? `${seo.base}${post.cover}` : undefined })),
    ...software.map((app) => ({ title: `${app.title}${app.version ? ` ${app.version}` : ''}`, url: `${seo.base}/software/${app.slug}`, description: metaDescription(app.summary, 300), date: app.updatedAt, category: app.category || undefined })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 50)
  return buildRss({ title: seo.name, url: seo.base, description: seo.description, language: 'fa-IR', items })
}

/** llms.txt: what the site is and where its important pages are, for AI assistants. */
export async function llmsTxt(): Promise<string> {
  const [seo, on] = await Promise.all([getSiteSeo('fa'), enabledModules()])
  const url = (path: string) => `${seo.base}${path}`
  const [posts, products, software, pages, boards] = await Promise.all([
    on('journal') ? db.post.findMany({ where: { ...live(), access: 'PUBLIC' }, orderBy: { publishedAt: 'desc' }, take: 25, select: { slug: true, title: true, excerpt: true } }).catch(() => []) : [],
    on('store') ? db.product.findMany({ where: publicProductWhere, orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }], take: 25, select: { slug: true, name: true, description: true } }).catch(() => []) : [],
    on('software') ? db.softwareTitle.findMany({ where: live(), orderBy: { downloads: 'desc' }, take: 20, select: { slug: true, title: true, summary: true } }).catch(() => []) : [],
    db.page.findMany({ where: { status: 'PUBLISHED' }, orderBy: { sortOrder: 'asc' }, take: 20, select: { slug: true, title: true } }).catch(() => []),
    on('forum') ? db.forumCategory.findMany({ where: { access: 'PUBLIC' }, orderBy: { sortOrder: 'asc' }, select: { slug: true, title: true, description: true } }).catch(() => []) : [],
  ])
  const sectionLinks = ([['store', '/products', 'فروشگاه', 'کالای فیزیکی و محصولات مجازی'], ['journal', '/blog', 'مجله', 'خبر، آموزش و بررسی'], ['music', '/music', 'موزیک', 'آلبوم، آهنگ و پلی‌لیست'], ['cinema', '/cinema', 'فیلم و سریال', 'معرفی و دانلود'], ['games', '/games', 'بازی', 'نقد، سیستم مورد نیاز و دانلود'], ['software', '/software', 'دانلود نرم‌افزار', 'ویندوز، مک، لینوکس، اندروید و iOS'], ['forum', '/forum', 'تالار گفتمان', 'پرسش و پاسخ کاربران'], ['membership', '/vip', 'اشتراک ویژه', 'تخفیف فروشگاه و محتوای اختصاصی']] as const)
    .filter(([id]) => on(id)).map(([, path, title, note]) => ({ title, url: url(path), note }))
  const sections: LlmsSection[] = [
    { title: 'بخش‌های اصلی', links: sectionLinks },
    { title: 'محصولات', links: products.map((item) => ({ title: item.name, url: url(`/products/${item.slug}`), note: metaDescription(item.description, 140) })) },
    { title: 'مقاله‌های مجله', links: posts.map((item) => ({ title: item.title, url: url(`/blog/${item.slug}`), note: metaDescription(item.excerpt, 140) })) },
    { title: 'نرم‌افزارها', links: software.map((item) => ({ title: item.title, url: url(`/software/${item.slug}`), note: metaDescription(item.summary, 140) })) },
    { title: 'انجمن‌های تالار گفتمان', links: boards.map((item) => ({ title: item.title, url: url(`/forum/c/${item.slug}`), note: item.description })) },
    { title: 'صفحه‌های اطلاعاتی', links: pages.map((item) => ({ title: item.title, url: url(`/p/${item.slug}`) })) },
  ]
  return buildLlmsTxt({
    name: seo.name,
    summary: seo.description,
    details: [`زبان سایت فارسی است. نقشهٔ کامل صفحه‌ها: ${url('/sitemap.xml')} — خبرخوان: ${url('/feed.xml')}`],
    sections,
  })
}
