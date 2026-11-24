'use client'

import { useState } from 'react'
import type { PayBotIntegrationView } from '@/modules/billing/domain/pay-bot'
import type { PayRoutingRule } from '@/modules/billing/domain/pay-routing'
import { api, json } from '../client'
import { ErrorNotice, Field } from '../shared'
import s from '../Pay.module.css'

const paymentTypes: { value: PayRoutingRule['types'][number]; label: string }[] = [
  { value: 'purchase', label: 'خرید' },
  { value: 'renewal', label: 'تمدید' },
  { value: 'balance_increase', label: 'افزایش موجودی' },
]

export default function RoutingRules({ integration, gateways, onSaved, locked = false, onBusyChange }: {
  integration: PayBotIntegrationView
  gateways: { ref: string; name: string }[]
  onSaved: () => void
  locked?: boolean; onBusyChange?: (value: boolean) => void
}) {
  const [rules, setRules] = useState<PayRoutingRule[]>(() => integration.routingRules.map(rule => ({ ...rule, types: [...rule.types], gateways: [...rule.gateways] })))
  const [expanded, setExpanded] = useState<string[]>([])
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false)

  function update(index: number, changes: Partial<PayRoutingRule>) {
    setRules(current => current.map((rule, i) => i === index ? { ...rule, ...changes } : rule))
    setSaved(false); setError('')
  }
  function move(index: number, direction: -1 | 1) {
    setRules(current => {
      const next = [...current], target = index + direction
      if (target < 0 || target >= next.length) return current
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
    setSaved(false); setError('')
  }
  function add() {
    const id = crypto.randomUUID()
    setRules(current => [...current, { id, name: '', enabled: true, minAmountToman: '', maxAmountToman: '', types: [], minPayments: 0, minMembershipDays: 0, gateways: [] }])
    setExpanded(current => [...current, id]); setSaved(false); setError('')
  }
  async function save() {
    if (busy || locked) return
    if (rules.some(rule => !Number.isSafeInteger(rule.minPayments) || rule.minPayments < 0 || !Number.isSafeInteger(rule.minMembershipDays) || rule.minMembershipDays < 0)) { setError('حداقل سابقه و روزهای عضویت را به‌صورت عدد صحیح وارد کنید.'); return }
    if (rules.some(rule => rule.gateways.length < 1 || rule.gateways.length > 5)) {
      setError('برای هر قانون بین یک تا پنج روش پرداخت انتخاب کنید.'); return
    }
    if (rules.some(rule => !rule.name.trim() || (rule.minAmountToman !== '' && rule.maxAmountToman !== '' && BigInt(rule.minAmountToman) > BigInt(rule.maxAmountToman)))) {
      setError('نام هر قانون و بازهٔ مبلغ آن را بررسی کنید.'); return
    }
    setBusy(true); onBusyChange?.(true); setError(''); setSaved(false)
    try {
      await api<{ integration: PayBotIntegrationView }>('/api/pay/bot-routing', json('POST', { id: integration.id, version: integration.routingVersion, rules: rules.map(rule => ({ ...rule, name: rule.name.trim() })) }))
      setSaved(true); onSaved()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'ذخیرهٔ قوانین انجام نشد') }
    finally { setBusy(false); onBusyChange?.(false) }
  }

  return <form className={s.card + ' ' + s.stack} dir="rtl" aria-label="قوانین مسیردهی پرداخت" aria-busy={busy} onInvalidCapture={() => setExpanded(rules.map(rule => rule.id))} onSubmit={event => { event.preventDefault(); void save() }}>
    <h3>قوانین انتخاب روش پرداخت</h3>
    <p className={s.muted}>اولین قانون فعال و منطبق اجرا می‌شود. اگر قانونی منطبق نباشد روش‌های فعلی حفظ می‌شوند؛ اگر قانون منطبق روش قابل استفاده‌ای نداشته باشد، پرداخت ساخته نمی‌شود. چند لینک همچنان یک پرداخت هستند.</p>
    <p className={s.notice}>تعداد پرداخت و مدت عضویت، اطلاعات ارسالی پذیرنده برای انتخاب مسیر هستند. نبود سابقه شرط بزرگ‌تر از صفر را برآورده نمی‌کند.</p>
    <ErrorNotice error={error} />
    {saved && <p role="status">قوانین ذخیره شدند.</p>}
    {busy && <p role="status">در حال ذخیرهٔ قوانین…</p>}
    <fieldset disabled={busy || locked} className={s.stack}>
      <legend>قوانین به ترتیب اجرا</legend>
      {!rules.length && <p className={s.muted}>هنوز قانونی ثبت نشده است.</p>}
      {rules.map((rule, index) => {
        const missing = rule.gateways.filter(ref => !gateways.some(gateway => gateway.ref === ref))
        return <section key={rule.id} className={s.card + ' ' + s.stack} aria-label={`قانون ${index + 1}`}>
          <details open={expanded.includes(rule.id)} onToggle={event => { const open = event.currentTarget.open; setExpanded(current => open ? current.includes(rule.id) ? current : [...current, rule.id] : current.filter(id => id !== rule.id)) }}>
          <summary className={s.ruleSummary}>قانون {(index + 1).toLocaleString('fa-IR')} · {rule.name || 'قانون جدید'} · {rule.enabled ? 'فعال' : 'غیرفعال'}</summary>
          <div className={s.stack}>
          <h4>شرایط قانون {(index + 1).toLocaleString('fa-IR')}</h4>
          <div className={s.actions}>
            <button type="button" className={s.secondary} disabled={index === 0} onClick={() => move(index, -1)} aria-label={`انتقال قانون ${index + 1} به بالا`}>بالا</button>
            <button type="button" className={s.secondary} disabled={index === rules.length - 1} onClick={() => move(index, 1)} aria-label={`انتقال قانون ${index + 1} به پایین`}>پایین</button>
            <button type="button" className={s.secondary} onClick={() => { setRules(current => current.filter((_, i) => i !== index)); setSaved(false); setError('') }} aria-label={`حذف قانون ${index + 1}`}>حذف</button>
          </div>
          <label className={s.check}><input type="checkbox" checked={rule.enabled} onChange={event => update(index, { enabled: event.target.checked })} />قانون فعال باشد</label>
          <Field label="نام قانون"><input required maxLength={80} value={rule.name} onChange={event => update(index, { name: event.target.value })} /></Field>
          <Field label="حداقل مبلغ (تومان؛ خالی یعنی بدون حد)"><input type="text" inputMode="numeric" dir="ltr" pattern="(0|[1-9][0-9]{0,14})?" maxLength={15} value={rule.minAmountToman} onChange={event => update(index, { minAmountToman: event.target.value })} /></Field>
          <Field label="حداکثر مبلغ (تومان؛ خالی یعنی بدون حد)"><input type="text" inputMode="numeric" dir="ltr" pattern="(0|[1-9][0-9]{0,14})?" maxLength={15} value={rule.maxAmountToman} onChange={event => update(index, { maxAmountToman: event.target.value })} /></Field>
          <fieldset className={s.stack}><legend>نوع پرداخت (انتخاب نکردن یعنی همه)</legend>{paymentTypes.map(type => <label key={type.value} className={s.check}><input type="checkbox" checked={rule.types.includes(type.value)} onChange={event => update(index, { types: event.target.checked ? [...rule.types, type.value] : rule.types.filter(value => value !== type.value) })} />{type.label}</label>)}</fieldset>
          <Field label="حداقل تعداد پرداخت"><input type="number" min={0} max={Number.MAX_SAFE_INTEGER} step={1} required value={Number.isFinite(rule.minPayments) ? rule.minPayments : ''} onChange={event => update(index, { minPayments: event.target.valueAsNumber })} /></Field>
          <Field label="حداقل مدت عضویت (روز)"><input type="number" min={0} max={Number.MAX_SAFE_INTEGER} step={1} required value={Number.isFinite(rule.minMembershipDays) ? rule.minMembershipDays : ''} onChange={event => update(index, { minMembershipDays: event.target.valueAsNumber })} /></Field>
          <fieldset className={s.stack}><legend>روش‌های پرداخت (یک تا پنج روش)</legend>
            {gateways.map(gateway => <label key={gateway.ref} className={s.check}><input type="checkbox" checked={rule.gateways.includes(gateway.ref)} disabled={!rule.gateways.includes(gateway.ref) && rule.gateways.length >= 5} onChange={event => update(index, { gateways: event.target.checked ? [...rule.gateways, gateway.ref] : rule.gateways.filter(ref => ref !== gateway.ref) })} />{gateway.name} <bdi>{gateway.ref}</bdi></label>)}
            {missing.map(ref => <label key={ref} className={s.check}><input type="checkbox" checked onChange={() => update(index, { gateways: rule.gateways.filter(value => value !== ref) })} />روش در دسترس نیست: <bdi>{ref}</bdi> (برای حذف، انتخاب را بردارید)</label>)}
            {!gateways.length && !missing.length && <p className={s.muted}>روش پرداختی برای انتخاب موجود نیست.</p>}
          </fieldset>
          </div></details>
        </section>
      })}
      <button type="button" className={s.secondary} disabled={rules.length >= 12} onClick={add}>افزودن قانون</button>
      <button type="submit" className={s.button}>{busy ? 'در حال ذخیره…' : 'ذخیرهٔ قوانین'}</button>
    </fieldset>
  </form>
}
