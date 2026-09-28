import Link from '@/components/AppLink'
import MediaShell from '@/components/media/MediaShell'
import { profileCards, suggestions, peopleDirectory } from '@/modules/identity/server/profile'
import { communitySettings, getPost, homeFeed, trendingTags } from '@/modules/community/server/community'
import { normalizeTag } from '@/modules/community/domain/community'
import { Avatar, CmIcon } from '@/components/community/CommunityIcons'
import { Feed, PeopleList, PostCard } from '@/components/community/Social'

const fa = (n: number) => n.toLocaleString('fa-IR')

async function Sidebar({ viewerId }: { viewerId: number | null }) {
  const [people, tags] = await Promise.all([suggestions(viewerId, 5), trendingTags()])
  return <aside className="cm-aside">
    {tags.length > 0 && <section className="cm-card"><h2>داغ‌ترین برچسب‌ها</h2><ul className="cm-trends">{tags.map((row) => <li key={row.tag}><Link href={`/feed?tag=${encodeURIComponent(row.tag)}`}><b>#{row.tag}</b><small className="num">{fa(row.count)} پست</small></Link></li>)}</ul></section>}
    {people.length > 0 && <section className="cm-card"><h2>پیشنهاد برای دنبال کردن</h2><PeopleList people={people} signedIn={!!viewerId} variant="list" /><Link href="/people" className="cm-link">همهٔ کاربران ←</Link></section>}
  </aside>
}

/** /feed — the social home: following / everyone / hashtag, composer and infinite scroll. */
export async function FeedPage({ viewerId, mode, tag: tagParam }: { viewerId: number | null; mode?: string; tag?: string }) {
  const tag = normalizeTag(tagParam)
  const [data, settings, me] = await Promise.all([
    homeFeed(viewerId, { mode: mode || (viewerId ? 'following' : 'all'), tag }),
    communitySettings(),
    viewerId ? profileCards([viewerId]).then((c) => c.get(viewerId) || null) : null,
  ])
  const query = tag ? `tag=${encodeURIComponent(tag)}` : `mode=${data.mode}`
  return <MediaShell section="community">
    <div className="container cm-layout is-feed">
      <nav className="cm-side-nav" aria-label="تازه‌ها">
        {me && <Link href={`/u/${me.username}`} className="cm-me"><Avatar person={me} size={48} /><span><b>{me.name}</b><small dir="ltr">@{me.username}</small></span></Link>}
        <Link href="/feed?mode=following" className={data.mode === 'following' ? 'is-active' : ''}><CmIcon name="users" size={18} />دنبال‌شده‌ها</Link>
        <Link href="/feed?mode=all" className={data.mode === 'all' ? 'is-active' : ''}><CmIcon name="globe" size={18} />همهٔ پست‌ها</Link>
        <Link href="/people"><CmIcon name="plus" size={18} />پیدا کردن دوستان</Link>
        {me && <Link href={`/u/${me.username}?tab=posts`}><CmIcon name="comment" size={18} />پست‌های من</Link>}
        {me && <Link href="/dashboard"><CmIcon name="grid" size={18} />پیشخوان من</Link>}
      </nav>
      <div className="cm-main">
        <header className="cm-feed-head">
          <h1>{tag ? <>#{tag}</> : data.mode === 'following' ? 'تازه‌های دنبال‌شده‌ها' : 'همهٔ پست‌ها'}</h1>
          {!tag && <div className="cm-seg" role="tablist" aria-label="نوع فید">{viewerId && <Link role="tab" aria-selected={data.mode === 'following'} href="/feed?mode=following" className={data.mode === 'following' ? 'is-active' : ''}>دنبال‌شده‌ها</Link>}<Link role="tab" aria-selected={data.mode === 'all'} href="/feed?mode=all" className={data.mode === 'all' ? 'is-active' : ''}>همه</Link></div>}
        </header>
        {!viewerId && <div className="cm-join"><b>به جامعهٔ موبوکام بپیوندید</b><p>پست بگذارید، دوستانتان را دنبال کنید و از بازی، فیلم و نرم‌افزارهای محبوبشان باخبر شوید.</p><div className="cm-row"><Link href="/register" className="btn btn-primary">ثبت‌نام</Link><Link href="/login?next=/feed" className="btn btn-ghost">ورود</Link></div></div>}
        <Feed initial={data.posts} next={data.next} source={`/api/community/feed?${query}`} signedIn={!!viewerId} me={me}
          composer={me && settings.postsEnabled && !tag ? { allowFollowers: settings.followersOnlyAllowed, allowImages: settings.imagesEnabled, maxLength: settings.maxPostLength } : null}
          empty={<div className="cm-empty"><CmIcon name="sparkle" size={30} /><b>{data.mode === 'following' ? 'هنوز پستی از دنبال‌شده‌ها نیست' : 'هنوز پستی نیست'}</b>{data.mode === 'following' && <p>چند نفر را <Link href="/people">دنبال کنید</Link> یا <Link href="/feed?mode=all">همهٔ پست‌ها</Link> را ببینید.</p>}</div>} />
      </div>
      <Sidebar viewerId={viewerId} />
    </div>
  </MediaShell>
}

export async function PostPage({ id, viewerId }: { id: number; viewerId: number | null }) {
  const post = await getPost(id, viewerId).catch(() => null)
  if (!post) return null
  return <MediaShell section="community">
    <div className="container cm-layout">
      <div className="cm-main">
        <Link href="/feed" className="cm-link cm-back">→ بازگشت به تازه‌ها</Link>
        <PostCard post={post} signedIn={!!viewerId} meId={viewerId} expanded />
      </div>
      <Sidebar viewerId={viewerId} />
    </div>
  </MediaShell>
}

export async function PeoplePage({ viewerId, q, sort, page }: { viewerId: number | null; q?: string; sort?: string; page?: number }) {
  const data = await peopleDirectory({ q, sort, page }, viewerId)
  const href = (patch: Record<string, string | undefined>) => { const params = new URLSearchParams(Object.entries({ q, sort, ...patch }).filter(([, v]) => v) as [string, string][]); return params.toString() ? `/people?${params}` : '/people' }
  return <MediaShell section="community">
    <div className="container cm-people-page">
      <header className="cm-feed-head">
        <div><h1>کاربران موبوکام</h1><p className="cm-muted">{fa(data.total)} عضو · دنبال کنید تا پست‌ها و فعالیت‌هایشان را در تازه‌ها ببینید.</p></div>
        <form className="cm-search" role="search" action="/people"><CmIcon name="users" size={17} /><input name="q" defaultValue={q} placeholder="جست‌وجوی نام یا نام کاربری" aria-label="جست‌وجوی کاربران" />{sort && <input type="hidden" name="sort" value={sort} />}<button className="btn btn-primary btn-sm">جست‌وجو</button></form>
      </header>
      <div className="cm-seg" role="tablist" aria-label="مرتب‌سازی">{([[undefined, 'محبوب‌ترین'], ['posts', 'فعال‌ترین'], ['new', 'تازه‌واردها']] as [string | undefined, string][]).map(([key, label]) => <Link key={label} role="tab" aria-selected={sort === key} href={href({ sort: key, page: undefined })} className={sort === key ? 'is-active' : ''}>{label}</Link>)}</div>
      <PeopleList people={data.people} signedIn={!!viewerId} />
      {data.pages > 1 && <nav className="cm-pager" aria-label="صفحه‌بندی">{data.page > 1 && <Link href={href({ page: String(data.page - 1) })}>قبلی</Link>}<span className="num">{fa(data.page)} از {fa(data.pages)}</span>{data.page < data.pages && <Link href={href({ page: String(data.page + 1) })}>بعدی</Link>}</nav>}
    </div>
  </MediaShell>
}
