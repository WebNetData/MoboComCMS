import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from '@/components/AppLink'
import { isModuleEnabled } from '@/extensions/server/modules'
import { getServerLocale } from '@/i18n/server'
import { getViewer } from '@/modules/membership/server/membership'
import { favoritePreview } from '@/modules/reviews/server/reviews'
import { myLibrary } from '@/modules/games/server/library'
import { getGamesSettings } from '@/modules/games/server/portal'
import { listPersonalPlaylists } from '@/modules/music/server/personal-playlists'
import { listeningHistoryCount } from '@/modules/music/server/listening-history'
import { watchHistoryCount } from '@/modules/cinema/server/progress'
import { purchasePreview } from '@/modules/paywall/server/paywall'
import { recentViewPreview } from '@/modules/content/server/recent-views'
import { personalRecommendations } from '@/modules/recommendations/server/personal'
import { myCollections, savedCollections } from '@/modules/content/server/collections'
import { memberLists } from '@/modules/account/server/lists'
import { ITEM_LABEL } from '@/modules/content/domain/items'
import { LIBRARY_LABELS } from '@/modules/games/domain/games'
import Icon from '@/components/site/Icon'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'کتابخانهٔ من | My library', robots: { index: false } }

export default async function LibraryPage() {
  const viewer = await getViewer()
  if (!viewer.userId) redirect('/login?next=/dashboard/library')
  const userId = viewer.userId
  const [locale, reviewsOn, gamesModuleOn, musicOn, cinemaOn, paywallOn] = await Promise.all([
    getServerLocale(), isModuleEnabled('reviews'), isModuleEnabled('games'), isModuleEnabled('music'), isModuleEnabled('cinema'), isModuleEnabled('paywall'),
  ])
  const gamesOn = gamesModuleOn && (await getGamesSettings()).libraryEnabled
  const fa = locale === 'fa'
  const [favorites, games, playlists, listens, collections, watches, saved, purchases, views, suggestions] = await Promise.all([
    reviewsOn ? favoritePreview(userId) : Promise.resolve(null),
    gamesOn ? myLibrary(userId, null, 1) : Promise.resolve(null),
    musicOn ? listPersonalPlaylists(userId) : Promise.resolve(null),
    musicOn ? listeningHistoryCount(userId) : Promise.resolve(null),
    myCollections(userId),
    cinemaOn ? watchHistoryCount(userId) : Promise.resolve(null),
    savedCollections(userId),
    paywallOn ? purchasePreview(userId) : Promise.resolve(null),
    recentViewPreview(userId),
    personalRecommendations(userId),
  ])
  // Every list the member keeps, read one way from the modules that own them.
  const lists = await memberLists(userId).catch(() => [])
  const number = (value: number) => value.toLocaleString(fa ? 'fa-IR' : 'en-US')
  const ownedCollectionIds = new Set(collections.map((item) => item.id))
  const recent = [
    ...(favorites?.items || []).map((item) => ({ key: `favorite:${item.type}:${item.id}`, kind: fa ? 'علاقه‌مندی' : 'Favorite', title: item.title, image: item.image, href: item.url, detail: item.subtitle || ITEM_LABEL[item.type].one, at: new Date(item.addedAt).getTime() })),
    ...(games?.items || []).map(({ game, status, updatedAt }) => ({ key: `game:${game.id}`, kind: fa ? 'بازی' : 'Game', title: game.title, image: game.cover, href: `/games/${game.slug}`, detail: LIBRARY_LABELS[status].label, at: new Date(updatedAt).getTime() })),
    ...(playlists || []).map((item) => ({ key: `playlist:${item.id}`, kind: fa ? 'پلی‌لیست' : 'Playlist', title: item.title, image: '', href: `/music/my-playlists/${item.id}`, detail: `${number(item.trackCount)} ${fa ? 'آهنگ' : 'tracks'}`, at: new Date(item.updatedAt).getTime() })),
    ...collections.map((item) => ({ key: `collection:${item.id}`, kind: fa ? 'مجموعه' : 'Collection', title: item.title, image: item.cover, href: `/collections/${item.id}`, detail: `${number(item._count.items)} ${fa ? 'مورد' : 'items'}`, at: new Date(item.updatedAt).getTime() })),
    ...saved.filter(({ collection }) => !ownedCollectionIds.has(collection.id)).map(({ collection, createdAt }) => ({ key: `saved:${collection.id}`, kind: fa ? 'مجموعهٔ ذخیره‌شده' : 'Saved collection', title: collection.title, image: collection.cover, href: `/collections/${collection.id}${collection.visibility === 'UNLISTED' && collection.shareToken ? `?share=${encodeURIComponent(collection.shareToken)}` : ''}`, detail: `${number(collection._count.items)} ${fa ? 'مورد' : 'items'}`, at: new Date(createdAt).getTime() })),
    ...(purchases?.items || []).map((item) => ({ key: `purchase:${item.id}`, kind: fa ? 'خریداری‌شده' : 'Purchased', title: item.title, image: item.image, href: item.url, detail: item.subtitle || '', at: new Date(item.addedAt).getTime() })),
  ].sort((a, b) => b.at - a.at).slice(0, 12)

  return <div className="ud ulib-page ulib-home">
    <header className="ulib-head">
      <span className="ulib-head-icon"><Icon name="layers" size={25} /></span>
      <div><span className="md-eyebrow">{fa ? 'فضای شخصی شما' : 'Your personal space'}</span><h1>{fa ? 'کتابخانهٔ من' : 'My library'}</h1><p className="muted">{fa ? 'محتوای ذخیره‌شده، مجموعه‌ها و تاریخچهٔ شما در یک جا.' : 'Saved content, collections and history in one place.'}</p></div>
    </header>
    <div className="ulib-summary">
      {favorites && <Link href="/favorites" className="ud-kpi"><span className="ulib-kpi-icon"><Icon name="heart" size={19} /></span><small>{fa ? 'علاقه‌مندی‌ها' : 'Favorites'}</small><b>{number(favorites.total)}</b><span>{fa ? 'نمایش همهٔ موارد' : 'View all items'}</span></Link>}
      {games && <Link href="/dashboard/games" className="ud-kpi"><span className="ulib-kpi-icon"><Icon name="devices" size={19} /></span><small>{fa ? 'بازی‌های من' : 'My games'}</small><b>{number(Object.values(games.counts).reduce((sum, value) => sum + value, 0))}</b><span>{fa ? 'مشاهدهٔ قفسه‌های بازی' : 'View game shelves'}</span></Link>}
      {playlists && <Link href="/music/my-playlists" className="ud-kpi"><span className="ulib-kpi-icon"><Icon name="music" size={19} /></span><small>{fa ? 'پلی‌لیست‌های من' : 'My playlists'}</small><b>{number(playlists.length)}</b><span>{fa ? 'مدیریت پلی‌لیست‌ها' : 'Manage playlists'}</span></Link>}
      {listens !== null && <Link href="/music/history" className="ud-kpi"><span className="ulib-kpi-icon"><Icon name="clock" size={19} /></span><small>{fa ? 'تاریخچهٔ پخش' : 'Listening history'}</small><b>{number(listens)}</b><span>{fa ? 'آهنگ‌های شنیده‌شده' : 'Played tracks'}</span></Link>}
      {watches !== null && <Link href="/cinema/history" className="ud-kpi"><span className="ulib-kpi-icon"><Icon name="film" size={19} /></span><small>{fa ? 'تاریخچهٔ تماشا' : 'Watch history'}</small><b>{number(watches)}</b><span>{fa ? 'فیلم‌ها و قسمت‌های دیده‌شده' : 'Films and episodes'}</span></Link>}
      <Link href="/dashboard/collections" className="ud-kpi"><span className="ulib-kpi-icon"><Icon name="layers" size={19} /></span><small>{fa ? 'مجموعه‌های من' : 'My collections'}</small><b>{number(collections.length)}</b><span>{fa ? 'مدیریت مجموعه‌ها' : 'Manage collections'}</span></Link>
      <Link href="/dashboard/collections" className="ud-kpi"><span className="ulib-kpi-icon"><Icon name="bookmark" size={19} /></span><small>{fa ? 'مجموعه‌های ذخیره‌شده' : 'Saved collections'}</small><b>{number(saved.length)}</b><span>{fa ? 'دیدن مجموعه‌های ذخیره‌شده' : 'View saved collections'}</span></Link>
      {purchases && <Link href="/dashboard/purchases" className="ud-kpi"><span className="ulib-kpi-icon"><Icon name="wallet" size={19} /></span><small>{fa ? 'خریدهای محتوایی' : 'Content purchases'}</small><b>{number(purchases.total)}</b><span>{fa ? 'دیدن خریدهای من' : 'View my purchases'}</span></Link>}
      <Link href="/dashboard/recent" className="ud-kpi"><span className="ulib-kpi-icon"><Icon name="eye" size={19} /></span><small>{fa ? 'اخیراً مشاهده‌شده' : 'Recently viewed'}</small><b>{number(views.total)}</b><span>{fa ? 'تاریخچهٔ مرور' : 'Browse history'}</span></Link>
    </div>

    <section className="ud-card" aria-labelledby="lb-suggestions-title">
      <header className="ud-card-head"><h2 id="lb-suggestions-title">{fa ? 'پیشنهادهای شما' : 'For you'}</h2><Link href="/dashboard/profile">{fa ? 'تنظیمات' : 'Settings'}</Link></header>
      {!suggestions.available ? <p className="ud-muted">{fa ? 'پیشنهادهای شخصی در حال حاضر از سوی مدیر سایت غیرفعال‌اند.' : 'Personal suggestions are currently disabled by the site administrator.'}</p>
        : !suggestions.enabled ? <p className="ud-muted">{fa ? 'پیشنهادهای شخصی خاموش‌اند. اگر مایلید، در تنظیمات حساب استفاده از علاقه‌مندی‌ها و بازدیدهای اخیر را فعال کنید.' : 'Personal suggestions are off. You can enable use of favorites and recent views in account settings.'}</p>
        : suggestions.items.length ? <ul className="ulib-items">{suggestions.items.map(({ item, sourceTitle, sourceKind, reason }) => <li key={`${item.type}:${item.id}`}><Link href={item.url}>{item.image ? <img src={item.image} alt="" loading="lazy" /> : <span className="ulib-noart" aria-hidden="true">{ITEM_LABEL[item.type].icon}</span>}<span><b>{item.title}</b><small>{fa ? `${sourceKind === 'listen' ? `چون به «${sourceTitle}» گوش داده‌اید` : `${sourceKind === 'follow' ? 'بر اساس دنبال‌کردن' : sourceKind === 'favorite' ? 'بر اساس علاقه‌مندی به' : sourceKind === 'rated' ? 'چون امتیاز بالایی دادید به' : 'بر اساس بازدید'} «${sourceTitle}»`} · ${reason}` : sourceKind === 'follow' ? `From followed creator “${sourceTitle}”` : sourceKind === 'rated' ? `Because you rated “${sourceTitle}” highly` : sourceKind === 'listen' ? `Because you listen to “${sourceTitle}”` : `Similar to “${sourceTitle}”`}</small></span></Link></li>)}</ul>
          : <p className="ud-muted">{fa ? 'با ذخیره یا دیدن محتوا و دنبال‌کردن هنرمندان یا استودیوها، پیشنهادهای مرتبط اینجا نمایش داده می‌شوند.' : 'Save or view content, or follow artists and studios, to see suggestions here.'}</p>}
    </section>
    {lists.length > 0 && <section className="ud-card" aria-labelledby="lb-lists-title"><header className="ud-card-head"><h2 id="lb-lists-title">{fa ? 'همهٔ فهرست‌های من' : 'All my lists'}</h2></header>
      <ul className="ulib-lists">{lists.map((list) => <li key={list.key}><Link href={list.href}><b>{list.title}</b><small>{number(list.count)} {fa ? 'مورد' : 'items'}</small></Link></li>)}</ul>
    </section>}
    {recent.length > 0 && <section className="ud-card" aria-labelledby="lb-recent-title"><header className="ud-card-head"><h2 id="lb-recent-title">{fa ? 'تازه‌ترین موارد کتابخانه' : 'Recent in your library'}</h2></header><ul className="ulib-items">{recent.map((item) => <li key={item.key}><Link href={item.href}>{item.image ? <img src={item.image} alt="" loading="lazy" /> : <span className="ulib-noart" aria-hidden="true">✦</span>}<span><b>{item.title}</b><small>{item.kind} · {item.detail}</small></span></Link></li>)}</ul></section>}

    {views.items.length > 0 && <section className="ud-card" aria-labelledby="lb-views-title"><header className="ud-card-head"><h2 id="lb-views-title">{fa ? 'اخیراً مشاهده‌شده' : 'Recently viewed'}</h2><Link href="/dashboard/recent">{fa ? 'همه' : 'View all'}</Link></header><ul className="ulib-items">{views.items.map((item) => <li key={`${item.type}:${item.id}`}><Link href={item.url}>{item.image ? <img src={item.image} alt="" loading="lazy" /> : <span className="ulib-noart" aria-hidden="true">{ITEM_LABEL[item.type].icon}</span>}<span><b>{item.title}</b><small>{ITEM_LABEL[item.type].one}</small></span></Link></li>)}</ul></section>}

    {favorites && <section className="ud-card" aria-labelledby="lb-favorites-title">
      <header className="ud-card-head"><h2 id="lb-favorites-title">{fa ? 'تازه‌ترین علاقه‌مندی‌ها' : 'Recent favorites'}</h2><Link href="/favorites">{fa ? 'همه' : 'View all'}</Link></header>
      {favorites.items.length ? <ul className="ulib-items">{favorites.items.map((item) => <li key={`${item.type}:${item.id}`}><Link href={item.url}>{item.image ? <img src={item.image} alt="" loading="lazy" /> : <span className="ulib-noart" aria-hidden="true">{ITEM_LABEL[item.type].icon}</span>}<span><b>{item.title}</b><small>{ITEM_LABEL[item.type].one}{item.subtitle ? ` · ${item.subtitle}` : ''}</small></span></Link></li>)}</ul>
        : <p className="ud-muted">{fa ? 'هنوز موردی ذخیره نکرده‌اید.' : 'You have not saved any items yet.'} <Link href="/search">{fa ? 'جست‌وجو' : 'Explore'}</Link></p>}
    </section>}

    {games && <section className="ud-card" aria-labelledby="lb-games-title">
      <header className="ud-card-head"><h2 id="lb-games-title">{fa ? 'بازی‌های من' : 'My games'}</h2><Link href="/dashboard/games">{fa ? 'همه' : 'View all'}</Link></header>
      {games.items.length ? <ul className="ulib-items">{games.items.slice(0, 6).map(({ game, status }) => <li key={game.id}><Link href={`/games/${game.slug}`}>{game.cover ? <img src={game.cover} alt="" loading="lazy" /> : <span className="ulib-noart" aria-hidden="true">🎮</span>}<span><b>{game.title}</b><small>{LIBRARY_LABELS[status].label}</small></span></Link></li>)}</ul>
        : <p className="ud-muted">{fa ? 'هنوز بازی‌ای به کتابخانه اضافه نکرده‌اید.' : 'No games in your library yet.'} <Link href="/games">{fa ? 'دیدن بازی‌ها' : 'Browse games'}</Link></p>}
    </section>}

    {playlists && <section className="ud-card" aria-labelledby="lb-playlists-title">
      <header className="ud-card-head"><h2 id="lb-playlists-title">{fa ? 'پلی‌لیست‌های شخصی' : 'Personal playlists'}</h2><Link href="/music/my-playlists">{fa ? 'مدیریت' : 'Manage'}</Link></header>
      {playlists.length ? <ul className="ulib-playlists">{playlists.slice(0, 6).map((playlist) => <li key={playlist.id}><Link href={`/music/my-playlists/${playlist.id}`}><span className="ulib-playlist-icon" aria-hidden="true">♫</span><span><b>{playlist.title}</b><small>{number(playlist.trackCount)} {fa ? 'آهنگ' : 'tracks'}</small></span></Link></li>)}</ul>
        : <p className="ud-muted">{fa ? 'هنوز پلی‌لیستی نساخته‌اید.' : 'No playlists yet.'} <Link href="/music/my-playlists">{fa ? 'ساخت پلی‌لیست' : 'Create a playlist'}</Link></p>}
    </section>}

    {!favorites && !games && !playlists && <p className="ud-muted">{fa ? 'بخش‌های کتابخانه در حال حاضر غیرفعال‌اند.' : 'Library sections are currently unavailable.'}</p>}
  </div>
}
