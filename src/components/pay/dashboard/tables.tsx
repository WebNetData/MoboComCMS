"use client";
import Link from "@/components/AppLink";
import type {
  PayPaymentView,
  PaySettlementView,
} from "@/modules/billing/domain/pay";
import { money, date, labels } from "../client";
import { Field, Badge } from "../shared";
import s from "../Pay.module.css";
import ledger from "./PaymentLedger.module.css";
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
 ? ["PENDING", "UNDER_REVIEW", "PAID", "EXPIRED"]
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
const confirmationMethods = { NONE: "تأیید نشده", AUTO: "خودکار", MANUAL: "دستی", BANK: "بانک", PROVIDER: "ارائه‌دهنده" } as const;
const confirmationSources = { "": "ثبت نشده", SMS: "پیامک", BALE: "بله", BANK: "بانک", STAFF: "کارشناس", PROVIDER: "ارائه‌دهنده" } as const;

export function PaymentTable({ items }: { items: PayPaymentView[] }) {
  return (
    <div className={`${s.card} ${s.tableWrap} ${ledger.ledger}`} role="region" aria-label="فهرست پرداخت‌ها" tabIndex={0}>
      <table className={`${s.table} ${ledger.table}`} role="table">
        <thead role="rowgroup"><tr role="row"><th role="columnheader">سفارش</th><th role="columnheader">پایانه</th><th role="columnheader">مبلغ سفارش</th><th role="columnheader">پرداخت مشتری</th><th role="columnheader">کارمزد پلتفرم</th><th role="columnheader">معادل ریالی اعتبار</th><th role="columnheader">وضعیت</th><th role="columnheader">ثبت</th><th role="columnheader">جزئیات</th></tr></thead>
        <tbody role="rowgroup">
          {items.map((x) => (
            <tr key={x.id} role="row">
              <td role="cell" data-label="سفارش"><bdi>{x.externalId}</bdi></td>
              <td role="cell" data-label="پایانه">{x.terminalName}</td>
              <td role="cell" data-label="مبلغ سفارش">{money(x.amountRial)}</td>
              <td role="cell" data-label="پرداخت مشتری">{money(x.customerAmountRial ?? x.totalRial)}</td>
              <td role="cell" data-label="کارمزد پلتفرم">{money(x.platformFeeRial ?? x.feeRial)}{x.status !== "PAID" && <small className={ledger.hint}>برآورد</small>}</td>
              <td role="cell" data-label="معادل ریالی اعتبار" className={ledger.net}>{money(x.creditRial ?? x.netRial)}</td>
              <td role="cell" data-label="وضعیت"><Badge value={x.status} /></td>
              <td role="cell" data-label="ثبت">{date(x.createdAt)}</td>
              <td role="cell" data-label="جزئیات">
                <details className={`${s.details} ${ledger.details}`}>
                  <summary>مشاهده جزئیات</summary>
                  <dl>
                    <dt>شناسه پرداخت</dt><dd className={s.ltr}>{x.id}</dd>
                    <dt>صفحهٔ مشتری</dt><dd><Link href={x.checkoutUrl}>مشاهده لینک پرداخت</Link></dd>
                    {x.confirmation && <><dt>روش تأیید پرداخت</dt><dd>{confirmationMethods[x.confirmation.method]}</dd><dt>منبع تأیید</dt><dd>{confirmationSources[x.confirmation.source]}</dd></>}
                    <dt>کارمزد قرارداد پرداخت</dt><dd>{money(x.feeRial)}</dd>
                    {x.settledServiceFeeRial != null && <><dt>کارمزد خدمت وصول‌شده</dt><dd>{money(x.settledServiceFeeRial)}</dd></>}
                    {x.platformFeeRial != null && <><dt>مجموع کارمزد پلتفرم{x.status !== "PAID" ? " (برآورد)" : ""}</dt><dd>{money(x.platformFeeRial)}</dd></>}
                    <dt>معادل ریالی اعتبار پذیرنده</dt><dd>{money(x.creditRial ?? x.netRial)}</dd>
                    {x.creditAmount && <><dt>اعتبار پذیرنده</dt><dd><bdi>{x.creditAmount} {x.creditCurrency}</bdi></dd></>}
                    <dt>کارمزد بر عهده</dt><dd>{x.feeBearer === "CUSTOMER" ? "مشتری" : "پذیرنده"}</dd>
                    {x.gatewayCollectionStatus && <><dt>هزینهٔ خدمت درگاه</dt><dd>{money(x.gatewayAdjustmentRial || "0")}</dd><dt>مبلغ درخواستی واریز</dt><dd>{money(x.gatewayCollectedRial || x.totalRial)}</dd></>}
                    <dt>شناسه پیگیری انتقال</dt><dd className={s.ltr}>{x.transferReference || "—"}</dd>
                    <dt>زمان ثبت</dt><dd>{date(x.createdAt)}</dd>
                    <dt>زمان پرداخت</dt><dd>{x.paidAt ? date(x.paidAt) : "—"}</dd>
                  </dl>
                  <p className={ledger.explanation}>کارمزد پلتفرم در اعتبار پذیرنده لحاظ نمی‌شود</p>
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!items.length && <p className={ledger.empty}>پرداختی با این شرایط یافت نشد</p>}
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
              <td>{money(x.amountRial)}{x.sourceAmount && <small className={s.tableSub}><bdi>{x.sourceAmount} {x.sourceCurrency}</bdi> · مبدأ</small>}</td>
              <td>{money(x.feeRial)}{x.feeAmount && <small className={s.tableSub}><bdi>{x.feeAmount} {x.feeCurrency}</bdi></small>}</td>
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
