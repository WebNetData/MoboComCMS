'use client'

import { useEffect, useState } from 'react'
import { AdsShell, Notice, send, useJson } from '../shared'

type Settings = { enabled: boolean; hideFor: 'NONE' | 'VIP' | 'MEMBERS'; selfServe: boolean; label: string; clickDedupeMinutes: number; notifyAdmins: boolean }

export default function AdsSettingsPage() {
  const { data, error } = useJson<{ settings: Settings }>('/api/admin/ads?view=settings')
  const [form, setForm] = useState<Settings | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  useEffect(() => { if (data) setForm(data.settings) }, [data])
  if (!form) return <AdsShell title="تنظیمات تبلیغات">{error ? <Notice tone="error">{error}</Notice> : <div className="sa-skeleton" aria-busy="true" />}</AdsShell>
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setForm({ ...form, [key]: value })

  async function save() {
    const result = await send<{ settings: Settings }>('/api/admin/ads', 'POST', { op: 'settings', settings: form })
    setNotice(result.ok ? { tone: 'ok', text: 'تنظیمات ذخیره شد.' } : { tone: 'error', text: result.error })
    if (result.ok) setForm(result.data.settings)
  }

  return <AdsShell title="تنظیمات تبلیغات">
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    <section className="sa-card ad-form">
      <label className="sa-check"><input type="checkbox" checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} /> نمایش تبلیغات در سایت فعال باشد <small className="sa-hint">با خاموش کردن، همهٔ جایگاه‌ها یک‌جا پنهان می‌شوند.</small></label>
      <label className="sa-field"><span>پنهان کردن تبلیغات برای</span><select className="input" value={form.hideFor} onChange={(e) => set('hideFor', e.target.value as Settings['hideFor'])}><option value="NONE">هیچ‌کس (همه می‌بینند)</option><option value="VIP">کاربران VIP</option><option value="MEMBERS">همهٔ کاربران واردشده</option></select></label>
      <label className="sa-field"><span>برچسب کنار بنر</span><input className="input" value={form.label} maxLength={20} onChange={(e) => set('label', e.target.value)} /><small className="sa-hint">برچسب شفاف‌سازی که کنار هر تبلیغ دیده می‌شود.</small></label>
      <label className="sa-field"><span>فاصلهٔ شمارش کلیک تکراری (دقیقه)</span><input className="input" type="number" min={0} max={1440} value={form.clickDedupeMinutes} onChange={(e) => set('clickDedupeMinutes', Number(e.target.value))} /><small className="sa-hint">چند کلیک یک بازدیدکننده روی یک تبلیغ در این بازه یک کلیک حساب می‌شود.</small></label>
      <label className="sa-check"><input type="checkbox" checked={form.selfServe} onChange={(e) => set('selfServe', e.target.checked)} /> خرید بستهٔ تبلیغاتی توسط کاربران باز باشد</label>
      <label className="sa-check"><input type="checkbox" checked={form.notifyAdmins} onChange={(e) => set('notifyAdmins', e.target.checked)} /> برای کمپین تازه به مدیران اعلان برسد</label>
      <div className="sa-row-actions"><button type="button" className="btn btn-primary" onClick={() => void save()}>ذخیره</button></div>
    </section>
  </AdsShell>
}
