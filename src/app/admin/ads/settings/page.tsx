'use client'

import { useEffect, useState } from 'react'
import { AdsShell, Notice, send, useJson } from '../shared'

type Pacing = { gapMinutes: number; midrollMinutes: number; midrollMinLength: number; overlayAfter: number }
type Settings = { enabled: boolean; hideFor: 'NONE' | 'VIP' | 'MEMBERS'; selfServe: boolean; label: string; clickDedupeMinutes: number; notifyAdmins: boolean; player: Pacing }

export default function AdsSettingsPage() {
  const { data, error } = useJson<{ settings: Settings }>('/api/admin/ads?view=settings')
  const [form, setForm] = useState<Settings | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  useEffect(() => { if (data) setForm(data.settings) }, [data])
  if (!form) return <AdsShell title="تنظیمات تبلیغات">{error ? <Notice tone="error">{error}</Notice> : <div className="sa-skeleton" aria-busy="true" />}</AdsShell>
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setForm({ ...form, [key]: value })
  const pace = (key: keyof Pacing, value: string) => { const n = Number(value); if (value !== '' && Number.isFinite(n)) setForm({ ...form, player: { ...form.player, [key]: n } }) }

  async function save() {
    const result = await send<{ settings: Settings }>('/api/admin/ads', 'POST', { op: 'settings', settings: form })
    setNotice(result.ok ? { tone: 'ok', text: 'تنظیمات ذخیره شد.' } : { tone: 'error', text: result.error })
    if (result.ok) setForm(result.data.settings)
  }

  return <AdsShell title="تنظیمات تبلیغات">
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    <section className="sa-card ad-form">
      <label className="sa-check"><input type="checkbox" checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} /> نمایش تبلیغات در سایت فعال باشد <small className="sa-hint">با خاموش کردن، همهٔ جایگاه‌ها یک‌جا پنهان می‌شوند.</small></label>
      <label className="sa-field"><span>پنهان کردن تبلیغات برای</span><select className="input" value={form.hideFor} onChange={(e) => set('hideFor', e.target.value as Settings['hideFor'])}><option value="NONE">هیچ‌کس (همه می‌بینند)</option><option data-vip="" value="VIP">کاربران VIP</option><option value="MEMBERS">همهٔ کاربران واردشده</option></select></label>
      <label className="sa-field"><span>برچسب کنار بنر</span><input className="input" value={form.label} maxLength={20} onChange={(e) => set('label', e.target.value)} /><small className="sa-hint">برچسب شفاف‌سازی که کنار هر تبلیغ دیده می‌شود.</small></label>
      <label className="sa-field"><span>فاصلهٔ شمارش کلیک تکراری (دقیقه)</span><input className="input" type="number" min={0} max={1440} value={form.clickDedupeMinutes} onChange={(e) => set('clickDedupeMinutes', Number(e.target.value))} /><small className="sa-hint">چند کلیک یک بازدیدکننده روی یک تبلیغ در این بازه یک کلیک حساب می‌شود.</small></label>
      <label className="sa-check"><input type="checkbox" checked={form.selfServe} onChange={(e) => set('selfServe', e.target.checked)} /> خرید بستهٔ تبلیغاتی توسط کاربران باز باشد</label>
      <label className="sa-check"><input type="checkbox" checked={form.notifyAdmins} onChange={(e) => set('notifyAdmins', e.target.checked)} /> برای کمپین تازه به مدیران اعلان برسد</label>
      <fieldset className="ad-player-pacing">
        <legend>تبلیغ در پخش‌کنندهٔ فیلم و سریال</legend>
        <p className="sa-hint">جایگاه‌های «پخش‌کننده: قبل از فیلم»، «میانهٔ فیلم» و «روی ویدیو» را در کمپین انتخاب کنید. تبلیغ ویدیویی یا تصویر تمام‌قاب، با دکمهٔ رد کردن.</p>
        <label className="sa-field"><span>حداقل فاصلهٔ دو تبلیغ برای یک بیننده (دقیقه)</span><input className="input num" type="number" min={0} max={1440} value={form.player.gapMinutes} onChange={(e) => pace('gapMinutes', e.target.value)} /><small className="sa-hint">مثل یوتیوب «گاهی»: بیننده‌ای که تازه تبلیغ دیده، تا این مدت تبلیغ پخش‌کننده نمی‌بیند. ۰ = هر بار.</small></label>
        <label className="sa-field"><span>تبلیغ میانهٔ فیلم هر چند دقیقه</span><input className="input num" type="number" min={0} max={240} value={form.player.midrollMinutes} onChange={(e) => pace('midrollMinutes', e.target.value)} /><small className="sa-hint">۰ = بدون تبلیغ میانه. هرگز در دو دقیقهٔ آخر فیلم نمی‌آید.</small></label>
        <label className="sa-field"><span>تبلیغ میانه فقط برای فیلم‌های بلندتر از (دقیقه)</span><input className="input num" type="number" min={0} max={600} value={form.player.midrollMinLength} onChange={(e) => pace('midrollMinLength', e.target.value)} /></label>
        <label className="sa-field"><span>بنر روی ویدیو پس از (ثانیه از پخش)</span><input className="input num" type="number" min={0} max={3600} value={form.player.overlayAfter} onChange={(e) => pace('overlayAfter', e.target.value)} /><small className="sa-hint">۰ = بدون بنر روی ویدیو. بیننده می‌بندد یا پس از ۲۰ ثانیه می‌رود.</small></label>
      </fieldset>
      <div className="sa-row-actions"><button type="button" className="btn btn-primary" onClick={() => void save()}>ذخیره</button></div>
    </section>
  </AdsShell>
}
