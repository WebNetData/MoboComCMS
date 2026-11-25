"use client";
import { useCallback, useEffect, useState } from "react";
import type {
  PayAdminOverview,
  PaySettings,
} from "@/modules/billing/domain/pay";
import { api, json, money, date } from "../client";
import { Badge, ErrorNotice } from "../shared";
import { PaymentTable } from "../dashboard/tables";
import s from "../Pay.module.css";
import Settings from "./settings";
import PayNavigation from "../navigation";
import AdminOverview from "./overview";
import WorkspaceHeader from "../workspace-header";
import Merchants from "./merchants";
import Receipts from "./receipts";
import TransferMonitor from "./transfer-monitor";
import TransferReconciliation from "./transfer-reconciliation";
import SettlementDesk from "./settlement-desk";
import WebhookOperations from "./webhook-operations";
const views = ["merchants", "settlements", "payments", "bank-events", "settings", "receipts", "operations", "reconciliation", "webhooks"];
export default function Admin({ initialView = "overview" }: { initialView?: string }) {
  const [data, setData] = useState<PayAdminOverview | null>(null),
    [settings, setSettings] = useState<PaySettings | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
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
      <section className={s.page}>
        <h1>مدیریت درگاه پرداخت</h1>
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
  const tab = views.indexOf(initialView);
  const forbidden = tab >= 0 && tab !== 1 && !data.permissions.manage;
  const update = (patch: Partial<PaySettings>) =>
    setSettings({ ...settings, ...patch });
  return (
    <section className={s.page}>
      <WorkspaceHeader area="admin" view={initialView}>
        {data.permissions.manage && (
          <span className={s.badge}>
            صورت‌حساب بانکی:{" "}
            {data.readiness.bankFeedReady ? "پیکربندی شده" : "پیکربندی نشده"}
          </span>
        )}
      </WorkspaceHeader>
      <ErrorNotice error={error} />
      <PayNavigation area="admin" current={initialView} canManage={data.permissions.manage} />
      {forbidden && <p className={s.notice}>دسترسی به این بخش برای شما فعال نیست.</p>}
      {initialView === "overview" && <AdminOverview data={data} />}
      {!forbidden && tab === 0 && <Merchants />}
      {!forbidden && tab === 1 && <SettlementDesk allowed={data.permissions.settle} />}
      {!forbidden && tab === 8 && <WebhookOperations allowed={data.permissions.manage} />}
      {!forbidden && tab === 2 && <PaymentTable items={data.payments} />}
      {!forbidden && tab === 5 && <Receipts />}
      {!forbidden && tab === 6 && <TransferMonitor />}
      {!forbidden && tab === 7 && <TransferReconciliation />}
      {!forbidden && tab === 3 && (
        <section className={`${s.card} ${s.tableWrap}`} tabIndex={0} aria-label="فهرست رویدادهای بانکی">
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
      {!forbidden && tab === 4 && <Settings {...{ data, settings, update, action, busy }} />}
    </section>
  );
}
