import type { Metadata } from 'next'
import Link from '@/components/AppLink'
import MediaShell from '@/components/media/MediaShell'
import { toPublicPath } from '@/platform/routing/aliases'
import { profileByUsername, profileCards, relationBetween, suggestions, followList } from '@/modules/identity/server/profile'
import { LINK_KINDS, canMessage, canViewProfile } from '@/modules/identity/domain/profile'
import { activityFor, communitySettings, pinnedPost, profilePosts, profileShelves, type Activity } from '@/modules/community/server/community'
import { Avatar, CmIcon, Verified } from '@/components/community/CommunityIcons'
import { Feed, PeopleList, PostCard, ProfileActions, type Card } from '@/components/community/Social'
import { profileAddress } from '@/modules/identity/domain/profile-address'

const fa = (n: number) => n.toLocaleString('fa-IR')
const month = (iso: string) => new Date(iso).toLocaleDateString('fa-IR', { month: 'long', year: 'numeric' })
const TABS = [['activity', 'فعالیت‌ها', 'activity'], ['posts', 'پست‌ها', 'comment'], ['games', 'بازی‌ها', 'gamepad'], ['favorites', 'علاقه‌مندی‌ها', 'bookmark'], ['followers', 'دنبال‌کننده‌ها', 'users'], ['following', 'دنبال‌شونده‌ها', 'users']] as const
type Tab = typeof TABS[number][0]
const KIND: Record<Activity['kind'], { icon: string; label: string }> = {
  post: { icon: 'comment', label: 'پست گذاشت' }, topic: { icon: 'forum', label: 'موضوع تازه در تالار' }, reply: { icon: 'forum', label: 'پاسخ داد در' },
  review: { icon: 'star', label: 'نقد نوشت برای' }, library: { icon: 'gamepad', label: '' },
}
const SHELF: Record<string, string> = { PLAYED: 'بازی کرده', PLAYING: 'در حال بازی', WANT: 'می‌خواهد بازی کند', DROPPED: 'رها کرده' }

export async function profileMeta(username: string): Promise<Metadata> {
  const found = await profileByUsername(username)
  if (!found) return { title: 'کاربر پیدا نشد' }
  const p = found.profile
  const hidden = found.privacy.profile !== 'PUBLIC'
  return {
    title: `${p.name} (@${p.username})`,
    description: (p.headline || p.bio || `پروفایل ${p.name} در موبوکام`).slice(0, 160),
    alternates: { canonical: toPublicPath(`/u/${p.username}`) },
    openGraph: { type: 'profile', title: `${p.name} (@${p.username})`, images: p.avatar ? [p.avatar] : undefined },
    robots: hidden ? { index: false, follow: false } : undefined,
  }
}

/** A part of the profile that another module owns (the forum's), shown as one more tab. Built only when it is the tab asked for. */
export type ProfilePart = { key: string; label: string; icon: string; body: () => Promise<React.ReactNode> }

export async function ProfilePage({ username, tab: tabParam, viewerId, forum, part = null }: { username: string; tab?: string; viewerId: number | null; forum: boolean; part?: ProfilePart | null }) {
  const found = await profileByUsername(username)
  if (!found) return null
  const { profile: p, privacy } = found
  const relation = await relationBetween(viewerId, p.userId)
  const visible = canViewProfile(privacy, relation)
  const onPart = !!part && tabParam === part.key
  const tab: Tab = (TABS.some(([key]) => key === tabParam) ? tabParam : 'activity') as Tab
  const [settings, shelves, me, suggested] = await Promise.all([
    communitySettings(),
    visible ? profileShelves(p.userId, privacy, viewerId) : null,
    viewerId ? profileCards([viewerId]).then((cards) => cards.get(viewerId) || null) : null,
    suggestions(viewerId, 5),
  ])
  const own = relation.self
  let shownPart = false
  const card: Card = { userId: p.userId, username: p.username, name: p.name, avatar: p.avatar, avatarColor: p.avatarColor, headline: p.headline, verified: p.verified, staff: p.staff }
  let body: React.ReactNode = null
  if (!visible) {
    body = <div className="cm-locked"><CmIcon name="lock" size={34} /><b>{relation.blockedBy ? 'این پروفایل در دسترس نیست' : 'این پروفایل خصوصی است'}</b><p>{privacy.profile === 'FOLLOWERS' ? `برای دیدن پست‌ها و فعالیت‌های ${p.name} باید دنبالش کنید.` : privacy.profile === 'MEMBERS' ? 'برای دیدن این پروفایل وارد حساب کاربری شوید.' : ''}</p></div>
  } else if (onPart) {
    // What the other module shows of this member; when it has nothing, the member's activity is shown instead.
    body = await part!.body()
    shownPart = body !== null
  }
  if (visible && !shownPart) { if (tab === 'activity') {
    const [items, pinned] = await Promise.all([activityFor(p.userId, privacy, viewerId, 40), pinnedPost(found.pinnedPostId, viewerId)])
    body = <>
      {pinned && <PostCard post={pinned} signedIn={!!viewerId} meId={viewerId} />}
      {own && me && settings.postsEnabled && <Feed initial={[]} next={null} source={`/api/people/${p.username}/posts`} signedIn me={me} composer={{ allowFollowers: settings.followersOnlyAllowed, allowImages: settings.imagesEnabled, maxLength: settings.maxPostLength }} empty={null} />}
      {items.length ? <ol className="cm-timeline">{items.map((item) => <li key={item.key} className={`is-${item.kind}`}>
        <span className="cm-timeline-dot"><CmIcon name={KIND[item.kind].icon} size={15} /></span>
        <div className="cm-timeline-card">
          <small className="cm-muted"><b>{p.name}</b> {item.kind === 'library' ? item.meta.split(' · ')[0] : KIND[item.kind].label} · <time dateTime={item.at.toISOString()}>{item.at.toLocaleDateString('fa-IR', { day: 'numeric', month: 'long' })}</time></small>
          <Link href={item.href} className="cm-timeline-link">
            {item.image && <img src={item.image} alt="" loading="lazy" />}
            <span>{item.kind !== 'post' && <b>{item.title}</b>}{item.text && <p dir="auto">{item.text}</p>}{item.meta && item.kind !== 'library' && <small>{item.meta}</small>}{item.kind === 'library' && item.meta.includes('·') && <small>{item.meta.split(' · ')[1]}</small>}</span>
          </Link>
        </div>
      </li>)}</ol> : <div className="cm-empty"><CmIcon name="activity" size={30} /><b>هنوز فعالیتی نیست</b>{own && <p>پست بگذارید، در تالار گفت‌وگو کنید یا بازی‌هایتان را به کتابخانه اضافه کنید تا این‌جا پر شود.</p>}</div>}
    </>
  } else if (tab === 'posts') {
    const data = await profilePosts(p.userId, viewerId)
    body = <Feed initial={data.posts} next={data.next} source={`/api/people/${p.username}/posts`} signedIn={!!viewerId} me={own ? me : null} composer={own && settings.postsEnabled ? { allowFollowers: settings.followersOnlyAllowed, allowImages: settings.imagesEnabled, maxLength: settings.maxPostLength } : null} empty={<div className="cm-empty"><CmIcon name="comment" size={30} /><b>هنوز پستی منتشر نشده</b></div>} />
  } else if (tab === 'games') {
    body = shelves?.showsLibrary && shelves.games.length ? <div className="cm-shelf">{Object.entries(SHELF).map(([status, label]) => {
      const games = shelves.games.filter((g) => g.status === status)
      return games.length ? <section key={status}><h3>{label} <span className="num">{fa(games.length)}</span></h3><div className="cm-covers">{games.map((g) => <Link key={g.slug} href={`/games/${g.slug}`} className="cm-cover">{g.cover ? <img src={g.cover} alt="" loading="lazy" /> : <span />}<b>{g.title}</b>{g.hours > 0 && <small className="num">{fa(g.hours)} ساعت</small>}</Link>)}</div></section> : null
    })}</div> : <div className="cm-empty"><CmIcon name="gamepad" size={30} /><b>{shelves?.showsLibrary ? 'کتابخانهٔ بازی خالی است' : 'کتابخانهٔ بازی خصوصی است'}</b></div>
  } else if (tab === 'favorites') {
    body = shelves?.showsFavorites && shelves.favorites.length ? <div className="cm-covers is-wide">{shelves.favorites.map((f) => <Link key={f.url} href={f.url} className="cm-cover">{f.image ? <img src={f.image} alt="" loading="lazy" /> : <span />}<b>{f.title}</b></Link>)}</div>
      : <div className="cm-empty"><CmIcon name="bookmark" size={30} /><b>{shelves?.showsFavorites ? 'هنوز چیزی ذخیره نشده' : 'علاقه‌مندی‌ها خصوصی است'}</b></div>
  } else {
    body = privacy.showFollows || own ? <PeopleList people={(await followList(p.userId, tab, viewerId)).people} signedIn={!!viewerId} variant="list" /> : <div className="cm-empty"><CmIcon name="lock" size={30} /><b>این فهرست خصوصی است</b></div>
  } }

  const stats: [string, number, string][] = [
    ['پست', p.posts, `/u/${p.username}?tab=posts`],
    ...(forum && shelves?.forum ? [['پیام در تالار', shelves.forum.postCount, `/u/${p.username}?tab=${part?.key || 'forum'}`] as [string, number, string]] : []),
    ...(shelves ? [['نقد و امتیاز', shelves.reviews, `/u/${p.username}?tab=activity`] as [string, number, string]] : []),
    ...(shelves?.showsLibrary ? [['بازی', shelves.games.length, `/u/${p.username}?tab=games`] as [string, number, string]] : []),
  ]
  const online = p.lastSeenAt && Date.now() - new Date(p.lastSeenAt).getTime() < 15 * 60_000
  return <MediaShell section="community">
    <div className="cm-profile">
      <section className="cm-hero">
        <div className="cm-cover-img" style={p.cover ? { backgroundImage: `url("${p.cover.replace(/"/g, '%22')}")` } : { ['--cm-seed' as string]: p.avatarColor }} role="img" aria-label={`تصویر کاور ${p.name}`} />
        <div className="container cm-hero-inner">
          <div className="cm-hero-avatar">{<Avatar person={p} size={148} ring />}{online && <span className="cm-online" title="آنلاین" />}</div>
          <div className="cm-hero-copy">
            <h1>{p.name}{p.verified && <Verified size={22} />}{p.staff && <span className="cm-staff">تیم سایت</span>}</h1>
            <bdi dir="ltr" className="cm-handle is-big">@{p.username}</bdi>
            {relation.followedBy && <span className="cm-follows-you">شما را دنبال می‌کند</span>}
            {p.headline && <p className="cm-headline">{p.headline}</p>}
          </div>
          <div className="cm-hero-actions">
            {own ? <><Link href="/dashboard/public-profile" className="cm-btn is-accent"><CmIcon name="edit" size={16} />ویرایش پروفایل</Link><Link href="/feed" className="cm-btn"><CmIcon name="sparkle" size={16} />تازه‌ها</Link></>
              : <ProfileActions username={p.username} name={p.name} following={relation.following} signedIn={relation.signedIn} canMessage={canMessage(privacy, relation)} blocked={relation.blocked} messagesOn={forum} />}
          </div>
        </div>
        <div className="container cm-hero-meta">
          <div className="cm-stats">
            <Link href={`/u/${p.username}?tab=followers`} className="cm-stat"><b className="num" data-followers>{fa(p.followers)}</b><small>دنبال‌کننده</small></Link>
            <Link href={`/u/${p.username}?tab=following`} className="cm-stat"><b className="num">{fa(p.following)}</b><small>دنبال‌شونده</small></Link>
            {stats.map(([label, value, href]) => <Link key={label} href={href} className="cm-stat"><b className="num">{fa(value)}</b><small>{label}</small></Link>)}
          </div>
          <ul className="cm-facts">
            {p.location && <li><CmIcon name="mapPin" size={15} />{p.location}</li>}
            {p.website && <li><CmIcon name="link" size={15} /><a href={p.website} target="_blank" rel="noopener noreferrer nofollow" dir="ltr">{p.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</a></li>}
            <li><CmIcon name="calendar" size={15} />عضو از {month(p.joinedAt)}</li>
            {p.links.length > 0 && <li className="cm-socials">{p.links.map((link) => <a key={link.kind} href={link.url} target="_blank" rel="noopener noreferrer nofollow me" title={LINK_KINDS[link.kind].label} aria-label={LINK_KINDS[link.kind].label}><CmIcon name={link.kind === 'x' ? 'xlogo' : link.kind} size={17} /></a>)}</li>}
          </ul>
        </div>
      </section>
      <nav className="cm-tabs" aria-label="بخش‌های پروفایل"><div className="container">{TABS.filter(([key]) => (key !== 'games' || shelves?.showsLibrary !== false) && (key !== 'favorites' || shelves?.showsFavorites)).map(([key, label, icon]) => <Link key={key} href={`/u/${p.username}${key === 'activity' ? '' : `?tab=${key}`}`} className={!shownPart && tab === key ? 'is-active' : ''} aria-current={tab === key ? 'page' : undefined}><CmIcon name={icon} size={16} />{label}</Link>)}{part && visible && <Link href={`/u/${p.username}?tab=${part.key}`} className={shownPart ? 'is-active' : ''} aria-current={shownPart ? 'page' : undefined}><CmIcon name={part.icon} size={16} />{part.label}</Link>}</div></nav>
      <div className="container cm-layout">
        <div className="cm-main">{body}</div>
        <aside className="cm-aside">
          {(p.bio || visible) && <section className="cm-card"><h2>درباره</h2>{p.bio ? <p className="cm-bio" dir="auto">{p.bio}</p> : <p className="cm-muted">{own ? 'هنوز معرفی ننوشته‌اید.' : 'معرفی‌ای ننوشته است.'}</p>}{own && !p.bio && <Link href="/dashboard/public-profile" className="cm-link">نوشتن معرفی</Link>}</section>}
          {shelves && shelves.badges.length > 0 && <section className="cm-card"><h2>نشان‌ها</h2><ul className="cm-badges">{shelves.badges.map((b) => <li key={b.name} title={b.description} className={`is-${b.tier.toLowerCase()}`}><span aria-hidden="true">{b.icon}</span>{b.name}</li>)}</ul></section>}
          {forum && shelves?.forum && <section className="cm-card"><h2>در تالار گفتمان</h2><dl className="cm-dl"><div><dt>موضوع</dt><dd className="num">{fa(shelves.forum.topicCount)}</dd></div><div><dt>پاسخ</dt><dd className="num">{fa(shelves.forum.postCount)}</dd></div><div><dt>پسند دریافتی</dt><dd className="num">{fa(shelves.forum.likesReceived)}</dd></div><div><dt>پاسخ پذیرفته‌شده</dt><dd className="num">{fa(shelves.forum.solvedCount)}</dd></div></dl><Link href={profileAddress(p.username, 'summary')} className="cm-link">پروفایل تالار ←</Link></section>}
          {suggested.filter((s) => s.userId !== p.userId).length > 0 && <section className="cm-card"><h2>پیشنهاد برای دنبال کردن</h2><PeopleList people={suggested.filter((s) => s.userId !== p.userId).slice(0, 4)} signedIn={!!viewerId} variant="list" /><Link href="/people" className="cm-link">همهٔ کاربران ←</Link></section>}
        </aside>
      </div>
    </div>
  </MediaShell>
}
