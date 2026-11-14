import Link from '@/components/AppLink'
import type { PublicPageLink } from '@/modules/site/server/public-pages'
import { useId } from 'react'

export default function PurchaseGuides({ ids, pages, disabled, onChange }: { ids: number[]; pages: PublicPageLink[]; disabled: boolean; onChange: (ids: number[]) => void }) {
  const labelId = useId()
  return <section className="sa-card">
    <header className="sa-card-head"><h2>راهنمای خرید کنار کالا</h2></header>
    <p className="sa-hint">صفحات منتشرشدهٔ ارسال، ضمانت، مرجوعی، حریم خصوصی یا تماس را انتخاب کنید. متن هر صفحه در «صفحات» مدیریت می‌شود؛ با پیش‌نویس یا حذف شدن آن، پیوند عمومی نمایش داده نمی‌شود.</p>
    <fieldset disabled={disabled} className="gateway-controls"><legend className="sr-only">صفحات راهنمای خرید</legend>
      {ids.map((id, index) => <div className="sa-grid" key={id}>
        <label className="sa-field"><span id={`${labelId}-${id}`}>صفحهٔ راهنمای خرید {index + 1}</span><select className="select" aria-labelledby={`${labelId}-${id}`} value={id} onChange={event => onChange(ids.map((value, i) => i === index ? Number(event.target.value) : value))}>
          {!pages.some(page => page.id === id) && <option value={id}>صفحهٔ منتشرنشده یا حذف‌شده — {id}</option>}
          {pages.map(page => <option key={page.id} value={page.id} disabled={page.id !== id && ids.includes(page.id)}>{page.title}</option>)}
        </select></label>
        <div className="sa-row-actions"><button type="button" className="sa-link" disabled={index === 0} onClick={() => { const next = [...ids]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; onChange(next) }}>بالا</button><button type="button" className="sa-link is-danger" onClick={() => onChange(ids.filter(value => value !== id))}>حذف پیوند {index + 1}</button></div>
      </div>)}
      <label className="sa-field"><span id={`${labelId}-add`}>افزودن صفحه به راهنمای خرید</span><select className="select" aria-labelledby={`${labelId}-add`} value="" disabled={ids.length >= 6} onChange={event => { if (event.target.value) onChange([...ids, Number(event.target.value)]) }}>
        <option value="">انتخاب صفحهٔ منتشرشده…</option>
        {pages.filter(page => !ids.includes(page.id)).map(page => <option key={page.id} value={page.id}>{page.title}</option>)}
      </select></label>
      {!pages.length && <p className="sa-hint">هنوز صفحه‌ای منتشر نشده است؛ ابتدا متن مورد تأیید خود را در مدیریت صفحات آماده و منتشر کنید.</p>}
      <p className="sa-hint">حداکثر ۶ پیوند؛ تغییرات با دکمهٔ «ذخیره» ثبت می‌شوند. <Link href="/admin/pages" className="sa-link">مدیریت صفحات</Link></p>
    </fieldset>
  </section>
}
