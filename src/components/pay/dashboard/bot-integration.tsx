'use client'
import { useCallback, useEffect, useState } from 'react'
import type { PayOverview } from '@/modules/billing/domain/pay'
import type { PayBotIntegrationView } from '@/modules/billing/domain/pay-bot'
import { api, json } from '../client'
import { ErrorNotice, Field } from '../shared'
import Link from '@/components/AppLink'
import RoutingRules from './routing-rules'
import s from '../Pay.module.css'

const profiles = [
  ['UNCONFIGURED', 'هنوز بررسی نکرده‌ام'],
  ['JSON_OK', 'پاسخ JSON با ok برابر true'],
  ['JSON_SUCCESS', 'پاسخ JSON با status برابر success'],
  ['HTTP_2XX', 'هر پاسخ HTTP موفق (فقط با قرارداد ربات)'],
] as const

export default function BotIntegration({ data }: { data: PayOverview }) {
  const [items, setItems] = useState<PayBotIntegrationView[]>([]), [gateways, setGateways] = useState<{ ref: string; name: string }[]>([])
  const [selected, setSelected] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [ready, setReady] = useState(false), [revision, setRevision] = useState(0)
  const [token, setToken] = useState(''), [saved, setSaved] = useState(false), [copied, setCopied] = useState(false)
  const [routingBusy, setRoutingBusy] = useState(false), [rulesSaved, setRulesSaved] = useState(false)
  const refresh = useCallback(() => setRevision(value => value + 1), [])
  useEffect(() => {
    const controller = new AbortController()
    api<{ items: PayBotIntegrationView[]; gateways: { ref: string; name: string }[] }>('/api/pay/bot-integrations', { signal: controller.signal })
      .then(connections => { if (controller.signal.aborted) return; setItems(connections.items); setGateways(connections.gateways); setReady(true); setError('') })
      .catch(cause => { if (!controller.signal.aborted && cause.name !== 'AbortError') setError(cause.message) })
    return () => controller.abort()
  }, [revision])
  const terminalId = selected || data.terminals[0]?.id || ''
  const current = items.find(item => item.terminalId === terminalId)
  const endpoint = current && typeof window !== 'undefined' ? new URL('/api/v1/pay/bot/' + current.id, window.location.origin).toString() : ''
  async function save(form: HTMLFormElement) {
    const values = new FormData(form)
    setBusy(true); setError(''); setSaved(false); setToken(''); setCopied(false)
    try {
      const result = await api<{ integration: PayBotIntegrationView; token?: string }>('/api/pay/bot-integrations', json('POST', {
        terminalId, version: current?.version || 0, callbackUrl: String(values.get('callbackUrl') || ''),
        callbackToken: String(values.get('callbackToken') || ''), ackPolicy: String(values.get('ackPolicy') || ''),
        responseMode: String(values.get('responseMode') || 'URL'), active: values.get('active') === 'on', rotateKey: values.get('rotateKey') === 'on',
      }))
      setToken(result.token || ''); setSaved(true); refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'ثبت اتصال انجام نشد') }
    finally { setBusy(false) }
  }
  return <section className={s.integration} aria-label="اتصال درگاه به ربات" aria-busy={busy}>
    <header className={s.integrationHead}><span className={s.eyebrow}>اتصال آمادهٔ ربات</span><h2>از پرداخت تا تأیید سفارش</h2><p className={s.muted}>دو کلید جدا، یک سفارش ثابت و سابقه‌ای روشن برای هر نتیجه.</p></header>
    <ErrorNotice error={error} />
    {!ready && !error && <p role="status">در حال دریافت اتصال‌ها…</p>}
    {error && <button type="button" className={s.secondary} onClick={refresh}>تازه‌کردن اتصال‌ها</button>}
    {!data.terminals.length ? <p className={s.notice}>ابتدا یک پایانه بسازید؛ سپس اتصال اختصاصی همان پایانه را تنظیم کنید.</p> : ready && <>
      <div className={s.connectGrid}>
        <form key={terminalId + ':' + (current?.version || 0)} className={s.card + ' ' + s.stack} onSubmit={event => { event.preventDefault(); void save(event.currentTarget) }}>
          <Field label="۱. پایانهٔ این ربات"><select aria-label="پایانهٔ اتصال ربات" disabled={busy || routingBusy} value={terminalId} onChange={event => { setSelected(event.target.value); setToken(''); setSaved(false); setRulesSaved(false) }}>{data.terminals.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
          <Field label="۲. API تأیید پرداخت در ربات"><input name="callbackUrl" type="url" dir="ltr" required defaultValue={current?.callbackUrl || new URL('/api/payment', data.merchant!.website).toString()} /></Field>
          <Field label={current?.hasCallbackToken ? 'کلید API پرداخت ربات (خالی یعنی حفظ کلید فعلی)' : '۳. کلید API پرداخت ربات'}><input name="callbackToken" type="password" autoComplete="new-password" dir="ltr" required={!current?.hasCallbackToken} maxLength={512} /></Field>
          <p className={s.muted}>این کلید از پنل ربات با دسترسی پرداخت گرفته می‌شود؛ با توکن خود ربات و کلید ساخت لینک فرق دارد.</p>
          <Field label="۴. معیار پاسخ موفق ربات"><select name="ackPolicy" defaultValue={current?.ackPolicy || 'UNCONFIGURED'}>{profiles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
          <p className={s.muted}>قالب پاسخ ربات را بررسی کنید. پاسخ ناشناخته تحویل موفق محسوب نمی‌شود و خودکار تکرار نخواهد شد.</p>
          <Field label="پاسخ ساخت لینک"><select name="responseMode" defaultValue={current?.responseMode || 'URL'}><option value="URL">یک لینک پرداخت (url)</option><option value="LINKS">فهرست دکمه‌ها (links)</option></select></Field>
          <label className={s.check}><input name="active" type="checkbox" defaultChecked={current?.active || false} />اتصال این ربات فعال باشد</label>
          {current && <label className={s.check}><input name="rotateKey" type="checkbox" />کلید ساخت لینک را تعویض کن؛ کلید قبلی از کار می‌افتد</label>}
          <button type="submit" className={s.button} disabled={busy || routingBusy || data.merchant?.status !== 'ACTIVE'}>{busy ? 'در حال ثبت…' : current ? 'ذخیرهٔ اتصال ربات' : 'ساخت اتصال و کلید'}</button>
        </form>
        <aside className={s.card + ' ' + s.stack}>
          <h3>تنظیم در پنل ربات</h3>
          <p className={s.muted}>ساخت لینک به فعال بودن API عمومی و دریافت وجه در تنظیمات درگاه نیاز دارد.</p>
          <ol className={s.guideSteps}><li><strong>آدرس API</strong><p>نشانی اتصال همین پایانه را در «تنظیمات درگاه سفارشی» ربات قرار دهید.</p></li><li><strong>توکن API</strong><p>کلید ساخت لینک را یک‌بار کپی کنید. رمز پرداخت ربات را در این فیلد نگذارید.</p></li><li><strong>پرداخت آزمایشی و نتیجه</strong><p>پرداخت موفق و یک درخواست تکراری را با همان order_id بررسی کنید؛ تحویل سرویس با سامانهٔ ربات است.</p></li></ol>
          {endpoint && <><Field label="آدرس API ساخت لینک"><input readOnly dir="ltr" value={endpoint} onFocus={event => event.currentTarget.select()} /></Field><p className={s.muted}>کلید فعلی: <bdi>{current?.keyPrefix}…</bdi> · {current?.active ? 'فعال' : 'غیرفعال'}</p></>}
          {token && <div className={s.oneTimeKey} role="status"><strong>کلید ساخت لینک؛ فقط همین‌بار نمایش داده می‌شود</strong><Field label="توکن API برای تنظیمات ربات"><input readOnly dir="ltr" value={token} onFocus={event => event.currentTarget.select()} /></Field><button type="button" className={s.secondary} onClick={() => void navigator.clipboard.writeText(token).then(() => setCopied(true)).catch(() => setError('کپی خودکار انجام نشد؛ کلید را از فیلد انتخاب و کپی کنید.'))}>{copied ? 'کلید کپی شد' : 'کپی کلید ساخت لینک'}</button></div>}
          {saved && <p role="status">اتصال ثبت شد. تغییر تنظیمات، ارسال‌های در انتظار با نسخهٔ قبلی را برای بررسی نگه می‌دارد.</p>}
          <p className={s.muted}>مبلغ درخواست ربات تومان است؛ صفحهٔ پرداخت، مبلغ و کارمزد نهایی را نمایش می‌دهد. انتخاب روش‌های فعال پرداخت در همان صفحه انجام می‌شود.</p>
        </aside>
      </div>
      {rulesSaved && <p role="status">قواعد انتخاب روش پرداخت ذخیره شد؛ سفارش‌های قبلی مسیر ثبت‌شدهٔ خود را حفظ می‌کنند.</p>}
      {current && <RoutingRules key={current.id + ':routing:' + current.routingVersion} integration={current} gateways={gateways} locked={busy} onBusyChange={setRoutingBusy} onSaved={() => { setRulesSaved(true); refresh() }} />}
      <p className={s.notice}>برای جست‌وجو، وضعیت صف و بررسی نتیجهٔ سفارش‌ها به <Link href="/pay/merchant/operations">عملیات ربات</Link> بروید.</p>
    </>}
  </section>
}
