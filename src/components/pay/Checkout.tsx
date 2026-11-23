"use client";
import { useCallback, useEffect, useState } from "react";
import type { PayCheckout } from "@/modules/billing/domain/pay";
import { api, money, date } from "./client";
import { Badge, ErrorNotice } from "./shared";
import PhoneVerification from "./checkout/phone";
import CheckoutMethods from "./checkout/methods";
import s from "./Pay.module.css";

export default function Checkout({ id }: { id: string }) {
  const [data, setData] = useState<PayCheckout | null>(null), [error, setError] = useState(""), [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(x => x + 1), []);
  useEffect(() => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const row = await api<PayCheckout>(`/api/pay/checkout/${encodeURIComponent(id)}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setData(row); setError("");
        if (row.verification.verified && row.status === "PENDING" && row.selectedGateway) timer = setTimeout(load, 5000);
      } catch (e) { if (e instanceof Error && e.name !== "AbortError") setError(e.message); }
    }
    void load(); return () => { controller.abort(); clearTimeout(timer); };
  }, [id, revision]);
  return <main className={`${s.page} ${s.checkout}`}>
    <header className={s.workspaceHead}><span className={s.eyebrow}>MoboCom Pay</span><h1>پرداخت سفارش</h1><p className={s.muted}>تأیید شماره، انتخاب روش و پیگیری نتیجه پرداخت</p></header>
    <ErrorNotice error={error} />
    {error && <button className={s.secondary} type="button" onClick={refresh}>تلاش دوباره برای دریافت وضعیت</button>}
    {!data ? !error && <p role="status">در حال دریافت اطلاعات…</p> : <>
      <section className={s.card}>
        <div className={s.sectionHead}><div><h2>{data.merchantName}</h2><p className={s.muted}>{data.terminalName} · سفارش <bdi>{data.externalId}</bdi></p></div><Badge value={data.status} /></div>
        <dl className={s.priceSummary}><div><dt>مبلغ سفارش</dt><dd>{money(data.amountRial)}</dd></div><div><dt>کارمزد پرداخت{data.feeBearer === "MERCHANT" ? " (بر عهده پذیرنده)" : ""}</dt><dd>{money(data.feeRial)}</dd></div><div className={s.priceTotal}><dt>مبلغ قابل پرداخت شما</dt><dd>{money(data.totalRial)}</dd></div></dl>
        <p className={s.muted}>مهلت پرداخت: {date(data.expiresAt)}</p>
      </section>
      {data.status === "EXPIRED" ? <p className={s.notice}>مهلت این پرداخت پایان یافته است. لینک تازه را از فروشنده دریافت کنید.</p>
        : !data.verification.verified ? <PhoneVerification id={id} onVerified={refresh} />
        : data.status === "PAID" ? <section className={s.notice} role="status"><h2>پرداخت شما تأیید شد.</h2><p>نتیجه در سامانه ثبت شد؛ فروشنده پس از بررسی نتیجه، سفارش را تحویل می‌دهد.</p>{data.returnUrl && <a className={s.button} href={data.returnUrl} rel="noreferrer">بازگشت به فروشنده</a>}</section>
        : <><p className={s.notice}>شمارهٔ تأییدشده: …<bdi>{data.verification.phoneLast4}</bdi></p><CheckoutMethods data={data} refresh={refresh} /></>}
    </>}
  </main>;
}
