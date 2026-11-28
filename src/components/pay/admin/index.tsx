"use client";
import { useCallback, useEffect, useState } from "react";
import type {
  PayAdminOverview,
  PaySettings,
} from "@/modules/billing/domain/pay";
import { api, json, money, date } from "../client";
import { Badge, ErrorNotice } from "../shared";
import PaymentDesk from "./payment-desk";
import FinancialReport from "../financial-report";
import s from "../Pay.module.css";
import Settings from "./settings";
import PayNavigation from "../navigation";
import Icon from "@/components/site/Icon";
import design from "./AdminWorkspace.module.css";
import AdminOverview from "./overview";
import WorkspaceHeader from "../workspace-header";
import Merchants from "./merchants";
import Receipts from "./receipts";
import TransferMonitor from "./transfer-monitor";
import TransferReconciliation from "./transfer-reconciliation";
import SettlementDesk from "./settlement-desk";
import WebhookOperations from "./webhook-operations";
const views = ["merchants", "settlements", "payments", "bank-events", "settings", "receipts", "operations", "reconciliation", "webhooks", "reports"];
export default function Admin({ initialView = "overview" }: { initialView?: string }) {
  const [data, setData] = useState<PayAdminOverview | null>(null),
    [settings, setSettings] = useState<PaySettings | null>(null),
    [error, setError] = useState(""),
    [settingsSaved, setSettingsSaved] = useState(false),
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
    setSettingsSaved(false);
    try {
      await api(url, json("PATCH", body));
      setSettingsSaved(true);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "عملیات ناموفق بود");
    } finally {
      setBusy(false);
    }
  }
  if (!data || !settings)
    return (
      <section className={`${s.page} ${design.page}`} dir="rtl">
        <WorkspaceHeader area="admin" view={initialView} />
        <div className={design.pending}>
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
          <p role="status">در حال دریافت اطلاعات درگاه…</p>
        )}
        </div>
      </section>
    );
  const tab = views.indexOf(initialView);
  const forbidden = tab >= 0 && tab !== 1 && !data.permissions.manage;
  const update = (patch: Partial<PaySettings>) => {
    setSettingsSaved(false);
    setSettings({ ...settings, ...patch });
  };
  return (
    <section className={`${s.page} ${design.page}`} dir="rtl">
      <WorkspaceHeader area="admin" view={initialView}>
        {data.permissions.manage && (
          <div className={design.bankStatus} data-ready={data.readiness.bankFeedReady}>
            <span className={design.statusIcon}><Icon name="bank" size={19} /></span>
            <span><small>صورت‌حساب بانکی</small><strong>{data.readiness.bankFeedReady ? "پیکربندی شده" : "پیکربندی نشده"}</strong></span>
          </div>
        )}
      </WorkspaceHeader>
      <ErrorNotice error={error} />
      <PayNavigation area="admin" current={initialView === "reports" ? "overview" : initialView} canManage={data.permissions.manage} />
      <div className={design.content} data-pay-admin-content>
      {forbidden && <p className={s.notice}>دسترسی به این بخش برای شما فعال نیست.</p>}
      {initialView === "overview" && <AdminOverview data={data} />}
      {!forbidden && tab === 0 && <Merchants />}
      {!forbidden && tab === 1 && <SettlementDesk allowed={data.permissions.settle} />}
      {!forbidden && tab === 8 && <WebhookOperations allowed={data.permissions.manage} />}
      {!forbidden && tab === 2 && <PaymentDesk />}
      {!forbidden && initialView === "reports" && <FinancialReport area="admin" />}
      {!forbidden && tab === 5 && <Receipts />}
      {!forbidden && tab === 6 && <TransferMonitor />}
      {!forbidden && tab === 7 && <TransferReconciliation />}
      {!forbidden && tab === 3 && (
        <section className={s.card} aria-labelledby="pay-bank-events-title">
          <div className={design.sectionHead}>
            <div><h2 id="pay-bank-events-title">دفتر رویدادهای بانکی</h2><p>شواهد واریز و وضعیت اتصال آن‌ها به پرداخت‌های درگاه</p></div>
          </div>
          {data.bankEvents.length > 0 ? <div className={`${s.tableWrap} ${design.ledger}`} tabIndex={0} role="region" aria-label="فهرست رویدادهای بانکی">
          <table className={s.table}>
            <thead>
              <tr>
                <th scope="col">شناسه</th>
                <th scope="col">مبلغ</th>
                <th scope="col">پیگیری</th>
                <th scope="col">وضعیت تطبیق</th>
                <th scope="col">پرداخت</th>
                <th scope="col">زمان</th>
              </tr>
            </thead>
            <tbody>
              {data.bankEvents.map((e) => (
                <tr key={e.id}>
                  <td><bdi>{e.externalId}</bdi></td>
                  <td>{money(e.amountRial)}</td>
                  <td><bdi>{e.transferReference}</bdi></td>
                  <td>
                    <Badge value={e.status} />
                  </td>
                  <td><bdi>{e.paymentId || "—"}</bdi></td>
                  <td>{date(e.occurredAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div> : <div className={design.empty}><Icon name="bank" size={24} /><p>هنوز رویداد بانکی ثبت نشده است.</p></div>}
        </section>
      )}
      {!forbidden && tab === 4 && <Settings {...{ data, settings, update, action, busy, settingsSaved, error }} />}
      </div>
    </section>
  );
}
