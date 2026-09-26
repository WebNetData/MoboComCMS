import { ok } from '@/platform/http/response'
import { getPublicSiteConfig } from '@/modules/site/config/store'
import { translate } from '@/modules/site/config/types'
import { getLandingData } from '@/modules/site/server/homepage'
import { getServerLocale } from '@/i18n/server'
import { MINIAPP_KINDS, showsInMiniApp, type MiniAppFeed } from '@/modules/site/domain/miniapp-feed'

/**
 * Homepage sections the admin marked for the Telegram mini app, already
 * localized. The website and the mini app therefore share one source of
 * content: editing a section in Site Studio updates both.
 */
export async function GET() {
  const [site, data, locale] = await Promise.all([getPublicSiteConfig(), getLandingData(), getServerLocale()])
  const T = (value: Parameters<typeof translate>[0]) => translate(value, locale)
  const fa = locale === 'fa'
  const feed: MiniAppFeed = {
    sections: site.sections
      .filter(section => section.enabled && MINIAPP_KINDS.has(section.kind) && showsInMiniApp(section))
      .map(section => ({
        id: section.id,
        kind: section.kind,
        eyebrow: T(section.eyebrow),
        title: T(section.title),
        description: T(section.description),
        action: section.action.href && T(section.action.label) ? { href: section.action.href, label: T(section.action.label) } : null,
        items: section.items.map(item => ({ title: T(item.title), text: T(item.text), icon: item.icon, href: item.href })),
        ...(section.kind === 'plans' ? { plans: data.plans.map(plan => ({ id: plan.id, name: fa ? plan.name : plan.nameEn || plan.name, days: plan.days, trafficGB: plan.trafficGB, price: plan.price, currency: plan.currency, featured: plan.featured })) } : {}),
        ...(section.kind === 'posts' ? { posts: data.posts.map(post => ({ slug: post.slug, title: fa ? post.title : post.titleEn || post.title, excerpt: fa ? post.excerpt : post.excerptEn || post.excerpt, cover: post.cover })) } : {}),
      })),
  }
  return ok(feed)
}
