import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import ItemActions from '@/components/engage/ItemActions'
import ManageBar from '@/components/admin/ManageBar'
import { templateBySlug } from '@/modules/prompts/server/prompts'
import { KIND_LABEL, isKind } from '@/modules/prompts/domain/prompts'
import { favoriteOf } from '@/modules/reviews/server/reviews'
import { getViewer } from '@/modules/membership/server/membership'
import s from '@/components/prompts/PromptMaster.module.css'
export const dynamic = 'force-dynamic'
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const entry = await templateBySlug((await params).slug)
  return entry ? { title: `${entry.title} | پرامپت مستر`, description: entry.summary, alternates: { canonical: `/prompts/templates/${entry.slug}` } } : { title: 'الگو پیدا نشد', robots: { index: false } }
}
export default async function TemplatePage({ params }: { params: Promise<{ slug: string }> }) {
  const [template, viewer] = await Promise.all([templateBySlug((await params).slug), getViewer()])
  if (!template) notFound()
  const favorite = viewer.userId ? await favoriteOf(viewer.userId, { type: 'prompt', id: template.id }) : null
  return <main className={s.page} dir="rtl"><ManageBar title="مدیریت الگو" anyOf={['prompts.manage']} links={[{ href: `/admin/prompts?edit=${template.id}`, label: 'ویرایش الگو' }]} /><header className={s.intro}><div><Link className={s.signature} href="/prompts/library"><Icon name="layers" size={17} />کتابخانهٔ پرامپت مستر</Link><h1>{template.title}</h1><p>{template.summary}</p></div><Link className={s.primary} href={`/prompts?template=${template.slug}`}><Icon name="sparkles" size={18} />استفاده از این الگو</Link></header>
    <div className={s.pattern}><span className={s.tag}>{isKind(template.kind) ? KIND_LABEL[template.kind] : template.kind}</span><h2>الگوی دستور</h2><p className={s.muted}>عبارت‌های داخل دو آکولاد، هنگام ساخت با جزئیات شما جایگزین می‌شوند.</p><pre dir="auto">{template.content}</pre><h2>ایدهٔ نمونه</h2><p>{template.example || 'ایدهٔ خودتان را در استودیو وارد کنید.'}</p><ItemActions item={`prompt:${template.id}`} title={template.title} loggedIn={!!viewer.userId} favorite={favorite} favoriteLabels={{ off: 'ذخیرهٔ الگو در علاقه‌مندی‌ها', on: 'الگوی ذخیره‌شده' }} /></div>
    <Link href={`/prompts?template=${template.slug}`} className={s.primary}>شخصی‌سازی و ساخت پرامپت<Icon name="arrow" size={17} /></Link>
  </main>
}
