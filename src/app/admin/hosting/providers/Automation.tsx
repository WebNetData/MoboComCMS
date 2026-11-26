'use client'
import type { CloudAutomation } from '@/modules/hosting/domain/automation'
export default function Automation({
  driver,
  value,
  onChange,
}: {
  driver: string
  value: CloudAutomation
  onChange: (v: CloudAutomation) => void
}) {
  const set = (key: keyof CloudAutomation, val: string | boolean) =>
    onChange({ ...value, [key]: ['templateVmid', 'vmidBase'].includes(key) ? Number(val) : val })
  return (
    <section className="sa-card" aria-label="عملیات خودکار">
      <header className="sa-card-head">
        <h2>تحویل و عملیات خودکار</h2>
        <span className="sa-state">{value.autoOperations ? 'فعال' : 'خاموش'}</span>
      </header>
      <label className="sa-check">
        <input
          type="checkbox"
          checked={value.autoOperations}
          onChange={(e) => set('autoOperations', e.target.checked)}
        />
        اجرای عملیات واقعی این اتصال از صف موبوکام
      </label>
      <p className="sa-hint">
        روشن کردن این گزینه اجازهٔ ساخت سرویس یا ثبت و تمدید دامنه پس از پرداخت را می‌دهد. ابتدا حساب، سطح دسترسی و
        تنظیمات را بررسی کنید. نتیجهٔ نامشخص بدون تکرار عملیات در مرکز عملیات نگه داشته می‌شود.
      </p>
      {driver === 'CPANEL' && (
        <p className="sa-hint">
          ساخت حساب هاست با بستهٔ تعیین‌شده در محصول؛ ساخت نمایندگی جدید خودکار نیست. نام کاربری و رمز پیش از درخواست
          رمزگذاری و ثابت می‌شوند.
        </p>
      )}
      {driver === 'HETZNER_CLOUD' && (
        <div className="hx-row">
          {[
            ['image', 'تصویر Linux با Cloud-init', 'ubuntu-24.04'],
            ['location', 'مکان دیتاسنتر', 'fsn1'],
          ].map(([key, label, placeholder]) => (
            <label key={key} className="sa-field">
              <span>{label}</span>
              <input
                className="input"
                dir="ltr"
                value={String(value[key as keyof CloudAutomation] || '')}
                placeholder={placeholder}
                onChange={(e) => set(key as keyof CloudAutomation, e.target.value)}
              />
            </label>
          ))}
        </div>
      )}
      {driver === 'PROXMOX' && (
        <>
          <p className="sa-hint">
            قالب QEMU باید Cloud-init، شبکهٔ DHCP و دسترسی کاربر انتخاب‌شده داشته باشد. شناسهٔ هر ماشین از ابتدای بازه +
            شمارهٔ سرویس ساخته می‌شود؛ این بازه را برای موبوکام رزرو کنید.
          </p>
          <div className="hx-row">
            {[
              ['node', 'نام گره'],
              ['templateVmid', 'شناسهٔ قالب Cloud-init'],
              ['vmidBase', 'ابتدای بازهٔ اختصاصی VM'],
              ['cloudUser', 'کاربر سیستم‌عامل'],
            ].map(([key, label]) => (
              <label className="sa-field" key={key}>
                <span>{label}</span>
                <input
                  className="input"
                  dir="ltr"
                  value={String(value[key as keyof CloudAutomation] || '')}
                  onChange={(e) => set(key as keyof CloudAutomation, e.target.value)}
                />
              </label>
            ))}
          </div>
        </>
      )}
      {driver === 'JOKER' && (
        <>
          <p className="sa-hint">
            ثبت پایهٔ com، net، org، info و biz. مشتری باید شناسهٔ تماس متعلق به خودش را وارد کند. سقف هزینه برای هر
            سفارش در ارز حساب ثبت‌کننده است؛ سرویس حریم خصوصی پولی و تمدید خود Joker خاموش می‌مانند.
          </p>
          <div className="hx-row">
            <label className="sa-field">
              <span>سقف هزینهٔ هر سفارش</span>
              <input
                className="input"
                dir="ltr"
                inputMode="decimal"
                value={value.jokerMaxPrice || ''}
                onChange={(e) => set('jokerMaxPrice', e.target.value)}
              />
            </label>
            <label className="sa-field">
              <span>ارز حساب Joker</span>
              <select
                className="input"
                value={value.jokerCurrency || 'USD'}
                onChange={(e) => set('jokerCurrency', e.target.value)}
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </label>
          </div>
          <label className="sa-field">
            <span>نیم‌سرورها، هر خط یک میزبان</span>
            <textarea
              className="input"
              dir="ltr"
              rows={3}
              value={(value.nameservers || []).join('\n')}
              onChange={(e) => onChange({ ...value, nameservers: e.target.value.split('\n') })}
            />
          </label>
        </>
      )}
    </section>
  )
}
