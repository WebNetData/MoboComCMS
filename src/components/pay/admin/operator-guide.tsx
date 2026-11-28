import Link from "@/components/AppLink";
import styles from "../WorkspaceContent.module.css";

export default function OperatorGuide() {
  return (
    <section id="pay-admin-guide" className={styles.panel} aria-labelledby="pay-admin-guide-title">
      <div className={styles.sectionHead}>
        <div><h2 id="pay-admin-guide-title">راهنمای مدیریت درگاه</h2><p>مراحل راه‌اندازی پذیرنده و رسیدگی به استثناهای دریافت و تسویه</p></div>
      </div>
      <details className={styles.guideDetails}>
        <summary>پذیرنده را برای اولین دریافت آماده کنید</summary>
        <div>
          <ol className={styles.steps}>
            <li>از «پذیرندگان» حساب موبوکام را انتخاب کنید و پس از بررسی، پذیرندگی را فعال کنید.</li>
            <li>مجوز روش‌های پرداخت پذیرنده و محدودیت هر پایانه را بررسی کنید. روش قابل ارائه به مشتری به مبلغ و مجوز همان پایانه بستگی دارد.</li>
            <li>یک لینک برای سفارش آزمایشی بسازید و نتیجهٔ ثبت‌شده را در پرداخت‌های درگاه بررسی کنید.</li>
          </ol>
          <div><Link className={styles.guideLink} href="/admin/mobocom-pay/merchants">مدیریت پذیرندگان</Link></div>
        </div>
      </details>
      <details className={styles.guideDetails}>
        <summary>دریافت خودکار کارت‌به‌کارت را بررسی کنید</summary>
        <div>
          <ol className={styles.steps}>
            <li>حساب مقصد فعال با کاربرد «اختصاصی درگاه موبوکام» را در تنظیمات درگاه پرداخت انتخاب کنید.</li>
            <li>منبع پیامک را برای همین حساب بسازید، قالب و فرستنده را روی گوشی بررسی کنید و منبع را فعال کنید.</li>
            <li>با یک سفارش تازه و مبلغ دقیق صفحهٔ پرداخت، وصول را آزمایش کنید. وضعیت منبع و شواهد دریافت در «پایش بانکی» دیده می‌شود.</li>
          </ol>
          <div className={styles.guideIndex}><a className={styles.guideLink} href="#sms-forwarder-guide-title">تنظیم SMS Forwarder</a><Link className={styles.guideLink} href="/admin/mobocom-pay/operations">باز کردن پایش بانکی</Link></div>
        </div>
      </details>
      <details className={styles.guideDetails}>
        <summary>رسید یا مغایرت را رسیدگی کنید</summary>
        <div>
          <p>برای رسید مشتری، وصول واقعی و شناسهٔ پیگیری انتقال را بررسی کنید. برای اختلاف مبلغ یا زمان، مدرک بانکی و پرداخت را در میز مغایرت تطبیق دهید. رسیدی که مدیر کل برای پذیرندگی خودش تأیید کند در گزارش تغییرات مشخص است.</p>
          <div className={styles.guideIndex}><Link className={styles.guideLink} href="/admin/mobocom-pay/receipts">رسیدها</Link><Link className={styles.guideLink} href="/admin/mobocom-pay/reconciliation">میز مغایرت</Link></div>
        </div>
      </details>
      <details className={styles.guideDetails}>
        <summary>تسویه را بررسی و انتقال انجام‌شده را ثبت کنید</summary>
        <div>
          <p>مبلغ و مقصد را بررسی کنید. اگر درخواست مشمول تأیید دو مدیر است، منتظر تأیید دوم بمانید. بعد از انجام انتقال، شناسه پیگیری بانک یا هش تراکنش شبکه را ثبت کنید.</p>
          <div><Link className={styles.guideLink} href="/admin/mobocom-pay/settlements">میز تسویه‌ها</Link></div>
        </div>
      </details>
    </section>
  );
}
