"use client";
import { useCallback, useEffect, useState } from "react";
import type { PayCheckout } from "@/modules/billing/domain/pay";
import { api, money, date } from "./client";
import { Badge, ErrorNotice } from "./shared";
import PhoneVerification from "./checkout/phone";
import CheckoutMethods from "./checkout/methods";
import CheckoutProgress from "./checkout/progress";
import CheckoutResult from "./checkout/result";
import s from "./Pay.module.css";

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
        if (polls++ < 24 && row.verification.verified && ((row.status === "PENDING" && row.selectedGateway) || waitingForBot)) timer = setTimeout(load, 5000);
      } catch (e) { if (!controller.signal.aborted && e instanceof Error && e.name !== "AbortError") setError(e.message); }
    }
    void load(); return () => { controller.abort(); clearTimeout(timer); };
  }, [id, revision]);
  return <main className={`${s.page} ${s.checkout}`}>
    <header className={s.workspaceHead}><span className={s.eyebrow}>MoboCom Pay</span><h1>پرداخت سفارش</h1><p className={s.muted}>تأیید شماره، انتخاب روش و پیگیری نتیجه پرداخت</p></header>
    <ErrorNotice error={error} />
    {error && <button className={s.secondary} type="button" onClick={refresh}>تلاش دوباره برای دریافت وضعیت</button>}
    {!data ? !error && <p role="status">در حال دریافت اطلاعات…</p> : <>
      <CheckoutProgress data={data} />
      <section className={s.card}>
        <div className={s.sectionHead}><div><h2>{data.merchantName}</h2><p className={s.muted}>{data.terminalName} · سفارش <bdi>{data.externalId}</bdi></p></div><Badge value={data.status} /></div>
        <dl className={s.priceSummary}><div><dt>مبلغ سفارش</dt><dd>{money(data.amountRial)}</dd></div><div><dt>کارمزد پرداخت{data.feeBearer === "MERCHANT" ? " (بر عهده پذیرنده)" : ""}</dt><dd>{money(data.feeRial)}</dd></div><div className={s.priceTotal}><dt>مبلغ قابل پرداخت شما</dt><dd>{money(data.totalRial)}</dd></div></dl>
 {data.status !== 'UNDER_REVIEW' && <p className={s.muted}>مهلت پرداخت: {date(data.expiresAt)}</p>}
      </section>
 {data.status === 'UNDER_REVIEW' ? <p className={s.notice} role="status">رسید ثبت شده و پرداخت در حال بررسی و تأیید است. دوباره واریز نکنید.</p>
 : data.status === "EXPIRED" ? <p className={s.notice}>مهلت این پرداخت پایان یافته است. لینک تازه را از فروشنده دریافت کنید.</p>
        : data.status === "PAID" && !data.verification.verified ? <p className={s.notice}>این سفارش قبلاً پرداخت شده است. برای مشاهدهٔ نتیجهٔ کامل از همان مرورگر پرداخت استفاده کنید یا با فروشنده تماس بگیرید. دوباره پرداخت نکنید.</p>
        : !data.verification.verified ? <PhoneVerification id={id} onVerified={refresh} />
        : data.status === "PAID" ? <CheckoutResult data={data} refresh={refresh} />
        : <><p className={s.notice}>شمارهٔ تأییدشده: …<bdi>{data.verification.phoneLast4}</bdi></p><CheckoutMethods data={data} refresh={refresh} preferredGateway={preferredGateway} /></>}
    </>}
  </main>;
}
