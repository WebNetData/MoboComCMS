"use client";
import { useCallback, useEffect, useState } from "react";
import type {
  PayAdminOverview,
  PaySettings,
} from "@/modules/billing/domain/pay";
import { api, json, money, date } from "../client";
import { Field, Badge, ErrorNotice } from "../shared";
import { PaymentTable, SettlementTable } from "../dashboard/tables";
import s from "../Pay.module.css";
import Settings from "./settings";
export default function Admin() {
  const [data, setData] = useState<PayAdminOverview | null>(null),
    [settings, setSettings] = useState<PaySettings | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState(1),
    [reason, setReason] = useState<Record<string, string>>({}),
    [reference, setReference] = useState<Record<string, string>>({});
  const load = useCallback(async () => {
    try {
      const d = await api<PayAdminOverview>("/api/admin/mobocom-pay/overview");
      setData(d);
      setSettings(d.settings);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا در دریافت اطلاعات");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function action(url: string, body: unknown) {
    setBusy(true);
    setError("");
    try {
      await api(url, json("PATCH", body));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "عملیات ناموفق بود");
    } finally {
      setBusy(false);
    }
  }
  if (!data || !settings)
    return (
      <main className={s.page}>
        <h1>مدیریت موبوکام پی</h1>
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
      </main>
    );
  const update = (patch: Partial<PaySettings>) =>
    setSettings({ ...settings, ...patch });
  return (
    <main className={s.page}>
      <header className={s.head}>
        <div>
          <span className={s.eyebrow}>MoboCom Pay</span>
          <h1>مدیریت پرداخت</h1>
          <p className={s.muted}>بررسی پذیرندگان، تطبیق بانکی و تسویه‌ها</p>
        </div>
        {data.permissions.manage && (
          <span className={s.badge}>
            صورت‌حساب بانکی:{" "}
            {data.readiness.bankFeedReady ? "پیکربندی شده" : "پیکربندی نشده"}
          </span>
        )}
      </header>
      <ErrorNotice error={error} />
      <nav className={s.tabs} aria-label="مدیریت موبوکام پی">
        {[
          "پذیرندگان",
          "تسویه‌ها",
          "پرداخت‌ها",
          "رویدادهای بانک",
          "تنظیمات",
        ].map(
          (x, i) =>
            (i === 1 || data.permissions.manage) && (
              <button
                type="button"
                key={x}
                aria-current={tab === i ? "true" : undefined}
                onClick={() => setTab(i)}
              >
                {x}
              </button>
            ),
        )}
      </nav>
      {tab === 0 && (
        <section className={s.card}>
          <h2>پذیرندگان</h2>
          {data.merchants.map((m) => (
            <div className={s.row} key={m.id}>
              <div>
                <strong>{m.name}</strong>
                <small>
                  {m.website} · {date(m.createdAt)} · {money(m.proceedsRial)}
                </small>
              </div>
              <div className={s.actions}>
                <Badge value={m.status} />
                {m.status !== "ACTIVE" && (
                  <button
                    type="button"
                    className={s.secondary}
                    disabled={busy}
                    onClick={() =>
                      action("/api/admin/mobocom-pay/merchants", {
                        id: m.id,
                        status: "ACTIVE",
                      })
                    }
                  >
                    فعال کردن
                  </button>
                )}
                {m.status === "ACTIVE" && (
                  <button
                    type="button"
                    className={s.secondary}
                    disabled={busy}
                    onClick={() =>
                      action("/api/admin/mobocom-pay/merchants", {
                        id: m.id,
                        status: "SUSPENDED",
                      })
                    }
                  >
                    تعلیق
                  </button>
                )}
              </div>
            </div>
          ))}
          {!data.merchants.length && <p>پذیرنده‌ای ثبت نشده است.</p>}
        </section>
      )}
      {tab === 1 && (
        <>
          <p className={s.notice}>
            تأیید درخواست و ثبت پرداخت دو مرحله جدا هستند. این بخش انتقال بانکی
            یا ارسال روی شبکه را انجام نمی‌دهد؛ پس از انتقال خارج از سامانه،
            شناسه آن را ثبت کنید.
          </p>
          <SettlementTable items={data.settlements} />
          {data.permissions.settle &&
            data.settlements
              .filter(
                (x) => x.status === "REQUESTED" || x.status === "APPROVED",
              )
              .map((x) => (
                <section className={`${s.card} ${s.stack}`} key={x.id}>
                  <h2>
                    {x.merchantName} · {money(x.amountRial)}
                  </h2>
                  <p>
                    {x.payoutAmount} {x.asset} · {x.network} ·{" "}
                    <span className={s.ltr}>{x.destination}</span> ·{" "}
                    <Badge value={x.status} />
                  </p>
                  {x.status === "REQUESTED" ? (
                    <>
                      <Field label="دلیل رد">
                        <input
                          value={reason[x.id] || ""}
                          onChange={(e) =>
                            setReason({ ...reason, [x.id]: e.target.value })
                          }
                        />
                      </Field>
                      <div className={s.actions}>
                        <button
                          type="button"
                          className={s.button}
                          disabled={busy}
                          onClick={() =>
                            action("/api/admin/mobocom-pay/settlements", {
                              id: x.id,
                              action: "approve",
                            })
                          }
                        >
                          تأیید درخواست
                        </button>
                        <button
                          type="button"
                          className={s.secondary}
                          disabled={busy || !reason[x.id]}
                          onClick={() =>
                            action("/api/admin/mobocom-pay/settlements", {
                              id: x.id,
                              action: "reject",
                              reason: reason[x.id],
                            })
                          }
                        >
                          رد درخواست
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <Field label="شناسه انتقال انجام‌شده">
                        <input
                          value={reference[x.id] || ""}
                          onChange={(e) =>
                            setReference({
                              ...reference,
                              [x.id]: e.target.value,
                            })
                          }
                        />
                      </Field>
                      <div>
                        <button
                          type="button"
                          className={s.button}
                          disabled={busy || !reference[x.id]}
                          onClick={() =>
                            action("/api/admin/mobocom-pay/settlements", {
                              id: x.id,
                              action: "paid",
                              reference: reference[x.id],
                            })
                          }
                        >
                          ثبت انتقال انجام‌شده
                        </button>
                      </div>
                    </>
                  )}
                </section>
              ))}
        </>
      )}
      {tab === 2 && <PaymentTable items={data.payments} />}
      {tab === 3 && (
        <section className={`${s.card} ${s.tableWrap}`}>
          <h2>رویدادهای بانکی</h2>
          <table className={s.table}>
            <thead>
              <tr>
                <th>شناسه</th>
                <th>مبلغ</th>
                <th>پیگیری</th>
                <th>وضعیت تطبیق</th>
                <th>پرداخت</th>
                <th>زمان</th>
              </tr>
            </thead>
            <tbody>
              {data.bankEvents.map((e) => (
                <tr key={e.id}>
                  <td>{e.externalId}</td>
                  <td>{money(e.amountRial)}</td>
                  <td>{e.transferReference}</td>
                  <td>
                    <Badge value={e.status} />
                  </td>
                  <td>{e.paymentId || "—"}</td>
                  <td>{date(e.occurredAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.bankEvents.length && <p>رویدادی ثبت نشده است.</p>}
        </section>
      )}
      {tab === 4 && <Settings {...{ data, settings, update, action, busy }} />}
    </main>
  );
}
