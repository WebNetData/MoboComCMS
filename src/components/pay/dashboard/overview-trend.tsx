"use client";
import { useState } from "react";
import type { PayOverview } from "@/modules/billing/domain/pay";
import Icon from "@/components/site/Icon";
import Link from "@/components/AppLink";
import { money } from "../client";
import s from "../Pay.module.css";
import o from "./Overview.module.css";

const day = (value: string) => new Date(value + "T12:00:00Z").toLocaleDateString("fa-IR", { month: "short", day: "numeric", timeZone: "Asia/Tehran" });
type Props = { trend: PayOverview["stats"]["trend"]; paidCount: number; hasTerminals: boolean };

export default function ReceiptTrend({ trend, paidCount, hasTerminals }: Props) {
  const [selectedDate, setSelectedDate] = useState("");
  const max = trend.reduce((m, x) => BigInt(x.grossRial) > m ? BigInt(x.grossRial) : m, 0n);
  const selected = trend.find(x => x.date === selectedDate) ?? trend[trend.length - 1];
  const points = trend.map((x, i) => ({ date: x.date, x: trend.length === 1 ? 280 : i * 560 / (trend.length - 1), y: 164 - (max > 0n ? Number(BigInt(x.grossRial) * 14800n / max) / 100 : 0) }));
  const selectedPoint = points.find(x => x.date === selected?.date);
  const line = points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  return <section className={`${s.card} ${o.trend}`} aria-labelledby="merchant-trend-title">
    <div className={o.sectionHead}><div><h2 id="merchant-trend-title">روند دریافت</h2><p className={o.caption}>ناخالص پرداخت‌های تأییدشده در بازهٔ نمودار</p></div><span className={o.count}><strong>{paidCount.toLocaleString("fa-IR")}</strong> پرداخت موفق</span></div>
    {max > 0n && selected ? <>
      <div className={o.chartToolbar}><div className={o.chartStatistic}><span>{day(selected.date)}</span><strong>{money(selected.grossRial)}</strong><small>{selected.count.toLocaleString("fa-IR")} پرداخت موفق در این روز</small></div><label className={o.dayPicker}><span>بررسی روز</span><select value={selected.date} onChange={e => setSelectedDate(e.target.value)}>{trend.map(x => <option key={x.date} value={x.date}>{day(x.date)}</option>)}</select></label></div>
      <div className={o.chart} aria-hidden="true"><div className={o.guides}><span /><span /><span /></div><svg className={o.plot} viewBox="-8 0 576 180" preserveAspectRatio="none"><polygon points={`0,180 ${line} 560,180`} className={o.area} /><polyline points={line} className={o.line} />{selectedPoint && <><circle cx={selectedPoint.x} cy={selectedPoint.y} r="8" className={o.pointHalo} /><circle cx={selectedPoint.x} cy={selectedPoint.y} r="3" className={o.point} /></>}</svg></div>
      <div className={o.axis} dir="ltr"><span>{day(trend[0].date)}</span><span>{day(trend[trend.length - 1].date)}</span></div>
    </> : <div className={o.empty}><span className={o.emptyIcon}><Icon name="chart" size={28} /></span><strong>نخستین دریافت، شروع این نمودار است</strong><p>پس از تأیید پرداخت، مبلغ و روند روزانهٔ آن را اینجا می‌بینید.</p><Link href={hasTerminals ? "/pay/merchant/payments" : "/pay/merchant/terminals"}>{hasTerminals ? "ساخت لینک پرداخت" : "راه‌اندازی پایانه"}<Icon name="arrow" size={16} /></Link></div>}
    {trend.length > 0 && <details className={o.trendDetails}><summary>مشاهدهٔ داده‌های روزانه<Icon name="chart" size={16} /></summary><div className={s.tableWrap}><table className={s.table}><caption className={o.tableCaption}>دریافت‌های روزانه به ریال</caption><thead><tr><th scope="col">تاریخ</th><th scope="col">مبلغ</th><th scope="col">تعداد</th></tr></thead><tbody>{trend.map(x => <tr key={x.date}><td>{day(x.date)}</td><td>{money(x.grossRial)}</td><td>{x.count.toLocaleString("fa-IR")}</td></tr>)}</tbody></table></div></details>}
  </section>;
}
