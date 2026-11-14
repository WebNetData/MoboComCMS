import { STORE_PROMISE_ICONS, type StorePromise } from '@/modules/store/domain/store'

const icons: Record<StorePromise['icon'], string> = { truck: 'ارسال', card: 'پرداخت', return: 'مرجوعی', shield: 'ضمانت', headset: 'پشتیبانی', bolt: 'تحویل آنلاین', check: 'عمومی' }
export default function ServicePromises({ items, busy, onChange }: { items: StorePromise[]; busy: boolean; onChange: (items: StorePromise[]) => void }) {
  const patch = (index: number, value: Partial<StorePromise>) => onChange(items.map((item, i) => i === index ? { ...item, ...value } : item))
  return <section className="sa-card">
    <header className="sa-card-head"><h2>خدمات و تعهدات فروشگاه</h2><button type="button" className="btn btn-ghost" disabled={busy || items.length >= 6} onClick={() => onChange([...items, { icon: 'check', title: '', text: '' }])}>+ مورد</button></header>
    <p className="sa-hint">همین متن‌ها در نوار خدمات و کنار خرید کالا نمایش داده می‌شوند. زمان ارسال، ضمانت و ساعات پاسخ‌گویی را مطابق شرایط واقعی خود بنویسید. حذف همهٔ موارد، این بخش را پنهان می‌کند.</p>
    <fieldset disabled={busy} className="gateway-controls"><legend className="sr-only">متن خدمات فروشگاه</legend>{items.map((item, index) => <div className="sa-repeat" key={index}>
      <div className="sa-grid"><label className="sa-field"><span>نماد مورد {index + 1}</span><select className="select" value={item.icon} onChange={event => patch(index, { icon: event.target.value as StorePromise['icon'] })}>{STORE_PROMISE_ICONS.map(icon => <option key={icon} value={icon}>{icons[icon]}</option>)}</select></label><label className="sa-field"><span>عنوان مورد {index + 1}</span><input className="input" value={item.title} maxLength={60} onChange={event => patch(index, { title: event.target.value })} /></label><label className="sa-field"><span>توضیح مورد {index + 1}</span><input className="input" value={item.text} maxLength={160} onChange={event => patch(index, { text: event.target.value })} /></label></div>
      <div className="sa-row-actions"><button type="button" className="sa-link" disabled={index === 0} onClick={() => { const next = [...items]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; onChange(next) }}>بالا</button><button type="button" className="sa-link is-danger" onClick={() => onChange(items.filter((_, i) => i !== index))}>حذف مورد {index + 1}</button></div>
    </div>)}</fieldset>
  </section>
}
