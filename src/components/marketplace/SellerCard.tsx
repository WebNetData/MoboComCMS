import Link from '@/components/AppLink'

export type SellerCardData = { slug: string; shopName: string; logo: string; city: string; rating: { average: number; count: number }; performance: { label: string; tone: string }; salesCount: number; since: string }

/** "Sold by" box next to the buy box (marketplace products). */
export default function SellerCard({ seller }: { seller: SellerCardData }) {
  const months = Math.max(1, Math.round((Date.now() - new Date(seller.since).getTime()) / (30 * 86_400_000)))
  return (
    <div className="mk-seller">
      <span className="mk-seller-label">فروشنده</span>
      <Link href={`/shop/${seller.slug}`} className="mk-seller-main">
        {seller.logo ? <img src={seller.logo} alt="" width={40} height={40} /> : <span className="mk-seller-ph" aria-hidden="true">{seller.shopName.slice(0, 1)}</span>}
        <span><b>{seller.shopName}</b><small>{seller.city ? `${seller.city} · ` : ''}{months.toLocaleString('fa-IR')} ماه همراه ما</small></span>
      </Link>
      <div className="mk-seller-stats">
        <span className={`mk-perf is-${seller.performance.tone}`}>{seller.performance.label}</span>
        {seller.rating.count > 0 && <span>★ {seller.rating.average.toLocaleString('fa-IR')} <small>({seller.rating.count.toLocaleString('fa-IR')} رأی)</small></span>}
        {seller.salesCount > 0 && <span>{seller.salesCount.toLocaleString('fa-IR')} فروش</span>}
      </div>
    </div>
  )
}
