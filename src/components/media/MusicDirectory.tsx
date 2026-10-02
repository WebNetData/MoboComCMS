import type { ReactNode } from 'react'
import MediaShell from './MediaShell'
import { musicNav } from './nav'
import Pager from './Pager'
import { EmptyState } from './MediaCards'
import Link from '@/components/AppLink'

export default function MusicDirectory({ kind, title, count, q, page, pages, fa, children }: {
  kind: 'artists' | 'albums' | 'playlists'
  title: string
  count: number
  q: string
  page: number
  pages: number
  fa: boolean
  children: ReactNode
}) {
  const path = `/music/${kind}`
  const href = (next: number) => `${path}?${new URLSearchParams({ ...(q ? { q } : {}), page: String(next) })}`
  return <MediaShell section="music" active={kind} nav={musicNav(fa)} search={{ action: '/music/browse', placeholder: fa ? 'جست‌وجوی آهنگ یا خواننده…' : 'Search songs or artists…' }}>
    <div className="container md-body">
      <header className="md-page-head mu-directory-head">
        <div><span className="md-eyebrow">{fa ? 'کتابخانهٔ موزیک' : 'Music library'}</span><h1>{title}</h1><p className="muted">{count.toLocaleString(fa ? 'fa-IR' : 'en-US')} {fa ? 'مورد' : 'entries'}</p>{kind === 'playlists' && <Link className="btn btn-ghost mt-3" href="/music/my-playlists">{fa ? 'پلی‌لیست‌های من' : 'My playlists'}</Link>}</div>
        <form action={path} role="search" className="mu-directory-search">
          <input className="input" type="search" name="q" defaultValue={q} maxLength={100} placeholder={fa ? `جست‌وجو در ${title}…` : `Search ${title.toLowerCase()}…`} aria-label={fa ? `جست‌وجو در ${title}` : `Search ${title.toLowerCase()}`} />
          <button className="btn btn-primary" type="submit">{fa ? 'جست‌وجو' : 'Search'}</button>
        </form>
      </header>
      {count ? <div className={`mu-directory-grid is-${kind}`}>{children}</div> : <EmptyState fa={fa} title={fa ? 'موردی پیدا نشد' : 'No results'} text={fa ? 'عبارت دیگری را جست‌وجو کنید.' : 'Try another search.'} />}
      <Pager page={page} pages={pages} href={href} fa={fa} />
    </div>
  </MediaShell>
}
