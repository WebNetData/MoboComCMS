"use client";
import { useEffect, useState } from "react";
import JalaliDateInput from "@/components/date/JalaliDateInput";
import type { PaySettlementCenter } from "@/modules/billing/domain/pay-settlement-center";
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
import m from "./Dashboard.module.css";
import c from "./SettlementCenter.module.css";
type Page<T> = { items: T[]; page: number; pages: number; total: number };
function localInput(d: Date) { const n = (v: number) => String(v).padStart(2, '0'); return `${d.getFullYear()}-${n(d.getMonth()+1)}-${n(d.getDate())}T${n(d.getHours())}:${n(d.getMinutes())}` }
function scheduleUtc(value: string, maxDays: number, now: number | null): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, day, h, min] = match;
  const d = new Date(Number(y), Number(m)-1, Number(day), Number(h), Number(min));
  if (now === null || localInput(d) !== value || d.getTime() <= now || d.getTime() > now + maxDays * 86400000) return null;
  return d.toISOString();
}
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
  const [sourceCurrency, setSourceCurrency] = useState<"IRR" | "USDT">("IRR");
  const [ackNetwork, setAckNetwork] = useState(false);
  const [center, setCenter] = useState<PaySettlementCenter | null>(null);
  const [centerError, setCenterError] = useState("");
  const [profileId, setProfileId] = useState("");
  const [profileLabel, setProfileLabel] = useState("");
  const [profileDestination, setProfileDestination] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [centerBusy, setCenterBusy] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});
  const [clock, setClock] = useState<number | null>(null);
  async function loadCenter() { try { setCenter(await api<PaySettlementCenter>("/api/pay/settlement-center")); setCenterError("") } catch (e) { setCenterError(e instanceof Error ? e.message : "دریافت مرکز تسویه ناموفق بود") } }
  useEffect(() => { void loadCenter() }, []);
  useEffect(() => { setClock(Date.now()); const timer = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(timer) }, []);
  const profile = center?.destinations.find(x => x.id === profileId && x.active && x.railId === rail);
  const maxDays = Math.min(center?.maxScheduleDays ?? 30, 30);
  const scheduledUtc = scheduledFor ? scheduleUtc(scheduledFor, maxDays, clock) : null;
  const now = clock === null ? null : new Date(clock);
  const needsNetworkAck = quote?.railId === "USDT_BSC" || quote?.railId === "USDT_ETHEREUM";
  return (
    <>
      <div className={c.hero}><div><span>مرکز تسویه</span><h2>برنامه‌ریزی و پیگیری انتقال</h2><p>مقصد را بررسی کنید و پیش از ثبت، نرخ و کارمزد را ببینید</p></div>{center && <p>{center.approvalThresholdRial === '0' ? 'تأیید دوم برای درخواست‌های جدید غیرفعال است' : <>آستانهٔ تأیید دوم درخواست‌های جدید: {money(center.approvalThresholdRial)}</>}</p>}</div>
      {centerError && <p role="alert">{centerError}</p>}
      {!center && !centerError && <p role="status">در حال دریافت مقصدها…</p>}
      {center && <div className={c.balances}>{center.balances.map(b => <div key={b.currency}><strong>{b.currency}</strong><span>موجودی قابل استفاده: <bdi>{b.availableAmount}</bdi></span><span>رزرو شده: <bdi>{b.reservedAmount}</bdi></span><span>معادل ریالی: {b.equivalentRial != null ? money(b.equivalentRial) : 'در دسترس نیست'}</span><small>وضعیت نرخ: {b.rateStatus === 'CURRENT' ? 'به‌روز' : b.rateStatus === 'STALE' ? 'قدیمی' : 'در دسترس نیست'}{b.rateAt ? ` · ${date(b.rateAt)}` : ''}</small></div>)}</div>}
      {center && center.destinations.length > 0 && <div className={s.card}><h3>مقصدهای شما</h3>{center.destinations.map(d => <form className={c.destination} key={d.id} onSubmit={e => { e.preventDefault(); setCenterBusy(true); setCenterError(''); void api('/api/pay/settlement-destinations', json('PATCH', { id: d.id, version: d.version, label: names[d.id] ?? d.label })).then(loadCenter).catch(e => setCenterError(e instanceof Error ? e.message : 'تغییر نام ناموفق بود')).finally(() => setCenterBusy(false)) }}><Field label={`نام مقصد ${d.label}`}><input required maxLength={80} value={names[d.id] ?? d.label} onChange={e => setNames({ ...names, [d.id]: e.target.value })} /></Field><button type="submit" className={s.secondary} disabled={centerBusy || !(names[d.id] ?? d.label).trim() || (names[d.id] ?? d.label) === d.label}>ذخیره نام</button></form>)}</div>}
      {center && <details className={s.card}><summary>مدیریت مقصدهای ذخیره‌شده</summary><p>نشانی و شبکه قابل تغییر نیستند؛ برای مقصد جدید یک پروفایل بسازید</p><form className={s.stack} onSubmit={e => { e.preventDefault(); setCenterBusy(true); void api('/api/pay/settlement-destinations', json('POST', { label: profileLabel, railId: rail, destination: profileDestination })).then(() => { setProfileLabel(''); setProfileDestination(''); return loadCenter() }).catch(e => setCenterError(e instanceof Error ? e.message : 'ثبت مقصد ناموفق بود')).finally(() => setCenterBusy(false)) }}><Field label="نام مقصد"><input required value={profileLabel} onChange={e => setProfileLabel(e.target.value)} /></Field><Field label={`نشانی مقصد برای ${rail}`}><input required dir="ltr" value={profileDestination} onChange={e => setProfileDestination(e.target.value)} /></Field><div><button className={s.secondary} disabled={centerBusy} type="submit">ذخیره مقصد</button></div></form>{center.destinations.map(d => <div className={c.destination} key={d.id}><div><strong>{d.label}</strong><p><bdi>{d.asset} · {d.network} · {d.destination}</bdi></p></div><button type="button" className={s.secondary} disabled={centerBusy} onClick={() => { setCenterBusy(true); void api('/api/pay/settlement-destinations', json('PATCH', { id: d.id, version: d.version, active: !d.active })).then(loadCenter).catch(e => setCenterError(e instanceof Error ? e.message : 'تغییر مقصد ناموفق بود')).finally(() => setCenterBusy(false)) }}>{d.active ? 'غیرفعال کردن' : 'فعال کردن'}</button></div>)}</details>}
      <form
        className={`${s.card} ${s.stack}`}
        onSubmit={(e) => {
          e.preventDefault();
          if (!active || busy || (scheduledFor && !scheduledUtc)) return;
          void action(async () => {
            setQuote(
              await api<PayQuoteView>(
                "/api/pay/quotes",
                json("POST", sourceCurrency === "IRR" ? { amountRial: amount, railId: rail, sourceCurrency } : { amount, railId: rail, sourceCurrency }),
              ),
            );
            settlementKey.current = "";
          });
        }}
      >
        <h2>درخواست تسویه</h2>
        <div className={`${s.grid} ${m.formGrid}`}>
          <Field label="کیف پول مبدأ"><select value={sourceCurrency} onChange={e => { setSourceCurrency(e.target.value as "IRR" | "USDT"); setAmount(""); setProfileId(""); setDestination(""); setQuote(null); setAckNetwork(false); settlementKey.current = "" }}><option value="IRR">ریال</option><option value="USDT">USDT داخلی</option></select></Field>
          <Field label={sourceCurrency === "IRR" ? "مبلغ به ریال" : "مبلغ USDT"}>
            <input
              inputMode={sourceCurrency === "IRR" ? "numeric" : "decimal"}
              dir="ltr"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setQuote(null);
                setAckNetwork(false);
                settlementKey.current = "";
              }}
            />
          </Field>
          <Field label="مسیر تسویه">
            <select
              value={rail}
              onChange={(e) => {
                setRail(e.target.value as PayRailId);
                setProfileId("");
                setDestination("");
                setQuote(null);
                setAckNetwork(false);
                settlementKey.current = "";
              }}
            >
              {data.rails
                .filter((r) => r.enabled)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.id === "USDT_BSC" ? "USDT · BSC/BEP20 · پیشنهادی" : `${r.asset} · ${r.network}`}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="مقصد ذخیره‌شده"><select value={profileId} onChange={e => { const p = center?.destinations.find(x => x.id === e.target.value && x.active && x.railId === rail); setProfileId(e.target.value); setDestination(p?.destination || ""); setQuote(null); setAckNetwork(false); settlementKey.current = "" }}><option value="">ورود دستی مقصد</option>{center?.destinations.filter(x => x.active && x.railId === rail).map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select></Field>
          <Field label="مقصد">
            <input
              dir="ltr"
              value={destination}
              readOnly={!!profile}
              onChange={(e) => {
                setDestination(e.target.value);
                setQuote(null);
                setAckNetwork(false);
                settlementKey.current = "";
              }}
            />
          </Field>
          <Field label="زمان تسویه به وقت محلی دستگاه (اختیاری)"><JalaliDateInput withTime disabled={busy || !active} min={now ? localInput(now) : undefined} max={now ? localInput(new Date(now.getTime() + maxDays * 86400000)) : undefined} value={scheduledFor} onChange={value => { setScheduledFor(value); setQuote(null); setAckNetwork(false); settlementKey.current = "" }} invalid={!!scheduledFor && !scheduledUtc} aria-describedby="settlement-schedule-help" /></Field>
        </div>
        <div>
          <button
            className={s.secondary}
            disabled={busy || !active || !amount || !rail || (!!scheduledFor && !scheduledUtc)}
            type="submit"
          >
            {quote ? "به‌روزرسانی نرخ" : "دریافت نرخ و کارمزد"}
          </button>
        </div>
        <p className={s.muted}>
          با ثبت درخواست زمان‌دار، مبلغ هم‌اکنون با نرخ و کارمزد نمایش‌داده‌شده رزرو می‌شود. بررسی و پرداخت تا زمان سررسید انجام نمی‌شود. انتقال خودکار نیست.
          کارمزد نمایش‌داده‌شده در نرخ، کارمزد تسویه است. برای USDT مسیر BSC/BEP20 را بررسی کنید. شبکه و مقصد را پیش از ثبت بررسی کنید؛ درخواست پس از بررسی مدیریت پرداخت می‌شود. در نبود نرخ معتبر، دریافت نرخ ممکن نیست.
        </p>
        <p id="settlement-schedule-help" className={s.muted}>زمان به وقت محلی دستگاه وارد و به UTC تبدیل می‌شود؛ حداکثر {maxDays.toLocaleString('fa-IR')} روز آینده {scheduledFor && !scheduledUtc && ' — زمان آینده و معتبر در این بازه وارد کنید'}</p>
        {quote && (
          <div className={s.notice}>
            <h3>بررسی پیش از ثبت</h3>
            <p>
              مبلغ: {money(quote.amountRial)} · کارمزد تسویه:{" "}
              {money(quote.feeRial)}
              {quote.sourceAmount && <><br />برداشت از کیف پول: <bdi>{quote.sourceAmount} {quote.sourceCurrency}</bdi></>}
              {quote.feeAmount && <><br />کارمزد در واحد اصلی: <bdi>{quote.feeAmount} {quote.feeCurrency}</bdi></>}
              {quote.railId === "USDT_BSC" && <><br />دارایی: Binance-Peg BSC-USD (bridged)</>}
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
            {needsNetworkAck && <label className={s.check}><input type="checkbox" checked={ackNetwork} onChange={e => setAckNetwork(e.target.checked)} />تأیید می‌کنم مقصد با شبکهٔ {quote.network} سازگار است.</label>}
            <button
              type="button"
              className={s.button}
              disabled={
                busy ||
                !active ||
                !destination ||
                (!!profileId && !profile) ||
                (!!scheduledFor && !scheduledUtc) ||
                (needsNetworkAck && !ackNetwork) ||
                clock === null || Date.parse(quote.expiresAt) <= clock
              }
              onClick={() =>
                action(async () => {
                  settlementKey.current ||= newIdempotencyKey("settlement");
                  await api(
                    "/api/pay/settlements",
                    json(
                      "POST",
                      { quoteId: quote.id, destination, ...(needsNetworkAck ? { ackNetwork: true } : {}), ...(profile ? { destinationProfileId: profile.id, destinationVersion: profile.version } : {}), ...(scheduledUtc ? { scheduledFor: scheduledUtc } : {}) },
                      settlementKey.current,
                    ),
                  );
                  settlementKey.current = "";
                  setQuote(null);
                  setAmount("");
                  setDestination("");
                  setProfileId("");
                  setScheduledFor("");
                  setAckNetwork(false);
                  await loadCenter();
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
        <><SettlementTable items={settlements.items} /></>
      ) : error ? (
        <p>دریافت فهرست ناموفق بود. از به‌روزرسانی استفاده کنید.</p>
      ) : (
        <p role="status">در حال دریافت تسویه‌ها…</p>
      )}
      <Pager page={page} pages={settlements?.pages || 1} setPage={setPage} />
    </>
  );
}
