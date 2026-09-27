const paths: Record<string, React.ReactNode> = {
  shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/></>,
  arrow: <path d="M19 12H5m6-6-6 6 6 6"/>,
  globe: <><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></>,
  bolt: <path d="m13 2-9 12h7l-1 8 10-13h-8l1-7Z"/>,
  wallet: <><rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 9V6.5L16 4v2M21 11h-5v4h5"/></>,
  chat: <path d="M21 11a9 9 0 0 1-9 9H3l1.8-4.5A9 9 0 1 1 21 11Z"/>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
  devices: <><rect x="3" y="4" width="13" height="11" rx="2"/><path d="M7 19h5"/><rect x="17" y="9" width="4" height="11" rx="1"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  menu: <path d="M4 7h16M4 12h16M4 17h16"/>,
  close: <path d="m6 6 12 12M6 18 18 6"/>,
  bag: <><path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></>,
  music: <><path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/></>,
  film: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/></>,
  game: <><path d="M6 8h12a4 4 0 0 1 3.9 4.9l-1 4.3a2.5 2.5 0 0 1-4.2 1.2L14.5 16h-5l-2.2 2.4a2.5 2.5 0 0 1-4.2-1.2l-1-4.3A4 4 0 0 1 6 8Z"/><path d="M8 11v3M6.5 12.5h3M15.5 12h.01M17.5 13.5h.01"/></>,
  download: <><path d="M12 4v11m-5-5 5 5 5-5"/><path d="M4 18v1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1"/></>,
  news: <><rect x="3" y="4" width="15" height="16" rx="2"/><path d="M18 8h2a1 1 0 0 1 1 1v9a2 2 0 0 1-4 0M7 8h7M7 12h7M7 16h4"/></>,
  crown: <path d="m3 7 4.5 4L12 5l4.5 6L21 7l-2 11H5L3 7Z"/>,
  sparkles: <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/>,
  sliders: <><path d="M4 7h4m4 0h8M4 17h10m4 0h2"/><circle cx="10" cy="7" r="2"/><circle cx="16" cy="17" r="2"/></>,
  user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
  chevron: <path d="m6 9 6 6 6-6"/>,
  truck: <><path d="M3 6h11v10H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></>,
}
const aliases: Record<string, string> = { products: 'bag', shop: 'bag', store: 'bag', journal: 'news', vip: 'crown', forum: 'chat', software: 'download', cinema: 'film', games: 'game' }

/** Admin-edited icon names are free text; unknown names fall back to the shield. */
export default function MobocomIcon({ name = 'shield', size = 22 }: { name?: string; size?: number }) {
  const key = paths[name] ? name : aliases[name] || 'shield'
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={key === 'arrow' ? 'mb-arrow' : undefined} aria-hidden="true">{paths[key]}</svg>
}
