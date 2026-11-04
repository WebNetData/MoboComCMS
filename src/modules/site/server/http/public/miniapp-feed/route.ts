import { ok } from '@/platform/http/response'
import { getPublicSiteConfig } from '@/modules/site/config/store'
import { translate } from '@/modules/site/config/types'
import { getLandingData } from '@/modules/site/server/homepage'
import { getServerLocale } from '@/i18n/server'
import { MINIAPP_KINDS, miniAppPathOpen, miniAppSections, showsInMiniApp, type MiniAppFeed } from '@/modules/site/domain/miniapp-feed'
import { getSettings } from '@/modules/settings/server'

/**
 * Homepage sections the admin marked for the Telegram mini app, already
 * localized. The website and the mini app therefore share one source of
 * content: editing a section in Site Studio updates both.
 */
export async function GET() {
  const [site, data, locale, settings] = await Promise.all([getPublicSiteConfig(), getLandingData(), getServerLocale(), getSettings()])
  const T = (value: Parameters<typeof translate>[0]) => translate(value, locale)
  const fa = locale === 'fa'
  const disabledPaths = [...data.disabledPaths, ...(settings.storeEnabled !== 'true' ? ['/products'] : [])]
  const open = (path: string) => miniAppPathOpen(path, disabledPaths)
  const posts = open('/blog') ? data.posts : []
  const feed: MiniAppFeed = {
    sections: site.sections
      .filter(section => section.enabled && MINIAPP_KINDS.has(section.kind) && showsInMiniApp(section) && (section.kind !== 'plans' || open('/plans')) && (section.kind !== 'posts' || open('/blog')))
      .map(section => ({
        id: section.id,
        kind: section.kind,
        eyebrow: T(section.eyebrow),
        title: T(section.title),
        description: T(section.description),
        action: section.action.href && open(section.action.href) && T(section.action.label) ? { href: section.action.href, label: T(section.action.label) } : null,
        items: section.items.filter(item => !item.href || open(item.href)).map(item => ({ title: T(item.title), text: T(item.text), icon: item.icon, href: item.href })),
        ...(section.kind === 'plans' ? { plans: data.plans.map(plan => ({ id: plan.id, name: fa ? plan.name : plan.nameEn || plan.name, days: plan.days, trafficGB: plan.trafficGB, price: plan.price, currency: plan.currency, featured: plan.featured })) } : {}),
        ...(section.kind === 'posts' ? { posts: data.posts.map(post => ({ slug: post.slug, title: fa ? post.title : post.titleEn || post.title, excerpt: fa ? post.excerpt : post.excerptEn || post.excerpt, cover: post.cover })) } : {}),
      })),
    // The whole platform at a glance, from the same public data as the homepage (closed sections are already left out).
    discover: {
      sections: miniAppSections(disabledPaths, data.stats || [], fa),
      products: (open('/products') ? data.products : []).slice(0, 8).map(product => ({ slug: product.slug, name: fa ? product.name : product.nameEn || product.name, price: product.price, listPrice: product.listPrice || 0, currency: product.currency, image: product.image, category: product.category ? (fa ? product.category.name : product.category.nameEn || product.category.name) : '' })),
      showcase: data.showcase.filter(item => open(item.href)).map(item => ({ kind: item.kind, title: item.title, meta: item.meta, cover: item.cover, href: item.href, vip: item.vip })),
      posts: posts.map(post => ({ slug: post.slug, title: fa ? post.title : post.titleEn || post.title, excerpt: fa ? post.excerpt : post.excerptEn || post.excerpt, cover: post.cover })),
    },
  }
  const response = ok(feed)
  response.headers.set('Cache-Control', 'no-store')
  return response
}
