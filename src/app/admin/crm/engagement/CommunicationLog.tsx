'use client';

import Link from '@/components/AppLink';
import type { Notice } from './types';
function outcome(result: string, status: string) {
  if (status === 'FAILED') return 'ناموفق';
  if (status === 'RUNNING') return 'در حال پردازش';
  if (status === 'QUEUED') return 'در صف یا منتظر ساعت ارسال';
  try {
    const data = JSON.parse(result || '{}');
    return data.sent === true ? 'پذیرفته‌شده توسط سرویس' : data.skipped ? 'صرف‌نظر شده طبق تنظیمات یا شرایط کاربر' : data.sent === false ? 'ارسال نشده' : 'پردازش‌شده';
  } catch {
    return 'نتیجهٔ جزئی در دسترس نیست';
  }
}
export default function CommunicationLog({
  notices,
  total
}: {
  notices: Notice[];
  total: number;
}) {
  return <section className="ce-log" aria-labelledby="ce-log-title"><h2 id="ce-log-title">سابقهٔ ارتباط</h2><p className="muted">{total.toLocaleString('fa-IR')} ارتباط بازاریابی ثبت‌شده در۳۰ روز گذشته؛ حداکثر۴۰ اعلان نگه‌داشته‌شده نمایش داده می‌شود. نتیجهٔ سرویس به معنی خوانده‌شدن پیامک یا تبدیل به خرید نیست. رسید صف پس از هفت روز ممکن است دیگر در دسترس نباشد.</p>{!notices.length ? <div className="ce-empty"><h3>{total ? 'اعلان‌های قبلی دیگر نگه‌داری نمی‌شوند' : 'هنوز ارتباطی ثبت نشده'}</h3><p>{total ? 'تعداد ارتباط‌های ثبت‌شده حفظ شده است؛ جزئیات طبق سیاست نگهداری اعلان‌ها حذف شده‌اند.' : 'ساخت مسیر و پیش‌نمایش، برای کاربر پیامی ثبت نمی‌کند.'}</p></div> : <ol>{notices.map(notice => <li key={notice.id}><header><div><h3>{notice.titleFa}</h3><Link href={`/admin/crm/${notice.userId}`}>پروندهٔ مشتری #{notice.userId}</Link></div><time dateTime={notice.createdAt}>{new Date(notice.createdAt).toLocaleString('fa-IR', {
              timeZone: 'Asia/Tehran'
            })}</time></header><div className="ce-receipts"><span className="ce-pill">اعلان حساب {notice.readAt ? 'دیده‌شده' : 'خوانده‌نشده'}</span>{notice.deliveries.map(delivery => <span className="ce-pill" key={delivery.channel}>{{
              sms: 'پیامک',
              email: 'ایمیل',
              push: 'مرورگر'
            }[delivery.channel] || delivery.channel}: {outcome(delivery.result, delivery.status)}</span>)}</div>{!notice.deliveries.length && <p className="muted">کپی بیرونی انتخاب نشده یا رسید قدیمی دیگر نگه‌داری نمی‌شود.</p>}</li>)}</ol>}</section>;
}
