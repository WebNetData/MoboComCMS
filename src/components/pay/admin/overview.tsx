import Link from "@/components/AppLink";
import type { PayAdminOverview } from "@/modules/billing/domain/pay";
import s from "../Pay.module.css";

export default function AdminOverview({ data }: { data: PayAdminOverview }) {
  const pendingSettlements = data.settlements.filter((x) => x.status === "REQUESTED").length;
  const pendingMerchants = data.merchants.filter((x) => x.status === "PENDING").length;
  return (
    <>
      <section className={s.grid} aria-label="خلاصه عملیات درگاه">
        <div className={`${s.card} ${s.metric} ${s.balance}`}><small>درخواست تسویه در انتظار بررسی</small><strong>{pendingSettlements.toLocaleString("fa-IR")}</strong></div>
        <div className={`${s.card} ${s.metric}`}><small>تسویه‌های نمایش داده‌شده</small><strong>{data.settlements.length.toLocaleString("fa-IR")}</strong></div>
        {data.permissions.manage && <><div className={`${s.card} ${s.metric}`}><small>پذیرنده در انتظار بررسی</small><strong>{pendingMerchants.toLocaleString("fa-IR")}</strong></div><div className={`${s.card} ${s.metric}`}><small>پرداخت‌های نمایش داده‌شده</small><strong>{data.payments.length.toLocaleString("fa-IR")}</strong></div></>}
      </section>
      <section className={`${s.card} ${s.overviewActions}`}>
        <div><h2>پیگیری عملیات</h2><p className={s.muted}>تعدادها بر پایه اطلاعات نمایش داده‌شده در پنل هستند. برای بررسی جزئیات به بخش مربوط بروید.</p></div>
        <div className={s.actions}><Link className={s.button} href="/admin/mobocom-pay/settlements">بررسی تسویه‌ها</Link>{data.permissions.manage && <Link className={s.secondary} href="/admin/mobocom-pay/merchants">بررسی پذیرندگان</Link>}</div>
      </section>
    </>
  );
}
