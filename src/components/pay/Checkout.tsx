"use client";
import { useEffect, useState } from "react";
import type { PayCheckout } from "@/modules/billing/domain/pay";
import { api, json, money, date } from "./client";
import { Field, Badge, ErrorNotice } from "./shared";
import s from "./Pay.module.css";
export default function Checkout({ id }: { id: string }) {
  const [data, setData] = useState<PayCheckout | null>(null),
    [reference, setReference] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [poll, setPoll] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const result = await api<PayCheckout>(
          `/api/pay/checkout/${encodeURIComponent(id)}`,
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        setData(result);
        setError("");
        if ((poll || result.transferReference) && result.status === "PENDING")
          timer = setTimeout(load, 5000);
      } catch (e) {
        if (e instanceof Error && e.name !== "AbortError") setError(e.message);
      }
    }
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [id, poll, retry]);
  async function submit() {
    setBusy(true);
    setError("");
    try {
      const result = await api<PayCheckout>(
        `/api/pay/checkout/${encodeURIComponent(id)}`,
        json("POST", { transferReference: reference }),
      );
      setData(result);
      setPoll(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ثبت ناموفق بود");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className={`${s.page} ${s.checkout}`}>
      <span className={s.eyebrow}>MoboCom Pay</span>
      <h1>پرداخت سفارش</h1>
      <ErrorNotice error={error} />
      {error && (
        <button
          type="button"
          className={s.secondary}
          onClick={() => setRetry((x) => x + 1)}
        >
          تلاش دوباره برای دریافت وضعیت
        </button>
      )}
      {!data ? (
        !error && <p role="status">در حال دریافت اطلاعات…</p>
      ) : (
        <>
          <section className={s.card}>
            <div className={s.sectionHead}>
              <div>
                <h2>{data.merchantName}</h2>
                <p className={s.muted}>
                  {data.terminalName} · سفارش {data.externalId}
                </p>
              </div>
              <Badge value={data.status} />
            </div>
            <div className={s.metric}>
              <small>مبلغ پرداخت</small>
              <strong>{money(data.amountRial)}</strong>
            </div>
            <p>مهلت پرداخت: {date(data.expiresAt)}</p>
          </section>
          {data.status === "PAID" ? (
            <p className={s.notice} role="status">
              پرداخت شما تأیید شد.
            </p>
          ) : data.status === "EXPIRED" ? (
            <p className={s.notice}>مهلت این پرداخت پایان یافته است.</p>
          ) : (
            <section className={`${s.card} ${s.stack}`}>
              <h2>انتقال بانکی</h2>
              <p>
                مبلغ دقیق را به حساب زیر منتقل کنید و سپس شناسه پیگیری انتقال را
                وارد کنید. تأیید پرداخت پس از تطبیق بانکی انجام می‌شود.
              </p>
              <div className={s.row}>
                <span>بانک</span>
                <strong>{data.bank.bankName}</strong>
              </div>
              <div className={s.row}>
                <span>صاحب حساب</span>
                <strong>{data.bank.holderName}</strong>
              </div>
              <div className={s.row}>
                <span>شماره کارت</span>
                <strong className={s.ltr}>{data.bank.cardNumber}</strong>
              </div>
              <div className={s.row}>
                <span>شبا</span>
                <strong className={s.ltr}>{data.bank.iban}</strong>
              </div>
              <form
                className={s.stack}
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit();
                }}
              >
                <Field label="شناسه پیگیری انتقال">
                  <input
                    dir="ltr"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                  />
                </Field>
                <div>
                  <button
                    type="submit"
                    className={s.button}
                    disabled={busy || !reference}
                  >
                    ثبت شناسه پیگیری
                  </button>
                </div>
              </form>
              {(poll || data.transferReference) && (
                <p role="status">
                  در انتظار تطبیق بانکی؛ وضعیت به‌روزرسانی می‌شود.
                </p>
              )}
            </section>
          )}
          {data.returnUrl && (
            <p>
              <a className={s.secondary} href={data.returnUrl}>
                بازگشت به پذیرنده
              </a>
            </p>
          )}
        </>
      )}
    </main>
  );
}
