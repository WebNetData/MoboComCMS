import type { Metadata } from 'next'
import Link from '@/components/AppLink'
import { notFound } from 'next/navigation'
import Icon from '@/components/site/Icon'
import PromptStudio from '@/components/prompts/PromptStudio'
import StudioIntro from '@/components/prompts/StudioIntro'
import TemplateCard from '@/components/prompts/TemplateCard'
import s from '@/components/prompts/PromptMaster.module.css'
import { studioState, templateDirectory, templateBySlug } from '@/modules/prompts/server/prompts'
import { isKind } from '@/modules/prompts/domain/prompts'
import { getViewer } from '@/modules/membership/server/membership'
import { withSectionSeo } from '@/modules/site/server/section-seo'
export const dynamic = 'force-dynamic'
export const generateMetadata = (): Promise<Metadata> => withSectionSeo('prompt-master', { title: 'پرامپت مستر | موبوکام', description: 'ایده‌تان را به پرامپت دقیق برای متن، تصویر، ویدئو و کدنویسی تبدیل کنید؛ با الگوهای قابل ویرایش و تاریخچهٔ خصوصی.', alternates: { canonical: '/prompts' } })

export default async function PromptsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams, slug = typeof query.template === 'string' ? query.template.slice(0,100) : ''
  const [policy, directory, template, viewer] = await Promise.all([studioState(), templateDirectory({}), slug ? templateBySlug(slug) : null, getViewer()])
  if (slug && !template) notFound()
  const kind = template && isKind(template.kind) ? template.kind : isKind(query.kind) ? query.kind : 'TEXT'
  const generationId = typeof query.generation === 'string' && /^\d+$/.test(query.generation) ? query.generation : ''
  const featured = directory.templates.slice(0,6), category = (code: string) => policy.categories.find(c => c.code === code)?.name || code
  return <main className={s.page} dir="rtl" data-testid="prompt-master">
    <StudioIntro title={policy.title} description={policy.description} templates={featured}/>
    <PromptStudio key={`${slug}:${kind}:${generationId}`} policy={policy} loggedIn={!!viewer.userId} initialKind={kind} template={template} generationId={generationId} examples={directory.templates.map(entry => ({ title: entry.title, kind: entry.kind, example: entry.example }))} />
    <section aria-labelledby="prompt-featured-title"><div className={s.sectionHead}><div><h2 id="prompt-featured-title">از یک الگوی خوب شروع کن</h2><p>الگو را انتخاب کن، جزئیات خودت را اضافه کن و خروجی را بساز.</p></div><Link href="/prompts/library">همهٔ الگوها<Icon name="arrow" size={17} /></Link></div><div className={s.templateGrid}>{featured.map(entry => <TemplateCard key={entry.id} template={entry} category={category(entry.category)} variant="compact" />)}{!featured.length && <div className={s.empty}><Icon name="layers" size={28} /><h2>کتابخانه در حال آماده‌شدن است</h2><p>تا انتشار الگوها، با ایدهٔ خودتان از استودیو استفاده کنید.</p></div>}</div></section>
    <section className={s.steps} aria-label="روش استفاده"><div><b>۱</b><h3>ایده‌ات را روشن کن</h3><p>نوع خروجی و هدفت را بنویس. زمینه و محدودیت‌ها به دقت بیشتر کمک می‌کنند.</p></div><div><b>۲</b><h3>پرامپت را بساز و ویرایش کن</h3><p>ساختار آماده را متناسب با نیازت تنظیم کن؛ کنترل متن نهایی در اختیار توست.</p></div><div><b>۳</b><h3>در ابزار دلخواهت امتحان کن</h3><p>متن را کپی کن و در ابزار مقصد استفاده کن. نتیجه را بررسی و پرامپت را دقیق‌تر کن.</p></div></section>
  </main>
}
