"use client";
import type { PayOverview } from "@/modules/billing/domain/pay";
import { money } from "../client";
import { Badge } from "../shared";
import { SettlementSteps } from "./tables";
import Link from "@/components/AppLink";
import s from "../Pay.module.css";
const day = (value: string) =>
  new Date(value + "T12:00:00").toLocaleDateString("fa-IR", {
    month: "short",
    day: "numeric",
  });
export default function Overview({
  data,
  reports = false,
}: {
  data: PayOverview;
  reports?: boolean;
}) {
  const trend = data.stats.trend;
  const max = trend.reduce((m, x) => {
    try {
      return BigInt(x.grossRial) > m ? BigInt(x.grossRial) : m;
    } catch {
      return m;
    }
  }, BigInt(0));
  return (
    <>
      <section className={s.grid} aria-label="خلاصه مالی">
        {[
          ["موجودی قابل تسویه", data.stats.availableRial],
          ["در انتظار تسویه", data.stats.pendingSettlementRial],
          ["دریافتی ناخالص", data.stats.grossRial],
          ["خالص پرداخت‌ها", data.stats.netRial],
        ].map(([label, value], index) => (
          <div
            className={`${s.card} ${s.metric} ${index === 0 ? s.balance : ""}`}
            key={label}
          >
            <small>{label}</small>
            <strong>{money(value)}</strong>
          </div>
        ))}
      </section>
      <p className={s.walletNote}>دریافت‌های تأییدشده به کیف پول موبوکام افزوده می‌شوند. موجودی قابل تسویه بخشی از همان کیف پول است؛ مبلغ درخواست‌شده تا تعیین تکلیف تسویه قابل خرج کردن نیست. <Link href="/dashboard/wallet">مشاهده کیف پول</Link></p>
      {reports && <section className={`${s.card} ${s.reportExports}`}><div><h2>دریافت گزارش</h2><p className={s.muted}>خروجی هر صفحه تا ۱۰۰۰ ردیف دارد. برای فیلتر و صفحات دیگر به فهرست مربوط بروید.</p></div><div className={s.actions}><a className={s.secondary} href="/api/pay/payments?format=csv">گزارش پرداخت‌ها CSV</a><a className={s.secondary} href="/api/pay/settlements?format=csv">گزارش تسویه‌ها CSV</a></div></section>}
      <div className={s.split}>
        <section className={s.card}>
          <div className={s.sectionHead}>
            <div>
              <h2>روند دریافت</h2>
              <small className={s.muted}>مبالغ ناخالص پرداخت‌های ثبت شده</small>
            </div>
            <span>
              {data.stats.paidCount.toLocaleString("fa-IR")} پرداخت موفق
            </span>
          </div>
          {trend.length ? (
            <>
              <div className={s.chart} aria-hidden="true">
                {trend.map((x) => (
                  <div
                    key={x.date}
                    className={`${s.bar} ${BigInt(x.grossRial) === BigInt(0) ? s.barZero : ""}`}
                    title={`${x.date}: ${money(x.grossRial)}`}
                    style={{
                      height: `${max ? Math.max(0, Math.min(100, Number((BigInt(x.grossRial) * BigInt(100)) / max))) : 0}%`,
                    }}
                  />
                ))}
              </div>
              <div className={s.axis}>
                <span>{day(trend[0].date)}</span>
                <span>{day(trend[trend.length - 1].date)}</span>
              </div>
              <details className={s.trendDetails}>
                <summary>مشاهدهٔ داده‌های روزانه</summary>
                <div className={s.tableWrap}>
                  <table className={s.table}>
                    <thead>
                      <tr>
                        <th>تاریخ</th>
                        <th>مبلغ</th>
                        <th>تعداد</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trend.map((x) => (
                        <tr key={x.date}>
                          <td>{x.date}</td>
                          <td>{money(x.grossRial)}</td>
                          <td>{x.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </>
          ) : (
            <p className={s.muted}>
              هنوز پرداختی برای نمایش روند ثبت نشده است.
            </p>
          )}
        </section>
        <section className={s.card}>
          <h2>مسیر تسویه</h2>
          <p className={s.muted}>درخواست، بررسی و پرداخت</p>
          {data.settlements.length ? (
            data.settlements.slice(0, 4).map((x) => (
              <div className={s.row} key={x.id}>
                <div>
                  <strong>{money(x.amountRial)}</strong>
                  <small>
                    {x.asset} · {x.network}
                  </small>
                  <Badge value={x.status} />
                  <SettlementSteps status={x.status} />
                </div>
              </div>
            ))
          ) : (
            <p>هنوز درخواست تسویه‌ای ثبت نشده است.</p>
          )}
          <Link className={s.secondary} href="/dashboard/pay/settlements">مدیریت تسویه‌ها</Link>
        </section>
      </div>
      <p className={s.notice}>
        دریافت: {data.readiness.incomingEnabled ? "فعال" : "غیرفعال"} · اتصال
        صورت‌حساب بانکی:{" "}
        {data.readiness.bankFeedReady ? "پیکربندی شده" : "پیکربندی نشده"}
      </p>
    </>
  );
}
