'use client'
import { useEffect, useState } from 'react'
import { useI18n } from '@/i18n/LocaleProvider'
export default function TelegramLink(){
  const { locale } = useI18n()
  const L = (en: string, fa: string) => locale === 'fa' ? fa : en
  const [data,setData]=useState<any>(null)
  const [error,setError]=useState('')
  async function load(){try{const r=await fetch('/api/telegram/link');if(!r.ok)throw Error();setData(await r.json());setError('')}catch{setError(L('Could not load Telegram connection status.','دریافت وضعیت اتصال ممکن نشد.'))}}
  useEffect(()=>{void load()},[locale])
  async function unlink(){if(!confirm(L('Disconnect your Telegram account?','اتصال حساب تلگرام قطع شود؟')))return;const r=await fetch('/api/telegram/link',{method:'DELETE'});if(r.ok)await load();else{const body=await r.json().catch(()=>null);setError(body?.error||L('Could not disconnect Telegram.','قطع اتصال انجام نشد.'))}}
  return <section className="card mb-4"><h2 className="font-bold mb-2">{L('Telegram account','حساب تلگرام')}</h2><p className="muted mb-3">{L('Link Telegram to use the same account and wallet on the website and Mini App. Previous Mini App purchases will be merged into this account.','با اتصال تلگرام، سایت و مینی‌اپ از یک حساب و کیف پول استفاده می‌کنند. اگر قبلاً از مینی‌اپ خرید داشته‌اید، اطلاعات همان حساب با این حساب ادغام می‌شود.')}</p>{data?.linked?<div className="flex gap-2 items-center"><span>{data.displayName} · @{data.username || data.telegramId}</span><button className="btn btn-ghost btn-sm" onClick={unlink}>{L('Disconnect','قطع اتصال')}</button></div>:data?.enabled&&data.deepLink?<a className="btn btn-primary" href={data.deepLink} target="_blank" rel="noreferrer">{L('Connect securely to Telegram ↗','اتصال امن به تلگرام ↗')}</a>:<p className="muted">{L('The bot has not been enabled by an administrator yet.','ربات هنوز توسط مدیر فعال نشده است.')}</p>}<button className="btn btn-ghost btn-sm" onClick={load}>{L('Check connection again','بررسی مجدد اتصال')}</button>{error&&<p role="alert">{error}</p>}</section>
}
