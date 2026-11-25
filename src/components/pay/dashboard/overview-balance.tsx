import type { PayOverview } from "@/modules/billing/domain/pay";
import Icon from "@/components/site/Icon";
import Link from "@/components/AppLink";
import { money } from "../client";
import o from "./Overview.module.css";

export function Amount({ value }: { value: string }) {
  return <span className={o.amount}><bdi dir="ltr">{money(value).replace(/ ریال$/, "")}</bdi><small>ریال</small></span>;
}

export default function BalanceCard({ data }: { data: PayOverview }) {
  const usdt = data.assetBalances?.find(x => x.currency === "USDT");
  const isUsdt = data.merchant?.creditCurrency === "USDT";
  return <div className={o.balance}>
    <div className={o.balanceHead}><span><Icon name="wallet" size={20} />موجودی قابل تسویه</span><bdi className={o.assetLabel}>{isUsdt ? "USDT" : "IRR"}</bdi></div>
    <div className={o.balanceBody}>
      <strong className={o.balanceValue}>{isUsdt ? <bdi dir="ltr">{usdt?.availableAmount ?? "—"}<small> USDT</small></bdi> : <Amount value={data.stats.availableRial} />}</strong>
      {isUsdt ? <><p className={o.balanceNote}>معادل نمایشی: {usdt?.equivalentRial != null ? money(usdt.equivalentRial) : "نرخ در دسترس نیست"}</p>{usdt?.rateAt && <p className={o.rateNote}>نرخ {new Date(usdt.rateAt).toLocaleString("fa-IR", { timeZone: "Asia/Tehran" })}{usdt.rateStatus === "STALE" && " · نرخ قدیمی"}</p>}</> : <p className={o.balanceNote}>موجودی ریالی آمادهٔ درخواست تسویه</p>}
    </div>
    <div className={o.balanceOther}><Icon name="layers" size={16} />{isUsdt ? <>موجودی ریالی جداگانه<Amount value={data.stats.availableRial} /></> : usdt ? <>موجودی تتری جداگانه<bdi dir="ltr">{usdt.availableAmount} USDT</bdi></> : <>اعتبار خالص؛ کارمزد پلتفرم جدا ثبت می‌شود</>}</div>
    <div className={o.balanceActions}><Link href="/pay/merchant/payments" className={o.createLink}><Icon name="plus" size={18} />ساخت لینک پرداخت</Link><Link href="/pay/merchant/settlements" className={o.balanceLink}>مدیریت تسویه‌ها<Icon name="arrow" size={18} /></Link></div>
  </div>;
}
