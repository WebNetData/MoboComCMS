'use client'

import { useState, type FormEvent } from 'react'
import { statementHeader, statementMaxBytes, type StatementPreview } from '@/modules/billing/domain/pay-statement'
import { api, json } from '../client'
import { Field, ErrorNotice } from '../shared'
import s from '../Pay.module.css'
import styles from './Receipts.module.css'

type Account = { id: number; label: string }

export default function StatementImport({ result, onResult }: {
  result: StatementPreview | null
  onResult: (value: StatementPreview | null) => void
}) {
  const [accounts, setAccounts] = useState<Account[] | null>(null)
  const [bank, setBank] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function loadAccounts() {
    setError('')
    try { setAccounts((await api<{ accounts: Account[] }>('/api/admin/mobocom-pay/statement-preview')).accounts) }
    catch (error) { setError(error instanceof Error ? error.message : 'حساب‌های مقصد دریافت نشدند') }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    onResult(null)
    const file = new FormData(event.currentTarget).get('file')
    if (!(file instanceof File) || !file.size || file.size > statementMaxBytes) {
      setError('فایل CSV تا ۳۲ کیلوبایت را انتخاب کنید')
      return
    }
    setBusy(true)
    try {
      const csv = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
      onResult(await api<StatementPreview>('/api/admin/mobocom-pay/statement-preview', json('POST', { bankAccountId: Number(bank), csv })))
    } catch (error) { setError(error instanceof Error ? error.message : 'پیش‌نمایش گردش حساب انجام نشد') }
    finally { setBusy(false) }
  }

  const count = (value: number) => value.toLocaleString('fa-IR')
  const template = 'data:text/csv;charset=utf-8,' + encodeURIComponent(statementHeader + '\nSAMPLE12345,1850030,2026-11-28T11:45:00+03:30\n')
  return <section className={`${s.card} ${s.stack} ${styles.statement}`} aria-labelledby="pay-statement-heading">
    <div className={s.sectionHead}>
      <div><h3 id="pay-statement-heading">تطبیق با گردش حساب بانک</h3><p className={s.muted}>فایل واریزها فقط برای مقایسه خوانده می‌شود. تأیید وصول در کارت رسید انجام می‌شود.</p></div>
      <a className={s.secondary} href={template} download="mobocom-pay-statement.csv">دانلود قالب نمونه</a>
    </div>
    <ErrorNotice error={error} />
    {!accounts ? <div><button type="button" className={s.secondary} onClick={() => void loadAccounts()}>انتخاب حساب و فایل</button></div>
      : accounts.length === 0 ? <p className={s.muted}>هنوز حساب مقصد دارای رسید موبوکام‌پی وجود ندارد.</p>
      : <form className={s.stack} onSubmit={submit} aria-busy={busy}>
        <div className={s.grid}>
          <Field label="حساب مقصد واریز"><select required disabled={busy} value={bank} onChange={event => { setBank(event.target.value); onResult(null) }}>
            <option value="">انتخاب حساب</option>
            {accounts.map(account => <option key={account.id} value={account.id}>{account.label}</option>)}
          </select></Field>
          <Field label="فایل CSV واریزها"><input type="file" name="file" accept=".csv,text/csv" disabled={busy} required onChange={() => onResult(null)} /></Field>
        </div>
        <p className={s.muted}>فقط واریزهای یک حساب، به ریال و با منطقهٔ زمانی در ستون تاریخ. حداکثر ۲۵۰ ردیف و ۳۲ کیلوبایت.</p>
        <div><button type="submit" className={s.button} disabled={!bank || busy}>{busy ? 'در حال تطبیق…' : 'پیش‌نمایش تطبیق'}</button></div>
      </form>}
    {result && <div className={styles.summary} role="status" aria-label="خلاصهٔ تطبیق">
      <div><span>پیشنهاد یکتا</span><strong>{count(result.suggestions.length)}</strong></div>
      <div><span>مبهم یا چندتطبیقی</span><strong>{count(result.ambiguous)}</strong></div>
      <div><span>بدون تطبیق</span><strong>{count(result.unmatched)}</strong></div>
      <div><span>شناسهٔ قبلاً مصرف‌شده</span><strong>{count(result.alreadyUsed)}</strong></div>
      <div><span>ردیف تکراری نادیده‌گرفته‌شده</span><strong>{count(result.duplicates)}</strong></div>
    </div>}
  </section>
}
