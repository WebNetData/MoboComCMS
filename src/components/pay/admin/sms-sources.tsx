'use client'

import { useCallback, useEffect, useState } from 'react'
import { api, json } from '../client'
import { ErrorNotice, Field } from '../shared'
import s from '../Pay.module.css'

type Template = { bankCode: string; sender: string; creditTemplate: string; debitTemplate: string; unit: 'IRR' | 'IRT'; calendar: 'JALALI' | 'GREGORIAN' }
type Source = { id: string; version: number; label: string; bankAccountId: number; template: Template; verified: boolean; active: boolean }
type Bank = { id: number; title?: string; bankName: string; active: boolean; collectionUse: string }
const blank: Template = { bankCode: '', sender: '', creditTemplate: '', debitTemplate: '', unit: 'IRR', calendar: 'JALALI' }

export default function SmsSources({ bankAccounts }: { bankAccounts: Bank[] }) {
  const [items, setItems] = useState<Source[]>([]), [presets, setPresets] = useState<Template[]>([]), [selected, setSelected] = useState<Source | null>(null)
  const [label, setLabel] = useState(''), [bankAccountId, setBankAccountId] = useState(''), [template, setTemplate] = useState<Template>(blank), [verified, setVerified] = useState(false), [active, setActive] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [secret, setSecret] = useState('')
  const [copyStatus, setCopyStatus] = useState('')
  const load = useCallback(async () => { try { const result = await api<{ items: Source[]; presets: Template[] }>('/api/admin/mobocom-pay/sms-sources'); setItems(result.items); setPresets(result.presets); setError('') } catch (e) { setError(e instanceof Error ? e.message : 'دریافت منابع پیامک ناموفق بود') } }, [])
  useEffect(() => { void load() }, [load])
  function reset() { setSelected(null); setLabel(''); setBankAccountId(''); setTemplate(blank); setVerified(false); setActive(false); setSecret('') }
  function edit(item: Source) { setSelected(item); setLabel(item.label); setBankAccountId(String(item.bankAccountId)); setTemplate(item.template); setVerified(item.verified); setActive(item.active); setSecret('') }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError(''); setSecret('')
    try { const result = await api<{ secret?: string }>('/api/admin/mobocom-pay/sms-sources', json(selected ? 'PATCH' : 'POST', { ...(selected ? { id: selected.id, version: selected.version } : {}), label, bankAccountId: Number(bankAccountId), template, verified, active })); reset(); if (result.secret) setSecret(result.secret); await load() }
    catch (e) { setError(e instanceof Error ? e.message : 'ذخیرهٔ منبع انجام نشد') } finally { setBusy(false) }
  }
  async function copyEndpoint(id: string) {
    try {
      if (window.location.protocol !== 'https:') throw new Error('HTTPS required')
      await navigator.clipboard.writeText(`${window.location.origin}/api/payment/mobocom-pay/sms/${id}`)
      setCopyStatus('نشانی HTTPS کپی شد')
    } catch { setCopyStatus('کپی نشانی انجام نشد؛ نشانی زیر را با دامنهٔ HTTPS سرور ترکیب کنید') }
  }
  return <section className={`${s.card} ${s.stack}`} aria-labelledby="sms-sources-title">
    <h2 id="sms-sources-title">منابع پیامک بانکی</h2><p className={s.muted}>قالب و فرستنده را با پیام بانکی واقعی بررسی کنید. فعال‌سازی منبع به‌تنهایی اتصال یا اصالت پیامک را تضمین نمی‌کند.</p><ErrorNotice error={error} />
    {secret && <p className={s.notice} role="status">کلید فقط این بار نمایش داده می‌شود؛ آن را در تنظیمات امن منبع ثبت کنید: <code dir="ltr">{secret}</code></p>}
    {items.map(item => <div className={s.stack} key={item.id}><div className={s.row}><span>{item.label} · {item.active ? 'فعال' : 'غیرفعال'} · {item.verified ? 'بررسی‌شده' : 'بررسی‌نشده'}</span><button type="button" className={s.secondary} disabled={busy} onClick={() => edit(item)}>ویرایش</button></div><span className={s.muted}>مسیر دریافت روی دامنهٔ HTTPS سرور:</span><code dir="ltr" style={{ overflowWrap: 'anywhere' }}>/api/payment/mobocom-pay/sms/{item.id}</code><div><button type="button" className={s.secondary} onClick={() => void copyEndpoint(item.id)}>کپی نشانی کامل HTTPS</button></div></div>)}
    <p role="status" aria-live="polite">{copyStatus}</p>
    <form className={s.stack} onSubmit={save}><h3>{selected ? 'ویرایش منبع' : 'منبع جدید'}</h3>
      <Field label="نام منبع"><input required maxLength={80} value={label} onChange={e => setLabel(e.target.value)} /></Field>
      <Field label="حساب اختصاصی"><select required disabled={!!selected} value={bankAccountId} onChange={e => setBankAccountId(e.target.value)}><option value="">انتخاب حساب</option>{bankAccounts.filter(a => a.collectionUse === 'MOBOCOM_PAY' && (a.active || String(a.id) === bankAccountId)).map(a => <option key={a.id} value={a.id} disabled={!a.active}>{a.title && a.title !== a.bankName ? `${a.title} · ` : ''}{a.bankName}{!a.active && ' (غیرفعال)'}</option>)}</select></Field>
      <Field label="نمونهٔ قالب"><select value="" onChange={e => { const p = presets[Number(e.target.value)]; if (p) setTemplate({ ...p }) }}><option value="">انتخاب نمونه</option>{presets.map((p, i) => <option key={p.bankCode} value={i}>{p.bankCode}</option>)}</select></Field>
      {([['bankCode', 'شناسهٔ بانک'], ['sender', 'فرستندهٔ دقیق'], ['creditTemplate', 'قالب واریز'], ['debitTemplate', 'قالب برداشت (اختیاری)']] as const).map(([key, title]) => <Field key={key} label={title}><input required={key !== 'debitTemplate'} value={template[key]} onChange={e => setTemplate({ ...template, [key]: e.target.value })} /></Field>)}
      <p className={s.muted}>در قالب از {'{amount}'} و در صورت نیاز {'{account}'}، {'{reference}'}، {'{date}'}، {'{time}'} و {'{ignore}'} استفاده کنید. نمونه‌ها پیش از فعال‌سازی باید بررسی شوند.</p>
      <Field label="واحد مبلغ"><select value={template.unit} onChange={e => setTemplate({ ...template, unit: e.target.value as Template['unit'] })}><option value="IRR">ریال</option><option value="IRT">تومان</option></select></Field>
      <Field label="تقویم"><select value={template.calendar} onChange={e => setTemplate({ ...template, calendar: e.target.value as Template['calendar'] })}><option value="JALALI">شمسی</option><option value="GREGORIAN">میلادی</option></select></Field>
      <label className={s.check}><input type="checkbox" checked={verified} onChange={e => setVerified(e.target.checked)} /> قالب و فرستنده را بررسی کرده‌ام</label><label className={s.check}><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> فعال</label>
      <div className={s.actions}><button className={s.button} type="submit" disabled={busy}>{busy ? 'در حال ذخیره…' : 'ذخیره منبع'}</button>{selected && <button type="button" className={s.secondary} onClick={reset} disabled={busy}>انصراف</button>}</div>
    </form>
  </section>
}
