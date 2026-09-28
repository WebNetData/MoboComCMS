import type { Metadata } from 'next'
import Link from '@/components/AppLink'
import { redirect } from 'next/navigation'
import { requireModule } from '@/extensions/server/modules'
import { getViewer } from '@/modules/membership/server/membership'
import { listFavorites } from '@/modules/reviews/server/reviews'
import { ITEM_LABEL, itemKey, type ItemType } from '@/modules/content/domain/items'
import MediaShell from '@/components/media/MediaShell'
import ItemActions from '@/components/engage/ItemActions'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'علاقه‌مندی‌های من', robots: { index: false } }

const FOLLOW: Partial<Record<ItemType, string>> = { software: 'نسخهٔ جدید', game: 'لینک‌های جدید', title: 'قسمت جدید', album: 'آهنگ‌های جدید', product: 'تخفیف و موجودی' }

export default async function FavoritesPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  await requireModule('reviews')
  const viewer = await getViewer()
  if (!viewer.userId) redirect('/login?next=/favorites')
  const [items, { type }] = await Promise.all([listFavorites(viewer.userId), searchParams])
  const types = [...new Set(items.map((item) => item.type))]
  const shown = type && types.includes(type as ItemType) ? items.filter((item) => item.type === type) : items

  return (
    <MediaShell section="favorites">
      <div className="container fv-page">
        <header className="sr-head">
          <h1>علاقه‌مندی‌های من</h1>
          <p className="muted">{items.length ? `${items.length.toLocaleString('fa-IR')} مورد ذخیره شده. با 🔔 از نسخه، قسمت یا تخفیف جدید باخبر شوید؛ اعلان‌ها در صندوق پیام و پیامک شما می‌آیند.` : 'هنوز چیزی ذخیره نکرده‌اید.'}</p>
        </header>
        {types.length > 1 && (
          <nav className="sr-tabs" aria-label="نوع">
            <Link href="/favorites" className={!type ? 'is-active' : ''}>همه <span>{items.length.toLocaleString('fa-IR')}</span></Link>
            {types.map((t) => <Link key={t} href={`/favorites?type=${t}`} className={type === t ? 'is-active' : ''}>{ITEM_LABEL[t].icon} {ITEM_LABEL[t].many} <span>{items.filter((item) => item.type === t).length.toLocaleString('fa-IR')}</span></Link>)}
          </nav>
        )}
        {shown.length ? (
          <ul className="fv-grid">
            {shown.map((item) => (
              <li key={itemKey(item)} className="fv-card">
                <Link href={item.url} className="fv-thumb" tabIndex={-1} aria-hidden="true">{item.image ? <img src={item.image} alt="" loading="lazy" /> : <span>{ITEM_LABEL[item.type].icon}</span>}</Link>
                <div className="fv-body">
                  <span className="sr-type">{ITEM_LABEL[item.type].one}</span>
                  <h2><Link href={item.url}>{item.title}</Link></h2>
                  {item.subtitle && <p className="sr-sub">{item.subtitle}</p>}
                  <ItemActions item={itemKey(item)} title={item.title} image={item.image} loggedIn favorite={{ notify: item.notify }} canCompare={false} followLabel={FOLLOW[item.type]} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="sr-empty">
            <span aria-hidden="true">♡</span>
            <h2>فهرست علاقه‌مندی‌ها خالی است</h2>
            <p className="muted">در صفحهٔ هر نرم‌افزار، بازی، فیلم، آلبوم یا محصول روی «♡ علاقه‌مندی» بزنید تا اینجا ذخیره شود.</p>
            <div className="sr-chips"><Link href="/software">نرم‌افزار</Link><Link href="/games">بازی</Link><Link href="/cinema">فیلم و سریال</Link><Link href="/music">موزیک</Link><Link href="/products">فروشگاه</Link></div>
          </div>
        )}
      </div>
    </MediaShell>
  )
}
