'use client'
import Link from '@/components/AppLink'
import { useCallback, useEffect, useState } from 'react'

type CollectionUse = 'GENERAL' | 'MOBOCOM_PAY'
type Account = { id: number; bankName: string; holderName: string; cardNumber: string; sheba: string; accountNumber: string; note: string; active: boolean; sortOrder: number; approvedCount: number; approvedMinor: string; collectionUse?: CollectionUse }
const EMPTY = { id: 0, bankName: '', holderName: '', cardNumber: '', sheba: '', accountNumber: '', note: '', active: true, sortOrder: 0, collectionUse: 'GENERAL' as CollectionUse, dedicatedConfirmed: false }
const card = (value: string) => value.replace(/(\d{4})(?=\d)/g, '$1 ')

/** Bank accounts customers pay into with card-to-card / bank transfer. */
export default function BankAccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)

  const load = useCallback(async () => {
    const response = await fetch('/api/admin/bank-accounts', { cache: 'no-store' })
    const data = await response.json().catch(() => null)
    if (response.ok) setAccounts(data.accounts)
    else setMessage({ text: data?.error || 'دریافت اطلاعات ناموفق بود', error: true })
  }, [])
  useEffect(() => { void load() }, [load])

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true); setMessage(null)
    const { collectionUse, dedicatedConfirmed, ...fields } = form
    const payload = form.id ? fields : { ...fields, collectionUse, ...(collectionUse === 'MOBOCOM_PAY' && dedicatedConfirmed ? { dedicatedConfirmed: true } : {}) }
    const response = await fetch('/api/admin/bank-accounts', { method: form.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setMessage({ text: data?.error || 'ذخیره نشد', error: true }); return }
    setMessage({ text: form.id ? 'حساب به‌روز شد' : 'حساب اضافه شد', error: false })
    setForm(EMPTY)
    void load()
  }

  async function remove(account: Account) {
    if (!window.confirm(`حساب بانک ${account.bankName} (${account.holderName}) حذف شود؟`)) return
    const response = await fetch(`/api/admin/bank-accounts?id=${account.id}`, { method: 'DELETE' })
    const data = await response.json().catch(() => null)
    setMessage(response.ok ? { text: data.deactivated ? 'این حساب رسید ثبت‌شده دارد؛ برای حفظ سوابق فقط غیرفعال شد.' : 'حساب حذف شد', error: false } : { text: data?.error || 'حذف نشد', error: true })
    void load()
  }

  return <div className="xm-page" dir="rtl">
    <header className="tb-hero"><div><span className="tb-eyebrow">حساب‌های بانکی</span><h1>حساب‌های بانکی (کارت به کارت)</h1><p>مشتری روی فاکتور یکی از این حساب‌ها را می‌بیند، مبلغ را واریز می‌کند و رسید را بارگذاری می‌کند. رسیدها در <Link href="/admin/receipts">رسیدهای پرداخت</Link> تأیید می‌شوند. درگاه «کارت به کارت / انتقال بانکی» باید در <Link href="/admin/gateways">درگاه‌ها</Link> فعال باشد.</p></div></header>
    {message && <div className={`xm-notice${message.error ? ' is-error' : ''}`} role="status">{message.text}</div>}
    <form className="card seo-form" onSubmit={save}>
      {form.id ? <div className="studio-field seo-wide"><span>کاربرد حساب</span><strong>{form.collectionUse === 'MOBOCOM_PAY' ? 'اختصاصی درگاه موبوکام' : 'عمومی برای روش‌های دستی'}</strong><small className="muted">کاربرد حساب پس از ساخت قابل تغییر نیست.</small></div> : <label className="studio-field seo-wide"><span>کاربرد حساب</span><select className="input" value={form.collectionUse} onChange={(e) => setForm({ ...form, collectionUse: e.target.value as CollectionUse, dedicatedConfirmed: false })}><option value="GENERAL">عمومی برای روش‌های دستی</option><option value="MOBOCOM_PAY">اختصاصی درگاه موبوکام</option></select></label>}
      {form.collectionUse === 'MOBOCOM_PAY' && <p className="muted seo-wide">این حساب در روش‌های پرداخت دستی به مشتری نمایش داده نمی‌شود.</p>}
      {!form.id && form.collectionUse === 'MOBOCOM_PAY' && <label className="studio-switch seo-wide"><input type="checkbox" required checked={form.dedicatedConfirmed} onChange={(e) => setForm({ ...form, dedicatedConfirmed: e.target.checked })} />این حساب بانکی فقط برای درگاه موبوکام استفاده می‌شود و در روش‌های دستی در اختیار مشتری نیست.</label>}
      <label className="studio-field"><span>شماره کارت</span><input className="input" dir="ltr" inputMode="numeric" value={form.cardNumber} onChange={(e) => setForm({ ...form, cardNumber: e.target.value })} placeholder="6037 9900 0000 0000" /></label>
      <label className="studio-field"><span>شماره شبا</span><input className="input" dir="ltr" value={form.sheba} onChange={(e) => setForm({ ...form, sheba: e.target.value })} placeholder="IR00 0000 0000 0000 0000 0000 00" /></label>
      <label className="studio-field"><span>نام صاحب حساب</span><input className="input" value={form.holderName} onChange={(e) => setForm({ ...form, holderName: e.target.value })} required minLength={3} /></label>
      <label className="studio-field"><span>نام بانک (خالی = تشخیص خودکار از کارت/شبا)</span><input className="input" value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} placeholder="ملت" /></label>
      <label className="studio-field"><span>شماره حساب {form.collectionUse === 'MOBOCOM_PAY' ? '(۱۳ رقم)' : '(اختیاری)'}</span><input className="input" dir="ltr" inputMode="numeric" required={!form.id && form.collectionUse === 'MOBOCOM_PAY'} pattern={!form.id && form.collectionUse === 'MOBOCOM_PAY' ? '[0-9]{13}' : undefined} value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} />{form.collectionUse === 'MOBOCOM_PAY' && <small className="muted">شماره حساب اختصاصی را با ۱۳ رقم لاتین وارد کنید.</small>}</label>
      <label className="studio-field"><span>ترتیب نمایش</span><input className="input" type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} /></label>
      <label className="studio-field seo-wide"><span>توضیح برای مشتری (اختیاری)</span><input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} maxLength={300} placeholder="مثلاً: واریز پایا حداکثر تا پایان روز کاری بعد تأیید می‌شود" /></label>
      <label className="studio-switch seo-wide"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />فعال (روی فاکتورها نمایش داده شود)</label>
      <div className="seo-actions seo-wide"><button type="submit" className="btn btn-primary" disabled={busy}>{form.id ? 'ذخیرهٔ تغییرات' : 'افزودن حساب'}</button>{form.id > 0 && <button type="button" className="btn btn-ghost" onClick={() => setForm(EMPTY)}>انصراف</button>}</div>
    </form>
    <div className="table-wrap card"><table className="table"><thead><tr><th>بانک</th><th>صاحب حساب</th><th>کارت / شبا</th><th>رسید تأییدشده</th><th>وضعیت</th><th /></tr></thead><tbody>
      {accounts.map((account) => <tr key={account.id}>
        <td><b>{account.bankName}</b>{account.collectionUse === 'MOBOCOM_PAY' && <><br /><small className="muted">اختصاصی درگاه موبوکام · خارج از روش‌های دستی</small></>}</td>
        <td>{account.holderName}</td>
        <td dir="ltr" className="num">{account.cardNumber ? card(account.cardNumber) : ''}{account.sheba && <><br /><small className="muted">{account.sheba}</small></>}</td>
        <td className="num">{account.approvedCount.toLocaleString('fa-IR')}</td>
        <td>{account.active ? <span className="badge badge-green">فعال</span> : <span className="badge">غیرفعال</span>}</td>
        <td className="fr-admin-row-actions"><button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm({ id: account.id, bankName: account.bankName, holderName: account.holderName, cardNumber: account.cardNumber, sheba: account.sheba, accountNumber: account.accountNumber, note: account.note, active: account.active, sortOrder: account.sortOrder, collectionUse: account.collectionUse ?? 'GENERAL', dedicatedConfirmed: false })}>ویرایش</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => void remove(account)}>حذف</button></td>
      </tr>)}
      {!accounts.length && <tr><td colSpan={6} className="muted">هنوز حسابی ثبت نشده است؛ تا وقتی حساب فعالی نباشد، کارت به کارت در صفحهٔ پرداخت نمایش داده نمی‌شود.</td></tr>}
    </tbody></table></div>
  </div>
}
