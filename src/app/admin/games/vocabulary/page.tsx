'use client'

import { useState } from 'react'
import { GamesShell, Notice, fa, send, useJson } from '../shared'
import { LIST_META, VOCABULARY_LISTS, type VocabularyEntry, type VocabularyList } from '@/modules/games/domain/vocabulary'

type Row = VocabularyEntry & { games: number }
type Draft = { id: number | null; code: string; name: string; nameEn: string; icon: string; sortOrder: string; active: boolean }
const API = '/api/admin/games/vocabulary'
const EMPTY: Draft = { id: null, code: '', name: '', nameEn: '', icon: '', sortOrder: '0', active: true }

/** The owner's lists for games: platforms, official stores, play modes and Persian localisations. */
export default function GameVocabularyAdmin() {
  const { data, error, loading, reload } = useJson<{ lists: Record<VocabularyList, Row[]> }>(API)
  const [list, setList] = useState<VocabularyList>('PLATFORM')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const rows = data?.lists[list] || []
  const meta = LIST_META[list]
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => (current ? { ...current, [key]: value } : current))
  const run = async (work: () => ReturnType<typeof send>, done: string) => {
    setBusy(true); setMessage(null)
    let result: Awaited<ReturnType<typeof send>>
    try { result = await work() } finally { setBusy(false) }
    if (!result.ok) { setMessage({ tone: 'error', text: result.error }); return false }
    setMessage({ tone: 'ok', text: done }); await reload(); return true
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!draft) return
    const { id, code, sortOrder, ...rest } = draft
    const body = { ...rest, sortOrder: Number(sortOrder) || 0, ...(id ? { id } : { list, code }) }
    if (await run(() => send(API, id ? 'PATCH' : 'POST', body), id ? 'تغییرات ذخیره شد.' : `«${draft.name || draft.code}» به ${meta.title} اضافه شد.`)) setDraft(null)
  }

  return <GamesShell title="پلتفرم‌ها، فروشگاه‌ها و فهرست‌ها" actions={<button type="button" className="btn btn-primary" disabled={busy} onClick={() => { setDraft({ ...EMPTY, sortOrder: String(rows.length) }); setMessage(null) }}>+ {meta.one} تازه</button>}>
    <p className="cf-intro">فهرست‌هایی که در فرم بازی و فیلترهای سایت دیده می‌شوند. کد هر مورد همان چیزی است که روی بازی ذخیره می‌شود و بعد از ساخت ثابت می‌ماند؛ نام، نماد، ترتیب و فعال بودنش را هر وقت بخواهید عوض کنید. موردی را که بازی دارد حذف نکنید، غیرفعالش کنید.</p>
    <nav className="cf-tabs" aria-label="فهرست‌ها">{VOCABULARY_LISTS.map((item) => <button key={item} type="button" className={item === list ? 'is-active' : ''} aria-pressed={item === list} onClick={() => { setList(item); setDraft(null); setMessage(null) }}>
      {LIST_META[item].title}<span>{fa(data?.lists[item]?.length ?? 0)}</span>
    </button>)}</nav>
    <p className="cf-where">{meta.hint}</p>
    {message && <Notice tone={message.tone}>{message.text}</Notice>}
    {error && <Notice tone="error">{error}</Notice>}

    {draft && <form className="cf-editor" onSubmit={save} aria-label={draft.id ? `ویرایش ${meta.one}` : `${meta.one} تازه`}>
      <header><h2>{draft.id ? `ویرایش «${draft.name}»` : `${meta.one} تازه در ${meta.title}`}</h2></header>
      <div className="cf-fields">
        <label className="sa-field"><span>کد {draft.id ? '(ثابت)' : ''}</span><input className="input" dir="ltr" required={!draft.id} disabled={!!draft.id} maxLength={40} value={draft.code} onChange={(e) => set('code', e.target.value)} placeholder={meta.example} /><small>{meta.codeHint}</small></label>
        <label className="sa-field"><span>نام نمایشی</span><input className="input" maxLength={60} value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder={list === 'PLATFORM' || list === 'STORE' ? 'خالی = همان کد' : 'دوبلهٔ صوتی فارسی'} /></label>
        <label className="sa-field"><span>نام انگلیسی</span><input className="input" dir="ltr" maxLength={60} value={draft.nameEn} onChange={(e) => set('nameEn', e.target.value)} /></label>
        <label className="sa-field"><span>نماد (ایموجی، اختیاری)</span><input className="input" maxLength={8} value={draft.icon} onChange={(e) => set('icon', e.target.value)} /></label>
        <label className="sa-field"><span>ترتیب</span><input className="input" type="number" min={-9999} max={9999} value={draft.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} /></label>
      </div>
      <label className="sa-check"><input type="checkbox" checked={draft.active} onChange={(e) => set('active', e.target.checked)} />فعال: در فرم بازی و فیلترهای سایت پیشنهاد شود</label>
      <div className="cf-actions"><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'در حال ذخیره…' : draft.id ? 'ذخیرهٔ تغییرات' : 'افزودن'}</button><button type="button" className="btn btn-ghost" onClick={() => setDraft(null)}>انصراف</button></div>
    </form>}

    {loading && !data ? <div className="sa-skeleton" aria-busy="true" /> : rows.length === 0 ? <p className="mx-links-empty">هنوز موردی در {meta.title} نیست.</p> : <ul className="cf-list">
      {rows.map((row) => <li key={row.id} className={row.active ? '' : 'is-off'}>
        <span className="cf-icon" aria-hidden="true">{row.icon || meta.icon}</span>
        <div className="cf-main">
          <strong>{row.name}{row.nameEn && row.nameEn !== row.name && <small dir="ltr">{row.nameEn}</small>}</strong>
          <span className="cf-meta"><code dir="ltr">{row.code}</code><span>{fa(row.games)} بازی</span>{!row.active && <span className="cf-badge is-off">غیرفعال</span>}</span>
        </div>
        <div className="cf-tools">
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { setDraft({ id: row.id, code: row.code, name: row.name, nameEn: row.nameEn, icon: row.icon, sortOrder: String(row.sortOrder), active: row.active }); setMessage(null) }}>ویرایش</button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void run(() => send(API, 'PATCH', { id: row.id, active: !row.active }), row.active ? `«${row.name}» غیرفعال شد.` : `«${row.name}» فعال شد.`)}>{row.active ? 'غیرفعال کن' : 'فعال کن'}</button>
          <button type="button" className="btn btn-ghost btn-sm is-danger" disabled={busy || row.games > 0} title={row.games ? 'موردی که بازی دارد حذف نمی‌شود؛ غیرفعالش کنید' : undefined} onClick={() => { if (window.confirm(`«${row.name}» حذف شود؟`)) void run(() => send(`${API}?id=${row.id}`, 'DELETE'), `«${row.name}» حذف شد.`) }}>حذف</button>
        </div>
      </li>)}
    </ul>}
  </GamesShell>
}
