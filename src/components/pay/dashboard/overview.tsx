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
import OverviewNextAction from "./overview-next-action";
import s from "../Pay.module.css";
import o from "./Overview.module.css";

export default function Overview({ data }: { data: PayOverview }) {
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
    {data.merchant?.status === "ACTIVE" && <OverviewNextAction data={data} />}
    <div className={o.walletNote}><Icon name="shield" size={18} /><p>دریافت‌های تأییدشده به کیف پول موبوکام افزوده می‌شوند. مبلغ درخواست تسویه تا تعیین تکلیف قابل خرج کردن نیست. <Link href="/dashboard/wallet">مشاهده کیف پول</Link></p></div>
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
    <RecentPayments items={data.payments} />
  </div>;
}
