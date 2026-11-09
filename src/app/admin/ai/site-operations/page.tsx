'use client'
import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import { useRouter } from '@/platform/routing/navigation'
import { workspaceKey } from '@/modules/ai/domain/workspace'
import { engineeringBrief, type EngineeringMode, type ErrorGroup, type OpsSummary } from '@/modules/ai/domain/site-operations'
import styles from './page.module.css'

type Report = { since: string; processStartedAt: string; total: number; counts: Record<string, number>; groups: ErrorGroup[] }
const SOURCES: Record<string, string> = { server: 'سرور', job: 'کار پس‌زمینه', mail: 'ایمیل', sms: 'پیامک', ai: 'هوش مصنوعی' }
const MODES: Record<EngineeringMode, string> = { DEVELOP: 'رفع در محیط جدا و ساخت PR', REPAIR: 'پیشنهاد بازیابی مشخص سرور', DIAGNOSE: 'عیب‌یابی با شواهد، بدون تغییر' }
const CONFIDENCE = { low: 'کم', medium: 'متوسط', high: 'زیاد' } as const
const n = (v: number) => v.toLocaleString('fa-IR')
const when = (iso: string) => new Date(iso).toLocaleString('fa-IR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function SiteOperationsPage() {
  const { data: session } = useSession(), router = useRouter()
  const [data, setData] = useState<Report | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<(OpsSummary & { model: string }) | null>(null), [summaryError, setSummaryError] = useState(''), [summarizing, setSummarizing] = useState(false)
  const load = useCallback((signal?: AbortSignal) => {
    setLoading(true); setError('')
    fetch('/api/admin/ai/site-operations', { cache: 'no-store', signal })
      .then(async r => { const body = await r.json(); if (!r.ok) throw Error(body?.error || 'گزارش دریافت نشد'); setData(body) })
      .catch(e => { if (!signal?.aborted) setError(e instanceof Error ? e.message : 'گزارش دریافت نشد') })
      .finally(() => { if (!signal?.aborted) setLoading(false) })
  }, [])
  useEffect(() => { const c = new AbortController(); load(c.signal); return () => c.abort() }, [load])

  async function summarize() {
    setSummarizing(true); setSummaryError('')
    const r = await fetch('/api/admin/ai/site-operations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'summarize' }) }).catch(() => null), body = await r?.json().catch(() => null)
    if (r?.ok) setSummary(body); else setSummaryError(body?.error || 'خلاصه ساخته نشد')
    setSummarizing(false)
  }
  /** A short-lived draft for the engineering page; the request is still written, reviewed and sent there. */
  function handOff(group: ErrorGroup, mode: EngineeringMode) {
    const actor = String((session?.user as { id?: string | number } | undefined)?.id || '')
    try { sessionStorage.setItem(workspaceKey(actor, 'engineering'), JSON.stringify({ actor, kind: 'engineering', mode, source: '/admin/ai/site-operations', instruction: engineeringBrief(group), expires: Date.now() + 10 * 60_000 })) } catch { /* the page still opens; the request can be typed */ }
    router.push('/admin/server/engineering')
  }

  const finding = (id: string) => summary?.findings.find(f => f.groupId === id)
  const top = data?.groups[0]
  return <div className={styles.page} aria-busy={loading}>
    <header className={styles.hero}>
      <span className={styles.mark} aria-hidden="true"><Icon name="activity" size={26} /></span>
      <div><p className={styles.eyebrow}>هوش مصنوعی · عملیات</p><h1>دستیار عملیات سایت</h1><p>خطاهای پرتکرار هفتهٔ اخیر، علت احتمالی و شواهد. اقدام فقط از مسیر مجاز انجام می‌شود: تنظیمات همان بخش، یا مهندسی سایت که رفع را در محیط جدا با PR انجام می‌دهد و انتشار روی سایت اصلی را فقط با تأیید شما.</p></div>
      <div className={styles.heroActions}><button type="button" className="btn btn-ghost btn-sm" disabled={loading} onClick={() => load()}>تازه‌سازی</button><button type="button" className="btn btn-primary btn-sm" disabled={summarizing || !data?.groups.length} onClick={() => void summarize()}>{summarizing ? 'در حال خلاصه…' : 'خلاصه با هوش مصنوعی'}</button></div>
    </header>
    {error && <div className="card" role="alert"><p>{error}</p></div>}
    {loading && !data && <div className={styles.skeleton} role="status" aria-label="در حال دریافت گزارش">{[0, 1, 2].map(i => <span key={i} />)}</div>}

    {data && <>
      <div className={styles.kpis}>
        <div data-tone={data.total ? 'warn' : 'ok'}><span>کل خطاها</span><b>{n(data.total)}</b><small>۷ روز اخیر</small></div>
        <div><span>گروه تکراری</span><b>{n(data.groups.length)}</b><small>{top ? `بیشترین: ${n(top.count)} بار` : 'خطایی نیست'}</small></div>
        {Object.entries(data.counts).map(([k, v]) => <div key={k}><span>{SOURCES[k]}</span><b>{n(v)}</b></div>)}
      </div>
      <p className={styles.note}>خطاهای سرور از حافظهٔ همین فرایند از {when(data.processStartedAt)} خوانده می‌شوند و با راه‌اندازی دوباره پاک می‌شوند؛ کارهای پس‌زمینه، ایمیل، پیامک و هوش مصنوعی از سوابق ذخیره‌شده. ایمیل، تلفن، IP و کلیدها پیش از نمایش حذف می‌شوند.</p>
      {summaryError && <p role="alert" className="error-text">{summaryError}</p>}
      {summary && <section className={styles.summary} aria-live="polite"><h2><Icon name="sparkles" size={18} /> خلاصهٔ هوش مصنوعی</h2><p>{summary.summary}</p><small>مدل {summary.model} · برداشت مدل است؛ با شواهد هر گروه تطبیق دهید.</small></section>}

      {data.groups.length ? <ol className={styles.groups}>{data.groups.map(g => { const f = finding(g.id); return <li key={g.id} className={styles.group}>
        <header>
          <span className={styles.count}>{n(g.count)}<small>بار</small></span>
          <div><b dir="auto">{g.cause?.title || g.event}</b><span className={styles.meta}>{SOURCES[g.source]} · {g.event} · آخرین: {when(g.lastAt)}</span></div>
        </header>
        <code dir="auto" className={styles.sig}>{g.signature}</code>
        {g.cause && <p className={styles.cause}><Icon name="lifebuoy" size={16} /> <span><b>علت احتمالی:</b> {g.cause.explanation}</span></p>}
        {f && <p className={styles.ai}><Icon name="sparkles" size={16} /> <span>{f.cause} <small>اطمینان: {CONFIDENCE[f.confidence]}</small></span></p>}
        <details className={styles.evidence}><summary>شواهد</summary>
          {g.paths.length > 0 && <p>مسیرها: <span dir="ltr">{g.paths.join(' · ')}</span></p>}
          <ul>{g.samples.map(s => <li key={s} dir="auto">{s}</li>)}</ul>
          <p>اولین: {when(g.firstAt)}</p>
        </details>
        <div className={styles.actions}>
          {g.cause?.action.kind === 'settings' && <Link className="btn btn-primary btn-sm" href={g.cause.action.href}>{g.cause.action.label}</Link>}
          {g.cause?.action.kind === 'engineering' && <button type="button" className="btn btn-primary btn-sm" onClick={() => handOff(g, (g.cause!.action as { mode: EngineeringMode }).mode)}>{MODES[(g.cause.action as { mode: EngineeringMode }).mode]}</button>}
          {(['DIAGNOSE', 'DEVELOP'] as EngineeringMode[]).filter(m => !(g.cause?.action.kind === 'engineering' && g.cause.action.mode === m)).map(m => <button key={m} type="button" className="btn btn-ghost btn-sm" onClick={() => handOff(g, m)}>{MODES[m]}</button>)}
        </div>
      </li> })}</ol> : <div className={styles.clean}><Icon name="check" size={28} /><b>خطای تکراری‌ای ثبت نشده است</b><span>در هفتهٔ اخیر خطایی از منابع بالا پیدا نشد.</span></div>}
      <p className={styles.note}>دکمه‌های مهندسی فقط متن درخواست را در صفحهٔ «مهندسی سایت» آماده می‌کنند؛ آن صفحه باز کردن قفل سرور، دسترسی، بودجه و تأیید شما را جداگانه می‌خواهد. هیچ اقدامی از این صفحه اجرا نمی‌شود.</p>
    </>}
  </div>
}
