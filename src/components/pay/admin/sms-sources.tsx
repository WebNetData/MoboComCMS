'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { api, json, money } from '../client'
import { ErrorNotice, Field } from '../shared'
import s from '../Pay.module.css'
import SmsForwarderGuide from './sms-forwarder-guide'
import { parseSmsAmount } from '@/modules/billing/domain/pay-sms-template'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import d from './AdminSettings.module.css'

type Template = { bankCode: string; sender: string; creditTemplate: string; debitTemplate: string; unit: 'IRR' | 'IRT'; calendar: 'JALALI' | 'GREGORIAN' }
type Format = 'FORWARDER_V1' | 'EXTENDED_V1'
type Source = { id: string; version: number; label: string; bankCode: string; bankAccountId: number; template: Template | null; format: Format | null; verified: boolean; active: boolean; canEdit: boolean }
type SavedSource = Pick<Source, 'id' | 'bankCode'> & { format: Format }
type Bank = { id: number; title?: string; bankName: string; active: boolean; collectionUse: string; cardNumber?: string }
const blank: Template = { bankCode: '', sender: '', creditTemplate: '', debitTemplate: '', unit: 'IRR', calendar: 'JALALI' }

function SmsTemplateTest({ template }: { template: Template }) {
  const [sample, setSample] = useState('')
  const [checked, setChecked] = useState(false)
  const result = checked ? parseSmsAmount(template, sample) : null
  return <details className={`${s.stack} ${d.test}`}>
    <summary>آزمون قالب پیامک</summary>
    <Field label="متن نمونهٔ پیامک"><textarea rows={3} maxLength={4096} value={sample} onChange={event => { setSample(event.target.value); setChecked(false) }} /></Field>
    <p className={s.muted}>این آزمون در مرورگر انجام می‌شود و پرداختی ثبت نمی‌کند.</p>
    <div><button type="button" className={s.secondary} disabled={!sample.trim()} onClick={() => setChecked(true)}>بررسی قالب</button></div>
    {result && <p className={s.notice} role="status">{result.ok
      ? result.direction === 'CREDIT' ? `واریز شناسایی شد · ${money(result.amountRial)}` : 'برداشت شناسایی شد'
      : 'متن با قالب واریز یا برداشت مطابقت ندارد. واحد مبلغ، قالب و کد بانک را بررسی کنید.'}</p>}
  </details>
}

export default function SmsSources({ bankAccounts }: { bankAccounts: Bank[] }) {
  const [items, setItems] = useState<Source[]>([]), [presets, setPresets] = useState<Template[]>([]), [selected, setSelected] = useState<Source | null>(null)
  const [label, setLabel] = useState(''), [bankAccountId, setBankAccountId] = useState(''), [template, setTemplate] = useState<Template>(blank), [verified, setVerified] = useState(false), [active, setActive] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [setup, setSetup] = useState<{ source: SavedSource; secret: string } | null>(null)
  const [format, setFormat] = useState<Format>('FORWARDER_V1')
  const [origin, setOrigin] = useState('')
  const [copyStatus, setCopyStatus] = useState('')
  const [saveStatus, setSaveStatus] = useState('')
  const editorTitle = useRef<HTMLHeadingElement>(null)
  const [loaded, setLoaded] = useState(false)
  const canCreate = bankAccounts.some(account => account.active)
  const load = useCallback(async () => { try { const result = await api<{ items: Source[]; presets: Template[] }>('/api/admin/mobocom-pay/sms-sources'); setItems(result.items); setPresets(result.presets); setLoaded(true); setError('') } catch (e) { setError(e instanceof Error ? e.message : 'دریافت منابع پیامک ناموفق بود') } }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => { if (window.location.protocol === 'https:') setOrigin(window.location.origin) }, [])
  function reset() { setSelected(null); setLabel(''); setBankAccountId(''); setTemplate(blank); setVerified(false); setActive(false); setFormat('FORWARDER_V1'); setSetup(null); setCopyStatus(''); setSaveStatus(''); setError('') }
  function edit(item: Source) { editorTitle.current?.focus(); setSelected(item); setLabel(item.label); setBankAccountId(String(item.bankAccountId)); setTemplate(item.template ?? { ...blank, bankCode: item.bankCode }); setVerified(item.verified); setActive(item.active); setFormat(item.format ?? 'FORWARDER_V1'); setSetup(null); setCopyStatus(''); setSaveStatus(''); setError('') }
  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError(''); setSaveStatus('')
    try {
      const result = await api<{ source: Source; secret?: string }>('/api/admin/mobocom-pay/sms-sources', json(selected ? 'PATCH' : 'POST', {
        ...(selected ? { id: selected.id, version: selected.version } : {}), label, bankAccountId: Number(bankAccountId), template, format, verified, active,
      }))
      setItems(rows => [result.source, ...rows.filter(row => row.id !== result.source.id)])
      setSelected(result.source)
      setLabel(result.source.label)
      if (result.source.template) setTemplate(result.source.template)
      const savedFormat = result.source.format
      if (savedFormat) {
        setSetup(previous => {
          const secret = result.secret ?? (previous?.source.id === result.source.id ? previous.secret : null)
          return secret ? { source: { ...result.source, format: savedFormat }, secret } : null
        })
      }
      setSaveStatus(`منبع «${result.source.label}» ذخیره شد.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ذخیرهٔ منبع انجام نشد')
    } finally { setBusy(false) }
  }
  function endpoint(source: { id: string; format: Format | null }) { return `/api/payment/mobocom-pay/${source.format === 'FORWARDER_V1' ? 'sms-forwarder' : 'sms'}/${source.id}` }
  function fullEndpoint(source: { id: string; format: Format | null }) { return origin ? `${origin}${endpoint(source)}` : '' }
  async function copy(value: string, description: string) {
    try {
      if (!value) throw new Error('HTTPS required')
      await navigator.clipboard.writeText(value)
      setCopyStatus(`${description} کپی شد`)
    } catch { setCopyStatus(`کپی ${description} انجام نشد؛ مقدار را دستی انتخاب و کپی کنید`) }
  }
  return <section className={`${s.card} ${d.section}`} aria-labelledby="sms-sources-title">
    <div className={d.title}><span className={d.icon}><Icon name="phone" size={19} /></span><div><h2 id="sms-sources-title">منابع پیامک بانکی</h2><p>قالب و فرستنده را با پیام بانکی بررسی کنید. فعال بودن منبع، به‌تنهایی اتصال را تأیید نمی‌کند.</p></div></div>
    <ErrorNotice error={error} />
    {error && <button type="button" className={s.secondary} disabled={busy} onClick={() => void load()}>تازه‌کردن فهرست منابع</button>}
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
    <div className={d.smsColumns}>
    <section className={d.smsList} aria-labelledby="pay-sms-list-title">
    <h3 id="pay-sms-list-title">منابع ثبت‌شده</h3>
    {!loaded && !error && <p className={d.empty} role="status">در حال دریافت منابع پیامک…</p>}
    {loaded && !items.length && <p className={d.empty}>منبع پیامکی ثبت نشده است.</p>}
    {items.map(item => <article className={`${s.card} ${s.stack} ${d.sourceCard}`} data-selected={selected?.id === item.id} key={item.id}>
      <div>
        <span><strong>{item.label}</strong><small><bdi>{item.bankCode}</bdi> · {item.active ? 'فعال' : 'غیرفعال'} · {item.verified ? 'بررسی‌شده' : 'بررسی‌نشده'}</small></span>
        {item.canEdit && <button type="button" className={s.secondary} disabled={busy} onClick={() => edit(item)}>ویرایش</button>}
      </div>
      {item.format ? <>
        <span className={s.muted}>مسیر دریافت روی دامنهٔ HTTPS سرور:</span><code dir="ltr">{endpoint(item)}</code>
        <div><button type="button" className={s.secondary} disabled={!fullEndpoint(item)} onClick={() => void copy(fullEndpoint(item), 'نشانی HTTPS')}>کپی نشانی کامل HTTPS</button></div>
      </> : <p className={s.notice}>قالب ذخیره‌شده به اصلاح نیاز دارد.</p>}
    </article>)}
    <p role="status" aria-live="polite" className={d.feedback}>{copyStatus}</p>
    </section>
    <form className={d.smsEditor} onSubmit={save} aria-labelledby="pay-sms-editor-title"><h3 id="pay-sms-editor-title" ref={editorTitle} tabIndex={-1}>{selected ? 'ویرایش منبع' : 'منبع جدید'}</h3>
      <fieldset className={d.group}><legend>حساب مقصد و روش دریافت</legend>
      <Field label="قالب دریافت"><select value={format} onChange={e => setFormat(e.target.value as Format)}><option value="FORWARDER_V1">SMS Forwarder سه‌فیلدی</option><option value="EXTENDED_V1">چهار‌فیلدی با زمان/شناسه</option></select></Field>
      {format === 'FORWARDER_V1' && <p className={s.muted}>فرستندهٔ بانک را در برنامه فیلتر کنید و فقط پیام‌های تازه را بفرستید. برای خرید USDT با نرخ قفل‌شده، قالب زمان‌دار یا بررسی دستی رسید لازم است. <a href="https://play.google.com/store/apps/details?id=com.frzinapps.smsforward" target="_blank" rel="noreferrer">دریافت SMS Forwarder از Google Play</a></p>}
      <Field label="نام منبع"><input required maxLength={80} value={label} onChange={e => setLabel(e.target.value)} /></Field>
      <Field label="کارت یا حساب مقصد پیامک"><select required disabled={!!selected} value={bankAccountId} onChange={e => setBankAccountId(e.target.value)}><option value="">انتخاب حساب</option>{bankAccounts.filter(a => a.active || String(a.id) === bankAccountId).map(a => <option key={a.id} value={a.id} disabled={!a.active}>{a.title && a.title !== a.bankName ? `${a.title} · ` : ''}{a.bankName} · {a.cardNumber ? `کارت …${a.cardNumber.slice(-4)}` : `حساب ${a.id}`}{!a.active && ' (غیرفعال)'}</option>)}</select></Field>
      {!canCreate && !selected && <p className={s.notice}>برای ثبت منبع، یک حساب فعال در <Link href="/admin/bank-accounts">حساب‌های بانکی</Link> ثبت کنید.</p>}
      {bankAccounts.some(account => String(account.id) === bankAccountId && account.collectionUse === 'GENERAL') && <p className={s.muted}>شمارهٔ حساب بانکی را در رکورد همین کارت ثبت کنید. قالب واریز کارت عمومی باید از <code>{'{account}'}</code> برای تشخیص حساب استفاده کند.</p>}
      </fieldset>
      <fieldset className={d.group}><legend>قالب پیام بانکی</legend>
      <Field label="نمونهٔ قالب"><select value="" onChange={e => { if (e.target.value) { const p = presets[Number(e.target.value)]; if (p) setTemplate({ ...p }) } }}><option value="">انتخاب نمونه</option>{presets.map((p, i) => <option key={p.bankCode} value={i}>{p.bankCode}</option>)}</select></Field>
      {([['bankCode', 'شناسهٔ بانک'], ['sender', 'فرستندهٔ دقیق'], ['creditTemplate', 'قالب واریز'], ['debitTemplate', 'قالب برداشت (اختیاری)']] as const).map(([key, title]) => <Field key={key} label={title}><input required={key !== 'debitTemplate'} value={template[key]} onChange={e => setTemplate({ ...template, [key]: e.target.value })} /></Field>)}
      <p className={s.muted}>در قالب از {'{amount}'} و در صورت نیاز {'{account}'}، {'{reference}'}، {'{date}'}، {'{time}'} و {'{ignore}'} استفاده کنید. نمونه‌ها پیش از فعال‌سازی باید بررسی شوند.</p>
      <div className={d.fields}>
      <Field label="واحد مبلغ"><select value={template.unit} onChange={e => setTemplate({ ...template, unit: e.target.value as Template['unit'] })}><option value="IRR">ریال</option><option value="IRT">تومان</option></select></Field>
      <Field label="تقویم"><select value={template.calendar} onChange={e => setTemplate({ ...template, calendar: e.target.value as Template['calendar'] })}><option value="JALALI">شمسی</option><option value="GREGORIAN">میلادی</option></select></Field>
      </div>
      <SmsTemplateTest key={selected?.id ?? 'new'} template={template} />
      </fieldset>
      <fieldset className={d.group}><legend>وضعیت فعال‌سازی</legend>
      <label className={s.check}><input type="checkbox" checked={verified} onChange={e => setVerified(e.target.checked)} /> قالب، فیلتر فرستنده و ارسال پیام‌های تازه را بررسی کرده‌ام</label><label className={s.check}><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> فعال</label>
      </fieldset>
      <div className={s.actions}><button className={s.button} type="submit" disabled={busy || !selected && !canCreate}>{busy ? 'در حال ذخیره…' : 'ذخیره منبع'}</button>{selected && <button type="button" className={s.secondary} onClick={reset} disabled={busy}>منبع جدید</button>}</div>
      {saveStatus && <p role="status" className={s.notice}>{saveStatus}</p>}
    </form>
    </div>
    <SmsForwarderGuide key={setup?.source.id ?? "existing"} sources={items.flatMap(item => item.format ? [{ ...item, format: item.format }] : [])} origin={origin} setup={setup} />
  </section>
}
