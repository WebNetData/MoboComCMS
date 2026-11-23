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
        className={s.code}
      >{`POST /api/v1/pay/payments\nAuthorization: Bearer <API_KEY>\nIdempotency-Key: <UNIQUE_REQUEST_KEY>\nContent-Type: application/json\n\n{"terminalId":"<TERMINAL_ID>","externalId":"<ORDER_ID>","amountRial":"100000"}`}</pre>
      <p>
        پیش از تحویل کالا، با{" "}
        <code dir="ltr">GET /api/v1/pay/payments/:id</code> وضعیت ثبت‌شده، مبلغ
        و شناسه سفارش را در سرور بررسی کنید. پرداخت‌ها را می‌توان با{" "}
        <code dir="ltr">GET /api/v1/pay/payments?externalId=...</code> نیز
        جست‌وجو کرد.
      </p>
      <Link className={s.secondary} href="/dashboard/api">
        مدیریت کلیدهای API
      </Link>
      <p>
        برای اتصال ربات تلگرام، سرور خود را به API متصل کنید؛ نیازی به ارسال
        کلید به تلگرام نیست.
      </p>
    </section>
  );
}
