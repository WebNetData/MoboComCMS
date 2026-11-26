'use client'

import { formatCard } from '@/modules/billing/domain/card-transfer'
import { money } from '../client'
import styles from './TransferCard.module.css'

function CopyValue({ label, value, onCopy, caption = 'کپی' }: { label: string; value: string; onCopy: (label: string, value: string) => void; caption?: string }) {
  return <button className={styles.copy} type="button" onClick={() => onCopy(label, value)} aria-label={`کپی ${label}`}>
    <span className={styles.copyIcon} aria-hidden="true" /> {caption}
  </button>
}

export function TransferAmount({ value, onCopy }: { value: string; onCopy?: (label: string, value: string) => void }) {
  const rial = BigInt(value)
  const toman = (rial / 10n).toLocaleString('fa-IR') + (rial % 10n ? '٫' + (rial % 10n).toLocaleString('fa-IR') : '')
  return <div className={styles.amount}>
    <div><span>مبلغ دقیق واریز</span><strong>{money(value)}</strong><small>{toman} تومان</small></div>
    {onCopy && <CopyValue label="مبلغ ریالی" value={value} onCopy={onCopy} caption="کپی ریال" />}
  </div>
}

type BankDestination = { bankName: string; holderName: string; cardNumber: string; accountNumber?: string; iban: string }

export default function DestinationCard({ bank, onCopy }: { bank: BankDestination; onCopy: (label: string, value: string) => void }) {
  const label = bank.cardNumber ? 'شماره کارت مقصد' : bank.accountNumber ? 'شماره حساب مقصد' : 'شبای مقصد'
  return <section className={styles.card} aria-label="اطلاعات کارت و حساب مقصد">
    <header className={styles.cardHead}><strong>{bank.bankName || (bank.cardNumber ? 'کارت مقصد' : 'حساب مقصد')}</strong><span className={styles.chip} aria-hidden="true" /></header>
    <div className={styles.numberRow}>
      <div><span className={styles.cardLabel}>{label}</span>
        <bdi dir="ltr" className={styles.number}>{bank.cardNumber ? formatCard(bank.cardNumber) : bank.accountNumber || bank.iban}</bdi>
      </div>
      {bank.cardNumber && <CopyValue label="شماره کارت" value={bank.cardNumber} onCopy={onCopy} />}
    </div>
    {bank.holderName && <div className={styles.holder}><span className={styles.cardLabel}>{bank.cardNumber ? 'صاحب کارت مقصد' : 'صاحب حساب مقصد'}</span><strong><bdi>{bank.holderName}</bdi></strong></div>}
  </section>
}
