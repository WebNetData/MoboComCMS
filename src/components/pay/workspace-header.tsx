import type { ReactNode } from "react";
import Icon from "@/components/site/Icon";
import s from "./Pay.module.css";

const merchant: Record<string, [string, string]> = {
  overview: ["درگاه پرداخت", "وضعیت دریافت‌ها، موجودی قابل تسویه و مسیر انتقال وجه"],
  payments: ["پرداخت‌ها", "ایجاد لینک پرداخت و پیگیری مبلغ، کارمزد و وضعیت هر دریافت"],
  settlements: ["تسویه‌ها", "برآورد مبلغ نهایی، ثبت درخواست و پیگیری مراحل تسویه"],
  terminals: ["پایانه‌ها", "مدیریت اتصال فروشگاه‌ها و ربات‌های شما به درگاه پرداخت"],
  reports: ["گزارش‌های مالی", "روند دریافت‌های تأییدشده و خروجی جزئیات پرداخت و تسویه"],
  api: ["اتصال و راهنمای API", "راهنمای اتصال، ساخت پرداخت و استعلام امن نتیجه"],
};
const admin: Record<string, [string, string]> = {
  overview: ["مدیریت درگاه پرداخت", "نمای عملیات و دسترسی به بررسی پذیرندگان و تسویه‌ها"],
  merchants: ["پذیرندگان", "بررسی درخواست همکاری و مدیریت وضعیت کسب‌وکارها"],
  settlements: ["بررسی تسویه‌ها", "بررسی درخواست، تأیید و ثبت شناسه انتقال انجام‌شده"],
  payments: ["پرداخت‌های درگاه", "پیگیری وضعیت دریافت‌ها و جزئیات مبالغ هر پرداخت"],
  "bank-events": ["رویدادهای بانک", "بررسی شواهد واریز و وضعیت تطبیق با پرداخت‌ها"],
  receipts: ["رسیدهای مشتریان", "بررسی وصول وجه و رسیدهای پرداخت مشتریان پذیرندگان"],
  settings: ["تنظیمات درگاه", "مدیریت دریافت وجه، کارمزدها و مسیرهای تسویه"],
};

export default function WorkspaceHeader({ area, view, children }: {
  area: "merchant" | "admin";
  view: string;
  children?: ReactNode;
}) {
  const sections = area === "merchant" ? merchant : admin;
  const [title, description] = sections[view] || sections.overview;
  return <header className={`${s.head} ${s.workspaceHead}`}>
    <div className={s.workspaceIdentity}>
      <span className={s.workspaceMark}><Icon name="card" size={24} /></span>
      <div>
        <span className={s.eyebrow}>درگاه پرداخت <span aria-hidden="true"> / </span><bdi>MoboCom Pay</bdi></span>
        <h1>{title}</h1>
        <p className={s.muted}>{description}</p>
      </div>
    </div>
    <div className={s.actions}>{children}</div>
  </header>;
}
