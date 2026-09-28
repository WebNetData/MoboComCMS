'use client'

import { useState } from 'react'
import { Notice, ServerShell, faDate, usePanel, useServerApi, useServerJson } from '../shared'

type Row = { id: number; actorEmail: string; action: string; targetType: string; targetId: string; ip: string; metadata: string; createdAt: string }

const ACTIONS: Record<string, string> = {
  'server.unlock': 'باز کردن پنل', 'server.unlock_failed': 'تلاش ناموفق ورود', 'server.lock': 'قفل پنل',
  'server.file_read': 'خواندن فایل', 'server.file_write': 'ویرایش فایل', 'server.file_mkdir': 'ساخت پوشه', 'server.file_create': 'ساخت فایل',
  'server.file_rename': 'تغییر نام', 'server.file_move': 'انتقال', 'server.file_copy': 'کپی', 'server.file_delete': 'حذف', 'server.file_chmod': 'تغییر دسترسی',
  'server.file_archive': 'ساخت آرشیو', 'server.file_extract': 'باز کردن آرشیو', 'server.file_upload': 'بارگذاری', 'server.file_download': 'دانلود',
  'server.totp_enabled': 'فعال‌سازی کد دومرحله‌ای', 'server.totp_disabled': 'غیرفعال‌سازی کد دومرحله‌ای',
  'server.db_query': 'اجرای کوئری', 'server.db_backup': 'بکاپ پایگاه داده', 'server.db_browse': 'مرور جدول',
  'server.mail_settings': 'تنظیمات ایمیل', 'server.mail_test': 'ایمیل آزمایشی', 'server.mailbox_create': 'ساخت صندوق ایمیل', 'server.mailbox_update': 'ویرایش صندوق ایمیل', 'server.mailbox_delete': 'حذف صندوق ایمیل', 'server.mail_domain': 'دامنهٔ ایمیل', 'server.mail_alias': 'نام مستعار ایمیل', 'server.mail_read': 'خواندن ایمیل', 'server.mail_send': 'ارسال ایمیل از صندوق', 'server.mail_delete': 'حذف ایمیل', 'server.db_export': 'خروجی جدول',
}
const actionLabel = (action: string) => ACTIONS[action] || (action.startsWith('server.service_') ? `سرویس: ${action.slice(15)}` : action)

function TwoStep() {
  const { session, refresh } = usePanel()
  const api = useServerApi()
  const [setup, setSetup] = useState<{ secret: string; qr: string; uri: string } | null>(null)
  const [code, setCode] = useState('')
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const digits = (value: string) => value.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/\D/g, '').slice(0, 6)

  async function call(action: string) {
    setBusy(true); setMessage(null)
    const result = await api<{ secret: string; qr: string; uri: string }>('/api/admin/server/totp', { body: { action, code } })
    setBusy(false)
    if (!result.ok) { setMessage({ tone: 'error', text: result.error }); return }
    if (action === 'begin') { setSetup(result.data); return }
    setSetup(null); setCode('')
    setMessage({ tone: 'ok', text: action === 'confirm' ? 'کد دومرحله‌ای فعال شد؛ از این به بعد هنگام باز کردن پنل لازم است.' : 'کد دومرحله‌ای غیرفعال شد.' })
    await refresh()
  }

  return <section className="sa-card">
    <header className="sa-card-head"><h2>کد دومرحله‌ای برای پنل سرور</h2><span className={`sa-state ${session.totp ? 'is-ok' : 'is-warn'}`}>{session.totp ? 'فعال' : 'غیرفعال'}</span></header>
    <p className="sa-hint">علاوه بر رمز عبور، هر بار باز کردن پنل به کد ۶ رقمی برنامه‌ای مثل Google Authenticator، Microsoft Authenticator یا Aegis نیاز دارد. اگر رمز حساب لو برود، سرور همچنان امن می‌ماند.</p>
    {message && <Notice tone={message.tone}>{message.text}</Notice>}
    {!session.totp && !setup && <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void call('begin')}>فعال‌سازی</button>}
    {setup && <div className="sp-totp">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={setup.qr} alt="کد QR برای افزودن به برنامهٔ احراز هویت" width={180} height={180} />
      <div className="sa-form">
        <p className="sa-hint">۱. کد QR را با برنامهٔ احراز هویت اسکن کنید (یا کلید زیر را دستی وارد کنید).<br />۲. کد ۶ رقمی نمایش‌داده‌شده را بنویسید.</p>
        <code className="sp-secret" dir="ltr">{setup.secret.replace(/(.{4})/g, '$1 ').trim()}</code>
        <label className="sa-field"><span>کد ۶ رقمی</span><input className="input sp-code" dir="ltr" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(digits(e.target.value))} /></label>
        <div className="sa-head-actions"><button type="button" className="btn btn-primary" disabled={busy || code.length !== 6} onClick={() => void call('confirm')}>تأیید و فعال‌سازی</button><button type="button" className="btn btn-ghost" onClick={() => setSetup(null)}>انصراف</button></div>
      </div>
    </div>}
    {session.totp && <div className="sa-toolbar">
      <label className="sa-inline"><span>برای غیرفعال‌سازی، کد فعلی را وارد کنید</span><input className="input sp-code" dir="ltr" inputMode="numeric" value={code} onChange={(e) => setCode(digits(e.target.value))} /></label>
      <button type="button" className="btn btn-ghost" disabled={busy || code.length !== 6} onClick={() => void call('disable')}>غیرفعال‌سازی</button>
    </div>}
  </section>
}

function Settings() {
  const { session } = usePanel()
  return <section className="sa-card">
    <header className="sa-card-head"><h2>قفل‌های امنیتی پنل</h2></header>
    <ul className="sp-locks">
      <li className="is-ok"><b>روشن‌شدن فقط از فایل محیطی سرور</b><span>تا <code dir="ltr">SERVER_PANEL_ENABLED=true</code> نباشد، هیچ‌کس — حتی مدیر اصلی — به این پنل دسترسی ندارد.</span></li>
      <li className="is-ok"><b>مجوز جداگانه</b><span>فقط نقش‌هایی که مجوز «پنل سرور» دارند (در «نقش‌ها و دسترسی‌ها»).</span></li>
      <li className={session.ipRestricted ? 'is-ok' : 'is-bad'}><b>محدودیت IP {session.ipRestricted ? '— فعال' : '— تنظیم نشده'}</b><span>در فایل محیطی: <code dir="ltr">SERVER_PANEL_ALLOWED_IPS=1.2.3.4,10.8.0.0/24</code> — IP فعلی شما: <bdi dir="ltr">{session.ip}</bdi></span></li>
      <li className="is-ok"><b>تأیید دوبارهٔ رمز</b><span>پنل هر {session.unlockMinutes.toLocaleString('fa-IR')} دقیقه قفل می‌شود و قفل به همین IP و همین رمز گره خورده است (<code dir="ltr">SERVER_PANEL_UNLOCK_MINUTES</code>).</span></li>
      <li className={session.totp ? 'is-ok' : 'is-bad'}><b>کد دومرحله‌ای {session.totp ? '— فعال' : '— غیرفعال'}</b><span>پیشنهاد جدی: فعال کنید.</span></li>
      <li className="is-ok"><b>ثبت همهٔ کارها</b><span>هر خواندن، تغییر، دانلود، کوئری و ورود ناموفق در گزارش زیر و «گزارش فعالیت مدیران» ثبت می‌شود.</span></li>
      <li className="is-ok"><b>مسیرهای محافظت‌شده</b><span>proc، sys و dev غیرقابل دسترس‌اند؛ bin، lib، boot و usr فقط‌خواندنی‌اند؛ ریشهٔ پوشه‌های اصلی و پوشهٔ برنامه حذف نمی‌شوند.</span></li>
    </ul>
    <p className="sa-hint">محدودهٔ دسترسی: <bdi dir="ltr">{session.root}</bdi> (با <code dir="ltr">SERVER_PANEL_ROOT</code> می‌توانید آن را به یک پوشه محدود کنید). دسترسی واقعی به هر فایل همچنین به مجوزهای کاربر سیستمی سرویس سایت بستگی دارد.</p>
  </section>
}

function Activity() {
  const { data, error } = useServerJson<{ rows: Row[] }>('/api/admin/server/activity')
  return <section className="sa-card sa-table-wrap sp-tc">
    <header className="sa-card-head"><h2>گزارش فعالیت پنل سرور</h2><small>۱۰۰ مورد آخر</small></header>
    {error && <Notice tone="error">{error}</Notice>}
    {!data ? <div className="sa-skeleton" /> : <table className="data sa-table"><thead><tr><th>زمان</th><th>مدیر</th><th>کار</th><th>مسیر / هدف</th><th>IP</th></tr></thead><tbody>
      {data.rows.map((row) => <tr key={row.id} className={row.action === 'server.unlock_failed' ? 'sp-bad-row' : ''}><td><small>{faDate(row.createdAt, true)}</small></td><td dir="ltr"><small>{row.actorEmail}</small></td><td>{actionLabel(row.action)}</td><td dir="ltr"><code className="sp-trunc">{row.targetId || '—'}</code></td><td dir="ltr"><small>{row.ip || '—'}</small></td></tr>)}
      {!data.rows.length && <tr><td colSpan={5} className="sa-empty">هنوز فعالیتی ثبت نشده است.</td></tr>}
    </tbody></table>}
  </section>
}

export default function SecurityPage() {
  return <ServerShell title="امنیت پنل سرور"><TwoStep /><Settings /><Activity /></ServerShell>
}
