"use client";

import { useEffect, useState, type FormEvent } from "react";
import workbench from './OperationsWorkbench.module.css'
import type { PayPaymentView } from "@/modules/billing/domain/pay";
import { api, labels } from "../client";
import { ErrorNotice, Field } from "../shared";
import { Pager, PaymentTable } from "../dashboard/tables";
import s from "../Pay.module.css";
import layout from "../WorkspaceContent.module.css";

type PaymentPage = { items: PayPaymentView[]; page: number; pages: number; total: number };
type Result = { request: string; data: PaymentPage } | { request: string; error: string };
const defaultFilters = { q: "", status: "", page: 1 };

export default function PaymentDesk() {
  const [filters, setFilters] = useState(defaultFilters);
  const [result, setResult] = useState<Result>();
  const [refresh, setRefresh] = useState(0);
  const query = new URLSearchParams({ q: filters.q, status: filters.status, page: String(filters.page) }).toString();
  const request = query + "#" + refresh;

  useEffect(() => {
    const controller = new AbortController();
    api<PaymentPage>("/api/admin/mobocom-pay/payments?" + query, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setResult({ request, data }); })
      .catch(error => {
        if (!controller.signal.aborted) setResult({ request, error: error instanceof Error ? error.message : "دریافت پرداخت‌ها ناموفق بود" });
      });
    return () => controller.abort();
  }, [query, request]);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setFilters({ q: String(values.get("q") ?? "").trim(), status: String(values.get("status") ?? ""), page: 1 });
    setRefresh(value => value + 1);
  }

  const current = result?.request === request ? result : undefined;
  return (
    <div className={layout.workspace}>
      <section className={layout.panel} aria-labelledby="admin-payment-search">
        <div className={layout.sectionHead}>
          <div><h2 id="admin-payment-search">جست‌وجوی پرداخت‌ها</h2><p>با شناسهٔ پرداخت، شناسهٔ سفارش یا نام پذیرنده جست‌وجو کنید.</p></div>
        </div>
        <form className={layout.filterForm} onSubmit={search} onReset={() => setFilters(defaultFilters)}>
          <Field label="شناسه یا نام پذیرنده"><input name="q" maxLength={100} dir="auto" /></Field>
          <Field label="وضعیت"><select name="status"><option value="">همهٔ وضعیت‌ها</option>{["PENDING", "UNDER_REVIEW", "PAID", "EXPIRED"].map(value => <option key={value} value={value}>{labels[value]}</option>)}<option value="BOT_ATTENTION">پرداخت‌شده، تحویل ربات نیازمند پیگیری</option></select></Field>
          <div className={s.actions}><button className={`${s.button} ${layout.primaryAction}`} type="submit">جست‌وجو</button><button className={s.secondary} type="reset">پاک‌کردن فیلترها</button></div>
        </form>
      </section>
      <div className={workbench.resultPanel} aria-busy={!current}>
        {!current && <p role="status">در حال دریافت پرداخت‌ها…</p>}
        {current && "error" in current && <><ErrorNotice error={current.error} /><button type="button" className={s.secondary} onClick={() => setRefresh(value => value + 1)}>تلاش دوباره</button></>}
        {current && "data" in current && <>
          <p role="status">{current.data.total.toLocaleString("fa-IR")} پرداخت یافت شد.</p>
          <PaymentTable items={current.data.items} adminReceipts />
          {current.data.pages > 1 && <Pager page={current.data.page} pages={current.data.pages} setPage={page => setFilters(previous => ({ ...previous, page }))} />}
        </>}
      </div>
    </div>
  );
}
