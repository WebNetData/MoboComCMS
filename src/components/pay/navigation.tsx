import Link from "@/components/AppLink";
import Icon from "@/components/site/Icon";
import s from "./Pay.module.css";
import { merchantGroups } from "./merchant-menu";

const merchant = merchantGroups.flatMap(group => group.items.map(item => [item.href.split('/')[3] || 'overview', item.label, item.icon]));
const admin = [
  ["overview", "نمای کلی", "layout"],
  ["operations", "پایش دریافت‌ها", "activity"],
  ["reconciliation", "میز مغایرت‌ها", "receipt"],
  ["webhooks", "وبهوک‌ها", "globe"],
  ["merchants", "پذیرندگان", "users"],
  ["settlements", "تسویه‌ها", "bank"],
  ["payments", "پرداخت‌ها", "receipt"],
  ["bank-events", "رویدادهای بانک", "activity"],
  ["receipts", "رسیدهای مشتریان", "image"],
  ["settings", "تنظیمات", "sliders"],
];

export default function PayNavigation({ area, current, canManage = true }: {
  area: "merchant" | "admin";
  current: string;
  canManage?: boolean;
}) {
  const base = area === "merchant" ? "/pay/merchant" : "/admin/mobocom-pay";
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
