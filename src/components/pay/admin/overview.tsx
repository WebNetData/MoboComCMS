import Link from "@/components/AppLink";
import Icon from "@/components/site/Icon";
import type { PayAdminOverview } from "@/modules/billing/domain/pay";
import styles from "../WorkspaceContent.module.css";

const root = "/admin/mobocom-pay";
const tools = [
  { path: "merchants", icon: "users", title: "پذیرندگان و پایانه‌ها", hint: "دسترسی، کارمزد و کلیدهای پایانه" },
  { path: "payments", icon: "card", title: "پرداخت‌های درگاه", hint: "وضعیت، مبالغ و رسید هر پرداخت" },
  { path: "?view=reports", icon: "chart", title: "گزارش مالی درگاه", hint: "وصول، کارمزد، اعتبار و تسویه در بازهٔ دلخواه" },
  { path: "reconciliation", icon: "sliders", title: "میز مغایرت", hint: "تطبیق مدرک بانکی و ثبت تصمیم مالی" },
  { path: "operations", icon: "chart", title: "پایش بانکی", hint: "آمادگی منابع و ظرفیت مبلغ‌های یکتا" },
  { path: "bank-events", icon: "bank", title: "رویدادهای بانک", hint: "مدرک واریز و وضعیت تطبیق" },
  { path: "webhooks", icon: "terminal", title: "عملیات وبهوک", hint: "وضعیت ارسال رویداد به پذیرندگان" },
  { path: "settings", icon: "sliders", title: "تنظیمات درگاه", hint: "سیاست دریافت، کارمزد و مسیر تسویه" },
] as const;

export default function AdminOverview({ data }: { data: PayAdminOverview }) {
  const { workQueue, permissions, settings } = data;
  const queue = [
    { href: "settlements", label: "درخواست تسویه", count: workQueue.requestedSettlements, icon: "wallet" },
    { href: "settlements", label: "تسویه آمادهٔ انتقال", count: workQueue.approvedSettlements, icon: "bank" },
    ...(permissions.manage ? [
      { href: "receipts", label: "رسید در انتظار بررسی", count: workQueue.pendingReceipts, icon: "receipt" },
      { href: "merchants", label: "پذیرنده در انتظار بررسی", count: workQueue.pendingMerchants, icon: "users" },
    ] : []),
  ];
  return (
    <div className={styles.workspace}>
      <section className={styles.panel} aria-labelledby="pay-queue-title">
        <div className={styles.sectionHead}>
          <div><h2 id="pay-queue-title">صف عملیات درگاه</h2><p>درخواست‌ها را از مرحلهٔ بررسی تا ثبت نتیجه پیگیری کنید.</p></div>
          {permissions.manage && <Link className={styles.guideLink} href={root + "/settings#pay-admin-guide"}><Icon name="book" size={18} /> راهنمای مدیریت</Link>}
        </div>
        <ul className={styles.queue}>
          {queue.map(item => <li key={item.label} data-needs-action={item.count > 0 || undefined}>
            <Link href={root + "/" + item.href}>
              <span className={styles.tileIcon}><Icon name={item.icon} size={19} /></span>
              <span className={styles.queueMetric}><strong>{item.count.toLocaleString("fa-IR")}</strong><span>{item.label}</span></span>
              <Icon name="arrow" size={16} />
            </Link>
          </li>)}
        </ul>
      </section>
      {permissions.manage && <div className={styles.adminColumns}>
        <section className={styles.panel} aria-labelledby="pay-tools-title">
          <div className={styles.sectionHead}><div><h2 id="pay-tools-title">ابزارهای مدیریت</h2><p>از هر ابزار مستقیماً به بخش عملیاتی آن بروید.</p></div></div>
          <ul className={styles.linkGrid}>
            {tools.map(tool => <li key={tool.path}><Link href={root + (tool.path.startsWith("?") ? "" : "/") + tool.path}>
              <span className={styles.tileIcon}><Icon name={tool.icon} size={18} /></span>
              <span><strong>{tool.title}</strong><small>{tool.hint}</small></span>
              <Icon name="arrow" size={15} />
            </Link></li>)}
          </ul>
        </section>
        <section className={styles.panel} aria-labelledby="pay-config-title">
          <div className={styles.sectionHead}><div><h2 id="pay-config-title">وضعیت پیکربندی</h2><p>آمادگی تنظیمات دریافت و تسویه</p></div></div>
          <dl className={styles.statusList}>
            <div><dt>دریافت درگاه</dt><dd>{settings.incomingEnabled ? "فعال" : "غیرفعال"}</dd></div>
            <div><dt>تطبیق پیامک بانکی</dt><dd>{settings.bale.enabled ? "فعال" : "غیرفعال"}</dd></div>
            <div><dt>صورت‌حساب بانکی</dt><dd>{data.readiness.bankFeedReady ? "پیکربندی شده" : "پیکربندی نشده"}</dd></div>
            <div><dt>مسیرهای تسویهٔ فعال</dt><dd>{settings.rails.filter(rail => rail.enabled).length.toLocaleString("fa-IR")}</dd></div>
          </dl>
          <Link className={styles.guideLink} href={root + "/operations"}>مشاهدهٔ وضعیت منابع <Icon name="arrow" size={16} /></Link>
        </section>
      </div>}
    </div>
  );
}
