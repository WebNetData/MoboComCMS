import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import ItemActions from '@/components/engage/ItemActions'
import ManageBar from '@/components/admin/ManageBar'
import { templateBySlug, templateDirectory } from '@/modules/prompts/server/prompts'
import { KIND_LABEL, KIND_ICON, isKind, DEFAULT_INPUT, normalizeInput, assemblePrompt, readShowcase, hasShowcase } from '@/modules/prompts/domain/prompts'
import ShowcasePreview from '@/components/prompts/ShowcasePreview'
import PromptCopy from '@/components/prompts/PromptCopy'
import TemplateCard from '@/components/prompts/TemplateCard'
import { favoriteOf } from '@/modules/reviews/server/reviews'
import { getViewer } from '@/modules/membership/server/membership'
import s from '@/components/prompts/PromptMaster.module.css'
import g from '@/components/prompts/PromptGallery.module.css'
export const dynamic = 'force-dynamic'
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const entry = await templateBySlug((await params).slug)
  if(!entry)return { title:'الگو پیدا نشد',robots:{index:false} }
  const sample=readShowcase(entry.showcase)
  return { title:`${entry.title} | پرامپت مستر`,description:entry.summary,alternates:{canonical:`/prompts/templates/${entry.slug}`},openGraph:{title:entry.title,description:entry.summary,...(sample.cover?{images:[{url:sample.cover,alt:sample.alt||entry.title}]}:{})} }
}
export default async function TemplatePage({ params }: { params: Promise<{ slug: string }> }) {
  const [template, viewer] = await Promise.all([templateBySlug((await params).slug), getViewer()])
  if (!template) notFound()
  const [favorite,relatedData] = await Promise.all([viewer.userId?favoriteOf(viewer.userId,{type:'prompt',id:template.id}):null,templateDirectory({kind:template.kind,samples:'true'})])
  const sample=readShowcase(template.showcase),ready=hasShowcase(sample),kind=isKind(template.kind)?template.kind:'TEXT'
  let defaults={};try{defaults=JSON.parse(template.defaults)}catch{/* legacy empty defaults */}
  const prompt=ready&&template.example?template.example:assemblePrompt(normalizeInput({...DEFAULT_INPUT,...defaults,kind,idea:template.example||'ایدهٔ خودتان را با جزئیات توضیح دهید.'}),template)
  const related=relatedData.templates.filter(entry=>entry.id!==template.id).slice(0,4),tags=template.tags.split(/[,،]/).map(v=>v.trim()).filter(Boolean).slice(0,12)
  return <main className={`${s.page} ${g.gallery}`} dir="rtl" data-testid="prompt-detail"><ManageBar title="مدیریت الگو" anyOf={['prompts.manage']} links={[{href:`/admin/prompts?edit=${template.id}`,label:'ویرایش الگو'}]}/>
    <nav className={g.breadcrumbs} aria-label="مسیر صفحه"><Link href="/prompts">پرامپت مستر</Link><Icon name="chevron-left" size={13}/><Link href="/prompts/library">کتابخانه</Link><Icon name="chevron-left" size={13}/><span>{KIND_LABEL[kind]}</span></nav>
    <div className={g.detailGrid}><section className={g.samplePanel} aria-label="نمونهٔ خروجی"><header className={g.sampleHeader}><span><Icon name={KIND_ICON[kind]} size={17}/>{ready?'نمونهٔ خروجی':'الگوی شخصی‌سازی'}</span><small>{sample.video?'برای پخش کلیک کنید':sample.cover?'تصویر همراه با پرامپت دقیق':'ایده را به کار خودت نزدیک کن'}</small></header><div className={g.sampleStage}><ShowcasePreview sample={sample} kind={kind} title={template.title}/></div><div className={g.sampleNotes}>{sample.caption&&<p>{sample.caption}</p>}{sample.credit&&<small>{sample.credit}</small>}{!ready&&<p>این الگو نمونهٔ بصری ثبت‌شده ندارد؛ در استودیو جزئیات خودت را وارد کن.</p>}{sample.webLayout!=='none'&&sample.result&&<details><summary>ساختار نمونهٔ وب</summary><pre className={g.exactPrompt} dir="ltr" tabIndex={0} aria-label="ساختار نمونهٔ وب">{sample.result}</pre></details>}</div></section>
      <section className={g.promptPanel} aria-labelledby="sample-prompt-title"><span className={g.detailType}><Icon name={KIND_ICON[kind]} size={15}/>{KIND_LABEL[kind]}</span><h1 id="sample-prompt-title">{template.title}</h1><p className={g.promptSummary}>{template.summary}</p><div className={g.promptLabel}><span>{ready?'پرامپت این نمونه':'پرامپت آمادهٔ استفاده'}</span><small>{Array.from(prompt).length.toLocaleString('fa-IR')} نویسه</small></div><pre className={g.exactPrompt} dir="auto" tabIndex={0} aria-label="متن دقیق پرامپت نمونه">{prompt}</pre><PromptCopy text={prompt} title={template.title}/><Link className={g.useTemplate} href={`/prompts?template=${template.slug}`}><Icon name="sparkles" size={17}/>شخصی‌سازی در استودیو<Icon name="arrow" size={16}/></Link><ItemActions item={`prompt:${template.id}`} title={template.title} image={sample.cover} loggedIn={!!viewer.userId} favorite={favorite} favoriteLabels={{off:'ذخیرهٔ الگو در علاقه‌مندی‌ها',on:'الگوی ذخیره‌شده'}}/>{!!tags.length&&<div className={g.detailTags}>{tags.map(tag=><Link key={tag} href={'/prompts/library?'+new URLSearchParams({q:tag,view:'all'})}>#{tag}</Link>)}</div>}</section></div>
    {!!related.length&&<section className={g.related} aria-labelledby="related-prompts-title"><div className={s.sectionHead}><h2 id="related-prompts-title">در همین حال‌وهوا کشف کن</h2><Link href={'/prompts/library?kind='+kind}>دیدن همه<Icon name="arrow" size={16}/></Link></div><div className={g.relatedGrid}>{related.map(entry=><TemplateCard key={entry.id} template={entry}/>)}</div></section>}
  </main>
}
