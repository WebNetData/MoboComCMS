import type { Metadata } from 'next'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import PromptHistory from '@/components/prompts/PromptHistory'
import { getViewer } from '@/modules/membership/server/membership'
import s from '@/components/prompts/PromptMaster.module.css'
import MemberLibrarySync from '@/components/engage/MemberLibrarySync'
export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'تاریخچهٔ خصوصی پرامپت‌ها | موبوکام', robots: { index: false, follow: false } }
export default async function PromptHistoryPage() {
  const viewer = await getViewer()
  return <main className={s.page} dir="rtl"><header className={s.intro}><div><span className={s.signature}><Icon name="shield" size={17} />فضای شخصی پرامپت مستر</span><h1>ایده‌های خوب را نگه دار</h1><p>خروجی‌های اخیرت را دوباره باز کن، ویرایش کن و موارد مهم را برای بعد نگه دار. این فهرست فقط برای حساب خودت نمایش داده می‌شود.</p></div><nav className={s.introLinks}><Link href="/prompts"><Icon name="sparkles" size={17} />ساخت پرامپت جدید</Link><Link href="/favorites"><Icon name="heart" size={17} />الگوهای مورد علاقه</Link></nav></header>
    {viewer.userId ? <><MemberLibrarySync /><nav className={s.historyButtons}><Link className={s.secondary} href="/dashboard/prompts">پیشخوان پرامپت من</Link><Link className={s.secondary} href="/favorites?type=prompt">پرامپت‌های محبوب</Link><Link className={s.secondary} href="/dashboard/collections">کالکشن‌های من</Link></nav><PromptHistory /></> : <div className={s.empty}><Icon name="shield" size={32} /><h2>تاریخچه، مخصوص حساب شماست</h2><p>برای ذخیره و دیدن خروجی‌های خودت وارد حساب شو. ساخت ساختاریافته و دریافت متن طبق تنظیمات سایت برای مهمان‌ها هم در دسترس است.</p><Link className={s.primary} href="/login?next=/prompts/history">ورود به حساب</Link></div>}
  </main>
}
