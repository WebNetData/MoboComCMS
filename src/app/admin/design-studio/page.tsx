'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import { useRouter } from '@/platform/routing/navigation'
import { useSearchParams } from 'next/navigation'
import { BUILDER_SURFACES, SURFACE_LABELS, type BuilderSurface } from '@/modules/site/domain/builder-surfaces'
import type { ThemeTemplateMeta, ThemeTemplateType } from '@/modules/site/domain/theme-templates'
import './studio.css'

type Target = { id: number; title: string; pageId: string }
function DesignStudio() {
  const assistant = useSearchParams().get('assistant') === '1'
  const router = useRouter(), [templates, setTemplates] = useState<ThemeTemplateMeta[]>([]), [allowed, setAllowed] = useState<ThemeTemplateType[]>([])
  const [error, setError] = useState(''), [loading, setLoading] = useState(true), [busy, setBusy] = useState('')
  const [kind, setKind] = useState('page'), [query, setQuery] = useState(''), [targets, setTargets] = useState<Target[]>([]), [searching, setSearching] = useState(false)
  useEffect(() => { const controller = new AbortController(); void fetch('/api/admin/theme-templates', { cache: 'no-store', signal: controller.signal }).then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error || 'دسترسی به طرح‌ها برقرار نشد'); setTemplates(body.templates.filter((template: ThemeTemplateMeta) => body.editableTypes?.includes(template.type))); setAllowed(body.editableTypes || []); setError('') }).catch(failure => { if (!controller.signal.aborted) setError(failure.message) }).finally(() => { if (!controller.signal.aborted) setLoading(false) }); return () => controller.abort() }, [])
  async function create(type: ThemeTemplateType, surface?: BuilderSurface) {
    if (busy) return
    setBusy(surface || type); setError('')
    try {
      const response = await fetch('/api/admin/theme-templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, surface, name: surface ? `طرح ${SURFACE_LABELS[surface]}` : type === 'header' ? 'هدر جدید' : type === 'footer' ? 'فوتر جدید' : type === 'single-post' ? 'قالب نوشتهٔ جدید' : type === 'single-product' ? 'قالب محصول جدید' : 'صفحهٔ جدید', preset: type === 'single-post' ? '' : undefined }) })
      const body = await response.json(); if (!response.ok) throw new Error(body.error || 'ساخت طرح انجام نشد')
      router.push(`/admin/builder/${body.template.id}`)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'ارتباط برقرار نشد') }
    finally { setBusy('') }
  }
  async function search() {
    setSearching(true); setError('')
    try { const response = await fetch(`/api/admin/builder/targets?kind=${kind}&q=${encodeURIComponent(query)}`, { cache: 'no-store' }); const body = await response.json(); if (!response.ok) throw new Error(body.error || 'فهرست دریافت نشد'); setTargets(body.items) }
    catch (failure) { setTargets([]); setError(failure instanceof Error ? failure.message : 'ارتباط برقرار نشد') }
    finally { setSearching(false) }
  }
  return <div className="ds-studio">
    <header className="ds-hero"><div><span className="sa-eyebrow">صفحه، قالب و تجربهٔ کاربر</span><h1>استودیوی طراحی</h1><p>با همان بلوک‌ها، داده‌های زنده و پیش‌نمایش تمام‌صفحه طراحی کنید؛ قالب جدید را ابتدا به‌صورت پیش‌نویس بسازید و پس از بررسی منتشر کنید</p></div><div className="ds-actions"><Link className="btn btn-primary" href="/admin/theme-builder">قالب‌ها و شرط‌های نمایش</Link><Link className="btn btn-ghost" href="/admin/homepage">طرح صفحهٔ اول</Link></div></header>
    {assistant && <p className="card" role="status">درخواست طراحی در همین تب تا ۱۰ دقیقه نگه داشته می‌شود. یک طرح بسازید یا محتوای موردنظر را انتخاب کنید؛ متن در دستیار صفحه‌ساز آمادهٔ بررسی خواهد بود.</p>}
    {error && <p role="alert" className="error-text">{error}</p>}
    {loading ? <p role="status">در حال دریافت فضای طراحی…</p> : <>
      <section aria-labelledby="ds-start"><h2 id="ds-start">از کجا شروع می‌کنید؟</h2><div className="ds-grid">{([{type:'page',title:'صفحه و لندینگ',icon:'grid',text:'صفحهٔ آزاد، خانه یا بخش اختصاصی'}, {type:'header',title:'هدر',icon:'menu',text:'منو، برند و سربرگ مستقل'}, {type:'footer',title:'فوتر',icon:'grid',text:'پاورقی مستقل با شرط نمایش'}, {type:'single-post',title:'قالب نوشته',icon:'file',text:'یک نوشته، دسته یا همهٔ نوشته‌ها'}, {type:'single-product',title:'قالب محصول',icon:'bag',text:'محصول مشخص، دسته یا نوع محصول'}] as const).filter(item=>allowed.includes(item.type)).map(item=><article className="ds-card" key={item.type}><Icon name={item.icon} size={20}/><h3>{item.title}</h3><p>{item.text}</p><button type="button" className="btn btn-ghost" disabled={!!busy} onClick={()=>void create(item.type)}>ساخت {item.title}</button></article>)}</div></section>
      {allowed.includes('surface') && <section aria-labelledby="ds-surfaces"><h2 id="ds-surfaces">بخش‌های تخصصی و پیشخوان کاربر</h2><p className="muted">طرح هر بخش می‌تواند عمومی یا مخصوص شناسهٔ یک محتوا باشد؛ داده و دسترسی با همان بخش می‌ماند</p><div className="ds-grid">{BUILDER_SURFACES.map(surface=><article className="ds-card" key={surface}><Icon name={surface==='dashboard'?'grid':'file'} size={20}/><h3>{SURFACE_LABELS[surface]}</h3><p>{surface==='dashboard'?'چیدمان کارت‌های واقعی و خصوصی هر کاربر':'عنوان و تصویر پویا همراه محتوای اصلی بخش'}</p><button type="button" className="btn btn-ghost" disabled={!!busy} onClick={()=>void create('surface',surface)}>طراحی {SURFACE_LABELS[surface]}</button></article>)}</div></section>}
      <section className="ds-targets" aria-labelledby="ds-entry"><h2 id="ds-entry">طراحی یک صفحه یا محتوای مشخص</h2><form onSubmit={event=>{event.preventDefault();void search()}}><label>نوع محتوا<select className="input" value={kind} onChange={event=>{setKind(event.target.value);setTargets([])}}><option value="page">صفحه</option><option value="post">نوشته</option><option value="product">محصول</option></select></label><label>نام محتوا<input className="input" type="search" maxLength={80} value={query} onChange={event=>setQuery(event.target.value)}/></label><button type="submit" className="btn btn-primary" disabled={searching}>{searching?'در حال جست‌وجو…':'نمایش محتواها'}</button></form><ul>{targets.map(target=><li key={target.pageId}><span>{target.title}</span><Link className="btn btn-ghost btn-sm" href={`/admin/builder/${target.pageId}`}>طراحی این مورد</Link></li>)}</ul></section>
      {!!templates.length && <section><h2>طرح‌های شما</h2><div className="ds-recent">{templates.slice(0,12).map(template=><Link href={`/admin/builder/${template.id}`} key={template.id}><b>{template.name}</b><span>{template.status==='published'?'منتشرشده':'پیش‌نویس'}{template.surface?` · ${SURFACE_LABELS[template.surface]}`:''}</span><Icon name="arrow" size={16}/></Link>)}</div></section>}
      <footer className="ds-foot"><p>کیت سراسری، استایل و افکت، چیدمان موبایل و تبلت، تاریخچه و دستیار طراحی در محیط ویرایش در دسترس‌اند</p><Link href="/admin/studio">هویت و تنظیمات ظاهر سایت</Link></footer>
    </>}
  </div>
}
export default function Page() { return <Suspense fallback={<p role="status">در حال دریافت استودیو…</p>}><DesignStudio /></Suspense> }
