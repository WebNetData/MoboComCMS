'use client'
import { useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import { isKind, KIND_LABEL } from '@/modules/prompts/domain/prompts'
import { copyPrompt, downloadPrompt, promptRequest } from './browser'
import s from './PromptMaster.module.css'
import { memberListsChanged } from '@/components/engage/member-list-events'
import { useMemberLibraryRevision } from '@/components/engage/MemberLibrarySync'
type HistoryItem = { id: number; title: string; output: string; pinned: boolean; kind: string; engine: string; version: number; createdAt: string }
type HistoryData = { items: HistoryItem[]; total: number; page: number; pages: number }
const historyDate = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' })
export default function PromptHistory({ initialPinned = false }: { initialPinned?: boolean }) {
  const libraryRevision = useMemberLibraryRevision()
  const [data, setData] = useState<HistoryData | null>(null), [query, setQuery] = useState(''), [page, setPage] = useState(1), [pinned, setPinned] = useState(initialPinned), [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState(''), [remove, setRemove] = useState<number | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError('')
    promptRequest<HistoryData>('/api/prompts/history?' + new URLSearchParams({ q: query, page: String(page), pinned: String(pinned) }), undefined, controller.signal).then(setData).catch(e => { if (!controller.signal.aborted) setError(e.message) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [query, page, pinned, revision, libraryRevision])
  async function mutate(item: HistoryItem, action: 'pin' | 'delete') {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try { await promptRequest('/api/prompts/history', { action, id: item.id, version: item.version, pinned: !item.pinned }); setRemove(null); memberListsChanged('prompt-history'); setNotice(action === 'delete' ? 'خروجی از تاریخچه حذف شد' : item.pinned ? 'خروجی از نگه‌داری دائمی خارج شد' : 'خروجی نگه‌داری شد') }
    catch(e) { setError(e instanceof Error ? e.message : 'عملیات انجام نشد') } finally { setBusy(false) }
  }
  async function copy(text: string) { try { await copyPrompt(text); setNotice('پرامپت کپی شد') } catch(e) { setError(e instanceof Error ? e.message : 'کپی انجام نشد') } }
  return <div className={s.historyScope}>
    <form className={s.filters} onSubmit={e => { e.preventDefault(); setQuery(String(new FormData(e.currentTarget).get('q') || '')); setPage(1) }}><label className={s.field}>جست‌وجو در تاریخچه<input type="search" name="q" defaultValue={query} maxLength={100} placeholder="عنوان ایده…" /></label><label className={s.field}>نمایش<select value={String(pinned)} onChange={e => { setPinned(e.target.value === 'true'); setPage(1) }}><option value="false">همهٔ خروجی‌ها</option><option value="true">نگه‌داری‌شده‌ها</option></select></label><button type="submit" className={s.primary}>جست‌وجو<Icon name="search" size={17} /></button></form>
    {error && <div className={s.error} role="alert">{error}<button type="button" className={s.secondary} onClick={() => setRevision(v => v + 1)}>تلاش دوباره</button></div>}
    <p className={s.feedback} role="status">{loading ? 'در حال دریافت تاریخچهٔ خصوصی…' : notice}</p>
    <div className={s.historyGrid} aria-busy={loading}>
      {!loading && !error && !data?.items.length && <div className={s.empty}><Icon name="clock" size={30} /><h2>هنوز خروجی‌ای در این فهرست نیست</h2><p>در استودیو یک پرامپت بساز و ذخیره در تاریخچه را روشن بگذار؛ یا فیلتر جست‌وجو را تغییر بده.</p><Link href="/prompts" className={s.primary}>ساخت اولین پرامپت</Link></div>}
      {!loading && !error && data?.items.map(item => <article className={s.historyCard} key={item.id}><div className={s.historyHead}><div><h2>{item.title}</h2><span className={s.historyTime}>{historyDate.format(new Date(item.createdAt))} · {isKind(item.kind) ? KIND_LABEL[item.kind] : item.kind}</span></div><span className={s.tag}>{item.pinned ? 'نگه‌داری‌شده' : item.engine === 'AI' ? 'بهبود هوشمند' : item.engine === 'EDITED' ? 'ویرایش‌شده' : 'ساختاریافته'}</span></div><pre dir="auto" tabIndex={0} aria-label="متن خروجی خصوصی پرامپت">{item.output}</pre><div className={s.historyButtons}><Link href={`/prompts?generation=${item.id}`} className={s.primary}><Icon name="file" size={16} />بازکردن و ویرایش</Link><button className={s.secondary} type="button" onClick={() => copy(item.output)}>کپی</button><button className={s.secondary} type="button" onClick={() => downloadPrompt(item.output)}>دریافت</button><button className={s.secondary} type="button" onClick={() => mutate(item, 'pin')} disabled={busy}><Icon name="bookmark" size={16} />{item.pinned ? 'آزادکردن' : 'نگه‌داری'}</button><button className={s.textButton} type="button" onClick={() => setRemove(item.id)} disabled={busy}>حذف</button></div>{remove === item.id && <div className={s.error} role="alert"><span>این خروجی از تاریخچهٔ شما حذف شود؟</span><button type="button" className={s.secondary} onClick={() => setRemove(null)}>انصراف</button><button type="button" className={s.primary} onClick={() => mutate(item, 'delete')} disabled={busy}>حذف قطعی</button></div>}</article>)}
    </div>
    {data && data.pages > 1 && <nav className={s.pagination} aria-label="صفحه‌بندی تاریخچه"><button type="button" className={s.secondary} disabled={page <= 1 || loading} onClick={() => setPage(v => v - 1)}>صفحهٔ قبل</button><span>{data.page.toLocaleString('fa-IR')} از {data.pages.toLocaleString('fa-IR')}</span><button type="button" className={s.secondary} disabled={page >= data.pages || loading} onClick={() => setPage(v => v + 1)}>صفحهٔ بعد</button></nav>}
  </div>
}
