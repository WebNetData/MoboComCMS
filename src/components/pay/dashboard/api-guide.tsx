import Link from "@/components/AppLink";
import Icon from "@/components/site/Icon";
import s from "../Pay.module.css";
import layout from "../WorkspaceContent.module.css";

const sections = [
  ["first-payment", "اولین دریافت"],
  ["merchant-api", "اتصال سرور"],
  ["telegram-bot", "ربات تلگرام"],
  ["payment-help", "رفع خطا و پیگیری"],
] as const;

export default function ApiGuide() {
  return (
    <div className={layout.workspace}>
      <section className={`${layout.panel} ${layout.guideHero}`} aria-labelledby="merchant-guide-title">
        <div className={layout.sectionHead}><div><h2 id="merchant-guide-title">مرکز راهنمای پذیرنده</h2><p>از ساخت اولین لینک تا اتصال سرور و تأیید سفارش ربات</p></div></div>
        <nav className={layout.guideIndex} aria-label="موضوع‌های راهنما">
          {sections.map(([id, title]) => <a key={id} className={layout.guideLink} href={`#${id}`}>{title}</a>)}
        </nav>
      </section>
      <section id="first-payment" className={layout.panel} aria-labelledby="first-payment-title">
        <div className={layout.sectionHead}><div><h2 id="first-payment-title">اولین دریافت با لینک پرداخت</h2><p>برای فروش در پیام‌رسان، شبکهٔ اجتماعی یا سفارش مستقیم</p></div></div>
        <ol className={layout.steps}>
          <li><strong>پایانه بسازید.</strong> نوع فعالیت خود را انتخاب کنید. برای پیج یا کانال، راه‌اندازی ربات لازم نیست.</li>
          <li><strong>لینک سفارش را بسازید.</strong> پایانه، مبلغ ریالی و شناسهٔ یکتای سفارش را در پرداخت‌ها ثبت کنید. لینک را برای مشتری بفرستید.</li>
          <li><strong>وصول را بررسی کنید.</strong> وضعیت پرداخت و مبلغ را با سفارش تطبیق دهید. اعتبار خالص و کارمزد در جزئیات پرداخت نمایش داده می‌شوند.</li>
        </ol>
        <div className={layout.guideIndex}><Link className={layout.guideLink} href="/pay/merchant/terminals">مدیریت پایانه‌ها</Link><Link className={layout.guideLink} href="/pay/merchant/payments">ساخت لینک پرداخت</Link></div>
      </section>
      <section id="merchant-api" className={layout.panel} aria-labelledby="merchant-api-title">
        <div className={layout.sectionHead}><div><h2 id="merchant-api-title">اتصال وب‌سایت و سرور فروش</h2><p>برای اتصال جدید از نسخهٔ ۲ استفاده کنید.</p></div></div>
        <div className={layout.guideIndex}><Link className={layout.guideLink} href="/dashboard/api"><Icon name="terminal" size={18} />مدیریت کلیدهای API</Link><Link className={layout.guideLink} href="/pay/merchant/webhooks">تنظیم وبهوک</Link><Link className={layout.guideLink} href="/pay/merchant/reports">گزارش مالی اتصال</Link></div>
        <details className={layout.guideDetails}>
          <summary>کلید مناسب و روش‌های مجاز پایانه</summary>
          <div>
            <p>کلید حساب را در سرور نگه دارید. اگر یک سرویس فقط به یک پایانه نیاز دارد، از مدیر درگاه کلید محدود به همان پایانه بگیرید. این کلید فقط فهرست روش‌های همان پایانه، ساخت پرداخت و استعلام همان پرداخت‌ها را پوشش می‌دهد.</p>
            <pre tabIndex={0} dir="ltr" aria-label="استعلام روش‌های پایانه" className={s.code}>{`GET /api/v2/pay/terminals/<TERMINAL_ID>/gateways\nAuthorization: Bearer <API_KEY>`}</pre>
          </div>
        </details>
        <details className={layout.guideDetails}>
          <summary>نمونه ساخت پرداخت و بررسی نتیجه</summary>
          <div>
            <pre tabIndex={0} dir="ltr" aria-label="نمونه درخواست ساخت پرداخت" className={s.code}>{`POST /api/v2/pay/payments\nAuthorization: Bearer <API_KEY>\nIdempotency-Key: <UNIQUE_REQUEST_KEY>\nContent-Type: application/json\n\n{"terminalId":"<TERMINAL_ID>","externalId":"<ORDER_ID>","amountRial":"100000"}`}</pre>
            <p>در ارسال دوبارهٔ همان درخواست، همان شناسهٔ <bdi>Idempotency-Key</bdi> را بفرستید. لینک checkoutUrl از پاسخ خوانده می‌شود. قبل از تحویل، نتیجه را از سرور با <code dir="ltr">GET /api/v2/pay/payments/&lt;PAYMENT_ID&gt;</code> استعلام کنید. وضعیت باید <bdi>PAID</bdi> باشد و شناسهٔ پرداخت، مبلغ و شناسهٔ سفارش با سفارش ثبت‌شده برابر باشند.</p>
            <p>برای تحویل خودکار، شناسهٔ پرداخت را یک‌بار در سیستم فروش ثبت کنید. وبهوک می‌تواند استعلام را آغاز کند. تکرار رویداد نباید باعث تحویل دوباره شود.</p>
          </div>
        </details>
      </section>
      <section id="telegram-bot" className={layout.panel} aria-labelledby="telegram-bot-title">
        <div className={layout.sectionHead}><div><h2 id="telegram-bot-title">اتصال ربات تلگرام</h2><p>مسیر راه‌اندازی را بر اساس نحوهٔ مدیریت ربات انتخاب کنید.</p></div></div>
        <details className={layout.guideDetails}>
          <summary>ربات اختصاصی و دکمهٔ پرداخت</summary>
          <div><p>سرور ربات لینک را از API می‌گیرد و آن را در دکمهٔ پرداخت قرار می‌دهد. در گفت‌وگوی خصوصی می‌توانید در صورت پشتیبانی ربات، از دکمهٔ Web App با همان نشانی HTTPS استفاده کنید. مشتری شماره و پرداخت را در صفحهٔ موبوکام تکمیل می‌کند.</p><pre tabIndex={0} dir="ltr" className={s.code} aria-label="نمونه دکمه پرداخت ربات">{`{"inline_keyboard":[[{"text":"پرداخت","url":"https://YOUR_MOBOCOM_DOMAIN/pay/PAYMENT_ID"}]]}`}</pre></div>
        </details>
        <details className={layout.guideDetails}>
          <summary>ربات با گزینهٔ «درگاه سفارشی»</summary>
          <div>
            <p>در پیکربندی پایانه، اتصال ربات را بسازید. نشانی اتصال و کلید ساخت لینک را در پنل ربات وارد کنید. توکن تأیید سفارش، مقدار جداگانه‌ای است که از ربات می‌گیرید.</p>
            <pre tabIndex={0} dir="ltr" className={s.code} aria-label="قرارداد ساخت لینک درگاه سفارشی">{`POST /api/v1/pay/bot/CONNECTION_ID\nContent-Type: application/json\n\n{"api_key":"CREATE_LINK_KEY","amount":10000,"order_id":"order-123","user_id":123456789,"username":"example_username","first_name":"علی","type":"purchase","payment_count":3,"register":1735689600,"membership_days":45,"balance":25000}\n\n{"url":"https://YOUR_MOBOCOM_DOMAIN/pay/PAYMENT_ID"}`}</pre>
            <p>در این اتصال amount به تومان است. درخواست تکراری با همان order_id همان پرداخت را برمی‌گرداند. قواعد پایانه می‌توانند روش‌ها را بر اساس مبلغ و نوع سفارش محدود کنند. در حالت links همهٔ دکمه‌ها به همان پرداخت مربوط‌اند.</p>
            <pre tabIndex={0} dir="ltr" className={s.code} aria-label="قرارداد تأیید سفارش ربات">{`POST https://YOUR_BOT_DOMAIN/api/payment\nToken: BOT_PAYMENT_API_KEY\nContent-Type: application/json\n\n{"order_id":"order-123","actions":"custom_payment_verify"}`}</pre>
            <p>معیار موفقیت پاسخ را مطابق ربات تعیین کنید. برای پاسخ نامشخص از «عملیات ربات» وضعیت را بررسی کنید.</p>
            <div><Link className={layout.guideLink} href="/pay/merchant/terminals">راه‌اندازی اتصال ربات</Link></div>
          </div>
        </details>
      </section>
      <section id="payment-help" className={layout.panel} aria-labelledby="payment-help-title">
        <div className={layout.sectionHead}><div><h2 id="payment-help-title">رفع خطا و پیگیری سفارش</h2></div></div>
        <details className={layout.guideDetails}><summary>ربات هنگام ساخت لینک خطای ۴۰۱ می‌دهد</summary><div><p>فعال بودن پذیرنده، پایانه و اتصال ربات را بررسی کنید. نشانی و کلید ساخت لینک باید متعلق به همان اتصال باشند. اگر کلید عوض شده، مقدار تازه را در پنل ربات وارد کنید.</p></div></details>
        <details className={layout.guideDetails}><summary>وجه پرداخت شده ولی سفارش ربات تأیید نشده است</summary><div><p>ابتدا وضعیت دریافت را در «پرداخت‌ها» بررسی کنید. سپس همان سفارش را در «عملیات ربات» پیدا کنید تا نتیجه و تاریخچهٔ تأیید مشخص شود.</p><div><Link className={layout.guideLink} href="/pay/merchant/operations">پیگیری عملیات ربات</Link></div></div></details>
        <details className={layout.guideDetails}><summary>موجودی قابل تسویه و خروجی گزارش را از کجا ببینم؟</summary><div><p>در «تسویه‌ها» مبلغ، مقصد و وضعیت درخواست را ببینید. فایل CSV پرداخت‌ها و تسویه‌ها در گزارش‌های مالی در دسترس است.</p><div className={layout.guideIndex}><Link className={layout.guideLink} href="/pay/merchant/settlements">تسویه‌ها</Link><Link className={layout.guideLink} href="/pay/merchant/reports">گزارش‌های مالی</Link></div></div></details>
      </section>
    </div>
  );
}
