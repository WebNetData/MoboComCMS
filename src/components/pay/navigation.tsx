import Link from "@/components/AppLink";
import Icon from "@/components/site/Icon";
import s from "./Pay.module.css";

const merchant = [
  ["overview", "نمای کلی", "layout"],
  ["payments", "پرداخت‌ها", "receipt"],
  ["settlements", "تسویه‌ها", "bank"],
  ["terminals", "پایانه‌ها", "terminal"],
  ["reports", "گزارش‌ها", "chart"],
  ["api", "اتصال API", "code"],
];
const admin = [
  ["overview", "نمای کلی", "layout"],
  ["merchants", "پذیرندگان", "users"],
  ["settlements", "تسویه‌ها", "bank"],
  ["payments", "پرداخت‌ها", "receipt"],
  ["bank-events", "رویدادهای بانک", "activity"],
  ["settings", "تنظیمات", "sliders"],
];

export default function PayNavigation({ area, current, canManage = true }: {
  area: "merchant" | "admin";
  current: string;
  canManage?: boolean;
}) {
  const base = area === "merchant" ? "/dashboard/pay" : "/admin/mobocom-pay";
  const links = area === "merchant" ? merchant : admin;
  return (
    <nav className={s.payNav} aria-label={area === "merchant" ? "بخش‌های درگاه پرداخت" : "بخش‌های مدیریت درگاه پرداخت"}>
      {links.filter(([id]) => area === "merchant" || canManage || id === "overview" || id === "settlements").map(([id, label, icon]) => (
        <Link key={id} href={id === "overview" ? base : `${base}/${id}`} aria-current={id === current ? "page" : undefined}>
          <Icon name={icon} size={18} /><span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
