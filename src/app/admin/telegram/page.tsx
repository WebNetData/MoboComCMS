'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/i18n/LocaleProvider'
import ReminderSettings from './ReminderSettings'
import BackupSettings from './BackupSettings'

export default function TelegramAdmin() {
  const { locale } = useI18n()
  const L = (en: string, fa: string) => locale === 'fa' ? fa : en
  const [status, setStatus] = useState<any>(null)
  const [form, setForm] = useState({ token: '', username: '', enabled: true, webhookSecret: '' })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function load() {
    try {
      const response = await fetch('/api/admin/telegram')
      const data = await response.json()
      if (!response.ok) throw Error()
      setStatus(data)
      setForm(current => ({ ...current, username: data.username, enabled: data.enabled }))
    } catch { setMessage(L('Could not load Telegram status. Please try again.', 'دریافت وضعیت ممکن نشد؛ دوباره تلاش کنید.')) }
  }

  useEffect(() => { void load() }, [locale])

  async function run(action: string) {
    setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/admin/telegram', {
        method: action === 'save' ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(action === 'save' ? form : { action }),
      })
      const data = await response.json()
      if (!response.ok || data.ok === false) throw Error(data.error || data.steps?.map((step: any) => `${step.step}: ${step.detail}`).join('\n') || L('Operation failed', 'عملیات انجام نشد'))
      setMessage(data.steps?.map((step: any) => `${step.ok ? '✓' : '×'} ${step.step}: ${step.detail}`).join('\n') || L('Settings saved', 'تنظیمات ذخیره شد'))
      setForm(current => ({ ...current, token: '', webhookSecret: '' }))
      await load()
    } catch (error) { setMessage(error instanceof Error ? error.message : L('Could not connect', 'ارتباط برقرار نشد')) }
    finally { setBusy(false) }
  }

  return <div><div className="appbar"><div><h1 className="h2">{L('Telegram bot and Mini App', 'ربات و مینی‌اپ تلگرام')}</h1><p className="muted">{L('One account, wallet and subscription history across the website and Telegram', 'یک حساب، یک کیف پول و اشتراک‌های مشترک در سایت و تلگرام')}</p></div><a className="btn btn-ghost" href="/miniapp" target="_blank" rel="noreferrer">{L('Open Mini App ↗', 'نمایش مینی‌اپ ↗')}</a></div>
    <div className="grid-2"><form className="card" onSubmit={event => { event.preventDefault(); void run('save') }}><h2 className="font-bold mb-4">{L('Bot connection', 'اتصال ربات')}</h2><label className="label" htmlFor="bot-token">{L('BotFather token', 'توکن ربات (از BotFather)')} {status?.hasToken ? L('· saved', '· ذخیره شده') : ''}</label><input id="bot-token" type="password" autoComplete="new-password" className="input mb-4" dir="ltr" value={form.token} onChange={event => setForm({ ...form, token: event.target.value })} placeholder={L('Enter a new token here', 'توکن جدید را اینجا وارد کنید')} /><label className="label" htmlFor="bot-name">{L('Bot username', 'نام کاربری ربات')}</label><input id="bot-name" className="input mb-4" dir="ltr" value={form.username} onChange={event => setForm({ ...form, username: event.target.value })} placeholder="your_bot" /><label className="label" htmlFor="webhook-secret">{L('Webhook secret (leave blank to keep current)', 'کلید امنیتی وب‌هوک (خالی: حفظ مقدار فعلی)')}</label><input id="webhook-secret" type="password" autoComplete="new-password" className="input mb-4" dir="ltr" value={form.webhookSecret} onChange={event => setForm({ ...form, webhookSecret: event.target.value })} /><label className="flex gap-2 mb-4"><input type="checkbox" checked={form.enabled} onChange={event => setForm({ ...form, enabled: event.target.checked })} />{L('Enable bot and Telegram sign-in', 'فعال بودن ورود و ربات')}</label><button className="btn btn-primary" disabled={busy}>{L('Save settings', 'ذخیره تنظیمات')}</button><p className="muted text-xs mt-3">{L('The token is never returned to the browser. Environment variables take precedence over settings on this page.', 'توکن در مرورگر بازگردانده نمی‌شود. در استقرار، متغیرهای محیطی بر تنظیمات این صفحه اولویت دارند.')}</p></form>
    <div className="card"><h2 className="font-bold mb-4">{L('Setup and sync', 'راه‌اندازی و همگام‌سازی')}</h2><p className="muted mb-4">{L('Set the public HTTPS domain in site settings first. Then install the secure webhook, bot menu and commands.', 'ابتدا دامنه عمومی HTTPS را در تنظیمات سایت ثبت کنید. سپس وب‌هوک امن، منو و دستورهای ربات را نصب کنید.')}</p><p className="muted mb-3" dir="ltr" style={{ overflowWrap: 'anywhere' }}>Webhook: {status?.expectedWebhook}</p><p className="mb-3">{L('Bot identity', 'هویت ربات')}: <b dir="ltr">{status?.me?.username ? `@${status.me.username}` : L('Not verified', 'هنوز تأیید نشده')}</b></p><p className="mb-3">{L('Linked accounts', 'حساب‌های متصل')}: <b>{status?.linkedUsers ?? '—'}</b></p><p className="muted text-xs mb-4" dir="ltr" style={{ overflowWrap: 'anywhere' }}>{status?.miniAppUrl}</p><div className="flex gap-2 flex-wrap"><button className="btn btn-primary" disabled={busy || !status?.hasToken} onClick={() => run('install')}>{L('Install and connect bot', 'نصب و اتصال ربات')}</button><button className="btn btn-ghost" disabled={busy} onClick={() => load()}>{L('Check status', 'بررسی وضعیت')}</button></div><p className="muted text-sm mt-3">{status?.meError === 'no token' ? L('No bot token saved yet.', 'هنوز توکن ربات ثبت نشده است.') : status?.webhook?.lastError || status?.meError || ''}</p></div></div>
    <ReminderSettings />
    <BackupSettings />
    {message && <pre className="card mt-4" role="status" style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{message}</pre>}
  </div>
}
