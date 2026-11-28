import Link from "@/components/AppLink";
import Icon from "@/components/site/Icon";
import type { PayOverview } from "@/modules/billing/domain/pay";
import styles from "../WorkspaceContent.module.css";

export default function OverviewNextAction({ data }: { data: PayOverview }) {
  const activeTerminals = data.terminals.filter(terminal => terminal.active).length;
  const canReceive = data.readiness.incomingEnabled && activeTerminals > 0;
  return (
    <section className={`${styles.workspace} ${styles.panel} ${styles.merchantActions}`} aria-labelledby="pay-merchant-actions">
      <div className={styles.sectionHead}><div>
        <h2 id="pay-merchant-actions">دریافت و راه‌اندازی</h2>
        <p>{canReceive ? "برای سفارش تازه لینک بسازید یا راهنمای اتصال را باز کنید." : "وضعیت دریافت و پایانه را پیش از ساخت لینک بررسی کنید."}</p>
      </div></div>
      <dl className={styles.statusList}>
        <div><dt>دریافت درگاه</dt><dd>{data.readiness.incomingEnabled ? "فعال" : "غیرفعال"}</dd></div>
        <div><dt>پایانهٔ فعال</dt><dd>{activeTerminals.toLocaleString("fa-IR")}</dd></div>
        <div><dt>صورت‌حساب بانکی</dt><dd>{data.readiness.bankFeedReady ? "پیکربندی شده" : "پیکربندی نشده"}</dd></div>
      </dl>
      <div className={styles.guideIndex}>
        {activeTerminals === 0 && <Link className={styles.guideLink} href="/pay/merchant/terminals"><Icon name="terminal" size={18} />راه‌اندازی پایانه</Link>}
        <Link className={styles.guideLink} href="/pay/merchant/api"><Icon name="book" size={18} />راهنمای دریافت و اتصال</Link>
      </div>
    </section>
  );
}
