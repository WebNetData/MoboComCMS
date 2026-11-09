'use client'
import { useEffect, useRef, useState } from 'react'
import { pageTurns, type PageAssistantView, type PageTarget, type PageTurn } from '@/modules/ai/domain/page-assistant'

type Reply = PageTurn & { id: number }
export default function PageAssistant({ path, target, onUseInstruction }: { path: string; target: PageTarget | null; onUseInstruction?: (text: string) => void }) {
  const [view, setView] = useState<PageAssistantView | null>(null), [question, setQuestion] = useState(''), [selectedText, setSelectedText] = useState(''), [includeRecord, setIncludeRecord] = useState(false)
  const [turns, setTurns] = useState<Reply[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [model, setModel] = useState('')
  const [reload, setReload] = useState(0)
  const request = useRef<AbortController | null>(null), running = useRef(false), sequence = useRef(0), latestInstruction = useRef('')
  useEffect(() => {
    const controller = new AbortController()
    const query = new URLSearchParams({ path, ...(target ? { kind: target.kind, id: String(target.id) } : {}) })
    async function load() {
      try { const response = await fetch(`/api/admin/ai/context?${query}`, { cache: 'no-store', signal: controller.signal }); const body = await response.json(); if (!response.ok) throw Error(body.error || 'دریافت راهنمای صفحه انجام نشد'); if (!controller.signal.aborted) setView(body) }
      catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'دریافت راهنمای صفحه انجام نشد') }
    }
    void load()
    return () => { controller.abort(); request.current?.abort() }
  }, [path, target?.kind, target?.id, reload])
  async function ask() {
    if (running.current || !view || question.trim().length < 3) return
    running.current = true; setBusy(true); setError(''); setNotice('')
    const controller = new AbortController(); request.current = controller
    const text = question.trim()
    try {
      const response = await fetch('/api/admin/ai/context', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, target: view.target, expectedActorId: view.actorId, instruction: text, selectedText, includeRecord, turns: pageTurns(turns) }), signal: controller.signal })
      const body = await response.json()
      if (!response.ok) { if ([403, 404, 409, 423].includes(response.status)) { setTurns([]); setQuestion(''); setSelectedText(''); setIncludeRecord(false); setView(null) } throw Error(body.error || 'پاسخ دریافت نشد؛ درخواست خودکار تکرار نشد') }
      if (controller.signal.aborted) return
      if (typeof body.reply !== 'string' || !body.reply.trim() || body.context?.path !== path || body.context?.actorId !== view.actorId) throw Error('قالب پاسخ معتبر نبود؛ درخواست خودکار تکرار نشد')
      const userTurn: Reply = { id: ++sequence.current, role: 'user', text }, answerTurn: Reply = { id: ++sequence.current, role: 'assistant', text: body.reply }
      setTurns(current => [...current, userTurn, answerTurn].slice(-8)); setNotice('پاسخ آماده شد؛ متن پیشنهادی را بررسی کنید')
      setModel(`${body.provider} · ${body.model}`); setQuestion(''); latestInstruction.current = `${text}${body.context.target ? `\n\nمورد انتخابی: ${body.context.recordLabel} (شناسه ${body.context.target.id})` : ''}`
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'پاسخ دریافت نشد؛ درخواست خودکار تکرار نشد') }
    finally { running.current = false; if (!controller.signal.aborted) setBusy(false) }
  }
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setNotice('پاسخ کپی شد؛ پیش از استفاده، آن را بررسی کنید') }
    catch { setNotice('کپی خودکار ممکن نشد؛ متن پاسخ را انتخاب و کپی کنید') }
  }
  return <section className="ai-page-assistant" aria-label="گفتگو دربارهٔ صفحهٔ فعلی" aria-busy={busy}>
    {view ? <div className="ai-page-context"><strong>{view.label}</strong><bdi>{view.path}</bdi><p>{view.recordLabel || 'مورد ذخیره‌شده‌ای انتخاب نشده است؛ می‌توانید متن موردنظر را خودتان اضافه کنید.'}</p></div> : !error && <p role="status">در حال دریافت زمینهٔ صفحه…</p>}
    <p className="muted">پاسخ‌ها راهنما و پیشنهادند؛ هیچ تغییری خودکار ذخیره یا اجرا نمی‌شود. ویرایش‌های ذخیره‌نشده و اطلاعات فرم‌ها خوانده نمی‌شوند.</p>
    {view && !turns.length && <div className="ai-page-examples" aria-label="درخواست‌های پیشنهادی">{view.examples.map(example => <button key={example} type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setQuestion(example)}>{example}</button>)}</div>}
    {turns.length > 0 && <ol className="ai-page-turns" tabIndex={0} aria-label="تاریخچهٔ همین گفتگو">{turns.map(turn => <li key={turn.id} className={`ai-page-turn is-${turn.role}`}><strong>{turn.role === 'user' ? 'شما' : 'دستیار موبوکام'}</strong><p dir="auto">{turn.text}</p>{turn.role === 'assistant' && <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copy(turn.text)}>کپی پاسخ</button>}</li>)}</ol>}
    {busy && <p role="status">در حال آماده‌کردن پاسخ… بستن پنجره، انتظار شما را قطع می‌کند؛ ممکن است سرویس همچنان درخواست را کامل کند.</p>}
    {error && <p role="alert" className="error-text">{error}</p>}
    {!view && error && <button type="button" className="btn btn-ghost" onClick={() => { setError(''); setReload(n => n + 1) }}>دریافت دوبارهٔ راهنمای صفحه</button>}
    {notice && <p role="status">{notice}</p>}
    {model && <p className="muted">سرویس این پاسخ: <bdi>{model}</bdi></p>}
    <form className="ai-page-compose" onSubmit={e => { e.preventDefault(); void ask() }}>
      <label className="studio-field"><span>درخواست یا سؤال بعدی</span><textarea className="input" rows={3} maxLength={2000} value={question} disabled={!view || busy} onChange={e => setQuestion(e.target.value)} placeholder="مثلاً این مطلب را برای انتشار بررسی کن و نکات لازم را بگو." aria-describedby="ai-page-privacy" /></label>
      <label className="studio-switch"><input type="checkbox" checked={includeRecord} disabled={!view?.target || busy} onChange={e => setIncludeRecord(e.target.checked)} />اطلاعات ذخیره‌شدهٔ مورد انتخابی برای همین گفتگو به مدل فرستاده شود</label>
      <details><summary>افزودن متن دلخواه برای بررسی</summary><label className="studio-field"><span>متن انتخابی شما؛ حداکثر ۴۰۰۰ نویسه</span><textarea className="input" rows={4} maxLength={4000} value={selectedText} disabled={busy} onChange={e => setSelectedText(e.target.value)} /></label></details>
      <p id="ai-page-privacy" className="muted">فقط درخواست، تاریخچهٔ همین گفتگو و داده‌ای که انتخاب کرده‌اید به سرویس تنظیم‌شدهٔ این بخش ارسال می‌شود. رمز، کلید یا اطلاعات خصوصی کاربران را وارد نکنید. با بستن دستیار یا تغییر صفحه، مورد یا حساب، گفتگو پاک می‌شود.</p>
      <div className="ai-page-actions"><button type="submit" className="btn btn-primary" disabled={!view || busy || question.trim().length < 3}>{busy ? 'در حال پاسخ…' : 'دریافت پاسخ'}</button><button type="button" className="btn btn-ghost" disabled={busy || !turns.length} onClick={() => { setTurns([]); setModel(''); setNotice(''); setError(''); latestInstruction.current = '' }}>گفتگوی تازه</button>{turns.length > 0 && onUseInstruction && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => onUseInstruction(latestInstruction.current)}>بررسی درخواست در ابزارهای اجرایی</button>}</div>
    </form>
  </section>
}
