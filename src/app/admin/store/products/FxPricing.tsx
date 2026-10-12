'use client'

import { useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import { fa, faDate } from '../shared'

type Form = Record<string, any>
type Preview = { rate: number; rateAt: string | null; conversion: string; markup: string; fixed: string; rounding: string; total: string; currency: string }

const CURRENCIES: [string, string][] = [['USD', 'دلار آمریکا'], ['EUR', 'یورو'], ['GBP', 'پوند'], ['AED', 'درهم امارات'], ['TRY', 'لیر ترکیه'], ['CNY', 'یوان چین'], ['CAD', 'دلار کانادا'], ['AUD', 'دلار استرالیا'], ['CHF', 'فرانک سوئیس'], ['RUB', 'روبل'], ['USDT', 'تتر']]
const unit = (currency: string) => (currency === 'IRR' ? 'ریال' : 'تومان')
const amount = (value: string) => fa(Number(value) || 0)

/**
 * Price section of a product in foreign-currency mode: cost in dollars/euros,
 * profit percentage and fixed profit; the Toman price is computed on the
 * server from the live rate and shown here part by part.
 */
export default function FxPricing({ form, update }: { form: Form; update: (key: string, value: unknown) => void }) {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState('')
  const sell = form.currency === 'IRR' ? 'IRR' : 'IRT'

  useEffect(() => {
    if (!form.fxAmount) { setPreview(null); setError(''); return }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const response = await fetch('/api/admin/fx', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify({ op: 'preview', currency: sell, fxCurrency: form.fxCurrency || 'USD', fxAmount: form.fxAmount, markupPercent: form.markupPercent, markupFixed: form.markupFixed }) })
        const body = await response.json().catch(() => null)
        if (!response.ok) { setPreview(null); setError(body?.error || 'محاسبه نشد'); return }
        setError(''); setPreview(body)
      } catch { /* aborted */ }
    }, 350)
    return () => { clearTimeout(timer); controller.abort() }
  }, [form.fxAmount, form.fxCurrency, form.markupPercent, form.markupFixed, sell])

  const field = (key: string, label: string, props: Record<string, unknown> = {}) => <label className="sa-field"><span>{label}</span><input className="input" dir="ltr" inputMode="decimal" value={form[key] ?? ''} onChange={(event) => update(key, event.target.value.replace(/[^\d.]/g, ''))} {...props} /></label>
  const code = form.fxCurrency || 'USD'

  return <>
    <div className="sa-grid">
      <label className="sa-field"><span>ارز قیمت پایه</span><select className="select" value={code} onChange={(event) => update('fxCurrency', event.target.value)}>{CURRENCIES.map(([value, label]) => <option key={value} value={value}>{label} ({value})</option>)}</select></label>
      {field('fxAmount', `قیمت ارزی (${code}) *`, { required: true, placeholder: '20' })}
      {field('markupPercent', 'درصد سود (٪)', { placeholder: '0' })}
      {field('markupFixed', `سود ثابت (${unit(sell)})`, { placeholder: '0' })}
      <label className="sa-field"><span>واحد فروش</span><select className="select" value={sell} onChange={(event) => update('currency', event.target.value)}><option value="IRT">تومان</option><option value="IRR">ریال</option></select></label>
      {field('fxCompareAt', `قیمت ارزی قبل از تخفیف (${code})`)}
      <span data-vip="" style={{ display: 'contents' }}>{field('fxMemberPrice', `قیمت ارزی اعضای VIP (${code})`)}</span>
      <label className="sa-field"><span>پایان پیشنهاد شگفت‌انگیز</span><input className="input" type="datetime-local" value={form.saleEndsAt} onChange={(event) => update('saleEndsAt', event.target.value)} /></label>
      <label data-vip="" className="sa-field"><span>روز VIP هدیه با خرید</span><input className="input" type="number" min={0} value={form.vipGiftDays ?? 0} onChange={(event) => update('vipGiftDays', event.target.value)} /></label>
    </div>
    <div className="px-breakdown" aria-live="polite">
      {preview ? <dl>
        <div><dt>نرخ {code} {preview.rateAt ? `(${faDate(preview.rateAt, true)})` : ''}</dt><dd>{fa(Math.round(preview.rate))} تومان</dd></div>
        <div><dt>تبدیل به {unit(preview.currency)}</dt><dd>{amount(preview.conversion)}</dd></div>
        <div><dt>سود درصدی</dt><dd>+ {amount(preview.markup)}</dd></div>
        <div><dt>سود ثابت</dt><dd>+ {amount(preview.fixed)}</dd></div>
        {Number(preview.rounding) > 0 && <div><dt>گرد کردن</dt><dd>+ {amount(preview.rounding)}</dd></div>}
        <div className="is-total"><dt>قیمت فروش</dt><dd>{amount(preview.total)} {unit(preview.currency)}</dd></div>
      </dl> : <p className={error ? 'is-error' : ''}>{error || 'قیمت ارزی را وارد کنید تا قیمت فروش محاسبه شود.'}</p>}
      <p>قیمت فروش با هر به‌روزرسانی نرخ خودکار دوباره حساب می‌شود. نرخ‌ها و منبع آن‌ها در <Link href="/admin/store/currency" className="sa-link">نرخ ارز</Link> مدیریت می‌شوند.{form.repricedAt ? ` آخرین محاسبه: ${faDate(form.repricedAt, true)}` : ''}</p>
    </div>
  </>
}
