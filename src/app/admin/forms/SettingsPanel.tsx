'use client'

import Link from '@/components/AppLink'
import type { FormDefinition, FormSettings } from '@/modules/forms/domain/forms'
import { dateTimeLocal, settingsOf } from './shared'
import { PaymentStylePanels } from './ProPanels'
import { AdvancedSettings } from './AdvancedPanels'
import { WorkPanels } from './WorkPanels'
import JalaliDateInput from '@/components/date/JalaliDateInput'

/** Form details, access rules, schedule, notifications and spam rules. */
export default function SettingsPanel({ form, onChange }: { form: FormDefinition; onChange: (form: FormDefinition) => void }) {
  const s = settingsOf(form)
  const set = (patch: Partial<FormSettings>) => onChange({ ...form, settings: { ...s, ...patch } })
  const top = (patch: Partial<FormDefinition>) => onChange({ ...form, ...patch })
  return <div className="fb-settings">
    <section className="sa-card">
      <header className="sa-card-head"><h2>مشخصات</h2></header>
      <div className="ad-fields">
        <label className="sa-field"><span>عنوان فرم</span><input className="input" value={form.title} maxLength={150} onChange={(e) => top({ title: e.target.value })} placeholder="مثلاً درخواست همکاری" /></label>
        <label className="sa-field"><span>نشانی یکتا</span><input className="input" dir="ltr" value={form.slug} maxLength={80} onChange={(e) => top({ slug: e.target.value.toLowerCase() })} placeholder="contact-us" /><small className="sa-hint">صفحهٔ فرم: /forms/{form.slug || '…'}</small></label>
      </div>
      <label className="sa-field"><span>توضیح بالای فرم</span><textarea className="input" rows={2} value={form.description} maxLength={2000} onChange={(e) => top({ description: e.target.value })} /></label>
      <label className="sa-check"><input type="checkbox" checked={s.service} onChange={(e) => set({ service: e.target.checked })} /> این فرم یک «خدمت» است <small className="sa-hint">مثل پرداخت سایت خارجی یا تلگرام پریمیوم؛ در مدیریت زیر «خدمات» نمایش داده می‌شود.</small></label>
      <label className="sa-check"><input type="checkbox" checked={form.published} onChange={(e) => top({ published: e.target.checked })} /> منتشر شود <small className="sa-hint">تا منتشر نشود فقط پیش‌نویس است و بازدیدکننده آن را نمی‌بیند.</small></label>
      {form.id && form.published && <p className="sa-hint">نشانی: <Link href={`/forms/${form.slug}`} target="_blank" className="sa-link" dir="ltr">/forms/{form.slug} ↗</Link> · برای گذاشتن فرم در صفحهٔ اصلی از <Link href="/admin/studio" className="sa-link">صفحه‌ساز</Link> استفاده کنید.</p>}
    </section>

    <PaymentStylePanels s={s} set={set} fields={form.fields} />
    <AdvancedSettings form={form} s={s} set={set} />
    <WorkPanels form={form} s={s} set={set} />

    <section className="sa-card">
      <header className="sa-card-head"><h2>بعد از ارسال</h2></header>
      <label className="sa-field"><span>پیام موفقیت</span><textarea className="input" rows={2} value={form.successText} maxLength={1000} onChange={(e) => top({ successText: e.target.value })} /></label>
      <div className="ad-fields">
        <label className="sa-field"><span>متن دکمهٔ ارسال</span><input className="input" value={s.submitLabel} maxLength={40} onChange={(e) => set({ submitLabel: e.target.value })} placeholder="ارسال فرم" /></label>
        <label className="sa-field"><span>انتقال به نشانی (اختیاری)</span><input className="input" dir="ltr" value={s.redirectUrl} maxLength={500} onChange={(e) => set({ redirectUrl: e.target.value })} placeholder="/thank-you یا https://…" /><small className="sa-hint">پیام موفقیت لحظه‌ای دیده می‌شود و بازدیدکننده به این نشانی می‌رود.</small></label>
      </div>
    </section>

    <section className="sa-card">
      <header className="sa-card-head"><h2>دسترسی و زمان‌بندی</h2></header>
      <label className="sa-check"><input type="checkbox" checked={s.requireLogin} onChange={(e) => set({ requireLogin: e.target.checked })} /> فقط کاربران واردشده بتوانند ارسال کنند</label>
      <label className="sa-check"><input type="checkbox" checked={s.oncePerUser} onChange={(e) => set({ oncePerUser: e.target.checked, ...(e.target.checked ? { requireLogin: true } : {}) })} /> هر کاربر فقط یک‌بار ارسال کند <small className="sa-hint">نیازمند ورود کاربر است.</small></label>
      <div className="ad-fields">
        <label className="sa-field"><span>شروع پذیرش</span><JalaliDateInput withTime className="input" value={dateTimeLocal(s.opensAt)} onChange={(value) => set({ opensAt: value ? new Date(value).toISOString() : '' })} /></label>
        <label className="sa-field"><span>پایان پذیرش</span><JalaliDateInput withTime className="input" value={dateTimeLocal(s.closesAt)} onChange={(value) => set({ closesAt: value ? new Date(value).toISOString() : '' })} /></label>
        <label className="sa-field"><span>سقف تعداد پاسخ (۰ = نامحدود)</span><input className="input" type="number" min={0} value={s.maxSubmissions} onChange={(e) => set({ maxSubmissions: Number(e.target.value) })} /></label>
        <label className="sa-field"><span>پیام وقتی بسته است</span><input className="input" value={s.closedMessage} maxLength={300} onChange={(e) => set({ closedMessage: e.target.value })} placeholder="مهلت این فرم تمام شده است." /></label>
      </div>
    </section>

    <section className="sa-card">
      <header className="sa-card-head"><h2>اعلان‌ها</h2></header>
      <label className="sa-check"><input type="checkbox" checked={s.notifyInbox} onChange={(e) => set({ notifyInbox: e.target.checked })} /> برای هر پاسخ تازه به مدیران اعلان برسد</label>
      <label className="sa-field"><span>ایمیل مدیران (هر کدام یک خط؛ حداکثر ۵)</span><textarea className="input" dir="ltr" rows={2} value={s.notifyEmails.join('\n')} onChange={(e) => set({ notifyEmails: e.target.value.split(/[\s,،;]+/).filter(Boolean).slice(0, 5) })} /><small className="sa-hint">نیازمند فعال بودن ارسال ایمیل در <Link href="/admin/email" className="sa-link">تنظیمات ایمیل</Link>.</small></label>
      <label className="sa-check"><input type="checkbox" checked={s.autoReply.enabled} onChange={(e) => set({ autoReply: { ...s.autoReply, enabled: e.target.checked } })} /> ایمیل تأیید برای ارسال‌کننده <small className="sa-hint">به نشانی فیلد «ایمیل» فرم فرستاده می‌شود.</small></label>
      {s.autoReply.enabled && <div className="ad-fields">
        <label className="sa-field"><span>موضوع</span><input className="input" value={s.autoReply.subject} maxLength={150} onChange={(e) => set({ autoReply: { ...s.autoReply, subject: e.target.value } })} /></label>
        <label className="sa-field"><span>متن (خالی = پیام موفقیت)</span><textarea className="input" rows={3} value={s.autoReply.body} maxLength={3000} onChange={(e) => set({ autoReply: { ...s.autoReply, body: e.target.value } })} /></label>
      </div>}
    </section>

    <section className="sa-card">
      <header className="sa-card-head"><h2>ضدهرزنامه</h2></header>
      <p className="sa-hint">فیلد مخفی مخصوص ربات‌ها، محدودیت تعداد ارسال از هر آدرس و بررسی نشانی‌ها همیشه فعال است.</p>
      <label className="sa-field"><span>پاسخی که این‌قدر لینک دارد هرزنامه حساب شود (۰ = خاموش)</span><input className="input" type="number" min={0} max={20} value={s.spamLinks} onChange={(e) => set({ spamLinks: Number(e.target.value) })} /><small className="sa-hint">هرزنامه‌ها ذخیره می‌شوند اما اعلان نمی‌گیرند و در برگهٔ «هرزنامه» می‌مانند.</small></label>
    </section>
  </div>
}
