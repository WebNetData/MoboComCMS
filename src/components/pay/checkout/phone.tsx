"use client";
import { useEffect, useState } from "react";
import { useHumanCheck } from "@/components/HumanCheck";
import { api, json } from "../client";
import { Field, ErrorNotice } from "../shared";
import s from "../Pay.module.css";

export default function PhoneVerification({ id, onVerified }: { id: string; onVerified: () => void }) {
  const [phone, setPhone] = useState(""), [code, setCode] = useState(""), [sent, setSent] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState(""), [wait, setWait] = useState(0);
  const human = useHumanCheck("login");
  useEffect(() => { if (!wait) return; const timer = setTimeout(() => setWait(x => Math.max(0, x - 1)), 1000); return () => clearTimeout(timer); }, [wait]);
  async function send() {
    setBusy(true); setError("");
    try { const r = await api<{ resendIn: number; notice?: string }>(`/api/pay/checkout/${id}/otp`, json("POST", { phone, humanToken: human.token })); setSent(true); setWait(r.resendIn); setNotice(r.notice || "کد تأیید برای شماره شما ارسال شد."); }
    catch (e) { setError(e instanceof Error ? e.message : "ارسال کد ناموفق بود"); }
    finally { setBusy(false); human.reset(); }
  }
  async function verify() {
    setBusy(true); setError("");
    try { await api(`/api/pay/checkout/${id}/otp`, json("PUT", { phone, code })); setCode(""); onVerified(); }
    catch (e) { setError(e instanceof Error ? e.message : "کد معتبر نیست"); } finally { setBusy(false); }
  }
  return <section className={`${s.card} ${s.stack}`}>
    <h2>تأیید شمارهٔ موبایل</h2><p className={s.muted}>برای ادامه پرداخت، شماره‌ای را وارد کنید که به آن دسترسی دارید. این مرحله مالکیت شماره را بررسی می‌کند.</p>
    <ErrorNotice error={error} />{notice && <p role="status">{notice}</p>}
    <form className={s.stack} onSubmit={e => { e.preventDefault(); void (sent ? verify() : send()); }}>
      <Field label="شمارهٔ موبایل"><input type="tel" inputMode="tel" autoComplete="tel" dir="ltr" required value={phone} readOnly={sent} onChange={e => setPhone(e.target.value)} /></Field>
      {sent && <Field label="کد تأیید"><input inputMode="numeric" autoComplete="one-time-code" dir="ltr" required value={code} onChange={e => setCode(e.target.value)} maxLength={6} /></Field>}
      {!sent && human.widget}
      <div className={s.actions}><button type="submit" className={s.button} disabled={busy || !phone || (!sent && !human.token) || (sent && !code)}>{busy ? "در حال بررسی…" : sent ? "تأیید و ادامه پرداخت" : "ارسال کد تأیید"}</button>
        {sent && <button className={s.secondary} type="button" disabled={busy || wait > 0} onClick={() => { setSent(false); setCode(""); setNotice(""); }}>{wait > 0 ? `ارسال دوباره تا ${wait} ثانیه` : "تغییر شماره یا ارسال دوباره"}</button>}</div>
    </form>
  </section>;
}
