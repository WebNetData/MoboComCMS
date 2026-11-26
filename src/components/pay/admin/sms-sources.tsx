'use client'

import { useCallback, useEffect, useState } from 'react'
import { api, json } from '../client'
import { ErrorNotice, Field } from '../shared'
import s from '../Pay.module.css'
import SmsForwarderGuide from './sms-forwarder-guide'

type Template = { bankCode: string; sender: string; creditTemplate: string; debitTemplate: string; unit: 'IRR' | 'IRT'; calendar: 'JALALI' | 'GREGORIAN' }
type Format = 'FORWARDER_V1' | 'EXTENDED_V1'
type Source = { id: string; version: number; label: string; bankAccountId: number; template: Template; format?: Format; verified: boolean; active: boolean }
type SavedSource = { id: string; bankCode: string; format?: Format }
type Bank = { id: number; title?: string; bankName: string; active: boolean; collectionUse: string }
const blank: Template = { bankCode: '', sender: '', creditTemplate: '', debitTemplate: '', unit: 'IRR', calendar: 'JALALI' }

export default function SmsSources({ bankAccounts }: { bankAccounts: Bank[] }) {
  const [items, setItems] = useState<Source[]>([]), [presets, setPresets] = useState<Template[]>([]), [selected, setSelected] = useState<Source | null>(null)
  const [label, setLabel] = useState(''), [bankAccountId, setBankAccountId] = useState(''), [template, setTemplate] = useState<Template>(blank), [verified, setVerified] = useState(false), [active, setActive] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [setup, setSetup] = useState<{ source: SavedSource; secret: string } | null>(null)
  const [format, setFormat] = useState<Format>('FORWARDER_V1')
  const [origin, setOrigin] = useState('')
  const [copyStatus, setCopyStatus] = useState('')
  const load = useCallback(async () => { try { const result = await api<{ items: Source[]; presets: Template[] }>('/api/admin/mobocom-pay/sms-sources'); setItems(result.items); setPresets(result.presets); setError('') } catch (e) { setError(e instanceof Error ? e.message : 'دریافت منابع پیامک ناموفق بود') } }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => { if (window.location.protocol === 'https:') setOrigin(window.location.origin) }, [])
  function reset() { setSelected(null); setLabel(''); setBankAccountId(''); setTemplate(blank); setVerified(false); setActive(false); setFormat('FORWARDER_V1'); setSetup(null); setCopyStatus('') }
  function edit(item: Source) { setSelected(item); setLabel(item.label); setBankAccountId(String(item.bankAccountId)); setTemplate(item.template); setVerified(item.verified); setActive(item.active); setFormat(item.format ?? 'EXTENDED_V1'); setSetup(null); setCopyStatus('') }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError(''); setSetup(null); setCopyStatus('')
    try { const result = await api<{ source: SavedSource; secret?: string }>('/api/admin/mobocom-pay/sms-sources', json(selected ? 'PATCH' : 'POST', { ...(selected ? { id: selected.id, version: selected.version } : {}), label, bankAccountId: Number(bankAccountId), template, format, verified, active })); reset(); if (result.secret) setSetup({ source: result.source, secret: result.secret }); await load() }
    catch (e) { setError(e instanceof Error ? e.message : 'ذخیرهٔ منبع انجام نشد') } finally { setBusy(false) }
  }
  function endpoint(source: { id: string; format?: Format }) { return `/api/payment/mobocom-pay/${source.format === 'FORWARDER_V1' ? 'sms-forwarder' : 'sms'}/${source.id}` }
  function fullEndpoint(source: { id: string; format?: Format }) { return origin ? `${origin}${endpoint(source)}` : '' }
  async function copy(value: string, description: string) {
    try {
      if (!value) throw new Error('HTTPS required')
      await navigator.clipboard.writeText(value)
      setCopyStatus(`${description} کپی شد`)
    } catch { setCopyStatus(`کپی ${description} انجام نشد؛ مقدار را دستی انتخاب و کپی کنید`) }
  }
  return <section className={`${s.card} ${s.stack}`} aria-labelledby="sms-sources-title">
    <h2 id="sms-sources-title">منابع پیامک بانکی</h2><p className={s.muted}>قالب و فرستنده را با پیام بانکی واقعی بررسی کنید. فعال‌سازی منبع به‌تنهایی اتصال یا اصالت پیامک را تضمین نمی‌کند.</p><ErrorNotice error={error} />
    <SmsForwarderGuide key={setup?.source.id ?? "existing"} sources={items.map(item => ({ id: item.id, label: item.label, bankCode: item.template.bankCode, format: item.format ?? 'EXTENDED_V1' }))} origin={origin} setup={setup} />
    {setup && <div className={`${s.notice} ${s.stack}`}>
      <p role="status">توکن و بدنه فقط این بار نمایش داده می‌شوند؛ پیش از خروج آن‌ها را در تنظیمات امن برنامه ثبت کنید</p>
      <Field label="کد بانک"><input dir="ltr" readOnly value={setup.source.bankCode} /></Field>
      <Field label="نشانی کامل HTTPS"><input dir="ltr" readOnly value={fullEndpoint(setup.source) || endpoint(setup.source)} /></Field>
      {!fullEndpoint(setup.source) && <p>برای نشانی کامل از دامنهٔ HTTPS سرور استفاده کنید</p>}
      <div><button type="button" className={s.secondary} disabled={!fullEndpoint(setup.source)} onClick={() => void copy(fullEndpoint(setup.source), 'نشانی')}>کپی نشانی HTTPS</button></div>
      <Field label="توکن تولیدشده"><input dir="ltr" readOnly value={setup.secret} /></Field>
      <div><button type="button" className={s.secondary} onClick={() => void copy(setup.secret, 'توکن')}>کپی توکن</button></div>
      {setup.source.format === 'FORWARDER_V1' && <><Field label="بدنه JSON"><textarea dir="ltr" readOnly rows={4} value={JSON.stringify({ sms: '{msg}', bank: setup.source.bankCode, token: setup.secret }, null, 2)} /></Field><div><button type="button" className={s.secondary} onClick={() => void copy(JSON.stringify({ sms: '{msg}', bank: setup.source.bankCode, token: setup.secret }, null, 2), 'بدنه JSON')}>کپی بدنه JSON</button></div><p>برای این قالب، سربرگ Bearer لازم نیست</p></>}
    </div>}
    {items.map(item => <div className={s.stack} key={item.id}><div className={s.row}><span>{item.label} · <bdi>{item.template.bankCode}</bdi> · {item.active ? 'فعال' : 'غیرفعال'} · {item.verified ? 'بررسی‌شده' : 'بررسی‌نشده'}</span><button type="button" className={s.secondary} disabled={busy} onClick={() => edit(item)}>ویرایش</button></div><span className={s.muted}>مسیر دریافت روی دامنهٔ HTTPS سرور:</span><code dir="ltr" style={{ overflowWrap: 'anywhere' }}>{endpoint(item)}</code><div><button type="button" className={s.secondary} disabled={!fullEndpoint(item)} onClick={() => void copy(fullEndpoint(item), 'نشانی HTTPS')}>کپی نشانی کامل HTTPS</button></div></div>)}
    <p role="status" aria-live="polite">{copyStatus}</p>
    <form className={s.stack} onSubmit={save}><h3>{selected ? 'ویرایش منبع' : 'منبع جدید'}</h3>
      <Field label="قالب دریافت"><select value={format} onChange={e => setFormat(e.target.value as Format)}><option value="FORWARDER_V1">SMS Forwarder سه‌فیلدی</option><option value="EXTENDED_V1">چهار‌فیلدی با زمان/شناسه</option></select></Field>
      {format === 'FORWARDER_V1' && <p className={s.muted}>این قالب شماره یا زمان و فرستندهٔ اصلی پیامک را ارسال نمی‌کند. فیلتر فرستنده را در برنامه تنظیم کنید و فقط پیام‌های تازه‌دریافت‌شده را بفرستید. برای خرید USDT با نرخ قفل‌شده از بله یا قالب دارای زمان معتبر استفاده کنید. <a href="https://play.google.com/store/apps/details?id=com.frzinapps.smsforward" target="_blank" rel="noreferrer">دریافت SMS Forwarder از Google Play</a></p>}
      <Field label="نام منبع"><input required maxLength={80} value={label} onChange={e => setLabel(e.target.value)} /></Field>
      <Field label="حساب اختصاصی"><select required disabled={!!selected} value={bankAccountId} onChange={e => setBankAccountId(e.target.value)}><option value="">انتخاب حساب</option>{bankAccounts.filter(a => a.collectionUse === 'MOBOCOM_PAY' && (a.active || String(a.id) === bankAccountId)).map(a => <option key={a.id} value={a.id} disabled={!a.active}>{a.title && a.title !== a.bankName ? `${a.title} · ` : ''}{a.bankName}{!a.active && ' (غیرفعال)'}</option>)}</select></Field>
      <Field label="نمونهٔ قالب"><select value="" onChange={e => { const p = presets[Number(e.target.value)]; if (p) setTemplate({ ...p }) }}><option value="">انتخاب نمونه</option>{presets.map((p, i) => <option key={p.bankCode} value={i}>{p.bankCode}</option>)}</select></Field>
      {([['bankCode', 'شناسهٔ بانک'], ['sender', 'فرستندهٔ دقیق'], ['creditTemplate', 'قالب واریز'], ['debitTemplate', 'قالب برداشت (اختیاری)']] as const).map(([key, title]) => <Field key={key} label={title}><input required={key !== 'debitTemplate'} value={template[key]} onChange={e => setTemplate({ ...template, [key]: e.target.value })} /></Field>)}
      <p className={s.muted}>در قالب از {'{amount}'} و در صورت نیاز {'{account}'}، {'{reference}'}، {'{date}'}، {'{time}'} و {'{ignore}'} استفاده کنید. نمونه‌ها پیش از فعال‌سازی باید بررسی شوند.</p>
      <Field label="واحد مبلغ"><select value={template.unit} onChange={e => setTemplate({ ...template, unit: e.target.value as Template['unit'] })}><option value="IRR">ریال</option><option value="IRT">تومان</option></select></Field>
      <Field label="تقویم"><select value={template.calendar} onChange={e => setTemplate({ ...template, calendar: e.target.value as Template['calendar'] })}><option value="JALALI">شمسی</option><option value="GREGORIAN">میلادی</option></select></Field>
      <label className={s.check}><input type="checkbox" checked={verified} onChange={e => setVerified(e.target.checked)} /> قالب، فیلتر فرستنده و ارسال پیام‌های تازه را بررسی کرده‌ام</label><label className={s.check}><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> فعال</label>
      <div className={s.actions}><button className={s.button} type="submit" disabled={busy}>{busy ? 'در حال ذخیره…' : 'ذخیره منبع'}</button>{selected && <button type="button" className={s.secondary} onClick={reset} disabled={busy}>انصراف</button>}</div>
    </form>
  </section>
}
