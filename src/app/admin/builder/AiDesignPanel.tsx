'use client'

import { useRef, useState } from 'react'
import Link from '@/components/AppLink'
import { designStillCurrent } from '@/modules/site/domain/builder-design'
import { cloneSections, type BuilderDoc } from '@/modules/site/domain/builder'

export default function AiDesignPanel({ pageId, doc, apply, close, initialInstruction = '' }: {
  pageId: string; doc: BuilderDoc; apply: (doc: BuilderDoc) => void; close: () => void; initialInstruction?: string
}) {
  const [instruction, setInstruction] = useState(initialInstruction), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [proposal, setProposal] = useState<{ doc: BuilderDoc; base: string; model: string } | null>(null)
  const [replace, setReplace] = useState(false), pending = useRef(false)
  async function generate() {
    if (pending.current) return
    pending.current = true; setBusy(true); setError(''); setProposal(null)
    const base = JSON.stringify(doc)
    try {
      const response = await fetch('/api/admin/builder/design', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pageId, instruction }) })
      const body = await response.json().catch(() => null)
      if (!response.ok || !body?.doc) throw new Error(body?.error || 'پیشنهاد دریافت نشد')
      setProposal({ doc: body.doc, base, model: body.model })
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'ارتباط برقرار نشد') }
    finally { pending.current = false; setBusy(false) }
  }
  const current = !!proposal && designStillCurrent(proposal.base, doc)
  return <section className="bld-ai-panel" aria-label="دستیار طراحی">
    <header><div><h2>دستیار طراحی</h2><p>پیشنهاد اختیاری؛ اعمال روی پیش‌نویس و انتشار با شماست</p></div><button type="button" className="btn btn-ghost btn-sm" onClick={close} aria-label="بستن دستیار طراحی">بستن</button></header>
    <form onSubmit={event => { event.preventDefault(); void generate() }}>
      <label>چه طرحی می‌خواهید؟<textarea className="input" rows={5} minLength={8} maxLength={3000} required value={instruction} disabled={busy} onChange={event => setInstruction(event.target.value)} placeholder="بخش‌ها، مخاطب، سبک و اطلاعات واقعی موردنیاز را بنویسید" /></label>
      <p>فقط توضیح شما و ساختار بلوک‌ها ارسال می‌شود؛ رمز، کلید و اطلاعات خصوصی کاربران ننویسید</p>
      <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'در حال طراحی…' : 'ساخت پیشنهاد طراحی'}</button>
    </form>
    {error && <p role="alert" className="error-text">{error}</p>}
    {proposal && <div className="bld-ai-proposal"><h3>طرح پیشنهادی</h3><p>{proposal.doc.sections.length.toLocaleString('fa-IR')} بخش · {proposal.model}</p><ol>{proposal.doc.sections.map(section => <li key={section.id}>{section.columns.flatMap(column => column.widgets).map(widget => widget.props.title || widget.props.text || widget.type).join('، ').slice(0, 180)}</li>)}</ol>
      {!current && <p role="alert">صفحه از زمان درخواست تغییر کرده است؛ برای حفظ ویرایش‌ها پیشنهاد تازه بگیرید</p>}
      <label className="bld-ai-check"><input type="checkbox" checked={replace} onChange={event => setReplace(event.target.checked)} />پیشنهاد جایگزین بخش‌های فعلی شود؛ بازگردانی ممکن است</label>
      <button type="button" className="btn btn-primary" disabled={!current || busy} onClick={() => { if (!proposal || !designStillCurrent(proposal.base, doc)) return; apply({ ...doc, sections: replace ? cloneSections(proposal.doc.sections) : [...doc.sections, ...cloneSections(proposal.doc.sections)] }); setProposal(null) }}>اعمال روی پیش‌نویس</button>
    </div>}
    <p className="muted"><Link href="/admin/ai">مدل و اتصال دستیار طراحی</Link> · هیچ تغییری خودکار ذخیره یا منتشر نمی‌شود</p>
  </section>
}
