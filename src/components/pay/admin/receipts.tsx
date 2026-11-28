"use client";
import DeskHeader from './desk-header'
import { useCallback, useEffect, useState } from "react";
import type { PayReceiptView } from "@/modules/billing/domain/pay";
import { api, json, money, date } from "../client";
import { Badge, Field, ErrorNotice } from "../shared";
import s from "../Pay.module.css";
import styles from "./Receipts.module.css";
import StatementImport from "./statement-preview";
import type { StatementPreview } from "@/modules/billing/domain/pay-statement";

const methodLabels = { NONE: "تأیید نشده", AUTO: "خودکار", MANUAL: "دستی", BANK: "بانک", PROVIDER: "ارائه‌دهنده" } as const;
const sourceLabels = { "": "ثبت نشده", SMS: "پیامک", BALE: "بله", BANK: "بانک", STAFF: "کارشناس", PROVIDER: "ارائه‌دهنده" } as const;

type ReviewResult = { status: string; alreadyPaid: boolean; confirmation: PayReceiptView["confirmation"]; message: string };

export default function Receipts() {
  const [rows, setRows] = useState<PayReceiptView[] | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [trackingCodes, setTrackingCodes] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("ALL");
  const [statement, setStatement] = useState<StatementPreview | null>(null);
  const [matchedRows, setMatchedRows] = useState<PayReceiptView[]>([]);
  const load = useCallback(async (result?: StatementPreview | null) => {
    try {
      const ids = result?.suggestions.map(item => item.receiptId).join(",");
      const endpoint = "/api/admin/mobocom-pay/receipts";
      const [recent, matched] = await Promise.all([
        api<{ items: PayReceiptView[] }>(endpoint),
        ids ? api<{ items: PayReceiptView[] }>(endpoint + "?" + new URLSearchParams({ ids })) : null,
      ]);
      setRows(recent.items);
      setMatchedRows(matched?.items ?? []);
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "دریافت رسیدها ناموفق بود"); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function review(id: number, action: "approve" | "reject") {
    const receipt = (filter === "STATEMENT" ? matchedRows : rows)?.find(row => row.id === id);
    if (action === "approve" && receipt && receipt.paymentStatus !== "PAID" && !receipt.trackingCode && !(trackingCodes[id] || "").trim()) {
      setError("برای تأیید وصول، شناسه پیگیری انتقال را وارد کنید");
      return;
    }
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await api<ReviewResult>("/api/admin/mobocom-pay/receipts", json("PATCH", { id, action, note: notes[id] || "", trackingCode: (trackingCodes[id] || "").trim() || undefined }));
      setMessage(result.message);
      await load(statement);
    } catch (e) { setError(e instanceof Error ? e.message : "بررسی ناموفق بود"); }
    finally { setBusy(false); }
  }
  const proposals = new Map(statement?.suggestions.map(item => [item.receiptId, item.entry]));
  const visible = filter === "STATEMENT" ? matchedRows.filter(r => r.status === "PENDING" && proposals.has(r.id)) : rows?.filter(r => filter === "ALL" || r.status === filter);
  return <section className={`${s.stack} ${styles.queue}`}>
    <DeskHeader icon="receipt" title="صف رسیدهای مشتریان" description="تصویر و شناسهٔ انتقال را با گردش حساب بانک تطبیق دهید.">
      <button type="button" className={s.secondary} disabled={busy} onClick={() => void load(statement)}>به‌روزرسانی رسیدها</button>
    </DeskHeader>
    <ErrorNotice error={error} />
    <StatementImport result={statement} onResult={result => { setStatement(result); setMatchedRows([]); setFilter(result ? "STATEMENT" : "ALL"); if (result) void load(result); }} />
    {message && <p className={styles.result} role="status">{message}</p>}
    {!rows && !error && <p role="status">در حال دریافت رسیدها…</p>}
    {rows && <>
      <div className={styles.summary} aria-label="خلاصه رسیدهای این نما">
        <div><span>رسیدهای نمایش‌داده‌شده</span><strong>{rows.length.toLocaleString("fa-IR")}</strong></div>
        <div><span>در انتظار بررسی</span><strong>{rows.filter(r => r.status === "PENDING").length.toLocaleString("fa-IR")}</strong></div>
        <div><span>بررسی‌شده</span><strong>{rows.filter(r => r.status !== "PENDING").length.toLocaleString("fa-IR")}</strong></div>
      </div>
      <div className={styles.filter}><Field label="وضعیت رسید"><select value={filter} onChange={e => setFilter(e.target.value)}><option value="ALL">همه رسیدها</option><option value="PENDING">در انتظار بررسی</option><option value="APPROVED">تأیید شده</option><option value="REJECTED">رد شده</option>{statement && <option value="STATEMENT">پیشنهادهای گردش حساب</option>}</select></Field><span>{visible?.length.toLocaleString("fa-IR")} رسید</span></div>
      {visible?.length === 0 && <p className={styles.empty}>رسیدی با این وضعیت یافت نشد.</p>}
      {visible?.map(r => {
        const alreadyPaid = r.paymentStatus === "PAID";
        const proposal = r.status === "PENDING" && !alreadyPaid ? proposals.get(r.id) : null;
        return <article className={`${s.card} ${styles.receipt}`} key={r.id}>
          <div className={`${s.sectionHead} ${styles.receiptHead}`}><div><h3>{r.merchantName}</h3><p className={s.muted}>سفارش <bdi>{r.externalId}</bdi> · {date(r.createdAt)}</p></div><Badge value={r.status} /></div>
          {alreadyPaid && <p className={styles.paidNotice}>این پرداخت قبلاً {r.confirmation?.method === "AUTO" ? "به‌صورت خودکار " : ""}تأیید شده است. تأیید رسید فقط بررسی آن را ثبت می‌کند و اعتبار دوباره‌ای ایجاد نمی‌کند.</p>}
          {proposal && <div className={`${s.notice} ${styles.statementMatch}`}>
            <strong>پیشنهاد از گردش حساب</strong>
            <dl className={styles.facts}><div><dt>مبلغ واریز</dt><dd>{money(proposal.amountRial)}</dd></div><div><dt>زمان واریز</dt><dd>{date(proposal.at)}</dd></div><div><dt>شناسهٔ بانکی</dt><dd><bdi>{proposal.reference}</bdi></dd></div></dl>
            {!r.trackingCode && <button className={s.secondary} type="button" onClick={() => setTrackingCodes(current => ({ ...current, [r.id]: proposal.reference }))}>انتقال شناسه به فرم تأیید</button>}
          </div>}
          <div className={styles.body}>
            <a className={styles.imageLink} href={`/api/pay/receipt-image/${r.id}`} target="_blank" rel="noreferrer"><img className={s.receiptImage} loading="lazy" src={`/api/pay/receipt-image/${r.id}`} alt={`رسید سفارش ${r.externalId}`} /><span>مشاهده تصویر در اندازه اصلی (پنجره جدید)</span></a>
            <div className={styles.details}>
              <dl className={styles.facts}><div><dt>{alreadyPaid ? "مبلغ وصول‌شده" : "مبلغ درخواست پرداخت"}</dt><dd>{money(r.totalRial)}</dd></div>{r.reportedRial != null && <div><dt>مبلغ ثبت‌شده همراه رسید</dt><dd>{money(r.reportedRial)}</dd></div>}{r.feeRial != null && <div><dt>کارمزد قرارداد پرداخت</dt><dd>{money(r.feeRial)}</dd></div>}{r.netRial != null && <div><dt>خالص پذیرنده</dt><dd>{money(r.netRial)}</dd></div>}{r.platformFeeRial != null && <div><dt>کارمزد پلتفرم{!alreadyPaid ? " (برآورد)" : ""}</dt><dd>{money(r.platformFeeRial)}</dd></div>}{r.creditAmount != null && <div><dt>اعتبار پذیرنده</dt><dd><bdi>{r.creditAmount} {r.creditCurrency}</bdi></dd></div>}</dl>
              {r.platformFeeRial != null && <p className={styles.caption}>کارمزد پلتفرم در خالص اعتبار پذیرنده لحاظ نمی‌شود</p>}
              <dl className={styles.facts}><div><dt>پرداخت‌کننده</dt><dd>{r.payerName}</dd></div><div><dt>شماره تأییدشده</dt><dd>…<bdi>{r.phoneLast4}</bdi></dd></div><div><dt>شناسه پیگیری</dt><dd><bdi>{r.trackingCode || "ثبت نشده"}</bdi></dd></div>{r.confirmation && <><div><dt>روش تأیید پرداخت</dt><dd>{methodLabels[r.confirmation.method]}</dd></div><div><dt>منبع تأیید</dt><dd>{sourceLabels[r.confirmation.source]}</dd></div></>}</dl>
              {r.adminNote && <p className={styles.caption}>توضیح بررسی: {r.adminNote}</p>}
            </div>
          </div>
          {r.status === "PENDING" && <div className={styles.review}><h4>ثبت نتیجهٔ بررسی</h4>{!r.trackingCode && !alreadyPaid && <Field label={`شناسه پیگیری انتقال برای رسید ${r.id} (برای تأیید الزامی)`}><input value={trackingCodes[r.id] || ""} onChange={e => setTrackingCodes({ ...trackingCodes, [r.id]: e.target.value })} dir="auto" /></Field>}<Field label={`توضیح بررسی رسید ${r.id}`}><input value={notes[r.id] || ""} onChange={e => setNotes({ ...notes, [r.id]: e.target.value })} maxLength={300} /></Field><div className={s.actions}><button type="button" className={s.button} disabled={busy} onClick={() => void review(r.id, "approve")}>{alreadyPaid ? "ثبت بررسی رسید" : "تأیید وصول وجه"}</button><button type="button" className={s.secondary} disabled={busy || alreadyPaid || (notes[r.id] || "").trim().length < 3} onClick={() => void review(r.id, "reject")}>رد رسید با دلیل</button></div></div>}
        </article>;
      })}
      {filter !== "STATEMENT" && <p className={s.muted}>حداکثر ۱۰۰ رسید اخیر در این نما نمایش داده می‌شود</p>}
    </>}
  </section>;
}
