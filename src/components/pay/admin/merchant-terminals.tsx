'use client'

import { useState, type FormEvent } from 'react'
import type { PayChannelType } from '@/modules/billing/domain/pay'
import { PAY_CHANNEL_LABELS } from '@/modules/billing/domain/pay-channels'
import type { MerchantDetail } from '@/modules/billing/domain/pay-merchant-admin'
import { Badge, Field } from '../shared'
import type { MerchantAdminAction } from './merchant-detail'
import s from '../Pay.module.css'
import o from './Merchants.module.css'

type Terminal = MerchantDetail['terminals'][number]

function TerminalForm({ terminal, disabled, save }: { terminal?: Terminal; disabled: boolean; save: MerchantAdminAction }) {
  const [kind, setKind] = useState<PayChannelType>(terminal?.channelType ?? 'PAYMENT_LINK')
  const web = kind === 'WEBSITE' || kind === 'BOT'
  const fixedKind = Boolean(terminal?.bot)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    void save({
      action: terminal ? 'terminal-edit' : 'terminal-add',
      ...(terminal ? { terminalId: terminal.id } : {}),
      name: fields.get('name'), channelType: kind,
      returnUrl: web ? fields.get('returnUrl') : '',
      channelUrl: !web && kind !== 'PAYMENT_LINK' ? fields.get('channelUrl') : '',
    })
  }

  return <form className={s.stack} onSubmit={submit}>
    <div className={s.grid}>
      <Field label="نام پایانه"><input name="name" defaultValue={terminal?.name} maxLength={100} required /></Field>
      <Field label="نوع پایانه"><select value={kind} disabled={fixedKind} onChange={event => setKind(event.target.value as PayChannelType)}>
        {Object.entries(PAY_CHANNEL_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></Field>
      {web && <Field label={kind === 'BOT' ? 'نشانی ثبت‌شدهٔ ربات' : 'نشانی بازگشت وب‌سایت'}><input name="returnUrl" type="url" dir="ltr" defaultValue={terminal?.returnUrl} required /></Field>}
      {!web && kind !== 'PAYMENT_LINK' && <Field label="نشانی کانال"><input name="channelUrl" type="url" dir="ltr" defaultValue={terminal?.channelUrl} required /></Field>}
    </div>
    <div className={s.actions}><button type="submit" className={s.button} disabled={disabled}>{terminal ? 'ذخیرهٔ پایانه' : 'افزودن پایانه'}</button></div>
  </form>
}

export default function MerchantTerminals({ terminals, autoAllowed, disabled, action }: {
  terminals: Terminal[]; autoAllowed: boolean; disabled: boolean; action: MerchantAdminAction
}) {
  return <section className={`${s.stack} ${o.controlGroup}`} aria-labelledby="pay-admin-terminals">
    <h3 id="pay-admin-terminals">پایانه‌ها و اتصال‌ها</h3>
    <details className={o.disclosure}>
      <summary>پایانهٔ جدید</summary>
      <p className={s.muted}>پایانهٔ جدید پس از ذخیره برای فعال‌سازی آماده است.</p>
      <TerminalForm disabled={disabled} save={action} />
    </details>
    {!terminals.length && <p className={s.muted}>پایانه‌ای ثبت نشده است.</p>}
    {terminals.map(terminal => <article className={o.panel} key={terminal.id}>
      <div className={s.row}><h4>{terminal.name}</h4><Badge value={terminal.active ? 'ACTIVE' : 'SUSPENDED'} /></div>
      <p className={o.sub}>{PAY_CHANNEL_LABELS[terminal.channelType]}</p>
      <div className={s.actions}>
        <button className={s.secondary} type="button" disabled={disabled} onClick={() => void action({ action: 'terminal', terminalId: terminal.id, active: !terminal.active, baleEnabled: terminal.baleEnabled && autoAllowed })}>{terminal.active ? 'توقف پایانه' : 'فعال‌سازی پایانه'}</button>
        <button className={s.secondary} type="button" disabled={disabled || !autoAllowed} onClick={() => void action({ action: 'terminal', terminalId: terminal.id, active: terminal.active, baleEnabled: !terminal.baleEnabled })}>{terminal.baleEnabled ? 'بستن روش خودکار پایانه' : 'فعال‌کردن روش خودکار پایانه'}</button>
      </div>
      <details className={o.disclosure}><summary>ویرایش پایانه</summary><TerminalForm terminal={terminal} disabled={disabled} save={action} /></details>
      {terminal.bot && <div><p>اتصال ربات {terminal.bot.active ? 'فعال است' : 'متوقف است'}</p>
        <button className={s.secondary} type="button" disabled={disabled || !terminal.bot.active} onClick={() => void action({ action: 'revoke-bot', terminalId: terminal.id, botVersion: terminal.bot!.version })}>توقف اتصال و کلید ربات</button>
      </div>}
      <details className={o.disclosure}>
        <summary>حذف از فهرست پایانه‌ها</summary>
        <p className={s.muted}>پایانه بسته می‌شود و سوابق مالی آن برای گزارش و پیگیری باقی می‌ماند.</p>
        <button className={s.secondary} type="button" disabled={disabled} onClick={() => void action({ action: 'terminal-delete', terminalId: terminal.id })}>تأیید حذف پایانه</button>
      </details>
    </article>)}
  </section>
}
