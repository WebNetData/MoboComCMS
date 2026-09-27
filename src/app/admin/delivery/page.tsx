'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { WEEKDAY_FA, type DeliverySettings, type ScheduleDay } from '@/modules/shipping/domain/shipping'

/** Saturday-first week, as Iranian calendars show it (JS weekday numbers). */
const WEEK = [6, 0, 1, 2, 3, 4, 5]
const persianDate = (day: string, weekday = false) => new Intl.DateTimeFormat('fa-IR-u-ca-persian', { ...(weekday ? { weekday: 'long' } : {}), day: 'numeric', month: 'long', year: weekday ? undefined : 'numeric', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`))
const toman = (rial: number) => `${Math.round(rial / 10).toLocaleString('fa-IR')} تومان`

/** Delivery days, time windows with capacity, holidays and shipping fee for physical products. */
export default function AdminDeliveryPage() {
  const [settings, setSettings] = useState<DeliverySettings | null>(null)
  const [days, setDays] = useState<ScheduleDay[]>([])
  const [holiday, setHoliday] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)

  useEffect(() => {
    fetch('/api/admin/delivery', { cache: 'no-store' }).then(async (response) => {
      const body = await response.json().catch(() => null)
      if (response.ok) { setSettings(body.settings); setDays(body.days) } else setMessage({ text: body?.error || 'دریافت تنظیمات ناموفق بود', error: true })
    }).catch(() => setMessage({ text: 'ارتباط برقرار نشد', error: true }))
  }, [])

  if (!settings) return <div className="xm-page" dir="rtl">{message ? <div className="xm-notice is-error" role="alert">{message.text}</div> : <div className="sh-skeleton" aria-busy="true" />}</div>
  const s = settings
  const patch = (next: Partial<DeliverySettings>) => setSettings({ ...s, ...next })
  const setSlot = (index: number, next: Partial<DeliverySettings['slots'][number]>) => patch({ slots: s.slots.map((slot, i) => (i === index ? { ...slot, ...next } : slot)) })

  async function save() {
    setBusy(true); setMessage(null)
    const response = await fetch('/api/admin/delivery', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) }).catch(() => null)
    const body = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setMessage({ text: body?.error || 'ذخیره نشد', error: true }); return }
    setSettings(body.settings); setDays(body.days)
    setMessage({ text: 'تنظیمات ارسال ذخیره شد', error: false })
  }

  const number = (value: string) => Math.max(0, Math.round(Number(value.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))) || 0))

  return <div className="xm-page sh-admin" dir="rtl">
    <header className="tb-hero"><div><span className="tb-eyebrow">STORE · DELIVERY</span><h1>زمان‌بندی و هزینهٔ ارسال</h1>
      <p>مشتری هنگام خرید کالای فیزیکی، روز و بازهٔ ساعت ارسال را مثل دیجی‌کالا انتخاب می‌کند. ظرفیت هر بازه با سفارش‌های ثبت‌شده پر می‌شود؛ سفارش پرداخت‌نشده پس از دو ساعت ظرفیت را آزاد می‌کند. سفارش‌ها در <Link href="/admin/product-deliveries">تحویل سفارش‌ها</Link> به ترتیب روز ارسال دیده می‌شوند.</p></div></header>
    {message && <div className={`xm-notice${message.error ? ' is-error' : ''}`} role="status">{message.text}</div>}

    <div className="sh-admin-grid">
      <section className="sh-panel">
        <header className="sh-panel-head"><h2>قواعد کلی</h2></header>
        <label className="sh-check"><input type="checkbox" checked={s.enabled} onChange={(e) => patch({ enabled: e.target.checked })} />مشتری روز و ساعت ارسال را انتخاب کند</label>
        <div className="sh-grid sh-admin-fields">
          <label className="sh-field"><span>فاصلهٔ اولین روز ارسال (روز)</span><input className="sh-input" inputMode="numeric" dir="ltr" value={s.leadDays} onChange={(e) => patch({ leadDays: number(e.target.value) })} /></label>
          <label className="sh-field"><span>تعداد روزهای قابل انتخاب</span><input className="sh-input" inputMode="numeric" dir="ltr" value={s.daysAhead} onChange={(e) => patch({ daysAhead: number(e.target.value) })} /></label>
          <label className="sh-field"><span>ساعت پایان پذیرش روز (به وقت تهران)</span><input className="sh-input" inputMode="numeric" dir="ltr" value={s.cutoffHour} onChange={(e) => patch({ cutoffHour: number(e.target.value) })} /><small className="sh-muted">سفارش بعد از این ساعت یک روز دیرتر ارسال می‌شود.</small></label>
        </div>
        <fieldset className="sh-weekdays"><legend>روزهای تعطیل هفتگی</legend>
          {WEEK.map((weekday) => <label key={weekday} className="sh-chip-check"><input type="checkbox" checked={s.closedWeekdays.includes(weekday)} onChange={(e) => patch({ closedWeekdays: e.target.checked ? [...s.closedWeekdays, weekday] : s.closedWeekdays.filter((d) => d !== weekday) })} />{WEEKDAY_FA[weekday]}</label>)}
        </fieldset>
      </section>

      <section className="sh-panel">
        <header className="sh-panel-head"><h2>هزینهٔ ارسال</h2></header>
        <div className="sh-grid">
          <label className="sh-field"><span>هزینهٔ هر سفارش (ریال)</span><input className="sh-input" inputMode="numeric" dir="ltr" value={s.feeRial} onChange={(e) => patch({ feeRial: number(e.target.value) })} /><small className="sh-muted">{s.feeRial ? toman(s.feeRial) : 'رایگان'}</small></label>
          <label className="sh-field"><span>ارسال رایگان از مبلغ (ریال)</span><input className="sh-input" inputMode="numeric" dir="ltr" value={s.freeOverRial} onChange={(e) => patch({ freeOverRial: number(e.target.value) })} /><small className="sh-muted">{s.freeOverRial ? `از ${toman(s.freeOverRial)} به بالا` : 'غیرفعال'}</small></label>
        </div>
        <p className="sh-muted">فقط برای کالاهای ریالی/تومانی دریافت می‌شود؛ روی کد تخفیف اثر ندارد و در فاکتور جدا نوشته می‌شود.</p>
      </section>
    </div>

    <section className="sh-panel">
      <header className="sh-panel-head"><h2>بازه‌های زمانی ارسال</h2><button type="button" className="sh-btn sh-btn-ghost" disabled={s.slots.length >= 12} onClick={() => patch({ slots: [...s.slots, { id: `slot-${s.slots.length + 1}`, label: '', capacity: 20 }] })}>+ بازهٔ جدید</button></header>
      <div className="sh-table-wrap"><table className="sh-table">
        <thead><tr><th scope="col">عنوان نمایشی</th><th scope="col">شناسه (لاتین)</th><th scope="col">ظرفیت هر روز</th><th scope="col"><span className="sr-only">حذف</span></th></tr></thead>
        <tbody>{s.slots.map((slot, index) => <tr key={index}>
          <td><input className="sh-input" aria-label="عنوان نمایشی" placeholder="۹ تا ۱۲" value={slot.label} onChange={(e) => setSlot(index, { label: e.target.value })} /></td>
          <td><input className="sh-input" aria-label="شناسه" dir="ltr" placeholder="09-12" value={slot.id} onChange={(e) => setSlot(index, { id: e.target.value })} /></td>
          <td><input className="sh-input" aria-label="ظرفیت" inputMode="numeric" dir="ltr" value={slot.capacity} onChange={(e) => setSlot(index, { capacity: number(e.target.value) })} /><small className="sh-muted">{slot.capacity === 0 ? 'نامحدود' : ''}</small></td>
          <td><button type="button" className="sh-link is-danger" disabled={s.slots.length <= 1} onClick={() => patch({ slots: s.slots.filter((_, i) => i !== index) })}>حذف</button></td>
        </tr>)}</tbody>
      </table></div>
      <p className="sh-muted">ظرفیت صفر یعنی بدون محدودیت. شناسهٔ بازه‌ای که رزرو دارد را تغییر ندهید.</p>
    </section>

    <section className="sh-panel">
      <header className="sh-panel-head"><h2>تعطیلات مناسبتی</h2></header>
      <div className="sh-actions">
        <input className="sh-input sh-date" type="date" dir="ltr" aria-label="تاریخ تعطیل (میلادی)" value={holiday} onChange={(e) => setHoliday(e.target.value)} />
        <button type="button" className="sh-btn sh-btn-ghost" disabled={!holiday || s.holidays.includes(holiday)} onClick={() => { patch({ holidays: [...s.holidays, holiday].sort() }); setHoliday('') }}>افزودن</button>
      </div>
      {s.holidays.length ? <ul className="sh-holidays">{s.holidays.map((day) => <li key={day}><span>{persianDate(day)}</span><button type="button" className="sh-icon-btn" aria-label={`حذف ${persianDate(day)}`} onClick={() => patch({ holidays: s.holidays.filter((d) => d !== day) })}>×</button></li>)}</ul> : <p className="sh-muted">روز تعطیلی ثبت نشده است.</p>}
    </section>

    <div className="sh-sticky-save"><button type="button" className="sh-btn sh-btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'در حال ذخیره…' : 'ذخیرهٔ تنظیمات ارسال'}</button></div>

    <section className="sh-panel">
      <header className="sh-panel-head"><h2>ظرفیت روزهای پیش رو</h2><span className="sh-muted">بر اساس سفارش‌های ثبت‌شده</span></header>
      {days.length ? <div className="sh-table-wrap"><table className="sh-table sh-capacity">
        <thead><tr><th scope="col">روز</th>{s.slots.map((slot) => <th key={slot.id} scope="col">{slot.label}</th>)}</tr></thead>
        <tbody>{days.map((day) => <tr key={day.date}><th scope="row">{persianDate(day.date, true)}</th>{day.slots.map((slot) => {
          const capacity = s.slots.find((row) => row.id === slot.id)?.capacity || 0
          return <td key={slot.id} className={slot.available ? '' : 'is-full'}>{capacity === 0 ? 'نامحدود' : `${(capacity - slot.remaining).toLocaleString('fa-IR')} از ${capacity.toLocaleString('fa-IR')}`}</td>
        })}</tr>)}</tbody>
      </table></div> : <p className="sh-muted">{s.enabled ? 'در بازهٔ انتخاب‌شده روز کاری وجود ندارد.' : 'انتخاب زمان ارسال غیرفعال است.'}</p>}
    </section>
  </div>
}
