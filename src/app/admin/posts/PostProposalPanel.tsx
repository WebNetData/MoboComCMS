'use client'

import { useId, useState } from 'react'
import { useI18n } from '@/i18n/LocaleProvider'

export type Proposal = { changes: Record<string, unknown>; at: string; stale: boolean }

const LABELS: Record<string, [string, string]> = {
  title: ['عنوان', 'Title'], titleEn: ['عنوان انگلیسی', 'English title'], excerpt: ['خلاصه', 'Excerpt'], excerptEn: ['خلاصهٔ انگلیسی', 'English excerpt'],
  content: ['متن', 'Body'], contentEn: ['متن انگلیسی', 'English body'], cover: ['تصویر شاخص', 'Featured image'], categoryIds: ['دسته‌ها', 'Categories'],
}
const plain = (html: unknown) => String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
const clip = (text: string, size = 220) => (text.length > size ? `${text.slice(0, size)}…` : text || '—')

/**
 * An author's proposed edit of their published article, as the manager decides it: each proposed field beside what is
 * live now, a warning when the live article changed after the proposal, then apply it or set it aside with a note.
 */
export function PostProposalPanel({ id, proposal, live, categoryName }: { id: number; proposal: Proposal; live: Record<string, any>; categoryName: (id: string) => string }) {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const L = (persian: string, english: string) => (fa ? persian : english)
  const noteId = useId()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const shown = (field: string, value: unknown) => {
    if (field === 'categoryIds') return (Array.isArray(value) ? value : []).map((item) => categoryName(String(item))).join('، ') || '—'
    if (field === 'cover') return value ? <img src={String(value)} alt="" loading="lazy" /> : '—'
    return clip(field.startsWith('content') ? plain(value) : String(value ?? ''))
  }

  async function decide(decision: 'apply' | 'reject') {
    if (decision === 'apply' && !window.confirm(L('تغییرات پیشنهادی روی نوشتهٔ منتشرشده اعمال شود؟', 'Apply the proposed changes to the published article?'))) return
    setBusy(decision); setError('')
    try {
      const response = await fetch('/api/admin/cms?type=posts', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, proposalDecision: decision, proposalAt: proposal.at, ...(decision === 'reject' && note.trim() ? { note: note.trim() } : {}) }) })
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || L('ثبت تصمیم ممکن نشد', 'The decision was not saved'))
      window.location.assign('/admin/posts?state=proposed')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
      setBusy('')
    }
  }

  return <section className="post-review-panel post-proposal-panel" aria-labelledby={`${noteId}-title`}>
    <h3 id={`${noteId}-title`}>{L('پیشنهاد ویرایش نویسنده', 'Author\'s proposed edit')}</h3>
    <p className="muted text-sm">{L('نویسنده برای این نوشتهٔ منتشرشده تغییراتی پیشنهاد کرده است. تا اعمال نشود، سایت همین نسخه را نشان می‌دهد.', 'The author proposed changes to this published article. The site shows the live version until they are applied.')}</p>
    {proposal.stale && <p className="post-proposal-stale" role="note">{L('نوشته بعد از این پیشنهاد تغییر کرده است؛ اعمال، فقط همین فیلدها را جایگزین می‌کند.', 'The article changed after this proposal; applying replaces these fields only.')}</p>}
    <dl className="post-proposal-diff">
      {Object.entries(proposal.changes).map(([field, value]) => <div key={field}>
        <dt>{L(...(LABELS[field] || [field, field]))}</dt>
        <dd><span className="is-live"><small>{L('اکنون', 'Now')}</small>{shown(field, live[field])}</span><span className="is-proposed"><small>{L('پیشنهاد', 'Proposed')}</small>{shown(field, value)}</span></dd>
      </div>)}
    </dl>
    <label className="label" htmlFor={noteId}>{L('یادداشت برای نویسنده (اگر رد می‌کنید)', 'Note to the author (when setting it aside)')}</label>
    <textarea id={noteId} className="input" rows={3} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} />
    {error && <p className="error-text" role="alert">{error}</p>}
    <div className="post-review-actions">
      <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => void decide('apply')}>{busy === 'apply' ? L('در حال اعمال…', 'Applying…') : L('اعمال پیشنهاد', 'Apply')}</button>
      <button type="button" className="btn btn-ghost" disabled={!!busy} onClick={() => void decide('reject')}>{busy === 'reject' ? L('در حال ثبت…', 'Saving…') : L('رد پیشنهاد', 'Set aside')}</button>
    </div>
  </section>
}

/** What an author sees on their published article while review is on: a save is a proposal, and one may be waiting. */
export function PostProposalNotice({ proposal }: { proposal?: Proposal | null }) {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const L = (persian: string, english: string) => (fa ? persian : english)
  const waiting = proposal?.changes && Object.keys(proposal.changes).length > 0
  return <section className="post-review-panel" role="note">
    <h3>{L('نوشتهٔ منتشرشده', 'Published article')}</h3>
    <p className="muted text-sm">{L('تغییرات شما به‌صورت پیشنهاد برای سردبیر فرستاده می‌شود و تا تأیید او، نسخهٔ روی سایت عوض نمی‌شود. وضعیت، زمان انتشار و نشانی را سردبیر تعیین می‌کند.', 'Your changes go to the editor as a proposal; the live version stays until they are applied. Status, publication time and address are the editor\'s.')}</p>
    {waiting && <p className="text-sm">{L('یک پیشنهاد شما در انتظار تصمیم سردبیر است؛ ذخیرهٔ تازه جایگزینش می‌کند.', 'A proposal of yours is waiting for the editor; a new save replaces it.')}</p>}
  </section>
}
