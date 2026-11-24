"use client";
import type { PayOverview } from "@/modules/billing/domain/pay";
import Icon from "@/components/site/Icon";
import Link from "@/components/AppLink";
import { money } from "../client";
import { Badge } from "../shared";
import { SettlementSteps } from "./tables";
import s from "../Pay.module.css";
import o from "./Overview.module.css";

const day = (value: string) => new Date(value + "T12:00:00Z").toLocaleDateString("fa-IR", { month: "short", day: "numeric", timeZone: "Asia/Tehran" });

function Amount({ value }: { value: string }) {
  return <span className={o.amount}><bdi dir="ltr">{money(value).replace(/ ریال$/, "")}</bdi><small>ریال</small></span>;
}

export default function Overview({ data, reports = false }: { data: PayOverview; reports?: boolean }) {
  const usdt = data.assetBalances?.find(x => x.currency === "USDT");
  const trend = data.stats.trend;
  const max = trend.reduce((m, x) => {
    try { return BigInt(x.grossRial) > m ? BigInt(x.grossRial) : m; }
    catch { return m; }
  }, BigInt(0));
  const hasReceipts = max > BigInt(0);
  return <div className={o.overview}>
    <section className={o.summary} aria-label="خلاصه مالی">
      <div className={o.balance}>
        <div className={o.balanceHead}><span>موجودی قابل تسویه</span><Icon name="wallet" size={20} /></div>
        {data.merchant?.creditCurrency === "USDT" ? <><strong className={o.balanceValue}><bdi dir="ltr">{usdt?.availableAmount ?? "—"} USDT</bdi></strong><p className={o.balanceNote}>معادل نمایشی: {usdt?.equivalentRial != null ? money(usdt.equivalentRial) : "نرخ در دسترس نیست"}{usdt?.rateAt && <> · نرخ {new Date(usdt.rateAt).toLocaleString("fa-IR", { timeZone: "Asia/Tehran" })}</>}{usdt?.rateStatus === "STALE" && " · نرخ قدیمی"}</p><p className={o.balanceNote}>موجودی ریالی جداگانه: {money(data.stats.availableRial)}</p></> : <><strong className={o.balanceValue}><Amount value={data.stats.availableRial} /></strong>{usdt && <p className={o.balanceNote}>موجودی تتری جداگانه: <bdi dir="ltr">{usdt.availableAmount} USDT</bdi></p>}</>}
        <Link href="/pay/merchant/settlements" className={o.balanceLink}>مدیریت تسویه‌ها<Icon name="arrow" size={18} /></Link>
      </div>
      <dl className={o.ledger}>
        {[["در انتظار تسویه", data.stats.pendingSettlementRial, "درخواست‌های در حال بررسی"], ["دریافتی ناخالص", data.stats.grossRial, "مجموع پرداخت‌های تأییدشده"], ["خالص پرداخت‌ها", data.stats.netRial, "دریافتی پس از کسر کارمزد"]].map(([label, value, hint]) => <div key={label}><dt>{label}</dt><dd><Amount value={value} /><small>{hint}</small></dd></div>)}
      </dl>
    </section>
    <div className={o.walletNote}><Icon name="wallet" size={18} /><p>دریافت‌های تأییدشده به کیف پول موبوکام افزوده می‌شوند. مبلغ درخواست تسویه تا تعیین تکلیف قابل خرج کردن نیست. <Link href="/dashboard/wallet">مشاهده کیف پول</Link></p></div>
    {reports && <section className={`${s.card} ${s.reportExports}`}><div><h2>دریافت گزارش</h2><p className={s.muted}>خروجی هر صفحه تا ۱۰۰۰ ردیف دارد. برای فیلتر و صفحات دیگر به فهرست مربوط بروید.</p></div><div className={s.actions}><a className={s.secondary} href="/api/pay/payments?format=csv">گزارش پرداخت‌ها CSV</a><a className={s.secondary} href="/api/pay/settlements?format=csv">گزارش تسویه‌ها CSV</a></div></section>}
    <nav className={o.shortcuts} aria-label="دسترسی سریع پذیرنده">
      {[["payments", "receipt", "مدیریت پرداخت‌ها", "ساخت لینک و پیگیری دریافت"], ["terminals", "terminal", "مدیریت پایانه‌ها", "اتصال فروشگاه و ربات"], ["reports", "chart", "گزارش‌های مالی", "مرور روند و خروجی جزئیات"]].map(([path, icon, title, subtitle]) => <Link key={path} href={`/pay/merchant/${path}`}><Icon name={icon} size={20} /><span><strong>{title}</strong><small>{subtitle}</small></span><Icon name="arrow" size={16} /></Link>)}
    </nav>
    <div className={o.panels}>
      <section className={`${s.card} ${o.trend}`}>
        <div className={s.sectionHead}><div><h2>روند دریافت</h2><p className={o.caption}>مبالغ ناخالص پرداخت‌های تأییدشده</p></div><span className={o.count}><strong>{data.stats.paidCount.toLocaleString("fa-IR")}</strong> پرداخت موفق</span></div>
        {hasReceipts ? <><div className={o.chart} aria-hidden="true"><div className={o.guides}><span /><span /><span /></div><div className={o.bars}>{trend.map(x => <div key={x.date} className={o.bar} title={`${day(x.date)}: ${money(x.grossRial)}`} style={{ height: `${Math.max(0, Math.min(100, Number((BigInt(x.grossRial) * BigInt(100)) / max)))}%` }} />)}</div></div><div className={o.axis}><span>{day(trend[0].date)}</span><span>{day(trend[trend.length - 1].date)}</span></div></> : <div className={o.empty}><span className={o.emptyIcon}><Icon name="chart" size={28} /></span><strong>نخستین دریافت، شروع این نمودار است</strong><p>پس از تأیید پرداخت، مبلغ و روند روزانهٔ آن را اینجا می‌بینید.</p><Link href={data.terminals.length ? "/pay/merchant/payments" : "/pay/merchant/terminals"}>{data.terminals.length ? "ساخت لینک پرداخت" : "راه‌اندازی پایانه"}<Icon name="arrow" size={16} /></Link></div>}
        {trend.length > 0 && <details className={o.trendDetails}><summary>مشاهدهٔ داده‌های روزانه<Icon name="chart" size={16} /></summary><div className={s.tableWrap}><table className={s.table}><caption className={o.tableCaption}>دریافت‌های روزانه به ریال</caption><thead><tr><th scope="col">تاریخ</th><th scope="col">مبلغ</th><th scope="col">تعداد</th></tr></thead><tbody>{trend.map(x => <tr key={x.date}><td>{day(x.date)}</td><td>{money(x.grossRial)}</td><td>{x.count.toLocaleString("fa-IR")}</td></tr>)}</tbody></table></div></details>}
      </section>
      <section className={`${s.card} ${o.settlements}`}>
        <div className={s.sectionHead}><div><h2>مسیر تسویه</h2><p className={o.caption}>درخواست، بررسی و پرداخت</p></div><Icon name="bank" size={20} /></div>
        {data.settlements.length ? <div className={o.settlementList}>{data.settlements.slice(0,4).map(x => <article key={x.id}><div className={s.row}><strong>{money(x.amountRial)}</strong><Badge value={x.status} /></div><small>{x.asset} · {x.network}</small><SettlementSteps status={x.status} /></article>)}</div> : <div className={o.settlementEmpty}><ol><li><span>۱</span>ثبت درخواست تسویه</li><li><span>۲</span>بررسی توسط مدیریت</li><li><span>۳</span>انتقال و ثبت پرداخت</li></ol><p>هنوز درخواست تسویه‌ای ثبت نشده است.</p></div>}
        <Link className={s.secondary} href="/pay/merchant/settlements">مشاهده و ثبت تسویه<Icon name="arrow" size={16} /></Link>
      </section>
    </div>
    <div className={o.readiness} aria-label="وضعیت پیکربندی دریافت"><span><Icon name="card" size={16} />دریافت پرداخت<Badge value={data.readiness.incomingEnabled ? "ACTIVE" : "SUSPENDED"} /></span><span><Icon name="bank" size={16} />صورت‌حساب بانکی<strong>{data.readiness.bankFeedReady ? "پیکربندی شده" : "پیکربندی نشده"}</strong></span></div>
  </div>;
}
