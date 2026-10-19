'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { Notice, ServerShell, bytes, fa, faDate, useServerApi, useServerJson } from '../shared'
import { Pager } from '../../store/shared'
import Link from '@/components/AppLink'

type Status = { dir: string; installed: boolean; writable: boolean; imap: boolean; hostname: string; dkim: boolean }
type Registry = { domains: string[]; mailboxes: { address: string; quotaMb: number; disabled: boolean }[]; aliases: { address: string; targets: string[] }[] }
type Overview = { status: Status; registry: Registry | null }
type Tone = { tone: 'ok' | 'error'; text: string } | null

function Install({ status }: { status: Status }) {
  return <section className="sa-card sp-blocked">
    <h2>ایمیل دامنه هنوز روی سرور راه‌اندازی نشده است</h2>
    <p>برای ساخت صندوق‌هایی مثل <bdi dir="ltr">info@yourdomain.com</bdi>، Postfix و Dovecot باید یک بار با اسکریپت آماده نصب شوند. اسکریپت، سرویس‌ها را طوری تنظیم می‌کند که این پنل بتواند دامنه، صندوق و نام مستعار بسازد و نامه‌ها را بخواند.</p>
    <pre className="sp-pre" dir="ltr">{'cd /opt/mobocom/app\nsudo MAIL_HOSTNAME=mail.yourdomain.com bash deploy/ubuntu/server-panel-install.sh\nsudo systemctl restart mobocom'}</pre>
    <p className="sa-hint">پوشهٔ تنظیمات: <bdi dir="ltr">{status.dir}</bdi> — {status.installed ? (status.writable ? 'آماده' : 'وجود دارد اما برنامه اجازهٔ نوشتن ندارد') : 'وجود ندارد'}. پورت‌های ۲۵، ۵۸۷ و ۹۹۳ باید در فایروال و سرویس‌دهندهٔ سرور باز باشند.</p>
  </section>
}

function Dns({ domain }: { domain: string }) {
  const { data, error, loading, reload } = useServerJson<{ records: { type: string; name: string; value: string; purpose: string; ok: boolean }[] }>(`/api/admin/server/mail?view=dns&domain=${domain}`)
  return <div className="sp-dns">
    {error && <Notice tone="error">{error}</Notice>}
    {!data ? <div className="sa-skeleton" style={{ height: 120 }} /> : <table className="data sa-table" style={{ minWidth: 640 }}><thead><tr><th>نوع</th><th>نام</th><th>مقدار</th><th>کاربرد</th><th>وضعیت</th></tr></thead><tbody>
      {data.records.map((record) => <tr key={`${record.type}-${record.name}`}><td dir="ltr"><code>{record.type}</code></td><td dir="ltr"><code className="sp-trunc">{record.name}</code></td><td dir="ltr"><code className="sp-copy" onClick={() => void navigator.clipboard?.writeText(record.value)} title="کپی">{record.value}</code></td><td><small>{record.purpose}</small></td><td><span className={`sa-state ${record.ok ? 'is-ok' : 'is-warn'}`}>{record.ok ? 'ثبت شده' : 'ثبت نشده'}</span></td></tr>)}
    </tbody></table>}
    <button type="button" className="btn btn-ghost btn-sm" disabled={loading} onClick={() => void reload()}>بررسی دوبارهٔ DNS</button>
  </div>
}

function Mailboxes({ registry, reload }: { registry: Registry; reload: () => void }) {
  const api = useServerApi()
  const [notice, setNotice] = useState<Tone>(null)
  const [domain, setDomain] = useState('')
  const [box, setBox] = useState({ local: '', domain: registry.domains[0] || '', password: '', quotaMb: 0 })
  const [alias, setAlias] = useState({ address: '', targets: '' })
  const [dns, setDns] = useState('')
  const [busy, setBusy] = useState(false)

  async function op(body: Record<string, unknown>, success: string) {
    setBusy(true); setNotice(null)
    const result = await api<{ warning?: string }>('/api/admin/server/mail', { body })
    setBusy(false)
    setNotice(result.ok ? (result.data.warning ? { tone: 'error', text: result.data.warning } : { tone: 'ok', text: success }) : { tone: 'error', text: result.error })
    if (result.ok) reload()
    return result.ok
  }
  // The first domain may be added after this form mounted.
  const boxDomain = registry.domains.includes(box.domain) ? box.domain : registry.domains[0] || ''
  const suggest = () => { const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const random = crypto.getRandomValues(new Uint32Array(16)); setBox((current) => ({ ...current, password: Array.from(random, (n) => chars[n % chars.length]).join('') + '7a' })) }

  return <>
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    <section className="sa-card">
      <header className="sa-card-head"><h2>دامنه‌ها</h2></header>
      <form className="sa-toolbar" onSubmit={(e) => { e.preventDefault(); void op({ op: 'domain-add', domain }, `دامنهٔ ${domain} اضافه شد؛ رکوردهای DNS آن را ثبت کنید.`).then((done) => { if (done) { setDns(domain.toLowerCase()); setDomain('') } }) }}>
        <input className="input" dir="ltr" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" aria-label="دامنهٔ جدید" />
        <button type="submit" className="btn btn-primary" disabled={busy || !domain.includes('.')}>افزودن دامنه</button>
      </form>
      <ul className="sp-domains">{registry.domains.map((item) => <li key={item}>
        <b dir="ltr">{item}</b><small>{fa(registry.mailboxes.filter((m) => m.address.endsWith(`@${item}`)).length)} صندوق</small>
        <span className="sa-grow" />
        <button type="button" className="sa-link" onClick={() => setDns(dns === item ? '' : item)}>{dns === item ? 'بستن DNS' : 'رکوردهای DNS'}</button>
        <button type="button" className="sa-link is-danger" onClick={() => { if (window.confirm(`دامنهٔ ${item} حذف شود؟`)) void op({ op: 'domain-remove', domain: item }, 'دامنه حذف شد.') }}>حذف</button>
        {dns === item && <div className="sp-dns-wrap"><Dns domain={item} /></div>}
      </li>)}{!registry.domains.length && <li className="sa-empty">هنوز دامنه‌ای اضافه نشده است.</li>}</ul>
    </section>
    {registry.domains.length > 0 && <div className="sa-cols">
      <section className="sa-card sa-table-wrap sp-tc">
        <header className="sa-card-head"><h2>صندوق‌های ایمیل</h2><small>{fa(registry.mailboxes.length)} صندوق</small></header>
        <table className="data sa-table" style={{ minWidth: 560 }}><thead><tr><th>نشانی</th><th>سهمیه</th><th>وضعیت</th><th /></tr></thead><tbody>
          {registry.mailboxes.map((item) => <tr key={item.address}>
            <td dir="ltr"><b>{item.address}</b></td>
            <td>{item.quotaMb ? `${fa(item.quotaMb)} MB` : 'نامحدود'}</td>
            <td><span className={`sa-state ${item.disabled ? 'is-warn' : 'is-ok'}`}>{item.disabled ? 'غیرفعال' : 'فعال'}</span></td>
            <td className="sp-row-actions">
              <button type="button" className="sa-link" onClick={() => { const password = window.prompt(`رمز جدید ${item.address} (دست‌کم ۱۰ نویسه، حرف و عدد):`); if (password) void op({ op: 'mailbox-update', address: item.address, password }, 'رمز تغییر کرد.') }}>تغییر رمز</button>
              <button type="button" className="sa-link" onClick={() => { const value = window.prompt('سهمیه به مگابایت (۰ = نامحدود):', String(item.quotaMb)); if (value !== null) void op({ op: 'mailbox-update', address: item.address, quotaMb: Number(value) }, 'سهمیه ذخیره شد.') }}>سهمیه</button>
              <button type="button" className="sa-link" onClick={() => void op({ op: 'mailbox-update', address: item.address, disabled: !item.disabled }, item.disabled ? 'فعال شد.' : 'غیرفعال شد.')}>{item.disabled ? 'فعال‌سازی' : 'غیرفعال'}</button>
              <button type="button" className="sa-link is-danger" onClick={() => { if (window.confirm(`صندوق ${item.address} حذف شود؟ ورود و دریافت نامه متوقف می‌شود؛ نامه‌های قبلی روی دیسک می‌مانند.`)) void op({ op: 'mailbox-delete', address: item.address }, 'صندوق حذف شد.') }}>حذف</button>
            </td>
          </tr>)}
          {!registry.mailboxes.length && <tr><td colSpan={4} className="sa-empty">صندوقی نیست.</td></tr>}
        </tbody></table>
      </section>
      <div className="sa-stack">
        <form className="sa-card sa-form" onSubmit={(e) => { e.preventDefault(); void op({ op: 'mailbox-create', ...box, domain: boxDomain }, `صندوق ${box.local}@${boxDomain} ساخته شد.`).then((done) => { if (done) setBox({ ...box, local: '', password: '' }) }) }}>
          <header className="sa-card-head"><h2>صندوق جدید</h2></header>
          <div className="sp-address-field" dir="ltr"><input className="input" value={box.local} onChange={(e) => setBox({ ...box, local: e.target.value.toLowerCase() })} placeholder="info" aria-label="نام صندوق" /><span>@</span><select className="select" value={boxDomain} onChange={(e) => setBox({ ...box, domain: e.target.value })} aria-label="دامنه">{registry.domains.map((item) => <option key={item}>{item}</option>)}</select></div>
          <label className="sa-field"><span>رمز</span><div className="sa-toolbar"><input className="input" dir="ltr" value={box.password} onChange={(e) => setBox({ ...box, password: e.target.value })} autoComplete="new-password" /><button type="button" className="btn btn-ghost btn-sm" onClick={suggest}>رمز تصادفی</button></div></label>
          <label className="sa-field"><span>سهمیه (مگابایت، ۰ = نامحدود)</span><input className="input" type="number" min={0} value={box.quotaMb} onChange={(e) => setBox({ ...box, quotaMb: Number(e.target.value) })} /></label>
          <button type="submit" className="btn btn-primary" disabled={busy || !box.local || !box.password}>ساخت صندوق</button>
          {registry.domains[0] && <p className="sa-hint">تنظیم برنامهٔ ایمیل (Outlook، Gmail، گوشی): IMAP پورت ۹۹۳ (SSL)، SMTP پورت ۵۸۷ (STARTTLS)، نام کاربری = نشانی کامل ایمیل.</p>}
        </form>
        <section className="sa-card sa-form">
          <header className="sa-card-head"><h2>نام‌های مستعار (فوروارد)</h2></header>
          <ul className="sp-aliases">{registry.aliases.map((item) => <li key={item.address}><b dir="ltr">{item.address}</b><span dir="ltr">→ {item.targets.join(', ')}</span><button type="button" className="sa-link is-danger" onClick={() => void op({ op: 'alias-delete', address: item.address }, 'حذف شد.')}>حذف</button></li>)}{!registry.aliases.length && <li className="sa-hint">نام مستعاری نیست.</li>}</ul>
          <form className="sa-form" onSubmit={(e) => { e.preventDefault(); void op({ op: 'alias-save', ...alias }, 'نام مستعار ذخیره شد.').then((done) => { if (done) setAlias({ address: '', targets: '' }) }) }}>
            <input className="input" dir="ltr" value={alias.address} onChange={(e) => setAlias({ ...alias, address: e.target.value })} placeholder={`sales@${registry.domains[0] || 'example.com'}`} aria-label="نشانی مستعار" />
            <input className="input" dir="ltr" value={alias.targets} onChange={(e) => setAlias({ ...alias, targets: e.target.value })} placeholder="info@example.com, me@gmail.com" aria-label="مقصدها" />
            <button type="submit" className="btn btn-ghost" disabled={busy || !alias.address || !alias.targets}>ذخیرهٔ نام مستعار</button>
          </form>
        </section>
      </div>
    </div>}
  </>
}

type Folder = { path: string; name: string; special: string; messages: number; unseen: number }
type Message = { uid: number; from: string; to: string; cc: string; subject: string; date: string; text: string; html: string; attachments: { name: string; size: number; type: string }[]; messageId: string }

const FOLDER_LABEL: Record<string, string> = { '\\Inbox': 'صندوق ورودی', '\\Sent': 'ارسال‌شده', '\\Drafts': 'پیش‌نویس', '\\Trash': 'سطل زباله', '\\Junk': 'هرزنامه', '\\Archive': 'بایگانی' }

function Webmail({ registry }: { registry: Registry }) {
  const api = useServerApi()
  const active = registry.mailboxes.filter((item) => !item.disabled)
  const [box, setBox] = useState(active[0]?.address || '')
  const [folder, setFolder] = useState('INBOX')
  const [page, setPage] = useState(1)
  const folders = useServerJson<{ folders: Folder[] }>(box ? `/api/admin/server/mail?view=folders&box=${encodeURIComponent(box)}` : null)
  const list = useServerJson<{ rows: { uid: number; from: string; subject: string; date: string; seen: boolean; size: number }[]; page: number; pages: number; total: number }>(box ? `/api/admin/server/mail?view=messages&box=${encodeURIComponent(box)}&folder=${encodeURIComponent(folder)}&page=${page}` : null)
  const [message, setMessage] = useState<Message | null>(null)
  const [compose, setCompose] = useState<{ to: string; subject: string; text: string; inReplyTo?: string } | null>(null)
  const [notice, setNotice] = useState<Tone>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { setMessage(null); setPage(1) }, [box, folder])

  async function open(uid: number) {
    const result = await api<Message>(`/api/admin/server/mail?view=message&box=${encodeURIComponent(box)}&folder=${encodeURIComponent(folder)}&uid=${uid}`)
    if (result.ok) { setMessage(result.data); setCompose(null); void list.reload() } else setNotice({ tone: 'error', text: result.error })
  }
  async function remove() {
    if (!message || !window.confirm('این نامه حذف شود؟')) return
    const result = await api('/api/admin/server/mail', { body: { op: 'message-delete', box, folder, uid: message.uid } })
    if (result.ok) { setMessage(null); void list.reload(); void folders.reload() } else setNotice({ tone: 'error', text: result.error })
  }
  async function send(event: FormEvent) {
    event.preventDefault()
    if (!compose) return
    setBusy(true)
    const result = await api('/api/admin/server/mail', { body: { op: 'send', box, ...compose } })
    setBusy(false)
    setNotice(result.ok ? { tone: 'ok', text: 'نامه ارسال شد.' } : { tone: 'error', text: result.error })
    if (result.ok) setCompose(null)
  }

  if (!active.length) return <p className="sa-card sa-empty">اول یک صندوق ایمیل بسازید.</p>
  return <>
    <div className="sa-toolbar">
      <label className="sa-inline"><span>صندوق</span><select className="select" dir="ltr" value={box} onChange={(e) => setBox(e.target.value)}>{active.map((item) => <option key={item.address}>{item.address}</option>)}</select></label>
      <button type="button" className="btn btn-primary" onClick={() => { setCompose({ to: '', subject: '', text: '' }); setMessage(null) }}>نامهٔ جدید</button>
      <button type="button" className="btn btn-ghost" onClick={() => { void folders.reload(); void list.reload() }}>⟳ تازه‌سازی</button>
    </div>
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    {(folders.error || list.error) && <Notice tone="error">{folders.error || list.error}</Notice>}
    <div className="sp-mail">
      <div className="sa-stack">
        <nav className="sa-card sp-tables" aria-label="پوشه‌ها">{(folders.data?.folders || []).map((item) => <button key={item.path} type="button" className={folder === item.path ? 'is-active' : ''} onClick={() => setFolder(item.path)}><span>{FOLDER_LABEL[item.special] || (item.path === 'INBOX' ? 'صندوق ورودی' : item.name)}</span><small className="num">{item.unseen ? `${fa(item.unseen)} نو · ` : ''}{fa(item.messages)}</small></button>)}</nav>
        <div className="sa-card sp-msgs">{(list.data?.rows || []).map((row) => <button key={row.uid} type="button" className={`${message?.uid === row.uid ? 'is-active' : ''}${row.seen ? '' : ' is-new'}`} onClick={() => void open(row.uid)}><b>{row.subject}</b><small dir="auto">{row.from}</small><small>{faDate(row.date, true)} · {bytes(row.size)}</small></button>)}
          {list.data && !list.data.rows.length && <p className="sa-empty">نامه‌ای نیست.</p>}</div>
        {list.data && <Pager page={list.data.page} pages={list.data.pages} onPage={setPage} />}
      </div>
      <section className="sa-card">
        {compose ? <form className="sa-form" onSubmit={send}>
          <header className="sa-card-head"><h2>نامهٔ جدید از <bdi dir="ltr">{box}</bdi></h2></header>
          <input className="input" dir="ltr" value={compose.to} onChange={(e) => setCompose({ ...compose, to: e.target.value })} placeholder="to@example.com" aria-label="گیرنده" required />
          <input className="input" value={compose.subject} onChange={(e) => setCompose({ ...compose, subject: e.target.value })} placeholder="موضوع" aria-label="موضوع" />
          <textarea className="input sp-compose" dir="auto" value={compose.text} onChange={(e) => setCompose({ ...compose, text: e.target.value })} rows={14} aria-label="متن نامه" required />
          <div className="sa-head-actions"><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'در حال ارسال…' : 'ارسال'}</button><button type="button" className="btn btn-ghost" onClick={() => setCompose(null)}>انصراف</button></div>
        </form> : message ? <article>
          <header className="sp-msg-head">
            <h3 dir="auto">{message.subject}</h3>
            <small dir="auto">از: {message.from}</small>
            <small dir="auto">به: {message.to}{message.cc ? ` · رونوشت: ${message.cc}` : ''}</small>
            <small>{faDate(message.date, true)}</small>
            <div className="sa-head-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCompose({ to: message.from.match(/<([^>]+)>/)?.[1] || message.from, subject: /^re:/i.test(message.subject) ? message.subject : `Re: ${message.subject}`, text: `\n\n---\n${message.text.slice(0, 4000).split('\n').map((line) => `> ${line}`).join('\n')}`, inReplyTo: message.messageId })}>پاسخ</button>
              <button type="button" className="btn btn-ghost btn-sm sp-danger" onClick={() => void remove()}>حذف</button>
            </div>
          </header>
          {message.html ? <iframe className="sp-msg-frame" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={`<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><base target="_blank"><body style="font-family:system-ui,Tahoma,sans-serif;margin:12px">${message.html}</body>`} title="متن نامه" /> : <div className="sp-msg-body" dir="auto">{message.text}</div>}
          {message.attachments.length > 0 && <p className="sa-hint">پیوست‌ها: {message.attachments.map((file) => `${file.name} (${bytes(file.size)})`).join('، ')}</p>}
        </article> : <p className="sa-empty">یک نامه را انتخاب کنید.</p>}
      </section>
    </div>
  </>
}

function Mail() {
  const { data, error, reload } = useServerJson<Overview>('/api/admin/server/mail')
  const [tab, setTab] = useState<'send' | 'boxes' | 'read'>('boxes')
  if (error) return <Notice tone="error">{error}</Notice>
  if (!data) return <div className="sa-skeleton" />
  return <>
    <nav className="sa-subtabs sp-subtabs" aria-label="بخش‌های ایمیل">
      {([['boxes', 'دامنه‌ها و صندوق‌ها'], ['read', 'خواندن نامه‌ها'], ['send', 'ارسال ایمیل سایت']] as const).map(([id, label]) => <button key={id} type="button" className={tab === id ? 'is-active' : ''} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}
    </nav>
    {tab === 'send' && <section className="sa-card sp-blocked">
      <h2>ارسال ایمیل سایت به صفحهٔ «ایمیل سایت» منتقل شد</h2>
      <p>حساب ارسال (مثلاً جیمیل)، ایمیل اطلاع‌رسانی به کاربران، ارسال آزمایشی و گزارش ارسال‌ها در مدیریت سایت است و به روشن بودن پنل سرور یا ایمیل‌سرور روی این سرور نیازی ندارد.</p>
      <Link className="btn btn-primary" href="/admin/email">رفتن به ایمیل سایت</Link>
    </section>}
    {tab !== 'send' && !data.status.installed && <Install status={data.status} />}
    {tab === 'boxes' && data.status.installed && data.registry && <Mailboxes registry={data.registry} reload={() => void reload()} />}
    {tab === 'read' && data.status.installed && data.registry && (data.status.imap ? <Webmail registry={data.registry} /> : <Notice tone="error">برای خواندن نامه‌ها MAIL_MASTER_USER و MAIL_MASTER_PASSWORD باید در فایل محیطی باشند (اسکریپت نصب آن‌ها را می‌سازد).</Notice>)}
  </>
}

export default function MailPage() {
  return <ServerShell title="ایمیل"><Mail /></ServerShell>
}
