import type { Metadata } from 'next'
import Link from '@/components/AppLink'
import type { ReactNode } from 'react'
import { requireModule } from '@/extensions/server/modules'
import { MAX_SCANNED_MATCHES, searchSite, suggestSearchCorrection } from '@/modules/search/server/search'
import { NO_FACETS, facetParams, hasFacets, type SearchFacets } from '@/modules/search/domain/facets'
import { ITEM_LABEL, type ItemType } from '@/modules/content/domain/items'
import { normalizePersian } from '@/shared/text/persian'
import MediaShell from '@/components/media/MediaShell'
import { RatingMeter } from '@/components/engage/RatingMeter'
import SearchAdvancedControls from '@/components/search/SearchAdvancedControls'
import Icon from '@/components/site/Icon'
import ThemeFrame from '@/components/content/builder/ThemeFrame'
import ContentRequest from '@/components/site/ContentRequest'
import styles from '@/components/search/SearchPage.module.css'

export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<{ q?: string; type?: string; page?: string; cursor?: string; access?: string; rated?: string; since?: string; sort?: string; dimension?: string; dimensionMin?: string }> }

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = await searchParams
  return { title: q ? `جست‌وجوی «${String(q).slice(0, 60)}»` : 'جست‌وجو', robots: { index: false, follow: true } }
}

const num = (value: number) => value.toLocaleString('fa-IR')
const SUGGESTED = [
  { term: 'ویندوز', icon: 'devices', description: 'نرم‌افزار و ابزارهای کاربردی' },
  { term: 'آنتی ویروس', icon: 'shield', description: 'امنیت و محافظت از دستگاه‌ها' },
  { term: 'بازی اکشن', icon: 'gamepad', description: 'بازی‌ها و دنیای سرگرمی' },
  { term: 'فیلم علمی تخیلی', icon: 'film', description: 'فیلم، سریال و داستان‌های تازه' },
  { term: 'موزیک', icon: 'music', description: 'آهنگ، آلبوم و هنرمندان' },
  { term: 'گوشی', icon: 'phone', description: 'محصولات، راهنماها و بررسی‌ها' },
]
const TYPE_ICON: Record<ItemType, string> = {
  software: 'devices', game: 'gamepad', studio: 'code', title: 'film', person: 'user',
  album: 'music', track: 'music', artist: 'mic', product: 'bag', post: 'book',
  thread: 'chat', business: 'store', prompt: 'sparkles',
}

/** Marks query tokens inside a title (comparison on normalized text, display on the original). */
function highlight(title: string, tokens: string[]): ReactNode {
  const words = title.split(/(\s+)/)
  return words.map((word, index) => {
    const normalized = normalizePersian(word)
    return normalized && tokens.some((token) => normalized.startsWith(token) || (token.length > 2 && normalized.includes(token))) ? <mark key={index}>{word}</mark> : word
  })
}

export default async function SearchPage({ searchParams }: Props) {
  await requireModule('search')
  const params = await searchParams
  const data = await searchSite({ q: params.q, type: params.type, page: params.page, cursor: params.cursor, facets: params })
  const q = data.query
  const correction = q && !data.hits.length && data.total === 0 && !hasFacets(data.facets) && !params.cursor && (!params.page || Number(params.page) === 1)
    ? await suggestSearchCorrection(q, data.type)
    : null
  const narrowed = facetParams(data.facets)
  const href = (type: string, page = 1) => `/search?q=${encodeURIComponent(q)}${type !== 'all' ? `&type=${type}` : ''}${narrowed ? `&${narrowed}` : ''}${page > 1 ? `&page=${page}` : ''}`
  // The same search with one facet changed (the page starts again from the first).
  const facetHref = (patch: Partial<SearchFacets>) => { const next = facetParams(patch === NO_FACETS ? NO_FACETS : { ...data.facets, ...patch }); return `/search?q=${encodeURIComponent(q)}${data.type !== 'all' ? `&type=${data.type}` : ''}${next ? `&${next}` : ''}` }
  const chip = (label: string, patch: Partial<SearchFacets>, on: boolean) => <Link key={label} href={facetHref(patch)} className={on ? styles.selected : undefined} aria-current={on ? 'true' : undefined} rel="nofollow">{on && <Icon name="check" size={14} />}{label}</Link>
  const cursorHref = (cursor: string) => `${href(data.type)}&cursor=${encodeURIComponent(cursor)}`
  const previousHref = params.cursor && !data.cursorReset
    ? (data.previousCursor ? cursorHref(data.previousCursor) : null)
    : data.page > 1 ? href(data.type, data.page - 1) : null
  const nextHref = params.cursor && !data.cursorReset
    ? (data.nextCursor ? cursorHref(data.nextCursor) : null)
    : data.page < data.pages ? href(data.type, data.page + 1) : data.nextCursor ? cursorHref(data.nextCursor) : null
  const totalAll = Object.values(data.counts).reduce((sum, count) => sum + (count || 0), 0)
  // A search stops reading at its cap: the counts are then a lower bound.
  const more = data.capped ? '+' : ''
  const types = (Object.keys(data.counts) as ItemType[]).sort((a, b) => (data.counts[b] || 0) - (data.counts[a] || 0))

  return (
    <MediaShell section="search">
      <ThemeFrame type="search" locale="fa" context={{ route: 'search' }} values={{ title: q ? `نتایج جست‌وجو برای «${q}»` : 'جست‌وجو', excerpt: q ? `${num(totalAll)}${more} نتیجه` : '', url: href(data.type) }}>
      <div className={`container ${styles.page}`}>
        <header className={`${styles.hero} ${q ? styles.compactHero : ''}`}>
          <div className={styles.intro}>
            <div>
              {!q && <span className={styles.eyebrow}><Icon name="grid" size={18} />کشف کنید</span>}
              <h1>{q ? <>نتایج جست‌وجو برای «<bdi>{q}</bdi>»</> : 'جست‌وجو در موبوکام'}</h1>
              {!q && <p>از یک موضوع شروع کنید؛ میان محتوا، محصولات و دنیای سرگرمی بگردید.</p>}
            </div>
            {!q && <div className={styles.searchHint}><Icon name="search" size={24} /><span>دنبال چه می‌گردید؟<small>نام یک اثر، هنرمند، محصول یا موضوع</small></span></div>}
          </div>
          <form className={styles.searchForm} role="search" aria-label="جست‌وجو در موبوکام" action="/search">
            <div className={styles.inputWrap}>
              <Icon name="search" size={22} />
              <input name="q" type="search" dir="auto" defaultValue={q} placeholder="نرم‌افزار، بازی، فیلم، آهنگ، محصول یا مقاله…" aria-label="عبارت جست‌وجو" maxLength={100} enterKeyHint="search" aria-describedby="search-help" />
            </div>
            {data.type !== 'all' && <input type="hidden" name="type" value={data.type} />}
            <button type="submit" className={styles.primaryButton}>جست‌وجو<Icon name="arrow" size={18} /></button>
          </form>
          <p id="search-help" className={styles.help}>{q && data.tokens.length === 0 ? 'دست‌کم دو حرف بنویسید.' : 'نام فارسی یا انگلیسی را بنویسید؛ می‌توانید نتایج را بر اساس نوع محتوا و امتیاز محدود کنید.'}</p>
        </header>

        {data.tokens.length > 0 && <section className={styles.filters} aria-label="فیلترهای جست‌وجو">
          {totalAll > 0 && <nav className={styles.tabs} aria-label="نوع نتیجه">
            <Link href={href('all')} className={data.type === 'all' ? styles.selected : undefined} aria-current={data.type === 'all' ? 'page' : undefined}><Icon name="layers" size={18} />همه <span>{num(totalAll)}{more}</span></Link>
            {types.map((type) => <Link key={type} href={href(type)} className={data.type === type ? styles.selected : undefined} aria-current={data.type === type ? 'page' : undefined}><Icon name={TYPE_ICON[type]} size={18} />{ITEM_LABEL[type].many} <span>{num(data.counts[type] || 0)}{more}</span></Link>)}
          </nav>
          }
          <SearchAdvancedControls query={q} type={data.type} facets={data.facets} />

          {(totalAll > 0 || hasFacets(data.facets)) && <nav className={styles.facets} aria-label="محدودکردن نتیجه‌ها">
            {chip('امتیاز ۴ و بالاتر', { rated: data.facets.rated === 4 ? 0 : 4 }, data.facets.rated === 4)}
            {chip('امتیاز ۳ و بالاتر', { rated: data.facets.rated === 3 ? 0 : 3 }, data.facets.rated === 3)}
            {chip('رایگان', { access: data.facets.access === 'free' ? '' : 'free' }, data.facets.access === 'free')}
            {chip('ویژهٔ اعضا', { access: data.facets.access === 'members' ? '' : 'members' }, data.facets.access === 'members')}
            {chip('هفتهٔ اخیر', { since: data.facets.since === 'week' ? '' : 'week' }, data.facets.since === 'week')}
            {chip('ماه اخیر', { since: data.facets.since === 'month' ? '' : 'month' }, data.facets.since === 'month')}
            {chip('سال اخیر', { since: data.facets.since === 'year' ? '' : 'year' }, data.facets.since === 'year')}
            {hasFacets(data.facets) && <Link className={styles.clear} href={facetHref(NO_FACETS)} rel="nofollow">برداشتن فیلترها</Link>}
          </nav>}
        </section>}

        {data.capped && <p className={styles.notice} role="status">بیش از {num(MAX_SCANNED_MATCHES)} نتیجه پیدا شد و تازه‌ترین‌های آن‌ها نشان داده می‌شوند. برای نتیجهٔ دقیق‌تر، واژهٔ دیگری اضافه کنید یا نوع نتیجه را انتخاب کنید.</p>}
        {data.cursorReset && <p className={styles.notice} role="status">نتایج جست‌وجو به‌روز شده‌اند یا لینک صفحه معتبر نیست؛ نتایج از صفحهٔ اول نمایش داده شدند.</p>}
        {data.hits.length > 0 ? (
          <section aria-labelledby="search-results-heading">
            <div className={styles.sectionHeading}><h2 id="search-results-heading">آنچه پیدا کردیم</h2><p>{num(data.total)}{more} نتیجه <span>· صفحهٔ {num(data.page)}</span></p></div>
            <ol className={styles.results}>
            {data.hits.map((hit) => (
              <li key={`${hit.type}:${hit.id}`} className={styles.result}>
                <Link href={hit.url} className={styles.thumbnail} tabIndex={-1} aria-hidden="true">{hit.image ? <img src={hit.image} alt="" loading="lazy" width={120} height={144} /> : <Icon name={TYPE_ICON[hit.type]} size={32} />}</Link>
                <div className={styles.resultBody}>
                  <div className={styles.resultMeta}><span className={styles.typeLabel}>{ITEM_LABEL[hit.type].one}</span>{hit.access === 'MEMBERS' && <span className={styles.memberLabel}><Icon name="crown" size={14} />ویژهٔ اعضا</span>}{hit.rating && hit.rating.average !== null && <span className={styles.rating} title={`${num(hit.rating.count)} نظر`}><RatingMeter size="sm" value={hit.rating.average} label={`${hit.rating.average} از ۵`} /> {hit.rating.average.toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} <small>({num(hit.rating.count)})</small></span>}</div>
                  <h3><Link href={hit.url}>{highlight(hit.title, data.tokens)}</Link></h3>
                  {hit.subtitle && <p className={styles.subtitle}>{hit.subtitle}</p>}
                  {hit.snippet && <p className={styles.snippet}>…{hit.snippet}…</p>}
                </div>
                <span className={styles.resultArrow} aria-hidden="true"><Icon name="arrow" size={18} /></span>
              </li>
            ))}
            </ol>
          </section>
        ) : q && data.tokens.length > 0 ? (
          <section className={styles.empty} aria-label="بدون نتیجه">
            <span className={styles.emptyIcon}><Icon name="search" size={32} /></span>
            <ContentRequest compact query={q} section={({ product: 'store', title: 'cinema', game: 'games', software: 'software', track: 'music', album: 'music', post: 'magazine', thread: 'forum' } as Record<string, string>)[data.type]} />
            <h2>چیزی برای «<bdi>{q}</bdi>» پیدا نشد</h2>
            {correction && <p>منظورتان <Link href={`/search?q=${encodeURIComponent(correction)}${data.type !== 'all' ? `&type=${data.type}` : ''}`}><bdi>{correction}</bdi></Link> بود؟</p>}
            <p>{hasFacets(data.facets) ? <>با این فیلترها نتیجه‌ای نیست. <Link href={facetHref(NO_FACETS)} rel="nofollow">فیلترها را بردارید</Link>.</> : 'املای دیگری امتحان کنید، عبارت کوتاه‌تری بنویسید یا نام انگلیسی را جست‌وجو کنید.'}</p>
            <div className={styles.chips}>{SUGGESTED.map(({ term }) => <Link key={term} href={`/search?q=${encodeURIComponent(term)}`}>{term}</Link>)}</div>
          </section>
        ) : (
          <div className={styles.discovery}>
            <section aria-labelledby="search-suggestions-heading">
              <div className={styles.sectionHeading}><h2 id="search-suggestions-heading">برای شروع، کشف کنید</h2><p>چند پیشنهاد برای جست‌وجو</p></div>
              <div className={styles.suggestions}>{SUGGESTED.map(({ term, icon, description }) => <Link key={term} href={`/search?q=${encodeURIComponent(term)}`}><span className={styles.suggestionIcon}><Icon name={icon} size={24} /></span><span><strong>{term}</strong><small>{description}</small></span><Icon name="arrow" size={18} className={styles.suggestionArrow} /></Link>)}</div>
            </section>
            <aside className={styles.guide} aria-labelledby="search-guide-heading">
              <span className={styles.eyebrow}><Icon name="sliders" size={18} />راهنمای جست‌وجو</span>
              <h2 id="search-guide-heading">سریع‌تر به نتیجه برسید</h2>
              <ul>
                <li><Icon name="search" size={18} /><span><strong>با نام یا موضوع شروع کنید</strong>نام فارسی یا انگلیسی؛ دست‌کم دو حرف</span></li>
                <li><Icon name="layers" size={18} /><span><strong>بخش موردنظر را انتخاب کنید</strong>پس از جست‌وجو، نتایج هر بخش را جدا ببینید</span></li>
                <li><Icon name="star" size={18} /><span><strong>نتایج را دقیق‌تر کنید</strong>از فیلتر زمان، دسترسی و امتیاز کمک بگیرید</span></li>
              </ul>
            </aside>
          </div>
        )}

        {data.totalPages > 1 && (
          <nav className={styles.pager} aria-label="صفحه‌بندی">
            {previousHref ? <Link href={previousHref} prefetch={false} rel="prev"><Icon name="arrow" size={18} className={styles.previousArrow} />قبلی</Link> : <span />}
            <span>صفحهٔ {num(data.page)} از {num(data.totalPages)}{more}</span>
            {nextHref ? <Link href={nextHref} prefetch={false} rel="next">بعدی<Icon name="arrow" size={18} /></Link> : <span />}
          </nav>
        )}
      </div>
      </ThemeFrame>
    </MediaShell>
  )
}
