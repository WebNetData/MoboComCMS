'use client'

import type { PaySettlementQueue } from '@/modules/billing/domain/pay-settlement-center'
import { date, money } from '../../client'
import { Badge, Field } from '../../shared'
import s from '../../Pay.module.css'
import d from '../SettlementDesk.module.css'

type Settlement = PaySettlementQueue['items'][number]
type Decision = 'approve' | 'reject' | 'paid'
type Props = {
  row: Settlement
  selected: boolean
  selectionDisabled: boolean
  busy: boolean
  reason: string
  reference: string
  onSelect: (selected: boolean) => void
  onReference: (value: string) => void
  onDecide: (action: Decision) => void
}

function Approval({ number, title, userId, at }: {
  number: number; title: string; userId?: number | null; at?: string | null
}) {
  return <li data-complete={!!userId}>
    <span className={d.step} aria-hidden="true">{userId ? '✓' : number.toLocaleString('fa-IR')}</span>
    <div><strong>{title}</strong><small>{userId ? `شناسهٔ مدیر ${userId.toLocaleString('fa-IR')}` : 'هنوز تأیید نشده'}</small>
      {at && <time dateTime={at}>{date(at)}</time>}
    </div>
  </li>
}

export function SettlementCard({ row: x, selected, selectionDisabled, busy, reason, reference, onSelect, onReference, onDecide }: Props) {
  return <article className={d.item} data-selected={selected} aria-label={`درخواست تسویه ${x.id}`}>
    <header className={d.itemHead}>
      <label className={d.selection}>
        <input type="checkbox" aria-label={`انتخاب تسویه ${x.id}`} checked={selected} disabled={selectionDisabled} onChange={e => onSelect(e.target.checked)} />
        <span><strong>{x.merchantName}</strong><small>شناسهٔ درخواست: <bdi>{x.id.slice(-8)}</bdi></small></span>
      </label>
      <Badge value={x.status} />
    </header>
    <div className={d.itemBody}>
      <dl className={d.amounts}>
        <div><dt>مبلغ مبدأ</dt><dd>{x.sourceAmount ? <bdi>{x.sourceAmount} {x.sourceCurrency}</bdi> : money(x.amountRial)}</dd></div>
        <div><dt>کارمزد تسویه</dt><dd>{x.feeAmount ? <bdi>{x.feeAmount} {x.feeCurrency}</bdi> : money(x.feeRial)}</dd></div>
        <div className={d.payout}><dt>خالص انتقال</dt><dd><bdi>{x.payoutAmount} {x.asset}</bdi><span className={d.network}>{x.network}</span></dd></div>
      </dl>
      <dl className={d.context}>
        <div><dt>مقصد انتقال</dt><dd>{x.destinationLabel && <strong>{x.destinationLabel}</strong>}<bdi className={d.address}>{x.destination}</bdi></dd></div>
        <div><dt>موعد بررسی</dt><dd>{x.scheduledFor ? <time dateTime={x.scheduledFor}>{date(x.scheduledFor)}</time> : 'بدون زمان‌بندی'}</dd></div>
      </dl>
      <section className={d.review} aria-label="روند بررسی درخواست">
        <h4>{x.requiresSecondApproval ? `تأیید دو مدیر · آستانه ${money(x.approvalThresholdRial || '0')}` : 'تأیید مدیریت'}</h4>
        <ol>
          <Approval number={1} title={x.requiresSecondApproval ? 'تأیید نخست' : 'تأیید درخواست'} userId={x.approvedById} at={x.firstApprovedAt} />
          {x.requiresSecondApproval && <Approval number={2} title="تأیید مستقل مدیر دوم" userId={x.secondApprovedById} at={x.secondApprovedAt} />}
        </ol>
      </section>
    </div>
    <SettlementActions row={x} busy={busy} reason={reason} reference={reference} onReference={onReference} onDecide={onDecide} />
  </article>
}

function SettlementActions({ row: x, busy, reason, reference, onReference, onDecide }: Pick<Props, 'row' | 'busy' | 'reason' | 'reference' | 'onReference' | 'onDecide'>) {
  return <footer className={d.itemFooter}>
      <div>
        {x.status === 'REQUESTED' && <>
          <button className={s.button} type="button" disabled={busy} onClick={() => onDecide('approve')}>{x.requiresSecondApproval ? x.approvedById ? 'ثبت تأیید دوم' : 'ثبت تأیید نخست' : 'تأیید درخواست'}</button>
          <button className={s.secondary} type="button" disabled={busy || !reason.trim()} title={!reason.trim() ? 'دلیل رد را در کادر بالای فهرست وارد کنید' : undefined} onClick={() => onDecide('reject')}>رد با دلیل</button>
        </>}
        {x.status === 'APPROVED' && <>
          <p className={s.muted}>پس از واریز دستی مبلغ خالص به مقصد، مرجع همان انتقال را ثبت کنید.</p>
          <div className={d.reference}><Field label={x.asset === 'IRR' ? 'شماره پیگیری بانکی' : 'هش انتقال'}><input dir="ltr" value={reference} onChange={e => onReference(e.target.value)} /></Field></div>
          <button className={s.button} type="button" disabled={busy || !reference.trim()} onClick={() => onDecide('paid')}>ثبت واریز دستی انجام‌شده</button>
        </>}
      </div>
      <a className={s.secondary} href={`/api/admin/mobocom-pay/settlement-receipt?${new URLSearchParams({ id: x.id, format: 'html' })}`} target="_blank" rel="noreferrer">{x.status === 'PAID' ? 'دریافت رسید تسویه' : 'دریافت گزارش درخواست'}</a>
    </footer>
}
