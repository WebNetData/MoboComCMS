import type { PayPaymentView } from "@/modules/billing/domain/pay";
import Icon from "@/components/site/Icon";
import Link from "@/components/AppLink";
import { money, date } from "../client";
import { Badge } from "../shared";
import s from "../Pay.module.css";
import o from "./Overview.module.css";

export default function RecentPayments({ items }: { items: PayPaymentView[] }) {
  return <section className={`${s.card} ${o.recent}`} aria-labelledby="merchant-recent-title"><div className={o.sectionHead}><div><h2 id="merchant-recent-title">آخرین پرداخت‌ها</h2><p className={o.caption}>سفارش، مبلغ و نتیجهٔ دریافت در یک نگاه</p></div><Link href="/pay/merchant/payments" className={o.textLink}>همهٔ پرداخت‌ها<Icon name="arrow" size={16} /></Link></div>
    {items.length ? <ul className={o.recentList}>{items.slice(0, 5).map(x => <li key={x.id}><span className={o.paymentIcon}><Icon name="receipt" size={20} /></span><div className={o.paymentIdentity}><strong><bdi>{x.externalId}</bdi></strong><small>{x.terminalName} · {date(x.createdAt)}</small></div><div className={o.paymentAmount}><strong>{money(x.customerAmountRial ?? x.totalRial)}</strong><small>{x.status === "PAID" ? "اعتبار خالص" : "برآورد اعتبار"}: {x.creditCurrency === "USDT" ? <bdi dir="ltr">{x.creditAmount} USDT</bdi> : money(x.creditRial ?? x.netRial)}</small></div><Badge value={x.status} /></li>)}</ul> : <div className={o.recentEmpty}><Icon name="receipt" size={24} /><p>هنوز پرداختی ثبت نشده است</p><Link href="/pay/merchant/payments" className={o.textLink}>ساخت نخستین لینک پرداخت<Icon name="arrow" size={16} /></Link></div>}
  </section>;
}
