'use client';

import { inputInteger } from './types';
import Link from '@/components/AppLink';
import type { EngagementSettings } from '@/modules/automation/domain/engagement';
export default function DeliverySettings({
  value,
  change,
  dateFields,
  disabled
}: {
  value: EngagementSettings;
  change: (next: EngagementSettings) => void;
  dateFields: {
    key: string;
    label: string;
  }[];
  disabled: boolean;
}) {
  const patch = (next: Partial<EngagementSettings>) => change({
    ...value,
    ...next
  });
  return <fieldset className="ce-editor ce-delivery" disabled={disabled}><legend>تنظیمات ارسال</legend><label className="ce-check"><input type="checkbox" checked={value.enabled} onChange={e => patch({
        enabled: e.target.checked
      })} />ارسال خودکار ارتباط‌های فعال روشن باشد</label><p className="muted">تازه‌ترین انتخاب کاربر، وضعیت کالا، تاریخ و فعال‌بودن مسیر پیش از ارسال دوباره بررسی می‌شوند. ذخیره یا پیش‌نمایش، ارسال فوری نیست.</p>
 <section><h3>ساعت و تعداد ارتباط</h3><div className="ce-form-grid"><label>از ساعت تهران<input className="input" type="number" min={0} max={23} value={value.startHour} onChange={e => patch({
            startHour: inputInteger(e.currentTarget, value.startHour)
          })} /></label><label>تا ساعت تهران<input className="input" type="number" min={0} max={23} value={value.endHour} onChange={e => patch({
            endHour: inputInteger(e.currentTarget, value.endHour)
          })} /></label><label>حداکثر ارتباط تازه برای هر کاربر در روز<input className="input" type="number" min={1} max={10} value={value.dailyCap} onChange={e => patch({
            dailyCap: inputInteger(e.currentTarget, value.dailyCap)
          })} /></label><label>حداکثر ارتباط در هفت روز تقویمی<input className="input" type="number" min={1} max={30} value={value.weeklyCap} onChange={e => patch({
            weeklyCap: inputInteger(e.currentTarget, value.weeklyCap)
          })} /></label></div><p className="muted">ساعت یکسان یعنی تمام شبانه‌روز؛ بازه می‌تواند از نیمه‌شب عبور کند. سقف‌ها میان همهٔ مسیرهای بازاریابی مشترک‌اند. پیامک، ایمیل و اعلان مرورگر کپیِ همان ارتباط‌اند؛ اعلان‌های تراکنشی و پیگیری موجودی، تنظیمات خودشان را دارند.</p><label>تعداد بررسی کاربران در هر نوبت<input className="input" type="number" min={10} max={200} value={value.batchSize} onChange={e => patch({
          batchSize: inputInteger(e.currentTarget, value.batchSize)
        })} /></label></section>
 <section><h3>تاریخ تولد</h3><div className="ce-form-grid"><label>فیلد تاریخ در پروفایل<select className="input" value={value.birthdayField} onChange={e => patch({
            birthdayField: e.target.value
          })}><option value="">انتخاب نشده</option>{value.birthdayField && !dateFields.some(f => f.key === value.birthdayField) && <option value={value.birthdayField}>فیلد قبلی اکنون در دسترس نیست</option>}{dateFields.map(field => <option key={field.key} value={field.key}>{field.label}</option>)}</select></label><label>تقویم مقدارهای واردشدهٔ این فیلد<select className="input" value={value.birthdayInputCalendar} onChange={e => patch({
            birthdayInputCalendar: e.target.value as 'persian' | 'gregory'
          })}><option value="persian">شمسی؛ مانند ۱۳۷۰/۰۵/۲۰</option><option value="gregory">میلادی؛ مانند 1991-08-11</option></select></label><label>تقویم برگزاری سالگرد<select className="input" value={value.birthdayCalendar} onChange={e => patch({
            birthdayCalendar: e.target.value as 'persian' | 'gregory'
          })}><option value="persian">شمسی</option><option value="gregory">میلادی</option></select></label><label>روز کبیسه در سال غیرکبیسه<select className="input" value={value.leapDay} onChange={e => patch({
            leapDay: e.target.value as 'skip' | 'last-day'
          })}><option value="last-day">آخرین روز همان ماه</option><option value="skip">آن سال ارسال نشود</option></select></label></div><p className="muted">فقط فیلد تاریخِ فعال انتخاب‌شدهٔ شما خوانده می‌شود؛ تاریخ ذخیره‌شده تبدیل یا بازنویسی نمی‌شود. <Link href="/admin/profile-fields">مدیریت فیلدهای پروفایل</Link></p>{!dateFields.length && <p role="status">ابتدا یک فیلد تاریخِ غیرالزامی برای تولد در مشخصات کاربران فعال کنید.</p>}</section>
 <section><h3>کانال‌ها و ابزارهای مرتبط</h3><div className="ce-links"><Link href="/admin/sms">پنل و الگوهای پیامک</Link><Link href="/admin/email">ایمیل سایت</Link><Link href="/admin/store/marketing">موجودی، سبد رهاشده و باشگاه مشتریان</Link><Link href="/admin/promotions">کدهای تخفیف</Link><Link href="/admin/newsletter">خبرنامه</Link><Link href="/admin/notifications">گزارش کانال‌های اعلان</Link></div><p className="muted">در پیامک، رویدادهای «تبریک تولد»، «پیشنهاد و تخفیف موردعلاقه» یا «پیشنهاد بازگشت مشتری» را با الگوی واقعی پنل تنظیم کنید. تاریخ تولد، کلید سرویس و شمارهٔ کاربران وارد متن یا گزارش عمومی نمی‌شوند.</p></section>
 </fieldset>;
}
