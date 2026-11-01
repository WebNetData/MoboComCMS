'use client'
import { useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import { useRouter } from '@/platform/routing/navigation'
import { KIND_LABEL, PROMPT_KINDS } from '@/modules/prompts/domain/prompts'
import TemplateEditor from './TemplateEditor'
import { NEW_TEMPLATE, TEMPLATE_STATUS, type EditableTemplate } from './admin-model'
import TemplateList from './TemplateList'
import TemplateWorkflow from './TemplateWorkflow'
import { promptRequest } from './browser'
import s from './PromptMaster.module.css'
type AdminData = { templates: (EditableTemplate & { id: number; version: number })[]; total: number; pages: number; page: number; q: string; kind: string; canConfigure: boolean; canTeam: boolean; canManage: boolean; mine: boolean; reviewAuthors: boolean; counts: Record<string, number> }
export default function PromptManager({ query, categories, editId }: { query: string; categories: { code: string; name: string }[]; editId: string }) {
  const router = useRouter(), [data, setData] = useState<AdminData | null>(null), [revision, setRevision] = useState(0), [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<EditableTemplate | null>(null), [remove, setRemove] = useState<EditableTemplate | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  useEffect(() => {
    if (!editId) return
    const controller = new AbortController()
    promptRequest<{ template: EditableTemplate }>('/api/admin/prompts?id=' + encodeURIComponent(editId), undefined, controller.signal).then(data => setEditing(data.template)).catch(error => { if (!controller.signal.aborted) setError(error.message) })
    return () => controller.abort()
  }, [editId])
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('')
    promptRequest<AdminData>('/api/admin/prompts?' + query, undefined, controller.signal).then(setData).catch(e => { if (!controller.signal.aborted) setError(e.message) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [query, revision])
  function search(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const params = new URLSearchParams()
    for (const [key, value] of new FormData(e.currentTarget).entries()) if (typeof value === 'string' && value) params.set(key, value)
    router.push('/admin/prompts?' + params)
  }
  async function confirmDelete() {
    if (!remove || busy) return
    setBusy(true); setError('')
    try { await promptRequest('/api/admin/prompts', { action: 'delete', id: remove.id, version: remove.version }); setRemove(null); setRevision(v => v + 1); setNotice(data?.mine ? 'درخواست حذف ثبت شد؛ مدیر می‌تواند الگو را بازگرداند یا حذف نهایی کند' : 'الگو حذف شد؛ خروجی‌های خصوصی قبلی کاربران حفظ شدند') }
    catch(e) { setError(e instanceof Error ? e.message : 'حذف انجام نشد') } finally { setBusy(false) }
  }
  async function restore(entry: EditableTemplate) {
    if (busy) return; setBusy(true); setError('')
    try { await promptRequest('/api/admin/prompts', { action: 'restore', id: entry.id, version: entry.version }); setRevision(v => v + 1); setNotice('الگو به وضعیت قبلی بازگشت') } catch (e) { setError(e instanceof Error ? e.message : 'بازگردانی انجام نشد') } finally { setBusy(false) }
  }
  const statusHref = (status: string) => { const p = new URLSearchParams(query); p.set('status', status); p.delete('page'); return '/admin/prompts?' + p }
  const pageHref = (page: number) => { const p = new URLSearchParams(query); p.set('page', String(page)); return '/admin/prompts?' + p }
  return <div className={s.admin} dir="rtl" data-testid="prompt-admin">
    <header className={s.adminTitle}><div><span className={s.adminEyebrow}><Icon name="sparkles" size={16}/>کارگاه پرامپت مستر</span><h1>{data?.mine ? 'الگوهای من' : 'کتابخانه و انتشار'}</h1><p>{data?.mine ? 'ایده را بساز، نمونه را اضافه کن و برای انتشار آماده‌اش کن.' : 'الگوها، نمونه‌های خروجی و کار نویسندگان را در یک فضای منظم مدیریت کن.'}</p></div><div className={s.historyButtons}><Link href="/prompts" className={s.secondary}><Icon name="eye" size={17} />دیدن استودیو</Link><button type="button" className={s.primary} onClick={() => { setEditing({ ...NEW_TEMPLATE }); setNotice('') }}><Icon name="plus" size={17} />الگوی جدید</button></div></header>
    <nav className={s.historyButtons} aria-label="مدیریت پرامپت مستر">{data?.canManage&&<Link className={s.secondary} href="/admin/prompts/categories">دسته‌های کتابخانه</Link>}{data?.canTeam&&<Link className={s.secondary} href="/admin/section-managers">مدیر و نویسندهٔ این بخش</Link>}{data?.canConfigure && <><Link href="/admin/sections/prompt-master" className={s.secondary}>تنظیمات، متن‌ها و محدودیت مصرف</Link><Link href="/admin/ai" className={s.secondary}>اتصال سرویس هوش مصنوعی</Link></>}<button type="button" className={s.secondary} onClick={() => setRevision(v => v + 1)}>تازه‌کردن فهرست</button></nav>
    <TemplateWorkflow data={data} query={query} statusHref={statusHref}/>
    <p className={s.feedback} role="status">{notice}</p>
    {editing && <TemplateEditor key={`${editing.id || 'new'}:${editing.version || 0}`} initial={editing} categories={categories} canManage={data?.canManage===true} reviewAuthors={data?.reviewAuthors!==false} cancel={() => setEditing(null)} done={() => { setEditing(null); setRevision(v => v + 1); setNotice('الگو ذخیره شد') }} />}
    <form className={s.filters} onSubmit={search}><label className={s.field}>جست‌وجوی الگو<input name="q" defaultValue={new URLSearchParams(query).get('q') || ''} maxLength={100} type="search" /></label><label className={s.field}>نوع<select name="kind" defaultValue={new URLSearchParams(query).get('kind') || ''}><option value="">همه</option>{PROMPT_KINDS.map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></label><label className={s.field}>وضعیت<select name="status" defaultValue={new URLSearchParams(query).get('status') || ''}><option value="">همه</option>{Object.entries(TEMPLATE_STATUS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><button className={s.primary} type="submit">نمایش</button></form>
    {error && <div className={s.error} role="alert">{error}<button type="button" className={s.secondary} onClick={() => setRevision(v => v + 1)}>دریافت دوبارهٔ فهرست</button></div>}
    {remove && <div className={s.error} role="alert"><span>{data?.mine?'الگوی «'+remove.title+'» برای تصمیم مدیر به سطل زباله فرستاده شود؟':'الگوی «'+remove.title+'» برای همیشه حذف شود؟ پرامپت‌های ساخته‌شدهٔ کاربران حذف نمی‌شوند.'}</span><button className={s.secondary} type="button" onClick={() => setRemove(null)} disabled={busy}>انصراف</button><button className={s.primary} type="button" onClick={confirmDelete} disabled={busy}>{data?.mine?'ارسال به سطل زباله':'حذف قطعی الگو'}</button></div>}
    <div aria-busy={loading}>{loading ? <p role="status">در حال دریافت الگوها…</p> : !data?.templates.length && !error ? <div className={s.empty}><Icon name="layers" size={30} /><h2>الگویی در این فهرست نیست</h2><p>فیلترها را تغییر دهید یا یک الگوی جدید بسازید.</p></div> : data && !error && <TemplateList entries={data.templates} categories={categories} canManage={data.canManage} reviewAuthors={data.reviewAuthors} busy={busy} edit={entry=>{setEditing(entry);setError('');setNotice('')}} remove={setRemove} restore={restore}/>}</div>
    {data && data.pages > 1 && <nav className={s.pagination} aria-label="صفحه‌بندی مدیریت الگوها">{data.page > 1 && <Link className={s.secondary} href={pageHref(data.page - 1)}>صفحهٔ قبل</Link>}<span>{data.page.toLocaleString('fa-IR')} از {data.pages.toLocaleString('fa-IR')}</span>{data.page < data.pages && <Link className={s.secondary} href={pageHref(data.page + 1)}>صفحهٔ بعد</Link>}</nav>}
  </div>
}
