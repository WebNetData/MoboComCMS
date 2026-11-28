"use client";

import { useEffect, useState, type FormEvent } from "react";
import JalaliDateInput from "@/components/date/JalaliDateInput";
import Icon from "@/components/site/Icon";
import type { PayFinancialReport, PayReportDay } from "@/modules/billing/domain/pay-report";
import { api, money } from "./client";
import { Badge, ErrorNotice, Field } from "./shared";
import s from "./Pay.module.css";
import layout from "./WorkspaceContent.module.css";
import styles from "./FinancialReport.module.css";

const localDate = new Intl.DateTimeFormat("fa-IR", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
const showDay = (day: string) => localDate.format(new Date(day + "T12:00:00Z"));
const formatCount = (count: number) => count.toLocaleString("fa-IR");
const columns = [
  ["receivedRial", "وصول وجه"],
  ["platformFeeRial", "کارمزد درگاه"],
  ["bankServiceFeeRial", "هزینهٔ تطبیق بانکی"],
  ["roundingRial", "اختلاف گرد کردن"],
  ["creditedRial", "اعتبار ریالی"],
  ["creditedUsdt", "اعتبار تتری"],
] as const;
type Result = { key: number; report: PayFinancialReport } | { key: number; error: string };

function Breakdown({ report }: { report: PayFinancialReport }) {
  const [chosen, setChosen] = useState("");
  const maximum = report.days.reduce((max, day) => BigInt(day.receivedRial) > max ? BigInt(day.receivedRial) : max, 0n);
  const selected = report.days.find(day => day.date === chosen) ?? report.days.filter(day => day.paidCount > 0).at(-1) ?? report.days.at(-1);
  const display = (row: Omit<PayReportDay, "date">, field: (typeof columns)[number][0]) =>
    field === "creditedUsdt" ? <bdi dir="ltr">{row.creditedUsdt} USDT</bdi> : <bdi>{money(row[field])}</bdi>;
  return <>
    <section className={`${layout.panel} ${styles.flow}`} aria-labelledby="pay-report-summary">
      <div className={layout.sectionHead}><div><h2 id="pay-report-summary">خلاصهٔ وصول وجه</h2><p>{showDay(report.from)} تا {showDay(report.to)} · {formatCount(report.totals.paidCount)} پرداخت تأییدشده</p></div><Icon name="chart" size={24} /></div>
      <dl className={styles.totals}>
        {columns.map(([field, name]) => <div key={field}><dt>{name}</dt><dd>{display(report.totals, field)}</dd></div>)}
      </dl>
    </section>
    <section className={layout.panel} aria-labelledby="pay-report-trend">
      <div className={layout.sectionHead}>
        <div><h2 id="pay-report-trend">روند روزانهٔ وصول</h2><p>تاریخ تأیید پرداخت به وقت تهران</p></div>
        {selected && <Field label="روز گزارش"><select value={selected.date} onChange={event => setChosen(event.target.value)}>{report.days.map(day => <option key={day.date} value={day.date}>{showDay(day.date)}</option>)}</select></Field>}
      </div>
      {selected && <p className={styles.selectedDay} aria-live="polite"><strong>{money(selected.receivedRial)}</strong><span>{showDay(selected.date)} · {formatCount(selected.paidCount)} پرداخت</span></p>}
      {maximum > 0n ? <div className={styles.chart} aria-hidden="true" dir="ltr">
        {report.days.map(day => <meter key={day.date} data-selected={selected?.date === day.date || undefined} min={0} max={10000} value={Number(BigInt(day.receivedRial) * 10000n / maximum)} />)}
      </div> : <p className={styles.empty}>در این بازه وصول تأییدشده‌ای ثبت نشده است.</p>}
    </section>
    <section className={layout.panel} aria-labelledby="pay-report-days">
      <div className={layout.sectionHead}><div><h2 id="pay-report-days">جزئیات روزانه</h2><p>اعتبار کیف پول و هزینه‌ها در ستون‌های جداگانه آمده‌اند.</p></div></div>
      <div className={`${s.tableWrap} ${styles.table}`} role="region" tabIndex={0} aria-label="جدول جزئیات روزانه">
        <table className={s.table}><thead><tr><th scope="col">روز</th><th scope="col">پرداخت</th>{columns.map(([field, name]) => <th scope="col" key={field}>{name}</th>)}</tr></thead>
          <tbody>{report.days.map(row => <tr key={row.date}><th scope="row">{showDay(row.date)}</th><td>{formatCount(row.paidCount)}</td>{columns.map(([field]) => <td key={field}>{display(row, field)}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </section>
  </>;
}

export default function FinancialReport({ area }: { area: "admin" | "merchant" }) {
  const endpoint = area === "admin" ? "/api/admin/mobocom-pay/reports" : "/api/pay/reports";
  const [request, setRequest] = useState({ key: 0, from: "", to: "" });
  const [result, setResult] = useState<Result>();
  const [draft, setDraft] = useState<{ from?: string; to?: string }>({});
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ from: request.from, to: request.to });
    api<PayFinancialReport>(endpoint + "?" + query, { signal: controller.signal })
      .then(report => { if (!controller.signal.aborted) setResult({ key: request.key, report }); })
      .catch(error => {
        if (!controller.signal.aborted) setResult({ key: request.key, error: error instanceof Error ? error.message : "دریافت گزارش ناموفق بود" });
      });
    return () => controller.abort();
  }, [endpoint, request]);

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setRequest(previous => ({ key: previous.key + 1, from: String(fields.get("from") ?? ""), to: String(fields.get("to") ?? "") }));
  }

  const current = result?.key === request.key ? result : undefined;
  const lastReport = result && "report" in result ? result.report : undefined;
  const report = current && "report" in current ? current.report : undefined;
  const exportQuery = report ? new URLSearchParams({ from: report.from, to: report.to, format: "csv" }) : undefined;
  return (
    <div className={layout.workspace}>
      <section className={`${layout.panel} ${styles.control}`} aria-labelledby="pay-report-period">
        <div className={layout.sectionHead}><div><h2 id="pay-report-period">بازهٔ گزارش مالی</h2><p>تقویم شمسی · حداکثر ۹۰ روز · بر مبنای ساعت تهران</p></div></div>
        <form className={layout.filterForm} onSubmit={apply}>
          <Field label="از تاریخ">
            <JalaliDateInput aria-label="از تاریخ" name="from" value={draft.from ?? lastReport?.from ?? request.from} onChange={from => setDraft(previous => ({ ...previous, from }))} required />
          </Field>
          <Field label="تا تاریخ">
            <JalaliDateInput aria-label="تا تاریخ" name="to" value={draft.to ?? lastReport?.to ?? request.to} onChange={to => setDraft(previous => ({ ...previous, to }))} required />
          </Field>
          <div className={s.actions}><button className={`${s.button} ${layout.primaryAction}`} type="submit">اعمال بازه</button></div>
        </form>
        {exportQuery && <div className={styles.exports}>
          <a className={layout.guideLink} href={endpoint + "?" + exportQuery} download><Icon name="download" size={18} /> CSV وصول روزانه</a>
          <a className={layout.guideLink} href={endpoint + "?" + exportQuery + "&section=settlements"} download><Icon name="download" size={18} /> CSV تسویه‌ها</a>
        </div>}
      </section>
      {!current && <p className={styles.empty} role="status">در حال دریافت گزارش…</p>}
      {current && "error" in current && <ErrorNotice error={current.error} />}
      {report && <>
        <Breakdown key={report.from + report.to} report={report} />
        <section className={layout.panel} aria-labelledby="pay-report-settlements">
          <div className={layout.sectionHead}><div><h2 id="pay-report-settlements">درخواست‌های تسویه</h2><p>درخواست‌های ثبت‌شده در همین بازه، با وضعیت فعلی و مبلغ از موجودی مبدأ</p></div><Icon name="bank" size={23} /></div>
          {report.settlements.length > 0 ? <div className={`${s.tableWrap} ${styles.table}`} role="region" tabIndex={0} aria-label="گزارش درخواست‌های تسویه">
            <table className={s.table}><thead><tr><th scope="col">وضعیت</th><th scope="col">تعداد</th><th scope="col">مبلغ مبدأ</th></tr></thead><tbody>
              {report.settlements.map(row => <tr key={row.currency + row.status}><td><Badge value={row.status} /></td><td>{formatCount(row.count)}</td><td><bdi>{row.currency === "IRR" ? money(row.sourceAmount) : row.sourceAmount + " USDT"}</bdi></td></tr>)}
            </tbody></table>
          </div> : <p className={styles.empty}>در این بازه درخواست تسویه‌ای ثبت نشده است.</p>}
        </section>
      </>}
      {area === "merchant" && <section className={layout.panel} aria-labelledby="pay-report-exports">
        <div className={layout.sectionHead}><div><h2 id="pay-report-exports">خروجی ردیف‌های پرداخت و تسویه</h2><p>این فایل‌ها مستقل از بازهٔ بالا هستند و هر فایل تا ۱۰۰۰ ردیف دارد.</p></div></div>
        <div className={layout.guideIndex}><a className={layout.guideLink} href="/api/pay/payments?format=csv" download>CSV فهرست پرداخت‌ها</a><a className={layout.guideLink} href="/api/pay/settlements?format=csv" download>CSV فهرست تسویه‌ها</a></div>
      </section>}
    </div>
  );
}
