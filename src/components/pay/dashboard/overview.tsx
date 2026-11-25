"use client";
import type { PayOverview } from "@/modules/billing/domain/pay";
import Icon from "@/components/site/Icon";
import Link from "@/components/AppLink";
import { Badge } from "../shared";
import { money } from "../client";
import { SettlementSteps } from "./tables";
import BalanceCard, { Amount } from "./overview-balance";
import ReceiptTrend from "./overview-trend";
import RecentPayments from "./overview-payments";
import s from "../Pay.module.css";
import o from "./Overview.module.css";

export default function Overview({ data, reports = false }: { data: PayOverview; reports?: boolean }) {
  return <div className={o.overview}>
    <section className={o.summary} aria-label="خلاصه مالی">
      <BalanceCard data={data} />
      <dl className={o.ledger}>
        {[
          ["در انتظار تسویه", data.stats.pendingSettlementRial, "درخواست‌های در حال بررسی", "clock"],
          ["دریافتی سفارش‌ها", data.stats.grossRial, "مجموع سفارش‌های تأییدشده", "receipt"],
          ["اعتبار خالص پرداخت‌ها", data.stats.creditedRial ?? data.stats.netRial, "بدون کارمزد و هزینهٔ گرد کردن", "wallet"],
          ["کارمزدهای پلتفرم", data.stats.platformFeeRial ?? data.stats.feeRial, "سهم پلتفرم؛ خارج از اعتبار شما", "bank"],
        ].map(([label, value, hint, icon]) => <div key={label}><dt><Icon name={icon} size={18} />{label}</dt><dd><Amount value={value} /><small>{hint}</small></dd></div>)}
      </dl>
    </section>
    <div className={o.walletNote}><Icon name="shield" size={18} /><p>دریافت‌های تأییدشده به کیف پول موبوکام افزوده می‌شوند. مبلغ درخواست تسویه تا تعیین تکلیف قابل خرج کردن نیست. <Link href="/dashboard/wallet">مشاهده کیف پول</Link></p></div>
    {reports && <section className={`${s.card} ${s.reportExports}`}><div><h2>دریافت گزارش</h2><p className={s.muted}>خروجی هر صفحه تا ۱۰۰۰ ردیف دارد. برای فیلتر و صفحات دیگر به فهرست مربوط بروید.</p></div><div className={s.actions}><a className={s.secondary} href="/api/pay/payments?format=csv">گزارش پرداخت‌ها CSV</a><a className={s.secondary} href="/api/pay/settlements?format=csv">گزارش تسویه‌ها CSV</a></div></section>}
    <nav className={o.shortcuts} aria-label="دسترسی سریع پذیرنده">
      {[["payments", "receipt", "مدیریت پرداخت‌ها", "ساخت لینک و پیگیری دریافت"], ["terminals", "terminal", "مدیریت پایانه‌ها", "وب‌سایت، پیج، کانال و ربات"], ["reports", "chart", "گزارش‌های مالی", "روند دریافت و خروجی جزئیات"]].map(([path, icon, title, subtitle]) => <Link key={path} href={`/pay/merchant/${path}`}><span className={o.shortcutIcon}><Icon name={icon} size={20} /></span><span><strong>{title}</strong><small>{subtitle}</small></span><Icon name="arrow" size={16} /></Link>)}
    </nav>
    <div className={o.panels}>
      <ReceiptTrend trend={data.stats.trend} paidCount={data.stats.paidCount} hasTerminals={data.terminals.length > 0} />
      <section className={`${s.card} ${o.settlements}`}>
        <div className={o.sectionHead}><div><h2>مسیر تسویه</h2><p className={o.caption}>درخواست، بررسی و پرداخت</p></div><span className={o.sectionIcon}><Icon name="bank" size={20} /></span></div>
        {data.settlements.length ? <div className={o.settlementList}>{data.settlements.slice(0, 4).map(x => <article key={x.id}><div className={s.row}><strong>{money(x.amountRial)}</strong><Badge value={x.status} /></div><small>{x.asset} · {x.network}</small><SettlementSteps status={x.status} /></article>)}</div> : <div className={o.settlementEmpty}><ol><li><span>۱</span><div><strong>ثبت درخواست</strong><small>انتخاب مبلغ و مسیر تسویه</small></div></li><li><span>۲</span><div><strong>بررسی مدیریت</strong><small>کنترل مبلغ و اطلاعات مقصد</small></div></li><li><span>۳</span><div><strong>پرداخت و ثبت انتقال</strong><small>نمایش نتیجه و شناسهٔ پیگیری</small></div></li></ol><p>هنوز درخواست تسویه‌ای ثبت نشده است.</p></div>}
        <Link className={s.secondary} href="/pay/merchant/settlements">مشاهده و ثبت تسویه<Icon name="arrow" size={16} /></Link>
      </section>
    </div>
    {!reports && <RecentPayments items={data.payments} />}
    <div className={o.readiness} aria-label="وضعیت پیکربندی دریافت"><span><Icon name="card" size={16} />دریافت پرداخت<Badge value={data.readiness.incomingEnabled ? "ACTIVE" : "SUSPENDED"} /></span><span><Icon name="bank" size={16} />صورت‌حساب بانکی<strong>{data.readiness.bankFeedReady ? "پیکربندی شده" : "پیکربندی نشده"}</strong></span></div>
  </div>;
}
