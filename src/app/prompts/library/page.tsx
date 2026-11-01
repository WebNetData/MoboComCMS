import type { Metadata } from 'next'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import TemplateCard from '@/components/prompts/TemplateCard'
import s from '@/components/prompts/PromptMaster.module.css'
import { studioState, templateDirectory } from '@/modules/prompts/server/prompts'
import { PROMPT_KINDS, KIND_LABEL } from '@/modules/prompts/domain/prompts'
export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'کتابخانهٔ الگوهای پرامپت | موبوکام', description: 'الگوهای قابل ویرایش برای نوشتن، تبلیغات، طراحی تصویر، ویدئو و برنامه‌نویسی.', alternates: { canonical: '/prompts/library' } }
export default async function PromptLibraryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams, [data, policy] = await Promise.all([templateDirectory(query), studioState()])
  const href = (page: number) => '/prompts/library?' + new URLSearchParams({ q: data.q, kind: data.kind, category: data.category, page: String(page) })
  return <main className={s.page} dir="rtl"><header className={s.intro}><div><span className={s.signature}><Icon name="layers" size={18} />کتابخانهٔ پرامپت مستر</span><h1>برای هر ایده، یک شروع بهتر</h1><p>الگوهای منتخب را کشف کن و با جزئیات خودت، به نتیجهٔ دلخواه نزدیک‌تر شو.</p></div><nav className={s.introLinks}><Link href="/prompts"><Icon name="sparkles" size={17} />بازگشت به استودیو</Link></nav></header>
    <form className={s.filters} action="/prompts/library" method="get"><label className={s.field}>جست‌وجوی الگو<input name="q" type="search" defaultValue={data.q} placeholder="عنوان، کاربرد یا برچسب…" maxLength={100} /></label><label className={s.field}>نوع پرامپت<select name="kind" defaultValue={data.kind}><option value="">همهٔ نوع‌ها</option>{PROMPT_KINDS.map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></label><label className={s.field}>دسته<select name="category" defaultValue={data.category}><option value="">همهٔ دسته‌ها</option>{policy.categories.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}</select></label><button className={s.primary} type="submit"><Icon name="search" size={17} />جست‌وجو</button></form>
    <div className={s.sectionHead}><p>{data.total.toLocaleString('fa-IR')} الگو{data.q || data.kind || data.category ? ' با فیلتر فعلی' : ' برای شروع'}</p>{(data.q || data.kind || data.category) && <Link href="/prompts/library">پاک‌کردن فیلترها</Link>}</div>
    <div className={s.templateGrid}>{data.templates.map(entry => <TemplateCard key={entry.id} template={entry} category={policy.categories.find(c => c.code === entry.category)?.name} />)}{!data.templates.length && <div className={s.empty}><Icon name="search" size={32} /><h2>الگویی با این فیلترها پیدا نشد</h2><p>عبارت کوتاه‌تری بنویس یا دسته و نوع را تغییر بده.</p><Link href="/prompts/library" className={s.secondary}>همهٔ الگوها</Link></div>}</div>
    {data.pages > 1 && <nav className={s.pagination} aria-label="صفحه‌بندی الگوها">{data.page > 1 && <Link className={s.secondary} href={href(data.page-1)}>صفحهٔ قبل</Link>}<span>صفحهٔ {data.page.toLocaleString('fa-IR')} از {data.pages.toLocaleString('fa-IR')}</span>{data.page < data.pages && <Link className={s.secondary} href={href(data.page+1)}>صفحهٔ بعد</Link>}</nav>}
  </main>
}
