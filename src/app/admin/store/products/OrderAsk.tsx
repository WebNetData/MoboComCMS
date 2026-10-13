'use client'

import { MAX_ORDER_FIELDS, ORDER_FIELD_KINDS, type OrderField, type OrderFieldKind } from '@/modules/store/domain/order-inputs'

type Form = Record<string, any>

const KIND_LABEL: Record<OrderFieldKind, string> = { text: 'متن کوتاه', textarea: 'توضیح چندخطی', secret: 'رمز / اطلاعات محرمانه', url: 'نشانی سایت', email: 'ایمیل' }
const OPEN_CURRENCIES = ['USD', 'EUR', 'GBP', 'AED', 'TRY', 'CAD'] as const
const blank = (index: number): OrderField => ({ key: `field${index + 1}`, label: '', labelEn: '', kind: 'text', required: true, help: '', options: [] })

/**
 * What a product needs from its buyer to be carried out (a login, a note, the address of a site), and the
 * "buyer types the foreign amount" switch of a pay-a-foreign-site service. Saved with the product.
 */
export default function OrderAsk({ form, update }: { form: Form; update: (key: string, value: unknown) => void }) {
  const fields: OrderField[] = Array.isArray(form.orderFields) ? form.orderFields : []
  const options: string[] = (Array.isArray(form.variants) ? form.variants : []).map((variant: Form) => String(variant.name || '').trim()).filter(Boolean)
  const set = (index: number, patch: Partial<OrderField>) => update('orderFields', fields.map((field, at) => (at === index ? { ...field, ...patch } : field)))
  const chosen = String(form.openCurrencies || '').split(',').map((code) => code.trim()).filter(Boolean)
  const toggleCurrency = (code: string) => update('openCurrencies', (chosen.includes(code) ? chosen.filter((item) => item !== code) : [...chosen, code]).join(','))
  const fx = form.pricingMode === 'FX'

  return <section id="sa-ask" className="sa-card">
    <header className="sa-card-head"><h2>اطلاعات لازم از خریدار</h2><span className="sa-tag">{fields.length ? `${fields.length.toLocaleString('fa-IR')} فیلد` : 'چیزی پرسیده نمی‌شود'}</span></header>
    <p className="sa-hint">اگر انجام این سفارش به اطلاعاتی از خریدار نیاز دارد (نام کاربری و رمز یک حساب، نشانی یک سایت، توضیحات)، اینجا تعریف کنید. خریدار آن را در صفحهٔ محصول وارد می‌کند؛ رمزنگاری‌شده با سفارش ذخیره می‌شود، فقط کارمندِ دارای دسترسی سفارش‌ها آن را می‌بیند و یک هفته پس از پایان سفارش پاک می‌شود.</p>
    <div className="oa-list">
      {fields.map((field, index) => <div key={index} className="oa-field">
        <div className="sa-grid">
          <label className="sa-field"><span>عنوان فیلد *</span><input className="input" maxLength={80} value={field.label} placeholder="مثلاً: ایمیل حساب ChatGPT" onChange={(event) => set(index, { label: event.target.value })} /></label>
          <label className="sa-field"><span>کلید (لاتین، یکتا)</span><input className="input" dir="ltr" maxLength={40} value={field.key} onChange={(event) => set(index, { key: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} /></label>
          <label className="sa-field"><span>نوع</span><select className="select" value={field.kind} onChange={(event) => set(index, { kind: event.target.value as OrderFieldKind })}>{ORDER_FIELD_KINDS.map((kind) => <option key={kind} value={kind}>{KIND_LABEL[kind]}</option>)}</select></label>
          <label className="sa-field"><span>راهنما زیر فیلد</span><input className="input" maxLength={200} value={field.help} onChange={(event) => set(index, { help: event.target.value })} /></label>
        </div>
        {options.length > 0 && <div className="oa-options" role="group" aria-label="برای کدام گزینه‌ها پرسیده شود">
          <span>برای کدام گزینه پرسیده شود؟</span>
          <label className="sa-check"><input type="checkbox" checked={!field.options.length} onChange={() => set(index, { options: [] })} />همهٔ گزینه‌ها</label>
          {options.map((name) => <label key={name} className="sa-check"><input type="checkbox" checked={field.options.includes(name)} onChange={(event) => set(index, { options: event.target.checked ? [...field.options, name] : field.options.filter((item) => item !== name) })} />{name}</label>)}
        </div>}
        <div className="oa-foot">
          <label className="sa-check"><input type="checkbox" checked={field.required} onChange={(event) => set(index, { required: event.target.checked })} />پر کردنش اجباری است</label>
          <button type="button" className="sa-link is-danger" onClick={() => update('orderFields', fields.filter((_, at) => at !== index))}>حذف فیلد</button>
        </div>
      </div>)}
    </div>
    <button type="button" className="btn btn-ghost" disabled={fields.length >= MAX_ORDER_FIELDS} onClick={() => update('orderFields', [...fields, blank(fields.length)])}>+ افزودن فیلد</button>

    <div className="oa-open">
      <label className="sa-check"><input type="checkbox" checked={!!form.openAmount} disabled={!fx} onChange={(event) => update('openAmount', event.target.checked)} /><b>خریدار مبلغ ارزی را خودش وارد می‌کند (پرداخت سایت خارجی)</b></label>
      {!fx && <p className="sa-hint">برای این حالت، روش قیمت‌گذاری را در بخش «قیمت و تخفیف» روی «قیمت ارزی (نرخ روز)» بگذارید؛ درصد سود و سود ثابتِ همان‌جا روی مبلغ خریدار اعمال می‌شود.</p>}
      {fx && !!form.openAmount && <>
        <p className="sa-hint">هزینهٔ سفارش = مبلغ خریدار × نرخ روز + درصد سود + سود ثابت (همان مقادیر بخش «قیمت و تخفیف»). «قیمت ارزی» محصول فقط قیمتِ نمونه‌ای است که روی کارت محصول نشان داده می‌شود. این محصول تنوع ندارد و در هر سفارش یک بار ثبت می‌شود.</p>
        <div className="oa-options" role="group" aria-label="ارزهای مجاز"><span>ارزهای مجاز</span>{OPEN_CURRENCIES.map((code) => <label key={code} className="sa-check"><input type="checkbox" checked={chosen.includes(code)} onChange={() => toggleCurrency(code)} />{code}</label>)}</div>
        <div className="sa-grid">
          <label className="sa-field"><span>حداقل مبلغ (۰ = بدون حد)</span><input className="input" dir="ltr" inputMode="decimal" value={form.openMin ?? ''} onChange={(event) => update('openMin', event.target.value)} placeholder="5" /></label>
          <label className="sa-field"><span>حداکثر مبلغ (۰ = بدون حد)</span><input className="input" dir="ltr" inputMode="decimal" value={form.openMax ?? ''} onChange={(event) => update('openMax', event.target.value)} placeholder="2000" /></label>
        </div>
      </>}
    </div>
  </section>
}
