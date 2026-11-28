"use client";

import { useEffect, useState } from "react";
import type { PayPeriodAction, PayPeriodView } from "@/modules/billing/domain/pay-financial-period";
import { api, date, json, money } from "../client";
import { ErrorNotice, Field } from "../shared";
import s from "../Pay.module.css";
import layout from "../WorkspaceContent.module.css";

const endpoint = "/api/admin/mobocom-pay/financial-periods";
const calendar = new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeZone: "Asia/Tehran" });
const showDay = (value: string) => calendar.format(new Date(value + "T12:00:00Z"));
const labels: Record<PayPeriodAction, string> = {
  SUBMIT: "ثبت برای بررسی", ASSIGN: "تغییر مسئول", REVIEW: "ثبت نتیجهٔ بررسی",
  CLOSE: "بستن دوره", CORRECT: "ثبت نسخهٔ اصلاحی",
};

export default function FinancialPeriod({ from, to, onSelect }: { from: string; to: string; onSelect: (from: string, to: string) => void }) {
  const [data, setData] = useState<PayPeriodView>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [revision, setRevision] = useState<number>();
  useEffect(() => {
    const controller = new AbortController();
    api<PayPeriodView>(endpoint + "?" + new URLSearchParams({ from, to }), { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setData(result); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "دریافت دوره ناموفق بود"); });
    return () => controller.abort();
  }, [from, to]);
  const period = data?.period;
  const reviewerId = reviewer || String(period?.reviewerId ?? "");

  async function run(action: PayPeriodAction) {
    setBusy(true); setError("");
    try {
      const result = await api<PayPeriodView>(endpoint, json("POST", { from, to, action, note, reviewerId: Number(reviewerId), version: period?.version ?? 0 }));
      setData(result); setNote(""); setReviewer(""); setRevision(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ثبت دوره ناموفق بود");
    } finally { setBusy(false); }
  }

  async function showVersion(version: number) {
    setBusy(true); setError("");
    try {
      setData(await api<PayPeriodView>(endpoint + "?" + new URLSearchParams({ from, to, revision: String(version) })));
      setRevision(version);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "دریافت نسخه ناموفق بود");
    } finally { setBusy(false); }
  }

  const snapshot = data?.selectedSnapshot ?? period?.snapshot;
  return <section className={`${layout.panel} ${s.stack}`} aria-labelledby="pay-period-approval">
    <div className={layout.sectionHead}><div><h2 id="pay-period-approval">بررسی و بستن دورهٔ مالی</h2>
      <p>برای بازهٔ انتخاب‌شده نسخه‌ای ثبت کنید. مسئول تعیین‌شده نتیجهٔ بررسی را ثبت می‌کند و پس از پایان بازه دوره را می‌بندد.</p></div>
      {period && <strong role="status">{period.status === "CLOSED" ? "دوره بسته شده" : "در انتظار بررسی"} · نسخهٔ {period.version.toLocaleString("fa-IR")}</strong>}
    </div>
    <ErrorNotice error={error} />
    {!data && !error && <p role="status">در حال دریافت پروندهٔ دوره…</p>}
    {data && <>
      {data.recent.length > 0 && <Field label="دوره‌های ثبت‌شده">
        <select aria-label="دوره‌های ثبت‌شده" value={period ? from + "/" + to : ""} onChange={event => {
          const row = data.recent.find(item => item.fromDay + "/" + item.toDay === event.target.value);
          if (row) onSelect(row.fromDay, row.toDay);
        }}>
          <option value="">انتخاب دوره</option>
          {data.recent.map(row => <option key={row.fromDay} value={row.fromDay + "/" + row.toDay}>{showDay(row.fromDay)} تا {showDay(row.toDay)} · {row.status === "CLOSED" ? "بسته" : "در انتظار بررسی"}</option>)}
        </select>
      </Field>}
      {period?.status !== "CLOSED" && <Field label="مسئول بررسی">
        <select aria-label="مسئول بررسی" value={reviewerId} disabled={busy} onChange={event => setReviewer(event.target.value)}>
          <option value="">انتخاب کنید</option>
          {period && !data.reviewers.some(person => person.id === period.reviewerId) && <option value={period.reviewerId} disabled>مسئول قبلی در دسترس نیست</option>}
          {data.reviewers.map(person => <option key={person.id} value={person.id}>{person.name || "مدیر"} · {person.id.toLocaleString("fa-IR")}</option>)}
        </select>
      </Field>}
      {period && <Field label={period.status === "CLOSED" ? "دلیل اصلاح" : "نتیجهٔ بررسی یا دلیل بستن دوره"}>
        <textarea value={note} maxLength={500} rows={3} disabled={busy} onChange={event => setNote(event.target.value)} />
      </Field>}
      <div className={s.actions}>
        {!period && <button className={s.button} disabled={busy || !reviewerId} onClick={() => void run("SUBMIT")}>{labels.SUBMIT}</button>}
        {period?.status === "REVIEW" && <>
          <button className={s.secondary} disabled={busy || Number(reviewerId) === period.reviewerId} onClick={() => void run("ASSIGN")}>{labels.ASSIGN}</button>
          <button className={s.button} disabled={busy || note.trim().length < 3} onClick={() => void run("REVIEW")}>{labels.REVIEW}</button>
          <button className={s.secondary} disabled={busy || note.trim().length < 3 || period.history[0]?.action !== "REVIEW"} onClick={() => void run("CLOSE")}>{labels.CLOSE}</button>
        </>}
        {period?.status === "CLOSED" && <button className={s.button} disabled={busy || note.trim().length < 3} onClick={() => void run("CORRECT")}>{labels.CORRECT}</button>}
      </div>
      {snapshot && <section className={s.card} aria-label="نسخهٔ ثبت‌شدهٔ گزارش">
        <h3>نسخهٔ ثبت‌شدهٔ گزارش · {(revision ?? period?.version)?.toLocaleString("fa-IR")}</h3>
        <p>وصول {money(snapshot.totals.receivedRial)} · خالص قرارداد {money(snapshot.totals.netRial)}</p>
        <ul>{snapshot.closing.map(row => <li key={row.currency}><bdi>{row.currency}</bdi> · اعتبار <bdi>{row.credited}</bdi> · تسویه <bdi>{row.paid}</bdi> · اختلاف <bdi>{row.difference}</bdi></li>)}</ul>
      </section>}
      {period && <details><summary>سابقهٔ بررسی و اصلاح</summary>
        <ul>{period.history.map(row => <li key={row.version}>
          <button type="button" className={s.secondary} disabled={busy} onClick={() => void showVersion(row.version)}>نسخهٔ {row.version.toLocaleString("fa-IR")}</button>
          {" "}{labels[row.action as PayPeriodAction]} · {date(row.createdAt)} · شناسهٔ مدیر {row.actorId.toLocaleString("fa-IR")}{row.note && <p>{row.note}</p>}
        </li>)}</ul>
      </details>}
    </>}
  </section>;
}
