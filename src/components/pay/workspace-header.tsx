import type { ReactNode } from "react";
import Icon from "@/components/site/Icon";
import s from "./WorkspaceHeader.module.css";

const merchant: Record<string, [string, string]> = {
  webhooks: ["وبهوک‌های پذیرنده", "اتصال امن سرویس شما و پیگیری تحویل رویدادهای پرداخت"],
  overview: ["درگاه پرداخت", "وضعیت دریافت‌ها، موجودی قابل تسویه و مسیر انتقال وجه"],
  payments: ["پرداخت‌ها", "ایجاد لینک پرداخت و پیگیری مبلغ، کارمزد و وضعیت هر دریافت"],
  settlements: ["تسویه‌ها", "برآورد مبلغ نهایی، ثبت درخواست و پیگیری مراحل تسویه"],
  terminals: ["پایانه‌ها", "مدیریت درگاه وب‌سایت، پیج، کانال و لینک‌های پرداخت مستقل"],
  operations: ["عملیات ربات", "پیگیری وصول وجه، صف تأیید و نتیجهٔ ارتباط با ربات فروشنده"],
  reports: ["گزارش‌های مالی", "روند دریافت‌های تأییدشده و خروجی جزئیات پرداخت و تسویه"],
  api: ["اتصال و راهنمای API", "راه‌اندازی اولین دریافت، اتصال وب‌سایت و رفع خطای ربات"],
};
const merchantIcons: Record<string, string> = {
  overview: "layout", payments: "receipt", settlements: "bank", terminals: "terminal",
  operations: "activity", reports: "chart", api: "code", webhooks: "globe",
};
const admin: Record<string, [string, string]> = {
  reports: ["گزارش مالی درگاه", "وصول وجه، کارمزدها، اعتبار کیف پول و درخواست‌های تسویه"],
  webhooks: ["عملیات وبهوک پذیرندگان", "پایش ارسال رویدادها، توقف اتصال و بازبینی تلاش‌های تحویل"],
  operations: ["پایش دریافت‌های بانکی", "آمادگی منابع، زمان تأیید و ظرفیت مبلغ‌های یکتا"],
  reconciliation: ["میز مغایرت‌های پرداخت", "بررسی مدرک بانکی، رسید و سابقهٔ تصمیم‌های مالی"],
  overview: ["مدیریت درگاه پرداخت", "نمای عملیات و دسترسی به بررسی پذیرندگان و تسویه‌ها"],
  merchants: ["پذیرندگان", "بررسی درخواست همکاری و مدیریت وضعیت کسب‌وکارها"],
  settlements: ["بررسی تسویه‌ها", "بررسی درخواست، تأیید و ثبت شناسه انتقال انجام‌شده"],
  payments: ["پرداخت‌های درگاه", "پیگیری وضعیت دریافت‌ها و جزئیات مبالغ هر پرداخت"],
  "bank-events": ["رویدادهای بانک", "بررسی شواهد واریز و وضعیت تطبیق با پرداخت‌ها"],
  receipts: ["رسیدهای مشتریان", "بررسی وصول وجه و رسیدهای پرداخت مشتریان پذیرندگان"],
  settings: ["تنظیمات درگاه", "مدیریت دریافت وجه، کارمزدها و مسیرهای تسویه"],
};

const adminIcons: Record<string, string> = {
  overview: "bank", merchants: "users", settlements: "wallet", payments: "card",
  "bank-events": "bank", receipts: "receipt", operations: "activity", reconciliation: "sliders",
  reports: "chart", settings: "sliders", webhooks: "globe",
};

export default function WorkspaceHeader({ area, view, identity, children }: {
  area: "merchant" | "admin";
  view: string;
  identity?: string;
  children?: ReactNode;
}) {
  const sections = area === "merchant" ? merchant : admin;
  const [title, description] = sections[view] || sections.overview;
  return <header className={`${s.heading} ${area === "merchant" ? s.merchant : s.admin}`} data-view={view}>
    <div className={s.identity}>
      <span className={s.viewIcon}><Icon name={(area === "merchant" ? merchantIcons : adminIcons)[view] || "layout"} size={24} /></span>
      <div>
        {(area === "admin" || identity) && <div className={s.context}>{area === "admin" && <>مدیریت مالی<span aria-hidden="true" /></>}<bdi>{identity || "MoboCom Pay"}</bdi></div>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
    </div>
    <div className={s.actions}>{children}</div>
  </header>;
}
