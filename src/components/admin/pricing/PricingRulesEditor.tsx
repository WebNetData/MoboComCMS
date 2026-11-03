'use client'

import { useId } from 'react'
import Icon from '@/components/site/Icon'
import { adjustedPrice, normalizeAdjustment, PRICE_MODES, PRICE_MODE_LABEL, type PriceMode } from '@/modules/account/domain/price-adjustments'
import { toMinor } from '@/shared/money'
import { formatPrice } from '@/modules/paywall/domain/paywall'
import s from './PricingRules.module.css'

export type PricingFormRule = { audience: string; mode: PriceMode; value: string; clientId?: string }
type Group = { id: number; name: string; active?: boolean }

/** One visual language and pure calculation for both Store and paid content. */
export default function PricingRulesEditor({ rules, onChange, groups, price, currency, allowFree = true }: { rules: PricingFormRule[]; onChange: (rules: PricingFormRule[]) => void; groups: Group[]; price: string; currency: string; allowFree?: boolean }) {
  const id = useId()
  const audiences = [{ key: 'vip', label: 'اعضای ویژه (VIP)' }, ...groups.map(group => ({ key: `group:${group.id}`, label: group.name + (group.active === false ? ' (غیرفعال)' : '') }))]
  const nextAudience = audiences.find(option => !rules.some(row => row.audience === option.key))
  const change = (index: number, patch: Partial<PricingFormRule>) => onChange(rules.map((row, i) => i === index ? { ...row, clientId: row.clientId || row.audience, ...patch } : row))
  function preview(row: PricingFormRule) {
    try { const regular = toMinor(price || '0', currency); if (regular <= 0n) return 'ابتدا قیمت عادی را وارد کنید'; const result = adjustedPrice(regular, normalizeAdjustment(row, currency)); return result === 0n ? 'دریافت رایگان' : formatPrice(result, currency) } catch { return 'مقدار را تکمیل کنید' }
  }
  return <section className={s.editor} aria-labelledby={`${id}-title`}>
    <header className={s.head}><div><span className={s.eyebrow}><Icon name="users" size={16} />قیمت متناسب با حساب کاربر</span><h3 id={`${id}-title`}>قیمت‌های اختصاصی</h3><p>برای هر مخاطب یک قانون تعیین کنید؛ کمترین قیمت معتبر اعمال می‌شود و تخفیف‌ها جمع نمی‌شوند.</p></div><button type="button" className="btn btn-ghost" disabled={!nextAudience} onClick={() => nextAudience && onChange([...rules, { audience: nextAudience.key, mode: 'PERCENT', value: '', clientId: crypto.randomUUID() }])}><Icon name="plus" size={16} />افزودن قانون</button></header>
    {!rules.length && <div className={s.empty}><Icon name="tag" size={24} /><div><b>هنوز قیمت اختصاصی تعیین نشده</b><p>برای VIP یا گروه دلخواه، تخفیف یا دسترسی رایگان تعریف کنید.</p></div></div>}
    <div className={s.rows}>{rules.map((row, index) => <div className={s.row} key={row.clientId || row.audience} role="group" aria-label={`قانون قیمت ${index + 1}`}>
      <label><span>مخاطب</span><select className="select" value={row.audience} onChange={event => change(index, { audience: event.target.value })}>{!audiences.some(option => option.key === row.audience) && <option value={row.audience}>گروه حذف‌شده</option>}{audiences.map(option => <option key={option.key} value={option.key} disabled={rules.some((other, i) => i !== index && other.audience === option.key)}>{option.label}</option>)}</select></label>
      <label><span>روش محاسبه</span><select className="select" value={row.mode} onChange={event => change(index, { mode: event.target.value as PriceMode, value: '' })}>{PRICE_MODES.map(mode => <option key={mode} value={mode} disabled={mode === 'FREE' && !allowFree}>{PRICE_MODE_LABEL[mode]}</option>)}</select></label>
      {row.mode !== 'FREE' ? <label><span>{row.mode === 'PERCENT' ? 'درصد تخفیف' : row.mode === 'AMOUNT' ? 'مبلغ تخفیف' : 'قیمت نهایی'}</span><input className="input" inputMode="decimal" dir="ltr" value={row.value} onChange={event => change(index, { value: event.target.value })} maxLength={18} placeholder={row.mode === 'PERCENT' ? '20' : '50000'} /><small>{row.mode === 'PERCENT' ? 'تا ۱۰۰٪، با دو رقم اعشار' : currency === 'IRT' ? 'تومان' : currency === 'IRR' ? 'ریال' : 'دلار'}</small></label> : <div className={s.free}><Icon name="check" size={18} /><span>بدون نیاز به پرداخت</span><small>تا زمان اعتبار عضویت</small></div>}
      <output className={s.preview} aria-label={`قیمت محاسبه‌شده قانون ${index + 1}`}><small>قیمت این مخاطب</small><strong>{preview(row)}</strong></output>
      <button type="button" className={`btn btn-ghost ${s.remove}`} aria-label={`حذف قانون ${audiences.find(option => option.key === row.audience)?.label || index + 1}`} onClick={() => onChange(rules.filter((_, i) => i !== index))}><Icon name="x" size={17} /></button>
    </div>)}</div>
    <p className={s.foot}><Icon name="info" size={15} />قیمت پایه برای کاربران عادی حفظ می‌شود. محدودکردن نمایش محتوا، تنظیمی جدا از قیمت است.</p>
  </section>
}
