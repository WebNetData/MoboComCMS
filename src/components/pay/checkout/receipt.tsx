"use client";
import { useState } from "react";
import { api } from "../client";
import { Field, ErrorNotice } from "../shared";
import s from "../Pay.module.css";

export default function ReceiptForm({ id, refresh }: { id: string; refresh: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <form className={s.stack} onSubmit={async e => {
    e.preventDefault(); const form = e.currentTarget, body = new FormData(form); setBusy(true); setError("");
    try { await api(`/api/pay/checkout/${id}/receipt`, { method: "POST", body }); form.reset(); refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "ارسال رسید ناموفق بود"); } finally { setBusy(false); }
  }}>
    <h3>ارسال رسید پرداخت</h3><ErrorNotice error={error} />
    <Field label="نام پرداخت‌کننده"><input name="payerName" required maxLength={100} autoComplete="name" /></Field>
    <Field label="روش انتقال"><select name="method"><option value="CARD">کارت به کارت</option><option value="PAYA">پایا</option><option value="SATNA">ساتنا</option><option value="ACCOUNT">حساب به حساب</option></select></Field>
    <Field label="بانک مبدأ"><input name="payerBank" maxLength={80} /></Field>
    <Field label="چهار رقم آخر کارت مبدأ"><input name="payerCard" maxLength={4} inputMode="numeric" dir="ltr" /></Field>
    <Field label="شناسه پیگیری انتقال"><input name="trackingCode" required maxLength={64} dir="ltr" /></Field>
    <Field label="تصویر رسید (PNG، JPEG یا WebP؛ تا ۶ مگابایت)"><input name="image" type="file" accept="image/png,image/jpeg,image/webp" required /></Field>
    <div><button type="submit" className={s.button} disabled={busy}>{busy ? "در حال ارسال…" : "ارسال رسید برای بررسی"}</button></div>
  </form>;
}
