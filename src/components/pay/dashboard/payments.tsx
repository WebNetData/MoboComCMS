"use client";
import { useEffect, useState } from "react";
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
import FeeShare from "./fee-share";
import s from "../Pay.module.css";
import m from "./Dashboard.module.css";
type Page<T> = { items: T[]; page: number; pages: number; total: number };
type TerminalGatewayView = { terminalId: string; currency: "IRR"; items: { ref: string; name: string; provider: string; manual: boolean; isDefault: boolean; automatic?: boolean }[] };
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
  const [gatewayRef, setGatewayRef] = useState(""), [gatewayTerminal, setGatewayTerminal] = useState(""), [gatewayItems, setGatewayItems] = useState<TerminalGatewayView["items"]>([]), [gatewayLoading, setGatewayLoading] = useState(false), [gatewayError, setGatewayError] = useState("");
  const noGateways = Boolean(terminal && gatewayTerminal === terminal && !gatewayLoading && !gatewayError && gatewayItems.length === 0);
  useEffect(() => {
    if (!terminal) { setGatewayTerminal(""); setGatewayItems([]); setGatewayLoading(false); setGatewayError(""); return; }
    const controller = new AbortController();
    setGatewayTerminal(""); setGatewayItems([]); setGatewayLoading(true); setGatewayError("");
    api<TerminalGatewayView>(`/api/pay/terminals/${encodeURIComponent(terminal)}/gateways`, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) { setGatewayItems(result.items); setGatewayTerminal(terminal); } })
      .catch(e => { if (!controller.signal.aborted) { setGatewayItems([]); setGatewayTerminal(terminal); setGatewayError(e instanceof Error ? e.message : "فهرست روش‌های پرداخت دریافت نشد"); } })
      .finally(() => { if (!controller.signal.aborted) setGatewayLoading(false); });
    return () => controller.abort();
  }, [terminal]);
  return (
    <>
      <form
        className={`${s.card} ${s.stack}`}
        onSubmit={(e) => {
          e.preventDefault();
          if (!active || noGateways) return;
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
                  ...(gatewayTerminal === terminal && gatewayRef ? { gatewayRef } : {}),
                },
                paymentKey.current,
              ),
            );
            paymentKey.current = "";
            setExternalId("");
            setAmount("");
            setGatewayRef("");
            setPayments(null);
            setError("");
            setCreated(p); setShareUrl(new URL(p.checkoutUrl, window.location.origin).href); setCopyNotice("");
          });
        }}
      >
        <h2>ساخت لینک پرداخت</h2>
        <p className={s.muted}>برای وب‌سایت، پیج، کانال یا پیام خصوصی لینک همین سفارش را بفرستید. برای سفارش تازه، لینک تازه بسازید؛ هر لینک یک پرداخت مشخص دارد.</p>
        <div className={`${s.grid} ${m.formGrid}`}>
          <Field label="پایانه">
            <select
              value={terminal}
              onChange={(e) => {
                setTerminal(e.target.value);
                setGatewayRef("");
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
          {terminal && gatewayTerminal === terminal && gatewayItems.length > 0 && !gatewayError && <Field label="روش پرداخت (اختیاری)">
            <select value={gatewayRef} onChange={e => { setGatewayRef(e.target.value); paymentKey.current = ""; }} disabled={busy || !active}>
              <option value="">انتخاب روش توسط مشتری</option>
              {gatewayItems.map(gateway => <option key={gateway.ref} value={gateway.ref}>{gateway.name}{gateway.isDefault ? " · پیش‌فرض" : ""}</option>)}
            </select>
          </Field>}
        </div>
        {terminal && gatewayLoading && <p className={s.muted} role="status">در حال دریافت روش‌های پرداخت این پایانه…</p>}
        {terminal && gatewayTerminal === terminal && !gatewayLoading && gatewayError && <p className={s.muted} role="status">فهرست روش‌های پرداخت در دسترس نیست؛ لینک با انتخاب روش توسط مشتری ساخته می‌شود.</p>}
        {noGateways && <p className={s.muted} role="status">برای این پایانه درگاه آماده‌ای وجود ندارد. پایانهٔ دیگری انتخاب کنید یا با پشتیبانی تماس بگیرید.</p>}
        <div>
          <button
            className={s.button}
            disabled={busy || !active || !terminal || !externalId || !amount || noGateways}
            type="submit"
          >
            ساخت صفحه پرداخت
          </button>
        </div>
      </form>
      {data.merchant && <FeeShare key={data.merchant.id} terms={data.merchant.fees} disabled={busy || !active} action={action} />}
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
