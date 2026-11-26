'use client'
import { useState } from 'react'
import Link from '@/components/AppLink'
import { HostingShell } from '../shared'
import { Notice, send, useJson, faDate } from '../../store/shared'
type Operation = {
  id: string
  serviceId: number | null
  domainId: number | null
  command: string
  status: string
  code: string
  version: number
  attempts: number
  updatedAt: string
  provider: { name: string; driver: string }
}
type Data = {
  operations: Operation[]
  services: { id: number; label: string; hostname: string; status: string; providerId: number | null }[]
  domainTasks: { id: number; kind: string; detail: string; domain: { id: number; name: string } }[]
}
const states: Record<string, string> = {
  QUEUED: 'در صف',
  RUNNING: 'در حال اجرا',
  PENDING: 'منتظر نتیجهٔ سامانه',
  UNKNOWN: 'نتیجه نامشخص؛ بررسی لازم',
  DONE: 'تکمیل شد',
  FAILED: 'انجام نشد',
  BLOCKED: 'متوقف به دلیل تغییر دسترسی',
}
const labels: Record<string, string> = {
  CREATE: 'ساخت سرویس',
  REGISTER: 'ثبت دامنه',
  RENEW: 'تمدید دامنه',
  SUSPEND: 'تعلیق',
  UNSUSPEND: 'رفع تعلیق',
  TERMINATE: 'حذف سرویس',
  START: 'روشن کردن',
  STOP: 'خاموش کردن فوری',
  SHUTDOWN: 'خاموش کردن امن',
  REBOOT: 'راه‌اندازی مجدد',
}
export default function Operations() {
  const { data, error, reload } = useJson<Data>('/api/admin/hosting/operations'),
    [busy, setBusy] = useState(''),
    [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null),
    [filter, setFilter] = useState('ALL'),
    [serviceId, setService] = useState(''),
    [command, setCommand] = useState('CREATE'),
    [confirm, setConfirm] = useState('')
  async function act(body: Record<string, unknown>, key: string) {
    setBusy(key)
    setNotice(null)
    const r = await send('/api/admin/hosting/operations', 'POST', body)
    setBusy('')
    setNotice(
      r.ok
        ? { tone: 'ok', text: 'درخواست ثبت شد؛ نتیجهٔ قطعی پس از پاسخ سامانه نمایش داده می‌شود.' }
        : { tone: 'error', text: r.error },
    )
    void reload()
  }
  const visible = data?.operations.filter((row) => filter === 'ALL' || row.status === filter) || []
  return (
    <HostingShell
      title="مرکز عملیات کلاد"
      hint="سابقهٔ واقعی ساخت و کنترل سرویس‌ها و ثبت دامنه؛ هر درخواست، یک نتیجهٔ قابل پیگیری."
      actions={
        <button className="btn btn-ghost" onClick={() => void reload()}>
          به‌روزرسانی
        </button>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
      {notice && (
        <div aria-live="polite">
          <Notice tone={notice.tone}>{notice.text}</Notice>
        </div>
      )}
      <div className="hx-op-stats">
        {[
          ['در حال پیگیری', data?.operations.filter((o) => ['QUEUED', 'RUNNING', 'PENDING'].includes(o.status)).length],
          ['نیازمند بررسی', data?.operations.filter((o) => ['UNKNOWN', 'BLOCKED'].includes(o.status)).length],
          ['تکمیل‌شده', data?.operations.filter((o) => o.status === 'DONE').length],
        ].map(([label, value]) => (
          <div className="sa-card" key={label}>
            <span className="sa-hint">{label}</span>
            <strong>{Number(value || 0).toLocaleString('fa-IR')}</strong>
          </div>
        ))}
      </div>
      <section className="sa-card">
        <header className="sa-card-head">
          <h2>عملیات سرویس</h2>
        </header>
        <div className="hx-row">
          <label className="sa-field">
            <span>سرویس</span>
            <select className="input" value={serviceId} onChange={(e) => setService(e.target.value)}>
              <option value="">انتخاب کنید</option>
              {data?.services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} · {s.hostname || s.id}
                </option>
              ))}
            </select>
          </label>
          <label className="sa-field">
            <span>عملیات</span>
            <select className="input" value={command} onChange={(e) => setCommand(e.target.value)}>
              {Object.entries(labels)
                .filter(([key]) => !['REGISTER', 'RENEW'].includes(key))
                .map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
            </select>
          </label>
        </div>
        {['TERMINATE', 'STOP', 'REBOOT'].includes(command) && (
          <label className="sa-field">
            <span>تأیید با نوشتن نام دقیق میزبان</span>
            <input className="input" dir="ltr" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </label>
        )}
        <p className="sa-hint">
          فقط اتصال‌های با عملیات خودکار فعال اجرا می‌شوند. حذف سرویس برگشت‌پذیر نیست؛ درخواست نامشخص دوباره ارسال
          نمی‌شود.
        </p>
        <button
          className="btn btn-primary"
          disabled={!!busy || !serviceId}
          onClick={() =>
            void act(
              { op: 'command', serviceId: Number(serviceId), command, confirm, requestKey: crypto.randomUUID() },
              'command',
            )
          }
        >
          ثبت عملیات
        </button>
      </section>
      <section className="sa-card">
        <header className="sa-card-head">
          <h2>تاریخچهٔ عملیات</h2>
          <label className="sa-field">
            <span>وضعیت</span>
            <select className="input" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="ALL">همه</option>
              {Object.entries(states).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </header>
        {!data ? (
          <p aria-busy="true">در حال دریافت…</p>
        ) : !visible.length ? (
          <div className="hx-empty">
            <h3>عملیاتی در این وضعیت نیست</h3>
            <p className="sa-hint">پرداخت و تنظیم اتصال، درخواست را وارد صف مشترک می‌کند.</p>
          </div>
        ) : (
          <div className="hx-op-list">
            {visible.map((row) => (
              <article key={row.id} className="hx-op-item">
                <div>
                  <h3>{labels[row.command] || row.command}</h3>
                  <p>
                    {row.provider.name}{' '}
                    <span className="hx-spec">
                      · {row.serviceId ? 'سرویس ' + row.serviceId : 'دامنه ' + row.domainId}
                    </span>
                  </p>
                  <code dir="ltr">{row.id}</code>
                </div>
                <div>
                  <span className={'sa-state ' + (row.status === 'DONE' ? 'is-ok' : '')}>{states[row.status]}</span>
                  <p className="sa-hint">
                    {faDate(row.updatedAt, true)} · {row.attempts.toLocaleString('fa-IR')} بررسی
                  </p>
                  <small dir="ltr">{row.code}</small>
                </div>
                {row.status === 'FAILED' && row.code !== 'ACCOUNT_ERASED' && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={!!busy}
                    onClick={() => void act({ op: 'retry', id: row.id, version: row.version }, row.id)}
                  >
                    تلاش دوبارهٔ درخواست ردشده
                  </button>
                )}
                {['UNKNOWN', 'PENDING', 'BLOCKED'].includes(row.status) && (
                  <button
                    className="btn btn-ghost"
                    disabled={!!busy}
                    onClick={() => void act({ op: 'reconcile', id: row.id, version: row.version }, row.id)}
                  >
                    بررسی خواندنی نتیجه
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
      {!!data?.domainTasks.length && (
        <section className="sa-card">
          <header className="sa-card-head">
            <h2>درخواست‌های دامنه در انتظار کارشناس</h2>
          </header>
          <p className="sa-hint">سفارش‌های دستی یا قابلیت‌های پشتیبانی‌نشده از همین مسیر قبلی پیگیری می‌شوند.</p>
          <Link className="btn btn-ghost" href="/admin/hosting/domains">
            مدیریت دامنه‌ها · {data.domainTasks.length.toLocaleString('fa-IR')} درخواست
          </Link>
        </section>
      )}
    </HostingShell>
  )
}
