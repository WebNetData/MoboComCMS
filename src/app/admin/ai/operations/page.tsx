'use client'
import Link from '@/components/AppLink'
import { useEffect, useRef, useState } from 'react'
import { AI_TOOLS } from '@/modules/ai/domain/operations'

type Proposal = { executionMode: string; id: number; tool: string; reason: string; status: string; updatedAt: string; expiresAt: string; preview: Record<string, string | number | boolean>; result: { href?: string; title?: string } }
type Data = { tools: { id: string; label: string }[]; directTools: string[]; proposals: Proposal[]; canConfigure: boolean; policy: { enabled: boolean; allowed?: string[]; directAllowed?: string[]; maxProposals: number }; execution?: { applied: number; total: number; stopped: boolean; message: string } }
const endpoint = '/api/admin/ai/operations'
const states: Record<string, string> = { PROPOSED: 'در انتظار بررسی شما', APPLIED: 'انجام شد', REJECTED: 'رد شد', DRAFT: 'پیش‌نویس', PUBLISHED: 'منتشر / زمان‌بندی‌شده', PAID: 'پرداخت‌شده', PENDING: 'در انتظار پرداخت', PHYSICAL: 'فیزیکی', VIRTUAL: 'مجازی', IRT: 'تومان', IRR: 'ریال', USD: 'دلار آمریکا', EUR: 'یورو', GBP: 'پوند', AED: 'درهم', '-1': 'نامحدود' }

export default function OperationalAssistant() {
  const [data, setData] = useState<Data | null>(null), [instruction, setInstruction] = useState(''), [busy, setBusy] = useState(''), [notice, setNotice] = useState(''), [error, setError] = useState(false)
  const running = useRef(false), directRequest = useRef<{ instruction: string; id: string } | null>(null)
  const [direct, setDirect] = useState(false)
  useEffect(() => { const controller = new AbortController(); void fetch(endpoint, { cache: 'no-store', signal: controller.signal }).then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error || 'دریافت دستیار انجام نشد'); setData(body) }).catch(e => { if (!controller.signal.aborted) { setNotice(e.message); setError(true) } }); return () => controller.abort() }, [])
  async function call(body: Record<string, unknown>, key: string, method = 'POST') {
    if (running.current) return
    running.current = true; setBusy(key); setNotice(''); setError(false)
    try { const response = await fetch(endpoint, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify(body) }); const value = await response.json(); if (!response.ok) throw new Error(value.error || 'عملیات انجام نشد'); setData(value); setError(!!value.execution?.stopped); setNotice(value.execution?.message || (key === 'propose' ? 'پیشنهادها آماده‌اند؛ هنوز هیچ تغییری در محتوا یا سفارش انجام نشده است' : 'نتیجه ثبت شد')); if (key === 'direct') directRequest.current = null }
    catch (e) { setNotice(e instanceof Error ? e.message : 'عملیات انجام نشد'); setError(true) }
    finally { running.current = false; setBusy('') }
  }
  function submitInstruction() {
    if (running.current) return
    if (!direct) { void call({ action: 'propose', instruction }, 'propose'); return }
    const saved = directRequest.current?.instruction === instruction ? directRequest.current : { instruction, id: crypto.randomUUID() }
    directRequest.current = saved; setDirect(false)
    void call({ action: 'run-direct', instruction, direct: true, requestId: saved.id }, 'direct')
  }
  return <div className="xm-page" dir="rtl">
    <header className="tb-hero"><div><span className="tb-eyebrow">دستیار عملیاتی موبوکام</span><h1>پیشنهاد بده، بررسی کن، اجرا کن</h1><p>کار موردنظرتان را توضیح دهید. پیش‌فرض، پیشنهاد و بررسی جداگانه است؛ برای ابزارهای مجاز می‌توانید اجرای مستقیم را فقط برای همان درخواست انتخاب کنید.</p></div>{data?.canConfigure && <Link className="btn btn-ghost" href="/admin/ai">تنظیم سرویس هوش مصنوعی</Link>}</header>
    {notice && <p className={`xm-notice${error ? ' is-error' : ''}`} role={error ? 'alert' : 'status'}>{notice}</p>}
    {!data && !notice && <p role="status">در حال دریافت دستیار…</p>}
    {data && <>
      <section className="card seo-form" aria-label="درخواست از دستیار"><header className="seo-wide"><h2>دستور کار</h2><p className="muted">ابزارهای مجاز شما: {data.tools.map(t => t.label).join('، ') || 'ابزاری فعال نیست'}. قیمت، موجودی، واقعیت‌های مطلب و کد رهگیری را دقیق وارد کنید.</p></header>
        <label className="studio-field seo-wide"><span>چه کاری آماده کنم؟</span><textarea className="input" rows={5} maxLength={4000} value={instruction} disabled={!!busy} onChange={e => setInstruction(e.target.value)} placeholder="مثلاً یک مطلب پیش‌نویس دربارهٔ راهنمای خرید آماده کن؛ یا برای سفارش مشخص، یادداشت داخلی و وضعیت پردازش پیشنهاد بده" /></label>
        <label className="studio-switch seo-wide"><input type="checkbox" checked={direct} disabled={!!busy || !data.policy.enabled || !data.directTools.length} onChange={e => setDirect(e.target.checked)} />اجرای مستقیم برای همین درخواست، بدون بررسی پیشنهادها</label>
        <p className="muted seo-wide">{direct ? 'این درخواست پس از بررسی قواعد سرور اجرا می‌شود و ممکن است محتوا را منتشر یا محصول و سفارش را تغییر دهد. هر اقدام در سوابق ثبت می‌شود؛ این انتخاب پس از ارسال خاموش می‌شود.' : 'پیش‌فرض: ابتدا پیشنهادها را بررسی می‌کنید. اجرای مستقیم فقط با انتخاب شما برای همین دستور انجام می‌شود.'} ابزارهای اجرای مستقیم: {data.directTools.map(id => AI_TOOLS.find(t => t.id === id)?.label).join('، ') || 'از تنظیمات دستیار مجاز نشده‌اند'}.</p>
        <div className="seo-actions seo-wide"><button className="btn btn-primary" type="button" disabled={!!busy || !data.policy.enabled || !data.tools.length || instruction.trim().length < 5 || (direct && !data.directTools.length)} onClick={submitInstruction}>{busy === 'direct' ? 'در حال اجرای درخواست…' : busy === 'propose' ? 'در حال آماده‌کردن پیشنهاد…' : direct ? 'اجرای همین درخواست' : 'آماده‌کردن پیشنهادها'}</button><button className="btn btn-ghost" type="button" disabled={!!busy} onClick={() => void call({}, 'refresh', 'GET')}>تازه‌کردن نتیجه و سوابق</button><span className="muted">حداکثر {data.policy.maxProposals} اقدام؛ تولید برنامه از سهمیهٔ مدل استفاده می‌کند</span></div>
        <p className="muted seo-wide">اگر ارتباط قطع شد، ابتدا نتیجه و سوابق را تازه کنید. انتخاب دوبارهٔ اجرای مستقیم با همان متن، همان درخواست را بازیابی می‌کند. با تازه‌کردن کامل صفحه، متن تازه یا دستور تازه، درخواست جدید ساخته می‌شود.</p>
        {!data.policy.enabled && <p className="xm-notice seo-wide">دستیار عملیاتی غیرفعال است؛ سوابق حفظ شده‌اند</p>}
      </section>
      <section aria-label="پیشنهادها و سوابق" className="xm-section"><h2>میز بررسی و سوابق شما</h2><p className="muted">آخرین ۳۰ پیشنهاد مربوط به بخش‌هایی که اکنون مجوزشان را دارید نمایش داده می‌شوند</p>{!data.proposals.length && <p className="card">پیشنهادی ثبت نشده است. ابتدا دستور کار را وارد کنید.</p>}{data.proposals.map(p => <ProposalCard key={`${p.id}:${p.updatedAt}`} proposal={p} disabled={!!busy || !data.policy.enabled || !data.tools.some(t => t.id === p.tool)} working={busy === String(p.id)} onDecide={(action, approved) => void call({ action, id: p.id, updatedAt: p.updatedAt, approved }, String(p.id))} />)}</section>
      {data.canConfigure && data.policy.allowed && <PolicyForm key={JSON.stringify(data.policy)} policy={{ ...data.policy, allowed: data.policy.allowed, directAllowed: data.policy.directAllowed || [] }} disabled={!!busy} onSave={policy => void call({ policy }, 'policy', 'PUT')} />}
    </>}
  </div>
}
function ProposalCard({ proposal: p, disabled, working, onDecide }: { proposal: Proposal; disabled: boolean; working: boolean; onDecide: (action: string, approved: boolean) => void }) {
  const [approved, setApproved] = useState(false), expired = new Date(p.expiresAt).getTime() <= Date.now(), v = p.preview
  return <article className="card seo-form" aria-label={`پیشنهاد ${p.id}`}><header className="seo-wide"><span className="badge">{states[p.status] || p.status}</span>{p.executionMode === 'DIRECT' && <span className="badge">اجرای مستقیم به انتخاب شما</span>}<h3>{AI_TOOLS.find(t => t.id === p.tool)?.label} · {String(v.title || '')}</h3><p className="muted">{p.reason}</p></header>
    {v.targetId && <p className="seo-wide">شناسهٔ مقصد: {String(v.targetId)}</p>}
    {v.href && <Link className="btn btn-ghost seo-wide" href={String(v.href)} target="_blank" rel="noreferrer">بازبینی کامل رکورد در پنل</Link>}
    {v.excerpt && <p className="seo-wide">خلاصه: {String(v.excerpt)}</p>}
    {v.body && <div className="seo-wide" style={{ whiteSpace: 'pre-wrap', maxHeight: 420, overflow: 'auto', lineHeight: 2 }} tabIndex={0} role="region" aria-label="متن کامل پیشنهاد">{String(v.body)}</div>}
    <dl className="seo-wide">{[['slug', 'نشانی'], ['currentStatus', 'وضعیت فعلی پردازش'], ['paymentStatus', 'وضعیت فعلی پرداخت'], ['status', 'وضعیت پیشنهادی'], ['kind', 'نوع محصول'], ['price', 'قیمت دقیق'], ['currency', 'ارز / واحد قیمت'], ['stock', 'موجودی'], ['active', 'محصول فعال باشد'], ['categoryId', 'شناسهٔ دسته'], ['trackingCode', 'کد رهگیری'], ['publishedAt', 'زمان انتشار فعلی']].filter(([key]) => v[key] !== undefined && v[key] !== '').map(([key, label]) => <div key={key}><dt>{label}</dt><dd dir={['slug', 'price', 'currency', 'trackingCode'].includes(key) ? 'ltr' : undefined}>{typeof v[key] === 'boolean' ? v[key] ? 'بله' : 'خیر' : states[String(v[key])] || String(v[key])}</dd></div>)}</dl>
    {p.status === 'PROPOSED' && <><p className="xm-notice seo-wide">{String(v.warning || '')}{expired ? '؛ اعتبار پیشنهاد تمام شده است' : '؛ قبل از اجرا همهٔ موارد بالا را بررسی کنید'}</p><label className="studio-switch seo-wide"><input type="checkbox" checked={approved} disabled={disabled || expired} onChange={e => setApproved(e.target.checked)} />همین اطلاعات و پیامدهای تغییر را بررسی کرده‌ام و اجرای آن را تأیید می‌کنم</label><div className="seo-actions seo-wide"><button className="btn btn-primary" type="button" disabled={disabled || expired || !approved} onClick={() => onDecide('approve', true)}>{working ? 'در حال ثبت نتیجه…' : 'تأیید و اجرای همین پیشنهاد'}</button><button className="btn btn-ghost" type="button" disabled={disabled || expired} onClick={() => onDecide('reject', false)}>رد پیشنهاد</button></div></>}
    {p.status === 'APPLIED' && p.result.href && <Link className="btn btn-ghost seo-wide" href={p.result.href}>مشاهده و ویرایش نتیجه</Link>}
  </article>
}
function PolicyForm({ policy, disabled, onSave }: { policy: { enabled: boolean; allowed: string[]; directAllowed: string[]; maxProposals: number }; disabled: boolean; onSave: (policy: { enabled: boolean; allowed: string[]; directAllowed: string[]; maxProposals: number }) => void }) {
  const [value, setValue] = useState(policy)
  return <details className="card"><summary>تنظیمات دستیار عملیاتی</summary><div className="seo-form"><p className="muted seo-wide">پیش‌فرض تمام ابزارها بررسی جداگانه است. اجازهٔ اجرای مستقیم را برای هر ابزار مشخص کنید؛ مدیر درخواست‌کننده همچنان باید آن را فقط برای همان دستور انتخاب کند. پرداخت، بازپرداخت، لغو سفارش و ارسال پیام مشتری جزو ابزارها نیستند.</p><label className="studio-switch seo-wide"><input type="checkbox" checked={value.enabled} disabled={disabled} onChange={e => setValue(v => ({ ...v, enabled: e.target.checked }))} />دستیار عملیاتی فعال باشد</label>{AI_TOOLS.map(t => <fieldset className="seo-wide" key={t.id}><legend>{t.label}</legend><label className="studio-switch"><input type="checkbox" checked={value.allowed.includes(t.id)} disabled={disabled} onChange={e => setValue(v => ({ ...v, allowed: e.target.checked ? [...v.allowed, t.id] : v.allowed.filter(x => x !== t.id), directAllowed: e.target.checked ? v.directAllowed : v.directAllowed.filter(x => x !== t.id) }))} />ابزار فعال باشد: {t.label}</label><label className="studio-switch"><input type="checkbox" checked={value.directAllowed.includes(t.id)} disabled={disabled || !value.allowed.includes(t.id)} onChange={e => setValue(v => ({ ...v, directAllowed: e.target.checked ? [...v.directAllowed, t.id] : v.directAllowed.filter(x => x !== t.id) }))} />اجازهٔ اجرای مستقیم: {t.label}</label></fieldset>)}<label className="studio-field"><span>تعداد پیشنهاد در هر درخواست</span><select className="input" value={value.maxProposals} disabled={disabled} onChange={e => setValue(v => ({ ...v, maxProposals: Number(e.target.value) }))}>{[1,2,3].map(n => <option key={n} value={n}>{n}</option>)}</select></label><div className="seo-actions"><button className="btn btn-primary" type="button" disabled={disabled} onClick={() => onSave(value)}>ذخیرهٔ سیاست دستیار</button></div></div></details>
}
