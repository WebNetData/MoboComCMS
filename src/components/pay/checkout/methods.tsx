"use client";
import { useState } from "react";
import type { PayCheckout } from "@/modules/billing/domain/pay";
import { api, json } from "../client";
import { ErrorNotice } from "../shared";
import ReceiptForm from "./receipt";
import s from "../Pay.module.css";

export default function CheckoutMethods({ data, refresh }: { data: PayCheckout; refresh: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function choose(gatewayRef: string) {
    setBusy(true); setError("");
    try { const result = await api<{ status: string; paymentUrl: string }>(`/api/pay/checkout/${data.id}/gateway`, json("POST", { gatewayRef }));
      if (result.status === "READY" && result.paymentUrl) window.location.assign(result.paymentUrl); else refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "اتصال به درگاه ناموفق بود"); } finally { setBusy(false); }
  }
  const selected = data.selectedGateway;
  return <section className={`${s.card} ${s.stack}`}>
    <h2>{selected ? "ادامه پرداخت" : "انتخاب روش پرداخت"}</h2><ErrorNotice error={error} />
    {!selected && <>{!data.gateways.length && <p role="status">روش پرداخت فعالی در دسترس نیست؛ با فروشنده تماس بگیرید.</p>}<div className={s.stack}>{data.gateways.map(g => <button type="button" className={s.secondary} key={g.ref} disabled={busy} onClick={() => void choose(g.ref)}>{g.name}{g.manual ? " · ارسال رسید" : " · پرداخت آنلاین"}</button>)}</div></>}
    {selected && selected.status !== "READY" && <><p role="status">{selected.status === "FAILED" ? "اتصال به درگاه انجام نشد. می‌توانید همین روش را دوباره امتحان کنید." : "نتیجه ایجاد پرداخت هنوز قطعی نیست. برای جلوگیری از پرداخت تکراری، دوباره پرداخت نکنید و با پشتیبانی پیگیری کنید."}</p>{selected.status === "FAILED" && <button type="button" className={s.secondary} disabled={busy} onClick={() => void choose(selected.gatewayRef)}>تلاش دوباره</button>}</>}
    {selected?.status === "READY" && !selected.manual && <><p>پس از پرداخت، برای مشاهده نتیجه به همین صفحه بازگردید.</p><a className={s.button} href={selected.paymentUrl}>ادامه در صفحه امن پرداخت</a><button type="button" className={s.secondary} onClick={refresh}>بررسی نتیجه پرداخت</button></>}
    {selected?.status === "READY" && selected.manual && <>
      {data.bank && <dl className={s.bankDetails}><div><dt>بانک</dt><dd>{data.bank.bankName}</dd></div><div><dt>صاحب حساب</dt><dd>{data.bank.holderName}</dd></div>{data.bank.cardNumber && <div><dt>شماره کارت</dt><dd dir="ltr">{data.bank.cardNumber}</dd></div>}{data.bank.iban && <div><dt>شبا</dt><dd dir="ltr">{data.bank.iban}</dd></div>}</dl>}
      {selected.instructions && <p className={s.instructions}>{selected.instructions}</p>}
      <p>مبلغ دقیق قابل پرداخت را واریز کنید و تصویر رسید را بفرستید. ارسال رسید به‌تنهایی تأیید پرداخت نیست.</p>
      {data.receipt && <p className={s.notice} role="status">{data.receipt.status === "PENDING" ? "رسید دریافت شد؛ در انتظار بررسی یا تطبیق بانکی است." : data.receipt.status === "REJECTED" ? `رسید تأیید نشد: ${data.receipt.adminNote}` : "رسید تأیید شده است؛ در حال دریافت نتیجه…"}</p>}
      {data.receipt?.status !== "PENDING" && data.receipt?.status !== "APPROVED" && <ReceiptForm id={data.id} refresh={refresh} />}
    </>}
  </section>;
}
