import type { SectionNavItem } from './MediaShell'

export function musicNav(fa: boolean): SectionNavItem[] {
  return [
    { key: 'home', href: '/music', label: fa ? 'خانه موزیک' : 'Music home' },
    { key: 'new', href: '/music/browse', label: fa ? 'جدیدترین‌ها' : 'New releases' },
    { key: 'top', href: '/music/browse?sort=popular', label: fa ? 'پربازدیدترین‌ها' : 'Most played' },
    { key: 'albums', href: '/music#albums', label: fa ? 'آلبوم‌ها' : 'Albums' },
    { key: 'artists', href: '/music#artists', label: fa ? 'هنرمندان' : 'Artists' },
    { key: 'playlists', href: '/music#playlists', label: fa ? 'پلی‌لیست‌ها' : 'Playlists' },
  ]
}

export function cinemaNav(fa: boolean): SectionNavItem[] {
  return [
    { key: 'home', href: '/cinema', label: fa ? 'خانه' : 'Home' },
    { key: 'movies', href: '/cinema/browse?kind=MOVIE', label: fa ? 'فیلم‌ها' : 'Movies' },
    { key: 'series', href: '/cinema/browse?kind=SERIES', label: fa ? 'سریال‌ها' : 'Series' },
    { key: 'dubbed', href: '/cinema/browse?dubbed=1', label: fa ? 'دوبله فارسی' : 'Persian dub' },
    { key: 'imdb', href: '/cinema/browse?sort=imdb', label: fa ? 'برترین‌های IMDb' : 'Top IMDb' },
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
