import Link from 'next/link'
import { isModuleEnabled } from '@/extensions/server/modules'

const COPY = {
  music: { fa: ['کیفیت ۳۲۰، دانلود نامحدود، آهنگ‌های ویژه', 'با VIP بدون محدودیت گوش بده'], en: ['320 kbps, unlimited downloads, exclusive tracks', 'Listen without limits with VIP'] },
  cinema: { fa: ['فیلم‌ها و سریال‌های ویژه، لینک مستقیم و بدون محدودیت', 'با VIP همه چیز را ببین'], en: ['Exclusive films & series, direct links, no limits', 'Watch everything with VIP'] },
  games: { fa: ['لینک مستقیم بازی‌های ویژه و قیمت مخصوص اعضا', 'با VIP زودتر بازی کن'], en: ['Direct links to exclusive games and member prices', 'Play first with VIP'] },
  software: { fa: ['لینک مستقیم نرم‌افزارهای ویژه و نسخه‌های کامل', 'با VIP بدون محدودیت دانلود کن'], en: ['Direct links to exclusive software and full versions', 'Download without limits with VIP'] },
  forum: { fa: ['دسترسی به انجمن‌های ویژه و گفت‌وگو با اعضای VIP', 'با VIP به جمع ویژه بپیوند'], en: ['Members-only boards and VIP conversations', 'Join the inner circle with VIP'] },
  shop: { fa: ['قیمت ویژه اعضا و کدهای تخفیف اختصاصی', 'با VIP ارزان‌تر بخر'], en: ['Member prices and exclusive discount codes', 'Save more with VIP'] },
} as const

/** Horizontal VIP upsell shown to non-members at the end of section pages. */
export default async function VipStrip({ fa, kind }: { fa: boolean; kind: keyof typeof COPY }) {
  if (!await isModuleEnabled('membership')) return null
  const [sub, title] = COPY[kind][fa ? 'fa' : 'en']
  return (
    <aside className="vip-strip">
      <span className="vip-strip-crown" aria-hidden="true">♛</span>
      <div><b>{title}</b><p>{sub}</p></div>
      <Link href="/vip" className="btn vip-btn">{fa ? 'مشاهده پلن‌های VIP' : 'See VIP plans'}</Link>
    </aside>
  )
}
