'use client'
import { useEffect, useState } from 'react'

type State = {ready:boolean;activePanels:number;panelLinks:number;encryptedLinks:number;format:string;encryptionService:string;subscriptionSource:string;shopDomainUsed:boolean}
export default function HappSettings() {
  const [data,setData]=useState<State|null>(null)
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  async function load(){setBusy(true);setError('');try{const r=await fetch('/api/admin/happ',{cache:'no-store'});if(!r.ok)throw Error();setData(await r.json())}catch{setError('دریافت تنظیمات ممکن نشد. دوباره تلاش کنید.')}finally{setBusy(false)}}
  useEffect(()=>{void load()},[])
  return <div dir="rtl"><div className="appbar"><div><span className="section-kicker">HAPP / CONNECTION CENTER</span><h1 className="h2">اتصال و حریم خصوصی</h1><p className="muted">کنترل لینک‌هایی که مستقیماً از VPN Panel در سایت، مینی‌اپ و ربات تحویل داده می‌شوند.</p></div><button className="btn btn-ghost" disabled={busy} onClick={load}>{busy?'در حال بررسی…':'بررسی وضعیت'}</button></div>
    {error&&<p role="alert" className="error-text">{error}</p>}
    <div className="happ-admin-overview"><div className="card happ-admin-feature"><span className="happ-app-mark">H</span><span className="section-kicker">PANEL DIRECT</span><h2>لینک پنل، فقط به‌صورت رمزگذاری‌شده.<br/>بدون دامنه واسط سایت.</h2><p className="muted">لینک خام HTTPS از VPN Panel خوانده می‌شود، اما در سطح کاربر فقط نسخه happ://crypt5 نمایش داده و کپی می‌شود. دامنه سایت یا لینک خام پنل تحویل کاربر نمی‌شود.</p><span className="badge badge-green" dir="ltr">VPN PANEL → CRYPT5 → HAPP</span></div>
    <div className="card"><h2 className="font-bold mb-4">وضعیت راه‌اندازی</h2><dl className="happ-settings-rows"><div><dt>منبع لینک خام</dt><dd dir="ltr">{data?.subscriptionSource||'—'}</dd></div><div><dt>پنل‌های فعال</dt><dd>{data?.activePanels??'—'}</dd></div><div><dt>اشتراک‌های دارای لینک پنل</dt><dd>{data?.panelLinks??'—'}</dd></div><div><dt>استفاده از دامنه سایت برای ساب</dt><dd className="success-text">خیر</dd></div><div><dt>لینک‌های crypt5 ذخیره‌شده</dt><dd>{data?.encryptedLinks??'—'}</dd></div><div><dt>سرویس رمزگذاری</dt><dd dir="ltr">crypto.happ.su</dd></div></dl></div></div>
    <div className="card mt-6"><h2 className="font-bold mb-4">مسیر تحویل اشتراک</h2><div className="happ-admin-steps"><article><span>01</span><h3>VPN Panel</h3><p>بعد از ساخت یا Sync کاربر، URL اشتراک از خود پنل خوانده و در Subscription ذخیره می‌شود.</p></article><article><span>02</span><h3>رمزگذاری crypt5</h3><p>URL پنل سمت سرور با سرویس Happ رمزگذاری و cache می‌شود؛ لینک خام در پاسخ‌های کاربری قرار نمی‌گیرد.</p></article><article><span>03</span><h3>تحویل به کاربر</h3><p>سایت، مینی‌اپ، API و ربات فقط happ://crypt5 را نمایش می‌دهند؛ همان لینک برای کپی، QR و Open in Happ استفاده می‌شود.</p></article></div></div>
    <p className="muted text-sm mt-4">برای جلوگیری از افشای توکن اشتراک روی HTTP، لینک پنل باید عمومی و HTTPS باشد.</p><a href="https://www.happ.su/main/dev-docs/crypto-link" target="_blank" rel="noreferrer" className="text-link mt-3">مستندات رسمی Happ ↗</a>
  </div>
}
