"use client";
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
export default function Settlements({
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
  settlementKey,
  rail,
  setRail,
  destination,
  setDestination,
  quote,
  setQuote,
  settlements,
  setSettlements,
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
  settlementKey: { current: string };
  rail: PayRailId;
  setRail: (x: PayRailId) => void;
  destination: string;
  setDestination: (x: string) => void;
  quote: PayQuoteView | null;
  setQuote: (x: PayQuoteView | null) => void;
  settlements: Page<PaySettlementView> | null;
  setSettlements: (x: Page<PaySettlementView> | null) => void;
}) {
  return (
    <>
      <form
        className={`${s.card} ${s.stack}`}
        onSubmit={(e) => {
          e.preventDefault();
          if (!active) return;
          void action(async () => {
            setQuote(
              await api<PayQuoteView>(
                "/api/pay/quotes",
                json("POST", { amountRial: amount, railId: rail }),
              ),
            );
            settlementKey.current = "";
          });
        }}
      >
        <h2>درخواست تسویه</h2>
        <div className={s.grid}>
          <Field label="مبلغ به ریال">
            <input
              inputMode="numeric"
              dir="ltr"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setQuote(null);
                settlementKey.current = "";
              }}
            />
          </Field>
          <Field label="مسیر تسویه">
            <select
              value={rail}
              onChange={(e) => {
                setRail(e.target.value as PayRailId);
                setQuote(null);
                settlementKey.current = "";
              }}
            >
              {data.rails
                .filter((r) => r.enabled)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.asset} · {r.network}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="مقصد">
            <input
              dir="ltr"
              value={destination}
              onChange={(e) => {
                setDestination(e.target.value);
                settlementKey.current = "";
              }}
            />
          </Field>
        </div>
        <div>
          <button
            className={s.secondary}
            disabled={busy || !active || !amount || !rail}
            type="submit"
          >
            {quote ? "به‌روزرسانی نرخ" : "دریافت نرخ و کارمزد"}
          </button>
        </div>
        <p className={s.muted}>
          کارمزد نمایش‌داده‌شده در نرخ، کارمزد تسویه است. در مسیر ترون، شبکه و
          مقصد را پیش از ثبت بررسی کنید.
        </p>
        {quote && (
          <div className={s.notice}>
            <h3>بررسی پیش از ثبت</h3>
            <p>
              مبلغ: {money(quote.amountRial)} · کارمزد تسویه:{" "}
              {money(quote.feeRial)}
              <br />
              نرخ هر واحد {quote.asset}: {money(quote.rateRialPerUnit)}
              <br />
              دریافتی: {quote.payoutAmount} {quote.asset} · شبکه:{" "}
              {quote.network}
              <br />
              مقصد: <span className={s.ltr}>{destination || "وارد نشده"}</span>
              <br />
              اعتبار تا: {date(quote.expiresAt)}
            </p>
            <button
              type="button"
              className={s.button}
              disabled={
                busy ||
                !active ||
                !destination ||
                Date.parse(quote.expiresAt) <= Date.now()
              }
              onClick={() =>
                action(async () => {
                  settlementKey.current ||= newIdempotencyKey("settlement");
                  await api(
                    "/api/pay/settlements",
                    json(
                      "POST",
                      { quoteId: quote.id, destination },
                      settlementKey.current,
                    ),
                  );
                  settlementKey.current = "";
                  setQuote(null);
                  setAmount("");
                  setDestination("");
                })
              }
            >
              تأیید و ثبت درخواست
            </button>
          </div>
        )}
      </form>
      <ListControls
        {...{ query, status, page }}
        setQuery={(x) => {
          setSettlements(null);
          setQuery(x);
        }}
        setStatus={(x) => {
          setSettlements(null);
          setStatus(x);
        }}
        setPage={(x) => {
          setSettlements(null);
          setPage(x);
        }}
        kind="settlements"
      />
      {settlements ? (
        <SettlementTable items={settlements.items} />
      ) : error ? (
        <p>دریافت فهرست ناموفق بود. از به‌روزرسانی استفاده کنید.</p>
      ) : (
        <p role="status">در حال دریافت تسویه‌ها…</p>
      )}
      <Pager page={page} pages={settlements?.pages || 1} setPage={setPage} />
    </>
  );
}
