"use client";
import { useCallback, useEffect, useState } from "react";
import type { PayCheckout } from "@/modules/billing/domain/pay";
import { api, money, date } from "./client";
import { Badge, ErrorNotice } from "./shared";
import PhoneVerification from "./checkout/phone";
import CheckoutMethods from "./checkout/methods";
import CheckoutProgress from "./checkout/progress";
import CheckoutResult from "./checkout/result";
import Purchase from "./checkout/purchase";
import s from "./Pay.module.css";
import styles from "./checkout/Checkout.module.css";

export default function Checkout({ id, preferredGateway = '' }: { id: string; preferredGateway?: string }) {
  const [data, setData] = useState<PayCheckout | null>(null), [error, setError] = useState(""), [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(x => x + 1), []);
  useEffect(() => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>; let polls = 0;
    async function load() {
      try {
        const row = await api<PayCheckout>(`/api/pay/checkout/${encodeURIComponent(id)}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setData(row); setError("");
        const waitingForBot = row.status === "PAID" && row.botDelivery && ["QUEUED", "SENDING"].includes(row.botDelivery.status);
        const waitingForPayment = (row.status === "PENDING" && row.selectedGateway) || row.status === "UNDER_REVIEW";
        if (polls++ < 24 && row.verification.verified && (waitingForPayment || waitingForBot)) timer = setTimeout(load, 5000);
      } catch (e) { if (!controller.signal.aborted && e instanceof Error && e.name !== "AbortError") setError(e.message); }
    }
    void load(); return () => { controller.abort(); clearTimeout(timer); };
  }, [id, revision]);
  const hasTransfer = data?.status === "PENDING" && data.selectedGateway?.manual && data.selectedGateway.status === "READY";
  return <main className={`${s.page} ${styles.checkout}`} dir="rtl">
    <header className={styles.header}><h1>پرداخت سفارش</h1><span dir="ltr">MoboCom Pay</span></header>
    <ErrorNotice error={error} />
    {error && <button className={s.secondary} type="button" onClick={refresh}>تلاش دوباره برای دریافت وضعیت</button>}
    {!data ? !error && <p role="status">در حال دریافت اطلاعات…</p> : <>
      {!hasTransfer && <CheckoutProgress data={data} />}
      {!data.purchase && <section className={styles.summary} aria-label="خلاصه سفارش">
        <div className={styles.summaryLine}>
          <div><h2>{data.merchantName}</h2><p>سفارش <bdi>{data.externalId}</bdi></p></div>
          {hasTransfer || data.status !== "PENDING" ? <Badge value={data.status} /> : <strong>{money(data.totalRial)}</strong>}
        </div>
        <details className={styles.disclosure}>
          <summary>جزئیات سفارش و کارمزد</summary>
          <dl className={s.priceSummary}><div><dt>مبلغ سفارش</dt><dd>{money(data.amountRial)}</dd></div>
            {data.customerFeeRial && data.customerFeeRial !== '0' && <div><dt>سهم مشتری از کارمزد</dt><dd>{money(data.customerFeeRial)}</dd></div>}
            {data.merchantFeeRial && data.merchantFeeRial !== '0' && <div><dt>سهم پذیرنده از کارمزد</dt><dd>{money(data.merchantFeeRial)}</dd></div>}
          </dl>
          {data.status === "PENDING" && <p>مهلت پرداخت <bdi>{date(data.expiresAt)}</bdi></p>}
        </details>
      </section>}
      <Purchase data={data} />
 {data.status === 'UNDER_REVIEW' ? <section className={s.notice}><h2>در حال بررسی و تأیید</h2><p role="status">رسید ثبت شد. دوباره واریز نکنید.</p><button className={s.secondary} type="button" onClick={refresh}>بررسی وضعیت</button></section>
 : data.status === "EXPIRED" ? <p className={s.notice}>مهلت این پرداخت پایان یافته است. لینک تازه را از فروشنده دریافت کنید.</p>
        : data.status === "PAID" && !data.verification.verified ? <p className={s.notice}>این سفارش قبلاً پرداخت شده است. برای مشاهدهٔ نتیجهٔ کامل از همان مرورگر پرداخت استفاده کنید یا با فروشنده تماس بگیرید. دوباره پرداخت نکنید.</p>
        : !data.verification.verified ? <PhoneVerification id={id} onVerified={refresh} />
        : data.status === "PAID" ? <CheckoutResult data={data} refresh={refresh} />
        : <CheckoutMethods data={data} refresh={refresh} preferredGateway={preferredGateway} />}
    </>}
  </main>;
}
