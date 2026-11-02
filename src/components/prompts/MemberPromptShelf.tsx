import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import type { MemberPromptWorkspace } from '@/modules/prompts/server/prompts'
import { isKind, KIND_LABEL } from '@/modules/prompts/domain/prompts'
import s from './MemberPromptShelf.module.css'

/** Shared presentation for the account home, member library and Prompt workspace. */
export default function MemberPromptShelf({ data, compact = false }: { data: MemberPromptWorkspace; compact?: boolean }) {
  const number = (n: number) => n.toLocaleString('fa-IR')
  return <section className={`ud-card ${s.shelf}`} aria-label="پرامپت مستر من">
    <header className={s.head}><span className={s.mark}><Icon name="sparkles" size={23} /></span><div><h2>پرامپت مستر من</h2><p>ایده‌ها، خروجی‌ها و الگوهای منتخب شما</p></div><Link href="/prompts" className="btn btn-primary">ساخت پرامپت<Icon name="plus" size={16} /></Link></header>
    <nav className={s.stats} aria-label="کتابخانهٔ پرامپت من">
      <Link href="/dashboard/prompts"><Icon name="clock" size={18} /><span>خروجی‌های من<b>{number(data.total)}</b></span></Link>
      <Link href="/dashboard/prompts?pinned=true"><Icon name="bookmark" size={18} /><span>نگه‌داری‌شده‌ها<b>{number(data.pinned)}</b></span></Link>
      {data.favorites && <Link href="/favorites?type=prompt"><Icon name="heart" size={18} /><span>الگوهای محبوب<b>{number(data.favorites.total)}</b></span></Link>}
      <Link href="/dashboard/collections"><Icon name="layers" size={18} /><span>کالکشن‌های من<small>مدیریت مجموعه‌ها</small></span></Link>
    </nav>
    {!compact && <><div className={s.caption}><h3>ادامهٔ ایده‌های اخیر</h3><Link href="/prompts/library">کشف الگوها<Icon name="arrow" size={15} /></Link></div>
      {data.recent.length ? <ul className={s.recent}>{data.recent.map(item => <li key={item.id}><Link href={`/prompts?generation=${item.id}`}><span className={s.recentIcon}><Icon name={item.pinned ? 'bookmark' : 'file'} size={19} /></span><span><b>{item.title}</b><small>{isKind(item.kind) ? KIND_LABEL[item.kind] : 'پرامپت'} · {new Date(item.createdAt).toLocaleDateString('fa-IR')}</small></span><Icon name="arrow" size={17} /></Link></li>)}</ul> : <p className={s.empty}>خروجی‌های ذخیره‌شدهٔ شما اینجا در دسترس خواهند بود. <Link href="/prompts">اولین پرامپت را بسازید.</Link></p>}
      <p className={s.privacy}><Icon name="shield" size={15} />خروجی‌ها خصوصی‌اند. الگوهای عمومی را با دکمهٔ «فهرست‌های من» به کالکشن دلخواه اضافه کنید.</p></>}
  </section>
}
