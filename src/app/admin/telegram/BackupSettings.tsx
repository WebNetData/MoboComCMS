'use client'
import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '@/i18n/LocaleProvider'

interface Manifest {
  id: string
  createdAt: string
  bytes: number
  sha256: string
  reason?: string
  restore?: { ok?: boolean; checkedAt?: string } | null
  telegram?: { sentAt?: string; parts?: { name: string }[] } | null
}

interface BackupConfig {
  enabled: boolean
  telegramEnabled: boolean
  restoreTestEnabled: boolean
  chatId: string
  retentionDays: number
  dailyRetentionDays: number
}

interface BackupData {
  config: BackupConfig
  state: { status?: string; startedAt?: string; finishedAt?: string; error?: string; telegram?: string; restore?: { ok?: boolean } | null; lastRestore?: { at: string; ok: boolean; backupId: string } | null; lastRestoreTest?: { at: string; ok: boolean; backupId: string } | null } | null
  backups: Manifest[]
  busy: boolean
  postgres: boolean
  hasKey: boolean
  scheduler: boolean
}

const statusLabels: Record<string, { en: string; fa: string }> = {
  RUNNING: { en: 'Running', fa: 'در حال اجرا' }, SUCCESS: { en: 'Successful', fa: 'موفق' },
  PARTIAL: { en: 'Backup created; Telegram delivery incomplete', fa: 'بکاپ ساخته شد؛ ارسال تلگرام کامل نشد' },
  FAILED: { en: 'Failed', fa: 'ناموفق' }, SENT: { en: 'Sent', fa: 'ارسال شد' },
  DISABLED: { en: 'Disabled', fa: 'غیرفعال' },
  FAILED_OR_UNCERTAIN: { en: 'Failed or unconfirmed delivery', fa: 'ارسال ناموفق یا تأییدنشده' },
}

const size = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MB`
const short = (hash: string) => `${hash.slice(0, 12)}…`

export default function BackupSettings() {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const L = (en: string, persian: string) => fa ? persian : en
  const when = (iso?: string | null) => iso ? new Date(iso).toLocaleString(fa ? 'fa-IR' : 'en-US') : '—'
  const stateLabel = (value?: string | null) => statusLabels[value || '']?.[locale] || value || '—'
  const [data, setData] = useState<BackupData | null>(null)
  const [form, setForm] = useState<BackupConfig | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [confirmId, setConfirmId] = useState('')
  const [confirmText, setConfirmText] = useState('')

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/backups', { cache: 'no-store' })
      if (!response.ok) throw new Error()
      const body: BackupData = await response.json()
      setData(body)
      setForm(body.config)
    } catch { setMessage(L('Could not load backup status', 'دریافت وضعیت بکاپ ممکن نشد')) }
  }, [locale])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!data?.busy) return
    const timer = setInterval(() => { void load() }, 5000)
    return () => clearInterval(timer)
  }, [data?.busy, load])

  async function call(method: 'PATCH' | 'POST', body: unknown, okText: string) {
    setBusy(true)
    setMessage('')
    try {
      const response = await fetch('/api/admin/backups', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(fa ? payload?.error || 'عملیات انجام نشد' : 'Backup operation failed. Check server logs for details.')
      setMessage(okText)
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : L('Connection error', 'خطای ارتباط'))
    } finally { setBusy(false) }
  }

  const status = data?.state?.status
  const restoreBlocked = busy || !data?.postgres || !data?.hasKey


  return (
    <section className="card mt-4">
      <h2 className="font-bold mb-3">{L('PostgreSQL backup and Telegram delivery', 'بکاپ PostgreSQL و ارسال به تلگرام')}</h2>
      <p className="muted mb-4">
        {L('Encrypted backups run every 2 hours with daily retention and automatic restore tests. Backups are sent only to the configured admin Telegram ID. Start the bot first to enable delivery. You can run backups and restores here.', 'بکاپ رمزگذاری‌شده هر ۲ ساعت با نگهداری روزانه و آزمون بازیابی خودکار. فایل بکاپ فقط به شناسه عددی تلگرام همین ادمین ارسال می‌شود؛ ابتدا در ربات Start بزنید تا ارسال ممکن شود. بکاپ دستی و بازیابی را هم از همین کارت می‌توانید انجام دهید.')}
      </p>

      {data && (
        <p className="mb-3">
          PostgreSQL: {data.postgres ? L('Ready', 'آماده') : L('Disabled', 'غیرفعال')} · {L('Encryption key', 'کلید رمزگذاری')}: {data.hasKey ? L('Ready', 'آماده') : L('Not set', 'تنظیم نشده')} · {L('Scheduler', 'زمان‌بند')}: {data.scheduler ? L('Active', 'فعال') : L('Disabled', 'غیرفعال')} · {L('Last run', 'آخرین اجرا')}: {stateLabel(status)} {data.busy ? L('(running)', '(در حال اجرا)') : ''}
        </p>
      )}

      {form && (
        <form onSubmit={(e) => { e.preventDefault(); void call('PATCH', form, L('Settings saved.', 'تنظیمات ذخیره شد.')) }}>
          <fieldset disabled={busy} style={{ border: 0, padding: 0, minWidth: 0 }}>
            {([['enabled', L('Automatic backup every 2 hours', 'بکاپ خودکار هر ۲ ساعت')], ['telegramEnabled', L('Send encrypted backups to my Telegram', 'ارسال بکاپ رمزگذاری‌شده به تلگرام من')], ['restoreTestEnabled', L('Daily restore test', 'آزمون بازیابی روزانه')]] as const).map(([key, label]) => (
              <label className="flex gap-2 mb-3" key={key}>
                <input type="checkbox" checked={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.checked })} />
                {label}
              </label>
            ))}
            <label className="label">
              {L('Admin Telegram numeric ID (chat ID)', 'شناسه عددی تلگرام ادمین (chat id)')}
              <input className="input mt-2 mb-1" dir="ltr" inputMode="numeric" value={form.chatId} onChange={(e) => setForm({ ...form, chatId: e.target.value })} placeholder="123456789" />
            </label>
            <p className="muted text-xs mb-3">{L('To find the ID, message', 'برای گرفتن شناسه، در تلگرام به')} <span dir="ltr">@userinfobot</span> {L('on Telegram. Backups are sent only to this ID.', 'پیام بدهید. بکاپ فقط به همین شناسه ارسال می‌شود.')}</p>
            <div className="grid-2">
              <label className="label">{L('Keep all backups (days)', 'نگهداری همه بکاپ‌ها (روز)')}
                <input type="number" min={1} max={90} className="input mt-2" value={form.retentionDays} onChange={(e) => setForm({ ...form, retentionDays: Number(e.target.value) })} />
              </label>
              <label className="label">{L('Keep one daily backup (days)', 'نگهداری یک بکاپ در روز (روز)')}
                <input type="number" min={form.retentionDays} max={365} className="input mt-2" value={form.dailyRetentionDays} onChange={(e) => setForm({ ...form, dailyRetentionDays: Number(e.target.value) })} />
              </label>
            </div>
            <button className="btn btn-primary mt-4">{L('Save backup settings', 'ذخیره تنظیمات بکاپ')}</button>
          </fieldset>
        </form>
      )}

      <div className="flex gap-2 mt-4 flex-wrap">
        <button className="btn btn-primary" disabled={restoreBlocked} onClick={() => call('POST', { action: 'run' }, L('Manual backup started. Refresh status shortly.', 'بکاپ دستی آغاز شد؛ چند لحظه بعد وضعیت را تازه کنید.'))}>
          💾 {L('Back up now', 'بکاپ دستی الان')}
        </button>
        <button className="btn btn-ghost" disabled={busy} onClick={() => load()}>{L('Refresh status', 'تازه‌سازی وضعیت')}</button>
      </div>

      {data?.state && (
        <div className="mt-3">
          <p>{L('Last run', 'آخرین اجرا')}: {stateLabel(data.state.status)} · {when(data.state.finishedAt || data.state.startedAt)}</p>
          <p className="muted">{L('Telegram', 'تلگرام')}: {stateLabel(data.state.telegram)} · {L('Automatic restore test', 'آزمون بازیابی خودکار')}: {data.state.restore?.ok ? L('Successful', 'موفق') : L('Not run this cycle', 'در این نوبت اجرا نشده')}</p>
          {data.state.lastRestore && <p className="muted">{L('Last manual restore', 'آخرین بازیابی از پنل')}: {data.state.lastRestore.ok ? L('Successful', 'موفق') : L('Failed', 'ناموفق')} · {when(data.state.lastRestore.at)} · <span dir="ltr">{data.state.lastRestore.backupId}</span></p>}
          {data.state.error && <p role="alert" className="error-text">{data.state.error}</p>}
        </div>
      )}

      {data && data.backups.length > 0 && (
        <div className="mt-5">
          <h3 className="font-bold mb-2">{L('Backups on server', 'بکاپ‌های موجود روی سرور')} ({data.backups.length})</h3>
          <div className="overflow-x-auto">
            <table className="data">
              <thead><tr><th>{L('Time', 'زمان')}</th><th>{L('Size', 'حجم')}</th><th>SHA-256</th><th>{L('Telegram', 'تلگرام')}</th><th>{L('Actions', 'عملیات')}</th></tr></thead>
              <tbody>
                {data.backups.map((item) => (
                  <tr key={item.id}>
                    <td className="num text-xs whitespace-nowrap">{when(item.createdAt)}{item.reason === 'pre-restore' ? L(' (before restore)', ' (پیش از بازیابی)') : ''}</td>
                    <td className="num text-xs">{size(item.bytes)}</td>
                    <td className="num text-xs" dir="ltr" title={item.sha256}>{short(item.sha256)}</td>
                    <td className="text-xs">{item.telegram?.parts?.length ? `${item.telegram.parts.length} ${L('messages', 'پیام')}` : (item.telegram ? L('Sent', 'ارسال‌شده') : '—')}</td>
                    <td>
                      <div className="flex gap-1 flex-wrap">
                        <button className="badge badge-gray" disabled={busy} onClick={() => call('POST', { action: 'restore-test', id: item.id }, L('Restore test passed.', 'آزمون بازیابی با موفقیت انجام شد.'))}>{L('Test restore', 'آزمون بازیابی')}</button>
                        <button className="badge badge-red" disabled={restoreBlocked} onClick={() => { setConfirmId(item.id); setConfirmText('') }}>{L('Restore this backup', 'بازیابی این بکاپ')}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {confirmId && (
        <div className="card mt-4" style={{ background: 'var(--bg-soft)' }}>
          <h3 className="font-bold mb-2">{L('Restore the live database', 'بازیابی واقعی دیتابیس')}</h3>
          <p className="muted text-sm mb-3">
            {L('The current database will be replaced with backup', 'دیتابیس فعلی با بکاپ')} <b dir="ltr">{confirmId}</b> {L('A safety backup is created first. Restoration is atomic; if it fails, the database stays unchanged. Restart the server afterward.', 'جایگزین می‌شود. قبل از آن یک بکاپ امنیتی خودکار گرفته می‌شود و بازیابی اتمیک است (در صورت خطا، دیتابیس دست‌نخورده می‌ماند). پس از پایان، سرور را ری‌استارت کنید.')}
          </p>
          <label className="label">
            {L('To confirm, type', 'برای تأیید عبارت')} <b dir="ltr">RESTORE</b> {fa ? 'را وارد کنید' : ''}
            <input className="input mt-2" dir="ltr" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
          </label>
          <div className="flex gap-2 mt-3">
            <button
              className="btn btn-primary"
              disabled={busy || confirmText !== 'RESTORE'}
              onClick={async () => { await call('POST', { action: 'restore', id: confirmId, confirm: 'RESTORE' }, L('Restore completed. Please restart the server.', 'بازیابی انجام شد. لطفاً سرور را ری‌استارت کنید.')); setConfirmId('') }}
            >
              {L('Run restore', 'اجرای بازیابی')}
            </button>
            <button className="btn btn-ghost" disabled={busy} onClick={() => setConfirmId('')}>{L('Cancel', 'انصراف')}</button>
          </div>
        </div>
      )}

      <p className="muted text-xs mt-3">
        {L('The restore key stays in', 'کلید بازیابی در')} <span dir="ltr">BACKUP_ENCRYPTION_KEY</span> {L('and is never sent to Telegram. Retention removes only server files; Telegram messages remain.', 'نگهداری می‌شود و به تلگرام فرستاده نمی‌شود. نگهداری فقط فایل‌های سرور را پاک می‌کند؛ پیام‌های تلگرام باقی می‌مانند.')}
      </p>
      {message && <p role="status" className="mt-3">{message}</p>}
    </section>
  )
}
