'use client'

export type GiftChoice = { enabled: boolean; recipient: string; message: string; wrap: boolean }

export default function GiftOptions({ value, onChange, wrapEnabled, disabled }: {
  value: GiftChoice; onChange: (value: GiftChoice) => void; wrapEnabled: boolean; disabled: boolean
}) {
  return <section className="sh-panel" aria-labelledby="sh-gift-title">
    <h2 id="sh-gift-title">هدیه برای عزیزان شما</h2>
    <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <legend className="sr-only">گزینه‌های سفارش هدیه</legend>
      <label className="sh-check"><input type="checkbox" checked={value.enabled} onChange={event => onChange({ ...value, enabled: event.target.checked })} />این سفارش هدیه است</label>
      {value.enabled && <>
        <p className="sh-muted">آدرس تحویل را از دفترچهٔ آدرس انتخاب کنید. رسید هدیه قیمت ندارد؛ فاکتور مالی در حساب شما می‌ماند.</p>
        <label className="sh-field"><span>نام گیرندهٔ هدیه</span><input className="sh-input" autoComplete="off" maxLength={120} required value={value.recipient} onChange={event => onChange({ ...value, recipient: event.target.value })} /></label>
        <label className="sh-field"><span>پیام همراه هدیه (اختیاری)</span><textarea className="sh-input" rows={3} maxLength={500} value={value.message} onChange={event => onChange({ ...value, message: event.target.value })} /></label>
        {wrapEnabled && <label className="sh-check"><input type="checkbox" checked={value.wrap} onChange={event => onChange({ ...value, wrap: event.target.checked })} />بسته‌بندی هدیهٔ رایگان</label>}
      </>}
    </fieldset>
  </section>
}
