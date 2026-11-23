"use client";
import type {
  PayPaymentView,
  PaySettlementView,
} from "@/modules/billing/domain/pay";
import { money, date, labels } from "../client";
import { Field, Badge } from "../shared";
import s from "../Pay.module.css";
export function SettlementSteps({ status }: { status: string }) {
  if (status === "REJECTED")
    return <p className={s.muted}>درخواست رد شده است</p>;
  const current = status === "PAID" ? 2 : status === "APPROVED" ? 1 : 0;
  return (
    <ol className={s.steps} aria-label="مراحل تسویه">
      {["ثبت درخواست", "بررسی", "ثبت پرداخت"].map((label, i) => (
        <li key={label} aria-current={i === current ? "step" : undefined}>
          <span>{i + 1}</span>
          {label}
        </li>
      ))}
    </ol>
  );
}
export function ListControls({
  query,
  setQuery,
  status,
  setStatus,
  setPage,
  kind,
}: {
  query: string;
  setQuery: (x: string) => void;
  status: string;
  setStatus: (x: string) => void;
  page: number;
  setPage: (x: number) => void;
  kind: string;
}) {
  return (
    <div className={`${s.actions} ${s.notice}`}>
      <Field label="جست‌وجو">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
        />
      </Field>
      <Field label="وضعیت">
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">همه</option>
          {(kind === "payments"
            ? ["PENDING", "PAID", "EXPIRED"]
            : ["REQUESTED", "APPROVED", "PAID", "REJECTED"]
          ).map((x) => (
            <option key={x} value={x}>
              {labels[x] || x}
            </option>
          ))}
        </select>
      </Field>
      <a
        className={s.secondary}
        href={`/api/pay/${kind}?format=csv&${new URLSearchParams({ q: query, status })}`}
      >
        دریافت CSV
      </a>
    </div>
  );
}
export function Pager({
  page,
  pages,
  setPage,
}: {
  page: number;
  pages: number;
  setPage: (x: number) => void;
}) {
  return (
    <div className={s.actions}>
      <button
        type="button"
        className={s.secondary}
        disabled={page <= 1}
        onClick={() => setPage(page - 1)}
      >
        قبلی
      </button>
      <span>
        صفحه {page} از {pages}
      </span>
      <button
        type="button"
        className={s.secondary}
        disabled={page >= pages}
        onClick={() => setPage(page + 1)}
      >
        بعدی
      </button>
    </div>
  );
}
export function PaymentTable({ items }: { items: PayPaymentView[] }) {
  return (
    <div
      className={`${s.card} ${s.tableWrap}`}
      role="region"
      aria-label="فهرست پرداخت‌ها"
      tabIndex={0}
    >
      <table className={s.table}>
        <thead>
          <tr>
            <th>سفارش</th>
            <th>پایانه</th>
            <th>مبلغ سفارش</th>
            <th>پرداخت مشتری</th>
            <th>کارمزد</th>
            <th>خالص</th>
            <th>وضعیت</th>
            <th>ثبت</th>
            <th>جزئیات</th>
          </tr>
        </thead>
        <tbody>
          {items.map((x) => (
            <tr key={x.id}>
              <td>{x.externalId}</td>
              <td>{x.terminalName}</td>
              <td>{money(x.amountRial)}</td>
              <td>{money(x.totalRial)}</td>
              <td>{money(x.feeRial)}</td>
              <td>{money(x.netRial)}</td>
              <td>
                <Badge value={x.status} />
              </td>
              <td>{date(x.createdAt)}</td>
              <td>
                <details className={s.details}>
                  <summary>مشاهده جزئیات</summary>
                  <dl>
                    <dt>شناسه پرداخت</dt>
                    <dd className={s.ltr}>{x.id}</dd>
                    <dt>کارمزد بر عهده</dt>
                    <dd>{x.feeBearer === 'CUSTOMER' ? 'مشتری' : 'پذیرنده'}</dd>
                    <dt>شناسه پیگیری انتقال</dt>
                    <dd className={s.ltr}>{x.transferReference || "—"}</dd>
                    <dt>زمان ثبت</dt>
                    <dd>{date(x.createdAt)}</dd>
                    <dt>زمان پرداخت</dt>
                    <dd>{x.paidAt ? date(x.paidAt) : "—"}</dd>
                  </dl>
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!items.length && <p>موردی یافت نشد.</p>}
    </div>
  );
}
export function SettlementTable({ items }: { items: PaySettlementView[] }) {
  return (
    <div
      className={`${s.card} ${s.tableWrap}`}
      role="region"
      aria-label="فهرست تسویه‌ها"
      tabIndex={0}
    >
      <table className={s.table}>
        <thead>
          <tr>
            <th>مبلغ</th>
            <th>کارمزد</th>
            <th>دریافتی</th>
            <th>وضعیت</th>
            <th>تاریخ</th>
            <th>جزئیات</th>
          </tr>
        </thead>
        <tbody>
          {items.map((x) => (
            <tr key={x.id}>
              <td>{money(x.amountRial)}</td>
              <td>{money(x.feeRial)}</td>
              <td>
                {x.payoutAmount} {x.asset} · {x.network}
              </td>
              <td>
                <Badge value={x.status} />
              </td>
              <td>{date(x.createdAt)}</td>
              <td>
                <details className={s.details}>
                  <summary>مشاهده جزئیات</summary>
                  <dl>
                    <dt>شناسه تسویه</dt>
                    <dd className={s.ltr}>{x.id}</dd>
                    <dt>دارایی و شبکه</dt>
                    <dd>
                      {x.asset} · {x.network}
                    </dd>
                    <dt>مقصد</dt>
                    <dd className={s.ltr}>{x.destination}</dd>
                    <dt>شناسه انتقال</dt>
                    <dd className={s.ltr}>{x.reference || "—"}</dd>
                    <dt>دلیل رد</dt>
                    <dd>{x.reason || "—"}</dd>
                    <dt>آخرین تغییر</dt>
                    <dd>{date(x.updatedAt)}</dd>
                  </dl>
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!items.length && <p>موردی یافت نشد.</p>}
    </div>
  );
}
