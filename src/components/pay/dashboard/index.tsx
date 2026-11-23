"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { newIdempotencyKey } from "@/shared/security/idempotency";
import type {
  PayOverview,
  PayPaymentView,
  PaySettlementView,
  PayQuoteView,
  PayRailId,
} from "@/modules/billing/domain/pay";
import { api, json, money, date, labels } from "../client";
import { Field, Badge, ErrorNotice } from "../shared";
import s from "../Pay.module.css";
import Overview from "./overview";
import Payments from "./payments";
import Settlements from "./settlements";
import Terminals from "./terminals";
import ApiGuide from "./api-guide";
import PayNavigation from "../navigation";
import WorkspaceHeader from "../workspace-header";
import {
  SettlementSteps,
  ListControls,
  Pager,
  PaymentTable,
  SettlementTable,
} from "./tables";

type Page<T> = { items: T[]; page: number; pages: number; total: number };
const views = ["overview", "payments", "settlements", "terminals", "api", "reports"];
export default function Dashboard({ initialView = "overview" }: { initialView?: string }) {
  const tab = Math.max(0, views.indexOf(initialView));
  const [data, setData] = useState<PayOverview | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [name, setName] = useState(""),
    [terminalName, setTerminalName] = useState(""),
    [website, setWebsite] = useState(""),
    [returnUrl, setReturnUrl] = useState(""),
    [terminal, setTerminal] = useState(""),
    [externalId, setExternalId] = useState(""),
    [amount, setAmount] = useState(""),
    [rail, setRail] = useState<PayRailId>("IRR_BANK"),
    [destination, setDestination] = useState(""),
    [quote, setQuote] = useState<PayQuoteView | null>(null);
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState(""),
    [page, setPage] = useState(1),
    [payments, setPayments] = useState<Page<PayPaymentView> | null>(null),
    [settlements, setSettlements] = useState<Page<PaySettlementView> | null>(
      null,
    ),
    [revision, setRevision] = useState(0);
  const paymentKey = useRef(""),
    settlementKey = useRef("");
  const load = useCallback(async () => {
    try {
      setData(await api<PayOverview>("/api/pay/overview"));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا در دریافت اطلاعات");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (tab !== 1 && tab !== 2) return;
    const controller = new AbortController();
    const params = new URLSearchParams({
      q: query,
      status,
      page: String(page),
    });
    api<Page<PayPaymentView> | Page<PaySettlementView>>(
      `/api/pay/${tab === 1 ? "payments" : "settlements"}?${params}`,
      { signal: controller.signal },
    )
      .then((result) => {
        if (tab === 1) setPayments(result as Page<PayPaymentView>);
        else setSettlements(result as Page<PaySettlementView>);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [tab, query, status, page, revision]);
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
      setRevision((x) => x + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "عملیات ناموفق بود");
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <section className={s.page} dir="rtl">
        <h1>درگاه پرداخت</h1>
        {error ? (
          <>
            <ErrorNotice error={error} />
            <button
              type="button"
              className={s.secondary}
              onClick={() => void load()}
            >
              تلاش دوباره
            </button>
          </>
        ) : (
          <p role="status">در حال دریافت اطلاعات…</p>
        )}
      </section>
    );
  const active = data.merchant?.status === "ACTIVE";
  return (
    <section className={s.page}>
      <WorkspaceHeader area="merchant" view={views[tab]}>
          {data.merchant && <Badge value={data.merchant.status} />}
          <button
            type="button"
            className={s.secondary}
            onClick={() => {
              void load();
              setRevision((x) => x + 1);
            }}
          >
            به‌روزرسانی
          </button>
      </WorkspaceHeader>
      <ErrorNotice error={error} />
      {!data.merchant ? (
        <form
          className={`${s.card} ${s.stack}`}
          onSubmit={(e) => {
            e.preventDefault();
            void action(() =>
              api("/api/pay/merchant", json("POST", { name, website })),
            );
          }}
        >
          <h2>شروع همکاری</h2>
          <p>اطلاعات کسب‌وکار را برای بررسی ثبت کنید.</p>
          <Field label="نام کسب‌وکار">
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="نشانی وب‌سایت">
            <input
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              dir="ltr"
            />
          </Field>
          <div>
            <button type="submit" className={s.button} disabled={busy || !name}>
              ثبت درخواست
            </button>
          </div>
        </form>
      ) : (
        <>
          {data.merchant.status !== "ACTIVE" && (
            <p className={s.notice}>
              {data.merchant.status === "PENDING"
                ? "درخواست شما در انتظار بررسی است."
                : "حساب پذیرنده تعلیق شده است. برای پیگیری با پشتیبانی تماس بگیرید."}
            </p>
          )}
          <PayNavigation area="merchant" current={views[tab]} />
          {tab === 0 && <Overview data={data} />}
          {tab === 1 && (
            <Payments
              {...{
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
              }}
            />
          )}
          {tab === 2 && (
            <Settlements
              {...{
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
              }}
            />
          )}
          {tab === 3 && (
            <Terminals
              {...{
                data,
                busy,
                active,
                action,
                terminalName,
                setTerminalName,
                returnUrl,
                setReturnUrl,
              }}
            />
          )}
          {tab === 4 && <ApiGuide />}
          {tab === 5 && <Overview data={data} reports />}
        </>
      )}
    </section>
  );
}
