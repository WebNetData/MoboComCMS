'use client'

import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import { useI18n } from '@/i18n/LocaleProvider'
import { formatCurrency } from '@/shared/money/client'
import type { MiniAppFeed, MiniAppFeedSection } from '@/modules/site/domain/miniapp-feed'
import { miniAppHref } from '@/modules/site/domain/miniapp-navigation'
import { useMiniAppResource } from './useMiniAppResource'
import MiniAppReadState from './MiniAppReadState'
import MiniAppDiscover from './MiniAppDiscover'

// Website links are rewritten to their mini app equivalents so a tap never
// leaves the Telegram shell when an in-app screen exists.
export { miniAppHref } from '@/modules/site/domain/miniapp-navigation'

/** Homepage sections shared with the website (Site Studio → "show in mini app"). */
export default function MiniAppFeedView({ explore = false }: { explore?: boolean }) {
  const { data: feed, loading, error, retry } = useMiniAppResource<MiniAppFeed>('/api/public/miniapp-feed')
  if (loading || error || !feed) return <MiniAppReadState error={error} retry={retry} />
  return <>{feed.discover && <MiniAppDiscover data={feed.discover} explore={explore} />}<div className="tg-feed">{feed.sections.map(section => <FeedSection key={section.id} section={section}/>)}</div></>
}

function FeedSection({ section }: { section: MiniAppFeedSection }) {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const head = <div className="tg-feed-head">{section.eyebrow && <span className="tg-eyebrow">{section.eyebrow}</span>}<h2>{section.title.split('\n').join(' ')}</h2></div>
  switch (section.kind) {
    case 'hero':
    case 'cta':
      return <section className="card tg-feed-banner">
        {section.eyebrow && <span className="tg-eyebrow"><Icon name="bolt" size={14}/>{section.eyebrow}</span>}
        <h2>{section.title.split('\n').join(' ')}</h2>
        {section.description && <p className="muted">{section.description}</p>}
        {section.action && <Link href={miniAppHref(section.action.href)} className="btn btn-primary btn-sm">{section.action.label}</Link>}
      </section>
    case 'features':
      return <section>{head}<div className="tg-feed-list">{section.items.map((item, index) => <div key={index} className="tg-feed-row"><span className="tg-heading-icon"><Icon name={item.icon || 'shield'} size={18}/></span><span><b>{item.title}</b><small className="muted">{item.text}</small></span></div>)}</div></section>
    case 'steps':
      return <section>{head}<ol className="tg-feed-list">{section.items.map((item, index) => <li key={index} className="tg-feed-row"><span className="tg-heading-icon num">{(index + 1).toLocaleString(fa ? 'fa-IR' : 'en-US')}</span><span><b>{item.title}</b><small className="muted">{item.text}</small></span></li>)}</ol></section>
    case 'plans':
      if (!section.plans?.length) return null
      return <section>{head}<div className="tg-feed-scroll">{section.plans.map(plan => <Link key={plan.id} href="/miniapp/plans" className={`card tg-feed-plan ${plan.featured ? 'is-featured' : ''}`}><b>{plan.name}</b><small className="muted">{plan.trafficGB} GB · {plan.days.toLocaleString(fa ? 'fa-IR' : 'en-US')} {fa ? 'روز' : 'days'}</small><strong className="num">{formatCurrency(plan.price, plan.currency, fa ? 'fa-IR' : 'en-US')}</strong></Link>)}</div></section>
    case 'posts':
      if (!section.posts?.length) return null
      return <section>{head}<div className="tg-feed-scroll">{section.posts.map(post => <Link key={post.slug} href={`/blog/${post.slug}`} className="card tg-feed-post">{post.cover ? <img src={post.cover} alt="" loading="lazy"/> : <span className="tg-feed-cover"><Icon name="globe" size={24}/></span>}<b>{post.title}</b><small className="muted">{post.excerpt}</small></Link>)}</div></section>
    case 'faq':
      return <section>{head}<div className="tg-feed-list">{section.items.map((item, index) => <details key={index} className="tg-feed-faq"><summary>{item.title}</summary><p className="muted">{item.text}</p></details>)}</div></section>
    default:
      return null
  }
}
