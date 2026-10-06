import type { SectionNavItem } from './MediaShell'

export function musicNav(fa: boolean): SectionNavItem[] {
  return [
    { key: 'home', href: '/music', label: fa ? 'خانه موزیک' : 'Music home' },
    { key: 'new', href: '/music/browse', label: fa ? 'جدیدترین‌ها' : 'New releases' },
    { key: 'top', href: '/music/browse?sort=popular', label: fa ? 'پربازدیدترین‌ها' : 'Most played' },
    { key: 'albums', href: '/music/albums', label: fa ? 'آلبوم‌ها' : 'Albums' },
    { key: 'artists', href: '/music/artists', label: fa ? 'هنرمندان' : 'Artists' },
    { key: 'languages', href: '/music/language', label: fa ? 'زبان و گویش' : 'Languages' },
    { key: 'playlists', href: '/music/playlists', label: fa ? 'پلی‌لیست‌ها' : 'Playlists' },
    { key: 'mine', href: '/music/my-playlists', label: fa ? 'پلی‌لیست‌های من' : 'My playlists' },
    { key: 'history', href: '/music/history', label: fa ? 'تاریخچهٔ پخش' : 'Listening history' },
    { key: 'favorites', href: '/favorites?type=track', label: fa ? 'آهنگ‌های دلخواه' : 'Liked songs' },
  ]
}

export function cinemaNav(fa: boolean): SectionNavItem[] {
  return [
    { key: 'home', href: '/cinema', label: fa ? 'خانه' : 'Home' },
    { key: 'movies', href: '/cinema/browse?kind=MOVIE', label: fa ? 'فیلم‌ها' : 'Movies' },
    { key: 'series', href: '/cinema/browse?kind=SERIES', label: fa ? 'سریال‌ها' : 'Series' },
    { key: 'dubbed', href: '/cinema/browse?dubbed=1', label: fa ? 'دوبله فارسی' : 'Persian dub' },
    { key: 'imdb', href: '/cinema/browse?sort=imdb', label: fa ? 'برترین‌های IMDb' : 'Top IMDb' },
    { key: 'calendar', href: '/cinema/calendar', label: fa ? 'تقویم پخش' : 'Episode calendar' },
    { key: 'history', href: '/cinema/history', label: fa ? 'تاریخچهٔ تماشا' : 'Watch history' },
    { key: 'vip', href: '/vip', label: fa ? '♛ VIP' : '♛ VIP' },
  ]
}

export function gamesNav(fa: boolean): SectionNavItem[] {
  return [
    { key: 'home', href: '/games', label: fa ? 'خانه بازی' : 'Games home' },
    { key: 'latest', href: '/games/browse', label: fa ? 'تازه‌ها' : 'Latest' },
    { key: 'top', href: '/games/browse?sort=score', label: fa ? 'برترین‌ها' : 'Top rated' },
    { key: 'pc', href: '/games/browse?platform=PC', label: 'PC' },
    { key: 'ps', href: '/games/browse?platform=PS5', label: 'PlayStation' },
    { key: 'xbox', href: '/games/browse?platform=Xbox', label: 'Xbox' },
    { key: 'mobile', href: '/games/browse?platform=Android', label: fa ? 'موبایل' : 'Mobile' },
  ]
}

export function softwareNav(fa: boolean): SectionNavItem[] {
  return [
    { key: 'home', href: '/software', label: fa ? 'خانه نرم‌افزار' : 'Software home' },
    { key: 'latest', href: '/software/browse', label: fa ? 'به‌روزشده‌ها' : 'Recently updated' },
    { key: 'popular', href: '/software/browse?sort=popular', label: fa ? 'پردانلودها' : 'Most downloaded' },
    { key: 'windows', href: '/software/browse?platform=Windows', label: 'Windows' },
    { key: 'mac', href: '/software/browse?platform=macOS', label: 'macOS' },
    { key: 'android', href: '/software/browse?platform=Android', label: 'Android' },
    { key: 'ios', href: '/software/browse?platform=iOS', label: 'iOS' },
  ]
}

export function forumNav(fa: boolean): SectionNavItem[] {
  return [
    { key: 'home', href: '/forum', label: fa ? 'همه انجمن‌ها' : 'All boards' },
    { key: 'new', href: '/forum/new', label: fa ? '+ موضوع جدید' : '+ New thread' },
  ]
}
