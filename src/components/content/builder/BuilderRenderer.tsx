import Link from '@/components/AppLink'
import type { CSSProperties, ReactNode } from 'react'
import { cleanWidgetHtml, sanitizeWidgetCss } from '@/shared/content/sanitize'
import { getLandingData } from '@/modules/site/server/homepage'
import { getPublicNavigationPages, type PublicNavigationPage } from '@/modules/site/server/navigation'
import type { LandingData, LandingPost, LandingProduct } from '@/modules/site/domain/homepage'
import { getBuilderPosts, getBuilderProducts, postQueryKey, productQueryKey, type PostQuery, type ProductQuery } from '@/modules/site/server/builder-data'
import { getServerTheme } from '@/i18n/server'
import SiteHeader from '@/components/SiteHeader'
import SiteFooter from '@/components/SiteFooter'
import { getModuleStates } from '@/extensions/server/modules'
import { SOCIAL_NETWORKS, toEmbedUrl, type BuilderCode, type BuilderDoc, type BuilderSection, type BuilderWidget, type SlotWidgetType } from '@/modules/site/domain/builder'
import { BUNDLED_TEMPLATES } from '@/modules/site/domain/builder-templates'
import { listUserTemplates } from '@/modules/site/server/builder'
import PlanCards from '@/components/PlanCards'
import PublicForm from '@/components/site/PublicForm'
import NetworkGlobe from '@/components/site/NetworkGlobe'
import AdvancedCode from '@/components/content/builder/AdvancedCode'
import { formatAmount } from '@/shared/money/format'
import { getBuilderMedia, type BuilderMediaFeed } from '@/modules/media/server/queries'
import { AlbumCard, GameCard, PosterCard } from '@/components/media/MediaCards'
import { TrackList } from '@/components/media/PlayButton'
import { toPlayerTracks } from '@/components/media/player-types'
import Slider from '@/components/site/Slider'
import { plainText } from '@/shared/text/plain'
import { advancedCss, styleClass, type AdvancedStyle } from '@/modules/site/domain/builder-style'
import Icon from '@/components/site/Icon'
import { BuilderCountdown, BuilderCounter, BuilderTabs } from '@/components/content/builder/BuilderInteractive'

export type BuilderLocale = 'fa' | 'en'

/** Node slots a single-post / single-product template places the real entry parts into. */
export type BuilderSlots = Partial<Record<SlotWidgetType, ReactNode>>

/** What the document is rendered for — lets "current section / category" blocks filter. */
export type BuilderContext = {
  postCategoryId?: number | null
  productCategoryId?: number | null
  currentPostId?: number | null
  currentProductId?: number | null
}

type Ctx = {
  locale: BuilderLocale
  landing: LandingData | null
  templates: Map<string, BuilderDoc> | null
  depth: number
  slots?: BuilderSlots
  nav?: PublicNavigationPage[] | null
  /** Admin live preview: show placeholders for empty blocks so they stay selectable. */
  preview?: boolean
  /** Rendering a saved template inside another document: omit editor ids. */
  nested?: boolean
  context: BuilderContext
  /** Feature module switches — blocks of disabled modules render nothing. */
  modules: Record<string, boolean>
  posts: Map<string, LandingPost[]>
  products: Map<string, LandingProduct[]>
  media: Map<string, BuilderMediaFeed>
  theme: string
}

const DYNAMIC = new Set(['plans', 'network', 'form'])
const SLOT_TYPES = new Set<string>(['post-header', 'post-cover', 'content', 'post-footer', 'product-hero', 'product-gallery', 'product-info', 'product-purchase', 'product-usp', 'product-tabs'])
const LIVE_SELECTOR = /^@(section|current)$/

function postQueryOf(widget: BuilderWidget, context: BuilderContext): PostQuery {
  const raw = String(widget.props.category || '').trim()
  const current = LIVE_SELECTOR.test(raw)
  return {
    category: current ? '' : raw.replace(/[^a-z0-9-]/gi, '').slice(0, 80),
    categoryId: current ? context.postCategoryId ?? null : null,
    limit: Number(widget.props.limit) || 3,
    exclude: context.currentPostId ?? null,
  }
}

function productQueryOf(widget: BuilderWidget, context: BuilderContext): ProductQuery {
  const raw = String(widget.props.category || '').trim()
  const current = LIVE_SELECTOR.test(raw)
  const kind = widget.props.kind === 'VIRTUAL' || widget.props.kind === 'PHYSICAL' ? widget.props.kind : ''
  return {
    category: current ? '' : raw.replace(/[^a-z0-9-]/gi, '').slice(0, 80),
    categoryId: current ? context.productCategoryId ?? null : null,
    kind,
    limit: Number(widget.props.limit) || 3,
    exclude: context.currentProductId ?? null,
  }
}

/** All widgets of a document, including those inside saved templates it embeds. */
function collectWidgets(doc: BuilderDoc, templates: Map<string, BuilderDoc> | null, depth = 0): BuilderWidget[] {
  const own = doc.sections.flatMap((section) => section.columns.flatMap((column) => column.widgets))
  if (!templates || depth >= 3) return own
  return own.flatMap((widget) => {
    if (widget.type !== 'template') return [widget]
    const child = templates.get(widget.props.templateId || '')
    return child ? [widget, ...collectWidgets(child, templates, depth + 1)] : [widget]
  })
}
const LEVELS = new Set(['h1', 'h2', 'h3', 'h4', 'p'])

const pick = (locale: BuilderLocale, fa: string | undefined, en: string | undefined) => (locale === 'fa' ? fa || en || '' : en || fa || '')
const itemsOf = (raw: string | undefined): Record<string, string>[] => {
  try {
    const parsed = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? parsed.filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry)) as Record<string, string>[] : []
  } catch { return [] }
}
const safeHref = (raw: string | undefined) => {
  const href = String(raw || '').trim()
  if (!href) return '#'
  if (/^\/(?!\/)[^\s<>\\]*$/.test(href) || /^#[\w-]*$/.test(href)) return href
  try {
    const url = new URL(href)
    return ['https:', 'http:', 'mailto:', 'tel:'].includes(url.protocol) ? href : '#'
  } catch { return '#' }
}

/** A picture address a block may show: a path on this site or an https address — nothing else. */
const safeSrc = (raw: string | undefined) => { const value = String(raw || '').trim(); return /^\/(?!\/)[^\s<>"'\\]*$/.test(value) || /^https:\/\/[^\s<>"'\\]+$/.test(value) ? value : '' }
/** Plain words typed for a tab become paragraphs; nothing in them is read as markup. */
// Numbers typed with Persian or Arabic digits count like any other.
const latinDigits = (text: string) => text.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776)).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
const escapeText = (raw: string) => raw.split(/\r?\n\s*\r?\n|\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => `<p>${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`).join('')
const SOCIAL_NAME: Record<string, string> = { telegram: 'Telegram', instagram: 'Instagram', x: 'X', youtube: 'YouTube', aparat: 'Aparat', linkedin: 'LinkedIn', whatsapp: 'WhatsApp', github: 'GitHub', email: 'Email', website: 'Website' }
const SOCIAL_PATH: Record<string, string> = {
  telegram: 'M21 4 3 11l6 2m12-9-3 16-9-7m12-9L9 13m0 0v6l3.500-3.500',
  instagram: 'M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Zm5 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm5.500-1.500h.010',
  x: 'M4 4l16 16M20 4 4 20',
  youtube: 'M3 8a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8Zm7 1.500v5l4.500-2.500L10 9.500Z',
  aparat: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 6.500a2.500 2.500 0 1 0 0 5 2.500 2.500 0 0 0 0-5Z',
  linkedin: 'M4 9h3v11H4V9Zm1.500-5a1.700 1.700 0 1 1 0 3.400 1.700 1.700 0 0 1 0-3.400ZM10 9h3v1.600c.600-1.100 1.800-1.900 3.300-1.900 2.700 0 3.700 1.800 3.700 4.600V20h-3v-5.900c0-1.500-.500-2.500-1.800-2.500-1.400 0-2.200 1-2.200 2.500V20h-3V9Z',
  whatsapp: 'M4 20l1.300-4.200A8 8 0 1 1 8.300 18.700L4 20Zm5-11.500c0 3 2.500 5.500 5.500 5.500l1-1.500-2-1-1 1c-1-.500-1.500-1-2-2l1-1-1-2L9 8.500Z',
  github: 'M9 19c-4 1.500-4-2-6-2.500M15 21v-3.500a3 3 0 0 0-.800-2.300c2.800-.300 5.800-1.400 5.800-6.200a4.800 4.800 0 0 0-1.300-3.300 4.500 4.500 0 0 0-.100-3.300s-1.100-.300-3.500 1.300a12 12 0 0 0-6.200 0C6.500 2.100 5.400 2.400 5.400 2.400a4.500 4.500 0 0 0-.100 3.300A4.800 4.800 0 0 0 4 9c0 4.800 3 5.900 5.800 6.200A3 3 0 0 0 9 17.500V21',
  email: 'M3 6h18v12H3V6Zm0 1 9 6 9-6',
  website: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-9 9h18M12 3c2.500 2.500 3.500 5.500 3.500 9s-1 6.500-3.500 9c-2.500-2.500-3.500-5.500-3.500-9s1-6.500 3.500-9Z',
}

/** The element's own rules (advanced style), written next to it. The CSS is made of bounded numbers, listed choices and hex colours only. */
const styleTag = (id: string, adv: AdvancedStyle | undefined) => { const css = advancedCss(id, adv); return css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null }
const advClass = (id: string, adv: AdvancedStyle | undefined) => (adv ? ` ${[styleClass(id), ...(adv.classes || [])].filter(Boolean).join(' ')}` : '')

function frame(widget: BuilderWidget, ctx: Ctx, node: ReactNode, frameClass = '') {
  const style = widget.style
  const classes = ['br-widget', `br-w-${widget.type}`]
  if (style.align !== 'start') classes.push(`br-align-${style.align}`)
  if (style.tone !== 'none') classes.push('br-panel', `tone-${style.tone}`)
  if (style.hideOn && style.hideOn !== 'none') classes.push(`br-hide-${style.hideOn}`)
  if (frameClass) classes.push(frameClass)
  const css: CSSProperties = {
    textAlign: style.align,
    color: style.color || undefined,
    maxWidth: style.width ? `${style.width}%` : undefined,
    marginInline: style.width ? 'auto' : undefined,
  }
  if (style.paddingY) css.paddingBlock = `${style.paddingY}px`
  return <div className={classes.join(' ')} style={css} data-bid={ctx.nested ? undefined : widget.id}>{node}</div>
}

const radiusOf = (widget: BuilderWidget): CSSProperties | undefined =>
  widget.style.radius ? { borderRadius: `${widget.style.radius}px` } : undefined

/** Which feature module a block belongs to. */
const WIDGET_MODULE: Partial<Record<string, string>> = { plans: 'vpn', network: 'vpn', posts: 'journal', products: 'store', 'vip-cta': 'membership' }
const mediaKey = (widget: BuilderWidget) => `${widget.props.source || 'music-new'}:${Number(widget.props.limit) || 6}`
const mediaModule = (source: string) => (source.startsWith('cinema-') ? 'cinema' : source.startsWith('games-') ? 'games' : 'music')

function renderWidget(widget: BuilderWidget, ctx: Ctx): ReactNode {
  const { locale, landing } = ctx
  const owner = widget.type === 'media' ? mediaModule(widget.props.source || '') : WIDGET_MODULE[widget.type]
  if (owner && ctx.modules[owner] === false) {
    return ctx.preview ? frame(widget, ctx, <div className="br-img-ph br-video-ph">{locale === 'fa' ? 'ماژول این بلوک غیرفعال است' : 'This block\'s module is turned off'}</div>) : null
  }
  const props = widget.props
  const radius = radiusOf(widget)

  switch (widget.type) {
    case 'heading': {
      const level = LEVELS.has(props.level || '') ? props.level : 'h2'
      const text = pick(locale, props.text, props.textEn)
      const Tag = level as 'h2'
      return frame(widget, ctx, text ? <Tag className="br-h">{text}</Tag> : null)
    }
    case 'text': {
      const html = locale === 'fa' ? props.html : props.htmlEn || props.html
      return frame(widget, ctx, html ? <div className="br-rich" dangerouslySetInnerHTML={{ __html: cleanWidgetHtml(html) }} /> : null)
    }
    case 'image': {
      if (!props.src) return frame(widget, ctx, <div className="br-img-ph" style={radius} />)
      const img = <img src={props.src} alt={props.alt || ''} loading="lazy" style={radius} />
      const linked = props.href ? <Link href={safeHref(props.href)}>{img}</Link> : img
      const label = pick(locale, props.label, props.labelEn)
      return frame(widget, ctx, <figure className="br-figure">{linked}{label && props.href && <figcaption><Link className="btn btn-ghost" href={safeHref(props.href)}>{label}</Link></figcaption>}</figure>)
    }
    case 'button': {
      const primary = pick(locale, props.label, props.labelEn)
      const secondary = pick(locale, props.secondaryLabel, props.secondaryLabelEn)
      const variantClass = props.variant === 'ghost' ? 'btn btn-ghost' : props.variant === 'link' ? 'text-link' : 'btn btn-primary'
      return frame(widget, ctx, <div className="br-buttons">
        {primary && <Link className={variantClass} style={radius} href={safeHref(props.href)}>{primary}</Link>}
        {secondary && props.secondaryHref && <Link className="btn btn-ghost" style={radius} href={safeHref(props.secondaryHref)}>{secondary}</Link>}
      </div>)
    }
    case 'divider':
      return frame(widget, ctx, <hr className="br-hr" />, 'br-plain')
    case 'spacer': {
      const hide = widget.style.hideOn && widget.style.hideOn !== 'none' ? ` br-hide-${widget.style.hideOn}` : ''
      return <div className={`br-spacer${hide}`} data-bid={ctx.nested ? undefined : widget.id} style={{ height: `${widget.style.paddingY ? Math.max(8, widget.style.paddingY) : 64}px` }} aria-hidden="true" />
    }
    case 'video': {
      const src = safeHref(toEmbedUrl(props.url || ''))
      if (!props.url || src === '#' || !/^https:\/\//.test(src)) return ctx.preview ? frame(widget, ctx, <div className="br-img-ph br-video-ph">{locale === 'fa' ? 'نشانی ویدیو را وارد کنید' : 'Add a video URL'}</div>) : null
      return frame(widget, ctx, <div className="br-video" style={radius}>
        <iframe src={src} title={props.title || 'Video'} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allow="accelerometer; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
      </div>)
    }
    case 'stats':
      return frame(widget, ctx, <div className="br-stats">
        {itemsOf(props.items).map((item, index) => <div className="br-stat" key={index}>
          <strong>{item.value || ''}</strong>
          <span>{pick(locale, item.label, item.labelEn)}</span>
        </div>)}
      </div>)
    case 'list': {
      const title = pick(locale, props.title, props.titleEn)
      const cards = itemsOf(props.items).map((item, index) => <article className="br-card" style={radius} key={index}>
        {item.icon && <span className="br-card-icon" aria-hidden="true">{item.icon}</span>}
        <h3>{pick(locale, item.title, item.titleEn)}</h3>
        <p>{pick(locale, item.text, item.textEn)}</p>
        {item.href && <Link className="text-link" href={safeHref(item.href)}>{locale === 'fa' ? 'بیشتر بخوانید' : 'Read more'}</Link>}
      </article>)
      return frame(widget, ctx, <>{title && <h2 className="br-h br-h-section">{title}</h2>}<div className="br-cards">{cards}</div></>)
    }
    case 'faq': {
      const title = pick(locale, props.title, props.titleEn)
      return frame(widget, ctx, <>{title && <h2 className="br-h br-h-section">{title}</h2>}
        <div className="br-faq">
          {itemsOf(props.items).map((item, index) => <details key={index}>
            <summary>{pick(locale, item.q, item.qEn)}</summary>
            <p>{pick(locale, item.a, item.aEn)}</p>
          </details>)}
        </div>
      </>)
    }
    case 'icon-box': {
      const title = pick(locale, props.title, props.titleEn), text = pick(locale, props.text, props.textEn)
      const body = <><span className="br-iconbox-icon"><Icon name={props.icon || 'sparkles'} size={26} /></span><span className="br-iconbox-copy">{title && <strong>{title}</strong>}{text && <span>{text}</span>}</span></>
      return frame(widget, ctx, props.href && safeHref(props.href) !== '#'
        ? <Link className={`br-iconbox is-${props.layout === 'side' ? 'side' : 'top'} is-link`} style={radius} href={safeHref(props.href)}>{body}</Link>
        : <div className={`br-iconbox is-${props.layout === 'side' ? 'side' : 'top'}`} style={radius}>{body}</div>)
    }
    case 'tabs': {
      const tabs = itemsOf(props.items).map((item) => ({ title: pick(locale, item.title, item.titleEn), html: cleanWidgetHtml(escapeText(pick(locale, item.text, item.textEn))) })).filter((tab) => tab.title)
      return tabs.length ? frame(widget, ctx, <BuilderTabs tabs={tabs} />) : null
    }
    case 'testimonials': {
      const title = pick(locale, props.title, props.titleEn)
      return frame(widget, ctx, <>{title && <h2 className="br-h br-h-section">{title}</h2>}
        <div className="br-quotes">{itemsOf(props.items).map((item, index) => { const quote = pick(locale, item.quote, item.quoteEn); const avatar = safeSrc(item.avatar); return quote ? <figure className="br-quote" style={radius} key={index}>
          <blockquote>{quote}</blockquote>
          <figcaption>{avatar ? <img src={avatar} alt="" loading="lazy" /> : <span className="br-quote-initial" aria-hidden="true">{(item.name || '؟').trim().slice(0, 1)}</span>}<span><strong>{item.name || ''}</strong><small>{pick(locale, item.role, item.roleEn)}</small></span></figcaption>
        </figure> : null })}</div>
      </>)
    }
    case 'counters':
      return frame(widget, ctx, <div className="br-stats br-counters">
        {itemsOf(props.items).map((item, index) => { const typed = latinDigits(String(item.value || '')).replace(/[,٬\s]/g, ''), value = /^-?\d+(\.\d+)?$/.test(typed) ? Number(typed) : NaN; return <div className="br-stat" key={index}>
          <strong>{Number.isFinite(value) ? <BuilderCounter value={value} suffix={(item.suffix || '').slice(0, 6)} locale={locale} /> : item.value || ''}</strong>
          <span>{pick(locale, item.label, item.labelEn)}</span>
        </div> })}
      </div>)
    case 'gallery': {
      const pictures = itemsOf(props.items).map((item) => ({ src: safeSrc(item.src), alt: item.alt || '' })).filter((item) => item.src)
      if (!pictures.length) return ctx.preview ? frame(widget, ctx, <div className="br-img-ph" style={radius} />) : null
      return frame(widget, ctx, <div className="br-gallery" style={{ ['--br-gallery-cols' as string]: ['2', '3', '4', '5'].includes(props.columns) ? props.columns : '3' }}>
        {pictures.map((picture, index) => <a key={index} href={picture.src} target="_blank" rel="noopener noreferrer" style={radius}><img src={picture.src} alt={picture.alt} loading="lazy" /></a>)}
      </div>)
    }
    case 'carousel': {
      const slides = itemsOf(props.items).map((item) => ({ src: safeSrc(item.src), alt: item.alt || '', title: pick(locale, item.title, item.titleEn), href: item.href && safeHref(item.href) !== '#' ? safeHref(item.href) : '' })).filter((item) => item.src)
      if (!slides.length) return ctx.preview ? frame(widget, ctx, <div className="br-img-ph" style={radius} />) : null
      return frame(widget, ctx, <div className="br-carousel" role="region" aria-roledescription="carousel" aria-label={locale === 'fa' ? 'اسلایدر تصویر' : 'Image carousel'} tabIndex={0}>
        {slides.map((slide, index) => { const picture = <><img src={slide.src} alt={slide.alt} loading={index ? 'lazy' : 'eager'} />{slide.title && <span>{slide.title}</span>}</>; return slide.href ? <Link key={index} className="br-slide" style={radius} href={slide.href}>{picture}</Link> : <div key={index} className="br-slide" style={radius}>{picture}</div> })}
      </div>)
    }
    case 'pricing': {
      const title = pick(locale, props.title, props.titleEn)
      return frame(widget, ctx, <>{title && <h2 className="br-h br-h-section">{title}</h2>}
        <div className="br-pricing">{itemsOf(props.items).map((item, index) => { const name = pick(locale, item.title, item.titleEn); const label = pick(locale, item.label, item.labelEn); return name ? <article className={`br-price${item.featured === '1' ? ' is-featured' : ''}`} style={radius} key={index}>
          <h3>{name}</h3>
          <p className="br-price-amount"><strong>{pick(locale, item.price, item.priceEn)}</strong>{pick(locale, item.period, item.periodEn) && <small>{pick(locale, item.period, item.periodEn)}</small>}</p>
          <ul>{pick(locale, item.features, item.featuresEn).split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 12).map((line, row) => <li key={row}>{line}</li>)}</ul>
          {label && <Link className={item.featured === '1' ? 'btn btn-primary' : 'btn btn-ghost'} href={safeHref(item.href)}>{label}</Link>}
        </article> : null })}</div>
      </>)
    }
    case 'countdown': {
      const title = pick(locale, props.title, props.titleEn)
      if (!Number.isFinite(Date.parse(props.until || ''))) return ctx.preview ? frame(widget, ctx, <div className="br-img-ph br-video-ph">{locale === 'fa' ? 'تاریخ شمارش معکوس را تعیین کنید' : 'Set the countdown date'}</div>) : null
      return frame(widget, ctx, <div className="br-countdown-wrap">{title && <h3>{title}</h3>}<BuilderCountdown until={props.until} done={pick(locale, props.done, props.doneEn)} locale={locale} /></div>)
    }
    case 'social':
      return frame(widget, ctx, <ul className="br-social">
        {itemsOf(props.items).map((item, index) => { const network = (SOCIAL_NETWORKS as readonly string[]).includes(item.network) ? item.network : 'website'; const href = network === 'email' && item.href && !/^mailto:/.test(item.href) ? `mailto:${item.href}` : item.href; return href && safeHref(href) !== '#' ? <li key={index}><a href={safeHref(href)} target="_blank" rel="noopener noreferrer me" aria-label={SOCIAL_NAME[network] || network} title={SOCIAL_NAME[network] || network}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={SOCIAL_PATH[network] || SOCIAL_PATH.website} /></svg></a></li> : null })}
      </ul>)
    case 'progress':
      return frame(widget, ctx, <div className="br-progress">
        {itemsOf(props.items).map((item, index) => { const value = Math.max(0, Math.min(100, Math.round(Number(item.value) || 0))); const label = pick(locale, item.label, item.labelEn); return <div className="br-bar" key={index}>
          <div className="br-bar-head"><span>{label}</span><b className="num">{value.toLocaleString(locale === 'fa' ? 'fa-IR' : 'en-US')}٪</b></div>
          <div className="br-bar-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-label={label}><span style={{ inlineSize: `${value}%` }} /></div>
        </div> })}
      </div>)
    case 'html': {
      if (props.advanced === '1') return frame(widget, ctx, <AdvancedCode html={props.html || ''} css={props.css || ''} js={props.js || ''} className="br-rich" />)
      return frame(widget, ctx, <div className="br-rich" dangerouslySetInnerHTML={{ __html: cleanWidgetHtml(props.html) }} />, 'br-plain')
    }
    case 'template': {
      const doc = ctx.templates?.get(props.templateId || '')
      if (!doc || ctx.depth >= 3) return ctx.preview ? <div className="br-widget muted" data-bid={ctx.nested ? undefined : widget.id}>{locale === 'fa' ? 'قالب پیدا نشد' : 'Template not found'}</div> : null
      const child: Ctx = { ...ctx, depth: ctx.depth + 1, nested: true }
      const hide = widget.style.hideOn && widget.style.hideOn !== 'none' ? ` br-hide-${widget.style.hideOn}` : ''
      return <div className={`br-template${hide}`} data-bid={ctx.nested ? undefined : widget.id}>{doc.sections.map((section, index) => renderSection(section, child, `t${index}`, true))}</div>
    }
    case 'hero': {
      const title = pick(locale, props.title, props.titleEn)
      const text = pick(locale, props.text, props.textEn)
      const label = pick(locale, props.label, props.labelEn)
      const secondary = pick(locale, props.secondaryLabel, props.secondaryLabelEn)
      const eyebrow = pick(locale, props.eyebrow, props.eyebrowEn)
      return frame(widget, ctx, <div className="br-hero">
        <div className="br-hero-copy">
          {eyebrow && <span className="br-eyebrow">{eyebrow}</span>}
          {title && <h1 className="br-h br-hero-title">{title}</h1>}
          {text && <p className="br-lead">{text}</p>}
          <div className="br-buttons">
            {label && <Link className="btn btn-primary" style={radius} href={safeHref(props.href)}>{label}</Link>}
            {secondary && props.secondaryHref && <Link className="btn btn-ghost" style={radius} href={safeHref(props.secondaryHref)}>{secondary}</Link>}
          </div>
        </div>
        {props.src && <div className="br-hero-art"><img src={props.src} alt={props.alt || ''} loading="eager" style={radius} /></div>}
      </div>)
    }
    case 'cta': {
      const title = pick(locale, props.title, props.titleEn)
      const text = pick(locale, props.text, props.textEn)
      const label = pick(locale, props.label, props.labelEn)
      return frame(widget, ctx, <div className="br-cta" style={radius}>
        {title && <h2 className="br-h">{title}</h2>}
        {text && <p>{text}</p>}
        {label && <Link className="btn btn-primary" style={radius} href={safeHref(props.href)}>{label}</Link>}
      </div>)
    }
    case 'plans': {
      const title = pick(locale, props.title, props.titleEn)
      const limit = Number(props.limit) || 3
      if (!landing?.plans.length) return ctx.preview ? frame(widget, ctx, <div className="br-img-ph br-video-ph">{locale === 'fa' ? 'پلن فعالی وجود ندارد' : 'No active plans yet'}</div>) : null
      return frame(widget, ctx, <>{title && <h2 className="br-h br-h-section">{title}</h2>}
        <PlanCards plans={landing.plans.slice(0, limit)} tomanRate={landing.tomanRate} showWallet={false} showCurrencySwitch />
      </>)
    }
    case 'posts': {
      const title = pick(locale, props.title, props.titleEn)
      const posts = ctx.posts.get(postQueryKey(postQueryOf(widget, ctx.context))) || []
      if (!posts.length) return ctx.preview ? frame(widget, ctx, <div className="br-img-ph br-video-ph">{locale === 'fa' ? 'مطلبی با این فیلتر پیدا نشد' : 'No posts match this filter'}</div>) : null
      return frame(widget, ctx, <>{title && <h2 className="br-h br-h-section">{title}</h2>}
        <div className="br-posts">
          {posts.map((post) => <Link className="br-post" href={`/blog/${post.slug}`} key={post.id}>
            <div className="br-post-art">{post.cover ? <img src={post.cover} alt="" loading="lazy" /> : <span dir="ltr">HAPP / JOURNAL</span>}</div>
            <div className="br-post-copy">
              <small>{post.category ? pick(locale, post.category.name, post.category.nameEn) : 'JOURNAL'} · {new Date(post.publishedAt).toLocaleDateString(locale === 'fa' ? 'fa-IR' : 'en-US')}</small>
              <h3>{pick(locale, post.title, post.titleEn)}</h3>
              <p>{plainText(pick(locale, post.excerpt, post.excerptEn), 120)}</p>
            </div>
          </Link>)}
        </div>
      </>)
    }
    case 'products': {
      const title = pick(locale, props.title, props.titleEn)
      const products = ctx.products.get(productQueryKey(productQueryOf(widget, ctx.context))) || []
      if (!products.length) return ctx.preview ? frame(widget, ctx, <div className="br-img-ph br-video-ph">{locale === 'fa' ? 'محصولی با این فیلتر پیدا نشد' : 'No products match this filter'}</div>) : null
      return frame(widget, ctx, <>{title && <h2 className="br-h br-h-section">{title}</h2>}
        <div className="br-products">
          {products.map((product) => <Link className="br-product" href={`/products/${product.slug}`} key={product.id}>
            <div className="br-product-art">{product.image ? <img src={product.image} alt="" loading="lazy" /> : <span dir="ltr">HAPP STORE</span>}</div>
            <h3>{pick(locale, product.name, product.nameEn)}</h3>
            <strong>{formatAmount(product.price, product.currency, locale === 'fa' ? 'fa-IR' : 'en-US')}</strong>
          </Link>)}
        </div>
      </>)
    }
    case 'media': {
      const title = pick(locale, props.title, props.titleEn)
      const feed = ctx.media.get(mediaKey(widget))
      const fa = locale === 'fa'
      const section = mediaModule(props.source || '')
      if (!feed?.items.length) return ctx.preview ? frame(widget, ctx, <div className="br-img-ph br-video-ph">{fa ? 'هنوز محتوایی برای این فهرست منتشر نشده' : 'Nothing published for this feed yet'}</div>) : null
      const more = section === 'cinema' ? '/cinema' : section === 'games' ? '/games' : '/music'
      return frame(widget, ctx, <div className={`md-page md-embed md-${section}`}>
        <div className="md-shelf-head">{title ? <h2>{title}</h2> : <span />}<Link href={more} className="md-more">{fa ? 'همه ←' : 'All →'}</Link></div>
        {feed.kind === 'tracks' && <div className="mu-panel"><TrackList tracks={toPlayerTracks(feed.items, fa)} chart={props.source === 'music-top'} /></div>}
        {feed.kind === 'albums' && <Slider className="md-rail">{feed.items.map((album) => <AlbumCard key={album.id} album={album} fa={fa} />)}</Slider>}
        {feed.kind === 'titles' && <Slider className="md-rail">{feed.items.map((item, i) => <PosterCard key={item.id} item={item} fa={fa} rank={props.source === 'cinema-top' ? i + 1 : undefined} />)}</Slider>}
        {feed.kind === 'games' && <Slider className="md-rail">{feed.items.map((game) => <GameCard key={game.id} game={game} fa={fa} />)}</Slider>}
      </div>)
    }
    case 'vip-cta': {
      const fa = locale === 'fa'
      const title = pick(locale, props.title, props.titleEn) || (fa ? 'همه چیز، بدون محدودیت' : 'Everything. No limits.')
      const text = pick(locale, props.text, props.textEn) || (fa ? 'فیلم، سریال، موزیک، بازی و مطالب ویژه به‌همراه قیمت مخصوص اعضا.' : 'Films, series, music, games and premium articles — plus member prices.')
      const label = pick(locale, props.label, props.labelEn) || (fa ? 'مشاهده پلن‌های VIP' : 'See VIP plans')
      return frame(widget, ctx, <aside className="vip-strip" style={radius}>
        <span className="vip-strip-crown" aria-hidden="true">♛</span>
        <div><b>{title}</b><p>{text}</p></div>
        <Link href="/vip" className="btn vip-btn">{label}</Link>
      </aside>)
    }
    case 'network': {
      const title = pick(locale, props.title, props.titleEn)
      const text = pick(locale, props.text, props.textEn)
      return frame(widget, ctx, <div className="br-network">
        <div className="br-network-copy">
          {title && <h2 className="br-h">{title}</h2>}
          {text && <p>{text}</p>}
          <Link className="btn btn-primary" href="/plans">{locale === 'fa' ? 'مشاهده پلن‌ها' : 'See plans'}</Link>
        </div>
        <NetworkGlobe count={landing?.locations.length || 0} label={locale === 'fa' ? 'موقعیت سرور' : 'Server locations'} brand="MOBOCOMCMS" />
      </div>)
    }
    case 'form': {
      const form = (landing?.forms || []).find((entry) => entry.slug === props.slug) || (props.slug ? undefined : landing?.forms[0])
      if (!form) return ctx.preview ? frame(widget, ctx, <div className="br-img-ph br-video-ph">{locale === 'fa' ? 'فرم منتشرشده‌ای با این شناسه پیدا نشد' : 'No published form with this ID'}</div>) : null
      const title = pick(locale, props.title, props.titleEn)
      return frame(widget, ctx, <>{title && <h2 className="br-h br-h-section">{title}</h2>}<PublicForm form={form} /></>)
    }
    case 'nav': {
      const links = [
        { href: '/', label: locale === 'fa' ? 'خانه' : 'Home' },
        ...(ctx.modules.vpn !== false ? [{ href: '/plans', label: locale === 'fa' ? 'پلن‌ها' : 'Plans' }] : []),
        ...(ctx.modules.store !== false ? [{ href: '/products', label: locale === 'fa' ? 'فروشگاه' : 'Shop' }] : []),
        ...(ctx.modules.journal !== false ? [{ href: '/blog', label: locale === 'fa' ? 'مجله' : 'Journal' }] : []),
        ...(ctx.nav || []).map((entry) => ({ href: `/p/${entry.slug}`, label: pick(locale, entry.title, entry.titleEn) })),
      ]
      return frame(widget, ctx, <nav className="br-nav" aria-label={locale === 'fa' ? 'منوی صفحه' : 'Page menu'}>
        <Link href="/" className="br-nav-brand">HAPP<span>VPN</span></Link>
        <div className="br-nav-links">
          {links.map((link) => <Link key={link.href + link.label} href={link.href}>{link.label}</Link>)}
        </div>
      </nav>)
    }
    case 'site-header':
      return frame(widget, ctx, <SiteHeader theme={ctx.theme} navPages={ctx.nav || []} />, 'br-plain br-site-chrome')
    case 'site-footer':
      return frame(widget, ctx, <SiteFooter navPages={ctx.nav || []} />, 'br-plain br-site-chrome')
    default: {
      if (!SLOT_TYPES.has(widget.type)) return null
      const slot = ctx.slots?.[widget.type as SlotWidgetType]
      if (slot) return frame(widget, ctx, slot, widget.type === 'content' || widget.type === 'post-footer' ? 'br-slot journal-post-col' : 'br-slot')
      const product = widget.type.startsWith('product-')
      return ctx.preview ? frame(widget, ctx, <div className="br-img-ph br-video-ph">{product
        ? (locale === 'fa' ? `«${WIDGET_NAME_FA[widget.type] || widget.type}» — در صفحهٔ محصول پر می‌شود` : `${widget.type} — filled on product pages`)
        : (locale === 'fa' ? `«${WIDGET_NAME_FA[widget.type] || widget.type}» — در صفحهٔ مقاله پر می‌شود` : `${widget.type} — filled on article pages`)}</div>) : null
    }
  }
}

const WIDGET_NAME_FA: Record<string, string> = {
  'post-header': 'هدر پست', 'post-cover': 'کاور پست', content: 'متن مقاله', 'post-footer': 'انتهای پست',
  'product-hero': 'بالای محصول', 'product-gallery': 'گالری محصول', 'product-info': 'مشخصات محصول',
  'product-purchase': 'باکس خرید', 'product-usp': 'مزایای خرید', 'product-tabs': 'تب‌های محصول',
}

function renderSection(section: BuilderSection, ctx: Ctx, key: string, nestedSection = false): ReactNode {
  const nested = nestedSection || !!ctx.nested
  const style: CSSProperties = { paddingBlock: `${section.style.paddingY}px` }
  if (section.style.bg) style.background = section.style.bg
  if (section.style.bgImage) {
    style.backgroundImage = `url("${section.style.bgImage}")`
    style.backgroundSize = 'cover'
    style.backgroundPosition = 'center'
    style.backgroundBlendMode = 'multiply'
  }
  const classes = ['br-section']
  if (section.adv) classes.push(advClass(section.id, section.adv).trim())
  if (section.style.tone !== 'none') classes.push(`br-tone-${section.style.tone}`)
  if (section.style.hideOn && section.style.hideOn !== 'none') classes.push(`br-hide-${section.style.hideOn}`)
  const width = section.style.width || 'boxed'
  const valign = section.style.valign || 'start'
  // Nested (template) sections keep their markup but drop the ids used by the editor,
  // so clicks select the template block instead of sections that are not in this doc.
  return <section id={nested ? undefined : section.anchor || undefined} className={classes.join(' ')} style={style} data-sid={nested ? undefined : section.id} key={key}>
    {styleTag(section.id, section.adv)}
    <div className={`br-container br-width-${width}`}>
      <div className={`br-cols br-valign-${valign}`}>
        {section.columns.map((column, index) => <div className="br-col" style={{ flex: `${column.width} 1 0%` }} data-cid={nested ? undefined : column.id} key={column.id || index}>
          {column.widgets.map((widget) => <div className={`br-cell${advClass(widget.id, widget.adv)}`} key={widget.id}>{styleTag(widget.id, widget.adv)}{renderWidget(widget, ctx)}</div>)}
        </div>)}
      </div>
    </div>
  </section>
}

function renderCode(code: BuilderCode): ReactNode {
  if (code.advanced) return <AdvancedCode html={code.html} css={code.css} js={code.js} className="br-page" />
  return <div className="br-page">
    {code.css && <style>{sanitizeWidgetCss(code.css)}</style>}
    {code.html && <div className="br-rich" dangerouslySetInnerHTML={{ __html: cleanWidgetHtml(code.html) }} />}
  </div>
}

/**
 * `preview` shows placeholders for empty blocks (admin live preview only).
 * `editable={false}` renders a document that is not the one being edited (e.g. a
 * post layout template) without editor ids, so preview clicks cannot select it.
 */
export default async function BuilderRenderer({ doc, locale, data, slots, preview, editable = true, context = {} }: {
  doc: BuilderDoc
  locale: BuilderLocale
  data?: LandingData
  slots?: BuilderSlots
  preview?: boolean
  editable?: boolean
  context?: BuilderContext
}) {
  if (doc.mode === 'code') return renderCode(doc.code)

  const ownWidgets = doc.sections.flatMap((section) => section.columns.flatMap((column) => column.widgets))
  const needsTemplates = ownWidgets.some((widget) => widget.type === 'template')
  const userTemplates = needsTemplates ? await listUserTemplates() : null
  const templates = needsTemplates
    ? new Map<string, BuilderDoc>([
        ...BUNDLED_TEMPLATES.map((entry) => [entry.id, entry.doc] as const),
        ...(userTemplates || []).map((entry) => [entry.id, entry.doc] as const),
      ])
    : null
  const widgets = collectWidgets(doc, templates)
  const needsData = widgets.some((widget) => DYNAMIC.has(widget.type))
  const needsNav = widgets.some((widget) => widget.type === 'nav' || widget.type === 'site-header' || widget.type === 'site-footer')
  const needsTheme = widgets.some((widget) => widget.type === 'site-header')

  const mediaQueries = new Map<string, { source: string; limit: number }>()
  for (const widget of widgets) if (widget.type === 'media') mediaQueries.set(mediaKey(widget), { source: widget.props.source || 'music-new', limit: Number(widget.props.limit) || 6 })
  const postQueries = new Map<string, PostQuery>()
  const productQueries = new Map<string, ProductQuery>()
  for (const widget of widgets) {
    if (widget.type === 'posts') { const q = postQueryOf(widget, context); postQueries.set(postQueryKey(q), q) }
    if (widget.type === 'products') { const q = productQueryOf(widget, context); productQueries.set(productQueryKey(q), q) }
  }

  const [landing, navPages, theme, postResults, productResults, modules, mediaResults] = await Promise.all([
    data || needsData ? data || getLandingData() : null,
    needsNav ? getPublicNavigationPages() : null,
    needsTheme ? getServerTheme() : 'dark',
    Promise.all([...postQueries].map(async ([key, q]) => [key, await getBuilderPosts(q)] as const)),
    Promise.all([...productQueries].map(async ([key, q]) => [key, await getBuilderProducts(q)] as const)),
    getModuleStates(),
    Promise.all([...mediaQueries].map(async ([key, q]) => [key, await getBuilderMedia(q.source, q.limit)] as const)),
  ])

  const ctx: Ctx = {
    locale, landing, templates, depth: 0, slots, nav: navPages, preview, nested: !editable, context,
    posts: new Map(postResults), products: new Map(productResults), media: new Map(mediaResults), theme: String(theme || 'dark'), modules,
  }
  return <div className="br-doc">{doc.sections.map((section, index) => renderSection(section, ctx, section.id || String(index)))}</div>
}
