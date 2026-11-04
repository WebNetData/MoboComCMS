'use client'

import { useState } from 'react'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import { useI18n } from '@/i18n/LocaleProvider'
import { formatCurrency } from '@/shared/money/client'
import type { MiniAppDiscover as Discover } from '@/modules/site/domain/miniapp-feed'
import { miniAppHighlights } from '@/modules/site/domain/miniapp-feed'
import { selectionHaptic } from './telegram-client'
import MiniAppArtwork from './MiniAppArtwork'

const MEDIA = [
  { key: 'music', fa: 'موسیقی', en: 'Music' }, { key: 'cinema', fa: 'سینما', en: 'Cinema' },
  { key: 'games', fa: 'بازی', en: 'Games' }, { key: 'software', fa: 'نرم‌افزار', en: 'Software' }, { key: 'forum', fa: 'گفت‌وگو', en: 'Forum' },
] as const

export default function MiniAppDiscover({ data, explore }: { data: Discover; explore: boolean }) {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState('all')
  const sections = data.sections.filter(section => section.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const media = kind === 'all' ? miniAppHighlights(data.showcase, explore ? 15 : 6) : data.showcase.filter(item => item.kind === kind)
  const Heading = explore ? 'h1' : 'h2'
  return <div className="tg-discover">
    <header className="tg-discover-intro"><span className="tg-eyebrow"><Icon name="sparkles" size={15} />{fa ? 'همهٔ موبوکام، همراه شما' : 'MoboCom, with you'}</span><Heading>{explore ? (fa ? 'بعدی را کشف کنید.' : 'Find your next favorite.') : (fa ? 'یک حساب؛ همهٔ علاقه‌های شما.' : 'One account. All your interests.')}</Heading><p>{fa ? 'از موسیقی و سینما تا خرید و یادگیری؛ مسیر خودتان را انتخاب کنید.' : 'Music, cinema, shopping and learning. Choose where to go next.'}</p></header>
    {explore && <label className="tg-search"><Icon name="search" size={20} /><span className="sr-only">{fa ? 'جست‌وجوی بخش‌های موبوکام' : 'Find a MoboCom section'}</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder={fa ? 'دنبال کدام بخش می‌گردید؟' : 'Which section are you looking for?'} type="search" /></label>}
    <nav className="tg-services" aria-label={fa ? 'بخش‌های موبوکام' : 'MoboCom sections'}>{sections.map(section => <Link key={section.key} href={section.href} className={`tg-service tg-service-${section.key}`}><span className="tg-service-icon"><Icon name={section.icon} size={23} /></span><b>{section.label}</b>{section.count > 0 && <small className="num">{section.count.toLocaleString(fa ? 'fa-IR' : 'en-US')}</small>}<Icon name="arrow" size={14} /></Link>)}</nav>
    {!sections.length && <div className="tg-state"><Icon name="search" size={25} /><h2>{fa ? 'بخشی پیدا نشد' : 'No sections found'}</h2><p>{fa ? 'عبارت دیگری را امتحان کنید.' : 'Try another search.'}</p></div>}
    {data.products.length > 0 && <section className="tg-discover-block"><div className="tg-section-title"><div><span>{fa ? 'پیشنهادهای فروشگاه' : 'From the shop'}</span><h2>{fa ? 'یک انتخاب تازه' : 'Something new'}</h2></div><Link href="/products">{fa ? 'همهٔ محصولات' : 'All products'}<Icon name="arrow" size={15} /></Link></div><div className="tg-product-grid">{data.products.slice(0, explore ? 8 : 4).map(product => <Link key={product.slug} href={`/products/${product.slug}`} className="tg-product"><div className="tg-product-image"><MiniAppArtwork src={product.image} icon="bag" /></div><div className="tg-product-copy"><small>{product.category}</small><h3>{product.name}</h3><strong className="num">{formatCurrency(product.price, product.currency, fa ? 'fa-IR' : 'en-US')}</strong></div></Link>)}</div><p className="tg-price-hint">{fa ? 'قیمت نهایی و مزایای گروه کاربری در صفحهٔ محصول محاسبه می‌شود.' : 'Your final price and group benefits are calculated on the product page.'}</p></section>}
    {data.showcase.length > 0 && <section className="tg-discover-block"><div className="tg-section-title"><div><span>{fa ? 'وقتِ علاقه‌های شما' : 'Time for your interests'}</span><h2>{fa ? 'تماشا کنید، بشنوید، تجربه کنید' : 'Watch, listen, discover'}</h2></div></div><div className="tg-filter-row" role="group" aria-label={fa ? 'نوع محتوا' : 'Content type'}>{[{ key: 'all', fa: 'همه', en: 'All' }, ...MEDIA.filter(category => data.showcase.some(item => item.kind === category.key))].map(category => <button key={category.key} type="button" aria-pressed={kind === category.key} onClick={() => { setKind(category.key); selectionHaptic() }}>{fa ? category.fa : category.en}</button>)}</div><div className="tg-media-grid">{media.slice(0, explore ? 24 : 8).map(item => <Link key={item.href} href={item.href} className={`tg-media tg-media-${item.kind}`}><div className="tg-media-image"><MiniAppArtwork src={item.cover} icon={item.kind === 'forum' ? 'chat' : 'play'} />{item.vip && <span className="tg-vip-label"><Icon name="crown" size={12} />VIP</span>}</div><h3>{item.title}</h3><small>{item.meta}</small></Link>)}</div></section>}
    {!explore && <Link className="tg-explore-more" href="/miniapp/explore"><span><b>{fa ? 'مسیر بعدی شما کجاست؟' : 'Where to next?'}</b><small>{fa ? 'همهٔ بخش‌ها و تازه‌های موبوکام' : 'Explore all MoboCom sections'}</small></span><Icon name="arrow" size={22} /></Link>}
  </div>
}
