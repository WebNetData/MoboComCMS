"use client";
import Link from "@/components/AppLink";
import { Fragment, useState, type ReactNode } from "react";
import type {
  PayPaymentView,
  PaySettlementView,
} from "@/modules/billing/domain/pay";
import { money, date, labels } from "../client";
import { Field, Badge } from "../shared";
import s from "../Pay.module.css";
import m from "./Dashboard.module.css";
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
    <div className={`${s.actions} ${s.notice} ${m.filters}`}>
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
    <div className={`${s.actions} ${m.pagination}`}>
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

function PaymentFact({ label, children }: { label: string; children: ReactNode }) {
  return <div><dt>{label}</dt><dd>{children}</dd></div>;
}

export function PaymentTable({ items, adminReceipts = false }: { items: PayPaymentView[]; adminReceipts?: boolean }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <div className={`${s.card} ${s.tableWrap} ${ledger.ledger}`} role="region" aria-label="فهرست پرداخت‌ها" tabIndex={0}>
      <table className={`${s.table} ${ledger.table} ${ledger.paymentTable}`} role="table">
        <thead role="rowgroup"><tr role="row"><th role="columnheader">سفارش</th><th role="columnheader">پایانه</th><th role="columnheader">مبلغ سفارش</th><th role="columnheader">پرداخت مشتری</th><th role="columnheader">کارمزد پلتفرم</th><th role="columnheader">معادل ریالی اعتبار</th><th role="columnheader">وضعیت</th><th role="columnheader">ثبت</th><th role="columnheader">جزئیات</th></tr></thead>
        <tbody role="rowgroup">
          {items.map((x) => (
            <Fragment key={x.id}>
            <tr role="row">
              <td role="cell" data-label="سفارش"><bdi>{x.externalId}</bdi></td>
              <td role="cell" data-label="پایانه">{x.terminalName}</td>
              <td role="cell" data-label="مبلغ سفارش">{money(x.amountRial)}</td>
              <td role="cell" data-label="پرداخت مشتری">{money(x.customerAmountRial ?? x.totalRial)}</td>
              <td role="cell" data-label="کارمزد پلتفرم"><div className={ledger.value}>{money(x.platformFeeRial ?? x.feeRial)}{x.status !== "PAID" && <small className={ledger.hint}>برآورد</small>}</div></td>
              <td role="cell" data-label="معادل ریالی اعتبار" className={ledger.net}>{money(x.creditRial ?? x.netRial)}</td>
              <td role="cell" data-label="وضعیت"><Badge value={x.status} /></td>
              <td role="cell" data-label="ثبت">{date(x.createdAt)}</td>
              <td role="cell" data-label="جزئیات">
                <button type="button" className={`${s.secondary} ${ledger.detailToggle}`} aria-label={`جزئیات پرداخت سفارش ${x.externalId}`} aria-expanded={expanded === x.id} aria-controls={`payment-detail-${x.id}`} onClick={() => setExpanded(expanded === x.id ? null : x.id)}>{expanded === x.id ? "بستن جزئیات" : "مشاهده جزئیات"}</button>
              </td>
            </tr>
            <tr className={ledger.detailRow} hidden={expanded !== x.id}>
              <td colSpan={9}>
                <div id={`payment-detail-${x.id}`} className={ledger.paymentDetails}>
                  <div className={ledger.detailHeading}>
                    <strong>جزئیات سفارش <bdi>{x.externalId}</bdi></strong>
                    <div className={ledger.receiptLinks}>
                      <Link className={s.secondary} href={x.checkoutUrl}>صفحه پرداخت مشتری</Link>
                      {adminReceipts && x.receiptIds?.map((id, index) => <a className={s.button} key={id} href={`/api/pay/receipt-image/${id}`} target="_blank" rel="noreferrer">مشاهده تصویر رسید{x.receiptIds!.length > 1 ? ` ${index + 1}` : ""}</a>)}
                    </div>
                  </div>
                  <dl>
                    <PaymentFact label="شناسه پرداخت"><bdi dir="ltr">{x.id}</bdi></PaymentFact>
                    {x.confirmation && <><PaymentFact label="روش تأیید پرداخت">{confirmationMethods[x.confirmation.method]}</PaymentFact><PaymentFact label="منبع تأیید">{confirmationSources[x.confirmation.source]}</PaymentFact></>}
                    <PaymentFact label="کارمزد قرارداد پرداخت">{money(x.feeRial)}</PaymentFact>
                    {x.settledServiceFeeRial != null && <PaymentFact label="کارمزد خدمت وصول‌شده">{money(x.settledServiceFeeRial)}</PaymentFact>}
                    {x.platformFeeRial != null && <PaymentFact label={x.status === "PAID" ? "مجموع کارمزد پلتفرم" : "برآورد کارمزد پلتفرم"}>{money(x.platformFeeRial)}</PaymentFact>}
                    <PaymentFact label="معادل ریالی اعتبار پذیرنده">{money(x.creditRial ?? x.netRial)}</PaymentFact>
                    {x.creditAmount && <PaymentFact label="اعتبار پذیرنده"><bdi dir="ltr">{x.creditAmount} {x.creditCurrency}</bdi></PaymentFact>}
                    <PaymentFact label="کارمزد بر عهده">{x.feeBearer === "CUSTOMER" ? "مشتری" : "پذیرنده"}</PaymentFact>
                    {x.gatewayCollectionStatus && <><PaymentFact label="هزینهٔ خدمت درگاه">{money(x.gatewayAdjustmentRial || "0")}</PaymentFact><PaymentFact label="مبلغ درخواستی واریز">{money(x.gatewayCollectedRial || x.totalRial)}</PaymentFact></>}
                    {x.transferReference && <PaymentFact label="شناسه پیگیری انتقال"><bdi dir="ltr">{x.transferReference}</bdi></PaymentFact>}
                    <PaymentFact label="زمان ثبت">{date(x.createdAt)}</PaymentFact>
                    <PaymentFact label="زمان پرداخت">{x.paidAt ? date(x.paidAt) : "—"}</PaymentFact>
                  </dl>
                  <p className={ledger.explanation}>کارمزد پلتفرم در اعتبار پذیرنده لحاظ نمی‌شود</p>
                </div>
              </td>
            </tr>
            </Fragment>
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
      className={`${s.card} ${s.tableWrap} ${ledger.ledger}`}
      role="region"
      aria-label="فهرست تسویه‌ها"
      tabIndex={0}
    >
      <table className={`${s.table} ${ledger.table}`} role="table">
        <thead role="rowgroup">
          <tr role="row">
            <th scope="col">مبلغ</th>
            <th scope="col">کارمزد</th>
            <th scope="col">دریافتی</th>
            <th scope="col">وضعیت</th>
            <th scope="col">تاریخ</th>
            <th scope="col">جزئیات</th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          {items.map((x) => (
            <tr key={x.id} role="row">
              <td role="cell" data-label="مبلغ"><div className={ledger.value}>{money(x.amountRial)}{x.sourceAmount && <small className={s.tableSub}><bdi>{x.sourceAmount} {x.sourceCurrency}</bdi> · مبدأ</small>}</div></td>
              <td role="cell" data-label="کارمزد"><div className={ledger.value}>{money(x.feeRial)}{x.feeAmount && <small className={s.tableSub}><bdi>{x.feeAmount} {x.feeCurrency}</bdi></small>}</div></td>
              <td role="cell" data-label="خالص انتقال"><div className={ledger.value}><bdi>{x.payoutAmount} {x.asset}</bdi><small className={s.tableSub}>{x.network}</small></div></td>
              <td role="cell" data-label="وضعیت">
                <Badge value={x.status} />
              </td>
              <td role="cell" data-label="تاریخ">{date(x.createdAt)}</td>
              <td role="cell" data-label="جزئیات">
                <details className={`${s.details} ${ledger.details}`}>
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
                  <a className={s.secondary} href={`/api/pay/settlement-receipt?${new URLSearchParams({ id: x.id, format: 'html' })}`} target="_blank" rel="noreferrer" aria-label={`دریافت گزارش تسویه ${x.id}`}>{x.status === 'PAID' ? 'دریافت رسید تسویه' : 'دریافت گزارش درخواست'}</a>
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!items.length && <p className={ledger.empty}>موردی یافت نشد.</p>}
    </div>
  );
}
