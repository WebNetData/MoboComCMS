'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import { useI18n } from '@/i18n/LocaleProvider'

type BotInfo = { id: number; username: string; ownerTelegramId: string; brandName: string; publicUrl: string; cardNumber: string; cardHolder: string; active: boolean; lastError: string; installedAt: string | null; link: string }
type SaleInfo = { id: number; telegramUserId: string; offer: { nameEn: string; nameFa: string }; status: string; currency: string; retailPrice: number; createdAt: string; lastError: string; hasReceipt: boolean; reviewedAt?: string | null; reviewDecision?: string; reviewerUserId?: number | null; reviewerTelegramId?: string }

export default function ResellerBotPage() {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const [bot, setBot] = useState<BotInfo | null>(null)
  const [sales, setSales] = useState<SaleInfo[]>([])
  const [owner, setOwner] = useState(false)
  const [canReview, setCanReview] = useState(false)
  const [form, setForm] = useState({ token: '', ownerTelegramId: '', brandName: '', publicUrl: '', cardNumber: '', cardHolder: '' })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)
  const t = (en: string, faText: string) => fa ? faText : en
  const load = useCallback(async () => {
    const res = await fetch('/api/reseller/bot', { cache: 'no-store' })
    const data = await res.json().catch(() => null)
    if (res.ok) {
      setBot(data.bot)
      setSales(data.sales || [])
      setOwner(Boolean(data.owner))
      setCanReview(Boolean(data.canReview))
      if (data.bot && data.owner) setForm(f => ({ ...f, ownerTelegramId: data.bot.ownerTelegramId, brandName: data.bot.brandName, publicUrl: data.bot.publicUrl, cardNumber: data.bot.cardNumber, cardHolder: data.bot.cardHolder }))
    } else { setMessage(data?.error || t('Could not load bot settings.', 'تنظیمات ربات بارگذاری نشد.')); setError(true) }
    setLoading(false)
  }, [fa])
  useEffect(() => { void load() }, [load])

  async function save() {
    setBusy(true); setMessage(''); setError(false)
    const res = await fetch('/api/reseller/bot', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form) }).catch(() => null)
    const data = await res?.json().catch(() => null)
    setBusy(false)
    if (!res?.ok) { setMessage(data?.error || t('Could not connect the bot.', 'اتصال ربات انجام نشد.')); setError(true); return }
    setForm(f => ({ ...f, token: '' }))
    setMessage(t('Bot connected and webhook installed.', 'ربات متصل شد و وبهوک ثبت شد.'))
    await load()
  }

  async function toggle() {
    if (!bot) return
    setBusy(true); setMessage(''); setError(false)
    const res = await fetch('/api/reseller/bot', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ active: !bot.active }) }).catch(() => null)
    const data = await res?.json().catch(() => null)
    setBusy(false)
    if (!res?.ok) { setMessage(data?.error || t('Could not update bot.', 'تغییر وضعیت ربات انجام نشد.')); setError(true); return }
    setMessage(data.bot.active ? t('Bot activated.', 'ربات فعال شد.') : t('Bot paused.', 'ربات متوقف شد.'))
    await load()
  }

  async function review(saleId: number, action: 'approve' | 'reject') {
    if (action === 'approve' && !window.confirm(t('Have you verified the transfer in your bank account?', 'آیا واریز را در حساب بانکی خود بررسی و تأیید کرده‌اید؟'))) return
    setBusy(true); setMessage(''); setError(false)
    const res = await fetch('/api/reseller/bot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ saleId, action }) }).catch(() => null)
    const data = await res?.json().catch(() => null)
    setBusy(false)
    setMessage(data?.message || data?.error || t('Could not review order.', 'بررسی سفارش انجام نشد.'))
    setError(!res?.ok)
    await load()
  }

  if (loading) return <p className="muted">{t('Loading…', 'در حال بارگذاری…')}</p>
  return <div className="space-y-6" dir={fa ? 'rtl' : 'ltr'}>
    <div className="card p-6"><div className="flex items-center justify-between gap-4 flex-wrap"><div><div className="text-xs uppercase tracking-wide muted">{t('WHITE-LABEL SALES', 'فروش با برند شما')}</div><h1 className="text-3xl font-bold mt-2">{t('Your Telegram sales bot', 'ربات فروش اختصاصی')}</h1><p className="muted mt-2">{t('Your customers see your brand and prices. You review card transfers before a wholesale wallet charge creates their service.', 'مشتری برند و قیمت‌های شما را می‌بیند. پس از بررسی واریز کارت‌به‌کارت، مبلغ عمده از کیف پول شما کسر و سرویس ساخته می‌شود.')}</p></div>{bot && <span className={`badge ${bot.active ? 'badge-green' : 'badge-red'}`}>{bot.active ? t('Active', 'فعال') : t('Paused', 'متوقف')}</span>}</div></div>
    {message && <div className={`card p-4 ${error ? 'text-red-400' : 'text-green-400'}`} role="status">{message}</div>}
    {bot && <div className="card p-6"><div className="flex items-center justify-between gap-4 flex-wrap"><div><h2 className="text-xl font-bold">@{bot.username}</h2><p className="muted mt-1">{bot.brandName}</p>{bot.lastError && <p className="text-red-400 mt-2">{bot.lastError}</p>}</div><div className="flex gap-2 flex-wrap"><a className="btn btn-secondary" href={bot.link} target="_blank" rel="noopener noreferrer">{t('Open bot', 'باز کردن ربات')}</a>{owner && <button className="btn btn-secondary" disabled={busy} onClick={toggle}>{bot.active ? t('Pause bot', 'توقف ربات') : t('Activate bot', 'فعال‌سازی ربات')}</button>}</div></div></div>}
    {owner && <div className="card p-6"><h2 className="text-xl font-bold mb-2">{bot ? t('Update bot settings', 'ویرایش تنظیمات ربات') : t('Connect your bot', 'اتصال ربات شما')}</h2><p className="muted mb-5">{t('Create a separate bot with BotFather. Send /start to your bot from the owner account before accepting orders.', 'در BotFather یک ربات جدا بسازید. با حساب مدیر ربات به آن /start بفرستید تا رسیدها دریافت شوند.')}</p><div className="grid md:grid-cols-2 gap-4">
      <label className="block">{t('Bot token', 'توکن ربات')}<input className="input mt-2 w-full" type="password" autoComplete="off" value={form.token} onChange={e => setForm({ ...form, token: e.target.value })} placeholder={bot ? t('Enter token to reinstall', 'برای ثبت مجدد توکن را وارد کنید') : '123456:…'} /></label>
      <label className="block">{t('Owner numeric Telegram ID', 'شناسه عددی تلگرام مدیر')}<input className="input mt-2 w-full" inputMode="numeric" value={form.ownerTelegramId} onChange={e => setForm({ ...form, ownerTelegramId: e.target.value })} /></label>
      <label className="block">{t('Your brand name', 'نام برند شما')}<input className="input mt-2 w-full" value={form.brandName} onChange={e => setForm({ ...form, brandName: e.target.value })} /></label>
      <label className="block">{t('Public website URL (optional)', 'نشانی سایت شما (اختیاری)')}<input className="input mt-2 w-full" type="url" value={form.publicUrl} onChange={e => setForm({ ...form, publicUrl: e.target.value })} placeholder="https://example.com" /></label>
      <label className="block">{t('Payment card number', 'شماره کارت دریافت وجه')}<input className="input mt-2 w-full" inputMode="numeric" value={form.cardNumber} onChange={e => setForm({ ...form, cardNumber: e.target.value })} /></label>
      <label className="block">{t('Cardholder name', 'نام صاحب کارت')}<input className="input mt-2 w-full" value={form.cardHolder} onChange={e => setForm({ ...form, cardHolder: e.target.value })} /></label>
    </div><div className="flex items-center justify-between gap-4 flex-wrap mt-5"><p className="muted text-sm">{t('Approval is manual. Check the deposit in your bank account before tapping Approve.', 'تأیید پرداخت دستی است؛ پیش از زدن تأیید، واریز را در حساب بانکی بررسی کنید.')}</p><button className="btn btn-primary" disabled={busy || !form.token || !form.ownerTelegramId || !form.brandName || !form.cardNumber || !form.cardHolder} onClick={save}>{busy ? t('Saving…', 'در حال ذخیره…') : t('Save and connect', 'ذخیره و اتصال')}</button></div></div>}
    <div className="card p-6"><div className="flex items-center justify-between gap-3"><h2 className="text-xl font-bold">{t('Recent bot orders', 'سفارش‌های اخیر ربات')}</h2>{owner && <Link href="/reseller/offers" className="text-sky-400">{t('Manage retail plans', 'مدیریت پلن‌ها')}</Link>}</div><div className="space-y-3 mt-5">{sales.length ? sales.map(s => <div key={s.id} className="rounded-xl border border-slate-700/70 p-4 flex justify-between gap-3 flex-wrap"><div><strong>#{s.id} · {fa ? s.offer.nameFa : s.offer.nameEn}</strong><p className="muted text-sm mt-1">Telegram ID {s.telegramUserId} · {new Date(s.createdAt).toLocaleString(fa ? 'fa-IR' : 'en-US')}</p><p className="muted text-sm mt-1">{s.retailPrice} {s.currency}</p>{s.reviewedAt && <p className="muted text-xs mt-1">{t('Reviewed', 'بررسی شده')}: {new Date(s.reviewedAt).toLocaleString(fa ? 'fa-IR' : 'en-US')} · {s.reviewDecision} · {s.reviewerUserId ? `User #${s.reviewerUserId}` : s.reviewerTelegramId ? `Telegram ${s.reviewerTelegramId}` : '—'}</p>}{s.lastError && <p className="text-red-400 text-sm mt-1">{s.lastError}</p>}</div><div className="flex items-center gap-2 flex-wrap"><span className="badge badge-purple">{s.status}</span>{s.hasReceipt && <a className="btn btn-secondary" href={`/api/reseller/bot/sales/${s.id}/receipt`} target="_blank" rel="noopener noreferrer">{t('View receipt', 'دیدن رسید')}</a>}{canReview && s.status === 'REVIEW' && s.hasReceipt && <><button className="btn btn-primary" disabled={busy} onClick={() => review(s.id, 'approve')}>{t('Approve', 'تأیید')}</button><button className="btn btn-secondary" disabled={busy} onClick={() => review(s.id, 'reject')}>{t('Reject', 'رد')}</button></>}</div></div>) : <p className="muted">{t('No orders yet.', 'هنوز سفارشی ثبت نشده است.')}</p>}</div></div>
  </div>
}
