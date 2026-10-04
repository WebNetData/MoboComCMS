import type { Metadata } from 'next'
import Link from '@/components/AppLink'
import type { ReactNode } from 'react'
import { requireModule } from '@/extensions/server/modules'
import { searchSite } from '@/modules/search/server/search'
import { ITEM_LABEL, type ItemType } from '@/modules/content/domain/items'
import { normalizePersian } from '@/shared/text/persian'
import MediaShell from '@/components/media/MediaShell'

export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<{ q?: string; type?: string; page?: string; cursor?: string }> }

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = await searchParams
  return { title: q ? `جست‌وجوی «${String(q).slice(0, 60)}»` : 'جست‌وجو', robots: { index: false, follow: true } }
}

const num = (value: number) => value.toLocaleString('fa-IR')
const SUGGESTED = ['ویندوز', 'آنتی ویروس', 'بازی اکشن', 'فیلم علمی تخیلی', 'موزیک', 'گوشی']

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
  const data = await searchSite({ q: params.q, type: params.type, page: params.page, cursor: params.cursor })
  const q = data.query
  const href = (type: string, page = 1) => `/search?q=${encodeURIComponent(q)}${type !== 'all' ? `&type=${type}` : ''}${page > 1 ? `&page=${page}` : ''}`
  const cursorHref = (cursor: string) => `${href(data.type)}&cursor=${encodeURIComponent(cursor)}`
  const previousHref = params.cursor && !data.cursorReset
    ? (data.previousCursor ? cursorHref(data.previousCursor) : null)
    : data.page > 1 ? href(data.type, data.page - 1) : null
  const nextHref = params.cursor && !data.cursorReset
    ? (data.nextCursor ? cursorHref(data.nextCursor) : null)
    : data.page < data.pages ? href(data.type, data.page + 1) : data.nextCursor ? cursorHref(data.nextCursor) : null
  const totalAll = Object.values(data.counts).reduce((sum, count) => sum + (count || 0), 0)
  const types = (Object.keys(data.counts) as ItemType[]).sort((a, b) => (data.counts[b] || 0) - (data.counts[a] || 0))

  return (
    <MediaShell section="search">
      <div className="container sr-page">
        <header className="sr-head">
          <h1>{q ? <>نتایج جست‌وجو برای «<bdi>{q}</bdi>»</> : 'جست‌وجو در موبوکام'}</h1>
          <form className="sr-form" role="search" action="/search">
            <input name="q" type="search" dir="rtl" defaultValue={q} className="input" placeholder="نرم‌افزار، بازی، فیلم، آهنگ، محصول یا مقاله…" aria-label="عبارت جست‌وجو" autoFocus={!q} enterKeyHint="search" />
            {data.type !== 'all' && <input type="hidden" name="type" value={data.type} />}
            <button className="btn btn-primary">جست‌وجو</button>
          </form>
          {q && data.tokens.length === 0 && <p className="muted">دست‌کم دو حرف بنویسید.</p>}
        </header>

        {totalAll > 0 && (
          <nav className="sr-tabs" aria-label="نوع نتیجه">
            <Link href={href('all')} className={data.type === 'all' ? 'is-active' : ''} aria-current={data.type === 'all' ? 'page' : undefined}>همه <span>{num(totalAll)}</span></Link>
            {types.map((type) => <Link key={type} href={href(type)} className={data.type === type ? 'is-active' : ''} aria-current={data.type === type ? 'page' : undefined}>{ITEM_LABEL[type].icon} {ITEM_LABEL[type].many} <span>{num(data.counts[type] || 0)}</span></Link>)}
          </nav>
        )}

        {data.hits.length > 0 ? (
          <ol className="sr-list">
            {data.hits.map((hit) => (
              <li key={`${hit.type}:${hit.id}`} className="sr-item">
                <Link href={hit.url} className="sr-thumb" tabIndex={-1} aria-hidden="true">{hit.image ? <img src={hit.image} alt="" loading="lazy" /> : <span>{ITEM_LABEL[hit.type].icon}</span>}</Link>
                <div className="sr-body">
                  <span className="sr-type">{ITEM_LABEL[hit.type].one}{hit.access === 'MEMBERS' && <b className="vip-chip is-small">♛ VIP</b>}</span>
                  <h2><Link href={hit.url}>{highlight(hit.title, data.tokens)}</Link></h2>
                  {hit.subtitle && <p className="sr-sub">{hit.subtitle}</p>}
                  {hit.snippet && <p className="sr-snippet">…{hit.snippet}…</p>}
                </div>
              </li>
            ))}
          </ol>
        ) : q && data.tokens.length > 0 ? (
          <div className="sr-empty">
            <span aria-hidden="true">🔍</span>
            <h2>چیزی برای «<bdi>{q}</bdi>» پیدا نشد</h2>
            <p className="muted">املای دیگری امتحان کنید، کلمهٔ کوتاه‌تری بنویسید یا نام انگلیسی را جست‌وجو کنید.</p>
            <div className="sr-chips">{SUGGESTED.map((term) => <Link key={term} href={`/search?q=${encodeURIComponent(term)}`}>{term}</Link>)}</div>
          </div>
        ) : (
          <div className="sr-empty">
            <p className="muted">پیشنهادها:</p>
            <div className="sr-chips">{SUGGESTED.map((term) => <Link key={term} href={`/search?q=${encodeURIComponent(term)}`}>{term}</Link>)}</div>
          </div>
        )}

        {data.cursorReset && <p className="muted" role="status">نتایج جست‌وجو به‌روز شده‌اند یا لینک صفحه معتبر نیست؛ نتایج از صفحهٔ اول نمایش داده شدند.</p>}
        {data.totalPages > 1 && (
          <nav className="sr-pager" aria-label="صفحه‌بندی">
            {previousHref && <Link href={previousHref} prefetch={false} rel="prev">→ قبلی</Link>}
            <span>صفحهٔ {num(data.page)} از {num(data.totalPages)}</span>
            {nextHref && <Link href={nextHref} prefetch={false} rel="next">بعدی ←</Link>}
          </nav>
        )}
      </div>
    </MediaShell>
  )
}
