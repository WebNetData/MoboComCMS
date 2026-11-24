import Link from "@/components/AppLink";
import s from "../Pay.module.css";
export default function ApiGuide() {
  return (
    <section className={s.card}>
      <h2>اتصال به API</h2>
      <p>
        کلید را در سرور خود نگه دارید و درخواست نسخه ۱ را با Bearer ارسال کنید.
        برای هر پرداخت یک کلید Idempotency-Key یکتا بفرستید و در تلاش مجدد همان
        کلید را استفاده کنید.
      </p>
      <pre
        tabIndex={0}
        aria-label="نمونه درخواست ساخت پرداخت"
        className={s.code}
      >{`POST /api/v1/pay/payments\nAuthorization: Bearer <API_KEY>\nIdempotency-Key: <UNIQUE_REQUEST_KEY>\nContent-Type: application/json\n\n{"terminalId":"<TERMINAL_ID>","externalId":"<ORDER_ID>","amountRial":"100000"}`}</pre>
      <p>
        پیش از تحویل کالا، با{" "}
        <code dir="ltr">GET /api/v1/pay/payments/:id</code> وضعیت ثبت‌شده، مبلغ
        و شناسه سفارش را در سرور بررسی کنید. پرداخت‌ها را می‌توان با{" "}
        <code dir="ltr">GET /api/v1/pay/payments?q=...</code> نیز
        جست‌وجو کرد.
      </p>
      <Link className={s.secondary} href="/dashboard/api">
        مدیریت کلیدهای API
      </Link>
      <p>
        برای اتصال ربات تلگرام، سرور خود را به API متصل کنید؛ نیازی به ارسال
        کلید به تلگرام نیست.
      </p>
      <h3>پرداخت در ربات خودتان</h3>
      <p>نشانی کامل checkoutUrl را با دامنه موبوکام در دکمهٔ «پرداخت» ربات خود قرار دهید. مشتری در صفحهٔ موبوکام شماره‌اش را با پیامک تأیید می‌کند، روش پرداخت را انتخاب می‌کند و نتیجه را همان‌جا می‌بیند. انتقال به ربات دیگری لازم نیست.</p>
      <pre className={s.code} tabIndex={0} aria-label="نمونه دکمه پرداخت ربات">{`{"inline_keyboard":[[{"text":"پرداخت","url":"https://YOUR_MOBOCOM_DOMAIN/pay/PAYMENT_ID"}]]}`}</pre>
      <p>در چت خصوصی، در صورت فعال بودن قابلیت Web App ربات شما، می‌توان به‌جای url از web_app با همان نشانی HTTPS استفاده کرد. تأیید شماره و پرداخت در هر دو روش الزامی است.</p>
      <h3>تحویل خودکار پس از تأیید</h3>
      <p>سرور ربات، پرداخت‌های منتظر را دوره‌ای استعلام کند. فقط وقتی status برابر PAID است و id، externalId و amountRial با سفارش ذخیره‌شده شما یکی هستند، تحویل را با شناسهٔ یکتای پرداخت ثبت کند. netRial دریافتی پذیرنده و totalRial مبلغ پرداخت مشتری است. تأیید دستی رسید و تأیید آنلاین هر دو همین نتیجه را دارند. بازگشت مرورگر، ارسال رسید و پیام مشتری سند پرداخت نیستند.</p>
      <p>استعلام از سرور خودتان انجام می‌شود؛ موبوکام برای این جریان به API تلگرام یا توکن ربات شما وصل نمی‌شود.</p>
      <h3>ربات دارای «درگاه سفارشی»</h3>
      <p>در صفحهٔ پایانه‌ها، اتصال آمادهٔ ربات را بسازید. آدرس API و کلید ساخت لینک همان اتصال را در پنل ربات وارد کنید. کلید API پرداخت ربات جداست و فقط برای تأیید سفارشِ واقعاً پرداخت‌شده استفاده می‌شود.</p>
      <pre className={s.code} tabIndex={0} aria-label="قرارداد ساخت لینک درگاه سفارشی">{`POST /api/v1/pay/bot/CONNECTION_ID\nContent-Type: application/json\n\n{"api_key":"CREATE_LINK_KEY","amount":10000,"order_id":"order-123","user_id":123456789,"username":"example_username","first_name":"علی","type":"purchase","payment_count":3,"register":1735689600,"membership_days":45,"balance":25000}\n\n{"url":"https://YOUR_MOBOCOM_DOMAIN/pay/PAYMENT_ID"}`}</pre>
      <p>amount تومان است؛ درخواست تکراری با همان order_id همان پرداخت را برمی‌گرداند. تغییر مبلغ یا کاربر/نوع سفارش با همان شناسه رد می‌شود. انتخاب پاسخ links نیز از تنظیم اتصال ممکن است؛ روش‌های فعال در صفحهٔ پرداخت نمایش داده می‌شوند.</p>
      <pre className={s.code} tabIndex={0} aria-label="قرارداد تأیید سفارش ربات">{`POST https://YOUR_BOT_DOMAIN/api/payment\nToken: BOT_PAYMENT_API_KEY\nContent-Type: application/json\n\n{"order_id":"order-123","actions":"custom_payment_verify"}`}</pre>
      <p>معیار پاسخ موفق باید مطابق ربات انتخاب شود. قطع ارتباط یا پاسخ نامشخص به معنی شکست وجه نیست؛ نتیجه در «پیگیری تأیید سفارش» برای بررسی می‌ماند و خودکار دوباره ارسال نمی‌شود. تنظیم اتصال با یک پرداخت آزمایشی و تکرار همان سفارش، پیش از استفادهٔ واقعی بررسی شود.</p>
      <Link className={s.button} href="/pay/merchant/terminals">راه‌اندازی اتصال ربات</Link>
      <h3>قواعد مسیر و پیگیری عملیات</h3>
      <p>در پایانه‌ها، قواعد مرتبِ مبلغ تومانی، نوع سفارش و سابقهٔ اعلام‌شدهٔ ربات را تنظیم کنید. اولین قاعدهٔ منطبق روش‌ها را انتخاب می‌کند. در حالت links هر دکمه به همان پرداخت با پیشنهاد یک روش وصل است؛ شمارهٔ موبایل و کنترل روش مجاز همچنان روی سرور بررسی می‌شوند. تغییر قواعد مسیر سفارش‌های قبلی یا نسخهٔ تأیید ربات را عوض نمی‌کند.</p>
      <Link className={s.secondary} href="/pay/merchant/operations">جست‌وجو و بررسی عملیات ربات</Link>
    </section>
  );
}
