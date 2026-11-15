'use client'
import Link from '@/components/AppLink'
import { useEffect, useRef, useState } from 'react'
import { workspaceInstruction, workspacePath } from '@/modules/ai/domain/workspace'
import { AI_TOOLS, operationContextForPage, operationPageTools, type OperationPageContext } from '@/modules/ai/domain/operations'
import NavigationIcon from '@/components/site/NavigationIcon'

type Proposal = { executionMode: string; id: number; tool: string; reason: string; status: string; updatedAt: string; expiresAt: string; preview: Record<string, unknown>; result: { href?: string; title?: string } }
type Data = { actorId: number; tools: { id: string; label: string }[]; directTools: string[]; proposals: Proposal[]; canConfigure: boolean; policy: { enabled: boolean; allowed?: string[]; directAllowed?: string[]; maxProposals: number }; execution?: { applied: number; total: number; stopped: boolean; message: string } }
const endpoint = '/api/admin/ai/operations'
const states: Record<string, string> = { PROPOSED: 'در انتظار بررسی شما', APPLIED: 'انجام شد', REJECTED: 'رد شد', DRAFT: 'پیش‌نویس', PUBLISHED: 'منتشر / زمان‌بندی‌شده', PAID: 'پرداخت‌شده', PENDING: 'در انتظار پرداخت', PHYSICAL: 'فیزیکی', VIRTUAL: 'مجازی', IRT: 'تومان', IRR: 'ریال', USD: 'دلار آمریکا', EUR: 'یورو', GBP: 'پوند', AED: 'درهم', '-1': 'نامحدود' }

export default function OperationalAssistant({ embedded = false, initialInstruction = '', source = '', context }: { embedded?: boolean; initialInstruction?: string; source?: string; context?: OperationPageContext }) {
  const [data, setData] = useState<Data | null>(null), [instruction, setInstruction] = useState(initialInstruction), [busy, setBusy] = useState(''), [notice, setNotice] = useState(''), [error, setError] = useState(false)
  const request = useRef<AbortController | null>(null)
  const pageContext = operationContextForPage(source, { tax: context?.taxonomy, tab: context?.menu === 'section' ? 'sections' : context?.menu, section: context?.section })
  const pageTools = operationPageTools(pageContext)
  const query = new URLSearchParams(Object.entries(pageContext).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
  const url = query.size ? `${endpoint}?${query}` : endpoint
  const running = useRef(false), directRequest = useRef<{ instruction: string; id: string } | null>(null)
  const [direct, setDirect] = useState(false)
  useEffect(() => { const controller = new AbortController(); void fetch(url, { cache: 'no-store', signal: controller.signal }).then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error || 'دریافت دستیار انجام نشد'); if (!controller.signal.aborted) setData(body) }).catch(e => { if (!controller.signal.aborted) { setNotice(e.message); setError(true) } }); return () => { controller.abort(); request.current?.abort() } }, [url])
  async function call(body: Record<string, unknown>, key: string, method = 'POST') {
    if (running.current || (method !== 'GET' && !data?.actorId)) return
    running.current = true; setBusy(key); setNotice(''); setError(false)
    const controller = new AbortController(); request.current = controller
    try { const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify({ ...body, expectedActorId: data?.actorId }), signal: controller.signal }); const value = await response.json(); if (!response.ok) { if ([401, 403].includes(response.status) || response.headers.get('X-Ai-Actor-Changed') === '1') { setData(null); setInstruction(''); setDirect(false); directRequest.current = null } throw new Error(value.error || 'عملیات انجام نشد') } if (controller.signal.aborted) return; setData(value); setError(!!value.execution?.stopped); setNotice(value.execution?.message || (key === 'propose' ? 'پیشنهادها آماده‌اند؛ هنوز هیچ تغییری ذخیره یا اجرا نشده است' : 'نتیجه ثبت شد')); if (key === 'direct') directRequest.current = null }
    catch (e) { if (!controller.signal.aborted) { setNotice(e instanceof Error ? e.message : 'عملیات انجام نشد'); setError(true) } }
    finally { running.current = false; if (!controller.signal.aborted) setBusy('') }
  }
  function submitInstruction() {
    if (running.current) return
    const text = workspaceInstruction(instruction, source)
    if (!direct) { void call({ action: 'propose', instruction: text, context: pageContext }, 'propose'); return }
    const saved = directRequest.current?.instruction === text ? directRequest.current : { instruction: text, id: crypto.randomUUID() }
    directRequest.current = saved; setDirect(false)
    void call({ action: 'run-direct', instruction: text, direct: true, requestId: saved.id, context: pageContext }, 'direct')
  }
  return <div className="xm-page" dir="rtl">
    {!embedded && <header className="tb-hero"><div><span className="tb-eyebrow">دستیار عملیاتی موبوکام</span><h1>پیشنهاد بده، بررسی کن، اجرا کن</h1><p>کار موردنظرتان را توضیح دهید. پیش‌فرض، پیشنهاد و بررسی جداگانه است؛ برای ابزارهای مجاز می‌توانید اجرای مستقیم را فقط برای همان درخواست انتخاب کنید.</p></div>{data?.canConfigure && <Link className="btn btn-ghost" href="/admin/ai">تنظیم سرویس هوش مصنوعی</Link>}</header>}
    {workspacePath(source) && <p className="muted">بخش موردنظر: <bdi>{workspacePath(source)}</bdi>؛ متن درخواست را پیش از ارسال بررسی کنید.</p>}
    {notice && <p className={`xm-notice${error ? ' is-error' : ''}`} role={error ? 'alert' : 'status'}>{notice}</p>}
    {!data && !notice && <p role="status">در حال دریافت دستیار…</p>}
    {!data && notice && <button type="button" className="btn btn-ghost" disabled={!!busy} onClick={() => void call({}, 'refresh', 'GET')}>دریافت دوبارهٔ دستیار</button>}
    {data && <>
      {pageTools.length > 0 && <p className="muted">ابزارهای این بخش: {pageTools.map(id => { const tool = AI_TOOLS.find(item => item.id === id); return `${tool?.label || id} (${data.policy.enabled && data.tools.some(item => item.id === id) ? 'در دسترس' : 'غیرفعال یا بدون دسترسی'})` }).join('، ')}. {data.canConfigure && <Link href="/admin/ai/operations">تنظیم سیاست ابزارها</Link>}</p>}
      <section className="card seo-form" aria-label="درخواست از دستیار"><header className="seo-wide"><h2>دستور کار</h2><p className="muted">ابزارهای مجاز شما: {data.tools.map(tool => tool.label).join('، ') || 'ابزاری فعال نیست'}. قیمت، موجودی، واقعیت‌های مطلب و کد رهگیری را دقیق وارد کنید.</p></header>
        <label className="studio-field seo-wide"><span>چه کاری آماده کنم؟</span><textarea className="input" rows={5} maxLength={source ? 3700 : 4000} value={instruction} disabled={!!busy} onChange={e => setInstruction(e.target.value)} placeholder="مثلاً برای مجلهٔ فناوری پنج دسته پیشنهاد بده و ساختشان را آماده کن؛ یا لینک مجله را با آیکن کتاب به منوی هدر اضافه کن" /></label>
        <label className="studio-switch seo-wide"><input type="checkbox" checked={direct} disabled={!!busy || !data.policy.enabled || !data.directTools.length} onChange={e => setDirect(e.target.checked)} />اجرای مستقیم برای همین درخواست، بدون بررسی پیشنهادها</label>
        <p className="muted seo-wide">{direct ? 'این درخواست پس از بررسی قواعد سرور اجرا می‌شود و ممکن است محتوا را منتشر یا محصول و سفارش را تغییر دهد. هر اقدام در سوابق ثبت می‌شود؛ این انتخاب پس از ارسال خاموش می‌شود.' : 'پیش‌فرض: ابتدا پیشنهادها را بررسی می‌کنید. اجرای مستقیم فقط با انتخاب شما برای همین دستور انجام می‌شود.'} ابزارهای اجرای مستقیم: {data.directTools.map(id => AI_TOOLS.find(t => t.id === id)?.label).join('، ') || 'از تنظیمات دستیار مجاز نشده‌اند'}.</p>
        <div className="seo-actions seo-wide"><button className="btn btn-primary" type="button" disabled={!!busy || !data.policy.enabled || !data.tools.length || instruction.trim().length < 5 || (direct && !data.directTools.length)} onClick={submitInstruction}>{busy === 'direct' ? 'در حال اجرای درخواست…' : busy === 'propose' ? 'در حال آماده‌کردن پیشنهاد…' : direct ? 'اجرای همین درخواست' : 'آماده‌کردن پیشنهادها'}</button><button className="btn btn-ghost" type="button" disabled={!!busy} onClick={() => void call({}, 'refresh', 'GET')}>تازه‌کردن نتیجه و سوابق</button><span className="muted">حداکثر {data.policy.maxProposals} اقدام؛ تولید برنامه از سهمیهٔ مدل استفاده می‌کند</span></div>
        <p className="muted seo-wide">اگر ارتباط قطع شد، ابتدا نتیجه و سوابق را تازه کنید. انتخاب دوبارهٔ اجرای مستقیم با همان متن، همان درخواست را بازیابی می‌کند. با تازه‌کردن کامل صفحه، متن تازه یا دستور تازه، درخواست جدید ساخته می‌شود.</p>
        {!data.policy.enabled && <p className="xm-notice seo-wide">دستیار عملیاتی غیرفعال است؛ سوابق حفظ شده‌اند</p>}
      </section>
      <section aria-label="پیشنهادها و سوابق" className="xm-section"><h2>میز بررسی و سوابق شما</h2><p className="muted">آخرین ۳۰ پیشنهاد مربوط به بخش‌هایی که اکنون مجوزشان را دارید نمایش داده می‌شوند</p>{!data.proposals.length && <p className="card">پیشنهادی ثبت نشده است. ابتدا دستور کار را وارد کنید.</p>}{data.proposals.map(p => <ProposalCard key={`${p.id}:${p.updatedAt}`} proposal={p} disabled={!!busy || !data.policy.enabled || !data.tools.some(t => t.id === p.tool)} working={busy === String(p.id)} onDecide={(action, approved) => void call({ action, id: p.id, updatedAt: p.updatedAt, approved }, String(p.id))} />)}</section>
      {!embedded && data.canConfigure && data.policy.allowed && <PolicyForm key={JSON.stringify(data.policy)} policy={{ ...data.policy, allowed: data.policy.allowed, directAllowed: data.policy.directAllowed || [] }} disabled={!!busy} onSave={policy => void call({ policy }, 'policy', 'PUT')} />}
    </>}
  </div>
}
function ProposalCard({ proposal: p, disabled, working, onDecide }: { proposal: Proposal; disabled: boolean; working: boolean; onDecide: (action: string, approved: boolean) => void }) {
  const [approved, setApproved] = useState(false), expired = new Date(p.expiresAt).getTime() <= Date.now(), v = p.preview
  const incomplete = !Array.isArray(v.changes) && ['before', 'after'].some(key => !!v[key] && typeof v[key] === 'object' && !Array.isArray(v[key]) && (v[key] as Record<string, unknown>).truncated === true)
  return <article className="card seo-form" aria-label={`پیشنهاد ${p.id}`}><header className="seo-wide"><span className="badge">{states[p.status] || p.status}</span>{p.executionMode === 'DIRECT' && <span className="badge">اجرای مستقیم به انتخاب شما</span>}<h3>{AI_TOOLS.find(t => t.id === p.tool)?.label} · {String(v.title || '')}</h3><p className="muted">{p.reason}</p></header>
    <BatchPreview preview={v} />
    {v.targetId != null && <p className="seo-wide">شناسهٔ مقصد: {String(v.targetId)}</p>}
    {typeof v.href === 'string' && v.href.startsWith('/admin/') && <Link className="btn btn-ghost seo-wide" href={String(v.href)} target="_blank" rel="noreferrer">بازبینی کامل رکورد در پنل</Link>}
    {typeof v.excerpt === 'string' && <p className="seo-wide">خلاصه: {String(v.excerpt)}</p>}
    {typeof v.body === 'string' && <div className="seo-wide" style={{ whiteSpace: 'pre-wrap', maxHeight: 420, overflow: 'auto', lineHeight: 2 }} tabIndex={0} role="region" aria-label="متن کامل پیشنهاد">{String(v.body)}</div>}
    <dl className="seo-wide">{[['slug', 'نشانی'], ['currentStatus', 'وضعیت فعلی پردازش'], ['paymentStatus', 'وضعیت فعلی پرداخت'], ['status', 'وضعیت پیشنهادی'], ['kind', 'نوع محصول'], ['price', 'قیمت دقیق'], ['currency', 'ارز / واحد قیمت'], ['stock', 'موجودی'], ['active', 'محصول فعال باشد'], ['categoryId', 'شناسهٔ دسته'], ['trackingCode', 'کد رهگیری'], ['publishedAt', 'زمان انتشار فعلی']].filter(([key]) => v[key] !== undefined && v[key] !== '').map(([key, label]) => <div key={key}><dt>{label}</dt><dd dir={['slug', 'price', 'currency', 'trackingCode'].includes(key) ? 'ltr' : undefined}>{typeof v[key] === 'boolean' ? v[key] ? 'بله' : 'خیر' : states[String(v[key])] || String(v[key])}</dd></div>)}</dl>
    {p.status === 'PROPOSED' && <><p className="xm-notice seo-wide">{String(v.warning || '')}{incomplete ? '؛ نمایش منو ناقص است و این پیشنهاد قابل تأیید نیست' : expired ? '؛ اعتبار پیشنهاد تمام شده است' : '؛ قبل از اجرا همهٔ موارد بالا را بررسی کنید'}</p><label className="studio-switch seo-wide"><input type="checkbox" checked={approved} disabled={disabled || expired || incomplete} onChange={e => setApproved(e.target.checked)} />همین اطلاعات و پیامدهای تغییر را بررسی کرده‌ام و اجرای آن را تأیید می‌کنم</label><div className="seo-actions seo-wide"><button className="btn btn-primary" type="button" disabled={disabled || expired || incomplete || !approved} onClick={() => onDecide('approve', true)}>{working ? 'در حال ثبت نتیجه…' : 'تأیید و اجرای همین پیشنهاد'}</button><button className="btn btn-ghost" type="button" disabled={disabled || expired} onClick={() => onDecide('reject', false)}>رد پیشنهاد</button></div></>}
    {p.status === 'APPLIED' && p.result.href && <Link className="btn btn-ghost seo-wide" href={p.result.href}>مشاهده و ویرایش نتیجه</Link>}
  </article>
}

const previewFields: Record<string, string> = { title: 'عنوان', name: 'نام', label: 'عنوان جدید', slug: 'نشانی', href: 'پیوند جدید', icon: 'آیکن جدید', parentId: 'شناسهٔ والد', parent: 'والد', id: 'شناسه', action: 'عمل', operation: 'عمل', count: 'تعداد', warning: 'پیامد', description: 'توضیح', section: 'بخش', menu: 'منو', active: 'فعال', enabled: 'نمایش جدید', beforeName: 'نام قبلی', beforeLabel: 'عنوان قبلی', beforeHref: 'پیوند قبلی', beforeIcon: 'آیکن قبلی', beforeEnabled: 'نمایش قبلی', order: 'ترتیب' }
function PreviewRows({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (depth > 5 || !Array.isArray(value)) return null
  return <ol className="ai-operation-preview-list">{value.slice(0, 100).map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return typeof item === 'string' ? <li key={index}>{item}</li> : null
    const row = item as Record<string, unknown>
    return <li key={index}><dl>{Object.entries(row).filter(([key, field]) => key in previewFields && (typeof field === 'string' || typeof field === 'number' || typeof field === 'boolean' || (key === 'parentId' && field === null) || (key === 'label' && !!field && typeof field === 'object'))).map(([key, field]) => <div key={key}><dt>{previewFields[key]}</dt><dd>{(key === 'icon' || key === 'beforeIcon') && typeof field === 'string' && <span aria-hidden="true"><NavigationIcon name={field} /> </span>}{field === null ? 'بدون والد' : typeof field === 'boolean' ? field ? 'بله' : 'خیر' : key === 'action' && field === 'add' ? 'افزودن' : key === 'action' && field === 'update' ? 'ویرایش' : key === 'label' && typeof field === 'object' && field ? String((field as Record<string, unknown>).fa || '') : String(field)}</dd></div>)}</dl>{['items', 'children', 'entries'].map(key => <PreviewRows key={key} value={row[key]} depth={depth + 1} />)}</li>
  })}</ol>
}
function BatchPreview({ preview }: { preview: Record<string, unknown> }) {
  const blocks = [['entries', 'دسته‌های پیشنهادی'], ['changes', 'همهٔ تغییرهای پیشنهادی'], ['items', 'موارد پیشنهادی'], ['before', 'منوی فعلی'], ['after', 'منوی پیشنهادی']] as const
  return <div className="seo-wide ai-operation-preview">{typeof preview.count === 'number' && <p>تعداد تغییرها: {preview.count}</p>}{typeof preview.menu === 'string' && <p>منو: {({ header: 'هدر', footer: 'فوتر', footerExplore: 'کشف در فوتر', footerAccount: 'حساب کاربری در فوتر', section: 'نوار بخش' } as Record<string, string>)[preview.menu] || preview.menu}</p>}{blocks.map(([key, label]) => {
    const value = preview[key], meta = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null, tree = meta ? meta.tree : value
    if (!Array.isArray(tree)) return null
    const contents = <>{meta?.truncated === true && <p>نمایش درخت منو محدود شده است؛ فهرست تغییرها در بالا کامل است.</p>}<PreviewRows value={tree} /></>
    return key === 'before' || key === 'after' ? <details key={key}><summary>{label}</summary>{contents}</details> : <section key={key}><h4>{label}</h4>{contents}</section>
  })}</div>
}

function PolicyForm({ policy, disabled, onSave }: { policy: { enabled: boolean; allowed: string[]; directAllowed: string[]; maxProposals: number }; disabled: boolean; onSave: (policy: { enabled: boolean; allowed: string[]; directAllowed: string[]; maxProposals: number }) => void }) {
  const [value, setValue] = useState(policy)
  return <details className="card"><summary>تنظیمات دستیار عملیاتی</summary><div className="seo-form"><p className="muted seo-wide">پیش‌فرض تمام ابزارها بررسی جداگانه است. اجازهٔ اجرای مستقیم را برای هر ابزار مشخص کنید؛ مدیر درخواست‌کننده همچنان باید آن را فقط برای همان دستور انتخاب کند. پرداخت، بازپرداخت، لغو سفارش و ارسال پیام مشتری جزو ابزارها نیستند.</p><label className="studio-switch seo-wide"><input type="checkbox" checked={value.enabled} disabled={disabled} onChange={e => setValue(v => ({ ...v, enabled: e.target.checked }))} />دستیار عملیاتی فعال باشد</label>{AI_TOOLS.map(tool => <fieldset className="seo-wide" key={tool.id}><legend>{tool.label}</legend><label className="studio-switch"><input type="checkbox" checked={value.allowed.includes(tool.id)} disabled={disabled} onChange={e => setValue(v => ({ ...v, allowed: e.target.checked ? [...v.allowed, tool.id] : v.allowed.filter(x => x !== tool.id), directAllowed: e.target.checked ? v.directAllowed : v.directAllowed.filter(x => x !== tool.id) }))} />ابزار فعال باشد: {tool.label}</label><label className="studio-switch"><input type="checkbox" checked={value.directAllowed.includes(tool.id)} disabled={disabled || !value.allowed.includes(tool.id)} onChange={e => setValue(v => ({ ...v, directAllowed: e.target.checked ? [...v.directAllowed, tool.id] : v.directAllowed.filter(x => x !== tool.id) }))} />اجازهٔ اجرای مستقیم: {tool.label}</label></fieldset>)}<label className="studio-field"><span>تعداد پیشنهاد در هر درخواست</span><select className="input" value={value.maxProposals} disabled={disabled} onChange={e => setValue(v => ({ ...v, maxProposals: Number(e.target.value) }))}>{[1,2,3].map(n => <option key={n} value={n}>{n}</option>)}</select></label><div className="seo-actions"><button className="btn btn-primary" type="button" disabled={disabled} onClick={() => onSave(value)}>ذخیرهٔ سیاست دستیار</button></div></div></details>
}
