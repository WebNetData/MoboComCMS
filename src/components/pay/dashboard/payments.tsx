"use client";
import { useState } from "react";
import Link from "@/components/AppLink";
import { newIdempotencyKey } from "@/shared/security/idempotency";
import type {
  PayOverview,
  PayPaymentView,
  PaySettlementView,
  PayQuoteView,
  PayRailId,
} from "@/modules/billing/domain/pay";
import { api, json, money, date } from "../client";
import { Field } from "../shared";
import { ListControls, Pager, PaymentTable, SettlementTable } from "./tables";
import s from "../Pay.module.css";
type Page<T> = { items: T[]; page: number; pages: number; total: number };
export default function Payments({
  data,
  active,
  busy,
  action,
  amount,
  setAmount,
  query,
  status,
  page,
  setQuery,
  setStatus,
  setPage,
  error,
  paymentKey,
  terminal,
  setTerminal,
  externalId,
  setExternalId,
  payments,
  setPayments,
  setError,
}: {
  data: PayOverview;
  active: boolean;
  busy: boolean;
  action: (fn: () => Promise<unknown>) => Promise<void>;
  amount: string;
  setAmount: (x: string) => void;
  query: string;
  status: string;
  page: number;
  setQuery: (x: string) => void;
  setStatus: (x: string) => void;
  setPage: (x: number) => void;
  error: string;
  paymentKey: { current: string };
  terminal: string;
  setTerminal: (x: string) => void;
  externalId: string;
  setExternalId: (x: string) => void;
  payments: Page<PayPaymentView> | null;
  setPayments: (x: Page<PayPaymentView> | null) => void;
  setError: (x: string) => void;
}) {
  const [created, setCreated] = useState<PayPaymentView | null>(null), [shareUrl, setShareUrl] = useState(""), [copyNotice, setCopyNotice] = useState("");
  return (
    <>
      <form
        className={`${s.card} ${s.stack}`}
        onSubmit={(e) => {
          e.preventDefault();
          if (!active) return;
          void action(async () => {
            paymentKey.current ||= newIdempotencyKey("pay");
            const p = await api<PayPaymentView>(
              "/api/pay/payments",
              json(
                "POST",
                {
                  terminalId: terminal,
                  externalId,
                  amountRial: amount,
                },
                paymentKey.current,
              ),
            );
            paymentKey.current = "";
            setExternalId("");
            setAmount("");
            setPayments(null);
            setError("");
            setCreated(p); setShareUrl(new URL(p.checkoutUrl, window.location.origin).href); setCopyNotice("");
          });
        }}
      >
        <h2>ساخت لینک پرداخت</h2>
        <p className={s.muted}>برای وب‌سایت، پیج، کانال یا پیام خصوصی لینک همین سفارش را بفرستید. برای سفارش تازه، لینک تازه بسازید؛ هر لینک یک پرداخت مشخص دارد.</p>
        <div className={s.grid}>
          <Field label="پایانه">
            <select
              value={terminal}
              onChange={(e) => {
                setTerminal(e.target.value);
                paymentKey.current = "";
              }}
            >
              <option value="">انتخاب کنید</option>
              {data.terminals
                .filter((t) => t.active)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="شناسه سفارش">
            <input
              value={externalId}
              onChange={(e) => {
                setExternalId(e.target.value);
                paymentKey.current = "";
              }}
            />
          </Field>
          <Field label="مبلغ به ریال">
            <input
              inputMode="numeric"
              dir="ltr"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                paymentKey.current = "";
              }}
            />
          </Field>
        </div>
        <div>
          <button
            className={s.button}
            disabled={busy || !active || !terminal || !externalId || !amount}
            type="submit"
          >
            ساخت صفحه پرداخت
          </button>
        </div>
      </form>
      {created && <section className={`${s.card} ${s.stack}`} aria-label="لینک پرداخت ساخته‌شده"><h2>لینک آمادهٔ ارسال است</h2><p>سفارش <bdi>{created.externalId}</bdi> · {money(created.totalRial)}{created.creditCurrency === 'USDT' && <> · اعتبار پذیرنده <bdi dir="ltr">{created.creditAmount} USDT</bdi></>}</p><Field label="نشانی پرداخت مشتری"><input readOnly dir="ltr" value={shareUrl} onFocus={e => e.currentTarget.select()} /></Field><div className={s.actions}><button type="button" className={s.button} onClick={() => void navigator.clipboard.writeText(shareUrl).then(() => setCopyNotice('لینک پرداخت کپی شد')).catch(() => setCopyNotice('کپی خودکار انجام نشد؛ نشانی را از فیلد انتخاب کنید.'))}>کپی لینک پرداخت</button><Link href={created.checkoutUrl} className={s.secondary}>مشاهده صفحهٔ مشتری</Link></div><p role="status">{copyNotice}</p><p className={s.muted}>نشانی مخصوص مشتری است؛ کلید API یا توکن پذیرنده را همراه آن ارسال نکنید.</p></section>}
      <ListControls
        {...{ query, status, page }}
        setQuery={(x) => {
          setPayments(null);
          setQuery(x);
        }}
        setStatus={(x) => {
          setPayments(null);
          setStatus(x);
        }}
        setPage={(x) => {
          setPayments(null);
          setPage(x);
        }}
        kind="payments"
      />
      {payments ? (
        <PaymentTable items={payments.items} />
      ) : error ? (
        <p>دریافت فهرست ناموفق بود. از به‌روزرسانی استفاده کنید.</p>
      ) : (
        <p role="status">در حال دریافت پرداخت‌ها…</p>
      )}
      <Pager page={page} pages={payments?.pages || 1} setPage={setPage} />
    </>
  );
}
