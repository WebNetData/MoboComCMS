'use client'

import { useState } from 'react'
import s from './sms-forwarder-guide.module.css'

type Source = { id: string; label: string; bankCode: string; format: 'FORWARDER_V1' | 'EXTENDED_V1' }
type Setup = { source: { id: string; bankCode: string; format?: 'FORWARDER_V1' | 'EXTENDED_V1' }; secret: string }

export default function SmsForwarderGuide({ sources, origin, setup }: { sources: Source[]; origin: string; setup: Setup | null }) {
  const [chosenId, setChosenId] = useState(''), [feedback, setFeedback] = useState('')
  const available = setup && !sources.some(source => source.id === setup.source.id) ? [...sources, { ...setup.source, label: 'منبع تازه', format: setup.source.format ?? 'EXTENDED_V1' }] : sources
  const source = available.find(item => item.id === chosenId) ?? (setup ? available.find(item => item.id === setup.source.id) : undefined) ?? available[0]
  const forwarder = source?.format === 'FORWARDER_V1'
  const url = origin && forwarder ? `${origin}/api/payment/mobocom-pay/sms-forwarder/${source.id}` : ''
  const token = setup && source?.id === setup.source.id ? setup.secret : 'توکن یک‌بار نمایش‌داده‌شده را اینجا قرار دهید'
  const body = JSON.stringify({ sms: '{msg}', bank: forwarder ? source.bankCode : 'کد بانک منبع', token }, null, 2)
  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setFeedback(`${label} کپی شد`) }
    catch { setFeedback(`کپی ${label} انجام نشد؛ متن را دستی انتخاب و کپی کنید`) }
  }
  return <section className={s.guide} aria-labelledby="sms-forwarder-guide-title" dir="rtl">
    <div className={s.heading}><div><span className={s.eyebrow}>راهنمای اتصال</span><h3 id="sms-forwarder-guide-title">راه‌اندازی SMS Forwarder</h3><p>پیامک بانکی تازه را با یک درخواست امن به منبع اختصاصی خود بفرستید.</p></div><span className={s.badge} dir="ltr">FORWARDER_V1</span></div>
    <div className={s.warning}><strong>توکن فقط یک بار نمایش داده می‌شود</strong><p>پس از ساخت منبع، توکن را در جای امن برنامه ثبت کنید. توکن قبلی دوباره قابل مشاهده نیست؛ آن را در نشانی قرار ندهید.</p></div>
    <ol className={s.steps}><li><span className={s.number}>۱</span><div><h4>منبع را انتخاب کنید</h4><p>یک منبع با قالب SMS Forwarder سه‌فیلدی بسازید یا انتخاب کنید.</p>{available.length ? <label className={s.label}>منبع پیامک<select value={source?.id ?? ''} onChange={e => { setChosenId(e.target.value); setFeedback('') }}>{available.map(item => <option key={item.id} value={item.id}>{item.label} · {item.bankCode}</option>)}</select></label> : <p className={s.hint}>هنوز منبعی وجود ندارد؛ فرم منبع جدید را در پایین صفحه تکمیل کنید.</p>}{source && !forwarder && <p className={s.hint}>این منبع از قالب پیشرفته و سربرگ Bearer استفاده می‌کند؛ تنظیمات سه‌فیلدی این راهنما برای آن نیست.</p>}</div></li>
    <li><span className={s.number}>۲</span><div><h4>درخواست را تنظیم کنید</h4><p>روش درخواست <bdi>POST</bdi> و سربرگ <code dir="ltr">Content-Type: application/json</code> است. برای این قالب سربرگ Bearer لازم نیست.</p><div className={s.field}><span>نشانی اختصاصی HTTPS</span><code dir="ltr">{url || (forwarder ? 'صفحه را از نشانی HTTPS باز کنید' : 'پس از انتخاب منبع سه‌فیلدی نمایش داده می‌شود')}</code><button type="button" disabled={!url} onClick={() => void copy(url, 'نشانی')}>کپی نشانی</button></div><div className={s.field}><span>بدنه JSON</span><pre dir="ltr">{body}</pre><button type="button" disabled={!forwarder} onClick={() => void copy(body, 'بدنه')}>کپی بدنه</button></div><p><code dir="ltr">bank</code> کد بانک همین منبع است، نه شماره یا نام فرستندهٔ واقعی پیامک. <code dir="ltr">{'{msg}'}</code> متن پیامک دریافت‌شده را جای‌گذاری می‌کند.</p></div></li>
    <li><span className={s.number}>۳</span><div><h4>فیلتر و دسترسی گوشی را بررسی کنید</h4><p>فیلتر فرستنده را روی فرستندهٔ دقیق بانک تنظیم کنید و فقط پیامک‌های تازهٔ بانکی را بفرستید. دسترسی اعلان‌ها و محدودیت‌های باتری گوشی را برای عملکرد برنامه بررسی کنید.</p></div></li></ol>
    <p className={s.feedback} role="status" aria-live="polite">{feedback}</p>
  </section>
}
