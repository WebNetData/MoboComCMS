'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import Link from '@/components/AppLink'
import { Notice, fa, faDate } from '../store/shared'

type Row = { id: number; status: string; name: string; user: number | null; contact: string; assignedTo: number | null; unread: number; last: { sender: string; body: string } | null; lastMessageAt: string; rating: number | null; pageUrl: string }
type List = { counts: Record<string, number>; rows: Row[] }
type Message = { id: number; sender: string; body: string; at: string; agent: string }
type Customer = { id: number; name: string; email: string; phone: string; createdAt: string; orders: number; spendToman: number; lastOrderAt: string | null; openTickets: number; tags: string[]; wallet: { currency: string; balance: number }[]; segment: { label: string; tone: string }; aov: number }
type Detail = { conversation: { id: number; status: string; name: string; contact: string; userId: number | null; assignedTo: number | null; assignedName: string; pageUrl: string; rating: number | null; createdAt: string }; messages: Message[]; customer: Customer | null }
type Settings = { botEnabled: boolean; botName: string; welcome: string; knowledge: string; maxBotReplies: number; hours: { enabled: boolean; days: number[]; from: string; to: string }; offlineMessage: string; askContact: boolean }

const STATUS: Record<string, [string, string]> = { WAITING: ['منتظر اپراتور', 'is-warn'], OPEN: ['در حال گفت‌وگو', 'is-info'], BOT: ['با دستیار', ''], CLOSED: ['بسته', 'is-ok'] }
const QUICK = ['سلام، وقت بخیر 🌷 چطور می‌توانم کمکتان کنم؟', 'لطفاً شمارهٔ سفارش را بفرمایید تا بررسی کنم.', 'چند لحظه اجازه بدهید بررسی کنم.', 'مشکل برطرف شد؛ اگر سؤال دیگری دارید در خدمتم.']
const DAYS = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه']
const time = (value: string) => new Date(value).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })

async function post(body: Record<string, unknown>, method: 'POST' | 'PUT' = 'POST') {
  const response = await fetch('/api/admin/chat', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
  const data = await response?.json().catch(() => null)
  return response?.ok ? { ok: true as const, data } : { ok: false as const, error: String(data?.error || 'انجام نشد') }
}

function Conversation({ id, onChanged }: { id: number; onChanged: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [text, setText] = useState('')
  const [notice, setNotice] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const lastId = useRef(0)
  const load = useCallback(async () => {
    const response = await fetch(`/api/admin/chat?id=${id}`, { cache: 'no-store' }).catch(() => null)
    if (!response?.ok) return
    const data: Detail = await response.json()
    setDetail(data); lastId.current = data.messages.at(-1)?.id || 0
  }, [id])
  useEffect(() => { setDetail(null); void load() }, [load])
  useEffect(() => {
    const timer = setInterval(async () => {
      const response = await fetch(`/api/admin/chat?id=${id}&since=${lastId.current}`, { cache: 'no-store' }).catch(() => null)
      if (!response?.ok) return
      const data: Detail = await response.json()
      if (data.messages.length) { lastId.current = data.messages.at(-1)!.id; setDetail((current) => current ? { ...data, messages: [...current.messages, ...data.messages.filter((m) => !current.messages.some((c) => c.id === m.id))] } : data) }
      else setDetail((current) => current ? { ...current, conversation: data.conversation } : current)
    }, 3000)
    return () => clearInterval(timer)
  }, [id])
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight }) }, [detail?.messages.length])

  async function send(event?: FormEvent) {
    event?.preventDefault()
    if (!text.trim()) return
    const body = text; setText('')
    const result = await post({ id, body })
    if (!result.ok) { setNotice(result.error); setText(body); return }
    void load(); onChanged()
  }
  async function act(action: string) {
    const result = await post({ id, action })
    setNotice(result.ok ? (action === 'ticket' ? `تیکت #${fa(result.data.ticketId)} ساخته شد` : '') : result.error)
    void load(); onChanged()
  }
  const onKey = (event: KeyboardEvent<HTMLTextAreaElement>) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send() } }
  if (!detail) return <><section className="cc-chat"><div className="cc-empty">در حال بارگذاری…</div></section><aside className="cc-side" /></>
  const c = detail.conversation
  return <>
    <section className="cc-chat">
      <header>
        <div><b>{c.name || detail.customer?.name || 'بازدیدکننده'}</b> <span className={`sa-state ${(STATUS[c.status] || ['', ''])[1]}`}>{(STATUS[c.status] || [c.status])[0]}</span>{c.assignedName && <small className="sa-sub">اپراتور: {c.assignedName}</small>}</div>
        <div className="sa-row-actions">
          {c.status !== 'CLOSED' && !c.assignedTo && <button type="button" className="btn btn-primary btn-sm" onClick={() => void act('assign')}>پذیرش گفت‌وگو</button>}
          {c.userId && <button type="button" className="btn btn-ghost btn-sm" onClick={() => void act('ticket')}>ساخت تیکت پیگیری</button>}
          {c.status === 'OPEN' && <button type="button" className="btn btn-ghost btn-sm" onClick={() => void act('to-bot')}>بازگشت به دستیار</button>}
          {c.status !== 'CLOSED' ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => void act('close')}>بستن</button> : <button type="button" className="btn btn-ghost btn-sm" onClick={() => void act('reopen')}>بازگشایی</button>}
        </div>
      </header>
      {notice && <p className="sa-notice is-info" role="status">{notice}</p>}
      <div className="cc-messages" ref={box} aria-live="polite">
        {detail.messages.map((m) => m.sender === 'SYSTEM' ? <p key={m.id} className="cc-system">{m.body}</p> : <div key={m.id} className={`cc-msg is-${m.sender.toLowerCase()}`}><small>{m.sender === 'VISITOR' ? 'مشتری' : m.sender === 'BOT' ? 'دستیار هوشمند' : m.agent || 'اپراتور'} · {time(m.at)}</small>{m.body}</div>)}
      </div>
      {c.status !== 'CLOSED' && <>
        <div className="cc-quick">{QUICK.map((quick) => <button key={quick} type="button" onClick={() => setText(quick)}>{quick.slice(0, 26)}…</button>)}</div>
        <form className="cc-compose" onSubmit={send}><textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} placeholder="پاسخ… (Enter ارسال، Shift+Enter خط تازه)" aria-label="پاسخ" /><button type="submit" className="btn btn-primary" disabled={!text.trim()}>ارسال</button></form>
      </>}
    </section>
    <aside className="cc-side">
      <header><b>مشتری</b>{detail.customer && <Link className="sa-link" href={`/admin/crm/${detail.customer.id}`}>پروندهٔ کامل ←</Link>}</header>
      <div className="cc-side-body">
        {detail.customer ? <>
          <div><b>{detail.customer.name || '—'}</b><small className="sa-sub" dir="ltr">{detail.customer.email}</small><small className="sa-sub" dir="ltr">{detail.customer.phone}</small></div>
          <span className={`crm-seg is-${detail.customer.segment.tone}`}>{detail.customer.segment.label}</span>
          <dl className="mk-dl">
            <div><dt>سفارش موفق</dt><dd>{fa(detail.customer.orders)}</dd></div>
            <div><dt>مجموع خرید</dt><dd>{fa(detail.customer.spendToman)} تومان</dd></div>
            <div><dt>آخرین خرید</dt><dd>{detail.customer.lastOrderAt ? faDate(detail.customer.lastOrderAt) : '—'}</dd></div>
            <div><dt>تیکت باز</dt><dd>{fa(detail.customer.openTickets)}</dd></div>
            <div><dt>کیف پول</dt><dd>{detail.customer.wallet.map((w) => `${fa(w.balance)} ${w.currency === 'IRT' ? 'تومان' : w.currency}`).join('، ') || '—'}</dd></div>
            <div><dt>عضویت</dt><dd>{faDate(detail.customer.createdAt)}</dd></div>
          </dl>
          {detail.customer.tags.length > 0 && <div className="crm-tags">{detail.customer.tags.map((tag) => <span key={tag} className="crm-tag">{tag}</span>)}</div>}
        </> : <p className="sa-hint">مهمان (وارد حساب نشده){c.contact ? <> · تماس: <bdi dir="ltr">{c.contact}</bdi></> : ''}</p>}
        <dl className="mk-dl">
          <div><dt>صفحه</dt><dd dir="ltr">{c.pageUrl || '—'}</dd></div>
          <div><dt>شروع</dt><dd>{faDate(c.createdAt, true)}</dd></div>
          {c.rating && <div><dt>امتیاز</dt><dd>{'★'.repeat(c.rating)}</dd></div>}
        </dl>
      </div>
    </aside>
  </>
}

function SettingsForm() {
  const [form, setForm] = useState<Settings | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  useEffect(() => { fetch('/api/admin/chat?view=settings').then((r) => r.json()).then((d) => setForm(d.settings)).catch(() => undefined) }, [])
  if (!form) return <div className="sa-skeleton" />
  const set = (patch: Partial<Settings>) => setForm({ ...form, ...patch })
  return <form className="sa-card sa-form" onSubmit={async (event) => { event.preventDefault(); const result = await post({ settings: form }, 'PUT'); setNotice(result.ok ? { tone: 'ok', text: 'تنظیمات ذخیره شد' } : { tone: 'error', text: result.error }) }}>
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    <label className="sa-check"><input type="checkbox" checked={form.botEnabled} onChange={(e) => set({ botEnabled: e.target.checked })} /> دستیار هوش مصنوعی پاسخ اول را بدهد (کلید API در «دستیار هوش مصنوعی» تنظیم شود)</label>
    <div className="sa-cols">
      <label className="sa-field"><span>نام دستیار</span><input className="input" value={form.botName} onChange={(e) => set({ botName: e.target.value })} /></label>
      <label className="sa-field"><span>حداکثر پاسخ دستیار پیش از پیشنهاد اپراتور</span><input className="input" dir="ltr" inputMode="numeric" value={form.maxBotReplies} onChange={(e) => set({ maxBotReplies: Number(e.target.value) || 1 })} /></label>
    </div>
    <label className="sa-field"><span>پیام خوش‌آمد</span><input className="input" value={form.welcome} onChange={(e) => set({ welcome: e.target.value })} /></label>
    <label className="sa-field"><span>دانستنی‌های فروشگاه برای دستیار (ارسال، مرجوعی، پرداخت، ساعات کاری، پرسش‌های پرتکرار)</span><textarea className="textarea" rows={10} value={form.knowledge} onChange={(e) => set({ knowledge: e.target.value })} placeholder={'ارسال تهران ۱ روزه و شهرستان ۲ تا ۴ روز کاری است.\nمرجوعی تا ۷ روز پس از تحویل…'} /><small className="sa-sub">دستیار فقط از همین متن و اطلاعات حساب همان مشتری پاسخ می‌دهد و در غیر این صورت گفت‌وگو را به اپراتور می‌سپارد.</small></label>
    <label className="sa-check"><input type="checkbox" checked={form.hours.enabled} onChange={(e) => set({ hours: { ...form.hours, enabled: e.target.checked } })} /> ساعات کاری اپراتورها محدود است</label>
    {form.hours.enabled && <div className="sa-cols">
      <div className="sa-field"><span>روزهای کاری</span><div className="crm-filters">{[6, 0, 1, 2, 3, 4, 5].map((day) => <button key={day} type="button" className={form.hours.days.includes(day) ? 'is-active' : ''} aria-pressed={form.hours.days.includes(day)} onClick={() => set({ hours: { ...form.hours, days: form.hours.days.includes(day) ? form.hours.days.filter((d) => d !== day) : [...form.hours.days, day] } })}>{DAYS[day]}</button>)}</div></div>
      <label className="sa-field"><span>از ساعت</span><input className="input" type="time" value={form.hours.from} onChange={(e) => set({ hours: { ...form.hours, from: e.target.value } })} /></label>
      <label className="sa-field"><span>تا ساعت</span><input className="input" type="time" value={form.hours.to} onChange={(e) => set({ hours: { ...form.hours, to: e.target.value } })} /></label>
    </div>}
    <label className="sa-field"><span>پیام خارج از ساعت کاری</span><input className="input" value={form.offlineMessage} onChange={(e) => set({ offlineMessage: e.target.value })} /></label>
    <label className="sa-check"><input type="checkbox" checked={form.askContact} onChange={(e) => set({ askContact: e.target.checked })} /> از مهمان‌ها هنگام انتقال به اپراتور موبایل یا ایمیل خواسته شود</label>
    <button type="submit" className="btn btn-primary">ذخیره</button>
  </form>
}

export default function ChatConsole() {
  const [tab, setTab] = useState<'console' | 'settings'>('console')
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [list, setList] = useState<List | null>(null)
  const [active, setActive] = useState<number | null>(null)
  const [stats, setStats] = useState<{ total: number; resolvedByBot: number; handedToAgents: number; rating: number; ratings: number } | null>(null)
  const loadList = useCallback(async () => {
    const response = await fetch(`/api/admin/chat?status=${status}&q=${encodeURIComponent(q)}`, { cache: 'no-store' }).catch(() => null)
    if (response?.ok) setList(await response.json())
  }, [status, q])
  useEffect(() => { void loadList(); const timer = setInterval(() => void loadList(), 5000); return () => clearInterval(timer) }, [loadList])
  useEffect(() => { const id = Number(new URLSearchParams(window.location.search).get('id')); if (id) setActive(id); fetch('/api/admin/chat?view=stats').then((r) => r.json()).then(setStats).catch(() => undefined) }, [])

  return <div className="sa" dir="rtl">
    <header className="sa-head"><div><h1>گفت‌وگوی آنلاین</h1><p className="sa-hint">دستیار هوشمند پاسخ اول را می‌دهد؛ گفت‌وگوهایی که اپراتور می‌خواهند اینجا با اولویت نمایش داده می‌شوند.</p></div></header>
    {stats && <div className="sa-kpis">
      <div className="sa-kpi"><small>گفت‌وگوی ۳۰ روز</small><b className="num">{fa(stats.total)}</b></div>
      <div className="sa-kpi"><small>حل‌شده با دستیار</small><b className="num">{fa(stats.resolvedByBot)}</b><span className="sa-sub">{stats.total ? `${fa(Math.round((stats.resolvedByBot / stats.total) * 100))}٪` : ''}</span></div>
      <div className="sa-kpi"><small>منتقل به اپراتور</small><b className="num">{fa(stats.handedToAgents)}</b></div>
      <div className="sa-kpi"><small>رضایت</small><b>{stats.ratings ? `${stats.rating.toLocaleString('fa-IR')} از ۵` : '—'}</b><span className="sa-sub">{fa(stats.ratings)} امتیاز</span></div>
    </div>}
    <nav className="sa-subtabs" aria-label="بخش‌ها"><button type="button" className={tab === 'console' ? 'is-active' : ''} onClick={() => setTab('console')}>گفت‌وگوها{list?.counts.WAITING ? ` (${fa(list.counts.WAITING)} منتظر)` : ''}</button><button type="button" className={tab === 'settings' ? 'is-active' : ''} onClick={() => setTab('settings')}>تنظیمات دستیار و ساعات کاری</button></nav>
    {tab === 'settings' ? <SettingsForm /> : <div className="cc">
      <section className="cc-list">
        <header>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="وضعیت"><option value="">همهٔ جاری</option><option value="WAITING">منتظر اپراتور</option><option value="mine">گفت‌وگوهای من</option><option value="OPEN">در حال گفت‌وگو</option><option value="BOT">با دستیار</option><option value="CLOSED">بسته</option></select>
          <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجو…" aria-label="جست‌وجو" />
        </header>
        <div className="cc-items">
          {list?.rows.map((row) => <button key={row.id} type="button" className={`cc-item${active === row.id ? ' is-active' : ''}`} onClick={() => setActive(row.id)}>
            <span className="cc-item-top"><b>{row.name}</b>{row.unread > 0 ? <i className="cc-unread">{fa(row.unread)}</i> : <span className={`sa-state ${(STATUS[row.status] || ['', ''])[1]}`}>{(STATUS[row.status] || [row.status])[0]}</span>}</span>
            <small>{row.last ? `${row.last.sender === 'VISITOR' ? '' : row.last.sender === 'BOT' ? 'دستیار: ' : row.last.sender === 'AGENT' ? 'شما: ' : ''}${row.last.body}` : '—'}</small>
            <small>{time(row.lastMessageAt)}{row.contact ? ` · ${row.contact}` : ''}</small>
          </button>)}
          {list && !list.rows.length && <p className="cc-empty">گفت‌وگویی نیست.</p>}
        </div>
      </section>
      {active ? <Conversation key={active} id={active} onChanged={() => void loadList()} /> : <section className="cc-chat"><div className="cc-empty">یک گفت‌وگو را از فهرست انتخاب کنید.</div></section>}
    </div>}
  </div>
}
