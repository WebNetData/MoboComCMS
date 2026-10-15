'use client'

import { useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import VpnHome from './VpnHome'
import { BASE_CURRENCY, formatCurrency } from '@/shared/money/client'
import Icon from '@/components/site/Icon'

// Account home: profile banner with completeness, quick actions, 12-week
// activity, orders & wallet, inbox, community, games and favorites — each
// widget only when its module is on.

type Overview = {
  modules: Record<'store' | 'community' | 'games' | 'forum' | 'membership' | 'reviews' | 'vpn', boolean>
  user: { name: string; email: string; joinedAt: string; avatarColor: string }
  profile: { username: string; avatar: string; cover: string; headline: string; verified: boolean; followers: number; following: number; posts: number; percent: number; missing: { key: string; label: string; href: string }[] }
  vip: { endsAt: string; daysLeft: number } | null
  money: { currency: string; balance: number; unpaid: number; unpaidCount: number }[]
  orders: { inProgress: number; recent: { id: number; title: string; more: number; image: string; status: string; fulfilment: string; createdAt: string; total: number; currency: string }[] }
  inbox: { unread: number; messages: number; tickets: number; recent: { id: number; title: string; body: string; href: string; read: boolean; createdAt: string; kind: string }[] }
  community: { followers7: number; likes7: number; comments7: number; feed: { id: number; text: string; createdAt: string; likes: number; comments: number; author: { name: string; username: string; avatar: string; avatarColor: string } }[] } | null
  games: { counts: Record<string, number>; upcoming: { title: string; slug: string; cover: string; releaseDate: string; days: number }[] } | null
  favorites: { count: number; recent: { title: string; url: string; image: string; type: string }[] }
  activity: { days: string[]; counts: number[] }
}

const fa = (n: number) => n.toLocaleString('fa-IR')
const ago = (iso: string) => { const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000); if (s < 3600) return `${fa(Math.max(1, Math.floor(s / 60)))} دقیقه پیش`; if (s < 86400) return `${fa(Math.floor(s / 3600))} ساعت پیش`; return `${fa(Math.floor(s / 86400))} روز پیش` }
const dayFormat = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
const persianDay = (key: string) => dayFormat.format(new Date(`${key}T12:00:00Z`))
const STATE: Record<string, [string, string]> = { PENDING: ['در انتظار پرداخت', 'is-warn'], PAID: ['پرداخت‌شده', 'is-ok'], FAILED: ['ناموفق', 'is-bad'], CANCELLED: ['لغوشده', ''], EXPIRED: ['منقضی', ''] }
const FULFIL: Record<string, string> = { PENDING: 'در صف پردازش', PROCESSING: 'در حال آماده‌سازی', PACKED: 'بسته‌بندی شد', SHIPPED: 'ارسال شد', DELIVERED: 'تحویل شد', CANCELLED: 'لغو شد', RETURNED: 'مرجوع شد' }

function Greeting({ name }: { name: string }) {
  const hour = new Date().getHours()
  const part = hour < 5 ? 'شب بخیر' : hour < 12 ? 'صبح بخیر' : hour < 17 ? 'روز بخیر' : hour < 21 ? 'عصر بخیر' : 'شب بخیر'
  return <>{part}، {name}</>
}

/** 12-week contribution calendar (Saturday-first weeks), one hue in 5 steps, hover/focus readout. */
function ActivityGrid({ days, counts }: { days: string[]; counts: number[] }) {
  const [focus, setFocus] = useState<number | null>(null)
  const max = Math.max(1, ...counts)
  const level = (n: number) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)))
  const total = counts.reduce((a, b) => a + b, 0)
  const offset = (new Date(`${days[0]}T12:00:00Z`).getUTCDay() + 1) % 7
  const cells: (number | null)[] = [...Array(offset).fill(null), ...counts.map((_, i) => i)]
  return <section className="ud-card ud-activity" aria-labelledby="ud-activity-title">
    <header className="ud-card-head"><h2 id="ud-activity-title">فعالیت ۱۲ هفتهٔ اخیر</h2><small aria-live="polite">{focus !== null ? `${persianDay(days[focus])}: ${fa(counts[focus])} فعالیت` : `${fa(total)} فعالیت`}</small></header>
    <div className="ud-grid" role="grid" aria-label="تقویم فعالیت">{cells.map((index, i) => index === null ? <span key={`x${i}`} className="ud-cell is-empty" aria-hidden="true" /> : <span key={days[index]} role="gridcell" tabIndex={0} className={`ud-cell l${level(counts[index])}`} aria-label={`${persianDay(days[index])}: ${fa(counts[index])} فعالیت`} onMouseEnter={() => setFocus(index)} onMouseLeave={() => setFocus(null)} onFocus={() => setFocus(index)} onBlur={() => setFocus(null)} />)}</div>
    <footer className="ud-legend"><span>کمتر</span>{[0, 1, 2, 3, 4].map((l) => <span key={l} className={`ud-cell l${l}`} aria-hidden="true" />)}<span>بیشتر</span><small>پست، دیدگاه، پیام تالار، نقد و سفارش</small></footer>
  </section>
}

function Avatar({ src, name, color, size = 40 }: { src: string; name: string; color: string; size?: number }) {
  return src ? <img className="ud-avatar" src={src} alt="" width={size} height={size} style={{ width: size, height: size }} /> : <span className="ud-avatar" style={{ width: size, height: size, background: color, fontSize: size * 0.42 }} aria-hidden="true">{name.slice(0, 1)}</span>
}

export default function DashboardHome() {
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    fetch('/api/my/overview', { cache: 'no-store' }).then(async (r) => { const body = await r.json().catch(() => null); if (r.ok) setData(body); else setError(body?.error || 'بارگذاری انجام نشد') }).catch(() => setError('ارتباط برقرار نشد'))
  }, [])
  if (error) return <div className="card" role="alert"><p className="error-text">{error}</p></div>
  if (!data) return <div className="ud" aria-busy="true"><div className="ud-skeleton is-hero" /><div className="ud-cols"><div className="ud-skeleton" /><div className="ud-skeleton" /></div></div>
  const { profile: p, modules: m } = data
  const money = (n: number, currency: string) => formatCurrency(n, currency, 'fa-IR')
  const quick = [
    m.community && { href: '/feed', label: 'تازه‌ها', icon: 'rss' },
    m.store && { href: '/products', label: 'فروشگاه', icon: 'bag' },
    m.forum && { href: '/forum', label: 'تالار', icon: 'chat' },
    m.games && { href: '/dashboard/games', label: 'کتابخانهٔ بازی', icon: 'gamepad' },
    { href: '/dashboard/wallet', label: 'شارژ کیف پول', icon: 'wallet' },
    { href: '/dashboard/tickets', label: 'پشتیبانی', icon: 'lifebuoy' },
  ].filter(Boolean) as { href: string; label: string; icon: string }[]
  const shelf = data.games?.counts || {}
  // The wallet in the site's own currency first; other currencies only when they hold money.
  const main = data.money.find((w) => w.currency === BASE_CURRENCY) || { currency: BASE_CURRENCY, balance: 0, unpaid: 0, unpaidCount: 0 }
  const others = data.money.filter((w) => w.currency !== BASE_CURRENCY && w.balance > 0)
  const unpaid = data.money.filter((w) => w.unpaidCount > 0)
  const unpaidCount = unpaid.reduce((sum, w) => sum + w.unpaidCount, 0)
  return <div className="ud" dir="rtl">
    <section className="ud-hero">
      <div className="ud-hero-cover" style={p.cover ? { backgroundImage: `url("${p.cover}")` } : { ['--ud-seed' as string]: data.user.avatarColor }} aria-hidden="true" />
      <div className="ud-hero-body">
        <Avatar src={p.avatar} name={data.user.name} color={data.user.avatarColor} size={92} />
        <div className="ud-hero-copy">
          <h1><Greeting name={data.user.name} /> 👋</h1>
          <p>{p.headline || 'به پیشخوان خودتان خوش آمدید'} · <bdi dir="ltr">@{p.username}</bdi>{p.verified && ' ✔'}</p>
          {m.community && <div className="ud-hero-stats"><Link href={`/u/${p.username}?tab=followers`}><b>{fa(p.followers)}</b> دنبال‌کننده</Link><Link href={`/u/${p.username}?tab=following`}><b>{fa(p.following)}</b> دنبال‌شونده</Link><Link href={`/u/${p.username}?tab=posts`}><b>{fa(p.posts)}</b> پست</Link></div>}
        </div>
        <div className="ud-hero-actions">
          {m.community && <Link href={`/u/${p.username}`} className="btn btn-ghost">پروفایل من</Link>}
          <Link href="/dashboard/public-profile" className="btn btn-primary">ویرایش پروفایل</Link>
        </div>
      </div>
      {p.percent < 100 && <div className="ud-complete">
        <div className="ud-complete-bar" role="progressbar" aria-valuenow={p.percent} aria-valuemin={0} aria-valuemax={100} aria-label="کامل بودن پروفایل"><span style={{ width: `${p.percent}%` }} /></div>
        <p><b>پروفایل شما {fa(p.percent)}٪ کامل است.</b> باقی‌مانده: {p.missing.map((item, i) => <span key={item.key}>{i > 0 && '، '}<Link href={item.href}>{item.label}</Link></span>)}</p>
      </div>}
    </section>

    <nav className="ud-quick" aria-label="دسترسی سریع">{quick.map((q) => <Link key={q.href} href={q.href}><span><Icon name={q.icon} size={18} /></span>{q.label}</Link>)}</nav>

    <div className="ud-kpis">
      <Link href="/dashboard/wallet" className="ud-kpi is-wallet"><small>موجودی کیف پول</small><b className="num">{money(main.balance, main.currency)}</b>
        {others.length > 0 ? <span className="ud-kpi-more">{others.map((w) => <i key={w.currency} className="num">{money(w.balance, w.currency)}</i>)}</span> : <span>شارژ و پرداخت با یک لمس</span>}</Link>
      <Link href="/dashboard/invoices?status=UNPAID" className={`ud-kpi${unpaidCount ? ' is-warn' : ''}`}><small>فاکتورهای پرداخت‌نشده</small><b className="num">{fa(unpaidCount)}</b>
        <span>{unpaidCount ? unpaid.map((w) => money(w.unpaid, w.currency)).join(' · ') : 'همه پرداخت شده‌اند'}</span></Link>
      {m.store && <Link href="/dashboard/orders" className="ud-kpi"><small>سفارش‌های در جریان</small><b className="num">{fa(data.orders.inProgress)}</b><span>پیگیری مرسوله‌ها</span></Link>}
      <Link href="/dashboard/notifications" className={`ud-kpi${data.inbox.unread ? ' is-hot' : ''}`}><small>اعلان خوانده‌نشده</small><b className="num">{fa(data.inbox.unread)}</b><span>{m.forum ? `${fa(data.inbox.messages)} پیام خصوصی تازه` : 'صندوق اعلان‌ها'}</span></Link>
      {m.membership && <Link href="/vip" className={`ud-kpi${data.vip ? ' is-vip' : ''}`}><small>اشتراک ویژه</small><b>{data.vip ? `${fa(data.vip.daysLeft)} روز` : 'غیرفعال'}</b><span>{data.vip ? `تا ${new Date(data.vip.endsAt).toLocaleDateString('fa-IR')}` : 'مشاهدهٔ پلن‌ها'}</span></Link>}
    </div>

    {m.vpn ? <VpnHome /> : <div className="ud-cols">
      <div className="ud-stack">
        <ActivityGrid days={data.activity.days} counts={data.activity.counts} />
        {m.community && data.community && <section className="ud-card">
          <header className="ud-card-head"><h2>تازه‌های دنبال‌شده‌ها</h2><Link href="/feed">همهٔ تازه‌ها</Link></header>
          <div className="ud-pulse"><span><b className="num">{fa(data.community.followers7)}</b>دنبال‌کنندهٔ تازه</span><span><b className="num">{fa(data.community.likes7)}</b>پسند</span><span><b className="num">{fa(data.community.comments7)}</b>دیدگاه</span><small>در ۷ روز اخیر</small></div>
          {data.community.feed.length ? <ul className="ud-feed">{data.community.feed.map((post) => <li key={post.id}><Link href={`/feed/p/${post.id}`}><Avatar src={post.author.avatar} name={post.author.name} color={post.author.avatarColor} size={36} /><span><b>{post.author.name}</b> <small>{ago(post.createdAt)}</small><p dir="auto">{post.text}</p><small>♥ {fa(post.likes)} · 💬 {fa(post.comments)}</small></span></Link></li>)}</ul>
            : <p className="ud-muted">هنوز کسی را دنبال نمی‌کنید. <Link href="/people">کاربران را ببینید</Link> تا پست‌هایشان این‌جا بیاید.</p>}
        </section>}
        {m.store && <section className="ud-card">
          <header className="ud-card-head"><h2>سفارش‌های اخیر</h2><Link href="/dashboard/orders">همهٔ سفارش‌ها</Link></header>
          {data.orders.recent.length ? <ul className="ud-orders">{data.orders.recent.map((o) => <li key={o.id}><Link href={`/dashboard/orders/${o.id}`}>
            {o.image ? <img src={o.image} alt="" /> : <span className="ud-ph"><Icon name="bag" size={18} /></span>}
            <span className="ud-grow"><b>{o.title}{o.more > 0 && <small> و {fa(o.more)} کالای دیگر</small>}</b><small className="num">#{fa(o.id)} · {new Date(o.createdAt).toLocaleDateString('fa-IR')}</small></span>
            <span className="ud-end"><b className="num">{money(o.total, o.currency)}</b><span className={`ud-state ${STATE[o.status]?.[1] || ''}`}>{o.status === 'PAID' && o.fulfilment ? FULFIL[o.fulfilment] || STATE.PAID[0] : STATE[o.status]?.[0] || o.status}</span></span>
          </Link></li>)}</ul> : <p className="ud-muted">سفارشی ثبت نکرده‌اید. <Link href="/products">سری به فروشگاه بزنید</Link>.</p>}
        </section>}
      </div>
      <div className="ud-stack">
        <section className="ud-card">
          <header className="ud-card-head"><h2>اعلان‌ها</h2><Link href="/dashboard/notifications">همه</Link></header>
          {data.inbox.recent.length ? <ul className="ud-notes">{data.inbox.recent.map((n) => <li key={n.id} className={n.read ? '' : 'is-unread'}><Link href={n.href}><b>{n.title}</b>{n.body && <p>{n.body}</p>}<small>{ago(n.createdAt)}</small></Link></li>)}</ul> : <p className="ud-muted">اعلانی ندارید.</p>}
          {(data.inbox.tickets > 0 || data.inbox.messages > 0) && <div className="ud-row">{data.inbox.messages > 0 && <Link href="/forum/messages" className="ud-pill">✉ {fa(data.inbox.messages)} گفت‌وگوی تازه</Link>}{data.inbox.tickets > 0 && <Link href="/dashboard/tickets" className="ud-pill">🎧 {fa(data.inbox.tickets)} تیکت باز</Link>}</div>}
        </section>
        {m.games && data.games && <section className="ud-card">
          <header className="ud-card-head"><h2>کتابخانهٔ بازی</h2><Link href="/dashboard/games">مشاهده</Link></header>
          <div className="ud-shelf">{([['PLAYING', 'در حال بازی'], ['PLAYED', 'بازی کرده'], ['WANT', 'منتظرم'], ['DROPPED', 'رها کرده']] as const).map(([key, label]) => <Link key={key} href={`/dashboard/games?status=${key}`}><b className="num">{fa(shelf[key] || 0)}</b><small>{label}</small></Link>)}</div>
          {data.games.upcoming.length > 0 && <><h3 className="ud-sub">به‌زودی منتشر می‌شوند</h3><ul className="ud-upcoming">{data.games.upcoming.map((g) => <li key={g.slug}><Link href={`/games/${g.slug}`}>{g.cover ? <img src={g.cover} alt="" /> : <span className="ud-ph">🎮</span>}<span className="ud-grow"><b>{g.title}</b><small>{new Date(g.releaseDate).toLocaleDateString('fa-IR', { day: 'numeric', month: 'long' })}</small></span><span className="ud-days num">{fa(g.days)}<small>روز</small></span></Link></li>)}</ul></>}
        </section>}
        {m.reviews && <section className="ud-card">
          <header className="ud-card-head"><h2>علاقه‌مندی‌ها</h2><Link href="/favorites">{fa(data.favorites.count)} مورد</Link></header>
          {data.favorites.recent.length ? <div className="ud-favs">{data.favorites.recent.map((f) => <Link key={f.url} href={f.url} title={f.title}>{f.image ? <img src={f.image} alt={f.title} /> : <span className="ud-ph">★</span>}</Link>)}</div> : <p className="ud-muted">با دکمهٔ ♡ در صفحهٔ هر بازی، نرم‌افزار یا محصول، این‌جا جمعشان کنید.</p>}
        </section>}
      </div>
    </div>}
  </div>
}
