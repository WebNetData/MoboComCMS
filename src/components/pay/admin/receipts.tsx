"use client";
import { useCallback, useEffect, useState } from "react";
import type { PayReceiptView } from "@/modules/billing/domain/pay";
import { api, json, money, date } from "../client";
import { Badge, Field, ErrorNotice } from "../shared";
import s from "../Pay.module.css";

export default function Receipts() {
  const [rows, setRows] = useState<PayReceiptView[] | null>(null), [error, setError] = useState(""), [notes, setNotes] = useState<Record<number, string>>({}), [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setRows((await api<{ items: PayReceiptView[] }>("/api/admin/mobocom-pay/receipts")).items); setError(""); } catch (e) { setError(e instanceof Error ? e.message : "دریافت رسیدها ناموفق بود"); } }, []);
  useEffect(() => { void load(); }, [load]);
  async function review(id: number, action: "approve" | "reject") { setBusy(true); setError(""); try { await api("/api/admin/mobocom-pay/receipts", json("PATCH", { id, action, note: notes[id] || "" })); await load(); } catch (e) { setError(e instanceof Error ? e.message : "بررسی ناموفق بود"); } finally { setBusy(false); } }
  return <section className={s.stack}><div className={s.sectionHead}><div><h2>رسیدهای مشتریان پذیرندگان</h2><p className={s.muted}>تصویر و شناسه انتقال را با گردش حساب بانک تطبیق دهید. تأیید، مبلغ خالص را به کیف پول پذیرنده اضافه می‌کند.</p></div><button type="button" className={s.secondary} onClick={() => void load()}>به‌روزرسانی رسیدها</button></div><ErrorNotice error={error} />
    {!rows && !error && <p role="status">در حال دریافت رسیدها…</p>}{rows?.length === 0 && <p className={s.notice}>رسیدی برای بررسی ثبت نشده است.</p>}
    {rows?.map(r => <article className={`${s.card} ${s.stack}`} key={r.id}>
      <div className={s.sectionHead}><div><h3>{r.merchantName} · {money(r.totalRial)}</h3><p className={s.muted}>سفارش <bdi>{r.externalId}</bdi> · {date(r.createdAt)}</p></div><Badge value={r.status} /></div>
      <a href={`/api/pay/receipt-image/${r.id}`} target="_blank" rel="noreferrer"><img className={s.receiptImage} src={`/api/pay/receipt-image/${r.id}`} alt={`رسید سفارش ${r.externalId}`} /></a>
      <p>{r.payerName} · شمارهٔ تأییدشده …<bdi>{r.phoneLast4}</bdi> · پیگیری <bdi>{r.trackingCode || "ثبت نشده"}</bdi></p>
      {r.adminNote && <p>{r.adminNote}</p>}
      {r.status === "PENDING" && <><Field label={`توضیح بررسی رسید ${r.id}`}><input value={notes[r.id] || ""} onChange={e => setNotes({ ...notes, [r.id]: e.target.value })} maxLength={300} /></Field><div className={s.actions}><button type="button" className={s.button} disabled={busy} onClick={() => void review(r.id, "approve")}>تأیید وصول وجه</button><button type="button" className={s.secondary} disabled={busy || (notes[r.id] || "").trim().length < 3} onClick={() => void review(r.id, "reject")}>رد رسید با دلیل</button></div></>}
    </article>)}<p className={s.muted}>حداکثر ۱۰۰ رسید اخیر در این نما نمایش داده می‌شود.</p>
  </section>;
}
