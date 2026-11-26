'use client'

import { useEffect, useState } from 'react'
import p from '../Pay.module.css'
import s from './bale-setup.module.css'

type Setup = { panelUrl: string | null; panelUrlInvalid: boolean }
type Source = { id: string; webhookPath: string }
export default function BaleSetup({ setup, sources }: { setup?: Setup; sources: Source[] }) {
  const [origin,setOrigin]=useState(''), [feedback,setFeedback]=useState('')
  useEffect(()=>{if(window.location.protocol==='https:')setOrigin(window.location.origin)},[])
  async function copy(value:string,label:string){try{await navigator.clipboard.writeText(value);setFeedback(`${label} کپی شد`)}catch{setFeedback(`کپی ${label} انجام نشد؛ متن را دستی انتخاب کنید`)}}
  const endpoint=origin ? origin+'/api/payment/mobocom-pay/bale-events' : ''
  const config = ['# فقط روی سرور موبوکام؛ مقادیر نمونه را جایگزین کنید', 'MOBOCOM_PAY_BALE_PANEL_URL=https://bale-admin.YOUR-DOMAIN/ui/', 'MOBOCOM_PAY_BALE_ENABLED=false', 'MOBOCOM_PAY_BALE_SESSION=YOUR_ALIAS', 'MOBOCOM_PAY_BALE_INSTANCE=YOUR_INSTANCE_ID', 'MOBOCOM_PAY_BALE_ACCOUNT=YOUR_ACCOUNT_ID', 'MOBOCOM_PAY_BALE_BANK_PEER=VERIFIED_NUMERIC_BANK_PEER', 'MOBOCOM_PAY_BALE_BANK_ACCOUNT=YOUR_BANK_ACCOUNT_ID', 'MOBOCOM_PAY_BALE_OWNER_USER_ID=YOUR_ADMIN_USER_ID', 'MOBOCOM_PAY_BALE_WEBHOOK_SECRET=YOUR_RANDOM_SIGNING_SECRET', 'MOBOCOM_PAY_BALE_VERIFIED=false'].join('\n')
  return <section id="pay-bale-setup" className={s.guide} aria-labelledby="bale-setup-title" dir="rtl">
    <header className={s.header}><div><span className={s.eyebrow}>فقط مدیریت موبوکام</span><h3 id="bale-setup-title">اتصال حساب شخصی بله</h3><p>حساب صاحب کارت روی سرور وارد می‌شود؛ اعلان اصلی بانک به موبوکام می‌رسد.</p></div><span className={p.badge}>ورود حساب ≠ توکن بازو</span></header>
    <div className={s.panel}><h4>ورود به حساب صاحب کارت</h4><p>ورود با شماره، کد و در صورت نیاز رمز دوم، در پنل خصوصی GoOmni انجام می‌شود. رمز و نشست حساب در تنظیمات پذیرنده ذخیره نمی‌شوند.</p>
      {!setup ? <p role="status">وضعیت پنل خصوصی اتصال هنوز دریافت نشده است.</p> : setup.panelUrl ? <a className={p.button} href={setup.panelUrl} target="_blank" rel="noopener noreferrer">باز کردن پنل خصوصی اتصال بله</a> : <p className={s.notice}>نشانی پنل خصوصی اتصال ثبت نشده است. پس از نصب کانکتور روی سرور، متغیر <code dir="ltr">MOBOCOM_PAY_BALE_PANEL_URL</code> را با نشانی HTTPS پنل آن تنظیم و سرویس موبوکام را بازراه‌اندازی کنید.</p>}
      {setup?.panelUrlInvalid && <p role="alert">نشانی پنل معتبر نیست؛ HTTPS بدون نام کاربری، رمز یا پارامتر لازم است.</p>}
      <a href="https://github.com/mimalef70/goomni/blob/v2.4.2/README.md#how-to-use" target="_blank" rel="noopener noreferrer">راهنمای نصب کانکتور GoOmni نسخهٔ ۲.۴.۲</a>
    </div>
    <ol className={s.steps}>
      <li><strong>کانکتور را روی سرور خودتان آماده کنید</strong><p>یک نمونهٔ مستقل GoOmni با پنل خصوصی، HTTPS و فضای ماندگار نشست داشته باشید. پورت آن با وب‌سایت تداخل نداشته باشد. این اتصال غیررسمی است؛ کارکرد حساب واقعی باید آزموده شود.</p></li>
      <li><strong>حساب بلهٔ صاحب کارت را وارد کنید</strong><p>در پنل خصوصی، حساب جدید با پیام‌رسان Bale بسازید و ورود را کامل کنید. alias، شناسهٔ ثابت instance و شناسهٔ حساب را از همان اتصال بردارید.</p></li>
      <li><strong>بازوی اصلی بانک را تطبیق دهید</strong><p>در همان حساب، گفت‌وگوی اصلی <bdi dir="ltr">@bam_bmi</bdi> و شناسهٔ عددی آن را بررسی کنید. پیام فورواردشده یا نام نمایشی، مدرک فرستندهٔ اصلی نیست.</p></li>
      <li><strong>وب‌هوک همان اتصال را تنظیم کنید</strong><p>در GoOmni رویداد <code dir="ltr">message</code>، فیلتر بازوی بانک و مقصد زیر را تنظیم کنید. کلید امضای تصادفی مستقلی بسازید و همان مقدار را در GoOmni و محیط موبوکام بگذارید؛ با توکن پیامک یا ربات یکی نیست.</p>
        {sources.length ? sources.map(source=><div className={s.field} key={source.id}><span>مقصد اتصال <bdi>{source.id}</bdi></span><input readOnly dir="ltr" aria-label={`مقصد وب‌هوک ${source.id}`} value={origin ? origin+source.webhookPath : source.webhookPath}/><button type="button" className={p.secondary} disabled={!origin} onClick={()=>void copy(origin+source.webhookPath,'مقصد بله')}>کپی مقصد بله</button></div>) : <div className={s.field}><label htmlFor="bale-initial-endpoint">مقصد تنظیمات تک‌حسابی</label><input id="bale-initial-endpoint" readOnly dir="ltr" value={endpoint}/><button type="button" className={p.secondary} disabled={!endpoint} onClick={()=>void copy(endpoint,'مقصد بله')}>کپی مقصد بله</button><p>برای چند حساب، هر رکورد منبع مسیر خودش با <code dir="ltr">?source=SOURCE_ID</code> را دارد.</p></div>}
      </li>
      <li><strong>منبع را به حساب بانکی خودتان متصل کنید</strong><p>در محیط سرور موبوکام، شناسه‌های اتصال، حساب بانکی اختصاصی ملی و UserId مدیر را تنظیم کنید. شمارهٔ حساب ملی دقیقاً ۱۳ رقم باشد. پس از بررسی هویت بازو و کلید مشترک، دو پرچم دریافت و تأیید منبع را فعال کنید.</p><details><summary>الگوی متغیرهای سرور؛ بدون اطلاعات محرمانه</summary><div className={s.field}><textarea readOnly rows={11} dir="ltr" aria-label="الگوی تنظیمات اتصال بله" value={config}/><button type="button" className={p.secondary} onClick={()=>void copy(config,'الگوی سرور')}>کپی الگوی سرور</button></div><p>برای ساخت کلید تصادفی روی سرور: <code dir="ltr">openssl rand -hex 32</code>. مقادیر نمونه اتصال واقعی ایجاد نمی‌کنند. فهرست چندمنبعی <code dir="ltr">MOBOCOM_PAY_BALE_SOURCES</code>، اگر تنظیم شده باشد، بر متغیرهای تکی مقدم است.</p></details></li>
      <li><strong>تأیید خودکار را از مدیریت فعال و دریافت واقعی را بررسی کنید</strong><p>درگاه کارت‌به‌کارت، منابع مجاز، سیاست تطبیق و مجوز پذیرنده/پایانه را خودتان فعال کنید. «دریافت آماده» فقط وضعیت تنظیمات است؛ آخرین پیام و نتیجهٔ یک فاکتور آزمایشی را در پایش دریافت‌ها بررسی کنید. تأیید دستی، پیامک و بله از همان ثبت مالی یک‌باره استفاده می‌کنند.</p></li>
    </ol><p role="status" aria-live="polite">{feedback}</p>
  </section>
}
