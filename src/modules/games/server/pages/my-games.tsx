import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getViewer } from '@/modules/membership/server/membership'
import { myLibrary } from '@/modules/games/server/library'
import { LIBRARY_LABELS, LIBRARY_STATUSES, formatHours } from '@/modules/games/domain/games'

const fa = (value: number) => value.toLocaleString('fa-IR')

/** /dashboard/games — the member's shelves (played, playing, want, dropped). */
export async function MyGamesView({ status, page }: { status?: string; page?: string }) {
  const viewer = await getViewer()
  if (!viewer.userId) redirect('/login?next=/dashboard/games')
  const data = await myLibrary(viewer.userId, status || null, Number(page) || 1)
  const all = Object.values(data.counts).reduce((a, b) => a + b, 0)
  const tab = (key: string | null, label: string, count: number) => <Link key={key || 'all'} href={key ? `/dashboard/games?status=${key}` : '/dashboard/games'} className={data.status === key ? 'is-active' : ''} aria-current={data.status === key ? 'page' : undefined}>{label}{count > 0 && <span className="num">{fa(count)}</span>}</Link>
  return <div className="gv-mylib" dir="rtl">
    <header className="gv-mylib-head">
      <div><h1>کتابخانهٔ بازی من</h1><p>{all ? `${fa(all)} بازی${data.hours ? ` · ${formatHours(data.hours)} بازی کرده‌اید` : ''}` : 'بازی‌هایی که بازی کرده‌اید یا منتظرشان هستید را اینجا جمع کنید.'}</p></div>
      <Link href="/games" className="btn btn-ghost">گشتن در بازی‌ها</Link>
    </header>
    <nav className="gv-mylib-tabs" aria-label="قفسه‌ها">{[tab(null, 'همه', all), ...LIBRARY_STATUSES.map((key) => tab(key, LIBRARY_LABELS[key].label, data.counts[key]))]}</nav>
    {data.items.length === 0 ? <div className="gv-mylib-empty"><b>این قفسه خالی است</b><p>در صفحهٔ هر بازی، یکی از دکمه‌های «بازی کرده‌ام»، «در حال بازی» یا «می‌خواهم بازی کنم» را بزنید.</p><Link href="/games/calendar" className="btn btn-primary">تقویم انتشار بازی‌ها</Link></div>
      : <ul className="gv-mylib-grid">{data.items.map((item) => <li key={item.game.id}>
        <Link href={`/games/${item.game.slug}`}>
          <span className="gv-mylib-art">{item.game.cover ? <img src={item.game.cover} alt="" loading="lazy" /> : null}<em className={`is-${item.status.toLowerCase()}`}>{LIBRARY_LABELS[item.status].label}</em></span>
          <b>{item.game.title}</b>
          <small>{[item.game.platforms.slice(0, 2).join('، '), item.hours ? formatHours(item.hours) : ''].filter(Boolean).join(' · ')}</small>
        </Link>
      </li>)}</ul>}
    {data.pages > 1 && <nav className="gv-mylib-pager" aria-label="صفحه‌بندی">
      {data.page > 1 && <Link href={`/dashboard/games?${new URLSearchParams({ ...(data.status ? { status: data.status } : {}), page: String(data.page - 1) })}`}>قبلی</Link>}
      <span className="num">{fa(data.page)} از {fa(data.pages)}</span>
      {data.page < data.pages && <Link href={`/dashboard/games?${new URLSearchParams({ ...(data.status ? { status: data.status } : {}), page: String(data.page + 1) })}`}>بعدی</Link>}
    </nav>}
  </div>
}
